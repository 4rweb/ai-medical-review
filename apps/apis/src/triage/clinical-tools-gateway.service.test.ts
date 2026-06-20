import { ConfigService } from '@nestjs/config'
import { describe, expect, it, vi } from 'vitest'
import {
  ClinicalToolsGatewayService,
  type ClinicalMcpConnectionFactory
} from './clinical-tools-gateway.service'
import { ClinicalToolsService } from './clinical-tools.service'

describe('ClinicalToolsGatewayService', () => {
  it('executa a tool pelo servidor MCP quando ele está disponível', async () => {
    const listTools = vi
      .fn()
      .mockResolvedValue([
        'verificarFaixaVital',
        'buscarDisponibilidadeConsultorio'
      ])
    const callTool = vi.fn().mockResolvedValue({
      especialidade: 'Cardiologia',
      local: 'Consultório MCP',
      proximoSlot: '2026-06-20T13:00:00.000Z'
    })
    const close = vi.fn().mockResolvedValue(undefined)
    const factory: ClinicalMcpConnectionFactory = vi
      .fn()
      .mockResolvedValue({ listTools, callTool, close })
    const gateway = new ClinicalToolsGatewayService(
      new ConfigService({ MCP_SERVER_URL: 'http://mcp.test/mcp' }),
      new ClinicalToolsService(),
      factory
    )
    const tool = gateway
      .getQwenTools()
      .find(item => item.name === 'buscarDisponibilidadeConsultorio')

    await gateway.prepare()
    const result = await tool?.execute({ especialidade: 'Cardiologia' })

    expect(factory).toHaveBeenCalledWith('http://mcp.test/mcp')
    expect(listTools).toHaveBeenCalledWith(2_500)
    expect(callTool).toHaveBeenCalledWith(
      'buscarDisponibilidadeConsultorio',
      { especialidade: 'Cardiologia' },
      2_500
    )
    expect(result).toEqual({
      especialidade: 'Cardiologia',
      local: 'Consultório MCP',
      proximoSlot: '2026-06-20T13:00:00.000Z'
    })
    await gateway.onModuleDestroy()
    expect(close).toHaveBeenCalledOnce()
  })

  it('cai para a execução local e abre cooldown quando o MCP falha', async () => {
    const factory: ClinicalMcpConnectionFactory = vi
      .fn()
      .mockRejectedValue(new Error('ECONNREFUSED'))
    const gateway = new ClinicalToolsGatewayService(
      new ConfigService({ MCP_FAILURE_COOLDOWN_MS: '60000' }),
      new ClinicalToolsService(
        () => new Date('2026-06-20T12:00:00.000Z')
      ),
      factory
    )
    const tool = gateway
      .getQwenTools()
      .find(item => item.name === 'buscarDisponibilidadeConsultorio')

    const first = await tool?.execute({ especialidade: 'Clínica médica' })
    const second = await tool?.execute({ especialidade: 'Clínica médica' })

    expect(factory).toHaveBeenCalledOnce()
    expect(first).toEqual(second)
    expect(first).toEqual({
      especialidade: 'Clínica médica',
      local: 'Consultório 7 - Ala A',
      proximoSlot: '2026-06-20T12:45:00.000Z'
    })
  })

  it('faz o handshake e lista as tools antes do classificador chamar a Qwen', async () => {
    const listTools = vi
      .fn()
      .mockResolvedValue(['verificarFaixaVital'])
    const factory: ClinicalMcpConnectionFactory = vi.fn().mockResolvedValue({
      listTools,
      callTool: vi.fn(),
      close: vi.fn()
    })
    const gateway = new ClinicalToolsGatewayService(
      new ConfigService(),
      new ClinicalToolsService(),
      factory
    )

    await gateway.prepare()

    expect(factory).toHaveBeenCalledOnce()
    expect(listTools).toHaveBeenCalledWith(2_500)
  })
})
