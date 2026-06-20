import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { TriageQueueService } from './triage-queue.service'
import { TriageService } from './triage.service'
import { TranscriptionService } from './transcription.service'

@Controller('triage')
export class TriageController {
  constructor(
    private readonly triage: TriageService,
    private readonly queue: TriageQueueService,
    private readonly transcription: TranscriptionService
  ) {}

  @Post('transcrever')
  @HttpCode(HttpStatus.OK)
  transcrever(@Body() body: unknown) {
    return this.transcription.transcribe(body)
  }

  @Post('analyze')
  @HttpCode(HttpStatus.OK)
  analyze(@Body() body: unknown) {
    return this.triage.analyze(body)
  }

  @Post('classify')
  @HttpCode(HttpStatus.OK)
  classify(@Body() body: unknown) {
    return this.triage.classify(body)
  }

  @Get('queue')
  async getQueue() {
    return { queue: await this.queue.getSortedQueue() }
  }

  @Post('queue/submit')
  @HttpCode(HttpStatus.OK)
  submitQueue(@Body() body: unknown) {
    return this.queue.submit(body)
  }
}
