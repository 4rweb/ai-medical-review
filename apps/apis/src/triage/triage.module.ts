import { Module } from '@nestjs/common'
import { QwenModule } from '../qwen/qwen.module'
import { TriageController } from './triage.controller'
import { TriageService } from './triage.service'
import { TriageQueueService } from './triage-queue.service'

@Module({
  imports: [QwenModule],
  controllers: [TriageController],
  providers: [TriageService, TriageQueueService]
})
export class TriageModule {}
