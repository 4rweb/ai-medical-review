import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  Optional
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { AvailabilityResult } from '@medical/clinical'
import type { Idioma } from '@medical/contracts'
import type { QwenTool } from '../qwen/qwen.types'
import { ClinicalToolsService } from './clinical-tools.service'

type McpCallResult = {
  content?: Array<{ type: string; text?: string }>
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

export type ClinicalMcpConnection = {
  listTools: (timeoutMs: number) => Promise<string[]>
  callTool: (
    name: string,
    args: Record<string, unknown>,
    timeoutMs: number
  ) => Promise<unknown>
  close: () => Promise<void>
}

export type ClinicalMcpConnectionFactory = (
  url: string
) => Promise<ClinicalMcpConnection>

export const CLINICAL_MCP_CONNECTION_FACTORY = Symbol(
  'CLINICAL_MCP_CONNECTION_FACTORY'
)

async function createMcpConnection(
  url: string
): Promise<ClinicalMcpConnection> {
  const client = new Client({
    name: 'medical-review-api',
    version: '1.0.0'
  })
  const transport = new StreamableHTTPClientTransport(new URL(url))
  await client.connect(transport)

  return {
    async listTools(timeoutMs) {
      const result = await client.listTools(undefined, { timeout: timeoutMs })
      return result.tools.map(tool => tool.name)
    },
    async callTool(name, args, timeoutMs) {
      const result = (await client.callTool(
        { name, arguments: args },
        undefined,
        { timeout: timeoutMs }
      )) as McpCallResult

      if (result.isError) {
        throw new Error(`A tool MCP ${name} retornou erro.`)
      }
      if (result.structuredContent) return result.structuredContent

      const text = result.content?.find(item => item.type === 'text')?.text
      if (!text) {
        throw new Error(`A tool MCP ${name} retornou conteúdo vazio.`)
      }
      return JSON.parse(text) as unknown
    },
    async close() {
      await client.close()
    }
  }
}

@Injectable()
export class ClinicalToolsGatewayService implements OnModuleDestroy {
  private readonly logger = new Logger(ClinicalToolsGatewayService.name)
  private readonly enabled: boolean
  private readonly url: string
  private readonly timeoutMs: number
  private readonly cooldownMs: number
  private connection: ClinicalMcpConnection | null = null
  private connecting: Promise<ClinicalMcpConnection> | null = null
  private unavailableUntil = 0

  constructor(
    config: ConfigService,
    private readonly localTools: ClinicalToolsService,
    @Optional()
    @Inject(CLINICAL_MCP_CONNECTION_FACTORY)
    private readonly connectionFactory: ClinicalMcpConnectionFactory = createMcpConnection
  ) {
    this.enabled =
      (config.get<string>('MCP_ENABLED') || 'true').toLowerCase() !== 'false'
    this.url =
      config.get<string>('MCP_SERVER_URL') || 'http://127.0.0.1:3002/mcp'
    this.timeoutMs = this.readPositiveNumber(
      config.get<string>('MCP_TOOL_TIMEOUT_MS'),
      2_500
    )
    this.cooldownMs = this.readPositiveNumber(
      config.get<string>('MCP_FAILURE_COOLDOWN_MS'),
      15_000
    )
  }

  getQwenTools(idioma: Idioma = 'pt-BR'): QwenTool[] {
    return this.localTools.getQwenTools(idioma).map(tool => ({
      ...tool,
      execute: input =>
        this.execute(tool, {
          ...(input as Record<string, unknown>),
          idioma
        })
    }))
  }

  async prepare(): Promise<void> {
    if (!this.enabled || Date.now() < this.unavailableUntil) return

    try {
      const connection = await this.getConnection()
      const tools = await connection.listTools(this.timeoutMs)
      this.logger.log(`[MCP] catálogo disponível: ${tools.join(', ')}`)
    } catch (error) {
      await this.activateFallback('tools/list', error)
    }
  }

  async buscarDisponibilidadeConsultorio(
    especialidade: string,
    idioma: Idioma = 'pt-BR'
  ): Promise<AvailabilityResult> {
    const tool = this.localTools
      .getQwenTools(idioma)
      .find(candidate => candidate.name === 'buscarDisponibilidadeConsultorio')

    if (!tool) {
      return this.localTools.buscarDisponibilidadeConsultorio(
        especialidade,
        idioma
      )
    }

    return (await this.execute(tool, {
      especialidade,
      idioma
    })) as AvailabilityResult
  }

  async onModuleDestroy(): Promise<void> {
    await this.resetConnection()
  }

  private async execute(tool: QwenTool, input: unknown): Promise<unknown> {
    if (!this.enabled || Date.now() < this.unavailableUntil) {
      return tool.execute(input)
    }

    try {
      const connection = await this.getConnection()
      const result = await connection.callTool(
        tool.name,
        input as Record<string, unknown>,
        this.timeoutMs
      )
      this.logger.log(`[MCP] tool ${tool.name} executada via ${this.url}`)
      return result
    } catch (error) {
      await this.activateFallback(tool.name, error)
      return tool.execute(input)
    }
  }

  private async activateFallback(
    operation: string,
    error: unknown
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error)
    this.logger.warn(
      `[MCP] ${operation} falhou (${message}); usando fallback in-process por ${this.cooldownMs}ms.`
    )
    this.unavailableUntil = Date.now() + this.cooldownMs
    await this.resetConnection()
  }

  private async getConnection(): Promise<ClinicalMcpConnection> {
    if (this.connection) return this.connection
    if (!this.connecting) {
      this.connecting = this.connectionFactory(this.url)
        .then(connection => {
          this.connection = connection
          this.logger.log(`[MCP] conectado a ${this.url}`)
          return connection
        })
        .finally(() => {
          this.connecting = null
        })
    }
    return this.connecting
  }

  private async resetConnection(): Promise<void> {
    const connection = this.connection
    this.connection = null
    this.connecting = null
    if (!connection) return
    try {
      await connection.close()
    } catch {
      // A conexão já pode ter sido encerrada pelo transporte.
    }
  }

  private readPositiveNumber(value: string | undefined, fallback: number) {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
  }
}
