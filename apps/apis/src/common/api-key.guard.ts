import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import type { Request } from 'express'
import { IS_PUBLIC_KEY } from './public.decorator'

/**
 * Garante que a API só seja consumida pela nossa aplicação web.
 *
 * Camada primária: um segredo compartilhado (`x-internal-api-key`) injetado
 * pelo proxy BFF da web no lado do servidor — nunca é exposto ao browser.
 *
 * Camada de reforço: se um cabeçalho Origin/Referer estiver presente, ele
 * precisa pertencer à allowlist (WEB_ORIGIN). Requisições servidor-a-servidor
 * (do proxy) podem não enviar Origin, e nesse caso o segredo já é a barreira.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name)
  private readonly secret: string
  private readonly allowedOrigins: string[]

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService
  ) {
    this.secret = this.config.get<string>('INTERNAL_API_KEY') || ''
    this.allowedOrigins = (
      this.config.get<string>('WEB_ORIGIN') || 'http://localhost:3000'
    )
      .split(',')
      .map(o => o.trim())
      .filter(Boolean)

    if (!this.secret) {
      this.logger.warn(
        '⚠️ INTERNAL_API_KEY não configurada — a API ficará desprotegida. Defina-a no .env.'
      )
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ])
    if (isPublic) return true

    // Se nenhum segredo foi configurado, não bloqueia (modo de desenvolvimento).
    if (!this.secret) return true

    const req = context.switchToHttp().getRequest<Request>()

    // 1) Segredo compartilhado.
    const provided = req.headers['x-internal-api-key']
    const providedKey = Array.isArray(provided) ? provided[0] : provided
    if (!providedKey || providedKey !== this.secret) {
      throw new UnauthorizedException('Acesso não autorizado.')
    }

    // 2) Reforço por Origin/Referer (apenas quando presente).
    const origin = req.headers.origin || req.headers.referer
    if (origin && !this.allowedOrigins.some(allowed => origin.startsWith(allowed))) {
      throw new UnauthorizedException('Origem não autorizada.')
    }

    return true
  }
}
