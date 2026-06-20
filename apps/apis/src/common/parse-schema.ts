import { BadRequestException } from '@nestjs/common'

type Schema<T> = {
  safeParse: (
    input: unknown
  ) =>
    | { success: true; data: T }
    | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } }
}

export function parsePayload<T>(schema: Schema<T>, input: unknown): T {
  const parsed = schema.safeParse(input)
  if (parsed.success) return parsed.data

  throw new BadRequestException({
    error: 'INVALID_REQUEST',
    message: 'Dados de triagem inválidos.',
    fields: parsed.error.issues.map(issue => ({
      path: issue.path.join('.'),
      message: issue.message
    }))
  })
}
