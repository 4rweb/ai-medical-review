import { NestFactory } from '@nestjs/core'
import { ValidationPipe, Logger } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { HttpExceptionFilter } from './common/http-exception.filter'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false
  })
  const logger = new Logger('Bootstrap')

  // Áudio para transcrição chega como base64 em JSON — eleva o limite do parser.
  app.useBodyParser('json', { limit: '15mb' })

  // O host de produção injeta PORT; localmente caímos em API_PORT/3001.
  const port = Number(process.env.PORT) || Number(process.env.API_PORT) || 3001

  // Allowlist de origens que podem chamar a API (a aplicação web).
  const webOrigins = (process.env.WEB_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean)

  // Endurecimento de cabeçalhos HTTP.
  app.use(helmet())

  // CORS restrito: somente a origem da nossa aplicação web.
  app.enableCors({
    origin: webOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-internal-api-key']
  })

  // Todas as rotas ficam sob /api (o frontend chama /api/triage/*).
  app.setGlobalPrefix('api')

  // Validação estrutural detalhada é feita pelos schemas Zod compartilhados.
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      forbidNonWhitelisted: true,
      whitelist: true
    })
  )

  app.useGlobalFilters(new HttpExceptionFilter())

  // Bind IPv6 dual-stack ('::'): aceita IPv4 (ingress público) e IPv6 (redes
  // privadas que são IPv6-only) — robusto para serviço único ou separado.
  await app.listen(port, '::')
  logger.log(`🚀 API NestJS rodando na porta ${port} (prefixo /api)`)
  logger.log(`🔒 CORS allowlist: ${webOrigins.join(', ')}`)
}

bootstrap()
