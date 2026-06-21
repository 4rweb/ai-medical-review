import { describe, expect, it } from 'vitest'
import type {
  ClassificarRequest,
  ClassificacaoModelo,
  SinaisVitais
} from '@medical/contracts'
import { ClinicalSafetyService } from './clinical-safety.service'

const service = new ClinicalSafetyService()

function request(
  texto: string,
  sinaisVitais?: SinaisVitais
): ClassificarRequest {
  return {
    sessaoId: 'session-1',
    idioma: 'pt-BR',
    paciente: {
      nome: 'Paciente Teste',
      idade: 40,
      consentimentoLGPD: true
    },
    relato: { texto, origem: 'texto' },
    sintomasIdentificados: [],
    redFlagsColetor: [],
    perguntas: [],
    respostas: [],
    sinaisVitais,
    versaoModeloColetor: 'qwen3.6-flash'
  }
}

const greenModel: ClassificacaoModelo = {
  classificacao: {
    nivel: 'verde',
    confianca: 0.7,
    justificativa: 'Caso estável.',
    fatoresDeterminantes: ['Relato informado']
  },
  redFlags: [],
  emergencia: false
}

describe('ClinicalSafetyService', () => {
  it.each([
    [
      'Dor de cabeça súbita e explosiva, a pior da minha vida.',
      undefined,
      'CEFALEIA_THUNDERCLAP'
    ],
    [
      'Dor no peito que irradia pro braço, com suor frio.',
      undefined,
      'DOR_TORACICA_ISQUEMICA'
    ],
    [
      'Falta de ar intensa, não consigo completar frases.',
      undefined,
      'DISPNEIA_INTENSA'
    ],
    [
      'Fraqueza súbita de um lado do corpo e fala arrastada.',
      undefined,
      'AVC_FAST'
    ],
    [
      'Teve convulsão e agora não responde.',
      undefined,
      'ALTERACAO_CONSCIENCIA'
    ],
    [
      'Atropelamento com sangramento intenso que não para.',
      undefined,
      'SANGRAMENTO_TRAUMA_GRAVE'
    ],
    ['Mal-estar.', { spo2: 87 }, 'HIPOXEMIA']
  ] satisfies Array<[string, SinaisVitais | undefined, string]>)(
    'eleva regra crítica para vermelho: %s',
    (texto, vitals, code) => {
      const result = service.enforce(request(texto, vitals), greenModel)
      expect(result.classificacao.nivel).toBe('vermelho')
      expect(result.emergencia).toBe(true)
      expect(result.security.elevated).toBe(true)
      expect(result.security.rules).toContain(code)
    }
  )

  it.each([
    ['Sudden explosive headache, the worst of my life.', 'CEFALEIA_THUNDERCLAP'],
    [
      'Chest pain radiating to my arm with cold sweat.',
      'DOR_TORACICA_ISQUEMICA'
    ],
    [
      'I cannot complete sentences because I am short of breath.',
      'DISPNEIA_INTENSA'
    ],
    [
      'Sudden weakness on one side and slurred speech.',
      'AVC_FAST'
    ],
    [
      'Dor no peito radiating to my arm com suor frio.',
      'DOR_TORACICA_ISQUEMICA'
    ]
  ])('detecta red flag em inglês ou relato misto: %s', (texto, code) => {
    const input = request(texto)
    input.idioma = 'en'
    const result = service.enforce(input, {
      ...greenModel,
      classificacao: {
        ...greenModel.classificacao,
        justificativa: 'The patient reports a stable condition.',
        fatoresDeterminantes: ['Reported symptoms']
      }
    })
    expect(result.classificacao.nivel).toBe('vermelho')
    expect(result.security.rules).toContain(code)
    expect(result.classificacao.justificativa).toContain('[Safety]')
  })

  it('aciona a oitava regra para instabilidade vital', () => {
    const result = service.enforce(
      request('Mal-estar com tontura.', {
        pressaoSistolica: 89,
        pressaoDiastolica: 60
      }),
      greenModel
    )
    expect(result.classificacao.nivel).toBe('laranja')
    expect(result.security.rules).toContain('INSTABILIDADE_VITAL')
  })

  it.each([
    ['Dor no peito com enjoo.', 'DOR_TORACICA_ALERTA'],
    ['Falta de ar muito intensa e piorando.', 'DISPNEIA_ALERTA']
  ])('usa laranja para padrão intermediário: %s', (texto, code) => {
    const result = service.enforce(request(texto), greenModel)
    expect(result.classificacao.nivel).toBe('laranja')
    expect(result.emergencia).toBe(false)
    expect(result.security.rules).toContain(code)
  })

  it.each([
    [87, 'vermelho'],
    [88, 'laranja'],
    [91, 'laranja'],
    [92, 'verde']
  ] as const)('calibra SpO₂ %i para %s', (spo2, expected) => {
    const result = service.enforce(
      request('Mal-estar inespecífico.', { spo2 }),
      greenModel
    )
    expect(result.classificacao.nivel).toBe(expected)
  })

  it('exige febre alta e taquicardia em conjunto', () => {
    expect(
      service.evaluate(
        request('Febre.', { temperaturaC: 39.5, freqCardiacaBpm: 100 })
      ).rules
    ).not.toContain('INSTABILIDADE_VITAL')
    expect(
      service.evaluate(
        request('Palpitação.', { temperaturaC: 37, freqCardiacaBpm: 130 })
      ).rules
    ).not.toContain('INSTABILIDADE_VITAL')
    expect(
      service.evaluate(
        request('Febre e palpitação.', {
          temperaturaC: 39.5,
          freqCardiacaBpm: 130
        })
      ).rules
    ).toContain('INSTABILIDADE_VITAL')
  })

  it.each([
    'Febre alta há 1 dia, sem outros sinais.',
    'Dor de garganta leve há 2 dias.'
  ])('não inventa red flag para caso não crítico: %s', texto => {
    const result = service.evaluate(request(texto))
    expect(result.requiredLevel).toBeUndefined()
    expect(result.flags).toEqual([])
  })

  it('não usa valores padrão quando sinais vitais foram omitidos', () => {
    expect(service.evaluate(request('Mal-estar leve.')).rules).toEqual([])
  })

  it('nunca reduz a classificação da IA', () => {
    const redModel: ClassificacaoModelo = {
      ...greenModel,
      classificacao: { ...greenModel.classificacao, nivel: 'vermelho' },
      emergencia: true
    }
    const result = service.enforce(
      request('Dor de garganta leve há 2 dias.'),
      redModel
    )
    expect(result.classificacao.nivel).toBe('vermelho')
    expect(result.security.elevated).toBe(false)
    expect(result.security.finalLevel).toBe('vermelho')
  })

  it('considera apenas respostas afirmativas e opções selecionadas', () => {
    const input = request('Estou com mal-estar leve.')
    input.perguntas = [
      {
        id: 'stroke',
        tipo: 'sim_nao',
        pergunta: 'Você está com fala arrastada ou fraqueza de um lado?',
        obrigatoria: true
      }
    ]
    input.respostas = [
      { perguntaId: 'stroke', tipo: 'sim_nao', valor: false }
    ]
    expect(service.evaluate(input).requiredLevel).toBeUndefined()

    input.respostas = [
      { perguntaId: 'stroke', tipo: 'sim_nao', valor: true }
    ]
    expect(service.evaluate(input).requiredLevel).toBe('vermelho')
  })

  it('só inclui o texto clínico da pergunta quando a opção selecionada sinaliza alerta', () => {
    const input = request('Estou com mal-estar leve.')
    input.perguntas = [
      {
        id: 'breathing',
        tipo: 'escolha_unica',
        pergunta: 'Você não consegue completar frases por falta de ar?',
        obrigatoria: true,
        opcoes: [
          { valor: 'nao', rotulo: 'Não' },
          { valor: 'sim', rotulo: 'Sim, acontece agora', sinaliza: 'alerta' }
        ]
      }
    ]
    input.respostas = [
      { perguntaId: 'breathing', tipo: 'escolha_unica', valor: 'nao' }
    ]
    expect(service.evaluate(input).requiredLevel).toBeUndefined()

    input.respostas = [
      { perguntaId: 'breathing', tipo: 'escolha_unica', valor: 'sim' }
    ]
    expect(service.evaluate(input).requiredLevel).toBe('vermelho')
  })

  it('funde flags sem duplicar e explica a elevação', () => {
    const input = request('Dor de cabeça súbita e explosiva.')
    input.redFlagsColetor = [
      {
        codigo: 'CEFALEIA_THUNDERCLAP',
        descricao: 'Coletor detectou início súbito.',
        severidade: 'alta'
      }
    ]
    const result = service.enforce(input, {
      ...greenModel,
      redFlags: [
        {
          codigo: 'CEFALEIA_THUNDERCLAP',
          descricao: 'Modelo detectou início súbito.',
          severidade: 'alta'
        }
      ]
    })

    expect(
      result.redFlags.filter(flag => flag.codigo === 'CEFALEIA_THUNDERCLAP')
    ).toHaveLength(1)
    expect(result.classificacao.justificativa).toContain('[Segurança]')
    expect(result.classificacao.justificativa).toContain(
      'CEFALEIA_THUNDERCLAP'
    )
    expect(result.classificacao.fatoresDeterminantes).toContain(
      'Cefaleia súbita, explosiva ou descrita como a pior dor da vida.'
    )
  })

  it('remove diagnósticos, exames e condutas da saída destinada ao paciente', () => {
    const sanitized = service.sanitizeModelOutput({
      classificacao: {
        nivel: 'vermelho',
        confianca: 0.9,
        justificativa:
          'O início súbito exige prioridade imediata. Suspeita de aneurisma e indicação de tomografia.',
        fatoresDeterminantes: ['Início súbito', 'Possível aneurisma']
      },
      redFlags: [],
      emergencia: true
    })
    expect(sanitized.classificacao.justificativa).toBe(
      'O início súbito exige prioridade imediata.'
    )
    expect(sanitized.classificacao.fatoresDeterminantes).toEqual([
      'Início súbito'
    ])
  })

  it('remove diagnóstico e conduta escritos em inglês', () => {
    const sanitized = service.sanitizeModelOutput(
      {
        classificacao: {
          nivel: 'vermelho',
          confianca: 0.9,
          justificativa:
            'Sudden onset requires immediate priority. Possible aneurysm and CT scan are indicated.',
          fatoresDeterminantes: ['Sudden onset', 'Possible aneurysm']
        },
        redFlags: [],
        emergencia: true
      },
      'en'
    )
    expect(sanitized.classificacao.justificativa).toBe(
      'Sudden onset requires immediate priority.'
    )
    expect(sanitized.classificacao.fatoresDeterminantes).toEqual([
      'Sudden onset'
    ])
  })
})
