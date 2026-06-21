import { useState, useEffect, useRef } from 'react'
import {
  Activity,
  ChevronRight,
  ChevronLeft,
  Mic,
  MicOff,
  PenTool,
  RotateCcw,
  Volume2,
  Heart,
  FileText,
  Flame,
  CheckCircle,
  AlertTriangle,
  PhoneCall,
  Info,
  Moon,
  Sun,
  Edit3,
  ArrowRight,
  ShieldAlert,
  Thermometer,
  Sparkles,
  RefreshCw,
  Smile,
  Meh,
  Frown,
  CalendarClock,
  MapPin
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PatientDetails, SymptomInput, Vitals, ManchesterColor } from './types'
import {
  AlertaEmergencia,
  AnalisarRelatoRequestSchema,
  ClassificarRequestSchema,
  PerguntaAdaptativa,
  RespostaAdaptativa,
  ClassificarResponse,
  Idioma,
  NivelManchester,
  MANCHESTER_ROTULOS,
  SintomaExtraido,
  RedFlag,
  SinaisVitais,
  TriagemFilaSubmitRequestSchema,
  isRespostaPreenchida
} from '@medical/contracts'
import {
  useAnalyzeTriageMutation,
  useClassifyTriageMutation,
  useSubmitTriageQueueMutation,
  useTranscribeMutation,
  useTriageQueue
} from './triage/query'
import { blobToWavBase64 } from './triage/audio'
import { LanguageGate } from './components/LanguageGate'
import { useLocalizedDom } from './i18n-dom'
import { namespaces } from './i18n'

const extractSymptomKeywordsFromText = (
  text: string,
  idioma: Idioma
): string[] => {
  if (!text) return []
  const parts = text.split(/[,.;]|\s+(?:e|ou|and|or)\s+/i)
  const stopWords = new Set([
    'estou',
    'com',
    'uma',
    'um',
    'muito',
    'mais',
    'dor',
    'forte',
    'sentindo',
    'tenho',
    'dias',
    'desde',
    'ha',
    'há',
    'faz',
    'tempo',
    'para',
    'pelo',
    'pela',
    'meu',
    'minha',
    'no',
    'na',
    'nos',
    'nas',
    'de',
    'do',
    'da',
    'dos',
    'das',
    'ele',
    'ela',
    'eles',
    'elas',
    'eu',
    'você',
    'voce',
    'aquele',
    'aquela',
    'bem',
    'ruim',
    'mal',
    'pior',
    'melhor',
    'i',
    'am',
    'with',
    'a',
    'an',
    'the',
    'very',
    'more',
    'pain',
    'strong',
    'feeling',
    'have',
    'days',
    'since',
    'for',
    'my',
    'in',
    'on',
    'of',
    'it',
    'bad',
    'worse',
    'better'
  ])

  const candidates: string[] = []
  const commonSymptoms = [
    'dor de ouvido',
    'dor de cabeça',
    'dor no peito',
    'falta de ar',
    'dor de garganta',
    'dor de barriga',
    'dor nas costas',
    'suor frio',
    'diminuição da audição',
    'perda de audição',
    'pressão alta',
    'febre alta',
    'visão turva',
    'dor abdominal',
    'cefaleia',
    'cafaleia',
    'ear pain',
    'headache',
    'chest pain',
    'shortness of breath',
    'sore throat',
    'stomach pain',
    'back pain',
    'cold sweat',
    'hearing loss',
    'high blood pressure',
    'high fever',
    'blurred vision',
    'abdominal pain'
  ]

  let remainingText = text.toLowerCase()
  for (const s of commonSymptoms) {
    if (remainingText.includes(s)) {
      candidates.push(s)
      remainingText = remainingText.replace(new RegExp(s, 'g'), '')
    }
  }

  parts.forEach(part => {
    const cleaned = part
      .trim()
      .toLowerCase()
      .replace(
        /^(estou com|sinto|sentindo|tenho|com|uma|um|i am|i'm|i feel|feeling|i have|with|a|an)\s+/i,
        ''
      )
      .trim()
    if (cleaned.length > 2) {
      const words = cleaned.split(/\s+/).filter(w => !stopWords.has(w))
      if (words.length > 0) {
        const chipText = words.slice(0, 3).join(' ')
        if (
          chipText &&
          !candidates.some(c => c.includes(chipText) || chipText.includes(c))
        ) {
          candidates.push(chipText)
        }
      }
    }
  })

  return candidates
    .map(c => c.trim())
    .filter(c => c.length > 2)
    .map(c => c.charAt(0).toUpperCase() + c.slice(1))
    .slice(0, 4)
}

export default function App() {
  const { i18n } = useTranslation(namespaces)
  const [idioma, setIdioma] = useState<Idioma | null>(null)
  const activeIdioma = idioma || 'pt-BR'
  useLocalizedDom(idioma)
  const tr = (text: string) =>
    i18n.t(text, {
      ns: namespaces,
      defaultValue: text,
      keySeparator: false
    })

  // Theme state
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false)

  // Flow State
  const [step, setStep] = useState<number>(1)

  // Patient details state
  const [patient, setPatient] = useState<PatientDetails>({
    name: '',
    age: 41,
    sex: ''
  })
  const [ageConfirmed, setAgeConfirmed] = useState<boolean>(false)

  // Consent
  const [hasConsent, setHasConsent] = useState<boolean>(false)

  // Symptoms input state
  const [symptoms, setSymptoms] = useState<SymptomInput>({
    text: '',
    audioLogged: false
  })

  // Voice input remains visible in the existing layout, but is disabled until
  // a real speech-to-text integration is available.
  const [isRecording, setIsRecording] = useState<boolean>(false)
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0)
  const [audioTranscript, setAudioTranscript] = useState<string>('')
  const [hasRecordedAudio, setHasRecordedAudio] = useState<boolean>(false)
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false)

  // AI analysis and adaptive questions state
  const [detectedSymptoms, setDetectedSymptoms] = useState<SintomaExtraido[]>(
    []
  )
  const [adaptiveQuestions, setAdaptiveQuestions] = useState<
    PerguntaAdaptativa[]
  >([])
  const [answers, setAnswers] = useState<RespostaAdaptativa[]>([])
  const [sessionId, setSessionId] = useState<string>('')
  const [collectorRedFlags, setCollectorRedFlags] = useState<RedFlag[]>([])
  const [emergencyAlert, setEmergencyAlert] =
    useState<AlertaEmergencia | null>(null)
  const [collectorModelVersion, setCollectorModelVersion] =
    useState<string>('')

  // Pain indicator state
  const [painLevel, setPainLevel] = useState<number | undefined>(undefined)

  // Vitals state
  const [vitals, setVitals] = useState<Vitals>({
    temperature: '',
    heartRate: '',
    bloodPressure: '',
    saturation: ''
  })

  // Triage Result details
  const [result, setResult] = useState<ClassificarResponse | null>(null)
  const [appointmentConfirmed, setAppointmentConfirmed] =
    useState<boolean>(false)

  // Server state
  const analyzeMutation = useAnalyzeTriageMutation()
  const classifyMutation = useClassifyTriageMutation()
  const submitQueueMutation = useSubmitTriageQueueMutation()
  const transcribeMutation = useTranscribeMutation()
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const queueQuery = useTriageQueue(step === 8)
  const queueList = queueQuery.data?.queue ?? []
  const myQueueItem =
    queueList.find(queuePatient => queuePatient.sessaoId === sessionId) ?? null
  const isClassifying = classifyMutation.isPending
  const isLoadingQueue = submitQueueMutation.isPending

  // Modals / Feedback
  const [emergencyCallModal, setEmergencyCallModal] = useState<boolean>(false)
  const [customToast, setCustomToast] = useState<string | null>(null)

  const [showQuotaModal, setShowQuotaModal] = useState<boolean>(false)
  const [quotaAction, setQuotaAction] = useState<
    'analyze' | 'classify' | 'queue' | null
  >(null)
  const [aiErrorMessage, setAiErrorMessage] = useState<string>(
    'Serviço de IA indisponível no momento.'
  )

  // Sync dark class with document element for tailwind dark: selectors
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDarkMode])

  useEffect(() => {
    document.documentElement.lang = activeIdioma
  }, [activeIdioma])

  useEffect(() => {
    const protectDraft = (event: BeforeUnloadEvent) => {
      if (!patient.name && !symptoms.text && !sessionId) return
      event.preventDefault()
    }
    window.addEventListener('beforeunload', protectDraft)
    return () => window.removeEventListener('beforeunload', protectDraft)
  }, [patient.name, sessionId, symptoms.text])

  useEffect(() => {
    if (queueQuery.error) {
      console.warn(
        'Rede instável ao carregar painel eletrônico:',
        queueQuery.error
      )
    }
  }, [queueQuery.error])

  const submitToTriageQueue = async (clinicalResult: ClassificarResponse) => {
    try {
      const payload = TriagemFilaSubmitRequestSchema.parse({
        sessao: {
          sessaoId: sessionId,
          idioma: activeIdioma,
          paciente: {
            nome: patient.name,
            idade: patient.age,
            sexoBiologico:
              patient.sex === 'male'
                ? 'masculino'
                : patient.sex === 'female'
                  ? 'feminino'
                  : undefined,
            consentimentoLGPD: hasConsent
          },
          relato: { texto: symptoms.text, origem: 'texto' },
          sintomasIdentificados: detectedSymptoms,
          redFlags: collectorRedFlags,
          perguntas: adaptiveQuestions,
          respostas: answers,
          nivelDor: painLevel,
          sinaisVitais: buildVitalsPayload(),
          alertaEmergencia: emergencyAlert || undefined,
          versaoModeloColetor: collectorModelVersion,
          resultado: clinicalResult
        }
      })
      await submitQueueMutation.mutateAsync(payload)
      setStep(8)
      triggerToast(`🚀 ${tr('Dados transmitidos para a Enfermagem & Recepção!')}`)
    } catch (err) {
      console.error('Erro no envio para recepção:', err)
      setAiErrorMessage(
        err instanceof Error
          ? err.message
          : tr('Não foi possível transmitir a ficha.')
      )
      setQuotaAction('queue')
      setShowQuotaModal(true)
    }
  }

  const simulateQueueAdvance = () => {
    triggerToast(tr('A fila é atualizada automaticamente a cada 5 segundos.'))
  }

  const getManchesterColorClass = (color: string) => {
    switch (color) {
      case 'vermelho':
      case 'red':
        return 'bg-red-500 animate-pulse'
      case 'laranja':
      case 'orange':
        return 'bg-orange-500'
      case 'amarelo':
      case 'yellow':
        return 'bg-yellow-500'
      case 'verde':
      case 'green':
        return 'bg-emerald-500'
      case 'azul':
      case 'blue':
        return 'bg-blue-500'
      default:
        return 'bg-slate-400'
    }
  }

  const maskPatientName = (nameString: string) => {
    if (!nameString) return activeIdioma === 'en' ? 'Patient' : 'Paciente'
    const parts = nameString.split(' ')
    if (parts.length === 1) {
      return nameString.substring(0, 3) + '***'
    }
    return parts[0] + ' ' + parts[parts.length - 1][0] + '***'
  }

  // Contador de gravação (apenas exibição). Cap de segurança em 120s.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingSeconds(prev => {
          if (prev >= 120) {
            handleStopRecording()
            return prev
          }
          return prev + 1
        })
      }, 1000)
    } else {
      setRecordingSeconds(0)
    }
    return () => clearInterval(interval)
  }, [isRecording])

  // Toast auto-clear
  useEffect(() => {
    if (customToast) {
      const t = setTimeout(() => setCustomToast(null), 3500)
      return () => clearTimeout(t)
    }
  }, [customToast])

  const triggerToast = (message: string) => {
    setCustomToast(message)
  }

  const stopMediaStream = () => {
    mediaStreamRef.current?.getTracks().forEach(track => track.stop())
    mediaStreamRef.current = null
  }

  const finalizeRecording = async () => {
    stopMediaStream()
    const chunks = audioChunksRef.current
    audioChunksRef.current = []
    if (chunks.length === 0) {
      triggerToast(tr('Nenhum áudio capturado. Use o campo de texto.'))
      return
    }
    setIsTranscribing(true)
    try {
      const blob = new Blob(chunks, { type: chunks[0].type || 'audio/webm' })
      const audioBase64 = await blobToWavBase64(blob)
      const result = await transcribeMutation.mutateAsync({
        audioBase64,
        formato: 'wav',
        idioma: activeIdioma
      })
      const texto = result.texto.trim()
      if (!texto) {
        triggerToast(
          tr('Não consegui entender o áudio. Tente novamente ou digite.')
        )
        return
      }
      setAudioTranscript(texto)
      setHasRecordedAudio(true)
      setSymptoms(prev => ({
        text: prev.text ? `${prev.text} ${texto}`.trim() : texto,
        audioLogged: true
      }))
      triggerToast(tr('Transcrição pronta — revise e edite se precisar.'))
    } catch (error) {
      triggerToast(
        error instanceof Error
          ? error.message
          : tr('Falha na transcrição. Use o campo de texto.')
      )
    } finally {
      setIsTranscribing(false)
    }
  }

  const startVoiceRecording = async () => {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      triggerToast(
        tr('Gravação por voz não suportada aqui. Use o campo de texto.')
      )
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      audioChunksRef.current = []
      const recorder = new MediaRecorder(stream)
      recorder.ondataavailable = event => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        void finalizeRecording()
      }
      mediaRecorderRef.current = recorder
      setAudioTranscript('')
      setHasRecordedAudio(false)
      recorder.start()
      setIsRecording(true)
    } catch {
      stopMediaStream()
      triggerToast(
        tr('Não foi possível acessar o microfone. Use o campo de texto.')
      )
    }
  }

  const handleStopRecording = () => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop() // dispara onstop -> finalizeRecording
    } else {
      stopMediaStream()
    }
    setIsRecording(false)
  }

  const handleRestartRecording = () => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    stopMediaStream()
    audioChunksRef.current = []
    setRecordingSeconds(0)
    setAudioTranscript('')
    setHasRecordedAudio(false)
    setIsRecording(false)
    setSymptoms({ text: '', audioLogged: false })
  }

  const togglePlayAudio = () => {
    triggerToast(tr('Reprodução indisponível sem uma gravação real.'))
  }

  // Call the analytical AI API
  const analyzeSymptomsWithAI = async () => {
    const finalQuery = symptoms.text.trim()
    if (!finalQuery) {
      triggerToast(
        tr(
          'Por favor, relate o que está sentindo por texto ou áudio antes de prosseguir.'
        )
      )
      return
    }

    setStep(3) // transition step

    try {
      const payload = AnalisarRelatoRequestSchema.parse({
        idioma: activeIdioma,
        paciente: {
          nome: patient.name,
          idade: patient.age,
          sexoBiologico:
            patient.sex === 'male'
              ? 'masculino'
              : patient.sex === 'female'
                ? 'feminino'
                : undefined,
          consentimentoLGPD: hasConsent
        },
        relato: {
          texto: finalQuery,
          origem: 'texto'
        }
      })
      const data = await analyzeMutation.mutateAsync(payload)
      setSessionId(data.sessaoId)
      setDetectedSymptoms(data.sintomasIdentificados)
      setCollectorRedFlags(data.redFlags)
      setAdaptiveQuestions(data.perguntas)
      setAnswers([])
      setEmergencyAlert(data.alertaEmergencia || null)
      setCollectorModelVersion(data.versaoModelo)
      setStep(4)
    } catch (error) {
      setAiErrorMessage(
        error instanceof Error
          ? error.message
          : tr('Serviço de IA indisponível no momento.')
      )
      setQuotaAction('analyze')
      setShowQuotaModal(true)
      setStep(2)
    }
  }

  const buildVitalsPayload = (): SinaisVitais | undefined => {
    const pressure = vitals.bloodPressure
      ? vitals.bloodPressure.split(/[/x]/).map(value => parseInt(value))
      : []
    const payload: SinaisVitais = {}
    if (vitals.temperature)
      payload.temperaturaC = parseFloat(vitals.temperature.replace(',', '.'))
    if (vitals.heartRate)
      payload.freqCardiacaBpm = parseInt(vitals.heartRate)
    if (pressure.length === 2 && pressure.every(Number.isFinite)) {
      payload.pressaoSistolica = pressure[0]
      payload.pressaoDiastolica = pressure[1]
    }
    if (vitals.saturation) payload.spo2 = parseInt(vitals.saturation)
    return Object.keys(payload).length > 0 ? payload : undefined
  }

  const resolvePainLevel = (): number | undefined => {
    const painAnswer = answers.find(answer => {
      const question = adaptiveQuestions.find(q => q.id === answer.perguntaId)
      return (
        answer.tipo === 'escala' &&
        /dor|intensidade|pain|severity|intensity/i.test(
          question?.pergunta || ''
        )
      )
    })
    return painAnswer?.tipo === 'escala' ? painAnswer.valor : painLevel
  }

  // Call the classification API
  const classifyTriageLevel = async () => {
    const missingRequired = adaptiveQuestions.filter(
      question =>
        question.obrigatoria &&
        !isRespostaPreenchida(
          question,
          answers.find(answer => answer.perguntaId === question.id)
        )
    )
    if (missingRequired.length > 0) {
      triggerToast(
        activeIdioma === 'en'
          ? `Answer the ${missingRequired.length} required question(s) before continuing.`
          : `Responda as ${missingRequired.length} pergunta(s) obrigatória(s) antes de continuar.`
      )
      setStep(4)
      return
    }

    setStep(7) // Jump straight to results wait

    try {
      const payload = ClassificarRequestSchema.parse({
        sessaoId: sessionId,
        idioma: activeIdioma,
        paciente: {
          nome: patient.name,
          idade: patient.age,
          sexoBiologico:
            patient.sex === 'male'
              ? 'masculino'
              : patient.sex === 'female'
                ? 'feminino'
                : undefined,
          consentimentoLGPD: hasConsent
        },
        relato: { texto: symptoms.text, origem: 'texto' },
        sintomasIdentificados: detectedSymptoms,
        redFlagsColetor: collectorRedFlags,
        perguntas: adaptiveQuestions,
        respostas: answers,
        nivelDor: resolvePainLevel(),
        sinaisVitais: buildVitalsPayload(),
        versaoModeloColetor: collectorModelVersion
      })
      const data = await classifyMutation.mutateAsync(payload)
      setResult(data)
    } catch (error) {
      setAiErrorMessage(
        error instanceof Error
          ? error.message
          : tr('Serviço de IA indisponível no momento.')
      )
      setQuotaAction('classify')
      setShowQuotaModal(true)
      setStep(6)
    }
  }

  const handleAnswerSelect = (
    qId: string,
    value: boolean | string | string[] | number
  ) => {
    const question = adaptiveQuestions.find(item => item.id === qId)
    if (!question) return
    const answer = {
      perguntaId: qId,
      tipo: question.tipo,
      valor: value
    } as RespostaAdaptativa
    setAnswers(prev => [
      ...prev.filter(item => item.perguntaId !== qId),
      answer
    ])
  }

  // Pain indicator description resolver
  const getPainDescriptor = (level: number) => {
    if (level === 0)
      return {
        emoji: '😊',
        text: activeIdioma === 'en' ? 'No pain' : 'Sem dor',
        color: 'text-slate-400'
      }
    if (level <= 3)
      return {
        emoji: '😐',
        text: activeIdioma === 'en' ? 'Mild' : 'Leve',
        color: 'text-emerald-500'
      }
    if (level <= 6)
      return {
        emoji: '🙁',
        text: activeIdioma === 'en' ? 'Moderate' : 'Moderada',
        color: 'text-yellow-500'
      }
    if (level <= 8)
      return {
        emoji: '😢',
        text: activeIdioma === 'en' ? 'Severe' : 'Forte',
        color: 'text-orange-500'
      }
    return {
      emoji: '😭',
      text: activeIdioma === 'en' ? 'Unbearable' : 'Insuportável',
      color: 'text-red-500 font-extrabold'
    }
  }

  // Manchester color helper utilities
  const getManchesterStyle = (color: string | undefined) => {
    switch (color) {
      case 'vermelho':
        return {
          bg: 'bg-red-600',
          hoverBg: 'hover:bg-red-700',
          text: 'text-red-600',
          border: 'border-red-600',
          softBg: 'bg-red-50 dark:bg-red-950/20',
          softBorder: 'border-red-200 dark:border-red-900/30',
          lightText: 'text-red-700 dark:text-red-300',
          iconBg: 'bg-red-100 dark:bg-red-900/40 text-red-600',
          accentColor: 'bg-red-600 text-white'
        }
      case 'laranja':
        return {
          bg: 'bg-orange-500',
          hoverBg: 'hover:bg-orange-600',
          text: 'text-orange-600',
          border: 'border-orange-500',
          softBg: 'bg-orange-50 dark:bg-orange-950/20',
          softBorder: 'border-orange-200 dark:border-orange-900/30',
          lightText: 'text-orange-700 dark:text-orange-300',
          iconBg: 'bg-orange-100 dark:bg-orange-900/40 text-orange-600',
          accentColor: 'bg-orange-500 text-white'
        }
      case 'amarelo':
        return {
          bg: 'bg-yellow-500',
          hoverBg: 'hover:bg-yellow-600',
          text: 'text-yellow-600',
          border: 'border-yellow-500',
          softBg: 'bg-yellow-50 dark:bg-yellow-950/20',
          softBorder: 'border-yellow-200 dark:border-yellow-900/30',
          lightText: 'text-yellow-700 dark:text-yellow-300',
          iconBg: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-600',
          accentColor: 'bg-yellow-500 text-slate-950'
        }
      case 'verde':
        return {
          bg: 'bg-green-600',
          hoverBg: 'hover:bg-green-700',
          text: 'text-green-600',
          border: 'border-green-600',
          softBg: 'bg-green-50 dark:bg-green-950/20',
          softBorder: 'border-green-200 dark:border-green-900/30',
          lightText: 'text-green-700 dark:text-green-300',
          iconBg: 'bg-green-100 dark:bg-green-900/40 text-green-600',
          accentColor: 'bg-green-600 text-white'
        }
      case 'azul':
        return {
          bg: 'bg-blue-600',
          hoverBg: 'hover:bg-blue-700',
          text: 'text-blue-600',
          border: 'border-blue-600',
          softBg: 'bg-blue-50 dark:bg-blue-950/20',
          softBorder: 'border-blue-200 dark:border-blue-900/30',
          lightText: 'text-blue-700 dark:text-blue-300',
          iconBg: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600',
          accentColor: 'bg-blue-600 text-white'
        }
      default:
        return {
          bg: 'bg-slate-600',
          hoverBg: 'hover:bg-slate-700',
          text: 'text-slate-600',
          border: 'border-slate-600',
          softBg: 'bg-slate-50 dark:bg-slate-800/20',
          softBorder: 'border-slate-200 dark:border-slate-750',
          lightText: 'text-slate-700 dark:text-slate-300',
          iconBg: 'bg-slate-100 dark:bg-slate-800/40 text-slate-600',
          accentColor: 'bg-slate-600 text-white'
        }
    }
  }

  // Reset the entire questionnaire for testing again
  const resetSessionState = () => {
    setStep(1)
    setPatient({ name: '', age: 41, sex: '' })
    setAgeConfirmed(false)
    setHasConsent(false)
    setSymptoms({ text: '', audioLogged: false })
    setAudioTranscript('')
    setHasRecordedAudio(false)
    setAnswers([])
    setDetectedSymptoms([])
    setSessionId('')
    setCollectorRedFlags([])
    setEmergencyAlert(null)
    setCollectorModelVersion('')
    setPainLevel(undefined)
    setVitals({
      temperature: '',
      heartRate: '',
      bloodPressure: '',
      saturation: ''
    })
    setResult(null)
    setAppointmentConfirmed(false)
  }

  const handleResetApp = () => {
    if (
      (patient.name || symptoms.text || sessionId) &&
      !window.confirm(
        tr('Recomeçar apagará os dados desta pré-triagem. Deseja continuar?')
      )
    ) {
      return
    }
    resetSessionState()
    triggerToast(tr('Iniciando nova triagem limpa!'))
  }

  const selectLanguage = (nextIdioma: Idioma) => {
    void i18n.changeLanguage(nextIdioma)
    setIdioma(nextIdioma)
  }

  const handleLanguageChange = (nextIdioma: Idioma) => {
    if (nextIdioma === activeIdioma) return
    if (
      (patient.name || symptoms.text || sessionId) &&
      !window.confirm(
        tr(
          'Alterar o idioma apagará os dados desta pré-triagem. Deseja continuar?'
        )
      )
    ) {
      return
    }
    resetSessionState()
    selectLanguage(nextIdioma)
  }

  if (!idioma) {
    return <LanguageGate onSelect={selectLanguage} />
  }

  return (
    <div
      data-theme={isDarkMode ? 'night' : 'light'}
      className="min-h-screen bg-base-200 text-base-content font-sans transition-colors duration-200 flex flex-col justify-between"
    >
      <div className="fixed right-4 top-4 z-40 flex items-center gap-1 rounded-full border border-base-300 bg-base-100/95 p-1 shadow-lg backdrop-blur">
        {(['pt-BR', 'en'] as const).map(option => (
          <button
            key={option}
            type="button"
            aria-label={
              option === 'pt-BR'
                ? 'Alterar idioma para português'
                : 'Change language to English'
            }
            className={`rounded-full px-3 py-1.5 text-xs font-black transition ${
              activeIdioma === option
                ? 'bg-primary text-primary-content'
                : 'text-base-content/60 hover:bg-base-200'
            }`}
            onClick={() => handleLanguageChange(option)}
          >
            {option === 'pt-BR' ? 'PT' : 'EN'}
          </button>
        ))}
      </div>

      {/* Toast Notification */}
      {customToast && (
        <div
          id="ai_toast"
          className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-6 py-3 rounded-full text-sm font-semibold shadow-2xl flex items-center gap-3 animate-bounce"
        >
          <Sparkles className="w-4 h-4 text-amber-500" />
          <span>{customToast}</span>
        </div>
      )}

      {/* Quota Exceeded Modal */}
      {showQuotaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-base-100 p-6 rounded-3xl shadow-2xl max-w-sm w-full space-y-4">
            <div className="w-14 h-14 bg-orange-100 dark:bg-orange-900/40 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-2">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold text-center text-slate-800 dark:text-white">
              Serviço de IA Indisponível
            </h3>
            <p className="text-center text-sm text-slate-500 dark:text-slate-400">
              {aiErrorMessage} Nenhuma pergunta ou classificação foi criada
              localmente. Seus dados continuam preenchidos para uma nova
              tentativa.
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => {
                  setShowQuotaModal(false)
                  if (quotaAction === 'analyze') {
                    void analyzeSymptomsWithAI()
                  } else if (quotaAction === 'classify') {
                    void classifyTriageLevel()
                  } else if (quotaAction === 'queue' && result) {
                    void submitToTriageQueue(result)
                  }
                }}
                className="w-full btn btn-primary text-primary-content h-12 rounded-xl text-sm font-bold cursor-pointer"
              >
                Tentar Novamente
              </button>
              <button
                onClick={() => setShowQuotaModal(false)}
                className="w-full btn btn-ghost text-base-content h-12 rounded-xl text-sm font-bold cursor-pointer"
              >
                Voltar para Editar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Patient Flow Container - IMMERSIVE FULL SCREEN layout */}
      <main className="flex-1 w-full min-h-screen flex flex-col justify-stretch">
        {/* Full screen workspace seamless look that stretches completely */}
        <div
          id="main_flow_card"
          className="w-full flex-1 bg-base-100 overflow-y-auto flex flex-col relative p-4 sm:p-6 md:p-8"
        >
          {/* Progress Indicator Header (Only active for stages before output outcome) */}
          {step < 7 && (
            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <span
                  className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest"
                  id="step_indicator_label"
                >
                  {activeIdioma === 'en'
                    ? `Step ${step} of 6`
                    : `Passo ${step} de 6`}
                </span>
                <span
                  className="text-xs text-blue-500 font-semibold"
                  id="assistente_status"
                >
                  Assistente de triagem ativo
                </span>
              </div>

              {/* Dynamic progress bar */}
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  id="progress_bar_fill"
                  className="bg-blue-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${(step / 6) * 100}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* STAGE SWITCH ROUTES */}

          {/* ETAPA 1: Identificação Rápida */}
          {step === 1 && (
            <div id="step_1_id" className="space-y-6">
              <div className="p-4 bg-primary/10 dark:bg-primary/15 rounded-2xl flex items-start gap-3.5 border border-primary/20 dark:border-primary/30 shadow-xs">
                <span className="text-2xl mt-0.5">👋</span>
                <div>
                  <h3 className="font-black text-primary text-sm">
                    Olá! Sou seu assistente de triagem
                  </h3>
                  <p className="text-xs text-base-content/90 mt-1 font-medium">
                    Vou ajudar a organizar o seu atendimento médico com
                    antecedência. Leva menos de 3 minutos e você pode corrigir
                    as respostas se necessário.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <h2
                  className="text-2xl font-bold tracking-tight text-slate-800 dark:text-white"
                  id="title_step_1"
                >
                  Vamos começar — como podemos te chamar?
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Insira o seu nome de identificação rápida para o chamado do
                  hospital.
                </p>
              </div>

              <div className="space-y-5">
                <div>
                  <label
                    htmlFor="patient_name"
                    className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2"
                  >
                    Seu nome completo ou social
                  </label>
                  <input
                    id="patient_name"
                    name="patientName"
                    type="text"
                    autoComplete="name"
                    value={patient.name}
                    onChange={e =>
                      setPatient(prev => ({ ...prev, name: e.target.value }))
                    }
                    className="w-full input input-bordered bg-base-200 text-base-content border-base-300 p-4 h-14 rounded-2xl text-base font-semibold focus:input-primary focus:outline-hidden"
                    placeholder="Ex: William Costa"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">
                    Sua idade atual
                  </label>

                  {/* Stepper for Age */}
                  <div className="flex items-center gap-4">
                    <button
                      id="decrement_age"
                      type="button"
                      onClick={() =>
                        setPatient(prev => {
                          setAgeConfirmed(true)
                          return {
                            ...prev,
                            age: Math.max(1, prev.age - 1)
                          }
                        })
                      }
                      className="w-12 h-12 bg-base-300 text-base-content hover:opacity-80 rounded-full flex items-center justify-center font-bold text-xl transition select-none cursor-pointer"
                    >
                      －
                    </button>

                    <div className="flex-1 p-4 bg-base-200 border border-base-300 rounded-2xl flex items-center justify-center gap-2">
                      <span
                        className="text-2xl font-bold text-base-content"
                        id="displayed_age"
                      >
                        {patient.age}
                      </span>
                      <span className="text-sm text-slate-500 dark:text-slate-400">
                        {patient.age === 1 ? 'ano de idade' : 'anos de idade'}
                      </span>
                    </div>

                    <button
                      id="increment_age"
                      type="button"
                      onClick={() =>
                        setPatient(prev => {
                          setAgeConfirmed(true)
                          return {
                            ...prev,
                            age: Math.min(125, prev.age + 1)
                          }
                        })
                      }
                      className="w-12 h-12 bg-base-300 text-base-content hover:opacity-80 rounded-full flex items-center justify-center font-bold text-xl transition select-none cursor-pointer"
                    >
                      ＋
                    </button>
                  </div>

                  {/* Range Slider for Age */}
                  <div className="mt-4 px-2">
                    <input
                      id="age_range_slider"
                      name="patientAge"
                      type="range"
                      min="1"
                      max="125"
                      value={patient.age}
                      onChange={e =>
                        setPatient(prev => {
                          setAgeConfirmed(true)
                          return {
                            ...prev,
                            age: parseInt(e.target.value) || 1
                          }
                        })
                      }
                      className="range range-primary range-sm w-full"
                    />
                    <div className="flex justify-between text-[10px] uppercase font-bold tracking-wider text-slate-400 mt-1">
                      <span>1 ano</span>
                      <span>60 anos</span>
                      <span>125 anos</span>
                    </div>
                  </div>

                  {/* Sex Selection */}
                  <div className="mt-8">
                    <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">
                      Sexo biológico
                    </label>
                    <div className="flex gap-4">
                      {['male', 'female'].map(sex => (
                        <button
                          key={sex}
                          type="button"
                          onClick={() =>
                            setPatient(prev => ({
                              ...prev,
                              sex: sex as 'male' | 'female'
                            }))
                          }
                          className={`flex-1 p-4 rounded-2xl font-bold text-sm border-2 transition ${
                            patient.sex === sex
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-base-300 bg-base-100 hover:bg-base-200'
                          }`}
                        >
                          {sex === 'male' ? 'Masculino' : 'Feminino'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Consent Checkbox */}
              <div className="pt-2">
                <label className="flex items-start gap-3 cursor-pointer p-4 bg-base-200 border border-base-300 rounded-2xl hover:bg-base-200/80 transition">
                  <input
                    type="checkbox"
                    checked={hasConsent}
                    onChange={e => setHasConsent(e.target.checked)}
                    className="checkbox checkbox-primary mt-0.5 shrink-0"
                  />
                  <div>
                    <span className="text-sm font-bold text-base-content block">
                      Termos de Uso e LGPD
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 block mt-1 leading-relaxed border-t border-base-300 pt-2 pb-0">
                      Concordo que meus dados sensíveis de saúde sejam coletados
                      e analisados para fins exclusivos de triagem e
                      inteligência artificial pelo applet.
                    </span>
                  </div>
                </label>
              </div>

              {/* Warnings & Continue */}
              <div className="pt-4 border-t border-base-300 flex flex-col gap-4">
                <button
                  id="btn_step_1_continue"
                  type="button"
                  disabled={!patient.name.trim() || !hasConsent || !ageConfirmed}
                  onClick={() => setStep(2)}
                  className="w-full btn btn-primary text-primary-content h-14 rounded-2xl font-bold text-lg transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-40"
                >
                  Continuar
                  <ChevronRight className="w-5 h-5" />
                </button>
                <p className="text-[10px] text-center text-slate-400 leading-normal">
                  ⚠️ Importante: Esta é uma ferramenta de triagem para ordenação
                  rápida de fila de espera. Nossas análises não substituem uma
                  avaliação médica em consultório.
                </p>
              </div>
            </div>
          )}

          {/* ETAPA 2: Como você está se sentindo? (Modos Voz e Escrita) */}
          {step === 2 && (
            <div id="step_2_symptoms" className="space-y-6">
              <div className="space-y-2">
                <h2
                  className="text-2xl font-bold tracking-tight text-slate-800 dark:text-white"
                  id="title_step_2"
                >
                  Como você está se sentindo?
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-normal">
                  Fale ou escreva com as suas próprias palavras. Não se preocupe
                  em saber nomes médicos, explique como se estivesse conversando
                  com um amigo.
                </p>
              </div>

              {/* Mode Selector Panel (Foco Inclusivo) */}
              <div className="space-y-4">
                {/* Visual Option Box: VOICE RECORDING (Destaque Proeminente por Inclusão) */}
                {!hasRecordedAudio && !isRecording && !isTranscribing && (
                  <button
                    onClick={startVoiceRecording}
                    id="btn_mode_audio"
                    className="w-full p-6 bg-primary/10 hover:bg-primary/15 dark:bg-primary/15 dark:hover:bg-primary/20 border-2 border-primary/20 dark:border-primary/30 rounded-3xl text-left transition flex items-center gap-4 cursor-pointer"
                  >
                    <div className="w-14 h-14 bg-primary rounded-full flex items-center justify-center text-primary-content shrink-0 shadow-md">
                      <Mic className="w-7 h-7" />
                    </div>
                    <div>
                      <span className="bg-primary/20 text-primary px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-widest mb-1.5 inline-block">
                        RECOMENDADO
                      </span>
                      <h3 className="font-bold text-base-content text-base">
                        Falar o que estou sentindo
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Melhor se você estiver com dor forte, pressa, ou
                        preferir ditar.
                      </p>
                    </div>
                  </button>
                )}

                {/* ACTIVE RECORDING PANEL */}
                {isRecording && (
                  <div className="p-6 bg-base-200 dark:bg-slate-800/20 border-2 border-base-300 dark:border-slate-800 rounded-3xl flex flex-col items-center space-y-5">
                    <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-bold text-xs uppercase tracking-widest">
                      <div className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                      </div>
                      <span>
                        Estou gravando... 0:
                        {recordingSeconds < 10
                          ? `0${recordingSeconds}`
                          : recordingSeconds}
                      </span>
                    </div>

                    {/* Animated Waveform Simulation */}
                    <div
                      className="flex items-center justify-center gap-1 h-14 opacity-50"
                      id="audio_waveform"
                    >
                      <span className="w-1.5 h-8 bg-slate-400 dark:bg-slate-500 rounded-full animate-pulse"></span>
                      <span className="w-1.5 h-12 bg-slate-500 dark:bg-slate-400 rounded-full animate-bounce"></span>
                      <span className="w-1.5 h-6 bg-slate-400 dark:bg-slate-500 rounded-full animate-pulse"></span>
                      <span className="w-1.5 h-14 bg-slate-500 dark:bg-slate-400 rounded-full animate-bounce"></span>
                      <span className="w-1.5 h-10 bg-slate-400 dark:bg-slate-500 rounded-full animate-pulse"></span>
                      <span className="w-1.5 h-5 bg-slate-500 dark:bg-slate-400 rounded-full animate-bounce"></span>
                    </div>

                    <p className="text-xs text-center text-slate-500 dark:text-slate-400 px-4">
                      <i>
                        Contando sobre os seus sintomas: o local, o tipo de dor
                        e quando começou.
                      </i>
                    </p>

                    <div className="grid grid-cols-2 gap-3 w-full">
                      <button
                        onClick={handleRestartRecording}
                        className="p-3 bg-base-300 text-base-content hover:opacity-80 font-bold rounded-xl text-xs transition cursor-pointer"
                      >
                        Recomeçar
                      </button>

                      <button
                        onClick={handleStopRecording}
                        className="p-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition shadow-sm cursor-pointer"
                      >
                        Finalizar e ouvir
                      </button>
                    </div>
                  </div>
                )}

                {/* TRANSCRIBING (Qwen-Audio ASR) */}
                {isTranscribing && (
                  <div
                    id="transcribing_panel"
                    className="p-6 bg-base-200 border-2 border-base-300 rounded-3xl flex flex-col items-center space-y-3"
                  >
                    <span className="loading loading-dots loading-md text-primary"></span>
                    <p className="text-sm font-bold text-base-content">
                      Transcrevendo seu áudio com a IA...
                    </p>
                    <p className="text-xs text-center text-slate-500 dark:text-slate-400">
                      Você poderá revisar e editar o texto antes de continuar.
                    </p>
                  </div>
                )}

                {/* COMPLETED RECORDING WITH OPTIONS */}
                {hasRecordedAudio && !isRecording && (
                  <div className="p-5 bg-base-200 border border-base-300 rounded-2xl space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-2">
                        <Mic className="w-3.5 h-3.5 text-blue-500" />
                        Gravação Concluída
                      </span>
                      <button
                        onClick={handleRestartRecording}
                        className="text-xs text-red-500 font-bold flex items-center gap-1 hover:underline cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" /> Excluir áudio
                      </button>
                    </div>

                    {/* Speech bubble player */}
                    <div className="flex items-center gap-3 p-3 bg-base-100 border border-base-300 rounded-xl">
                      <button
                        onClick={togglePlayAudio}
                        className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 hover:scale-105 active:scale-95 transition cursor-pointer"
                      >
                        {isPlayingAudio ? (
                          <span className="w-3 h-3 bg-primary rounded-sm animate-pulse"></span>
                        ) : (
                          <Volume2 className="w-5 h-5" />
                        )}
                      </button>
                      <div className="flex-1">
                        <div className="text-xs font-bold text-slate-400 dark:text-slate-500">
                          {isPlayingAudio
                            ? 'Reproduzindo áudio...'
                            : 'Ouvir gravação original'}
                        </div>
                        <div className="text-xs text-slate-500">
                          Recurso de voz aguardando integração real
                        </div>
                      </div>
                    </div>

                    {/* AI Transcribed display */}
                    <div className="bg-primary/5 dark:bg-primary/10 p-4 border border-primary/20 dark:border-primary/35 rounded-xl">
                      <label className="text-[10px] font-extrabold text-primary uppercase tracking-widest block mb-1">
                        Transcrição automática da IA:
                      </label>
                      <p className="text-sm italic text-base-content/80">
                        "{audioTranscript}"
                      </p>
                    </div>
                  </div>
                )}

                {/* TEXT AREA COMPONENT */}
                {!isRecording && (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label
                        htmlFor="symptoms_textarea"
                        className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider"
                      >
                        Escrever por texto convencional
                      </label>
                      {hasRecordedAudio && (
                        <span className="text-xs text-blue-500 font-medium">
                          Você poderá editar o texto abaixo
                        </span>
                      )}
                    </div>

                    <textarea
                      id="symptoms_textarea"
                      name="symptomReport"
                      autoComplete="off"
                      rows={3}
                      value={symptoms.text}
                      onChange={e => {
                        setSymptoms({
                          text: e.target.value,
                          audioLogged: false
                        })
                        setHasRecordedAudio(false)
                      }}
                      placeholder="Ex: Estou sentindo muita tontura e uma dor incômoda no fundo do peito que começou há cerca de duas horas..."
                      className="textarea textarea-bordered w-full p-4 bg-base-200 border-base-300 text-base-content rounded-2xl text-base focus:textarea-primary focus:outline-hidden"
                    />
                  </div>
                )}
              </div>

              {/* Back & Next Navigation */}
              <div className="pt-4 border-t border-base-300 flex items-center justify-between gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-4.5 bg-base-300 hover:opacity-85 text-base-content rounded-2xl font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5" /> Voltar
                </button>

                <button
                  id="btn_step_2_continue"
                  onClick={analyzeSymptomsWithAI}
                  disabled={!symptoms.text.trim()}
                  className="flex-1 btn btn-primary h-14 text-primary-content rounded-2xl font-bold text-lg transition flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
                >
                  Analisar Queixa
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* ETAPA 3: Calming Transition (IA lendo relatos e montando perguntas) */}
          {step === 3 && (
            <div
              id="step_3_analyzing"
              className="py-12 flex flex-col items-center text-center space-y-6"
            >
              {/* Peaceful breath visual ring */}
              <div className="relative w-24 h-24 flex items-center justify-center">
                <div className="absolute inset-0 bg-primary/20 rounded-full animate-pulse-soft"></div>
                <div className="absolute inset-2 bg-primary/10 rounded-full"></div>
                <div className="relative z-10 w-12 h-12 bg-primary rounded-full flex items-center justify-center text-primary-content shadow-lg">
                  <RefreshCw className="w-6 h-6 animate-spin text-current" />
                </div>
              </div>

              <div className="space-y-2 max-w-sm">
                <h2 className="text-xl font-bold text-slate-800 dark:text-white">
                  Entendendo o que você relatou...
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Estou separando as melhores perguntas adicionais com base nas
                  suas próprias palavras. Fique tranquilo, estamos agilizando
                  tudo.
                </p>
              </div>

              {/* Extracted symptoms preview */}
              <div className="space-y-2 w-full pt-4">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                  Sintomas identificados preliminarmente:
                </span>
                <div className="flex flex-wrap justify-center gap-2">
                  {detectedSymptoms && detectedSymptoms.length > 0
                    ? detectedSymptoms.map((s: any, idx: number) => (
                        <span
                          key={idx}
                          className="px-3.5 py-1.5 bg-primary/10 text-primary border border-primary/20 text-xs font-semibold rounded-full uppercase tracking-wider"
                        >
                          {s.rotulo || s}
                        </span>
                      ))
                    : extractSymptomKeywordsFromText(
                        symptoms.text,
                        activeIdioma
                      ).map(
                        (k: string, idx: number) => (
                          <span
                            key={idx}
                            className="px-3.5 py-1.5 bg-primary/10 text-primary border border-primary/20 text-xs font-semibold rounded-full uppercase tracking-wider"
                          >
                            {k}
                          </span>
                        )
                      )}
                  {(!detectedSymptoms || detectedSymptoms.length === 0) &&
                    extractSymptomKeywordsFromText(
                      symptoms.text,
                      activeIdioma
                    ).length === 0 && (
                      <span className="px-3.5 py-1.5 bg-primary/10 text-primary border border-primary/20 text-xs font-semibold rounded-full uppercase tracking-wider">
                        Processando relato...
                      </span>
                    )}
                </div>
              </div>
            </div>
          )}

          {/* ETAPA 4: Perguntas adaptativas (O Coração da customização inteligente) */}
          {step === 4 && (
            <div id="step_4_adaptive" className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-bold uppercase tracking-widest">
                    Sessão Personalizada Inteligente
                  </span>
                </div>
                <h2
                  className="text-2xl font-bold tracking-tight text-slate-800 dark:text-white"
                  id="title_step_4"
                >
                  Perguntas adicionais de risco
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-normal">
                  Responda de acordo com a sua queixa. Essas alternativas ajudam
                  o hospital a entender a gravidade imediata.
                </p>
              </div>

              {emergencyAlert && (
                <div className="alert alert-error rounded-2xl" role="alert">
                  <AlertTriangle className="w-5 h-5" />
                  <div>
                    <h3 className="font-black">{emergencyAlert.motivo}</h3>
                    <p className="text-xs">{emergencyAlert.acao}</p>
                  </div>
                  <a href="tel:192" className="btn btn-sm">
                    Ligar 192
                  </a>
                </div>
              )}

              {/* Clean Reusable "Cartão de Pergunta" Container */}
              <div className="space-y-5" id="adaptive_questions_list">
                {adaptiveQuestions.map((question, qIdx) => {
                  const currentAnswerObj = answers.find(
                    a => a.perguntaId === question.id
                  )
                  const currentAnswerVal = currentAnswerObj
                    ? currentAnswerObj.valor
                    : null

                  return (
                    <div
                      key={question.id}
                      className="p-5 bg-base-200 border border-base-300 rounded-3xl space-y-4 shadow-xs"
                    >
                      <div className="flex justify-between items-start gap-3">
                        <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                          {activeIdioma === 'en'
                            ? `Question ${qIdx + 1} of ${adaptiveQuestions.length}`
                            : `Pergunta ${qIdx + 1} de ${adaptiveQuestions.length}`}
                        </span>
                        {currentAnswerVal !== null &&
                          currentAnswerVal !== '' &&
                          (!Array.isArray(currentAnswerVal) ||
                            currentAnswerVal.length > 0) && (
                            <span className="text-xs text-emerald-500 font-bold flex items-center gap-1">
                              <CheckCircle className="w-3.5 h-3.5" /> Respondida
                            </span>
                          )}
                      </div>

                      <p className="text-base font-bold text-slate-800 dark:text-white leading-tight">
                        {question.pergunta}
                      </p>

                      {/* Display inputs based on question classification */}
                      {question.tipo === 'sim_nao' && (
                        <div className="flex flex-col gap-3 pt-1">
                          <button
                            onClick={() =>
                              handleAnswerSelect(question.id, true)
                            }
                            className={`p-3.5 rounded-2xl font-bold border-2 text-sm text-center transition flex justify-between items-center cursor-pointer w-full ${
                              currentAnswerVal === true
                                ? 'border-primary bg-primary/10 text-primary dark:text-primary-content font-extrabold'
                                : 'border-base-300 bg-base-100 hover:bg-base-205 text-base-content/80'
                            }`}
                          >
                            <span className="pointer-events-none">Sim</span>
                            <span
                              className={`w-5 h-5 rounded-full border flex items-center justify-center pointer-events-none ${currentAnswerVal === true ? 'border-primary bg-primary' : 'border-base-300'}`}
                            >
                              {currentAnswerVal === true && (
                                <span className="w-2 h-2 bg-primary-content rounded-full pointer-events-none"></span>
                              )}
                            </span>
                          </button>

                          <button
                            onClick={() =>
                              handleAnswerSelect(question.id, false)
                            }
                            className={`p-3.5 rounded-2xl font-bold border-2 text-sm text-center transition flex justify-between items-center cursor-pointer w-full ${
                              currentAnswerVal === false
                                ? 'border-primary bg-primary/10 text-primary dark:text-primary-content font-extrabold'
                                : 'border-base-300 bg-base-100 hover:bg-base-205 text-base-content/80'
                            }`}
                          >
                            <span className="pointer-events-none">Não</span>
                            <span
                              className={`w-5 h-5 rounded-full border flex items-center justify-center pointer-events-none ${currentAnswerVal === false ? 'border-primary bg-primary' : 'border-base-300'}`}
                            >
                              {currentAnswerVal === false && (
                                <span className="w-2 h-2 bg-primary-content rounded-full pointer-events-none"></span>
                              )}
                            </span>
                          </button>
                        </div>
                      )}

                      {question.tipo === 'escolha_unica' && (
                        <div className="space-y-2 pt-1">
                          {(question.opcoes || []).map(option => (
                            <button
                              key={option.valor}
                              onClick={() =>
                                handleAnswerSelect(question.id, option.valor)
                              }
                              className={`w-full p-4.5 rounded-2xl font-bold border-2 text-sm text-left transition flex justify-between items-center cursor-pointer ${
                                currentAnswerVal === option.valor
                                  ? 'border-primary bg-primary/10 text-primary dark:text-primary-content font-extrabold'
                                  : 'border-base-300 bg-base-100 hover:bg-base-205 text-base-content/80'
                              }`}
                            >
                              <span className="pointer-events-none">
                                {option.rotulo}
                              </span>
                              <span
                                className={`w-5 h-5 rounded-full border flex items-center justify-center pointer-events-none ${currentAnswerVal === option.valor ? 'border-primary bg-primary' : 'border-base-300'}`}
                              >
                                {currentAnswerVal === option.valor && (
                                  <span className="w-2 h-2 bg-primary-content rounded-full pointer-events-none"></span>
                                )}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      {question.tipo === 'multipla_escolha' && (
                        <div className="space-y-2 pt-1">
                          {(question.opcoes || []).map(option => {
                            const isSelected =
                              Array.isArray(currentAnswerVal) &&
                              currentAnswerVal.includes(option.valor)
                            return (
                              <button
                                key={option.valor}
                                onClick={() => {
                                  let newArray = Array.isArray(currentAnswerVal)
                                    ? [...currentAnswerVal]
                                    : []
                                  if (isSelected) {
                                    newArray = newArray.filter(
                                      v => v !== option.valor
                                    )
                                  } else {
                                    newArray.push(option.valor)
                                  }
                                  handleAnswerSelect(question.id, newArray)
                                }}
                                className={`w-full p-4.5 rounded-2xl font-bold border-2 text-sm text-left transition flex justify-between items-center cursor-pointer ${
                                  isSelected
                                    ? 'border-primary bg-primary/10 text-primary dark:text-primary-content font-extrabold'
                                    : 'border-base-300 bg-base-100 hover:bg-base-205 text-base-content/80'
                                }`}
                              >
                                <span className="pointer-events-none">
                                  {option.rotulo}
                                </span>
                                <span
                                  className={`w-5 h-5 rounded-md border flex items-center justify-center pointer-events-none ${isSelected ? 'border-primary bg-primary' : 'border-base-300'}`}
                                >
                                  {isSelected && (
                                    <CheckCircle className="w-3.5 h-3.5 text-primary-content pointer-events-none" />
                                  )}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )}

                      {question.tipo === 'escala' && question.escala && (
                        <div className="pt-4 px-2 pb-2 space-y-4 text-center">
                          <label className="text-[10px] font-black uppercase text-slate-400 block tracking-[0.2em] mb-4">
                            Mova o controle deslizante
                          </label>
                          <div className="flex justify-between w-full text-xs font-bold text-slate-500 mb-1 px-1">
                            <span>
                              {question.escala.min}{' '}
                              {question.escala.min === 0 ? '👶🏼' : ''}
                            </span>
                            <span>
                              {question.escala.max}{' '}
                              {question.escala.max === 10 ? '😭' : ''}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={question.escala.min}
                            max={question.escala.max}
                            value={
                              currentAnswerVal !== null &&
                              currentAnswerVal !== undefined &&
                              currentAnswerVal !== ''
                                ? Number(currentAnswerVal)
                                : question.escala.min
                            }
                            onChange={e =>
                              handleAnswerSelect(
                                question.id,
                                parseInt(e.target.value)
                              )
                            }
                            className="range range-xs range-primary w-full cursor-pointer"
                          />
                          <div className="flex justify-between text-[10px] font-bold text-slate-400 w-full px-1.5 mt-1.5 opacity-60">
                            {[
                              ...Array(
                                question.escala.max - question.escala.min + 1
                              )
                            ].map((_, i) => (
                              <span key={i}>|</span>
                            ))}
                          </div>
                          <div className="flex justify-center w-full mt-4">
                            <div className="inline-flex items-center justify-center font-black text-3xl text-primary bg-primary/10 rounded-2xl border border-primary/20 shadow-sm min-w-16 h-16">
                              {currentAnswerVal !== null &&
                              currentAnswerVal !== undefined &&
                              currentAnswerVal !== ''
                                ? currentAnswerVal
                                : question.escala.min}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Control Action footer */}
              <div className="pt-4 border-t border-base-300 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-4 py-4.5 bg-base-300 hover:opacity-85 text-base-content rounded-2xl font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5" /> Voltar
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const missing = adaptiveQuestions.filter(
                      question =>
                        question.obrigatoria &&
                        !isRespostaPreenchida(
                          question,
                          answers.find(
                            answer => answer.perguntaId === question.id
                          )
                        )
                    )
                    if (missing.length > 0) {
                      triggerToast(
                        activeIdioma === 'en'
                          ? `Answer the ${missing.length} required question(s).`
                          : `Responda as ${missing.length} pergunta(s) obrigatória(s).`
                      )
                      return
                    }
                    setStep(5)
                  }}
                  className="flex-1 btn btn-primary h-14 text-primary-content rounded-2xl font-bold text-lg transition flex items-center justify-center gap-1 cursor-pointer"
                >
                  Continuar
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* ETAPA 5: Sinais vitais (Opcionais) */}
          {step === 5 && (
            <div id="step_5_vitals" className="space-y-6">
              {/* Optional Vitals Fields */}
              <div className="space-y-4 pt-1">
                <div className="flex justify-between items-center">
                  <div>
                    <h2
                      className="text-2xl font-bold tracking-tight text-slate-800 dark:text-white"
                      id="title_step_5"
                    >
                      Sinais vitais
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Se você tiver aparelhos por perto, anote abaixo. Caso
                      contrário, apenas continue.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setVitals({
                        temperature: '',
                        heartRate: '',
                        bloodPressure: '',
                        saturation: ''
                      })
                      triggerToast(
                        tr('Você optou por ignorar os sinais vitais.')
                      )
                    }}
                    className="text-xs text-blue-500 hover:underline font-bold"
                  >
                    Pular estes dados
                  </button>
                </div>

                {/* Vitals Inputs Layout Block */}
                <div
                  className="grid grid-cols-1 md:grid-cols-2 gap-4"
                  id="vitals_inputs_grid"
                >
                  {/* Temp */}
                  <div className="p-4 bg-base-200 border border-base-300 rounded-2xl flex flex-col justify-between">
                    <div>
                      <label
                        htmlFor="vital_temp"
                        className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1 items-center gap-1"
                      >
                        <Thermometer className="w-3.5 h-3.5 text-blue-500" />{' '}
                        Temperatura
                      </label>
                      <div className="flex items-center justify-between gap-1.5 border-b border-base-300 pb-2">
                        <input
                          id="vital_temp"
                          name="temperature"
                          type="number"
                          inputMode="decimal"
                          value={vitals.temperature}
                          onChange={e =>
                            setVitals(prev => ({
                              ...prev,
                              temperature: e.target.value
                            }))
                          }
                          placeholder="Ex: 36.5"
                          className="w-full bg-transparent font-bold text-xl text-base-content focus:outline-hidden"
                        />
                        <span className="text-sm font-bold text-slate-400 shrink-0">
                          °C
                        </span>
                      </div>
                    </div>
                    <div className="mt-4">
                      <input
                        type="range"
                        min="34.0"
                        max="42.0"
                        step="0.1"
                        value={parseFloat(vitals.temperature || '') || 36.5}
                        onChange={e =>
                          setVitals(prev => ({
                            ...prev,
                            temperature: e.target.value
                          }))
                        }
                        className="range range-xs range-info w-full"
                      />
                      <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase mt-1">
                        <span>34.0 °C (Hipotermia)</span>
                        <span>42.0 °C (Hipertermia)</span>
                      </div>
                    </div>
                  </div>

                  {/* Heart */}
                  <div className="p-4 bg-base-200 border border-base-300 rounded-2xl flex flex-col justify-between">
                    <div>
                      <label
                        htmlFor="vital_heart"
                        className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1 items-center gap-1"
                      >
                        <Heart className="w-3.5 h-3.5 text-red-500" />{' '}
                        Batimentos Cardíacos
                      </label>
                      <div className="flex items-center justify-between gap-1.5 border-b border-base-300 pb-2">
                        <input
                          id="vital_heart"
                          name="heartRate"
                          type="number"
                          inputMode="numeric"
                          value={vitals.heartRate}
                          onChange={e =>
                            setVitals(prev => ({
                              ...prev,
                              heartRate: e.target.value
                            }))
                          }
                          placeholder="Ex: 80"
                          className="w-full bg-transparent font-bold text-xl text-base-content focus:outline-hidden"
                        />
                        <span className="text-sm font-bold text-slate-400 shrink-0">
                          bpm
                        </span>
                      </div>
                    </div>
                    <div className="mt-4">
                      <input
                        type="range"
                        min="40"
                        max="180"
                        step="1"
                        value={parseInt(vitals.heartRate || '') || 80}
                        onChange={e =>
                          setVitals(prev => ({
                            ...prev,
                            heartRate: e.target.value
                          }))
                        }
                        className="range range-xs range-error w-full"
                      />
                      <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase mt-1">
                        <span>40 bpm (Bradicardia)</span>
                        <span>180 bpm (Taquicardia)</span>
                      </div>
                    </div>
                  </div>

                  {/* Pressão */}
                  <div className="p-4 bg-base-200 border border-base-300 rounded-2xl flex flex-col justify-between">
                    {(() => {
                      const parts = (vitals.bloodPressure || '').split('/')
                      const sVal = parts[0] ? parseInt(parts[0]) || 120 : 120
                      const dVal = parts[1] ? parseInt(parts[1]) || 80 : 80
                      return (
                        <>
                          <div>
                            <label
                              htmlFor="vital_bp"
                              className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1 items-center gap-1"
                            >
                              <Activity className="w-3.5 h-3.5 text-teal-500" />{' '}
                              Pressão Arterial (PA)
                            </label>
                            <div className="flex items-center justify-between gap-1.5 border-b border-base-300 pb-2">
                              <input
                                id="vital_bp"
                                name="bloodPressure"
                                type="text"
                                inputMode="numeric"
                                value={vitals.bloodPressure}
                                onChange={e =>
                                  setVitals(prev => ({
                                    ...prev,
                                    bloodPressure: e.target.value
                                  }))
                                }
                                placeholder="Ex: 120/80"
                                className="w-full bg-transparent font-bold text-xl text-base-content focus:outline-hidden"
                              />
                              <span className="text-sm font-bold text-slate-400 shrink-0">
                                mmHg
                              </span>
                            </div>
                          </div>

                          <div className="mt-4 space-y-3">
                            {/* Systolic Slider */}
                            <div>
                              <div className="flex justify-between text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-0.5">
                                <span>Sistólica (Máx): {sVal}</span>
                              </div>
                              <input
                                type="range"
                                min="80"
                                max="200"
                                step="1"
                                value={sVal}
                                onChange={e => {
                                  const val = parseInt(e.target.value) || 120
                                  setVitals(prev => {
                                    const p = (prev.bloodPressure || '').split(
                                      '/'
                                    )
                                    const currentDia = p[1]
                                      ? parseInt(p[1]) || 80
                                      : 80
                                    return {
                                      ...prev,
                                      bloodPressure: `${val}/${currentDia}`
                                    }
                                  })
                                }}
                                className="range range-xs range-accent w-full"
                              />
                            </div>

                            {/* Diastolic Slider */}
                            <div>
                              <div className="flex justify-between text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-0.5">
                                <span>Diastólica (Mín): {dVal}</span>
                              </div>
                              <input
                                type="range"
                                min="40"
                                max="120"
                                step="1"
                                value={dVal}
                                onChange={e => {
                                  const val = parseInt(e.target.value) || 80
                                  setVitals(prev => {
                                    const p = (prev.bloodPressure || '').split(
                                      '/'
                                    )
                                    const currentSys = p[0]
                                      ? parseInt(p[0]) || 120
                                      : 120
                                    return {
                                      ...prev,
                                      bloodPressure: `${currentSys}/${val}`
                                    }
                                  })
                                }}
                                className="range range-xs range-accent w-full"
                              />
                            </div>
                          </div>
                        </>
                      )
                    })()}
                  </div>

                  {/* Oxigenação */}
                  <div className="p-4 bg-base-200 border border-base-300 rounded-2xl flex flex-col justify-between">
                    <div>
                      <label
                        htmlFor="vital_sat"
                        className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1 items-center gap-1"
                      >
                        <Info className="w-3.5 h-3.5 text-indigo-500" />{' '}
                        Saturação de Oxigênio (SpO2)
                      </label>
                      <div className="flex items-center justify-between gap-1.5 border-b border-base-300 pb-2">
                        <input
                          id="vital_sat"
                          name="oxygenSaturation"
                          type="number"
                          inputMode="numeric"
                          value={vitals.saturation}
                          onChange={e =>
                            setVitals(prev => ({
                              ...prev,
                              saturation: e.target.value
                            }))
                          }
                          placeholder="Ex: 98"
                          className="w-full bg-transparent font-bold text-xl text-base-content focus:outline-hidden"
                        />
                        <span className="text-sm font-bold text-slate-400 shrink-0">
                          %
                        </span>
                      </div>
                    </div>
                    <div className="mt-4">
                      <input
                        type="range"
                        min="70"
                        max="100"
                        step="1"
                        value={parseInt(vitals.saturation || '') || 98}
                        onChange={e =>
                          setVitals(prev => ({
                            ...prev,
                            saturation: e.target.value
                          }))
                        }
                        className="range range-xs range-primary w-full"
                      />
                      <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase mt-1">
                        <span>70% (Grave)</span>
                        <span>100% (Excelente)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Back & Next Navigation */}
              <div className="pt-4 border-t border-base-300 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="px-4 py-4.5 bg-base-300 hover:opacity-85 text-base-content rounded-2xl font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5" /> Voltar
                </button>

                <button
                  type="button"
                  onClick={() => setStep(6)} // Go to review page
                  className="flex-1 btn btn-primary h-14 text-primary-content rounded-2xl font-bold text-lg transition flex items-center justify-center gap-1 cursor-pointer"
                >
                  Revisar Respostas
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* ETAPA 6: Checkpoint / Revisão (O paciente confirma antes de enviar) */}
          {step === 6 && (
            <div id="step_6_review" className="space-y-6">
              <div className="space-y-2">
                <h2
                  className="text-2xl font-bold tracking-tight text-slate-800 dark:text-white"
                  id="title_step_6"
                >
                  Confira antes de enviar
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Dê uma olhada se está tudo correto. Você pode ajustar qualquer
                  item se preferir.
                </p>
              </div>

              {/* Structured Checklist blocks with edit links */}
              <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
                {/* Paciente Dados */}
                <div className="p-4 bg-base-200 rounded-2xl border border-base-300 flex justify-between items-center transition hover:bg-base-200/80">
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                      DADOS DO PACIENTE
                    </span>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block">
                      {patient.name}, {patient.age} anos
                    </span>
                  </div>
                  <button
                    onClick={() => setStep(1)}
                    className="p-2 text-blue-600 dark:text-blue-400 hover:bg-base-100 rounded-lg flex items-center gap-1 text-xs font-bold transition cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Editar
                  </button>
                </div>

                {/* Queixa principal */}
                <div className="p-4 bg-base-200 rounded-2xl border border-base-300 flex justify-between items-start transition hover:bg-base-200/80">
                  <div className="space-y-1 flex-1 pr-4">
                    <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                      SUA QUEIXA
                    </span>
                    <span className="text-sm italic text-slate-600 dark:text-slate-300 block leading-relaxed">
                      "{symptoms.text}"
                    </span>
                    {symptoms.audioLogged && (
                      <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold block mt-1">
                        🎙️ Gravado por áudio de voz
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setStep(2)}
                    className="p-2 text-blue-600 dark:text-blue-400 hover:bg-base-100 rounded-lg flex items-center gap-1 text-xs font-bold transition shrink-0 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Editar
                  </button>
                </div>

                {/* Respostas IA */}
                {answers.length > 0 && (
                  <div className="p-4 bg-base-200 rounded-2xl border border-base-300 transition">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                        RESPOSTAS ADAPTATIVAS
                      </span>
                      <button
                        onClick={() => setStep(4)}
                        className="text-xs text-blue-600 dark:text-blue-400 font-bold flex items-center gap-1 hover:underline cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3" /> Editar
                      </button>
                    </div>
                    <div className="space-y-2.5">
                      {answers.map((answer, index) => {
                        const q = adaptiveQuestions.find(
                          a => a.id === answer.perguntaId
                        )
                        let displayValue = ''
                        const val = (answer as any).valor

                        if (answer.tipo === 'sim_nao') {
                          displayValue =
                            typeof val === 'boolean'
                              ? val
                                ? 'Sim'
                                : 'Não'
                              : 'Não respondido'
                        } else if (answer.tipo === 'escolha_unica') {
                          const op =
                            q && 'opcoes' in q
                              ? q.opcoes.find(o => o.valor === val)
                              : undefined
                          displayValue = op ? op.rotulo : val
                        } else if (answer.tipo === 'multipla_escolha') {
                          displayValue =
                            q && 'opcoes' in q
                              ? q.opcoes
                                  .filter(o =>
                                    (val as string[]).includes(o.valor)
                                  )
                                  .map(o => o.rotulo)
                                  .join(', ')
                              : ''
                        } else if (answer.tipo === 'escala') {
                          displayValue = val.toString()
                        }

                        return (
                          <div
                            key={index}
                            className="text-xs border-l-2 border-blue-500 pl-2.5 py-0.5"
                          >
                            <p className="text-slate-500 leading-normal">
                              {q?.pergunta || 'Pergunta não encontrada'}
                            </p>
                            <p className="font-bold text-slate-700 dark:text-white mt-0.5">
                              R: {displayValue || 'Sem resposta'}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Sinais vitais (apenas se houver) */}
                {Object.values(vitals).some(
                  v => v && v.toString().trim() !== ''
                ) && (
                  <div className="p-4 bg-base-200 rounded-2xl border border-base-300 flex justify-between items-center transition hover:bg-base-200/80">
                    <div className="space-y-1.5 flex-1">
                      <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                        SINAIS VITAIS
                      </span>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {vitals.temperature && (
                          <span className="px-2 py-0.5 bg-base-300 rounded-md text-slate-700 dark:text-slate-300">
                            {vitals.temperature}°C
                          </span>
                        )}
                        {vitals.heartRate && (
                          <span className="px-2 py-0.5 bg-base-300 rounded-md text-slate-700 dark:text-slate-300">
                            {vitals.heartRate} bpm
                          </span>
                        )}
                        {vitals.bloodPressure && (
                          <span className="px-2 py-0.5 bg-base-300 rounded-md text-slate-700 dark:text-slate-300">
                            PA: {vitals.bloodPressure}
                          </span>
                        )}
                        {vitals.saturation && (
                          <span className="px-2 py-0.5 bg-base-300 rounded-md text-slate-700 dark:text-slate-300">
                            SpO2: {vitals.saturation}%
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setStep(5)}
                      className="p-2 text-blue-600 dark:text-blue-400 hover:bg-base-100 rounded-lg flex items-center gap-1 text-xs font-bold transition shrink-0 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Editar
                    </button>
                  </div>
                )}
              </div>

              {/* Action Submit */}
              <div className="pt-4 border-t border-base-300 flex flex-col gap-3">
                <button
                  onClick={classifyTriageLevel}
                  id="btn_submit_triage"
                  type="button"
                  className="w-full btn btn-primary text-primary-content h-14 rounded-2xl font-bold text-lg transition flex items-center justify-center gap-2 shadow-lg cursor-pointer"
                >
                  <Sparkles className="w-5 h-5 text-amber-300" />
                  Enviar para Classificação IA
                </button>
                <button
                  onClick={() => setStep(5)}
                  className="w-full text-center py-2 text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                >
                  Fazer alteração no formulário
                </button>
              </div>
            </div>
          )}

          {/* ETAPA 7: Loading classify or outcome resultados */}
          {step === 7 && (
            <div id="step_7_outcome" className="space-y-6">
              {isClassifying ? (
                <div className="py-12 flex flex-col items-center text-center space-y-6">
                  <div className="relative w-20 h-20 flex items-center justify-center">
                    <div className="absolute inset-0 bg-blue-500/20 rounded-full animate-ping"></div>
                    <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-lg">
                      <RefreshCw className="w-8 h-8 animate-spin" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold text-slate-800 dark:text-white">
                      Calculando Risco Manchester...
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs">
                      Nosso servidor de inteligência clínica está analisando
                      seus dados para recomendar as medidas de suporte.
                    </p>
                  </div>
                </div>
              ) : result ? (
                <div className="space-y-6">
                  {/* Top priority banner styled by Manchester Color */}
                  <div
                    className={`p-6 rounded-3xl border ${getManchesterStyle(result.classificacao.nivel as ManchesterColor).softBg} ${getManchesterStyle(result.classificacao.nivel as ManchesterColor).softBorder} text-center space-y-3.5 relative overflow-hidden`}
                  >
                    {/* Circle color indicator */}
                    <div
                      className={`w-14 h-14 ${getManchesterStyle(result.classificacao.nivel as ManchesterColor).bg} rounded-full mx-auto flex items-center justify-center text-white shadow-lg`}
                    >
                      <Activity className="w-7 h-7" />
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-400 block">
                        Classificação de Risco
                      </span>
                      <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase leading-tight">
                        {
                          MANCHESTER_ROTULOS[activeIdioma][
                            result.classificacao.nivel
                          ]
                        }
                      </h2>
                    </div>

                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-900/90 dark:bg-white/95 text-white dark:text-slate-950 text-xs font-black rounded-full uppercase tracking-wider">
                      Espera:{' '}
                      <span className="underline">
                        {result.esperaEstimada.min}-{result.esperaEstimada.max}{' '}
                        min
                      </span>
                    </div>
                  </div>

                  {/* Patient oriented interpretation */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5" />O que isso significa?
                      </h3>
                      {(() => {
                        const justificationText =
                          result.classificacao.justificativa || ''
                        let displayJustificativa = justificationText
                        let alertaTexto = ''

                        // Match "[ALERTA CLÍNICO]" regardless of case or accents
                        const match = justificationText.match(
                          /\[ALERTA CL[ÍI]NICO\]/i
                        )
                        if (match) {
                          const alertMarker = match[0]
                          const startIdx =
                            justificationText.indexOf(alertMarker)
                          if (startIdx !== -1) {
                            const textAfterMarker = justificationText.substring(
                              startIdx + alertMarker.length
                            )
                            let cleanedText = textAfterMarker.trim()
                            if (cleanedText.startsWith(':')) {
                              cleanedText = cleanedText.substring(1).trim()
                            }

                            // The prompt alert text is expected to end with "alertamos a triagem." or "alertamos a triagem"
                            const endTerm = 'alertamos a triagem.'
                            let endIdx = cleanedText.indexOf(endTerm)
                            if (endIdx === -1) {
                              endIdx = cleanedText.indexOf(
                                'alertamos a triagem'
                              )
                            }

                            if (endIdx !== -1) {
                              const delimiterLength =
                                endIdx ===
                                cleanedText.indexOf('alertamos a triagem.')
                                  ? 'alertamos a triagem.'.length
                                  : 'alertamos a triagem'.length
                              alertaTexto = cleanedText
                                .substring(0, endIdx + delimiterLength)
                                .trim()

                              // Check if there is a trailing dot right after the match if we used the shorter term
                              if (
                                !alertaTexto.endsWith('.') &&
                                cleanedText[endIdx + delimiterLength] === '.'
                              ) {
                                alertaTexto += '.'
                              }
                              displayJustificativa = cleanedText
                                .substring(alertaTexto.length)
                                .trim()
                            } else {
                              // Sentence-based splitter for older model wording.
                              const sentences = cleanedText.split('.')
                              if (sentences.length > 2) {
                                alertaTexto =
                                  sentences.slice(0, 3).join('.').trim() + '.'
                                displayJustificativa = sentences
                                  .slice(3)
                                  .join('.')
                                  .trim()
                              } else {
                                alertaTexto = cleanedText
                                displayJustificativa = ''
                              }
                            }
                          }
                        }

                        return (
                          <>
                            {alertaTexto && (
                              <div className="mb-3.5 p-4.5 bg-amber-500/10 border border-amber-500/35 dark:bg-amber-500/5 dark:border-amber-500/20 rounded-2xl flex items-start gap-3.5 text-amber-800 dark:text-amber-400">
                                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                                <div className="space-y-1 text-left">
                                  <h4 className="text-xs font-black uppercase tracking-wider">
                                    Atenção Triagem: Inconsistência de Dor
                                  </h4>
                                  <p className="text-xs font-semibold leading-relaxed">
                                    {alertaTexto}
                                  </p>
                                </div>
                              </div>
                            )}
                            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed bg-base-200 p-4 rounded-t-2xl border border-b-0 border-base-300">
                              {displayJustificativa || justificationText}
                            </p>
                          </>
                        )
                      })()}

                      {/* Fatores Determinantes (AI Reasoning) */}
                      {result.classificacao.fatoresDeterminantes &&
                        result.classificacao.fatoresDeterminantes.length >
                          0 && (
                          <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-b-2xl border border-blue-100 dark:border-blue-900/30">
                            <h4 className="text-[10px] font-black uppercase text-blue-600 dark:text-blue-400 mb-2 flex items-center gap-1.5 tracking-wider">
                              <Sparkles className="w-3 h-3" />
                              Raciocínio da IA — Critérios Analisados
                            </h4>
                            <ul className="list-disc pl-4 space-y-1">
                              {result.classificacao.fatoresDeterminantes.map(
                                (fator, fIdx) => (
                                  <li
                                    key={fIdx}
                                    className="text-xs font-medium text-slate-600 dark:text-slate-400"
                                  >
                                    {fator}
                                  </li>
                                )
                              )}
                            </ul>
                          </div>
                        )}
                    </div>

                    {/* Next concrete steps checklist */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${getManchesterStyle(result.classificacao.nivel as ManchesterColor).bg} animate-pulse`}
                        ></span>
                        <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                          Orientações Práticas imediatas:
                        </h3>
                      </div>
                      <div
                        className="space-y-2.5"
                        id="practicle_recommendations"
                      >
                        {result.recomendacoes.map((rec, rIdx) => (
                          <div
                            key={rIdx}
                            className={`bg-base-200 border-base-300 border border-l-4 ${getManchesterStyle(result.classificacao.nivel as ManchesterColor).border} p-4.5 rounded-2xl flex items-start gap-3.5 transition-all duration-200 hover:shadow-xs hover:translate-x-0.5`}
                          >
                            <div
                              className={`w-6 h-6 rounded-full ${getManchesterStyle(result.classificacao.nivel as ManchesterColor).bg} text-white text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5 shadow-sm`}
                            >
                              {rIdx + 1}
                            </div>
                            <p className="text-sm font-bold text-base-content/95 leading-relaxed flex-1">
                              {rec}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Suggested appointment — human-in-the-loop checkpoint */}
                  {result.agendamento ? (
                    <div className="pt-4 border-t border-base-300 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                        <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                          Encaixe sugerido pelo agente
                        </h3>
                      </div>
                      <div
                        id="suggested_appointment"
                        className={`bg-base-200 border border-l-4 ${
                          appointmentConfirmed
                            ? 'border-success'
                            : 'border-primary'
                        } p-4.5 rounded-2xl space-y-3 transition-all`}
                      >
                        <div className="flex items-start gap-3.5">
                          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            <CalendarClock className="w-5 h-5" />
                          </div>
                          <div className="flex-1 space-y-1.5">
                            <p className="text-sm font-black text-base-content/95 capitalize">
                              {result.agendamento.especialidade}
                            </p>
                            <p className="text-xs font-bold text-base-content/70 flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 shrink-0" />
                              {result.agendamento.local}
                            </p>
                            <p className="text-xs font-bold text-base-content/70 flex items-center gap-1.5">
                              <CalendarClock className="w-3.5 h-3.5 shrink-0" />
                              {new Date(
                                result.agendamento.proximoSlot
                              ).toLocaleString(activeIdioma, {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                          </div>
                        </div>
                        {appointmentConfirmed ? (
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-black text-success flex items-center gap-1.5">
                              <CheckCircle className="w-4 h-4" /> Encaixe
                              confirmado por você
                            </span>
                            <button
                              onClick={() => setAppointmentConfirmed(false)}
                              className="btn btn-ghost btn-sm font-bold text-xs flex items-center gap-1.5"
                            >
                              <Edit3 className="w-3.5 h-3.5" /> Ajustar
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <button
                              onClick={() => {
                                setAppointmentConfirmed(true)
                                triggerToast(
                                  activeIdioma === 'en'
                                    ? 'Appointment confirmed.'
                                    : 'Encaixe confirmado.'
                                )
                              }}
                              className="w-full btn btn-primary text-primary-content font-extrabold h-12 rounded-2xl text-sm flex items-center justify-center gap-2"
                            >
                              <CheckCircle className="w-4 h-4" /> Confirmar este
                              encaixe
                            </button>
                            <p className="text-[10px] text-center text-slate-400 dark:text-slate-500 leading-relaxed">
                              Sugestão preliminar. A equipe de triagem confirma o
                              horário final presencialmente.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {/* Patient care interactive buttons */}
                  <div className="pt-4 border-t border-base-300 space-y-3">
                    <button
                      onClick={() => {
                        if (result) {
                          void submitToTriageQueue(result)
                        }
                      }}
                      disabled={isLoadingQueue}
                      className="w-full btn btn-primary text-primary-content font-extrabold h-16 rounded-2xl text-[14px] transition flex flex-col items-center justify-center py-2 shrink-0 cursor-pointer shadow-md relative overflow-hidden group hover:opacity-95"
                    >
                      <span className="flex items-center gap-2 font-black tracking-wide uppercase">
                        <Activity className="w-4.5 h-4.5 text-current animate-pulse" />
                        {isLoadingQueue
                          ? 'Transmitindo Ficha...'
                          : 'Ir Para a Fila de Triagem & Acompanhar Atendimento'}
                      </span>
                      <span className="text-[10px] font-bold opacity-85 uppercase tracking-wider block mt-0.5">
                        Transmite seus dados para a Enfermagem e abre o Painel
                        Eletrônico
                      </span>
                    </button>

                    {result.classificacao.nivel === 'vermelho' ||
                    result.classificacao.nivel === 'laranja' ? (
                      <div className="space-y-3">
                        <a
                          href="tel:192"
                          className="w-full btn btn-error text-error-content font-extrabold h-14 rounded-2xl text-center block text-sm transition shadow-md cursor-pointer pt-4.5"
                        >
                          📞 Chamar Ambulância SAMU (Ligar 192)
                        </a>
                      </div>
                    ) : null}

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <button
                        onClick={handleResetApp}
                        className="btn bg-base-300 hover:bg-base-400 border-none text-base-content font-extrabold h-14 rounded-2xl flex items-center justify-center gap-2 transition-all text-sm cursor-pointer shadow-sm"
                      >
                        <RotateCcw className="w-4 h-4 text-slate-500 dark:text-slate-300" />
                        Nova Triagem
                      </button>
                      <button
                        disabled
                        title="Histórico indisponível até existir persistência real"
                        className="btn bg-primary hover:opacity-90 border-none text-primary-content font-extrabold h-14 rounded-2xl flex items-center justify-center gap-2 transition-all text-sm cursor-pointer shadow-sm"
                      >
                        <FileText className="w-4 h-4 text-current" />
                        Salvar Histórico
                      </button>
                    </div>

                    <p className="text-[10px] text-center text-slate-400 dark:text-slate-500 pt-2 leading-relaxed">
                      Lembramos: Esta é uma classificação baseada nas queixas e
                      nas respostas relatadas por você. Não substitui consulta
                      médica ou diagnósticos laboratoriais oficiais.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* ETAPA 8: Painel da Fila Eletrônica - Consultórios / Recepção */}
          {step === 8 && (
            <div id="step_8_queue" className="space-y-6 animate-fadeIn py-1">
              {/* Header Box */}
              <div className="bg-primary/5 dark:bg-primary/10 p-5 rounded-3xl border border-primary/20 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-primary/10 rounded-2xl text-primary shrink-0">
                    <Activity className="w-6 h-6 shrink-0" />
                  </div>
                  <div className="text-left">
                    <h2 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">
                      Painel da Triagem & Recepção
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Dados integrados e transmitidos com sucesso para a equipe
                      médica
                    </p>
                  </div>
                </div>

                {/* Active refresh loading state */}
                <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900 text-[10px] font-extrabold uppercase rounded-full tracking-wider shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Conexão em Tempo Real
                </span>
              </div>

              {/* Patient Status Information Column */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Side: Personal triage card */}
                <div className="lg:col-span-1 space-y-4">
                  <div className="bg-base-200 border border-base-300 p-5 rounded-3xl flex flex-col items-center text-center space-y-4 shadow-sm">
                    <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">
                      Sua Ficha Clínica
                    </span>

                    {/* Circle avatar badge or queue number */}
                    {myQueueItem && myQueueItem.color === 'red' ? (
                      <div className="relative w-20 h-20 flex items-center justify-center">
                        <div className="absolute inset-0 bg-red-500/20 rounded-full animate-ping"></div>
                        <div className="relative w-16 h-16 rounded-full bg-red-600 text-white flex items-center justify-center font-black text-2xl shadow-md">
                          🚨
                        </div>
                      </div>
                    ) : myQueueItem && myQueueItem.color === 'orange' ? (
                      <div className="relative w-20 h-20 flex items-center justify-center">
                        <div className="absolute inset-0 bg-orange-500/20 rounded-full animate-ping"></div>
                        <div className="relative w-16 h-16 rounded-full bg-orange-500 text-white flex items-center justify-center font-black text-2xl shadow-md">
                          ⚠️
                        </div>
                      </div>
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-primary/10 border-4 border-primary/30 flex flex-col items-center justify-center text-primary">
                        <span className="text-[10px] font-black uppercase leading-none opacity-60">
                          Posição
                        </span>
                        <span className="text-3xl font-black mt-1">
                          {myQueueItem?.position
                            ? `#${myQueueItem.position}`
                            : '...'}
                        </span>
                      </div>
                    )}

                    <div className="space-y-1">
                      <h3 className="font-extrabold text-sm text-slate-900 dark:text-white leading-tight">
                        {patient.name || 'Paciente Triado'}
                      </h3>
                      <p className="text-xs text-slate-400 dark:text-slate-500 font-bold">
                        {activeIdioma === 'en'
                          ? `${patient.age} years old • Symptoms submitted`
                          : `${patient.age} anos • Sintomas enviados`}
                      </p>
                    </div>

                    {/* Status Alert Badge */}
                    {myQueueItem && myQueueItem.color === 'red' ? (
                      <div className="w-full bg-red-500/15 border border-red-500/35 p-3.5 rounded-2xl text-center space-y-1">
                        <span className="text-xs font-black text-red-600 uppercase tracking-wider block">
                          ⚠️ ATENDIMENTO IMEDIATO
                        </span>
                        <p className="text-[11px] text-red-700 dark:text-red-300 leading-relaxed font-semibold font-sans">
                          Seu caso é crítico{' '}
                          <b>
                            ({MANCHESTER_ROTULOS[activeIdioma][myQueueItem.nivel]})
                          </b>
                          Dirija-se imediatamente aos profissionais do balcão!
                          Você é prioritário.
                        </p>
                      </div>
                    ) : myQueueItem && myQueueItem.color === 'orange' ? (
                      <div className="w-full bg-orange-500/15 border border-orange-500/35 p-3.5 rounded-2xl text-center space-y-1">
                        <span className="text-xs font-black text-orange-600 uppercase tracking-wider block">
                          ⚠️ ATENDIMENTO PRIORITÁRIO
                        </span>
                        <p className="text-[11px] text-orange-700 dark:text-orange-300 leading-relaxed font-semibold font-sans">
                          Seu caso é muito urgente{' '}
                          <b>
                            ({MANCHESTER_ROTULOS[activeIdioma][myQueueItem.nivel]})
                          </b>
                          Dirija-se imediatamente aos profissionais do balcão.
                        </p>
                      </div>
                    ) : (
                      <div className="w-full bg-primary/10 border border-primary/20 p-3.5 rounded-2xl text-center space-y-1">
                        <span className="text-xs font-black text-primary uppercase tracking-wider block">
                          ⏳ AGUARDANDO ATENDIMENTO
                        </span>
                        <p className="text-[11px] text-base-content/85 leading-relaxed font-semibold font-sans">
                          Ficha transmitida para a lista de espera. Você está na
                          fila. Tempo sugerido:{' '}
                          <b>
                            {result?.esperaEstimada
                              ? `${result.esperaEstimada.min}-${result.esperaEstimada.max} min`
                              : activeIdioma === 'en'
                                ? 'Please wait'
                                : 'Aguarde'}
                          </b>
                          .
                        </p>
                      </div>
                    )}

                    {/* Show Patient details list summary */}
                    <div className="w-full border-t border-base-300 pt-3 text-left space-y-1.5">
                      <div className="flex justify-between items-center text-[11px] gap-2">
                        <span className="text-slate-400 font-bold uppercase shrink-0">
                          Classificação:
                        </span>
                        <span
                          className={`font-black uppercase tracking-wider truncate ${myQueueItem?.color === 'red' ? 'text-red-500' : myQueueItem?.color === 'orange' ? 'text-orange-500' : myQueueItem?.color === 'yellow' ? 'text-yellow-600' : 'text-emerald-500'}`}
                        >
                          {myQueueItem
                            ? MANCHESTER_ROTULOS[activeIdioma][myQueueItem.nivel]
                            : ''}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[11px] gap-2">
                        <span className="text-slate-400 font-bold uppercase shrink-0">
                          Sintoma Principal:
                        </span>
                        <span className="font-semibold text-slate-600 dark:text-slate-300 truncate max-w-35">
                          {symptoms.text || 'Não relatado'}
                        </span>
                      </div>
                      {vitals.temperature && (
                        <div className="flex justify-between items-center text-[11px] gap-2">
                          <span className="text-slate-400 font-bold uppercase shrink-0">
                            Temperatura:
                          </span>
                          <span className="font-bold text-slate-600 dark:text-slate-300 shrink-0">
                            {vitals.temperature}°C
                          </span>
                        </div>
                      )}
                      {vitals.heartRate && (
                        <div className="flex justify-between items-center text-[11px] gap-2">
                          <span className="text-slate-400 font-bold uppercase shrink-0">
                            Batimentos:
                          </span>
                          <span className="font-bold text-slate-600 dark:text-slate-300 shrink-0">
                            {vitals.heartRate} bpm
                          </span>
                        </div>
                      )}
                      {vitals.bloodPressure && (
                        <div className="flex justify-between items-center text-[11px] gap-2">
                          <span className="text-slate-400 font-bold uppercase shrink-0">
                            Pressão:
                          </span>
                          <span className="font-bold text-slate-600 dark:text-slate-300 shrink-0">
                            {vitals.bloodPressure}
                          </span>
                        </div>
                      )}
                      {vitals.saturation && (
                        <div className="flex justify-between items-center text-[11px] gap-2">
                          <span className="text-slate-400 font-bold uppercase shrink-0">
                            Saturação:
                          </span>
                          <span className="font-bold text-slate-600 dark:text-slate-300 shrink-0">
                            {vitals.saturation}%
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 w-full pt-1">
                      <button
                        onClick={() => setStep(7)}
                        className="btn bg-base-300 hover:bg-base-400 border-none text-base-content text-[11px] h-10 min-h-10 rounded-xl font-bold cursor-pointer transition-all flex items-center justify-center gap-1"
                        title="Ver ficha clínica gerada pela IA"
                      >
                        Ver Diagnóstico
                      </button>
                      <button
                        onClick={handleResetApp}
                        className="btn bg-primary hover:opacity-90 border-none text-primary-content text-[11px] h-10 min-h-10 rounded-xl font-black cursor-pointer transition-all"
                        title="Iniciar um novo processo de triagem do começo"
                      >
                        Nova Triagem
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right Side: Shared Queue Board of Clinics */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="bg-base-100 border border-base-300 p-5 rounded-3xl space-y-4 shadow-sm text-left">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">
                          Acompanhamento de Painel
                        </span>
                        <h3 className="font-black text-slate-900 dark:text-white uppercase text-sm tracking-tight flex items-center gap-1.5">
                          📋 Fila de Chamadas Eletrônicas
                        </h3>
                      </div>

                      {/* Simula avanço da fila */}
                      <button
                        onClick={simulateQueueAdvance}
                        type="button"
                        disabled
                        title="A fila é atualizada automaticamente"
                        className="btn btn-xs bg-primary hover:opacity-90 border-none text-primary-content font-bold px-3 py-1.5 h-auto min-h-0 rounded-lg cursor-pointer transition flex items-center gap-1.5 shadow-sm text-[11px] self-start sm:self-auto"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Simular Avanço da Fila
                      </button>
                    </div>

                    {/* Live grid queues rows */}
                    <div className="space-y-2.5 max-h-100 overflow-y-auto pr-1">
                      {queueList.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 text-xs font-sans">
                          Nenhum paciente na fila no momento.
                        </div>
                      ) : (
                        queueList.map((queuePatient, idx) => {
                          const isCurrentUser =
                            queuePatient.sessaoId === sessionId

                          return (
                            <div
                              key={queuePatient.id || idx}
                              className={`p-3.5 rounded-2xl flex items-center justify-between gap-3 border transition-all ${
                                isCurrentUser
                                  ? 'bg-primary/5 border-primary/40 ring-1 ring-primary/20 py-4 scale-[1.01]'
                                  : 'bg-base-200 border-base-300'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                {/* Color stripe badge */}
                                <div
                                  className={`w-3.5 h-3.5 rounded-full shrink-0 ${getManchesterColorClass(queuePatient.color)}`}
                                />

                                <div className="min-w-0 text-left">
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className={`text-sm font-bold truncate ${isCurrentUser ? 'text-primary font-black' : 'text-base-content'}`}
                                    >
                                      {isCurrentUser
                                        ? `${patient.name} (${activeIdioma === 'en' ? 'You' : 'Você'})`
                                        : maskPatientName(queuePatient.name)}
                                    </span>
                                    {isCurrentUser && (
                                      <span className="bg-primary text-primary-content text-[8px] font-extrabold px-1.5 py-0.5 rounded-md uppercase tracking-wider animate-pulse shrink-0">
                                        Minha Vez
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                    {queuePatient.age}{' '}
                                    {activeIdioma === 'en' ? 'years old' : 'anos'} •{' '}
                                    {
                                      MANCHESTER_ROTULOS[activeIdioma][
                                        queuePatient.nivel
                                      ]
                                    }
                                  </p>
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                {queuePatient.status === 'em_atendimento' ? (
                                  <span className="px-2.5 py-1 bg-emerald-500/15 text-emerald-600 border border-emerald-500/30 text-[10px] font-black uppercase rounded-full tracking-wider animate-pulse">
                                    🩺 Em Consultório
                                  </span>
                                ) : queuePatient.status === 'chamado' ? (
                                  <span className="px-2.5 py-1 bg-amber-500/15 text-amber-600 border border-amber-500/30 text-[10px] font-black uppercase rounded-full tracking-wider">
                                    ✨ CHAMANDO...
                                  </span>
                                ) : queuePatient.status ===
                                  'atendido_urgente' ? (
                                  <span className="px-2.5 py-1 bg-red-500/15 text-red-600 border border-red-500/30 text-[10px] font-black uppercase rounded-full tracking-wider">
                                    🚨 PRIORITÁRIO
                                  </span>
                                ) : (
                                  <div className="flex flex-col items-end">
                                    <span className="px-2 py-0.5 bg-slate-200 dark:bg-slate-800 text-slate-500 border border-slate-300 dark:border-slate-700 text-[10px] font-extrabold uppercase rounded-full tracking-wider shrink-0">
                                      Aguardando
                                    </span>
                                    <span className="text-[9px] text-slate-400 mt-1">
                                      {activeIdioma === 'en'
                                        ? `Position: #${queuePatient.position}`
                                        : `Posição: #${queuePatient.position}`}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>

                    {/* Visual hints */}
                    <div className="p-3 bg-base-200 rounded-2xl border border-base-300 text-[10px] text-slate-400 leading-relaxed flex items-start gap-2">
                      <span className="text-base select-none mt-0.5">ℹ️</span>
                      <p className="text-left">
                        A fila eletrônica organiza as chamadas combinando a
                        gravidade clínica (Protocolo de Manchester) e o horário
                        de chegada. Casos prioritários (vermelho/laranja) passam
                        à frente para garantir a segurança da vida.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Line separator and bottom actions footer */}
          <div className="mt-8 pt-6 border-t border-base-300 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <button
                onClick={handleResetApp}
                className="flex items-center gap-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition text-xs font-black uppercase tracking-wider cursor-pointer"
                title="Recomeçar triagem"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Recomeçar</span>
              </button>
            </div>

            <div className="flex items-center gap-3">
              {/* Light/Dark mode Toggle */}
              <button
                id="theme_toggle"
                onClick={() => {
                  setIsDarkMode(!isDarkMode)
                  triggerToast(
                    activeIdioma === 'en'
                      ? `${!isDarkMode ? 'Dark' : 'Light'} mode enabled.`
                      : `Modo ${!isDarkMode ? 'Escuro' : 'Claro'} ativado.`
                  )
                }}
                className="p-2.5 rounded-full bg-base-200 border border-base-300 text-slate-600 dark:text-slate-300 hover:bg-base-300 transition cursor-pointer"
                aria-label="Alternar tema de cores"
                title="Alternar modo claro e escuro"
              >
                {isDarkMode ? (
                  <Sun className="w-4.5 h-4.5 text-amber-500" />
                ) : (
                  <Moon className="w-4.5 h-4.5 text-slate-700 dark:text-slate-300" />
                )}
              </button>

              {/* Persistent Emergency Hotline inside app stage */}
              <button
                id="emergency_button"
                onClick={() => setEmergencyCallModal(true)}
                className="bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-900/60 rounded-full px-4 py-2 flex items-center gap-2.5 transition cursor-pointer shadow-xs"
              >
                <span className="w-2.5 h-2.5 bg-red-600 rounded-full animate-ping"></span>
                <span className="text-red-700 dark:text-red-400 font-extrabold text-xs uppercase tracking-widest">
                  Emergência?
                </span>
                <span className="bg-red-600 text-white px-2.5 py-0.5 rounded-full text-xs font-black">
                  192
                </span>
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Emergency Dialer Warning Modal overlay */}
      {emergencyCallModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-base-100 max-w-sm w-full rounded-3xl p-6 space-y-5 border border-red-205 dark:border-red-950 text-center relative shadow-2xl animate-scaleIn">
            <div className="w-14 h-14 bg-red-105/10 dark:bg-red-950/50 text-red-600 rounded-full mx-auto flex items-center justify-center">
              <PhoneCall className="w-7 h-7" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">
                Deseja ligar para o SAMU?
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Se você ou o paciente estão com dor extrema repentina, desmaios,
                dificuldade severa de respirar ou sintomas de infarto,{' '}
                <b>não perca tempo preenchendo formulários</b>.
              </p>
            </div>

            <div className="bg-red-50 dark:bg-red-950/20 p-4 rounded-2xl border border-red-100 dark:border-red-900/10 text-red-700 dark:text-red-400 text-sm font-bold flex items-center justify-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>Canal de Emergência Direto 192</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setEmergencyCallModal(false)}
                className="p-3 bg-base-300 hover:opacity-85 text-base-content rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Voltar ao app
              </button>

              <a
                href="tel:192"
                onClick={() => setEmergencyCallModal(false)}
                className="p-3 bg-red-600 text-white hover:bg-red-700 rounded-xl text-xs font-black text-center transition block cursor-pointer"
              >
                Ligar Agora 192
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
