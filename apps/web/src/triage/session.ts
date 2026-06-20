import { useReducer } from 'react'
import type {
  AlertaEmergencia,
  AnalisarRelatoResponse,
  ClassificarResponse,
  DadosPaciente,
  PerguntaAdaptativa,
  RedFlag,
  Relato,
  RespostaAdaptativa,
  SessaoTriagem,
  SinaisVitais,
  SintomaExtraido
} from '@medical/contracts'

export const initialSession: SessaoTriagem = {
  paciente: {},
  sintomasIdentificados: [],
  redFlags: [],
  perguntas: [],
  respostas: []
}

type Action =
  | { type: 'patient'; value: Partial<DadosPaciente> }
  | { type: 'report'; value: Relato }
  | { type: 'analysis'; value: AnalisarRelatoResponse }
  | { type: 'answer'; value: RespostaAdaptativa }
  | { type: 'pain'; value: number | undefined }
  | { type: 'vitals'; value: SinaisVitais | undefined }
  | { type: 'result'; value: ClassificarResponse }
  | { type: 'reset' }

export function triageSessionReducer(
  state: SessaoTriagem,
  action: Action
): SessaoTriagem {
  switch (action.type) {
    case 'patient':
      return { ...state, paciente: { ...state.paciente, ...action.value } }
    case 'report':
      return {
        ...state,
        relato: action.value,
        sessaoId: undefined,
        sintomasIdentificados: [],
        redFlags: [],
        perguntas: [],
        respostas: [],
        alertaEmergencia: undefined,
        versaoModeloColetor: undefined,
        resultado: undefined
      }
    case 'analysis':
      return {
        ...state,
        sessaoId: action.value.sessaoId,
        sintomasIdentificados: action.value.sintomasIdentificados,
        redFlags: action.value.redFlags,
        perguntas: action.value.perguntas,
        respostas: [],
        alertaEmergencia: action.value.alertaEmergencia || undefined,
        versaoModeloColetor: action.value.versaoModelo,
        resultado: undefined
      }
    case 'answer':
      return {
        ...state,
        respostas: [
          ...state.respostas.filter(
            answer => answer.perguntaId !== action.value.perguntaId
          ),
          action.value
        ]
      }
    case 'pain':
      return { ...state, nivelDor: action.value }
    case 'vitals':
      return { ...state, sinaisVitais: action.value }
    case 'result':
      return { ...state, resultado: action.value }
    case 'reset':
      return initialSession
  }
}

export function useTriageSession() {
  const [session, dispatch] = useReducer(triageSessionReducer, initialSession)
  return {
    session,
    setPatient: (value: Partial<DadosPaciente>) =>
      dispatch({ type: 'patient', value }),
    setReport: (value: Relato) => dispatch({ type: 'report', value }),
    setAnalysis: (value: AnalisarRelatoResponse) =>
      dispatch({ type: 'analysis', value }),
    setAnswer: (value: RespostaAdaptativa) =>
      dispatch({ type: 'answer', value }),
    setPain: (value: number | undefined) => dispatch({ type: 'pain', value }),
    setVitals: (value: SinaisVitais | undefined) =>
      dispatch({ type: 'vitals', value }),
    setResult: (value: ClassificarResponse) =>
      dispatch({ type: 'result', value }),
    reset: () => dispatch({ type: 'reset' })
  }
}

export function respostaDaPergunta(
  respostas: RespostaAdaptativa[],
  perguntaId: string
) {
  return respostas.find(resposta => resposta.perguntaId === perguntaId)
}

export function descricaoResposta(
  pergunta: PerguntaAdaptativa,
  resposta?: RespostaAdaptativa
): string {
  if (!resposta) return 'Não respondido'
  if (resposta.tipo === 'sim_nao') return resposta.valor ? 'Sim' : 'Não'
  if (resposta.tipo === 'escala') return String(resposta.valor)
  const values =
    resposta.tipo === 'multipla_escolha' ? resposta.valor : [resposta.valor]
  return values
    .map(value => {
      if (!('opcoes' in pergunta)) return value
      return (
        pergunta.opcoes.find(option => option.valor === value)?.rotulo || value
      )
    })
    .join(', ')
}

export type SessionActions = ReturnType<typeof useTriageSession>

export type AnalysisFields = {
  sintomasIdentificados: SintomaExtraido[]
  redFlags: RedFlag[]
  alertaEmergencia?: AlertaEmergencia
}
