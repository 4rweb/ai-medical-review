import { Module } from '@nestjs/common'
import { QwenModule } from '../qwen/qwen.module'
import { DRIZZLE, type DrizzleDb } from '../db/drizzle'
import { AuditService } from '../db/audit.service'
import { TriageController } from './triage.controller'
import { TriageService } from './triage.service'
import { TranscriptionService } from './transcription.service'
import { TriageQueueService } from './triage-queue.service'
import { ClinicalSafetyService } from './clinical-safety.service'
import { ClinicalToolsService } from './clinical-tools.service'
import { ClinicalToolsGatewayService } from './clinical-tools-gateway.service'
import {
  DbQueueStore,
  InMemoryQueueStore,
  QUEUE_STORE,
  type QueueStore
} from './queue-store'

@Module({
  imports: [QwenModule],
  controllers: [TriageController],
  providers: [
    TriageService,
    TranscriptionService,
    TriageQueueService,
    ClinicalSafetyService,
    ClinicalToolsService,
    ClinicalToolsGatewayService,
    AuditService,
    {
      provide: QUEUE_STORE,
      inject: [DRIZZLE],
      useFactory: (db: DrizzleDb | null): QueueStore =>
        db ? new DbQueueStore(db) : new InMemoryQueueStore()
    }
  ]
})
export class TriageModule {}
