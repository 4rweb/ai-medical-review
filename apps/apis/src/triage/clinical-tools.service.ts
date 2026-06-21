import { Inject, Injectable, Optional } from '@nestjs/common'
import {
  AvailabilityArgsSchema,
  AVAILABILITY_DESCRIPTION,
  VitalRangeArgsSchema,
  VITAL_RANGE_DESCRIPTION,
  buscarDisponibilidadeConsultorio,
  verificarFaixaVital,
  type AvailabilityResult,
  type ClinicalLocale,
  type VitalKind,
  type VitalRangeResult
} from '@medical/clinical'
import type { QwenTool } from '../qwen/qwen.types'

export const CLINICAL_CLOCK = Symbol('CLINICAL_CLOCK')
export type ClinicalClock = () => Date

@Injectable()
export class ClinicalToolsService {
  constructor(
    @Optional()
    @Inject(CLINICAL_CLOCK)
    private readonly clock: ClinicalClock = () => new Date()
  ) {}

  getQwenTools(idioma: ClinicalLocale = 'pt-BR'): QwenTool[] {
    return [
      {
        name: 'verificarFaixaVital',
        description: VITAL_RANGE_DESCRIPTION,
        inputSchema: VitalRangeArgsSchema,
        execute: input => {
          const args = VitalRangeArgsSchema.parse(input)
          return this.verificarFaixaVital(
            args.tipo,
            args.valor,
            args.idade,
            idioma
          )
        }
      },
      {
        name: 'buscarDisponibilidadeConsultorio',
        description: AVAILABILITY_DESCRIPTION,
        inputSchema: AvailabilityArgsSchema,
        execute: input => {
          const args = AvailabilityArgsSchema.parse(input)
          return this.buscarDisponibilidadeConsultorio(
            args.especialidade,
            idioma
          )
        }
      }
    ]
  }

  verificarFaixaVital(
    tipo: VitalKind,
    valor: number,
    idade: number,
    idioma: ClinicalLocale = 'pt-BR'
  ): VitalRangeResult {
    return verificarFaixaVital(tipo, valor, idade, idioma)
  }

  buscarDisponibilidadeConsultorio(
    especialidade: string,
    idioma: ClinicalLocale = 'pt-BR'
  ): AvailabilityResult {
    return buscarDisponibilidadeConsultorio(especialidade, this.clock(), idioma)
  }
}
