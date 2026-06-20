import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from './schema'

/** Token DI para a instância Drizzle. É `null` quando DATABASE_URL não está
 * configurada — nesse caso o app degrada para armazenamento em memória. */
export const DRIZZLE = Symbol('DRIZZLE')

export type DrizzleDb = NodePgDatabase<typeof schema>
