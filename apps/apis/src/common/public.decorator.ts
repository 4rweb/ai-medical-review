import { SetMetadata } from '@nestjs/common'

export const IS_PUBLIC_KEY = 'isPublic'

/**
 * Marca uma rota como pública (sem exigir o segredo interno).
 * Usado, por exemplo, no healthcheck.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)
