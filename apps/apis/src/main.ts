import { NestFactory } from '@nestjs/core'
import { ValidationPipe, Logger } from '@nestjs/common'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { HttpExceptionFilter } from './common/http-exception.filter'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false })
  const logger = new Logger('Bootstrap')

  const port = Number(process.env.API_PORT) || 3001

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

  // Validação/transformação de entrada. whitelist desligado de propósito:
  // os corpos de triagem são objetos aninhados dinâmicos e não devem ser podados.
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      forbidNonWhitelisted: false,
      whitelist: false
    })
  )

  app.useGlobalFilters(new HttpExceptionFilter())

  await app.listen(port, '0.0.0.0')
  logger.log(`🚀 API NestJS rodando em http://0.0.0.0:${port}/api`)
  logger.log(`🔒 CORS allowlist: ${webOrigins.join(', ')}`)
}

bootstrap()
