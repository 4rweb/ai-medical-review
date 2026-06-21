import {
  AnalisarRelatoResponseSchema,
  ClassificarResponseSchema,
  QueueResponseSchema,
  TranscreverResponseSchema,
  type AnalisarRelatoRequest,
  type AnalisarRelatoResponse,
  type ClassificarRequest,
  type ClassificarResponse,
  type QueueResponse,
  type TranscreverRequest,
  type TranscreverResponse,
  type TriagemFilaSubmitRequest
} from '@medical/contracts'
type Schema<T> = {
  safeParse: (
    input: unknown
  ) => { success: true; data: T } | { success: false; error: unknown }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(
  path: string,
  schema: Schema<T>,
  init?: RequestInit
): Promise<T> {
  const idioma = (() => {
    if (typeof init?.body !== 'string') return 'pt-BR'
    try {
      const parsed = JSON.parse(init.body) as { idioma?: string }
      return parsed.idioma === 'en' ? 'en' : 'pt-BR'
    } catch {
      return 'pt-BR'
    }
  })()
  const messages =
    idioma === 'en'
      ? {
          requestFailed: 'The AI service could not be reached.',
          invalidResponse:
            'The API returned data that is incompatible with the application.',
          timeout: 'The AI service took longer than expected.',
          unavailable: 'The AI service is currently unavailable.'
        }
      : {
          requestFailed: 'Não foi possível acessar o serviço de IA.',
          invalidResponse:
            'A API retornou dados incompatíveis com o aplicativo.',
          timeout: 'O serviço de IA demorou mais que o esperado.',
          unavailable: 'Serviço de IA indisponível no momento.'
        }
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 50_000)

  try {
    const response = await fetch(path, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers
      }
    })
    const body = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >

    if (!response.ok) {
      throw new ApiError(
        typeof body.message === 'string'
          ? body.message
          : messages.requestFailed,
        typeof body.error === 'string' ? body.error : 'REQUEST_FAILED',
        response.status
      )
    }

    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      throw new ApiError(
        messages.invalidResponse,
        'INVALID_API_RESPONSE',
        502
      )
    }
    return parsed.data
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(
        messages.timeout,
        'AI_SERVICE_TIMEOUT',
        503
      )
    }
    throw new ApiError(
      messages.unavailable,
      'AI_SERVICE_UNAVAILABLE',
      503
    )
  } finally {
    window.clearTimeout(timeout)
  }
}

export const triageApi = {
  transcribe(payload: TranscreverRequest): Promise<TranscreverResponse> {
    return request<TranscreverResponse>(
      '/api/triage/transcrever',
      TranscreverResponseSchema,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    )
  },

  analyze(payload: AnalisarRelatoRequest): Promise<AnalisarRelatoResponse> {
    return request<AnalisarRelatoResponse>(
      '/api/triage/analyze',
      AnalisarRelatoResponseSchema,
      {
      method: 'POST',
      body: JSON.stringify(payload)
      }
    )
  },

  classify(payload: ClassificarRequest): Promise<ClassificarResponse> {
    return request<ClassificarResponse>(
      '/api/triage/classify',
      ClassificarResponseSchema,
      {
      method: 'POST',
      body: JSON.stringify(payload)
      }
    )
  },

  queue(): Promise<QueueResponse> {
    return request<QueueResponse>('/api/triage/queue', QueueResponseSchema)
  },

  submitQueue(payload: TriagemFilaSubmitRequest): Promise<QueueResponse> {
    return request<QueueResponse>(
      '/api/triage/queue/submit',
      QueueResponseSchema,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    )
  }
}
