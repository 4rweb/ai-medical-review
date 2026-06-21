import { describe, expect, it } from 'vitest'
import {
  AnalisarRelatoRequestSchema,
  AnalisarRelatoResponseSchema,
  ClassificarResponseSchema,
  isRespostaPreenchida,
  mergeRedFlags,
  type PerguntaAdaptativa
} from './index'

describe('contratos de triagem', () => {
  it('exige consentimento LGPD verdadeiro', () => {
    const parsed = AnalisarRelatoRequestSchema.safeParse({
      paciente: {
        nome: 'Paciente Teste',
        idade: 40,
        consentimentoLGPD: false
      },
      relato: { texto: 'Dor de garganta leve.', origem: 'texto' }
    })
    expect(parsed.success).toBe(false)
  })

  it('exige locale suportado nas chamadas de IA', () => {
    const base = {
      paciente: {
        nome: 'Patient Test',
        idade: 40,
        consentimentoLGPD: true
      },
      relato: { texto: 'Mild sore throat.', origem: 'texto' }
    }
    expect(
      AnalisarRelatoRequestSchema.safeParse({ ...base, idioma: 'en' }).success
    ).toBe(true)
    expect(
      AnalisarRelatoRequestSchema.safeParse({ ...base, idioma: 'es' }).success
    ).toBe(false)
  })

  it('distingue pergunta sem resposta de resposta booleana false', () => {
    const question: PerguntaAdaptativa = {
      id: 'q1',
      tipo: 'sim_nao',
      pergunta: 'Você está com febre?',
      obrigatoria: true
    }
    expect(isRespostaPreenchida(question)).toBe(false)
    expect(
      isRespostaPreenchida(question, {
        perguntaId: 'q1',
        tipo: 'sim_nao',
        valor: false
      })
    ).toBe(true)
  })

  it('deduplica red flags pelo código', () => {
    expect(
      mergeRedFlags(
        [{ codigo: 'AVC', descricao: 'A', severidade: 'alta' }],
        [{ codigo: 'AVC', descricao: 'B', severidade: 'alta' }]
      )
    ).toHaveLength(1)
  })

  it('aceita alerta de emergência nulo retornado pela IA', () => {
    const parsed = AnalisarRelatoResponseSchema.safeParse({
      sessaoId: 'session-1',
      idioma: 'pt-BR',
      sintomasIdentificados: [],
      redFlags: [],
      perguntas: [
        {
          id: 'q1',
          tipo: 'sim_nao',
          pergunta: 'Você está com falta de ar?',
          obrigatoria: true
        }
      ],
      alertaEmergencia: null,
      versaoModelo: 'qwen3.6-flash'
    })

    expect(parsed.success).toBe(true)
  })

  it('valida auditoria final e agendamento tipado', () => {
    const parsed = ClassificarResponseSchema.safeParse({
      sessaoId: 'session-1',
      idioma: 'pt-BR',
      classificacao: {
        nivel: 'verde',
        confianca: 0.8,
        justificativa: 'Caso pouco urgente.',
        fatoresDeterminantes: ['Sintoma leve']
      },
      esperaEstimada: { min: 60, max: 120, unidade: 'min' },
      recomendacoes: ['Aguarde a equipe.'],
      redFlags: [],
      emergencia: false,
      disclaimer: 'Pré-triagem.',
      geradoEm: '2026-06-20T12:00:00.000Z',
      versaoModelo: 'qwen3.6-flash',
      agendamento: {
        especialidade: 'Clínica médica',
        local: 'Consultório 7 - Ala A',
        proximoSlot: '2026-06-20T12:45:00.000Z'
      },
      seguranca: {
        regrasAcionadas: [],
        classificacaoElevada: false,
        nivelOriginal: 'verde',
        nivelFinal: 'verde'
      }
    })

    expect(parsed.success).toBe(true)
  })
})
