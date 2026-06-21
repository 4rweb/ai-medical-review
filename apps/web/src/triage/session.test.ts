import { describe, expect, it } from 'vitest'
import { descricaoResposta, initialSession, triageSessionReducer } from './session'

describe('estado da sessão de triagem', () => {
  it('preserva o sessaoId e dados do coletor', () => {
    const state = triageSessionReducer(initialSession, {
      type: 'analysis',
      value: {
        sessaoId: 'session-123',
        idioma: 'pt-BR',
        sintomasIdentificados: [{ rotulo: 'cefaleia' }],
        redFlags: [
          {
            codigo: 'CEFALEIA_SUBITA',
            descricao: 'Sinal crítico',
            severidade: 'alta'
          }
        ],
        perguntas: [
          {
            id: 'q1',
            tipo: 'sim_nao',
            pergunta: 'Começou de repente?',
            obrigatoria: true
          }
        ],
        alertaEmergencia: {
          motivo: 'Sinal crítico',
          acao: 'Procure a equipe.'
        },
        versaoModelo: 'qwen3.6-flash'
      }
    })

    expect(state.sessaoId).toBe('session-123')
    expect(state.idioma).toBe('pt-BR')
    expect(state.redFlags).toHaveLength(1)
    expect(state.alertaEmergencia).toBeDefined()
    expect(state.versaoModeloColetor).toBe('qwen3.6-flash')
  })

  it('preserva dor zero explicitamente selecionada', () => {
    const state = triageSessionReducer(initialSession, {
      type: 'pain',
      value: 0
    })
    expect(state.nivelDor).toBe(0)
  })

  it('exibe Não respondido e Não como estados diferentes', () => {
    const question = {
      id: 'q1',
      tipo: 'sim_nao' as const,
      pergunta: 'Está com febre?',
      obrigatoria: true
    }
    expect(descricaoResposta(question)).toBe('Não respondido')
    expect(descricaoResposta(question, undefined, 'en')).toBe('Not answered')
    expect(
      descricaoResposta(question, {
        perguntaId: 'q1',
        tipo: 'sim_nao',
        valor: false
      })
    ).toBe('Não')
    expect(
      descricaoResposta(
        question,
        {
          perguntaId: 'q1',
          tipo: 'sim_nao',
          valor: false
        },
        'en'
      )
    ).toBe('No')
  })
})
