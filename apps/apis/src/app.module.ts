import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { ApiKeyGuard } from './common/api-key.guard'
import { HealthController } from './health.controller'
import { TriageModule } from './triage/triage.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate-limit: 60 requisições por minuto, por IP.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
    TriageModule
  ],
  controllers: [HealthController],
  providers: [
    // Limita a taxa de requisições (anti-abuso/scraping).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Garante que só a aplicação web (com o segredo) acesse a API.
    { provide: APP_GUARD, useClass: ApiKeyGuard }
  ]
})
export class AppModule {}
