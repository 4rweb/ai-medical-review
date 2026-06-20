import { Inject, Injectable } from '@nestjs/common'
import {
  MANCHESTER,
  TriagemFilaSubmitRequestSchema,
  type QueuePatient,
  type TriagemFilaSubmitRequest
} from '@medical/contracts'
import { parsePayload } from '../common/parse-schema'
import {
  InMemoryQueueStore,
  QUEUE_STORE,
  type QueueStore,
  type StoredTriage
} from './queue-store'

const PRIORIDADE: Record<QueuePatient['color'], number> = {
  red: 0,
  orange: 1,
  yellow: 2,
  green: 3,
  blue: 4
}

@Injectable()
export class TriageQueueService {
  constructor(
    @Inject(QUEUE_STORE)
    private readonly store: QueueStore = new InMemoryQueueStore()
  ) {}

  async getSortedQueue(): Promise<QueuePatient[]> {
    const patients = (await this.store.all()).map(item => item.publicPatient)
    const active = patients.filter(patient => patient.status !== 'aguardando')
    const waiting = patients
      .filter(patient => patient.status === 'aguardando')
      .sort((a, b) => {
        const priority = PRIORIDADE[a.color] - PRIORIDADE[b.color]
        return priority || Date.parse(a.joinedAt) - Date.parse(b.joinedAt)
      })
      .map((patient, index) => ({ ...patient, position: index + 1 }))

    return [...active.map(patient => ({ ...patient, position: 0 })), ...waiting]
  }

  async submit(
    input: unknown
  ): Promise<{ queue: QueuePatient[]; patient: QueuePatient }> {
    const { sessao } = parsePayload(
      TriagemFilaSubmitRequestSchema,
      input
    ) as TriagemFilaSubmitRequest
    const nivel = sessao.resultado.classificacao.nivel
    const color = {
      vermelho: 'red',
      laranja: 'orange',
      amarelo: 'yellow',
      verde: 'green',
      azul: 'blue'
    }[nivel] as QueuePatient['color']
    const existing = await this.store.get(sessao.sessaoId)
    const joinedAt =
      existing?.publicPatient.joinedAt || new Date().toISOString()
    const publicPatient: QueuePatient = {
      sessaoId: sessao.sessaoId,
      id: sessao.sessaoId,
      name: this.maskName(sessao.paciente.nome),
      age: sessao.paciente.idade,
      nomeMascarado: this.maskName(sessao.paciente.nome),
      idade: sessao.paciente.idade,
      color,
      title: MANCHESTER[nivel].rotulo,
      sintomaPrincipal:
        sessao.sintomasIdentificados[0]?.rotulo || 'Queixa informada',
      status:
        nivel === 'vermelho' || nivel === 'laranja'
          ? 'atendido_urgente'
          : existing?.publicPatient.status || 'aguardando',
      joinedAt
    }

    await this.store.upsert({ sessao, publicPatient } as StoredTriage)

    const sorted = await this.getSortedQueue()
    return {
      queue: sorted,
      patient:
        sorted.find(patient => patient.sessaoId === sessao.sessaoId) ||
        publicPatient
    }
  }

  private maskName(name: string): string {
    const parts = name.trim().split(/\s+/)
    if (parts.length === 1) return `${parts[0].slice(0, 2)}***`
    return `${parts[0]} ${parts.at(-1)?.[0] || ''}***`
  }
}
