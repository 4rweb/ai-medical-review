import { z } from 'zod'

export const CONTRATO_VERSAO = '3.0.0'

export const IdiomaSchema = z.enum(['pt-BR', 'en'])
export type Idioma = z.infer<typeof IdiomaSchema>

export const NivelManchesterSchema = z.enum([
  'vermelho',
  'laranja',
  'amarelo',
  'verde',
  'azul'
])
export type NivelManchester = z.infer<typeof NivelManchesterSchema>

export const MANCHESTER: Record<
  NivelManchester,
  { rotulo: string; esperaMin: number; esperaMax: number; critico: boolean }
> = {
  vermelho: { rotulo: 'Emergência', esperaMin: 0, esperaMax: 0, critico: true },
  laranja: {
    rotulo: 'Muito urgente',
    esperaMin: 0,
    esperaMax: 10,
    critico: false
  },
  amarelo: { rotulo: 'Urgente', esperaMin: 30, esperaMax: 60, critico: false },
  verde: {
    rotulo: 'Pouco urgente',
    esperaMin: 60,
    esperaMax: 120,
    critico: false
  },
  azul: {
    rotulo: 'Não urgente',
    esperaMin: 120,
    esperaMax: 240,
    critico: false
  }
}

export const DadosPacienteSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  idade: z.number().int().min(1).max(125),
  sexoBiologico: z.enum(['masculino', 'feminino']).optional(),
  consentimentoLGPD: z.literal(true)
})
export type DadosPaciente = z.infer<typeof DadosPacienteSchema>

export const RelatoSchema = z.object({
  texto: z.string().trim().min(5).max(5000),
  origem: z.literal('texto')
})
export type Relato = z.infer<typeof RelatoSchema>

export const SinaisVitaisSchema = z
  .object({
    temperaturaC: z.number().min(30).max(45).optional(),
    freqCardiacaBpm: z.number().int().min(20).max(250).optional(),
    pressaoSistolica: z.number().int().min(40).max(300).optional(),
    pressaoDiastolica: z.number().int().min(20).max(200).optional(),
    spo2: z.number().int().min(50).max(100).optional()
  })
  .refine(
    value =>
      (value.pressaoSistolica === undefined &&
        value.pressaoDiastolica === undefined) ||
      (value.pressaoSistolica !== undefined &&
        value.pressaoDiastolica !== undefined),
    { message: 'Informe pressão sistólica e diastólica juntas.' }
  )
export type SinaisVitais = z.infer<typeof SinaisVitaisSchema>

export const OpcaoRespostaSchema = z.object({
  valor: z.string().min(1).max(100),
  rotulo: z.string().min(1).max(300),
  sinaliza: z.literal('alerta').optional()
})
export type OpcaoResposta = z.infer<typeof OpcaoRespostaSchema>

const PerguntaBaseSchema = z.object({
  id: z.string().min(1).max(100),
  pergunta: z.string().min(5).max(500),
  obrigatoria: z.boolean(),
  motivo: z.string().max(500).optional(),
  pesoClinico: z.enum(['baixo', 'medio', 'alto']).optional()
})

export const PerguntaAdaptativaSchema = z.discriminatedUnion('tipo', [
  PerguntaBaseSchema.extend({ tipo: z.literal('sim_nao') }),
  PerguntaBaseSchema.extend({
    tipo: z.literal('escolha_unica'),
    opcoes: z.array(OpcaoRespostaSchema).min(2).max(12)
  }),
  PerguntaBaseSchema.extend({
    tipo: z.literal('multipla_escolha'),
    opcoes: z.array(OpcaoRespostaSchema).min(2).max(12)
  }),
  PerguntaBaseSchema.extend({
    tipo: z.literal('escala'),
    escala: z.object({
      min: z.number().int(),
      max: z.number().int(),
      rotulos: z.record(z.string(), z.string()).optional()
    })
  })
])
export type PerguntaAdaptativa = z.infer<typeof PerguntaAdaptativaSchema>

export const RespostaAdaptativaSchema = z.discriminatedUnion('tipo', [
  z.object({
    perguntaId: z.string().min(1),
    tipo: z.literal('sim_nao'),
    valor: z.boolean()
  }),
  z.object({
    perguntaId: z.string().min(1),
    tipo: z.literal('escolha_unica'),
    valor: z.string().min(1)
  }),
  z.object({
    perguntaId: z.string().min(1),
    tipo: z.literal('multipla_escolha'),
    valor: z.array(z.string().min(1)).min(1)
  }),
  z.object({
    perguntaId: z.string().min(1),
    tipo: z.literal('escala'),
    valor: z.number().int()
  })
])
export type RespostaAdaptativa = z.infer<typeof RespostaAdaptativaSchema>

export const SintomaExtraidoSchema = z.object({
  rotulo: z.string().min(1).max(200),
  inicio: z.enum(['subito', 'gradual']).optional(),
  localizacao: z.string().max(200).optional()
})
export type SintomaExtraido = z.infer<typeof SintomaExtraidoSchema>

export const RedFlagSchema = z.object({
  codigo: z.string().min(1).max(100),
  descricao: z.string().min(1).max(500),
  severidade: z.enum(['media', 'alta'])
})
export type RedFlag = z.infer<typeof RedFlagSchema>

export const AlertaEmergenciaSchema = z.object({
  motivo: z.string().min(1).max(500),
  acao: z.string().min(1).max(500)
})
export type AlertaEmergencia = z.infer<typeof AlertaEmergenciaSchema>

export const AUDIO_FORMATS = ['webm', 'wav', 'mp3', 'm4a', 'ogg'] as const
export const AudioFormatSchema = z.enum(AUDIO_FORMATS)
export type AudioFormat = z.infer<typeof AudioFormatSchema>

export const TranscreverRequestSchema = z.object({
  audioBase64: z.string().min(1),
  formato: AudioFormatSchema,
  idioma: IdiomaSchema
})
export type TranscreverRequest = z.infer<typeof TranscreverRequestSchema>

export const TranscreverResponseSchema = z.object({
  texto: z.string().max(5000),
  versaoModelo: z.string().min(1)
})
export type TranscreverResponse = z.infer<typeof TranscreverResponseSchema>

export const AnalisarRelatoRequestSchema = z.object({
  idioma: IdiomaSchema,
  paciente: DadosPacienteSchema,
  relato: RelatoSchema
})
export type AnalisarRelatoRequest = z.infer<typeof AnalisarRelatoRequestSchema>

export const AnalisarRelatoResponseSchema = z.object({
  sessaoId: z.string().min(1),
  idioma: IdiomaSchema,
  sintomasIdentificados: z.array(SintomaExtraidoSchema).max(20),
  redFlags: z.array(RedFlagSchema).max(20),
  perguntas: z.array(PerguntaAdaptativaSchema).min(1).max(10),
  alertaEmergencia: AlertaEmergenciaSchema.nullish(),
  versaoModelo: z.string().min(1)
})
export type AnalisarRelatoResponse = z.infer<
  typeof AnalisarRelatoResponseSchema
>

export const ClassificarRequestSchema = z.object({
  sessaoId: z.string().min(1),
  idioma: IdiomaSchema,
  paciente: DadosPacienteSchema,
  relato: RelatoSchema,
  sintomasIdentificados: z.array(SintomaExtraidoSchema),
  redFlagsColetor: z.array(RedFlagSchema),
  perguntas: z.array(PerguntaAdaptativaSchema),
  respostas: z.array(RespostaAdaptativaSchema),
  nivelDor: z.number().int().min(0).max(10).optional(),
  sinaisVitais: SinaisVitaisSchema.optional(),
  versaoModeloColetor: z.string().min(1)
})
export type ClassificarRequest = z.infer<typeof ClassificarRequestSchema>

export const ClassificacaoModeloSchema = z.object({
  classificacao: z.object({
    nivel: NivelManchesterSchema,
    confianca: z.number().min(0).max(1),
    justificativa: z.string().min(1).max(3000),
    fatoresDeterminantes: z.array(z.string().min(1).max(500)).max(12)
  }),
  redFlags: z.array(RedFlagSchema).max(20),
  emergencia: z.boolean()
})
export type ClassificacaoModelo = z.infer<typeof ClassificacaoModeloSchema>

export const AgendamentoSchema = z.object({
  especialidade: z.string().min(1).max(120),
  local: z.string().min(1).max(200),
  proximoSlot: z.string().datetime()
})
export type Agendamento = z.infer<typeof AgendamentoSchema>

export const ClassificarResponseSchema = z.object({
  sessaoId: z.string().min(1),
  idioma: IdiomaSchema,
  classificacao: ClassificacaoModeloSchema.shape.classificacao,
  esperaEstimada: z.object({
    min: z.number().int().min(0),
    max: z.number().int().min(0),
    unidade: z.literal('min')
  }),
  recomendacoes: z.array(z.string().min(1).max(500)).min(1).max(6),
  redFlags: z.array(RedFlagSchema).max(20),
  emergencia: z.boolean(),
  disclaimer: z.string().min(1),
  geradoEm: z.string().datetime(),
  versaoModelo: z.string().min(1),
  agendamento: AgendamentoSchema.optional(),
  seguranca: z.object({
    regrasAcionadas: z.array(z.string()),
    classificacaoElevada: z.boolean(),
    nivelOriginal: NivelManchesterSchema,
    nivelFinal: NivelManchesterSchema
  })
})
export type ClassificarResponse = z.infer<typeof ClassificarResponseSchema>

export const SessaoTriagemSchema = z.object({
  sessaoId: z.string().optional(),
  idioma: IdiomaSchema.optional(),
  paciente: DadosPacienteSchema.partial(),
  relato: RelatoSchema.optional(),
  sintomasIdentificados: z.array(SintomaExtraidoSchema),
  redFlags: z.array(RedFlagSchema),
  perguntas: z.array(PerguntaAdaptativaSchema),
  respostas: z.array(RespostaAdaptativaSchema),
  nivelDor: z.number().int().min(0).max(10).optional(),
  sinaisVitais: SinaisVitaisSchema.optional(),
  alertaEmergencia: AlertaEmergenciaSchema.optional(),
  versaoModeloColetor: z.string().optional(),
  resultado: ClassificarResponseSchema.optional()
})
export type SessaoTriagem = z.infer<typeof SessaoTriagemSchema>

export const QueueColorSchema = z.enum([
  'red',
  'orange',
  'yellow',
  'green',
  'blue'
])
export type QueueColor = z.infer<typeof QueueColorSchema>
export const QueueStatusSchema = z.enum([
  'aguardando',
  'chamado',
  'em_atendimento',
  'atendido_urgente'
])
export type QueueStatus = z.infer<typeof QueueStatusSchema>

export const QueuePatientSchema = z.object({
  sessaoId: z.string(),
  id: z.string(),
  name: z.string(),
  age: z.number().int(),
  nomeMascarado: z.string(),
  idade: z.number().int(),
  color: QueueColorSchema,
  nivel: NivelManchesterSchema,
  /** @deprecated Renderize o rótulo a partir de `nivel` no locale do cliente. */
  title: z.string(),
  sintomaPrincipal: z.string(),
  status: QueueStatusSchema,
  joinedAt: z.string().datetime(),
  position: z.number().int().min(0).optional()
})
export type QueuePatient = z.infer<typeof QueuePatientSchema>

export const TriagemFilaSubmitRequestSchema = z.object({
  sessao: SessaoTriagemSchema.extend({
    sessaoId: z.string(),
    paciente: DadosPacienteSchema,
    relato: RelatoSchema,
    resultado: ClassificarResponseSchema
  })
})
export type TriagemFilaSubmitRequest = z.infer<
  typeof TriagemFilaSubmitRequestSchema
>

export const QueueResponseSchema = z.object({
  queue: z.array(QueuePatientSchema),
  patient: QueuePatientSchema.optional()
})
export type QueueResponse = z.infer<typeof QueueResponseSchema>

export const AI_ERROR_CODES = {
  quota: 'AI_QUOTA_EXCEEDED',
  unavailable: 'AI_SERVICE_UNAVAILABLE',
  invalid: 'AI_INVALID_RESPONSE'
} as const
export type AiErrorCode =
  (typeof AI_ERROR_CODES)[keyof typeof AI_ERROR_CODES]

export const RECOMENDACOES_POR_NIVEL: Record<NivelManchester, string[]> = {
  vermelho: [
    'Procure imediatamente a equipe de triagem ou ligue para o SAMU 192.',
    'Não permaneça sozinho enquanto aguarda atendimento.',
    'Informe imediatamente qualquer piora ou alteração de consciência.'
  ],
  laranja: [
    'Apresente-se imediatamente à equipe de triagem.',
    'Permaneça próximo à recepção e informe qualquer piora.',
    'Não deixe a unidade antes de ser avaliado pela equipe.'
  ],
  amarelo: [
    'Aguarde em local próximo à equipe de triagem.',
    'Informe imediatamente se os sintomas piorarem.',
    'Siga as orientações presenciais da equipe de saúde.'
  ],
  verde: [
    'Aguarde a chamada conforme a prioridade clínica.',
    'Informe à equipe se houver piora ou novo sintoma.',
    'Esta classificação pode ser revista presencialmente.'
  ],
  azul: [
    'Aguarde a orientação da equipe de recepção.',
    'Informe se houver mudança ou piora dos sintomas.',
    'A equipe poderá orientar o serviço mais adequado.'
  ]
}

export const MANCHESTER_ROTULOS: Record<
  Idioma,
  Record<NivelManchester, string>
> = {
  'pt-BR': {
    vermelho: 'Emergência',
    laranja: 'Muito urgente',
    amarelo: 'Urgente',
    verde: 'Pouco urgente',
    azul: 'Não urgente'
  },
  en: {
    vermelho: 'Emergency',
    laranja: 'Very urgent',
    amarelo: 'Urgent',
    verde: 'Less urgent',
    azul: 'Non-urgent'
  }
}

export const RECOMENDACOES_POR_IDIOMA: Record<
  Idioma,
  Record<NivelManchester, string[]>
> = {
  'pt-BR': RECOMENDACOES_POR_NIVEL,
  en: {
    vermelho: [
      'Immediately seek the triage team or call SAMU at 192.',
      'Do not remain alone while waiting for care.',
      'Immediately report any worsening or change in consciousness.'
    ],
    laranja: [
      'Report immediately to the triage team.',
      'Remain close to reception and report any worsening.',
      'Do not leave the facility before being assessed by the team.'
    ],
    amarelo: [
      'Wait in an area close to the triage team.',
      'Report immediately if your symptoms worsen.',
      'Follow the in-person instructions provided by the healthcare team.'
    ],
    verde: [
      'Wait to be called according to clinical priority.',
      'Tell the team if symptoms worsen or a new symptom appears.',
      'This classification may be reviewed in person.'
    ],
    azul: [
      'Wait for instructions from the reception team.',
      'Report any change or worsening of symptoms.',
      'The team may direct you to the most appropriate service.'
    ]
  }
}

export const DISCLAIMER_POR_IDIOMA: Record<Idioma, string> = {
  'pt-BR':
    'Pré-triagem para apoio à organização do atendimento. Não é diagnóstico e não substitui avaliação presencial.',
  en: 'Pre-triage support for organizing care. This is not a diagnosis and does not replace an in-person assessment.'
}

export function isRespostaPreenchida(
  pergunta: PerguntaAdaptativa,
  resposta?: RespostaAdaptativa
): boolean {
  if (!resposta || resposta.perguntaId !== pergunta.id) return false
  if (resposta.tipo === 'multipla_escolha') return resposta.valor.length > 0
  if (resposta.tipo === 'escolha_unica') return resposta.valor.trim().length > 0
  return true
}

export function mergeRedFlags(...groups: RedFlag[][]): RedFlag[] {
  const unique = new Map<string, RedFlag>()
  for (const flag of groups.flat()) unique.set(flag.codigo, flag)
  return [...unique.values()]
}
