import { describe, expect, it } from 'vitest'
import type { ClassificarRequest, NivelManchester } from '@medical/contracts'
import { ClinicalSafetyService } from './clinical-safety.service'

/**
 * Red-flag test script (AGENTS.md §14) executed against the deterministic
 * validator without relying on the AI. It ensures that critical cases force
 * escalation (safety net) and that mild complaints are NOT escalated by code
 * alone, leaving those cases to the classifier.
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

describe('Red-flag script §14 (deterministic validator)', () => {
  it.each([
    [
      'a thunderclap headache complaint',
      'Dor de cabeça súbita e explosiva, a pior da minha vida.',
      'vermelho'
    ],
    [
      'chest pain with cold sweats and arm radiation',
      'Dor no peito que irradia pro braço, com suor frio.',
      'vermelho'
    ],
    [
      'severe shortness of breath with broken speech',
      'Falta de ar intensa, não consigo completar frases.',
      'vermelho'
    ],
    [
      'stroke-like unilateral weakness and slurred speech',
      'Fraqueza súbita de um lado do corpo e fala arrastada.',
      'vermelho'
    ]
  ] as const)('escalates %s to red', (_label, texto, esperado) => {
    expect(required(texto)).toBe(esperado)
  })

  it.each([
    [
      'isolated high fever for one day',
      'Febre alta há 1 dia, sem outros sinais.'
    ],
    ['mild sore throat for two days', 'Dor de garganta leve há 2 dias.']
  ] as const)(
    'does NOT escalate %s (decision stays with the AI)',
    (_label, texto) => {
      expect(required(texto)).toBeUndefined()
    }
  )

  it('escalates on a critical vital sign (SpO₂ 87%) even without warning text', () => {
    const dto = request('Estou cansado.')
    dto.sinaisVitais = { spo2: 87 }
    expect(safety.evaluate(dto).requiredLevel).toBe('vermelho')
  })

  it('never escalates a missing vital sign or treats it as normal', () => {
    expect(required('Estou cansado.')).toBeUndefined()
  })
})
