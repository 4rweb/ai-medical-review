import { eq } from 'drizzle-orm'
import type {
  QueueColor,
  QueuePatient,
  QueueStatus,
  SessaoTriagem
} from '@medical/contracts'
import type { DrizzleDb } from '../db/drizzle'
import { triageQueue } from '../db/schema'

export type StoredTriage = {
  sessao: SessaoTriagem & {
    sessaoId: string
    resultado: NonNullable<SessaoTriagem['resultado']>
  }
  publicPatient: QueuePatient
}

/** Token DI para o armazenamento da fila (DB ou memória). */
export const QUEUE_STORE = Symbol('QUEUE_STORE')

export interface QueueStore {
  upsert(record: StoredTriage): Promise<void>
  get(sessaoId: string): Promise<StoredTriage | undefined>
  all(): Promise<StoredTriage[]>
}

/** Fallback em memória — usado quando DATABASE_URL está ausente e nos testes. */
export class InMemoryQueueStore implements QueueStore {
  private readonly records = new Map<string, StoredTriage>()

  async upsert(record: StoredTriage): Promise<void> {
    this.records.set(record.publicPatient.sessaoId, record)
  }

  async get(sessaoId: string): Promise<StoredTriage | undefined> {
    return this.records.get(sessaoId)
  }

  async all(): Promise<StoredTriage[]> {
    return [...this.records.values()]
  }
}

/** Persistência em PostgreSQL (ApsaraDB) via Drizzle. */
export class DbQueueStore implements QueueStore {
  constructor(private readonly db: DrizzleDb) {}

  async upsert(record: StoredTriage): Promise<void> {
    const p = record.publicPatient
    const row = {
      sessaoId: p.sessaoId,
      color: p.color,
      title: p.title,
      status: p.status,
      sintomaPrincipal: p.sintomaPrincipal,
      nomeMascarado: p.nomeMascarado,
      idade: p.idade,
      joinedAt: new Date(p.joinedAt),
      sessao: record.sessao,
      updatedAt: new Date()
    }
    await this.db
      .insert(triageQueue)
      .values(row)
      .onConflictDoUpdate({ target: triageQueue.sessaoId, set: row })
  }

  async get(sessaoId: string): Promise<StoredTriage | undefined> {
    const [row] = await this.db
      .select()
      .from(triageQueue)
      .where(eq(triageQueue.sessaoId, sessaoId))
      .limit(1)
    return row ? this.toStored(row) : undefined
  }

  async all(): Promise<StoredTriage[]> {
    const rows = await this.db.select().from(triageQueue)
    return rows.map(row => this.toStored(row))
  }

  private toStored(row: typeof triageQueue.$inferSelect): StoredTriage {
    const publicPatient: QueuePatient = {
      sessaoId: row.sessaoId,
      id: row.sessaoId,
      name: row.nomeMascarado,
      age: row.idade,
      nomeMascarado: row.nomeMascarado,
      idade: row.idade,
      color: row.color as QueueColor,
      title: row.title,
      sintomaPrincipal: row.sintomaPrincipal,
      status: row.status as QueueStatus,
      joinedAt: row.joinedAt.toISOString()
    }
    return {
      sessao: row.sessao as StoredTriage['sessao'],
      publicPatient
    }
  }
}
