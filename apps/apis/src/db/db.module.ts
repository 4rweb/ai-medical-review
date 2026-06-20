import { Global, Logger, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { DRIZZLE, type DrizzleDb } from './drizzle'
import * as schema from './schema'

/**
 * Provê a conexão Drizzle/pg para ApsaraDB (RDS PostgreSQL) via DATABASE_URL.
 * Se a variável estiver ausente, exporta `null` e o restante do app cai no
 * armazenamento em memória — mantém `pnpm dev` e os testes sem exigir um banco.
 */
@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): DrizzleDb | null => {
        const url = config.get<string>('DATABASE_URL')
        const logger = new Logger('DbModule')
        if (!url) {
          logger.warn(
            'DATABASE_URL não configurada — usando armazenamento em memória.'
          )
          return null
        }
        const pool = new Pool({ connectionString: url })
        logger.log('Conectado ao PostgreSQL (ApsaraDB) via Drizzle.')
        return drizzle(pool, { schema })
      }
    }
  ],
  exports: [DRIZZLE]
})
export class DbModule {}
