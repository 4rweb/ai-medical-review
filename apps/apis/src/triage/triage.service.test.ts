import { ConfigService } from '@nestjs/config'
import type {
  ClassificarRequest,
  ClassificacaoModelo
} from '@medical/contracts'
import { describe, expect, it, vi } from 'vitest'
import { QwenService } from '../qwen/qwen.service'
import { QwenInvalidResponseError } from '../qwen/qwen.errors'
import { AuditService } from '../db/audit.service'
import { ClinicalSafetyService } from './clinical-safety.service'
import { ClinicalToolsService } from './clinical-tools.service'
import { ClinicalToolsGatewayService } from './clinical-tools-gateway.service'
import { CLASSIFIER_SYSTEM_PROMPT } from './manchester-grounding'
import { TriageService } from './triage.service'

const input: ClassificarRequest = {
  sessaoId: 'session-1',
  idioma: 'pt-BR',
  paciente: {
    nome: 'Paciente Teste',
    idade: 40,
    consentimentoLGPD: true
  },
  relato: { texto: 'Dor de garganta leve há dois dias.', origem: 'texto' },
  sintomasIdentificados: [{ rotulo: 'Dor de garganta' }],
  redFlagsColetor: [],
  perguntas: [],
  respostas: [],
  versaoModeloColetor: 'qwen3.6-flash'
}

const model: ClassificacaoModelo = {
  classificacao: {
    nivel: 'verde',
    confianca: 0.8,
    justificativa: 'Sintoma leve e sem sinais de alerta.',
    fatoresDeterminantes: ['Sintoma leve']
  },
  redFlags: [],
  emergencia: false
}

describe('TriageService', () => {
  it('propaga agendamento somente a partir do resultado executado da tool', async () => {
    const generateJsonWithTools = vi.fn().mockResolvedValue({
      data: model,
      toolExecutions: [
        {
          name: 'buscarDisponibilidadeConsultorio',
          arguments: { especialidade: 'Clínica médica' },
          result: {
            especialidade: 'Clínica médica',
            local: 'Consultório 7 - Ala A',
            proximoSlot: '2026-06-20T12:45:00.000Z'
          }
        }
      ]
    })
    const qwen = {
      generateJsonWithTools
    } as unknown as QwenService
    const config = {
      get: () => 'qwen3.6-flash'
    } as unknown as ConfigService
    const service = new TriageService(
      qwen,
      new ClinicalSafetyService(),
      new ClinicalToolsGatewayService(
        new ConfigService({ MCP_ENABLED: 'false' }),
        new ClinicalToolsService()
      ),
      new AuditService(null),
      config
    )

    const result = await service.classify(input)

    expect(result.agendamento).toEqual({
      especialidade: 'Clínica médica',
      local: 'Consultório 7 - Ala A',
      proximoSlot: '2026-06-20T12:45:00.000Z'
    })
    expect(result.seguranca).toEqual({
      regrasAcionadas: [],
      classificacaoElevada: false,
      nivelOriginal: 'verde',
      nivelFinal: 'verde'
    })
    expect(generateJsonWithTools).toHaveBeenCalledWith(
      expect.objectContaining({
        system: CLASSIFIER_SYSTEM_PROMPT,
        requireToolCall: true
      })
    )
  })

  it('repete sem tool obrigatória e usa fallback determinístico de agendamento', async () => {
    const generateJsonWithTools = vi
      .fn()
      .mockRejectedValueOnce(
        new QwenInvalidResponseError(
          'A Qwen finalizou sem executar a ferramenta obrigatória.'
        )
      )
      .mockResolvedValueOnce({
        data: model,
        toolExecutions: []
      })
    const qwen = {
      generateJsonWithTools
    } as unknown as QwenService
    const config = {
      get: () => 'qwen3.6-flash'
    } as unknown as ConfigService
    const service = new TriageService(
      qwen,
      new ClinicalSafetyService(),
      new ClinicalToolsGatewayService(
        new ConfigService({ MCP_ENABLED: 'false' }),
        new ClinicalToolsService(() => new Date('2026-06-20T12:00:00.000Z'))
      ),
      new AuditService(null),
      config
    )

    const result = await service.classify(input)

    expect(generateJsonWithTools).toHaveBeenCalledTimes(2)
    expect(generateJsonWithTools.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        system: CLASSIFIER_SYSTEM_PROMPT,
        requireToolCall: true
      })
    )
    expect(generateJsonWithTools.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        system: CLASSIFIER_SYSTEM_PROMPT
      })
    )
    expect(generateJsonWithTools.mock.calls[1][0]).not.toHaveProperty(
      'requireToolCall'
    )
    expect(result.agendamento).toEqual({
      especialidade: 'Clínica médica',
      local: 'Consultório 7 - Ala A',
      proximoSlot: '2026-06-20T12:45:00.000Z'
    })
  })

  it('gera coleta e conteúdo determinístico em inglês', async () => {
    const generateJson = vi.fn().mockResolvedValue({
      sessaoId: 'english-session',
      idioma: 'en',
      sintomasIdentificados: [{ rotulo: 'Sore throat' }],
      redFlags: [],
      perguntas: [
        {
          id: 'fever',
          tipo: 'sim_nao',
          pergunta: 'Do you have a fever?',
          obrigatoria: true
        }
      ],
      versaoModelo: 'qwen3.6-flash'
    })
    const service = new TriageService(
      { generateJson } as unknown as QwenService,
      new ClinicalSafetyService(),
      new ClinicalToolsGatewayService(
        new ConfigService({ MCP_ENABLED: 'false' }),
        new ClinicalToolsService()
      ),
      new AuditService(null),
      new ConfigService({ QWEN_MODEL: 'qwen3.6-flash' })
    )

    const result = await service.analyze({
      idioma: 'en',
      paciente: {
        nome: 'Patient Test',
        idade: 40,
        consentimentoLGPD: true
      },
      relato: { texto: 'Mild sore throat for two days.', origem: 'texto' }
    })

    expect(result.idioma).toBe('en')
    expect(result.perguntas[0].pergunta).toBe('Do you have a fever?')
    expect(generateJson).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('questions in English'),
        prompt: expect.stringContaining('Output language: English')
      })
    )
  })

  it('rejeita resposta do coletor em locale diferente do solicitado', async () => {
    const generateJson = vi.fn().mockResolvedValue({
      sessaoId: 'wrong-locale',
      idioma: 'pt-BR',
      sintomasIdentificados: [],
      redFlags: [],
      perguntas: [
        {
          id: 'fever',
          tipo: 'sim_nao',
          pergunta: 'Você está com febre?',
          obrigatoria: true
        }
      ],
      versaoModelo: 'qwen3.6-flash'
    })
    const service = new TriageService(
      { generateJson } as unknown as QwenService,
      new ClinicalSafetyService(),
      new ClinicalToolsGatewayService(
        new ConfigService({ MCP_ENABLED: 'false' }),
        new ClinicalToolsService()
      ),
      new AuditService(null),
      new ConfigService({ QWEN_MODEL: 'qwen3.6-flash' })
    )

    await expect(
      service.analyze({
        idioma: 'en',
        paciente: {
          nome: 'Patient Test',
          idade: 40,
          consentimentoLGPD: true
        },
        relato: { texto: 'Mild sore throat for two days.', origem: 'texto' }
      })
    ).rejects.toMatchObject({ status: 502 })
  })
})
