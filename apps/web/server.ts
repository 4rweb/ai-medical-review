import express from 'express'
import path from 'path'
import dotenv from 'dotenv'
import { createServer as createViteServer } from 'vite'
import { GoogleGenAI, Type } from '@google/genai'
import type { QueuePatient } from './src/TriageContracts.js'

dotenv.config()

const app = express()
const PORT = 3000

app.use(express.json())

// Lazy-initialize Gemini AI to prevent server crashes if the key is missing or invalid
let aiClient: GoogleGenAI | null = null
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    console.warn(
      '⚠️ GEMINI_API_KEY não configurada ou usando placeholder. O servidor usará o motor de fallback inteligente.'
    )
    return null
  }
  if (!aiClient) {
    try {
      aiClient = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      })
    } catch (err) {
      console.error('Erro ao inicializar o cliente do Gemini:', err)
    }
  }
  return aiClient
}

// Helper function to call generateContent with retry and fallback model to mitigate 503/throttling errors
async function generateContentWithFallback(
  ai: GoogleGenAI,
  params: {
    contents: any
    config?: any
    model?: string
  }
): Promise<any> {
  const modelsToTry = [
    'gemini-3-flash-preview',
    'gemini-3.1-flash-lite',
    'gemini-3.0-flash',
    'gemini-2.5-flash'
  ]

  let lastError: any = null

  for (const modelName of modelsToTry) {
    const attempts = 2
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        console.log(
          `[Gemini API] Tentando modelo ${modelName} (tentativa ${attempt}/${attempts})...`
        )
        const response = await ai.models.generateContent({
          ...params,
          model: modelName
        })
        if (response && response.text) {
          console.log(`[Gemini API] Sucesso com o modelo ${modelName}!`)
          return response
        }
      } catch (err: any) {
        lastError = err
        const errMsg = err?.message || ''
        console.warn(
          `[Gemini API] Erro na tentativa ${attempt} com o modelo ${modelName}:`,
          errMsg || err
        )

        // Se for indisponibilidade / limite / erro 503, pule direto para o próximo modelo ao invés de perder tempo retentando o mesmo canal congestionado
        const isUnavailable =
          errMsg.includes('503') ||
          errMsg.includes('UNAVAILABLE') ||
          errMsg.includes('high demand') ||
          err?.status === 503 ||
          err?.status === 'UNAVAILABLE'

        const isQuotaExceeded =
          errMsg.toLowerCase().includes('quota') ||
          errMsg.toLowerCase().includes('exceeded') ||
          err?.status === 429

        if (isQuotaExceeded) {
          console.warn(`[Gemini API] Quota excedida. Abortando tentativas.`)
          throw err
        }

        if (isUnavailable) {
          console.warn(
            `[Gemini API] Modelo ${modelName} retornou 503/UNAVAILABLE. Mudando de modelo imediatamente para economizar tempo.`
          )
          break // Sai do laço de tentativas deste modelo para ir ao próximo modelo imediatamente
        }

        if (attempt < attempts) {
          const delay = attempt * 300
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }
  }

  throw (
    lastError ||
    new Error('Falha ao gerar conteúdo após retentar com múltiplos modelos.')
  )
}

// Endpoint 1: Analyze user symptoms text/speech and return keywords & adaptive questions
app.post('/api/triage/analyze', async (req, res) => {
  console.log('DEBUG triage/analyze received full body:', req.body)
  const { symptomText, patientAge, patientSex } = req.body ?? {}

  if (
    !symptomText ||
    typeof symptomText !== 'string' ||
    symptomText.trim().length === 0
  ) {
    return res.status(400).json({ error: 'O texto da queixa é obrigatório.' })
  }

  const queryText = symptomText.toLowerCase().trim()
  const ai = getGeminiClient()

  if (ai) {
    try {
      const response = await generateContentWithFallback(ai, {
        contents: `Analise a seguinte queixa médica descrita por um paciente em português simples:
"${symptomText}"
Idade do paciente: ${patientAge ? patientAge + ' anos' : 'Não informada'}
Sexo do paciente: ${patientSex ? (patientSex === 'male' ? 'Masculino' : 'Feminino') : 'Não informado'}

Você é um agente de IA COLETOR especialista em triagem médica (Protocolo de Manchester). 
Identifique sintomas, extraia sinais de alerta (red flags), e se houver indício de emergência crítica imediata, retorne 'alertaEmergencia'.
Gere entre 4 e 6 perguntas adaptativas importantes para aprofundar a investigação, mensurar dor/incomodo e ajudar o classificador depois. Evite poucas perguntas se a queixa for muito genérica.
As perguntas devem ser do tipo 'sim_nao', 'escolha_unica', 'multipla_escolha' ou 'escala'.

Retorne estritamente um objeto JSON aderente à interface AnalisarRelatoResponse.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              sessaoId: { type: Type.STRING },
              versaoModelo: { type: Type.STRING },
              sintomasIdentificados: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    rotulo: { type: Type.STRING },
                    inicio: {
                      type: Type.STRING,
                      description: 'subito ou gradual'
                    },
                    localizacao: { type: Type.STRING }
                  },
                  required: ['rotulo']
                }
              },
              redFlags: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    codigo: { type: Type.STRING },
                    descricao: { type: Type.STRING },
                    severidade: {
                      type: Type.STRING,
                      description: 'media ou alta'
                    }
                  },
                  required: ['codigo', 'descricao', 'severidade']
                }
              },
              perguntas: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    tipo: {
                      type: Type.STRING,
                      description:
                        'sim_nao, escolha_unica, multipla_escolha, escala'
                    },
                    pergunta: { type: Type.STRING },
                    obrigatoria: { type: Type.BOOLEAN },
                    motivo: { type: Type.STRING },
                    pesoClinico: { type: Type.STRING },
                    escala: {
                      type: Type.OBJECT,
                      properties: {
                        min: { type: Type.INTEGER },
                        max: { type: Type.INTEGER }
                      },
                      required: ['min', 'max']
                    },
                    opcoes: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          valor: { type: Type.STRING },
                          rotulo: { type: Type.STRING },
                          sinaliza: { type: Type.STRING }
                        },
                        required: ['valor', 'rotulo']
                      }
                    }
                  },
                  required: ['id', 'tipo', 'pergunta', 'obrigatoria']
                }
              },
              alertaEmergencia: {
                type: Type.OBJECT,
                properties: {
                  motivo: { type: Type.STRING },
                  acao: { type: Type.STRING }
                },
                required: ['motivo', 'acao']
              }
            },
            required: [
              'sessaoId',
              'versaoModelo',
              'sintomasIdentificados',
              'redFlags',
              'perguntas'
            ]
          }
        }
      })

      const parsedResult = JSON.parse(response.text?.trim() || '{}')
      return res.json(parsedResult)
    } catch (err: any) {
      const errMsg = err?.message || ''
      if (
        errMsg.toLowerCase().includes('quota') ||
        errMsg.toLowerCase().includes('exceeded') ||
        err?.status === 429
      ) {
        return res
          .status(429)
          .json({
            error: 'QUOTA_EXCEEDED',
            message: 'Limite diário da IA atingido.'
          })
      }
      console.error(
        'Falha ao chamar Gemini para análise. Usando fallback inteligente.',
        err
      )
    }
  }

  // --- LOCAL REGEX INTEL - ACCURATE PORTUGUESE EMERGENCY RULES FALLBACK ---
  console.log('Executando motor de regras local...')
  let sintomasIdentificados: any[] = []
  let perguntas: any[] = []
  let redFlags: any[] = []
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
      {
        rotulo: hasBreathKeywords
          ? 'dificuldade respiratória'
          : 'aperto torácico'
      }
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
          {
            valor: 'agoniante',
            rotulo: 'Agoniante e insuportável',
            sinaliza: 'alerta'
          }
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

    // Explicit red flag check for the worst headache / sudden neck pain
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
          {
            rotulo: 'Sim, sinto tontura e visão borrada',
            valor: 'visao',
            sinaliza: 'alerta'
          },
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
        pergunta:
          'Há quanto tempo esse sintoma incomoda você de forma contínua?',
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

  return res.json({
    sessaoId: 'local-' + Date.now().toString(),
    versaoModelo: '1.0 - Local',
    sintomasIdentificados,
    redFlags,
    perguntas,
    alertaEmergencia
  })
})

// Endpoint 2: Manchester Risk Classification (Real Gemini Triage logic with solid local backup)
app.post('/api/triage/classify', async (req, res) => {
  console.log(
    'DEBUG triage/classify received full body:',
    JSON.stringify(req.body, null, 2)
  )
  const { paciente, relato, respostas, nivelDor, sinaisVitais } = req.body ?? {}

  const name = paciente?.nome
  const age = paciente?.idade
  const sex = paciente?.sexo
  const symptomText = relato?.texto

  // Try to find pain level in answers if not explicitly provided
  let score = nivelDor
  if (score === undefined || score === null) {
    const painAnswer = (respostas || []).find(
      (a: any) =>
        /dor|escala|intensidade/i.test(a.questionText) &&
        !isNaN(parseInt(a.answer))
    )
    if (painAnswer) {
      score = parseInt(painAnswer.answer)
    } else {
      score = 5 // Default middle ground
    }
  }

  const ai = getGeminiClient()

  if (ai) {
    try {
      const answersText = (respostas || [])
        .map(
          (ans: any) =>
            `- Pergunta: "${ans.questionText}" | Resposta: "${ans.answer}"`
        )
        .join('\n')

      let vitalsParts: string[] = []
      if (sinaisVitais) {
        if (
          sinaisVitais.temperaturaC !== undefined &&
          sinaisVitais.temperaturaC !== null
        ) {
          vitalsParts.push(`Temperatura: ${sinaisVitais.temperaturaC}°C`)
        } else {
          vitalsParts.push(`Temperatura: Não informada`)
        }
        if (
          sinaisVitais.freqCardiacaBpm !== undefined &&
          sinaisVitais.freqCardiacaBpm !== null
        ) {
          vitalsParts.push(
            `Frequência cardíaca: ${sinaisVitais.freqCardiacaBpm} bpm`
          )
        } else {
          vitalsParts.push(`Frequência cardíaca: Não informada`)
        }
        if (
          sinaisVitais.pressaoSistolica !== undefined &&
          sinaisVitais.pressaoSistolica !== null &&
          sinaisVitais.pressaoDiastolica !== undefined &&
          sinaisVitais.pressaoDiastolica !== null
        ) {
          vitalsParts.push(
            `Pressão Arterial: ${sinaisVitais.pressaoSistolica}/${sinaisVitais.pressaoDiastolica} mmHg`
          )
        } else {
          vitalsParts.push(`Pressão Arterial: Não informada`)
        }
        if (sinaisVitais.spo2 !== undefined && sinaisVitais.spo2 !== null) {
          vitalsParts.push(`Saturação SpO2: ${sinaisVitais.spo2}%`)
        } else {
          vitalsParts.push(`Saturação SpO2: Não informada`)
        }
      }
      const vitalsText =
        vitalsParts.length > 0 ? vitalsParts.join(', ') : 'Não informados'

      const symptomsKeywords = (req.body?.sintomasIdentificados || [])
        .map((s: any) => s.rotulo)
        .join(', ')

      const prompt = `Analise os dados deste paciente e classifique o seu nível de prioridade clínica de acordo com o Protocolo de Manchester (Vermelho, Laranja, Amarelo, Verde, Azul).
      
      IMPORTANTE: 
      1. Use APENAS os dados fornecidos abaixo. NÃO invente sintomas, red-flags ou detalhes não relatados. Se a informação não existe, diga "Não informado".
      2. CONSIDERE a Idade e o Sexo do paciente apenas se eles forem clinicamente relevantes (p.ex. idosos com maior risco cardiovascular, crianças pequenas, dor obstétrica, gestação) para justificar a gravidade ou modular as red-flags. Do contrário, dados demográficos que não discriminam o caso não devem ser apontados como fatores determinantes.
      3. Seja conservador: na dúvida entre duas cores devido à intensidade da dor, escolha a mais urgente, mas sem ignorar a ausência de sinais vitais se este for o caso.
      4. ALERTA DE DIVERGÊNCIA DE DOR: Analise se há inconsistência entre o relato qualitativo de dor na queixa principal (como o uso de termos "forte", "muito forte", "intensa", "insuportável", "insuportavel", "pior dor") e a nota na escala numérica de dor (0 a 10). Se o relato descreve a dor com esses termos intensos, mas a nota numérica informada for moderada ou leve (menor ou igual a 6), você DEVE:
         - Iniciar a 'justificativa' com o prefixo "[ALERTA CLÍNICO]: Divergência de dor detectada. O paciente descreve a dor qualitativamente como intensa/forte no relato escrito, mas atribuiu a nota ${score}/10 na escala numérica. Clinicamente, adotamos uma postura conservadora e alertamos a triagem."
         - Considerar a gravidade maior na classificação clínica para margem de segurança do atendimento.

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
1. vermelho (Emergência) — Risco de morte imediato. Exemplos: dor no peito irradiando, dor de cabeça súbita "explosiva" (pior dor da vida), inconsciência.
2. laranja (Muito Urgente) — Dor muito intensa (>= 9), febre muito alta, sinais de gravidade.
3. amarelo (Urgente) — Dor moderada (5-8), sinais alterados mas estáveis.
4. verde (Pouco Urgente) — Queixas leves, resfriados, dores crônicas sem piora.
5. azul (Não Urgente) — Sem queixa aguda, casos sociais.

No seu output JSON:
- A 'justificativa' deve ser humanizada e explicar a escolha da cor com base nos dados reais.
- O 'fatoresDeterminantes' deve conter apenas os fatores clínicos ou queixas que de fato definiram ou discriminaram o nível de severidade. Evite incluir dados demográficos (como sexo ou idade) se estes não alteraram ou influenciaram a sua conduta clínica, evitando inflar o raciocínio.
- 'condutaRecomendada' deve ser o que o paciente deve fazer agora.

Retorne estritamente um objeto JSON com: nivel, justificativa, fatoresDeterminantes, condutaRecomendada.`

      const response = await generateContentWithFallback(ai, {
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              sessaoId: { type: Type.STRING },
              classificacao: {
                type: Type.OBJECT,
                properties: {
                  nivel: {
                    type: Type.STRING,
                    description: 'vermelho, laranja, amarelo, verde, azul'
                  },
                  confianca: { type: Type.NUMBER },
                  justificativa: { type: Type.STRING },
                  fatoresDeterminantes: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  }
                },
                required: [
                  'nivel',
                  'confianca',
                  'justificativa',
                  'fatoresDeterminantes'
                ]
              },
              esperaEstimada: {
                type: Type.OBJECT,
                properties: {
                  min: { type: Type.NUMBER },
                  max: { type: Type.NUMBER },
                  unidade: { type: Type.STRING }
                },
                required: ['min', 'max', 'unidade']
              },
              recomendacoes: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              redFlags: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    codigo: { type: Type.STRING },
                    descricao: { type: Type.STRING },
                    severidade: { type: Type.STRING }
                  },
                  required: ['codigo', 'descricao', 'severidade']
                }
              },
              emergencia: { type: Type.BOOLEAN },
              agendamento: {
                type: Type.OBJECT,
                properties: {
                  especialidadeSugerida: { type: Type.STRING },
                  local: { type: Type.STRING },
                  profissional: { type: Type.STRING },
                  horarioEstimado: { type: Type.STRING }
                },
                required: ['especialidadeSugerida']
              },
              disclaimer: { type: Type.STRING },
              geradoEm: { type: Type.STRING },
              versaoModelo: { type: Type.STRING }
            },
            required: [
              'sessaoId',
              'classificacao',
              'esperaEstimada',
              'recomendacoes',
              'redFlags',
              'emergencia',
              'disclaimer',
              'geradoEm',
              'versaoModelo'
            ]
          }
        }
      })

      const parsedResult = JSON.parse(response.text?.trim() || '{}')
      if (parsedResult.classificacao && parsedResult.classificacao.nivel) {
        const nivelNorm = parsedResult.classificacao.nivel.toLowerCase().trim()
        if (nivelNorm === 'vermelho' || nivelNorm === 'red') {
          parsedResult.esperaEstimada = { min: 0, max: 0, unidade: 'min' }
        } else if (nivelNorm === 'laranja' || nivelNorm === 'orange') {
          parsedResult.esperaEstimada = { min: 0, max: 10, unidade: 'min' }
        } else if (nivelNorm === 'amarelo' || nivelNorm === 'yellow') {
          parsedResult.esperaEstimada = { min: 30, max: 60, unidade: 'min' }
        } else if (nivelNorm === 'verde' || nivelNorm === 'green') {
          parsedResult.esperaEstimada = { min: 60, max: 120, unidade: 'min' }
        } else if (nivelNorm === 'azul' || nivelNorm === 'blue') {
          parsedResult.esperaEstimada = { min: 120, max: 240, unidade: 'min' }
        }
      }
      return res.json(parsedResult)
    } catch (err: any) {
      const errMsg = err?.message || ''
      if (
        errMsg.toLowerCase().includes('quota') ||
        errMsg.toLowerCase().includes('exceeded') ||
        err?.status === 429
      ) {
        return res
          .status(429)
          .json({
            error: 'QUOTA_EXCEEDED',
            message: 'Limite diário da IA atingido.'
          })
      }
      console.error(
        'Falha ao chamar Gemini para classificação. Usando fallback inteligente.',
        err
      )
    }
  }

  // --- LOCAL ACCURATE MANCHESTER ENGINE FALLBACK ---
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

  // Check critical metrics using the correctly named local variables mapping to schema
  const isChestRadiation =
    respostas &&
    respostas.some(
      (a: any) =>
        /braço|pescoço|costas/i.test(a.questionText) && /sim/i.test(a.answer)
    )
  const isColdSweat =
    respostas &&
    respostas.some(
      (a: any) =>
        /suor frio|tontura/i.test(a.questionText) && /sim/i.test(a.answer)
    )
  const isMaxHeadache =
    respostas &&
    respostas.some(
      (a: any) =>
        /pior que você já sentiu|súbita/i.test(a.questionText) &&
        /sim/i.test(a.answer)
    )
  const isStiffNeck =
    respostas &&
    respostas.some(
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

  // High Pain and High Vitals
  const isSeverePain = score >= 9
  const isModeratePain = score >= 5 && score <= 8

  let parsedTemp = 36.5
  if (sinaisVitais && sinaisVitais.temperaturaC) {
    parsedTemp = sinaisVitais.temperaturaC
  }

  // Strict clinical rule priorities:
  if (
    isChestRadiation ||
    isColdSweat ||
    isMaxHeadache ||
    isStiffNeck ||
    isRedFlag
  ) {
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
      'Seus sintomas não mostram riscos graves, mas se algo mudar, fale conosco hã qualquer momento.'
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

  return res.json({
    sessaoId: 'local-' + Date.now(),
    classificacao: {
      nivel,
      confianca: 0.95,
      justificativa,
      fatoresDeterminantes
    },
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
  })
})

// --- REAL-TIME TRIAGE QUEUE STORAGE & APIS ---
// QueuePatient type is imported from ./src/TriageContracts.ts (shared contract)

// Pre-seeded waiting list to feel realistic
let triageQueue: QueuePatient[] = [
  {
    id: 'p_1',
    name: 'Maria Silva Santos',
    age: 68,
    color: 'red',
    title: 'Vermelho - Emergência',
    status: 'em_atendimento',
    joinedAt: new Date(Date.now() - 32 * 60 * 1000).toISOString()
  },
  {
    id: 'p_2',
    name: 'Carlos Henrique Souza',
    age: 54,
    color: 'orange',
    title: 'Laranja - Muito urgente',
    status: 'chamado',
    joinedAt: new Date(Date.now() - 14 * 60 * 1000).toISOString()
  },
  {
    id: 'p_3',
    name: 'Ana Beatriz Ramos',
    age: 29,
    color: 'yellow',
    title: 'Amarelo - Urgente',
    status: 'aguardando',
    joinedAt: new Date(Date.now() - 42 * 60 * 1000).toISOString()
  },
  {
    id: 'p_4',
    name: 'Jorge de Oliveira',
    age: 33,
    color: 'green',
    title: 'Verde - Pouco urgente',
    status: 'aguardando',
    joinedAt: new Date(Date.now() - 65 * 60 * 1000).toISOString()
  },
  {
    id: 'p_5',
    name: 'Francisca Maria',
    age: 72,
    color: 'green',
    title: 'Verde - Pouco urgente',
    status: 'aguardando',
    joinedAt: new Date(Date.now() - 85 * 60 * 1000).toISOString()
  }
]

function mapColorToEnglish(
  color: string
): 'red' | 'orange' | 'yellow' | 'green' | 'blue' {
  const norm = (color || '').toLowerCase().trim()
  if (norm === 'vermelho' || norm === 'red') return 'red'
  if (norm === 'laranja' || norm === 'orange') return 'orange'
  if (norm === 'amarelo' || norm === 'yellow') return 'yellow'
  if (norm === 'verde' || norm === 'green') return 'green'
  if (norm === 'azul' || norm === 'blue') return 'blue'
  return 'green' // standard fallback
}

function getSortedQueue(): QueuePatient[] {
  const activeStates = triageQueue.filter(
    p =>
      p.status === 'em_atendimento' ||
      p.status === 'chamado' ||
      p.status === 'atendido_urgente'
  )
  const waitingStates = triageQueue.filter(p => p.status === 'aguardando')

  const colorWeight: Record<string, number> = {
    red: 1,
    vermelho: 1,
    orange: 2,
    laranja: 2,
    yellow: 3,
    amarelo: 3,
    green: 4,
    verde: 4,
    blue: 5,
    azul: 5
  }

  waitingStates.sort((a, b) => {
    const wA = colorWeight[a.color] ?? 99
    const wB = colorWeight[b.color] ?? 99
    if (wA !== wB) return wA - wB // Lower weight = Higher clinical priority (Red 1, Yellow 3, Green 4, etc.)
    return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime() // Older first
  })

  // Assign sequential position for the "aguardando" waiting states
  const waitingWithPos = waitingStates.map((p, index) => ({
    ...p,
    position: index + 1
  }))

  // Returns all patients with clear queue positions where applicable
  return [...activeStates.map(p => ({ ...p, position: 0 })), ...waitingWithPos]
}

// API Route: Submit patient details to the triage queue
app.post('/api/triage/queue/submit', (req, res) => {
  const { name, age, color, title } = req.body ?? {}
  const patientName = name && name.trim() ? name.trim() : 'Paciente Sem Nome'
  const mappedColor = mapColorToEnglish(color)

  // Check if patient already exists in the waiting list to avoid duplicates
  const existingIdx = triageQueue.findIndex(
    p => p.name.toLowerCase() === patientName.toLowerCase()
  )

  if (existingIdx !== -1) {
    triageQueue[existingIdx] = {
      ...triageQueue[existingIdx],
      color: mappedColor,
      title,
      age: age || 40,
      joinedAt: new Date().toISOString()
    }
    return res.json({
      success: true,
      queue: getSortedQueue(),
      patient: triageQueue[existingIdx]
    })
  }

  const isUrgent = mappedColor === 'red' || mappedColor === 'orange'
  const newPatient: QueuePatient = {
    id: 'p_' + Math.random().toString(36).substr(2, 9),
    name: patientName,
    age: age || 40,
    color: mappedColor,
    title,
    status: isUrgent ? 'atendido_urgente' : 'aguardando',
    joinedAt: new Date().toISOString()
  }

  triageQueue.push(newPatient)

  res.json({
    success: true,
    queue: getSortedQueue(),
    patient: newPatient
  })
})

// API Route: Fetch current triage list in real-time
app.get('/api/triage/queue', (req, res) => {
  res.json({ queue: getSortedQueue() })
})

// API Route: Simulate triage queue progression (real-time movement check)
app.post('/api/triage/queue/advance', (req, res) => {
  // 1. Remove the patient who is currently "em_atendimento" (fully served)
  triageQueue = triageQueue.filter(p => p.status !== 'em_atendimento')

  // 2. Transgress "chamado" into "em_atendimento"
  triageQueue.forEach(p => {
    if (p.status === 'chamado') {
      p.status = 'em_atendimento'
    }
  })

  // 3. Promote the highest-priority "aguardando" patient to "chamado"
  const sorted = getSortedQueue()
  const firstWaiting = sorted.find(p => p.status === 'aguardando')
  if (firstWaiting) {
    const originalPatient = triageQueue.find(p => p.id === firstWaiting.id)
    if (originalPatient) {
      originalPatient.status = 'chamado'
    }
  }

  // 4. If the queue is running thin, seed a synthetic patient so there is continuous movement
  if (triageQueue.length < 4) {
    const randomFirstNames = [
      'Roberta',
      'Gisele',
      'Otávio',
      'Felipe',
      'Rosângela',
      'Julio',
      'Milena'
    ]
    const randomLastNames = [
      'Guedes',
      'Pinheiro',
      'Lima',
      'Moraes',
      'Teixeira',
      'Mendes',
      'Ribeiro'
    ]
    const randomColors: Array<'yellow' | 'green' | 'blue'> = [
      'yellow',
      'green',
      'green',
      'blue'
    ]
    const name = `${randomFirstNames[Math.floor(Math.random() * randomFirstNames.length)]} ${randomLastNames[Math.floor(Math.random() * randomLastNames.length)]}`
    const color = randomColors[Math.floor(Math.random() * randomColors.length)]
    triageQueue.push({
      id: 'p_synthetic_' + Math.random().toString(36).substr(2, 9),
      name,
      age: Math.floor(Math.random() * 45) + 20,
      color,
      title:
        color === 'yellow'
          ? 'Amarelo - Urgente'
          : color === 'green'
            ? 'Verde - Pouco urgente'
            : 'Azul - Não urgente',
      status: 'aguardando',
      joinedAt: new Date(
        Date.now() - Math.floor(Math.random() * 30) * 60000
      ).toISOString()
    })
  }

  res.json({ success: true, queue: getSortedQueue() })
})

// Serves client assets
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    // Development mode
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    })
    app.use(vite.middlewares)
  } else {
    // Production mode
    const distPath = path.join(process.cwd(), 'dist')
    app.use(express.static(distPath))
    app.get('/*splat', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'))
    })
  }

  app.listen(PORT, '0.0.0.0', (err?: Error) => {
    if (err) throw err
    console.log(`🚀 Servidor full-stack rodando na porta ${PORT}`)
  })
}

startServer()
