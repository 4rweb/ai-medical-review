import { z } from 'zod'

/**
 * Lógica clínica determinística compartilhada entre o backend (function calling
 * do Qwen) e o servidor MCP. Fonte única — sem duplicação entre os dois hosts
 * de ferramentas. Depende apenas de zod.
 */

export const VitalRangeArgsSchema = z.object({
  tipo: z.enum(['spo2', 'fc', 'temp', 'pas']),
  valor: z.number(),
  idade: z.number().int().min(1).max(125)
})
export type VitalRangeArgs = z.infer<typeof VitalRangeArgsSchema>

export const AvailabilityArgsSchema = z.object({
  especialidade: z.string().trim().min(2).max(120)
})
export type AvailabilityArgs = z.infer<typeof AvailabilityArgsSchema>

export type VitalKind = VitalRangeArgs['tipo']

export type VitalRange =
  | 'baixo_critico'
  | 'baixo'
  | 'normal'
  | 'alto'
  | 'alto_critico'

export type VitalRangeResult = {
  faixa: VitalRange
  referencia: string
  idadeInformada: number
  observacao: string
}

export type AvailabilityResult = {
  especialidade: string
  local: string
  proximoSlot: string
}

export const VITAL_RANGE_DESCRIPTION =
  'Consulta uma faixa determinística simplificada para um sinal vital informado. Use para não depender da memória do modelo sobre limiares.'

export const AVAILABILITY_DESCRIPTION =
  'Busca o próximo encaixe disponível para a especialidade adequada à pré-triagem.'

function getAdultRange(
  tipo: VitalKind,
  valor: number
): { faixa: VitalRange; referencia: string } {
  switch (tipo) {
    case 'spo2':
      if (valor < 88) {
        return { faixa: 'baixo_critico', referencia: 'SpO₂ < 88% crítico' }
      }
      if (valor < 92) {
        return { faixa: 'baixo', referencia: 'SpO₂ entre 88% e 91% baixa' }
      }
      return { faixa: 'normal', referencia: 'SpO₂ ≥ 92%' }
    case 'fc':
      if (valor < 40) {
        return { faixa: 'baixo_critico', referencia: 'FC < 40 bpm' }
      }
      if (valor < 60) {
        return { faixa: 'baixo', referencia: 'FC entre 40 e 59 bpm' }
      }
      if (valor > 130) {
        return { faixa: 'alto_critico', referencia: 'FC > 130 bpm' }
      }
      if (valor > 100) {
        return { faixa: 'alto', referencia: 'FC entre 101 e 130 bpm' }
      }
      return { faixa: 'normal', referencia: 'FC entre 60 e 100 bpm' }
    case 'temp':
      if (valor < 35) {
        return { faixa: 'baixo_critico', referencia: 'Temperatura < 35 °C' }
      }
      if (valor >= 39.5) {
        return { faixa: 'alto_critico', referencia: 'Temperatura ≥ 39,5 °C' }
      }
      if (valor >= 37.8) {
        return {
          faixa: 'alto',
          referencia: 'Temperatura entre 37,8 e 39,4 °C'
        }
      }
      return { faixa: 'normal', referencia: 'Temperatura entre 35 e 37,7 °C' }
    case 'pas':
      if (valor < 90) {
        return { faixa: 'baixo_critico', referencia: 'PAS < 90 mmHg' }
      }
      if (valor >= 180) {
        return { faixa: 'alto_critico', referencia: 'PAS ≥ 180 mmHg' }
      }
      if (valor >= 140) {
        return { faixa: 'alto', referencia: 'PAS entre 140 e 179 mmHg' }
      }
      return { faixa: 'normal', referencia: 'PAS entre 90 e 139 mmHg' }
  }
}

export function verificarFaixaVital(
  tipo: VitalKind,
  valor: number,
  idade: number
): VitalRangeResult {
  const result = getAdultRange(tipo, valor)
  return {
    ...result,
    idadeInformada: idade,
    observacao:
      'Faixa simplificada de triagem para adultos, aplicada provisoriamente a todas as idades; requer revisão clínica.'
  }
}

export function buscarDisponibilidadeConsultorio(
  especialidade: string,
  now: Date = new Date()
): AvailabilityResult {
  return {
    especialidade,
    local: 'Consultório 7 - Ala A',
    proximoSlot: new Date(now.getTime() + 45 * 60_000).toISOString()
  }
}
