import { describe, expect, it } from 'vitest'
import {
  CLASSIFIER_SYSTEM_PROMPT,
  MANCHESTER_GROUNDING
} from './manchester-grounding'

describe('Manchester grounding', () => {
  it.each([
    'VERMELHO',
    'LARANJA',
    'AMARELO',
    'VERDE',
    'AZUL'
  ])('documenta o nível %s', level => {
    expect(MANCHESTER_GROUNDING).toContain(level)
  })

  it.each([
    'cefaleia súbita',
    'dor torácica',
    'incapacidade de completar frases',
    'fala arrastada',
    'alteração de consciência',
    'sangramento intenso',
    'SpO₂ informada abaixo de 88%',
    'pressão arterial sistólica informada abaixo de 90 mmHg'
  ])('mantém o discriminador de segurança: %s', discriminator => {
    expect(MANCHESTER_GROUNDING).toContain(discriminator)
  })

  it('proíbe assumir que vital ausente é normal ou reduz prioridade', () => {
    expect(MANCHESTER_GROUNDING).toContain(
      'sinal vital ausente significa "não informado", nunca "normal"'
    )
    expect(MANCHESTER_GROUNDING).toContain(
      'não reduza a prioridade por falta de sinais vitais'
    )
  })

  it('mantém o enquadramento de pré-triagem no system prompt', () => {
    expect(CLASSIFIER_SYSTEM_PROMPT).toContain(MANCHESTER_GROUNDING)
    expect(CLASSIFIER_SYSTEM_PROMPT).toContain('não faz')
    expect(CLASSIFIER_SYSTEM_PROMPT).toContain(
      'não substitui avaliação clínica presencial'
    )
  })
})
