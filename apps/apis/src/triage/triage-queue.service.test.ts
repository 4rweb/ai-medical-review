import { describe, expect, it } from 'vitest'
import type { SessaoTriagem } from '@medical/contracts'
import { TriageQueueService } from './triage-queue.service'
import { InMemoryQueueStore } from './queue-store'

const makeQueue = () => new TriageQueueService(new InMemoryQueueStore())

function session(
  sessaoId: string,
  nome: string,
  nivel: 'amarelo' | 'verde'
): SessaoTriagem {
  return {
    sessaoId,
    idioma: 'pt-BR',
    paciente: {
      nome,
      idade: 40,
      consentimentoLGPD: true
    },
    relato: { texto: 'Relato clínico válido.', origem: 'texto' },
    sintomasIdentificados: [{ rotulo: 'sintoma' }],
    redFlags: [],
    perguntas: [],
    respostas: [],
    versaoModeloColetor: 'qwen3.6-flash',
    resultado: {
      sessaoId,
      idioma: 'pt-BR',
      classificacao: {
        nivel,
        confianca: 0.8,
        justificativa: 'Prioridade definida.',
        fatoresDeterminantes: []
      },
      esperaEstimada: { min: 30, max: 60, unidade: 'min' },
      recomendacoes: ['Aguarde a equipe.'],
      redFlags: [],
      emergencia: false,
      disclaimer: 'Pré-triagem.',
      geradoEm: new Date().toISOString(),
      versaoModelo: 'qwen3.6-flash',
      seguranca: {
        regrasAcionadas: [],
        classificacaoElevada: false,
        nivelOriginal: nivel,
        nivelFinal: nivel
      }
    }
  }
}

describe('TriageQueueService', () => {
  it('inicia sem pacientes sintéticos', async () => {
    expect(await makeQueue().getSortedQueue()).toEqual([])
  })

  it('mascara o nome e ordena por gravidade', async () => {
    const queue = makeQueue()
    await queue.submit({ sessao: session('green', 'Maria da Silva', 'verde') })
    await queue.submit({ sessao: session('yellow', 'João Santos', 'amarelo') })
    const result = await queue.getSortedQueue()

    expect(result[0].sessaoId).toBe('yellow')
    expect(result[0].nivel).toBe('amarelo')
    expect(result[0].nomeMascarado).toBe('João S***')
    expect(result[0].name).toBe('João S***')
    expect(result.some(patient => patient.nomeMascarado === 'Maria da Silva')).toBe(
      false
    )
  })
})
