import { describe, expect, it } from 'vitest'
import {
  AvailabilityArgsSchema,
  VitalRangeArgsSchema,
  buscarDisponibilidadeConsultorio,
  verificarFaixaVital
} from './index'

describe('verificarFaixaVital', () => {
  it.each([
    ['spo2', 87, 'baixo_critico'],
    ['spo2', 88, 'baixo'],
    ['spo2', 91, 'baixo'],
    ['spo2', 92, 'normal'],
    ['fc', 39, 'baixo_critico'],
    ['fc', 59, 'baixo'],
    ['fc', 80, 'normal'],
    ['fc', 131, 'alto_critico'],
    ['temp', 34, 'baixo_critico'],
    ['temp', 38, 'alto'],
    ['temp', 39.5, 'alto_critico'],
    ['pas', 89, 'baixo_critico'],
    ['pas', 120, 'normal'],
    ['pas', 180, 'alto_critico']
  ] as const)('classifica %s=%s como %s', (tipo, valor, expected) => {
    expect(verificarFaixaVital(tipo, valor, 40).faixa).toBe(expected)
  })

  it('explicita a limitação das faixas adultas', () => {
    const result = verificarFaixaVital('spo2', 98, 5)
    expect(result.idadeInformada).toBe(5)
    expect(result.observacao).toContain('adultos')
  })

  it('localiza referências e observações sem alterar a faixa canônica', () => {
    const result = verificarFaixaVital('spo2', 87, 40, 'en')
    expect(result.faixa).toBe('baixo_critico')
    expect(result.referencia).toContain('critical')
    expect(result.observacao).toContain('adult')
  })
})

describe('buscarDisponibilidadeConsultorio', () => {
  it('retorna encaixe determinístico com relógio injetado', () => {
    const now = new Date('2026-06-20T12:00:00.000Z')
    expect(buscarDisponibilidadeConsultorio('Cardiologia', now)).toEqual({
      especialidade: 'Cardiologia',
      local: 'Consultório 7 - Ala A',
      proximoSlot: '2026-06-20T12:45:00.000Z'
    })
  })

  it('localiza o endereço do encaixe', () => {
    const now = new Date('2026-06-20T12:00:00.000Z')
    expect(buscarDisponibilidadeConsultorio('Cardiology', now, 'en').local).toBe(
      'Consulting room 7 - Wing A'
    )
  })
})

describe('schemas de argumentos', () => {
  it('rejeita argumentos inválidos', () => {
    expect(
      VitalRangeArgsSchema.safeParse({ tipo: 'spo2', valor: 98, idade: 0 })
        .success
    ).toBe(false)
    expect(AvailabilityArgsSchema.safeParse({ especialidade: '' }).success).toBe(
      false
    )
  })
})
