import type { Idioma, NivelManchester } from '@medical/contracts'

type PublicMessageKey =
  | 'aiQuota'
  | 'aiInvalid'
  | 'aiUnavailable'
  | 'transcriptionQuota'
  | 'transcriptionUnavailable'
  | 'criticalSignal'
  | 'emergencyAction'
  | 'fallbackSpecialty'
  | 'reportedComplaint'

const PUBLIC_MESSAGES: Record<Idioma, Record<PublicMessageKey, string>> = {
  'pt-BR': {
    aiQuota: 'A cota do serviço de IA foi atingida. Tente novamente mais tarde.',
    aiInvalid:
      'A IA retornou uma resposta inválida. Nenhuma análise foi criada.',
    aiUnavailable: 'Serviço de IA indisponível no momento.',
    transcriptionQuota:
      'A cota do serviço de IA foi atingida. Digite o relato manualmente.',
    transcriptionUnavailable:
      'Transcrição indisponível no momento. Digite o relato manualmente.',
    criticalSignal: 'Sinal crítico',
    emergencyAction:
      'Procure imediatamente a equipe de triagem ou ligue para o SAMU 192.',
    fallbackSpecialty: 'Clínica médica',
    reportedComplaint: 'Queixa informada'
  },
  en: {
    aiQuota: 'The AI service quota has been reached. Please try again later.',
    aiInvalid: 'The AI returned an invalid response. No analysis was created.',
    aiUnavailable: 'The AI service is currently unavailable.',
    transcriptionQuota:
      'The AI service quota has been reached. Please type your report instead.',
    transcriptionUnavailable:
      'Transcription is currently unavailable. Please type your report instead.',
    criticalSignal: 'Critical warning sign',
    emergencyAction:
      'Immediately seek the triage team or call SAMU at 192.',
    fallbackSpecialty: 'General medicine',
    reportedComplaint: 'Reported complaint'
  }
}

export function publicMessage(
  idioma: Idioma,
  key: PublicMessageKey
): string {
  return PUBLIC_MESSAGES[idioma][key]
}

export function safetyElevationText(
  idioma: Idioma,
  originalLevel: NivelManchester,
  finalLevel: NivelManchester,
  rules: string[]
): string {
  return idioma === 'en'
    ? `[Safety] Classification raised from "${originalLevel}" to "${finalLevel}" by deterministic rules: ${rules.join(', ')}.`
    : `[Segurança] Classificação elevada de "${originalLevel}" para "${finalLevel}" pelas regras determinísticas: ${rules.join(', ')}.`
}

export function safeFallbackExplanation(idioma: Idioma): string {
  return idioma === 'en'
    ? 'Priority was determined from the severity and onset of the reported symptoms.'
    : 'A prioridade foi definida a partir da gravidade e do início dos sintomas informados.'
}

export function safeFallbackFactor(idioma: Idioma): string {
  return idioma === 'en'
    ? 'Severity of the reported symptoms'
    : 'Gravidade dos sintomas relatados'
}
