import {
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException
} from '@nestjs/common'
import {
  AI_ERROR_CODES,
  TranscreverRequestSchema,
  type TranscreverResponse
} from '@medical/contracts'
import { parsePayload } from '../common/parse-schema'
import { QwenService } from '../qwen/qwen.service'
import { QwenQuotaError, QwenUnavailableError } from '../qwen/qwen.errors'
import { publicMessage } from './triage-i18n'

@Injectable()
export class TranscriptionService {
  constructor(private readonly qwen: QwenService) {}

  async transcribe(input: unknown): Promise<TranscreverResponse> {
    const dto = parsePayload(TranscreverRequestSchema, input)
    try {
      const { texto, model } = await this.qwen.transcribeAudio({
        audioBase64: dto.audioBase64,
        formato: dto.formato,
        idioma: dto.idioma
      })
      return { texto, versaoModelo: model }
    } catch (error) {
      if (error instanceof QwenQuotaError) {
        throw new HttpException(
          {
            error: AI_ERROR_CODES.quota,
            message: publicMessage(dto.idioma, 'transcriptionQuota')
          },
          HttpStatus.TOO_MANY_REQUESTS
        )
      }
      if (error instanceof QwenUnavailableError) {
        throw new ServiceUnavailableException({
          error: AI_ERROR_CODES.unavailable,
          message: publicMessage(dto.idioma, 'transcriptionUnavailable')
        })
      }
      throw error
    }
  }
}
