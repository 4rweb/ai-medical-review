import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import OpenAI from 'openai'

export class QuotaExceededError extends Error {
  constructor(message = 'QUOTA_EXCEEDED') {
    super(message)
    this.name = 'QuotaExceededError'
  }
}

/**
 * Cliente Qwen Cloud (DashScope) via SDK OpenAI-compatible.
 * Faz structured output em JSON e tem retry/fallback de modelo
 * para mitigar 503/throttling — espelha o antigo generateContentWithFallback.
 */
@Injectable()
export class QwenService {
  private readonly logger = new Logger(QwenService.name)
  private client: OpenAI | null = null
  private readonly models: string[]

  constructor(private readonly config: ConfigService) {
    const primary = this.config.get<string>('QWEN_MODEL') || 'qwen3.6-flash'
    const fallbacks = (this.config.get<string>('QWEN_MODEL_FALLBACKS') || '')
      .split(',')
      .map(m => m.trim())
      .filter(Boolean)
    // Modelo principal escolhido + fallbacks opcionais, sem duplicar.
    this.models = [...new Set([primary, ...fallbacks])]
  }

  /** Lazy init: evita derrubar o servidor se a chave estiver ausente. */
  private getClient(): OpenAI | null {
    const apiKey =
      this.config.get<string>('DASHSCOPE_API_KEY') ||
      this.config.get<string>('DASHSCOPE_API_KEY_V2') ||
      this.config.get<string>('DASHSCOPE_API_KEY_V1')

    if (!apiKey || apiKey === 'MY_DASHSCOPE_API_KEY') {
      this.logger.warn(
        '⚠️ DASHSCOPE_API_KEY não configurada. Usando o motor de fallback inteligente.'
      )
      return null
    }
    if (!this.client) {
      const baseURL =
        this.config.get<string>('DASHSCOPE_API_URL') ||
        'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
      this.client = new OpenAI({ apiKey, baseURL })
    }
    return this.client
  }

  isEnabled(): boolean {
    return this.getClient() !== null
  }

  /**
   * Gera um objeto JSON a partir de um prompt, com retry/fallback de modelo.
   * Retorna `null` se a IA não estiver disponível (sem chave).
   * Lança QuotaExceededError se a cota for excedida.
   */
  async generateJson<T = any>(params: {
    system?: string
    prompt: string
  }): Promise<T | null> {
    const client = this.getClient()
    if (!client) return null

    let lastError: any = null

    for (const model of this.models) {
      const attempts = 2
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          this.logger.log(
            `[Qwen] Tentando modelo ${model} (tentativa ${attempt}/${attempts})...`
          )
          const completion = await client.chat.completions.create({
            model,
            response_format: { type: 'json_object' },
            messages: [
              ...(params.system
                ? [{ role: 'system' as const, content: params.system }]
                : []),
              { role: 'user' as const, content: params.prompt }
            ]
          })
          const text = completion.choices?.[0]?.message?.content
          if (text) {
            this.logger.log(`[Qwen] Sucesso com o modelo ${model}!`)
            return JSON.parse(text) as T
          }
        } catch (err: any) {
          lastError = err
          const errMsg = (err?.message || '').toString()
          this.logger.warn(
            `[Qwen] Erro (modelo ${model}, tentativa ${attempt}): ${errMsg}`
          )

          const isQuota =
            errMsg.toLowerCase().includes('quota') ||
            errMsg.toLowerCase().includes('exceeded') ||
            err?.status === 429
          if (isQuota) {
            this.logger.warn('[Qwen] Cota excedida. Abortando tentativas.')
            throw new QuotaExceededError()
          }

          const isUnavailable =
            errMsg.includes('503') ||
            errMsg.includes('UNAVAILABLE') ||
            errMsg.includes('high demand') ||
            err?.status === 503
          if (isUnavailable) {
            this.logger.warn(
              `[Qwen] Modelo ${model} indisponível (503). Trocando de modelo.`
            )
            break // pula para o próximo modelo
          }

          if (attempt < attempts) {
            await new Promise(r => setTimeout(r, attempt * 300))
          }
        }
      }
    }

    throw lastError || new Error('Falha ao gerar conteúdo com o Qwen.')
  }
}
