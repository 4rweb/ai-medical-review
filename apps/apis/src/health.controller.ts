import { Controller, Get } from '@nestjs/common'
import { Public } from './common/public.decorator'

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return { status: 'ok', service: 'ai-medical-review-api', ts: new Date().toISOString() }
  }
}
