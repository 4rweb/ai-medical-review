import { z } from 'zod'

export const ClinicalLocaleSchema = z.enum(['pt-BR', 'en']).default('pt-BR')
export type ClinicalLocale = z.infer<typeof ClinicalLocaleSchema>

/**
 * Lógica clínica determinística compartilhada entre o backend (function calling
 * do Qwen) e o servidor MCP. Fonte única — sem duplicação entre os dois hosts
 * de ferramentas. Depende apenas de zod.
 */

export const VitalRangeArgsSchema = z.object({
  tipo: z.enum(['spo2', 'fc', 'temp', 'pas']),
  valor: z.number(),
  idade: z.number().int().min(1).max(125),
  idioma: ClinicalLocaleSchema.optional()
})
export type VitalRangeArgs = z.infer<typeof VitalRangeArgsSchema>

export const AvailabilityArgsSchema = z.object({
  especialidade: z.string().trim().min(2).max(120),
  idioma: ClinicalLocaleSchema.optional()
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
  'Consulta uma faixa determinística simplificada para um sinal vital informado / Checks a simplified deterministic range for a reported vital sign.'

export const AVAILABILITY_DESCRIPTION =
  'Busca o próximo encaixe disponível / Finds the next available appointment for the appropriate specialty.'

function getAdultRange(
  tipo: VitalKind,
  valor: number,
  idioma: ClinicalLocale
): { faixa: VitalRange; referencia: string } {
  const en = idioma === 'en'
  switch (tipo) {
    case 'spo2':
      if (valor < 88) {
        return {
          faixa: 'baixo_critico',
          referencia: en ? 'SpO₂ < 88% is critical' : 'SpO₂ < 88% crítico'
        }
      }
      if (valor < 92) {
        return {
          faixa: 'baixo',
          referencia: en
            ? 'SpO₂ between 88% and 91% is low'
            : 'SpO₂ entre 88% e 91% baixa'
        }
      }
      return { faixa: 'normal', referencia: 'SpO₂ ≥ 92%' }
    case 'fc':
      if (valor < 40) {
        return {
          faixa: 'baixo_critico',
          referencia: en ? 'Heart rate < 40 bpm' : 'FC < 40 bpm'
        }
      }
      if (valor < 60) {
        return {
          faixa: 'baixo',
          referencia: en
            ? 'Heart rate between 40 and 59 bpm'
            : 'FC entre 40 e 59 bpm'
        }
      }
      if (valor > 130) {
        return {
          faixa: 'alto_critico',
          referencia: en ? 'Heart rate > 130 bpm' : 'FC > 130 bpm'
        }
      }
      if (valor > 100) {
        return {
          faixa: 'alto',
          referencia: en
            ? 'Heart rate between 101 and 130 bpm'
            : 'FC entre 101 e 130 bpm'
        }
      }
      return {
        faixa: 'normal',
        referencia: en
          ? 'Heart rate between 60 and 100 bpm'
          : 'FC entre 60 e 100 bpm'
      }
    case 'temp':
      if (valor < 35) {
        return {
          faixa: 'baixo_critico',
          referencia: en ? 'Temperature < 35 °C' : 'Temperatura < 35 °C'
        }
      }
      if (valor >= 39.5) {
        return {
          faixa: 'alto_critico',
          referencia: en
            ? 'Temperature ≥ 39.5 °C'
            : 'Temperatura ≥ 39,5 °C'
        }
      }
      if (valor >= 37.8) {
        return {
          faixa: 'alto',
          referencia: en
            ? 'Temperature between 37.8 and 39.4 °C'
            : 'Temperatura entre 37,8 e 39,4 °C'
        }
      }
      return {
        faixa: 'normal',
        referencia: en
          ? 'Temperature between 35 and 37.7 °C'
          : 'Temperatura entre 35 e 37,7 °C'
      }
    case 'pas':
      if (valor < 90) {
        return {
          faixa: 'baixo_critico',
          referencia: en
            ? 'Systolic blood pressure < 90 mmHg'
            : 'PAS < 90 mmHg'
        }
      }
      if (valor >= 180) {
        return {
          faixa: 'alto_critico',
          referencia: en
            ? 'Systolic blood pressure ≥ 180 mmHg'
            : 'PAS ≥ 180 mmHg'
        }
      }
      if (valor >= 140) {
        return {
          faixa: 'alto',
          referencia: en
            ? 'Systolic blood pressure between 140 and 179 mmHg'
            : 'PAS entre 140 e 179 mmHg'
        }
      }
      return {
        faixa: 'normal',
        referencia: en
          ? 'Systolic blood pressure between 90 and 139 mmHg'
          : 'PAS entre 90 e 139 mmHg'
      }
  }
}

export function verificarFaixaVital(
  tipo: VitalKind,
  valor: number,
  idade: number,
  idioma: ClinicalLocale = 'pt-BR'
): VitalRangeResult {
  const result = getAdultRange(tipo, valor, idioma)
  return {
    ...result,
    idadeInformada: idade,
    observacao:
      idioma === 'en'
        ? 'Simplified adult triage range provisionally applied to all ages; clinical review is required.'
        : 'Faixa simplificada de triagem para adultos, aplicada provisoriamente a todas as idades; requer revisão clínica.'
  }
}

export function buscarDisponibilidadeConsultorio(
  especialidade: string,
  now: Date = new Date(),
  idioma: ClinicalLocale = 'pt-BR'
): AvailabilityResult {
  return {
    especialidade,
    local: idioma === 'en' ? 'Consulting room 7 - Wing A' : 'Consultório 7 - Ala A',
    proximoSlot: new Date(now.getTime() + 45 * 60_000).toISOString()
  }
}
