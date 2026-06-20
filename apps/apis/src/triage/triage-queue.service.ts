import { Injectable } from '@nestjs/common'
import type { QueuePatient } from '@medical/contracts'

/**
 * Fila de triagem em tempo real (estado em memória — singleton).
 * Portado de server.ts. OK para o hackathon; sem banco de dados.
 */
@Injectable()
export class TriageQueueService {
  // Lista pré-carregada para parecer realista.
  private triageQueue: QueuePatient[] = [
    {
      id: 'p_1',
      name: 'Maria Silva Santos',
      age: 68,
      color: 'red',
      title: 'Vermelho - Emergência',
      status: 'em_atendimento',
      joinedAt: new Date(Date.now() - 32 * 60 * 1000).toISOString()
    },
    {
      id: 'p_2',
      name: 'Carlos Henrique Souza',
      age: 54,
      color: 'orange',
      title: 'Laranja - Muito urgente',
      status: 'chamado',
      joinedAt: new Date(Date.now() - 14 * 60 * 1000).toISOString()
    },
    {
      id: 'p_3',
      name: 'Ana Beatriz Ramos',
      age: 29,
      color: 'yellow',
      title: 'Amarelo - Urgente',
      status: 'aguardando',
      joinedAt: new Date(Date.now() - 42 * 60 * 1000).toISOString()
    },
    {
      id: 'p_4',
      name: 'Jorge de Oliveira',
      age: 33,
      color: 'green',
      title: 'Verde - Pouco urgente',
      status: 'aguardando',
      joinedAt: new Date(Date.now() - 65 * 60 * 1000).toISOString()
    },
    {
      id: 'p_5',
      name: 'Francisca Maria',
      age: 72,
      color: 'green',
      title: 'Verde - Pouco urgente',
      status: 'aguardando',
      joinedAt: new Date(Date.now() - 85 * 60 * 1000).toISOString()
    }
  ]

  mapColorToEnglish(
    color: string
  ): 'red' | 'orange' | 'yellow' | 'green' | 'blue' {
    const norm = (color || '').toLowerCase().trim()
    if (norm === 'vermelho' || norm === 'red') return 'red'
    if (norm === 'laranja' || norm === 'orange') return 'orange'
    if (norm === 'amarelo' || norm === 'yellow') return 'yellow'
    if (norm === 'verde' || norm === 'green') return 'green'
    if (norm === 'azul' || norm === 'blue') return 'blue'
    return 'green' // fallback padrão
  }

  getSortedQueue(): QueuePatient[] {
    const activeStates = this.triageQueue.filter(
      p =>
        p.status === 'em_atendimento' ||
        p.status === 'chamado' ||
        p.status === 'atendido_urgente'
    )
    const waitingStates = this.triageQueue.filter(p => p.status === 'aguardando')

    const colorWeight: Record<string, number> = {
      red: 1,
      vermelho: 1,
      orange: 2,
      laranja: 2,
      yellow: 3,
      amarelo: 3,
      green: 4,
      verde: 4,
      blue: 5,
      azul: 5
    }

    waitingStates.sort((a, b) => {
      const wA = colorWeight[a.color] ?? 99
      const wB = colorWeight[b.color] ?? 99
      if (wA !== wB) return wA - wB // menor peso = maior prioridade clínica
      return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
    })

    const waitingWithPos = waitingStates.map((p, index) => ({
      ...p,
      position: index + 1
    }))

    return [
      ...activeStates.map(p => ({ ...p, position: 0 })),
      ...waitingWithPos
    ]
  }

  submit(input: { name?: string; age?: number; color?: string; title?: string }) {
    const patientName =
      input.name && input.name.trim() ? input.name.trim() : 'Paciente Sem Nome'
    const mappedColor = this.mapColorToEnglish(input.color || '')

    const existingIdx = this.triageQueue.findIndex(
      p => p.name.toLowerCase() === patientName.toLowerCase()
    )

    if (existingIdx !== -1) {
      this.triageQueue[existingIdx] = {
        ...this.triageQueue[existingIdx],
        color: mappedColor,
        title: input.title!,
        age: input.age || 40,
        joinedAt: new Date().toISOString()
      }
      return {
        success: true,
        queue: this.getSortedQueue(),
        patient: this.triageQueue[existingIdx]
      }
    }

    const isUrgent = mappedColor === 'red' || mappedColor === 'orange'
    const newPatient: QueuePatient = {
      id: 'p_' + Math.random().toString(36).slice(2, 11),
      name: patientName,
      age: input.age || 40,
      color: mappedColor,
      title: input.title!,
      status: isUrgent ? 'atendido_urgente' : 'aguardando',
      joinedAt: new Date().toISOString()
    }

    this.triageQueue.push(newPatient)

    return {
      success: true,
      queue: this.getSortedQueue(),
      patient: newPatient
    }
  }

  advance() {
    // 1. Remove quem está "em_atendimento" (já atendido).
    this.triageQueue = this.triageQueue.filter(
      p => p.status !== 'em_atendimento'
    )

    // 2. "chamado" -> "em_atendimento".
    this.triageQueue.forEach(p => {
      if (p.status === 'chamado') p.status = 'em_atendimento'
    })

    // 3. Promove o "aguardando" de maior prioridade para "chamado".
    const sorted = this.getSortedQueue()
    const firstWaiting = sorted.find(p => p.status === 'aguardando')
    if (firstWaiting) {
      const original = this.triageQueue.find(p => p.id === firstWaiting.id)
      if (original) original.status = 'chamado'
    }

    // 4. Se a fila esvaziar, semeia um paciente sintético (movimento contínuo).
    if (this.triageQueue.length < 4) {
      const firstNames = [
        'Roberta',
        'Gisele',
        'Otávio',
        'Felipe',
        'Rosângela',
        'Julio',
        'Milena'
      ]
      const lastNames = [
        'Guedes',
        'Pinheiro',
        'Lima',
        'Moraes',
        'Teixeira',
        'Mendes',
        'Ribeiro'
      ]
      const colors: Array<'yellow' | 'green' | 'blue'> = [
        'yellow',
        'green',
        'green',
        'blue'
      ]
      const name = `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`
      const color = colors[Math.floor(Math.random() * colors.length)]
      this.triageQueue.push({
        id: 'p_synthetic_' + Math.random().toString(36).slice(2, 11),
        name,
        age: Math.floor(Math.random() * 45) + 20,
        color,
        title:
          color === 'yellow'
            ? 'Amarelo - Urgente'
            : color === 'green'
              ? 'Verde - Pouco urgente'
              : 'Azul - Não urgente',
        status: 'aguardando',
        joinedAt: new Date(
          Date.now() - Math.floor(Math.random() * 30) * 60000
        ).toISOString()
      })
    }

    return { success: true, queue: this.getSortedQueue() }
  }
}
