import { Injectable, Logger } from '@nestjs/common'
import type {
  ClassificarRequest,
  ClassificacaoModelo,
  NivelManchester,
  RedFlag
} from '@medical/contracts'
import { mergeRedFlags } from '@medical/contracts'

const PRIORIDADE: Record<NivelManchester, number> = {
  vermelho: 0,
  laranja: 1,
  amarelo: 2,
  verde: 3,
  azul: 4
}

type ClinicalContext = {
  text: string
  spo2?: number
  heartRate?: number
  temperature?: number
  systolicPressure?: number
}

type RuleMatch = {
  code: string
  description: string
  requiredLevel: NivelManchester
}

type SafetyRule = (context: ClinicalContext) => RuleMatch | null

const match = (
  code: string,
  description: string,
  requiredLevel: NivelManchester
): RuleMatch => ({ code, description, requiredLevel })

const RULES: SafetyRule[] = [
  context => {
    const headache = /(dor de cabeca|cefaleia|cabeca|nuca)/.test(context.text)
    const sudden =
      /(subit|de repente|do nada|explos|estouro|pior da minha vida|pior dor)/.test(
        context.text
      )
    return headache && sudden
      ? match(
          'CEFALEIA_THUNDERCLAP',
          'Cefaleia súbita, explosiva ou descrita como a pior dor da vida.',
          'vermelho'
        )
      : null
  },
  context => {
    const chestPain =
      /((dor|pressao|aperto|peso).{0,35}(peito|torac))|((peito|torac).{0,25}(doi|dor|aperto|pressao))/.test(
        context.text
      )
    if (!chestPain) return null

    const ischemicPattern =
      /(irradi|braco|mandibula|queixo|suor frio|sudorese|suando frio)/.test(
        context.text
      )
    if (ischemicPattern) {
      return match(
        'DOR_TORACICA_ISQUEMICA',
        'Dor torácica com irradiação ou sudorese fria.',
        'vermelho'
      )
    }

    return /(falta de ar|nause|enjoo|costas)/.test(context.text)
      ? match(
          'DOR_TORACICA_ALERTA',
          'Dor torácica acompanhada de outro sinal de alerta.',
          'laranja'
        )
      : null
  },
  context => {
    const dyspnea =
      /(falta de ar|dificuldade para respirar|nao consigo respirar|sem ar|sufoc|ofegante|dispne)/.test(
        context.text
      )
    if (!dyspnea) return null

    const cannotSpeak =
      /((nao consigo|nao consegue).{0,25}(falar|completar|frase)|nao completa.{0,15}frase|incapaz.{0,20}frase)/.test(
        context.text
      )
    if (cannotSpeak) {
      return match(
        'DISPNEIA_INTENSA',
        'Falta de ar com incapacidade de completar frases.',
        'vermelho'
      )
    }

    return /(intens|sever|muito|piorando)/.test(context.text)
      ? match(
          'DISPNEIA_ALERTA',
          'Falta de ar descrita como intensa ou em piora.',
          'laranja'
        )
      : null
  },
  context =>
    /(fala arrastada|fala embolada|nao consigo falar|boca torta|rosto torto|assimetria facial|fraqueza.{0,30}(lado|metade)|dormencia.{0,30}(lado|metade)|um lado do corpo|perda de forca.{0,30}(lado|metade)|paralis)/.test(
      context.text
    )
      ? match(
          'AVC_FAST',
          'Sinal neurológico focal compatível com o protocolo FAST.',
          'vermelho'
        )
      : null,
  context =>
    /(desmai|desacord|inconsci|convuls|nao acorda|nao responde|confusao intensa|alteracao de consciencia)/.test(
      context.text
    )
      ? match(
          'ALTERACAO_CONSCIENCIA',
          'Alteração de consciência, desmaio ou convulsão.',
          'vermelho'
        )
      : null,
  context =>
    /(muito sangue|hemorragia|sangrando muito|sangramento intenso|nao para de sangrar|trauma grave|acidente grave|atropel|queda.{0,20}altura)/.test(
      context.text
    )
      ? match(
          'SANGRAMENTO_TRAUMA_GRAVE',
          'Sangramento intenso ou trauma de alta energia.',
          'vermelho'
        )
      : null,
  context => {
    if (typeof context.spo2 !== 'number' || context.spo2 >= 92) return null
    return match(
      'HIPOXEMIA',
      `Saturação de oxigênio informada em ${context.spo2}%.`,
      context.spo2 < 88 ? 'vermelho' : 'laranja'
    )
  },
  context => {
    const hypotension =
      typeof context.systolicPressure === 'number' &&
      context.systolicPressure < 90
    const feverWithTachycardia =
      typeof context.heartRate === 'number' &&
      context.heartRate >= 130 &&
      typeof context.temperature === 'number' &&
      context.temperature >= 39.5

    return hypotension || feverWithTachycardia
      ? match(
          'INSTABILIDADE_VITAL',
          'Sinais vitais informados em faixa de instabilidade.',
          'laranja'
        )
      : null
  }
]

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

function buildContext(request: ClassificarRequest): ClinicalContext {
  const answers = request.respostas.flatMap(answer => {
    const question = request.perguntas.find(item => item.id === answer.perguntaId)
    if (!question) return []

    if (answer.tipo === 'sim_nao') {
      return answer.valor ? [question.pergunta] : []
    }
    if (answer.tipo === 'escala') return []

    const values =
      answer.tipo === 'multipla_escolha' ? answer.valor : [answer.valor]
    return values.flatMap(value => {
      if (!('opcoes' in question)) return value
      const option = question.opcoes.find(item => item.valor === value)
      if (!option) return [value]
      return option.sinaliza === 'alerta'
        ? [question.pergunta, option.rotulo]
        : [option.rotulo]
    })
  })

  return {
    text: normalizeText([request.relato.texto, ...answers].join(' ')),
    spo2:
      typeof request.sinaisVitais?.spo2 === 'number'
        ? request.sinaisVitais.spo2
        : undefined,
    heartRate:
      typeof request.sinaisVitais?.freqCardiacaBpm === 'number'
        ? request.sinaisVitais.freqCardiacaBpm
        : undefined,
    temperature:
      typeof request.sinaisVitais?.temperaturaC === 'number'
        ? request.sinaisVitais.temperaturaC
        : undefined,
    systolicPressure:
      typeof request.sinaisVitais?.pressaoSistolica === 'number'
        ? request.sinaisVitais.pressaoSistolica
        : undefined
  }
}

function mostSevere(levels: NivelManchester[]): NivelManchester | undefined {
  return levels.sort((a, b) => PRIORIDADE[a] - PRIORIDADE[b])[0]
}

@Injectable()
export class ClinicalSafetyService {
  private readonly logger = new Logger(ClinicalSafetyService.name)

  evaluate(request: ClassificarRequest): {
    flags: RedFlag[]
    requiredLevel?: NivelManchester
    rules: string[]
  } {
    const context = buildContext(request)
    const matched = RULES.map(rule => rule(context)).filter(
      (result): result is RuleMatch => result !== null
    )

    return {
      flags: matched.map(result => ({
        codigo: result.code,
        descricao: result.description,
        severidade: result.requiredLevel === 'vermelho' ? 'alta' : 'media'
      })),
      requiredLevel: mostSevere(matched.map(result => result.requiredLevel)),
      rules: matched.map(result => result.code)
    }
  }

  enforce(
    request: ClassificarRequest,
    model: ClassificacaoModelo
  ): ClassificacaoModelo & {
    security: {
      rules: string[]
      elevated: boolean
      originalLevel: NivelManchester
      finalLevel: NivelManchester
    }
  } {
    const evaluation = this.evaluate(request)
    const sanitized = this.sanitizeModelOutput(model)
    const originalLevel = sanitized.classificacao.nivel
    const shouldElevate =
      evaluation.requiredLevel !== undefined &&
      PRIORIDADE[evaluation.requiredLevel] < PRIORIDADE[originalLevel]
    const finalLevel = shouldElevate
      ? evaluation.requiredLevel!
      : originalLevel

    if (shouldElevate) {
      this.logger.warn(
        `Sessão ${request.sessaoId}: ${originalLevel} -> ${finalLevel}; regras=${evaluation.rules.join(',')}`
      )
    }

    const safetyExplanation = shouldElevate
      ? `${sanitized.classificacao.justificativa}\n\n[Segurança] Classificação elevada de "${originalLevel}" para "${finalLevel}" pelas regras determinísticas: ${evaluation.rules.join(', ')}.`
      : sanitized.classificacao.justificativa
    const factors = shouldElevate
      ? [
          ...new Set([
            ...sanitized.classificacao.fatoresDeterminantes,
            ...evaluation.flags.map(flag => flag.descricao)
          ])
        ].slice(0, 12)
      : sanitized.classificacao.fatoresDeterminantes

    return {
      ...sanitized,
      classificacao: {
        ...sanitized.classificacao,
        nivel: finalLevel,
        justificativa: safetyExplanation,
        fatoresDeterminantes: factors
      },
      redFlags: mergeRedFlags(
        request.redFlagsColetor,
        sanitized.redFlags,
        evaluation.flags
      ).slice(0, 20),
      emergencia: sanitized.emergencia || finalLevel === 'vermelho',
      security: {
        rules: evaluation.rules,
        elevated: shouldElevate,
        originalLevel,
        finalLevel
      }
    }
  }

  sanitizeModelOutput(model: ClassificacaoModelo): ClassificacaoModelo {
    const prohibited =
      /diagn[oó]st|tomograf|resson|raio.?x|exame|medicamento|medica[cç][aã]o|jejum|tratamento|prescri|aneurisma|infarto|avc|hemorragia|cirurgia/i
    const safeSentences = model.classificacao.justificativa
      .split(/(?<=[.!?])\s+/)
      .filter(sentence => !prohibited.test(sentence))
    const justificativa =
      safeSentences.join(' ').trim() ||
      'A prioridade foi definida a partir da gravidade e do início dos sintomas informados.'
    const fatoresDeterminantes = model.classificacao.fatoresDeterminantes.filter(
      factor => !prohibited.test(factor)
    )

    return {
      ...model,
      classificacao: {
        ...model.classificacao,
        justificativa,
        fatoresDeterminantes:
          fatoresDeterminantes.length > 0
            ? fatoresDeterminantes
            : ['Gravidade dos sintomas relatados']
      }
    }
  }
}
