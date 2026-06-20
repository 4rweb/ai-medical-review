export class QwenQuotaError extends Error {
  constructor() {
    super('AI_QUOTA_EXCEEDED')
    this.name = 'QwenQuotaError'
  }
}

export class QwenUnavailableError extends Error {
  constructor(message = 'AI_SERVICE_UNAVAILABLE') {
    super(message)
    this.name = 'QwenUnavailableError'
  }
}

export class QwenInvalidResponseError extends Error {
  constructor(message = 'AI_INVALID_RESPONSE') {
    super(message)
    this.name = 'QwenInvalidResponseError'
  }
}
