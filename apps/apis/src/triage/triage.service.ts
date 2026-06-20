import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { QwenService, QuotaExceededError } from '../qwen/qwen.service'
import { AnalyzeDto, ClassifyDto } from './dto/triage.dto'

const QUOTA_RESPONSE = {
  error: 'QUOTA_EXCEEDED',
  message: 'Limite diário da IA atingido.'
}

@Injectable()
export class TriageService {
  private readonly logger = new Logger(TriageService.name)

  constructor(private readonly qwen: QwenService) {}

  /* ============================================================
   * Endpoint 1 — Analisar relato (Agente Coletor)
   * ============================================================ */
  async analyze(dto: AnalyzeDto): Promise<any> {
    const { symptomText, patientAge, patientSex } = dto
    const queryText = symptomText.toLowerCase().trim()

    if (this.qwen.isEnabled()) {
      try {
        const prompt = `Analise a seguinte queixa médica descrita por um paciente em português simples:
"${symptomText}"
Idade do paciente: ${patientAge ? patientAge + ' anos' : 'Não informada'}
Sexo do paciente: ${patientSex ? (patientSex === 'male' ? 'Masculino' : 'Feminino') : 'Não informado'}

Você é um agente de IA COLETOR especialista em triagem médica (Protocolo de Manchester).
Identifique sintomas, extraia sinais de alerta (red flags), e se houver indício de emergência crítica imediata, retorne 'alertaEmergencia'.
Gere entre 4 e 6 perguntas adaptativas importantes para aprofundar a investigação, mensurar dor/incômodo e ajudar o classificador depois. Evite poucas perguntas se a queixa for muito genérica.
As perguntas devem ser do tipo 'sim_nao', 'escolha_unica', 'multipla_escolha' ou 'escala'.

Retorne ESTRITAMENTE um objeto JSON com EXATAMENTE esta forma (sem texto fora do JSON):
{
  "sessaoId": string,
  "versaoModelo": string,
  "sintomasIdentificados": [ { "rotulo": string, "inicio"?: "subito"|"gradual", "localizacao"?: string } ],
  "redFlags": [ { "codigo": string, "descricao": string, "severidade": "media"|"alta" } ],
  "perguntas": [ {
    "id": string,
    "tipo": "sim_nao"|"escolha_unica"|"multipla_escolha"|"escala",
    "pergunta": string,
    "obrigatoria": boolean,
    "motivo"?: string,
    "pesoClinico"?: "baixo"|"medio"|"alto",
    "escala"?: { "min": number, "max": number },
    "opcoes"?: [ { "valor": string, "rotulo": string, "sinaliza"?: "alerta" } ]
  } ],
  "alertaEmergencia"?: { "motivo": string, "acao": string }
}`

        const parsed = await this.qwen.generateJson({
          system:
            'Você é um agente clínico de triagem. Responda SEMPRE com um único objeto JSON válido aderente ao schema solicitado.',
          prompt
        })
        if (parsed) return parsed
      } catch (err) {
        if (err instanceof QuotaExceededError) {
          throw new HttpException(QUOTA_RESPONSE, HttpStatus.TOO_MANY_REQUESTS)
        }
        this.logger.error('Falha no Qwen (analyze). Usando fallback local.', err as Error)
      }
    }

    return this.analyzeLocal(queryText)
  }

  /* ============================================================
   * Endpoint 2 — Classificar risco (Agente Classificador)
   * ============================================================ */
  async classify(dto: ClassifyDto): Promise<any> {
    const { paciente, relato, respostas, nivelDor, sinaisVitais } = dto as any

    const name = paciente?.nome
    const age = paciente?.idade
    const sex = paciente?.sexo
    const symptomText = relato?.texto

    let score = nivelDor
    if (score === undefined || score === null) {
      const painAnswer = (respostas || []).find(
        (a: any) =>
          /dor|escala|intensidade/i.test(a.questionText) &&
          !isNaN(parseInt(a.answer))
      )
      score = painAnswer ? parseInt(painAnswer.answer) : 5
    }

    if (this.qwen.isEnabled()) {
      try {
        const answersText = (respostas || [])
          .map(
            (ans: any) =>
              `- Pergunta: "${ans.questionText}" | Resposta: "${ans.answer}"`
          )
          .join('\n')

        const vitalsParts: string[] = []
        if (sinaisVitais) {
          vitalsParts.push(
            `Temperatura: ${sinaisVitais.temperaturaC ?? 'Não informada'}${sinaisVitais.temperaturaC != null ? '°C' : ''}`
          )
          vitalsParts.push(
            `Frequência cardíaca: ${sinaisVitais.freqCardiacaBpm ?? 'Não informada'}${sinaisVitais.freqCardiacaBpm != null ? ' bpm' : ''}`
          )
          if (
            sinaisVitais.pressaoSistolica != null &&
            sinaisVitais.pressaoDiastolica != null
          ) {
            vitalsParts.push(
              `Pressão Arterial: ${sinaisVitais.pressaoSistolica}/${sinaisVitais.pressaoDiastolica} mmHg`
            )
          } else {
            vitalsParts.push('Pressão Arterial: Não informada')
          }
          vitalsParts.push(
            `Saturação SpO2: ${sinaisVitais.spo2 ?? 'Não informada'}${sinaisVitais.spo2 != null ? '%' : ''}`
          )
        }
        const vitalsText = vitalsParts.length ? vitalsParts.join(', ') : 'Não informados'

        const symptomsKeywords = ((dto as any).sintomasIdentificados || [])
          .map((s: any) => s.rotulo)
          .join(', ')

        const prompt = `Analise os dados deste paciente e classifique o seu nível de prioridade clínica de acordo com o Protocolo de Manchester (Vermelho, Laranja, Amarelo, Verde, Azul).

IMPORTANTE:
1. Use APENAS os dados fornecidos abaixo. NÃO invente sintomas, red-flags ou detalhes não relatados. Se a informação não existe, diga "Não informado".
2. CONSIDERE a Idade e o Sexo do paciente apenas se forem clinicamente relevantes (ex.: idosos com maior risco cardiovascular, crianças pequenas, dor obstétrica, gestação) para justificar a gravidade ou modular as red-flags. Do contrário, dados demográficos que não discriminam o caso não devem ser apontados como fatores determinantes.
3. Seja conservador: na dúvida entre duas cores devido à intensidade da dor, escolha a mais urgente, mas sem ignorar a ausência de sinais vitais se for o caso.
4. ALERTA DE DIVERGÊNCIA DE DOR: Se o relato qualitativo descreve a dor como "forte", "muito forte", "intensa", "insuportável" ou "pior dor", mas a nota numérica (0 a 10) for menor ou igual a 6, você DEVE:
   - Iniciar a 'justificativa' com o prefixo "[ALERTA CLÍNICO]: Divergência de dor detectada. O paciente descreve a dor qualitativamente como intensa/forte no relato escrito, mas atribuiu a nota ${score}/10 na escala numérica. Clinicamente, adotamos uma postura conservadora e alertamos a triagem."
   - Considerar a gravidade maior na classificação para margem de segurança.

DADOS DO PACIENTE:
- Nome: ${name || 'Não identificado'}
- Idade: ${age !== undefined && age !== null ? age : 'Não informada'} anos
- Sexo: ${sex === 'male' ? 'Masculino' : sex === 'female' ? 'Feminino' : 'Não informado'}
- Queixa principal descrita: "${symptomText?.trim() || 'Não informada'}"
- Sintomas chave detectados: ${symptomsKeywords || 'Nenhum específico'}
- Respostas detalhadas às perguntas:
${answersText || 'Nenhuma resposta adicional.'}
- Nível de dor (0 a 10): ${score}
- Sinais vitais informados: ${vitalsText}

REGRAS DE CLASSIFICAÇÃO:
1. vermelho (Emergência) — Risco de morte imediato (dor no peito irradiando, cefaleia súbita "explosiva", inconsciência).
2. laranja (Muito Urgente) — Dor muito intensa (>= 9), febre muito alta, sinais de gravidade.
3. amarelo (Urgente) — Dor moderada (5-8), sinais alterados mas estáveis.
4. verde (Pouco Urgente) — Queixas leves, resfriados, dores crônicas sem piora.
5. azul (Não Urgente) — Sem queixa aguda, casos sociais.

Retorne ESTRITAMENTE um objeto JSON com EXATAMENTE esta forma (sem texto fora do JSON):
{
  "sessaoId": string,
  "classificacao": {
    "nivel": "vermelho"|"laranja"|"amarelo"|"verde"|"azul",
    "confianca": number,
    "justificativa": string,
    "fatoresDeterminantes": string[]
  },
  "esperaEstimada": { "min": number, "max": number, "unidade": "min" },
  "recomendacoes": string[],
  "redFlags": [ { "codigo": string, "descricao": string, "severidade": string } ],
  "emergencia": boolean,
  "agendamento"?: { "especialidadeSugerida": string, "local"?: string, "profissional"?: string, "horarioEstimado"?: string },
  "disclaimer": string,
  "geradoEm": string,
  "versaoModelo": string
}
- A 'justificativa' deve ser humanizada e explicar a escolha da cor com base nos dados reais.
- 'fatoresDeterminantes' deve conter apenas os fatores clínicos que de fato discriminaram o nível; evite dados demográficos que não influenciaram a conduta.`

        const parsed: any = await this.qwen.generateJson({
          system:
            'Você é um classificador clínico de risco (Protocolo de Manchester). Responda SEMPRE com um único objeto JSON válido aderente ao schema solicitado.',
          prompt
        })

        if (parsed) {
          this.normalizeEspera(parsed)
          return parsed
        }
      } catch (err) {
        if (err instanceof QuotaExceededError) {
          throw new HttpException(QUOTA_RESPONSE, HttpStatus.TOO_MANY_REQUESTS)
        }
        this.logger.error('Falha no Qwen (classify). Usando fallback local.', err as Error)
      }
    }

    return this.classifyLocal({ symptomText, respostas, sinaisVitais, score })
  }

  /** Ajusta esperaEstimada de acordo com a cor (espelha server.ts). */
  private normalizeEspera(parsed: any) {
    const nivel = parsed?.classificacao?.nivel?.toLowerCase().trim()
    if (!nivel) return
    if (nivel === 'vermelho' || nivel === 'red')
      parsed.esperaEstimada = { min: 0, max: 0, unidade: 'min' }
    else if (nivel === 'laranja' || nivel === 'orange')
      parsed.esperaEstimada = { min: 0, max: 10, unidade: 'min' }
    else if (nivel === 'amarelo' || nivel === 'yellow')
      parsed.esperaEstimada = { min: 30, max: 60, unidade: 'min' }
    else if (nivel === 'verde' || nivel === 'green')
      parsed.esperaEstimada = { min: 60, max: 120, unidade: 'min' }
    else if (nivel === 'azul' || nivel === 'blue')
      parsed.esperaEstimada = { min: 120, max: 240, unidade: 'min' }
  }

  /* ============================================================
   * FALLBACK LOCAL — Coletor (regras PT-BR de emergência)
   * ============================================================ */
  private analyzeLocal(queryText: string): any {
    this.logger.log('Executando motor de regras local (analyze)...')
    let sintomasIdentificados: any[] = []
    let perguntas: any[] = []
    const redFlags: any[] = []
    let alertaEmergencia: any = undefined

    const hasChestKeywords = /peit|braç|coraç|card|infar|espalh/i.test(queryText)
    const hasBreathKeywords = /ar|respir|foleg|asf|sufoc/i.test(queryText)
    const hasAbdomenKeywords =
      /barrig|abdom|estom|diarr|vomi|enj|fesc|vesic|apend/i.test(queryText)
    const hasHeadKeywords = /cabeç|cefal|nuc|enxaq|tont|desma/i.test(queryText)
    const hasFeverKeywords = /febr|quent|termom|frio|calaf/i.test(queryText)

    if (hasChestKeywords || hasBreathKeywords) {
      sintomasIdentificados = [
        { rotulo: hasChestKeywords ? 'dor no peito' : 'falta de ar' },
        { rotulo: hasBreathKeywords ? 'dificuldade respiratória' : 'aperto torácico' }
      ]
      perguntas = [
        {
          id: 'chest1',
          pergunta:
            'Sente que a dor se espalha para o braço esquerdo, mandíbula ou costas?',
          tipo: 'sim_nao',
          obrigatoria: true
        },
        {
          id: 'chest2',
          pergunta:
            'Você também está apresentando suor frio, tontura ou sensação de desmaio?',
          tipo: 'sim_nao',
          obrigatoria: true
        },
        {
          id: 'chest3',
          pergunta:
            'Como você descreveria a intensidade desse desconforto no peito?',
          tipo: 'escolha_unica',
          obrigatoria: true,
          opcoes: [
            { valor: 'leve', rotulo: 'Leve aperto' },
            { valor: 'forte', rotulo: 'Forte pressão/queimação' },
            { valor: 'agoniante', rotulo: 'Agoniante e insuportável', sinaliza: 'alerta' }
          ]
        }
      ]
    } else if (hasAbdomenKeywords) {
      sintomasIdentificados = [
        { rotulo: 'dor de barriga / abdômen' },
        { rotulo: 'enjoo ou vômito' }
      ]
      perguntas = [
        {
          id: 'abd1',
          pergunta:
            'A dor é muito forte na parte inferior direita da barriga (região do apêndice)?',
          tipo: 'sim_nao',
          obrigatoria: true
        },
        {
          id: 'abd2',
          pergunta:
            'Você está conseguindo beber água ou todo líquido é expelido no vômito?',
          tipo: 'escolha_unica',
          obrigatoria: true,
          opcoes: [
            { valor: 'ok', rotulo: 'Consigo beber líquido' },
            { valor: 'vomita', rotulo: 'Vomito tudo o que bebo' },
            { valor: 'leve', rotulo: 'Não sinto sede / náusea leve' }
          ]
        },
        {
          id: 'abd3',
          pergunta: 'Além da dor, você notou febre alta ou calafrios?',
          tipo: 'sim_nao',
          obrigatoria: true
        }
      ]
    } else if (hasHeadKeywords) {
      sintomasIdentificados = [
        { rotulo: 'dor de cabeça forte' },
        { rotulo: 'sintomas neurológicos' }
      ]

      if (
        queryText.includes('pior dor') ||
        queryText.includes('de repente na minha nuca') ||
        queryText.includes('cefaleia súbita') ||
        queryText.includes('insuportável na nuca')
      ) {
        redFlags.push({
          codigo: 'CEFALEIA_SUBITA',
          descricao:
            "Cefaleia súbita intensa ('pior dor da vida', 'sudden severe headache')",
          severidade: 'alta'
        })
        alertaEmergencia = {
          motivo: 'Suspeita de emergência neurológica (cefaleia em thunderclap)',
          acao: 'Dirija-se à triagem ou chame a enfermagem imediatamente.'
        }
      }

      perguntas = [
        {
          id: 'head1',
          pergunta:
            'Sente a nuca muito dura / rígida ou tem dor extrema ao encostar o queixo no peito?',
          tipo: 'sim_nao',
          obrigatoria: true
        },
        {
          id: 'head2',
          pergunta:
            'Esta dor de cabeça começou de forma súbita e é a mais forte de toda a sua vida?',
          tipo: 'sim_nao',
          obrigatoria: true
        },
        {
          id: 'head3',
          pergunta:
            'Além da dor, você tem episódios de visão embaçada, confusão ou formigamento no rosto?',
          tipo: 'escolha_unica',
          obrigatoria: true,
          opcoes: [
            { rotulo: 'Não, apenas a dor padrão', valor: 'nao' },
            { rotulo: 'Sim, sinto tontura e visão borrada', valor: 'visao', sinaliza: 'alerta' },
            { rotulo: 'Tenho sensibilidade extrema à luz', valor: 'luz' }
          ]
        }
      ]
    } else if (hasFeverKeywords) {
      sintomasIdentificados = [
        { rotulo: 'febre ou calafrios' },
        { rotulo: 'quadro infeccioso provável' }
      ]
      perguntas = [
        {
          id: 'fev1',
          pergunta: 'A sua febre passou de 38,5°C nas últimas medições?',
          tipo: 'sim_nao',
          obrigatoria: true
        },
        {
          id: 'fev2',
          pergunta: 'Surgiram manchas vermelhas ou escuras pelo seu corpo?',
          tipo: 'sim_nao',
          obrigatoria: true
        },
        {
          id: 'fev3',
          pergunta:
            'Você tem outros sintomas como dor forte ao urinar, catarro escuro ou dor de garganta?',
          tipo: 'escolha_unica',
          obrigatoria: true,
          opcoes: [
            { rotulo: 'Sim, dor ao urinar ou tosse', valor: 'outros' },
            { rotulo: 'Sim, garganta muito inflamada', valor: 'garganta' },
            { rotulo: 'Não, apenas febre e fraqueza', valor: 'nao' }
          ]
        }
      ]
    } else {
      sintomasIdentificados = [{ rotulo: 'queixa inespecífica ou geral' }]
      perguntas = [
        {
          id: 'gen1',
          pergunta: 'Você está conseguindo caminhar e falar de forma normal?',
          tipo: 'sim_nao',
          obrigatoria: true
        },
        {
          id: 'gen2',
          pergunta: 'Há quanto tempo esse sintoma incomoda você de forma contínua?',
          tipo: 'escolha_unica',
          obrigatoria: true,
          opcoes: [
            { rotulo: 'Apenas algumas horas', valor: 'horas' },
            { rotulo: 'Um ou dois dias', valor: 'dias' },
            { rotulo: 'Há mais de uma semana', valor: 'semanas' }
          ]
        },
        {
          id: 'gen3',
          pergunta:
            'A dor ou mal-estar piora quando você tenta fazer pequenos movimentos físicos?',
          tipo: 'sim_nao',
          obrigatoria: true
        }
      ]
    }

    return {
      sessaoId: 'local-' + Date.now().toString(),
      versaoModelo: '1.0 - Local',
      sintomasIdentificados,
      redFlags,
      perguntas,
      alertaEmergencia
    }
  }

  /* ============================================================
   * FALLBACK LOCAL — Classificador (motor Manchester local)
   * ============================================================ */
  private classifyLocal(input: {
    symptomText?: string
    respostas?: any[]
    sinaisVitais?: any
    score: number
  }): any {
    const { symptomText, respostas, sinaisVitais, score } = input
    this.logger.log('Executando motor Manchester local (classify)...')

    let nivel = 'verde'
    let justificativa =
      'Seus sintomas indicam que o seu caso é leve e de baixa gravidade imediata. Fique calmo, analisamos as suas respostas e você receberá o atendimento necessário em breve.'
    let esperaMin = 0
    let esperaMax = 120
    let emergencia = false
    let fatoresDeterminantes = [
      'Queixa de baixa complexidade',
      'Ausência de sinais de alerta imediatos'
    ]
    let recomendacoes = [
      'Aguarde ser chamado na recepção pelo seu nome.',
      'Mantenha-se confortável e evite movimentação excessiva caso sinta dores nas articulações.',
      'Informe imediatamente a equipe do posto de saúde se notar qualquer agravamento súbito do que sente.'
    ]

    const isChestRadiation = respostas?.some(
      (a: any) =>
        /braço|pescoço|costas/i.test(a.questionText) && /sim/i.test(a.answer)
    )
    const isColdSweat = respostas?.some(
      (a: any) => /suor frio|tontura/i.test(a.questionText) && /sim/i.test(a.answer)
    )
    const isMaxHeadache = respostas?.some(
      (a: any) =>
        /pior que você já sentiu|súbita/i.test(a.questionText) &&
        /sim/i.test(a.answer)
    )
    const isStiffNeck = respostas?.some(
      (a: any) =>
        /nuca muito dura|encostar o queixo/i.test(a.questionText) &&
        /sim/i.test(a.answer)
    )
    const isRedFlag =
      symptomText &&
      (symptomText.includes('pior dor') ||
        symptomText.includes('de repente na minha nuca') ||
        symptomText.includes('cefaleia súbita') ||
        symptomText.includes('insuportável na nuca'))

    const isSeverePain = score >= 9
    const isModeratePain = score >= 5 && score <= 8

    let parsedTemp = 36.5
    if (sinaisVitais && sinaisVitais.temperaturaC) parsedTemp = sinaisVitais.temperaturaC

    if (isChestRadiation || isColdSweat || isMaxHeadache || isStiffNeck || isRedFlag) {
      nivel = 'vermelho'
      esperaMax = 0
      emergencia = true
      justificativa =
        'Os sintomas que você descreveu, especialmente relacionados a dor aguda crítica ou alerta neurológico, indicam extrema gravidade e exigem atendimento médico imediato e prioritário.'
      fatoresDeterminantes = [
        'Possível sinal neurológico/infarto',
        'Início agudo severo',
        'Sinal clássico de Alerta (red flag)'
      ]
      recomendacoes = [
        'Dirija-se IMEDIATAMENTE ao balcão de triagem e informe que está com dor severa irradiante e aguda',
        'Não faça movimentos bruscos e sente-se confortavelmente',
        'Não beba água nem ingira nada até avaliação'
      ]
    } else if (isSeverePain || parsedTemp > 38.5) {
      nivel = 'laranja'
      esperaMax = 10
      justificativa =
        'Suas respostas indicam um alto nível de dor ou febre que precisa de avaliação médica muito rápida. Estamos comprometidos em reduzir o seu desconforto o quanto antes.'
      fatoresDeterminantes = ['Dor intensa (>=9)', 'Pico febril elevado']
      recomendacoes = [
        'Informe a recepção assim que chegar, comunicando o nível elevado de dor ou febre.',
        'Permaneça sentado e respire fundo de forma calma e ritmada.',
        'Mantenha-se hidratado se puder reter líquidos sem vomitar.'
      ]
    } else if (isModeratePain || parsedTemp > 37.8) {
      nivel = 'amarelo'
      esperaMax = 60
      justificativa =
        'Você apresenta dor moderada ou um quadro febril leve. Seu caso tem prioridade intermediária e você será avaliado para iniciar o tratamento adequado com segurança.'
      fatoresDeterminantes = ['Febre moderada', 'Dor nível intermediário']
      recomendacoes = [
        'Aguarde o chamado na sala de espera de forma calma.',
        'Tente repousar a cabeça e evite telas brilhantes se estiver com dor de cabeça.',
        'Se sentir escalonamento da temperatura ou dor, notifique a enfermagem.'
      ]
    } else if (score <= 4 && score >= 1) {
      nivel = 'verde'
      esperaMax = 120
      justificativa =
        'Seus sintomas são leves e de evolução estável. Você está seguro e receberá atendimento pelas equipes médicas conforme a fila de triagem organizada por prioridade.'
      fatoresDeterminantes = ['Sintomas estáveis', 'Dor leve']
      recomendacoes = [
        'Aguarde com tranquilidade na sala de espera.',
        'Mantenha-se hidratado. Se estiver com frio ou calor excessivo, avise na recepção.',
        'Seus sintomas não mostram riscos graves, mas se algo mudar, fale conosco a qualquer momento.'
      ]
    } else {
      nivel = 'azul'
      esperaMax = 240
      justificativa =
        'Seus relatos demonstram sintomas estáveis e de baixíssimo impacto imediato no organismo. Você será atendido de forma segura após os casos de maior risco serem priorizados.'
      fatoresDeterminantes = ['Ausência de dor', 'Sem sinais agudos evidentes']
      recomendacoes = [
        'Pode aguardar na sala de espera confortável.',
        'Caso prefira um atendimento ainda mais rápido para queixas leves, pergunte na recepção sobre unidades básicas de saúde parceiras.',
        'Se notar algum sintoma novo ou piora, não hesite em relatar a triagem.'
      ]
    }

    esperaMin = 60
    if (nivel === 'vermelho') esperaMin = 0
    else if (nivel === 'laranja') esperaMin = 0
    else if (nivel === 'amarelo') esperaMin = 30
    else if (nivel === 'verde') esperaMin = 60
    else if (nivel === 'azul') esperaMin = 120

    return {
      sessaoId: 'local-' + Date.now(),
      classificacao: { nivel, confianca: 0.95, justificativa, fatoresDeterminantes },
      esperaEstimada: { min: esperaMin, max: esperaMax, unidade: 'min' },
      recomendacoes,
      redFlags: isRedFlag
        ? [
            {
              codigo: 'CEFALEIA_SUBITA',
              descricao: 'Pior dor da vida/Início súbito na nuca',
              severidade: 'alta'
            }
          ]
        : [],
      emergencia,
      disclaimer: 'Gerado por avaliação algorítmica local.',
      geradoEm: new Date().toISOString(),
      versaoModelo: 'Local-Rule-1.0'
    }
  }
}
