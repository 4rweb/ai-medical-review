import { describe, expect, it } from 'vitest'
import { AvailabilityArgsSchema, VitalRangeArgsSchema } from '@medical/clinical'
import { ClinicalToolsService } from './clinical-tools.service'

describe('ClinicalToolsService', () => {
  const service = new ClinicalToolsService(
    () => new Date('2026-06-20T12:00:00.000Z')
  )

  it.each([
    ['spo2', 87, 'baixo_critico'],
    ['spo2', 88, 'baixo'],
    ['spo2', 91, 'baixo'],
    ['spo2', 92, 'normal'],
    ['fc', 39, 'baixo_critico'],
    ['fc', 131, 'alto_critico'],
    ['temp', 39.5, 'alto_critico'],
    ['pas', 89, 'baixo_critico'],
    ['pas', 180, 'alto_critico']
  ] as const)('classifica %s=%s como %s', (tipo, valor, expected) => {
    expect(service.verificarFaixaVital(tipo, valor, 10).faixa).toBe(expected)
  })

  it('explicita a limitação das faixas adultas', () => {
    const result = service.verificarFaixaVital('spo2', 98, 5)
    expect(result.idadeInformada).toBe(5)
    expect(result.observacao).toContain('adultos')
  })

  it('retorna disponibilidade determinística com relógio injetado', () => {
    expect(service.buscarDisponibilidadeConsultorio('Cardiologia')).toEqual({
      especialidade: 'Cardiologia',
      local: 'Consultório 7 - Ala A',
      proximoSlot: '2026-06-20T12:45:00.000Z'
    })
  })

  it('publica tools com schemas que rejeitam argumentos inválidos', () => {
    expect(
      VitalRangeArgsSchema.safeParse({
        tipo: 'spo2',
        valor: 98,
        idade: 0
      }).success
    ).toBe(false)
    expect(
      AvailabilityArgsSchema.safeParse({ especialidade: '' }).success
    ).toBe(false)
    expect(service.getQwenTools().map(tool => tool.name)).toEqual([
      'verificarFaixaVital',
      'buscarDisponibilidadeConsultorio'
    ])
  })
})
