import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import express, { type Request, type Response } from 'express'
import {
  AvailabilityArgsSchema,
  AVAILABILITY_DESCRIPTION,
  VitalRangeArgsSchema,
  VITAL_RANGE_DESCRIPTION,
  buscarDisponibilidadeConsultorio,
  verificarFaixaVital
} from '@medical/clinical'

/**
 * Servidor MCP que expõe as ferramentas clínicas determinísticas como host
 * canônico de tools. Reaproveita exatamente a mesma lógica auditada usada pelo
 * function calling do backend (@medical/clinical) — sem duplicação.
 *
 * Transporte:
 *  - stdio (padrão): para o MCP Inspector / Claude Desktop, que sobem o
 *    processo sob demanda.   →  pnpm --filter mcp inspect
 *  - http (MCP_TRANSPORT=http): servidor sempre ligado, conectável por clientes
 *    via Streamable HTTP em /mcp.   →  pnpm --filter mcp start
 *
 * Logs vão para stderr (console.error) para não corromper o JSON-RPC do stdio.
 */
function createServer(): McpServer {
  const server = new McpServer({
    name: 'medical-review-clinical',
    version: '1.0.0'
  })

  server.registerTool(
    'verificarFaixaVital',
    {
      title: 'Verificar faixa de sinal vital / Check vital-sign range',
      description: VITAL_RANGE_DESCRIPTION,
      inputSchema: VitalRangeArgsSchema.shape
    },
    async ({ tipo, valor, idade, idioma }) => {
      console.error('[mcp] tool verificarFaixaVital executada')
      const result = verificarFaixaVital(tipo, valor, idade, idioma)
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    }
  )

  server.registerTool(
    'buscarDisponibilidadeConsultorio',
    {
      title: 'Buscar disponibilidade / Find appointment availability',
      description: AVAILABILITY_DESCRIPTION,
      inputSchema: AvailabilityArgsSchema.shape
    },
    async ({ especialidade, idioma }) => {
      console.error('[mcp] tool buscarDisponibilidadeConsultorio executada')
      const result = buscarDisponibilidadeConsultorio(
        especialidade,
        new Date(),
        idioma
      )
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    }
  )

  return server
}

async function startStdio(): Promise<void> {
  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

async function startHttp(port: number): Promise<void> {
  const app = express()
  app.use(express.json({ limit: '1mb' }))

  // Streamable HTTP com sessão: cada cliente (ex.: MCP Inspector) faz o
  // handshake `initialize`, recebe um mcp-session-id e mantém a sessão nas
  // chamadas seguintes (tools/list, tools/call).
  const transports: Record<string, StreamableHTTPServerTransport> = {}

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', transport: 'http' })
  })

  app.post('/mcp', async (req: Request, res: Response) => {
    console.error(`[mcp] request ${String(req.body?.method || 'desconhecido')}`)
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    let transport = sessionId ? transports[sessionId] : undefined

    if (!transport && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: id => {
          transports[id] = transport as StreamableHTTPServerTransport
        }
      })
      transport.onclose = () => {
        if (transport?.sessionId) delete transports[transport.sessionId]
      }
      await createServer().connect(transport)
    } else if (!transport) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Sessão MCP inválida ou ausente.' },
        id: null
      })
      return
    }

    await transport.handleRequest(req, res, req.body)
  })

  const handleSession = async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    const transport = sessionId ? transports[sessionId] : undefined
    if (!transport) {
      res.status(400).send('Sessão MCP inválida ou ausente.')
      return
    }
    await transport.handleRequest(req, res)
  }

  app.get('/mcp', handleSession)
  app.delete('/mcp', handleSession)

  await new Promise<void>((resolve, reject) => {
    // Bind IPv6 dual-stack ('::'): atende localhost (mesma instância, via
    // 127.0.0.1) e redes privadas IPv6-only (se virar serviço próprio).
    const httpServer = app.listen(port, '::', () => {
      console.error(`[mcp] Streamable HTTP na porta ${port} (path /mcp)`)
    })

    httpServer.once('error', reject)

    const shutdown = () => {
      httpServer.close(error => {
        if (error) reject(error)
        else resolve()
      })
    }
    process.once('SIGINT', shutdown)
    process.once('SIGTERM', shutdown)
  })
}

const mode = process.env.MCP_TRANSPORT === 'http' ? 'http' : 'stdio'
if (mode === 'http') {
  await startHttp(Number(process.env.MCP_PORT) || 3002)
} else {
  await startStdio()
}
