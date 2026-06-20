import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min
} from 'class-validator'

/** POST /api/triage/analyze */
export class AnalyzeDto {
  @IsString()
  @IsNotEmpty({ message: 'O texto da queixa é obrigatório.' })
  symptomText!: string

  @IsOptional()
  @IsInt()
  patientAge?: number

  @IsOptional()
  @IsString()
  patientSex?: string
}

/** POST /api/triage/classify (corpo aninhado dinâmico — validação leve no topo) */
export class ClassifyDto {
  @IsOptional()
  @IsString()
  sessaoId?: string

  @IsOptional()
  @IsObject()
  paciente?: Record<string, any>

  @IsOptional()
  @IsObject()
  relato?: Record<string, any>

  @IsOptional()
  @IsArray()
  sintomasIdentificados?: any[]

  @IsOptional()
  @IsArray()
  respostas?: any[]

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  nivelDor?: number

  @IsOptional()
  @IsObject()
  sinaisVitais?: Record<string, any>
}

/** POST /api/triage/queue/submit */
export class QueueSubmitDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsInt()
  age?: number

  @IsOptional()
  @IsString()
  color?: string

  @IsOptional()
  @IsString()
  title?: string
}
