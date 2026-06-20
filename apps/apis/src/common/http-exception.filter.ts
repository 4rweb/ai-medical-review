import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger
} from '@nestjs/common'
import type { Request, Response } from 'express'

/**
 * Filtro global: respostas de erro limpas e logging estruturado.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException')

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR

    const payload =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: 'Erro interno do servidor.' }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        (exception as Error)?.stack
      )
    } else {
      this.logger.warn(`${request.method} ${request.url} -> ${status}`)
    }

    response.status(status).json(
      typeof payload === 'string' ? { statusCode: status, message: payload } : payload
    )
  }
}
