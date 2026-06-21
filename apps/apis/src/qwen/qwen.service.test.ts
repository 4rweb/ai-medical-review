import { ConfigService } from '@nestjs/config'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { QwenInvalidResponseError } from './qwen.errors'
import { QwenService } from './qwen.service'
import type { QwenTool } from './qwen.types'

const OutputSchema = z.object({ answer: z.string() })
const ToolInputSchema = z.object({ value: z.number() })

const tool: QwenTool = {
  name: 'lookup',
  description: 'Retorna o dobro do valor.',
  inputSchema: ToolInputSchema,
  execute: input => {
    const { value } = ToolInputSchema.parse(input)
    return { doubled: value * 2 }
  }
}

function toolResponse(id: string, name: string, args: unknown) {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id,
              type: 'function',
              function: { name, arguments: JSON.stringify(args) }
            }
          ]
        }
      }
    ]
  }
}

function finalResponse(answer = 'ok') {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: JSON.stringify({ answer })
        }
      }
    ]
  }
}

function createService(responses: unknown[]) {
  const create = vi.fn()
  for (const response of responses) create.mockResolvedValueOnce(response)

  const config = {
    get: (key: string) =>
      key === 'DASHSCOPE_API_KEY' ? 'test-key' : undefined
  } as ConfigService
  const service = new QwenService(config)
  Object.assign(service, {
    client: { chat: { completions: { create } } }
  })
  return { service, create }
}

const params = {
  model: 'qwen-test',
  schemaName: 'test_schema',
  schema: OutputSchema,
  system: 'Retorne JSON.',
  prompt: 'Consulte a ferramenta.',
  tools: [tool]
}

describe('QwenService transcription locale', () => {
  it.each([
    ['pt-BR', 'pt'],
    ['en', 'en']
  ] as const)('envia %s como idioma ASR %s', async (idioma, expected) => {
    const { service, create } = createService([
      { choices: [{ message: { content: 'transcript' } }] }
    ])

    await service.transcribeAudio({
      audioBase64: 'ZmFrZQ==',
      formato: 'wav',
      idioma
    })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        asr_options: { language: expected, enable_itn: true }
      })
    )
  })
})

describe('QwenService tool calling', () => {
  it('executa a tool, devolve o resultado ao modelo e registra a trilha', async () => {
    const { service, create } = createService([
      toolResponse('call-1', 'lookup', { value: 4 }),
      finalResponse('feito')
    ])

    const result = await service.generateJsonWithTools<z.infer<
      typeof OutputSchema
    >>(params)

    expect(result.data).toEqual({ answer: 'feito' })
    expect(result.toolExecutions).toEqual([
      {
        name: 'lookup',
        arguments: { value: 4 },
        result: { doubled: 8 }
      }
    ])
    expect(create).toHaveBeenCalledTimes(2)
    expect(create.mock.calls[0][0].tool_choice).toBe('auto')
    expect(create.mock.calls[1][0].messages).toContainEqual({
      role: 'tool',
      tool_call_id: 'call-1',
      content: '{"doubled":8}'
    })
  })

  it('obriga uma tool na primeira rodada e libera auto após a execução', async () => {
    const { service, create } = createService([
      toolResponse('call-1', 'lookup', { value: 4 }),
      finalResponse('feito')
    ])

    await service.generateJsonWithTools({
      ...params,
      requireToolCall: true
    })

    expect(create.mock.calls[0][0].tool_choice).toBe('required')
    expect(create.mock.calls[0][0].enable_thinking).toBe(false)
    expect(create.mock.calls[1][0].tool_choice).toBe('auto')
    expect(create.mock.calls[1][0].enable_thinking).toBe(false)
  })

  it('rejeita resposta final quando nenhuma tool obrigatória foi executada', async () => {
    const { service } = createService([
      finalResponse('sem tool'),
      finalResponse('ainda sem tool')
    ])

    await expect(
      service.generateJsonWithTools({
        ...params,
        requireToolCall: true
      })
    ).rejects.toThrow(
      'A Qwen finalizou sem executar a ferramenta obrigatória.'
    )
  })

  it('executa todas as chamadas retornadas na mesma rodada', async () => {
    const first = toolResponse('call-1', 'lookup', { value: 2 })
    first.choices[0].message.tool_calls.push({
      id: 'call-2',
      type: 'function',
      function: { name: 'lookup', arguments: '{"value":3}' }
    })
    const { service } = createService([first, finalResponse()])

    const result = await service.generateJsonWithTools(params)
    expect(result.toolExecutions).toHaveLength(2)
    expect(result.toolExecutions.map(item => item.result)).toEqual([
      { doubled: 4 },
      { doubled: 6 }
    ])
  })

  it('rejeita argumentos inválidos após a tentativa de correção', async () => {
    const { service } = createService([
      toolResponse('call-1', 'lookup', { value: 'quatro' }),
      toolResponse('call-2', 'lookup', { value: 'quatro' })
    ])

    await expect(service.generateJsonWithTools(params)).rejects.toBeInstanceOf(
      QwenInvalidResponseError
    )
  })

  it('rejeita ferramenta fora da lista permitida', async () => {
    const { service } = createService([
      toolResponse('call-1', 'unknown', {}),
      toolResponse('call-2', 'unknown', {})
    ])

    await expect(service.generateJsonWithTools(params)).rejects.toBeInstanceOf(
      QwenInvalidResponseError
    )
  })

  it('interrompe loops acima do limite de rodadas', async () => {
    const { service } = createService([
      toolResponse('call-1', 'lookup', { value: 1 }),
      toolResponse('call-2', 'lookup', { value: 2 }),
      toolResponse('call-3', 'lookup', { value: 1 }),
      toolResponse('call-4', 'lookup', { value: 2 })
    ])

    await expect(
      service.generateJsonWithTools({
        ...params,
        maxToolRounds: 1
      })
    ).rejects.toBeInstanceOf(QwenInvalidResponseError)
  })

  it('interrompe quando excede o total permitido de chamadas', async () => {
    const response = toolResponse('call-1', 'lookup', { value: 1 })
    response.choices[0].message.tool_calls.push({
      id: 'call-2',
      type: 'function',
      function: { name: 'lookup', arguments: '{"value":2}' }
    })
    const { service } = createService([response, response])

    await expect(
      service.generateJsonWithTools({
        ...params,
        maxToolCalls: 1
      })
    ).rejects.toBeInstanceOf(QwenInvalidResponseError)
  })
})
