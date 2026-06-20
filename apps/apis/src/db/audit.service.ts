import { Inject, Injectable, Logger } from '@nestjs/common'
import { DRIZZLE, type DrizzleDb } from './drizzle'
import { auditLogs, type AuditLogInsert } from './schema'

/**
 * Trilha de auditoria clínica. Grava no PostgreSQL quando há conexão; caso
 * contrário registra no logger (nunca derruba o fluxo de triagem).
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name)

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb | null) {}

  async record(entry: AuditLogInsert): Promise<void> {
    if (!this.db) {
      this.logger.warn(
        `[audit:${entry.evento}] sessão ${entry.sessaoId} ` +
          `${entry.nivelOriginal ?? '-'} -> ${entry.nivelFinal ?? '-'} ` +
          `regras=${JSON.stringify(entry.regrasAcionadas ?? [])}`
      )
      return
    }
    try {
      await this.db.insert(auditLogs).values(entry)
    } catch (error) {
      this.logger.error('Falha ao gravar auditoria.', error as Error)
    }
  }
}
