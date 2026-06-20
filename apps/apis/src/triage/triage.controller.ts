import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { TriageService } from './triage.service'
import { TriageQueueService } from './triage-queue.service'
import { AnalyzeDto, ClassifyDto, QueueSubmitDto } from './dto/triage.dto'

@Controller('triage')
export class TriageController {
  constructor(
    private readonly triage: TriageService,
    private readonly queue: TriageQueueService
  ) {}

  @Post('analyze')
  @HttpCode(HttpStatus.OK)
  analyze(@Body() dto: AnalyzeDto) {
    return this.triage.analyze(dto)
  }

  @Post('classify')
  @HttpCode(HttpStatus.OK)
  classify(@Body() dto: ClassifyDto) {
    return this.triage.classify(dto)
  }

  @Get('queue')
  getQueue() {
    return { queue: this.queue.getSortedQueue() }
  }

  @Post('queue/submit')
  @HttpCode(HttpStatus.OK)
  submitQueue(@Body() dto: QueueSubmitDto) {
    return this.queue.submit(dto)
  }

  @Post('queue/advance')
  @HttpCode(HttpStatus.OK)
  advanceQueue() {
    return this.queue.advance()
  }
}
