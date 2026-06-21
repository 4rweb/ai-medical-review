import { describe, expect, it } from 'vitest'
import type { ClassificarRequest, NivelManchester } from '@medical/contracts'
import { ClinicalSafetyService } from './clinical-safety.service'

/**
 * Roteiro de teste de red-flags (AGENTS.md §14) executado contra o validador
 * determinístico — sem depender da IA. Garante que casos críticos forçam a
 * escalada (rede de segurança) e que queixas leves NÃO são escaladas pelo
 * código (ficam a cargo do classificador).
 */
function request(texto: string): ClassificarRequest {
  return {
    sessaoId: 'roteiro',
    idioma: 'pt-BR',
    paciente: { nome: 'Paciente Teste', idade: 40, consentimentoLGPD: true },
    relato: { texto, origem: 'texto' },
    sintomasIdentificados: [],
    redFlagsColetor: [],
    perguntas: [],
    respostas: [],
    versaoModeloColetor: 'qwen3.6-flash'
  }
}

const safety = new ClinicalSafetyService()
const required = (texto: string): NivelManchester | undefined =>
  safety.evaluate(request(texto)).requiredLevel

describe('Roteiro de red-flags §14 (validador determinístico)', () => {
  it.each([
    ['Dor de cabeça súbita e explosiva, a pior da minha vida.', 'vermelho'],
    ['Dor no peito que irradia pro braço, com suor frio.', 'vermelho'],
    ['Falta de ar intensa, não consigo completar frases.', 'vermelho'],
    ['Fraqueza súbita de um lado do corpo e fala arrastada.', 'vermelho']
  ] as const)('escala "%s" para %s', (texto, esperado) => {
    expect(required(texto)).toBe(esperado)
  })

  it.each([
    ['Febre alta há 1 dia, sem outros sinais.'],
    ['Dor de garganta leve há 2 dias.']
  ] as const)('NÃO escala "%s" (decisão fica com a IA)', texto => {
    expect(required(texto)).toBeUndefined()
  })

  it('escala por sinal vital crítico (SpO₂ 87%) mesmo sem texto de alerta', () => {
    const dto = request('Estou cansado.')
    dto.sinaisVitais = { spo2: 87 }
    expect(safety.evaluate(dto).requiredLevel).toBe('vermelho')
  })

  it('vital ausente nunca escala nem é tratado como normal', () => {
    expect(required('Estou cansado.')).toBeUndefined()
  })
})
