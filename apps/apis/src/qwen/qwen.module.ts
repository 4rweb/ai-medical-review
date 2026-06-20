import { Module } from '@nestjs/common'
import { QwenService } from './qwen.service'

@Module({
  providers: [QwenService],
  exports: [QwenService]
})
export class QwenModule {}
