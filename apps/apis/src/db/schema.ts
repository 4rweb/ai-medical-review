import {
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp
} from 'drizzle-orm/pg-core'

/**
 * Fila de triagem persistida — substitui o Map em memória. Mantém os campos
 * públicos consultados pelo painel + a sessão completa (jsonb) para reenvio.
 */
export const triageQueue = pgTable('triage_queue', {
  sessaoId: text('sessao_id').primaryKey(),
  color: text('color').notNull(),
  title: text('title').notNull(),
  status: text('status').notNull(),
  sintomaPrincipal: text('sintoma_principal').notNull(),
  nomeMascarado: text('nome_mascarado').notNull(),
  idade: integer('idade').notNull(),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull(),
  sessao: jsonb('sessao').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
})

/**
 * Trilha de auditoria — registra toda elevação determinística de red-flag
 * (e a classificação final) para conformidade clínica/LGPD.
 */
export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  sessaoId: text('sessao_id').notNull(),
  evento: text('evento').notNull(),
  nivelOriginal: text('nivel_original'),
  nivelFinal: text('nivel_final'),
  regrasAcionadas: jsonb('regras_acionadas'),
  detalhe: jsonb('detalhe'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow()
})

export type TriageQueueRow = typeof triageQueue.$inferSelect
export type TriageQueueInsert = typeof triageQueue.$inferInsert
export type AuditLogInsert = typeof auditLogs.$inferInsert
