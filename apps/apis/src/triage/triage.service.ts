import {
  BadGatewayException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  AI_ERROR_CODES,
  AgendamentoSchema,
  AnalisarRelatoRequestSchema,
  AnalisarRelatoResponseSchema,
  ClassificacaoModeloSchema,
  ClassificarRequestSchema,
  MANCHESTER,
  RECOMENDACOES_POR_NIVEL,
  type AnalisarRelatoRequest,
  type AnalisarRelatoResponse,
  type ClassificarRequest,
  type ClassificarResponse
} from '@medical/contracts'
import { randomUUID } from 'node:crypto'
import { parsePayload } from '../common/parse-schema'
import { QwenService } from '../qwen/qwen.service'
import {
  QwenInvalidResponseError,
  QwenQuotaError,
  QwenUnavailableError
} from '../qwen/qwen.errors'
import { ClinicalSafetyService } from './clinical-safety.service'
import { ClinicalToolsGatewayService } from './clinical-tools-gateway.service'
import { CLASSIFIER_SYSTEM_PROMPT } from './manchester-grounding'
import { AuditService } from '../db/audit.service'

@Injectable()
export class TriageService {
  private readonly logger = new Logger(TriageService.name)
  private readonly collectorModel: string
  private readonly classifierModel: string

  constructor(
    private readonly qwen: QwenService,
    private readonly safety: ClinicalSafetyService,
    private readonly clinicalTools: ClinicalToolsGatewayService,
    private readonly audit: AuditService,
    config: ConfigService
  ) {
    const defaultModel = config.get<string>('QWEN_MODEL') || 'qwen3.6-flash'
    this.collectorModel =
      config.get<string>('QWEN_COLLECTOR_MODEL') || defaultModel
    this.classifierModel =
      config.get<string>('QWEN_CLASSIFIER_MODEL') || defaultModel
  }

  async analyze(input: unknown): Promise<AnalisarRelatoResponse> {
    const dto = parsePayload(AnalisarRelatoRequestSchema, input)
    try {
      const response = await this.qwen.generateJson<AnalisarRelatoResponse>({
        model: this.collectorModel,
        schemaName: 'analisar_relato',
        schema: AnalisarRelatoResponseSchema,
        system:
          'Você é um agente coletor de pré-triagem. Não diagnostique. Extraia somente dados relatados, gere perguntas objetivas e retorne exclusivamente um objeto JSON válido aderente ao schema fornecido.',
        prompt: this.buildCollectorPrompt(dto)
      })

      const deterministic = this.safety.evaluate({
        sessaoId: response.sessaoId,
        paciente: dto.paciente,
        relato: dto.relato,
        sintomasIdentificados: response.sintomasIdentificados,
        redFlagsColetor: response.redFlags,
        perguntas: response.perguntas,
        respostas: [],
        versaoModeloColetor: response.versaoModelo
      })

      return {
        ...response,
        sessaoId: response.sessaoId || randomUUID(),
        redFlags: [
          ...new Map(
            [...response.redFlags, ...deterministic.flags].map(flag => [
              flag.codigo,
              flag
            ])
          ).values()
        ],
        alertaEmergencia:
          response.alertaEmergencia ||
          (deterministic.requiredLevel === 'vermelho'
            ? {
                motivo: deterministic.flags[0]?.descricao || 'Sinal crítico',
                acao: 'Procure imediatamente a equipe de triagem ou ligue para o SAMU 192.'
              }
            : undefined),
        versaoModelo: this.collectorModel
      }
    } catch (error) {
      this.rethrowAiError(error)
    }
  }

  async classify(input: unknown): Promise<ClassificarResponse> {
    const dto = parsePayload(ClassificarRequestSchema, input)
    try {
      await this.clinicalTools.prepare()
      const generated = await this.generateClassification(dto)
      const model = generated.data
      const safe = this.safety.enforce(dto, model)

      void this.audit.record({
        sessaoId: dto.sessaoId,
        evento: safe.security.elevated ? 'redflag_elevation' : 'classificacao',
        nivelOriginal: safe.security.originalLevel,
        nivelFinal: safe.security.finalLevel,
        regrasAcionadas: safe.security.rules,
        detalhe: {
          confianca: safe.classificacao.confianca,
          emergencia: safe.emergencia
        }
      })

      const metadata = MANCHESTER[safe.classificacao.nivel]
      const availability = [...generated.toolExecutions]
        .reverse()
        .find(
          execution => execution.name === 'buscarDisponibilidadeConsultorio'
        )
      const parsedAppointment = AgendamentoSchema.safeParse(
        availability?.result
      )
      const fallbackAppointment =
        !parsedAppointment.success && safe.classificacao.nivel !== 'vermelho'
          ? await this.clinicalTools.buscarDisponibilidadeConsultorio(
              this.getFallbackSpecialty()
            )
          : undefined
      const resolvedAppointment = parsedAppointment.success
        ? parsedAppointment.data
        : fallbackAppointment

      return {
        sessaoId: dto.sessaoId,
        classificacao: safe.classificacao,
        esperaEstimada: {
          min: metadata.esperaMin,
          max: metadata.esperaMax,
          unidade: 'min'
        },
        recomendacoes: RECOMENDACOES_POR_NIVEL[safe.classificacao.nivel],
        redFlags: safe.redFlags,
        emergencia: safe.emergencia,
        disclaimer:
          'Pré-triagem para apoio à organização do atendimento. Não é diagnóstico e não substitui avaliação presencial.',
        geradoEm: new Date().toISOString(),
        versaoModelo: this.classifierModel,
        ...(resolvedAppointment ? { agendamento: resolvedAppointment } : {}),
        seguranca: {
          regrasAcionadas: safe.security.rules,
          classificacaoElevada: safe.security.elevated,
          nivelOriginal: safe.security.originalLevel,
          nivelFinal: safe.security.finalLevel
        }
      }
    } catch (error) {
      this.rethrowAiError(error)
    }
  }

  private async generateClassification(dto: ClassificarRequest) {
    const params = {
      model: this.classifierModel,
      schemaName: 'classificar_triagem',
      schema: ClassificacaoModeloSchema,
      system: CLASSIFIER_SYSTEM_PROMPT,
      prompt: this.buildClassifierPrompt(dto),
      tools: this.clinicalTools.getQwenTools()
    }

    try {
      return await this.qwen.generateJsonWithTools<
        import('@medical/contracts').ClassificacaoModelo
      >({
        ...params,
        requireToolCall: true
      })
    } catch (error) {
      if (!this.shouldRetryWithoutRequiredTool(error)) throw error

      this.logger.warn(
        `Sessão ${dto.sessaoId}: Qwen retornou classificação sem tool obrigatória; repetindo sem hard requirement.`
      )

      return this.qwen.generateJsonWithTools<
        import('@medical/contracts').ClassificacaoModelo
      >(params)
    }
  }

  private rethrowAiError(error: unknown): never {
    if (error instanceof QwenQuotaError) {
      throw new HttpException(
        {
          error: AI_ERROR_CODES.quota,
          message:
            'A cota do serviço de IA foi atingida. Tente novamente mais tarde.'
        },
        HttpStatus.TOO_MANY_REQUESTS
      )
    }
    if (error instanceof QwenInvalidResponseError) {
      throw new BadGatewayException({
        error: AI_ERROR_CODES.invalid,
        message:
          'A IA retornou uma resposta inválida. Nenhuma análise foi criada.'
      })
    }
    if (error instanceof QwenUnavailableError) {
      throw new ServiceUnavailableException({
        error: AI_ERROR_CODES.unavailable,
        message: 'Serviço de IA indisponível no momento.'
      })
    }
    throw error
  }

  private shouldRetryWithoutRequiredTool(error: unknown): boolean {
    return (
      error instanceof QwenInvalidResponseError &&
      error.message.includes('ferramenta obrigatória')
    )
  }

  private getFallbackSpecialty(): string {
    return 'Clínica médica'
  }

  private buildCollectorPrompt(dto: AnalisarRelatoRequest): string {
    return `Relato do paciente: ${JSON.stringify(dto.relato.texto)}
Idade: ${dto.paciente.idade}
Sexo biológico: ${dto.paciente.sexoBiologico || 'não informado'}

Extraia sintomas e sinais de alerta sem inventar informações.
Gere de 4 a 6 perguntas adaptativas clinicamente relevantes.
Toda pergunta obrigatória deve permitir resposta objetiva.
Use IDs curtos e estáveis.
Crie um sessaoId UUID.
versaoModelo deve ser "${this.collectorModel}".
Se o relato já contiver sinal crítico, preencha alertaEmergencia com orientação para procurar a equipe ou ligar 192.
Não use linguagem diagnóstica.

Retorne um objeto JSON completo nesta estrutura:
{
  "sessaoId": "UUID",
  "sintomasIdentificados": [
    {
      "rotulo": "string",
      "inicio": "subito",
      "localizacao": "string"
    }
  ],
  "redFlags": [
    {
      "codigo": "string",
      "descricao": "string",
      "severidade": "alta"
    }
  ],
  "perguntas": [
    {
      "id": "string",
      "tipo": "sim_nao",
      "pergunta": "string",
      "obrigatoria": true,
      "motivo": "string opcional",
      "pesoClinico": "alto",
      "opcoes": [
        {
          "valor": "string",
          "rotulo": "string",
          "sinaliza": "alerta"
        }
      ],
      "escala": {
        "min": 0,
        "max": 10
      }
    }
  ],
  "alertaEmergencia": {
    "motivo": "string",
    "acao": "string"
  },
  "versaoModelo": "${this.collectorModel}"
}

Regras da estrutura:
- sintomasIdentificados, redFlags e perguntas são sempre arrays;
- use [] quando não houver sintomas identificáveis ou red flags;
- perguntas deve conter de 4 a 6 itens;
- opcoes existe somente em escolha_unica ou multipla_escolha;
- escala existe somente em perguntas do tipo escala;
- alertaEmergencia é omitido quando não houver emergência; não use null.`
  }

  private buildClassifierPrompt(dto: ClassificarRequest): string {
    const answers = dto.respostas.map(answer => {
      const question = dto.perguntas.find(item => item.id === answer.perguntaId)
      return {
        pergunta: question?.pergunta,
        resposta: answer.valor
      }
    })

    return `Classifique somente a prioridade de pré-triagem.

Dados:
${JSON.stringify(
  {
    idade: dto.paciente.idade,
    sexoBiologico: dto.paciente.sexoBiologico,
    relato: dto.relato.texto,
    sintomas: dto.sintomasIdentificados,
    redFlagsColetor: dto.redFlagsColetor,
    respostas: answers,
    nivelDor: dto.nivelDor ?? 'não informado',
    sinaisVitais: dto.sinaisVitais ?? 'não informados'
  },
  null,
  2
)}

Não mencione diagnóstico provável, exames, medicamentos, jejum ou tratamento.
A justificativa deve explicar a prioridade usando apenas os dados fornecidos.
Fatores determinantes devem conter apenas fatos que alteraram a prioridade.
Para cada sinal vital informado, chame verificarFaixaVital antes de concluir.
Se o caso não for vermelho, chame buscarDisponibilidadeConsultorio uma vez
com a especialidade mais apropriada. Não invente disponibilidade no JSON:
o backend usa diretamente o resultado da ferramenta.
Você DEVE executar pelo menos uma ferramenta antes de retornar a classificação.
Quando não houver sinais vitais, execute buscarDisponibilidadeConsultorio.

Retorne um objeto JSON completo nesta estrutura:
{
  "classificacao": {
    "nivel": "amarelo",
    "confianca": 0.8,
    "justificativa": "string",
    "fatoresDeterminantes": ["string"]
  },
  "redFlags": [
    {
      "codigo": "string",
      "descricao": "string",
      "severidade": "alta"
    }
  ],
  "emergencia": false
}

redFlags deve ser [] quando nenhuma red flag for identificada.`
  }
}
