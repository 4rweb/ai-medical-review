import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import OpenAI from 'openai'
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
  ChatCompletionTool
} from 'openai/resources/chat/completions'
import { z } from 'zod'
import {
  QwenInvalidResponseError,
  QwenQuotaError,
  QwenUnavailableError
} from './qwen.errors'
import type { QwenTool, QwenToolExecution } from './qwen.types'

type GenerateJsonParams = {
  model: string
  schemaName: string
  schema: z.ZodType
  system: string
  prompt: string
}

type GenerateJsonWithToolsParams = GenerateJsonParams & {
  tools: QwenTool[]
  maxToolRounds?: number
  maxToolCalls?: number
  requireToolCall?: boolean
}

@Injectable()
export class QwenService {
  private readonly logger = new Logger(QwenService.name)
  private client: OpenAI | null = null

  constructor(private readonly config: ConfigService) {}

  private getClient(): OpenAI {
    const apiKey =
      this.config.get<string>('DASHSCOPE_API_KEY') ||
      this.config.get<string>('DASHSCOPE_API_KEY_V2') ||
      this.config.get<string>('DASHSCOPE_API_KEY_V1')

    if (!apiKey || apiKey === 'MY_DASHSCOPE_API_KEY') {
      throw new QwenUnavailableError('DASHSCOPE_API_KEY não configurada.')
    }

    if (!this.client) {
      this.client = new OpenAI({
        apiKey,
        baseURL:
          this.config.get<string>('DASHSCOPE_API_URL') ||
          'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
        timeout: 45_000,
        maxRetries: 0
      })
    }

    return this.client
  }

  /**
   * Transcrição de áudio (ASR) via Qwen3-ASR-Flash na DashScope (OpenAI-compatible).
   *
   * O ASR dedicado aceita SOMENTE a parte `input_audio` (sem system prompt, sem
   * texto, sem campo `format`) + `asr_options` no corpo. O áudio vai como data
   * URI base64. Modelo/idioma configuráveis por QWEN_ASR_MODEL / QWEN_ASR_LANGUAGE.
   * Ref.: https://www.alibabacloud.com/help/en/model-studio/qwen-asr-api-reference
   */
  async transcribeAudio(params: {
    audioBase64: string
    formato: string
  }): Promise<{ texto: string; model: string }> {
    const client = this.getClient()
    const model =
      this.config.get<string>('QWEN_ASR_MODEL') || 'qwen3-asr-flash'
    const language = this.config.get<string>('QWEN_ASR_LANGUAGE') || 'pt'
    const dataUri = params.audioBase64.startsWith('data:')
      ? params.audioBase64
      : `data:audio/${params.formato};base64,${params.audioBase64}`
    try {
      const completion = await client.chat.completions.create({
        model,
        messages: [
          {
            role: 'user',
            content: [{ type: 'input_audio', input_audio: { data: dataUri } }]
          }
        ],
        // Parâmetros específicos do ASR dedicado da DashScope.
        asr_options: { language, enable_itn: true }
      } as unknown as ChatCompletionCreateParamsNonStreaming)
      const raw = completion.choices[0]?.message?.content
      const texto = typeof raw === 'string' ? raw.trim() : ''
      return { texto, model }
    } catch (error: unknown) {
      const status =
        typeof error === 'object' && error && 'status' in error
          ? Number(error.status)
          : undefined
      const message = error instanceof Error ? error.message : String(error)
      if (status === 429 || /quota|exceeded|insufficient/i.test(message)) {
        throw new QwenQuotaError()
      }
      this.logger.error('Falha na transcrição de áudio (Qwen).', error)
      throw new QwenUnavailableError()
    }
  }

  async generateJson<T>(params: GenerateJsonParams): Promise<T> {
    const result = await this.generateJsonWithTools<T>({
      ...params,
      tools: []
    })
    return result.data
  }

  async generateJsonWithTools<T>(
    params: GenerateJsonWithToolsParams
  ): Promise<{ data: T; toolExecutions: QwenToolExecution[] }> {
    const client = this.getClient()
    let lastError: unknown

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        this.logger.log(
          `[Qwen] ${params.model}, tentativa ${attempt}/2, schema ${params.schemaName}`
        )
        return await this.runToolLoop<T>(client, params, attempt)
      } catch (error: unknown) {
        if (error instanceof QwenInvalidResponseError) {
          lastError = error
          if (attempt < 2) continue
          throw error
        }
        if (error instanceof QwenUnavailableError) throw error

        const status =
          typeof error === 'object' && error && 'status' in error
            ? Number(error.status)
            : undefined
        const message = error instanceof Error ? error.message : String(error)

        if (status === 429 || /quota|exceeded|insufficient/i.test(message)) {
          throw new QwenQuotaError()
        }

        lastError = error
        if (attempt < 2 && (status === 408 || status === 503 || status === 504)) {
          await new Promise(resolve => setTimeout(resolve, 350))
          continue
        }
        break
      }
    }

    this.logger.error('Qwen indisponível após as tentativas.', lastError)
    throw new QwenUnavailableError()
  }

  private async runToolLoop<T>(
    client: OpenAI,
    params: GenerateJsonWithToolsParams,
    attempt: number
  ): Promise<{ data: T; toolExecutions: QwenToolExecution[] }> {
    const jsonSchema = z.toJSONSchema(params.schema)
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `${params.system}

Responda SOMENTE com um objeto JSON válido, sem markdown ou texto adicional.
O JSON deve seguir exatamente este JSON Schema:
${JSON.stringify(jsonSchema)}

Não retorne o próprio schema. Retorne somente os dados solicitados.
Não omita campos obrigatórios. Quando um array não tiver itens, retorne [].
Quando um campo opcional não se aplicar, omita o campo em vez de retornar null.
Use as ferramentas disponíveis para consultar fatos verificáveis; não invente resultados de ferramentas.`
      },
      {
        role: 'user',
        content:
          attempt === 1
            ? params.prompt
            : `${params.prompt}

ATENÇÃO: a resposta anterior não correspondeu ao JSON Schema ou ao protocolo de ferramentas. Gere novamente o objeto completo.`
      }
    ]
    const tools = this.toApiTools(params.tools)
    const executions: QwenToolExecution[] = []
    const maxToolRounds = params.maxToolRounds ?? 4
    const maxToolCalls = params.maxToolCalls ?? 8
    let toolRounds = 0

    while (true) {
      const mustCallTool =
        params.requireToolCall === true && executions.length === 0
      const completion = await client.chat.completions.create({
        model: params.model,
        response_format: { type: 'json_object' },
        messages,
        ...(tools.length > 0
          ? {
              tools,
              tool_choice: mustCallTool
                ? ('required' as const)
                : ('auto' as const)
            }
          : {}),
        ...(params.requireToolCall ? { enable_thinking: false } : {}),
        temperature: 0.1
      } as unknown as ChatCompletionCreateParamsNonStreaming)
      const assistant = completion.choices[0]?.message
      if (!assistant) {
        throw new QwenInvalidResponseError('Resposta vazia da Qwen.')
      }

      const toolCalls = assistant.tool_calls ?? []
      if (toolCalls.length > 0) {
        if (toolRounds >= maxToolRounds) {
          throw new QwenInvalidResponseError(
            'Limite de rodadas de ferramentas excedido.'
          )
        }
        toolRounds++
        messages.push({
          role: 'assistant',
          content: assistant.content ?? '',
          tool_calls: toolCalls
        })

        for (const toolCall of toolCalls) {
          if (toolCall.type !== 'function') {
            throw new QwenInvalidResponseError(
              'Tipo de ferramenta não suportado.'
            )
          }
          if (executions.length >= maxToolCalls) {
            throw new QwenInvalidResponseError(
              'Limite de chamadas de ferramentas excedido.'
            )
          }

          const tool = params.tools.find(
            candidate => candidate.name === toolCall.function.name
          )
          if (!tool) {
            throw new QwenInvalidResponseError(
              `Ferramenta não permitida: ${toolCall.function.name}.`
            )
          }

          let rawArguments: unknown
          try {
            rawArguments = JSON.parse(toolCall.function.arguments)
          } catch {
            throw new QwenInvalidResponseError(
              `Argumentos JSON inválidos para ${tool.name}.`
            )
          }

          const validated = tool.inputSchema.safeParse(rawArguments)
          if (!validated.success) {
            throw new QwenInvalidResponseError(
              `Argumentos inválidos para ${tool.name}.`
            )
          }

          const result = await tool.execute(validated.data)
          executions.push({
            name: tool.name,
            arguments: validated.data,
            result
          })
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result ?? null)
          })
        }

        this.logger.log(
          `[Qwen] rodada de tools ${toolRounds}/${maxToolRounds}; total=${executions.length}`
        )
        continue
      }

      const text = assistant.content
      if (!text) throw new QwenInvalidResponseError('Resposta vazia da Qwen.')
      if (params.requireToolCall && executions.length === 0) {
        throw new QwenInvalidResponseError(
          'A Qwen finalizou sem executar a ferramenta obrigatória.'
        )
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new QwenInvalidResponseError('JSON inválido retornado pela Qwen.')
      }

      const validated = params.schema.safeParse(parsed)
      if (!validated.success) {
        const topLevelKeys =
          parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? Object.keys(parsed)
            : []
        this.logger.warn(
          `[Qwen] Resposta incompatível com ${params.schemaName}. Campos recebidos: ${topLevelKeys.join(', ') || '(nenhum)'}.`
        )
        throw new QwenInvalidResponseError(
          'Resposta da Qwen incompatível com o contrato.'
        )
      }

      return {
        data: validated.data as T,
        toolExecutions: executions
      }
    }
  }

  private toApiTools(tools: QwenTool[]): ChatCompletionTool[] {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: z.toJSONSchema(tool.inputSchema)
      }
    }))
  }
}
