/**
 * AI Medical Review — Contrato de dados (IA <-> Frontend)
 * ------------------------------------------------------------------
 * Fonte única da verdade. O frontend (React + TanStack) importa estes
 * tipos para renderizar e validar; o backend (Node.js na Alibaba)
 * devolve exatamente estas formas. As duas respostas geradas por IA
 * (AnalisarRelatoResponse e ClassificarResponse) são o JSON que o Qwen
 * produz via "structured output" — ou seja, este arquivo também é o
 * schema que você passa ao modelo.
 *
 * Há DUAS chamadas de IA no fluxo:
 *   A) /triagem/analisar   -> Agente COLETOR: lê o relato e gera as
 *                             perguntas adaptativas (Passo 3 -> 4)
 *   B) /triagem/classificar -> Agente CLASSIFICADOR (+ AGENDADOR): gera
 *                             a cor de Manchester e orientações (Passo 6 -> resultado)
 */

export const CONTRATO_VERSAO = "1.0.0";

/* =================================================================
 * 1. TIPOS COMPARTILHADOS
 * ================================================================= */

/** As cinco cores do Protocolo de Manchester. */
export type NivelManchester = "vermelho" | "laranja" | "amarelo" | "verde" | "azul";

/**
 * Metadados de cada cor — CONSTANTE DO FRONTEND, não vem da IA.
 * A IA devolve só o `nivel`; a tela enriquece com isto.
 */
export const MANCHESTER: Record<
  NivelManchester,
  { rotulo: string; esperaMin: number; esperaMax: number; critico: boolean }
> = {
  vermelho: { rotulo: "Emergência",    esperaMin: 0,   esperaMax: 0,   critico: true  },
  laranja:  { rotulo: "Muito urgente", esperaMin: 0,   esperaMax: 10,  critico: false },
  amarelo:  { rotulo: "Urgente",       esperaMin: 0,   esperaMax: 60,  critico: false },
  verde:    { rotulo: "Pouco urgente", esperaMin: 0,   esperaMax: 120, critico: false },
  azul:     { rotulo: "Não urgente",   esperaMin: 0,   esperaMax: 240, critico: false },
};

/* =================================================================
 * 2. ENTRADA DO PACIENTE (frontend coleta — Passos 1, 2, 4, 5)
 * ================================================================= */

/** Passo 1 — Identificação. */
export interface DadosPaciente {
  nome: string;
  idade: number;
  /** LGPD: precisa ser true antes de qualquer envio de dado de saúde. */
  consentimentoLGPD: boolean;
}

/** Passo 2 — Relato livre (texto já editado pelo paciente). */
export interface Relato {
  /** Texto final (transcrição do áudio editada, ou digitado). */
  texto: string;
  origem: "audio" | "texto";
  audioDuracaoSeg?: number;
}

/** Passo 5 — Sinais vitais. TODOS opcionais: ausente = não informado. */
export interface SinaisVitais {
  temperaturaC?: number;
  freqCardiacaBpm?: number;
  pressaoSistolica?: number;
  pressaoDiastolica?: number;
  spo2?: number;
}

/** Passo 5 — Nível de dor autorrelatado (0 a 10). */
export type NivelDor = number;

/* =================================================================
 * 3. PERGUNTAS ADAPTATIVAS (a IA gera — Passo 4 renderiza)
 * ================================================================= */

export type TipoPergunta = "sim_nao" | "escolha_unica" | "multipla_escolha" | "escala";

export interface OpcaoResposta {
  /** ID estável (não muda com o idioma/texto). */
  valor: string;
  /** Texto exibido ao paciente. */
  rotulo: string;
  /** Marca opções que acendem um sinal de alerta (ex.: "irradia pro braço"). */
  sinaliza?: "alerta";
}

/**
 * Uma pergunta renderizável. O componente <CartaoPergunta> faz o switch
 * por `tipo` e escolhe o input do DaisyUI correspondente.
 */
export interface PerguntaAdaptativa {
  id: string;
  tipo: TipoPergunta;
  pergunta: string;
  obrigatoria: boolean;
  /** Opções (só para escolha_unica / multipla_escolha). */
  opcoes?: OpcaoResposta[];
  /** Config da escala (só para tipo "escala"). */
  escala?: { min: number; max: number; rotulos?: Record<number, string> };
  /** Por que a IA perguntou isso — explicabilidade (útil no painel/admin). */
  motivo?: string;
  /** Peso clínico que esta pergunta tem na classificação. */
  pesoClinico?: "baixo" | "medio" | "alto";
}

/**
 * Resposta do paciente — união discriminada por `tipo`, para o front
 * validar e o back tipar sem ambiguidade.
 */
export type RespostaAdaptativa =
  | { perguntaId: string; tipo: "sim_nao"; valor: boolean }
  | { perguntaId: string; tipo: "escolha_unica"; valor: string }
  | { perguntaId: string; tipo: "multipla_escolha"; valor: string[] }
  | { perguntaId: string; tipo: "escala"; valor: number };

/* =================================================================
 * 4. SINAIS CLÍNICOS QUE A IA EXTRAI
 * ================================================================= */

/** Sintoma extraído do relato — alimenta os chips do Passo 3 (reais, não placeholder). */
export interface SintomaExtraido {
  rotulo: string;
  inicio?: "subito" | "gradual";
  localizacao?: string;
}

/** Sinal de alerta clínico (ex.: cefaleia súbita = possível vermelho). */
export interface RedFlag {
  codigo: string;
  descricao: string;
  severidade: "media" | "alta";
}

/** Alerta de emergência mostrado IMEDIATAMENTE, sem esperar a classificação final. */
export interface AlertaEmergencia {
  motivo: string;
  /** Ação recomendada, ex.: "Procure atendimento imediato / ligue 192". */
  acao: string;
}

/* =================================================================
 * 5. CONTRATO A — ANALISAR RELATO (Coletor)  POST /triagem/analisar
 * ================================================================= */

export interface AnalisarRelatoRequest {
  paciente: DadosPaciente;
  relato: Relato;
}

/** O que a IA devolve para montar o Passo 4 (e os chips do Passo 3). */
export interface AnalisarRelatoResponse {
  sessaoId: string;
  sintomasIdentificados: SintomaExtraido[];
  redFlags: RedFlag[];
  perguntas: PerguntaAdaptativa[];
  /** Se o relato já indica emergência, vem preenchido e a UI escala na hora. */
  alertaEmergencia?: AlertaEmergencia;
  versaoModelo: string;
}

/* =================================================================
 * 6. CONTRATO B — CLASSIFICAR (Classificador + Agendador)
 *    POST /triagem/classificar
 * ================================================================= */

export interface ClassificarRequest {
  sessaoId: string;
  paciente: DadosPaciente;
  relato: Relato;
  sintomasIdentificados: SintomaExtraido[];
  respostas: RespostaAdaptativa[];
  nivelDor: NivelDor;
  sinaisVitais?: SinaisVitais;
}

/** Saída do Agendador (pode ser mock no começo). */
export interface Agendamento {
  especialidadeSugerida: string;
  local?: string;
  profissional?: string;
  horarioEstimado?: string;
}

/**
 * Resultado final. ESTE é o objeto que você pede ao Qwen via structured
 * output. `justificativa` + `fatoresDeterminantes` são o diferencial:
 * a IA EXPLICA a cor, não devolve uma caixa-preta.
 */
export interface ClassificarResponse {
  sessaoId: string;
  classificacao: {
    nivel: NivelManchester;
    /** Confiança 0..1 — a UI pode usar para sinalizar revisão humana. */
    confianca: number;
    justificativa: string;
    fatoresDeterminantes: string[];
  };
  esperaEstimada: { min: number; max: number; unidade: "min" };
  recomendacoes: string[];
  redFlags: RedFlag[];
  /** true -> tela de resultado prioriza "Chamar SAMU / atendimento imediato". */
  emergencia: boolean;
  agendamento?: Agendamento;
  disclaimer: string;
  geradoEm: string; // ISO 8601
  versaoModelo: string;
}

/* =================================================================
 * 7. REGISTRO PARA O PAINEL ADMIN (ApsaraDB -> dashboard / fila)
 * ================================================================= */

export type StatusTriagem =
  | "aguardando"
  | "chamando"
  | "em_consultorio"
  | "concluida"
  | "cancelada";

/** O que o painel da equipe e a fila eletrônica consomem. */
export interface TriagemRegistro {
  sessaoId: string;
  paciente: { nomeMascarado: string; idade: number };
  nivel: NivelManchester;
  sintomaPrincipal: string;
  nivelDor: NivelDor;
  sinaisVitais?: SinaisVitais;
  status: StatusTriagem;
  criadoEm: string;       // ISO 8601
  posicaoFila?: number;
}

/* =================================================================
 * 8. ESTADO GLOBAL DA SESSÃO (TanStack Store)
 *    Vai sendo preenchido etapa a etapa; a tela de Revisão (Passo 6)
 *    lê tudo daqui antes de chamar /classificar.
 * ================================================================= */

export interface SessaoTriagem {
  sessaoId?: string;
  paciente: Partial<DadosPaciente>;
  relato?: Relato;
  sintomasIdentificados: SintomaExtraido[];
  perguntas: PerguntaAdaptativa[];
  respostas: RespostaAdaptativa[];
  nivelDor?: NivelDor;
  sinaisVitais?: SinaisVitais;
  resultado?: ClassificarResponse;
}

/* =================================================================
 * 9. PAINEL ELETRÔNICO — FILA EM TEMPO REAL (client ↔ server)
 *    Retornado por GET /api/triage/queue e POST /api/triage/queue/submit
 * ================================================================= */

export type QueueColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue';
export type QueueStatus = 'atendido_urgente' | 'aguardando' | 'chamado' | 'em_atendimento';

export interface QueuePatient {
  id: string;
  name: string;
  age: number;
  color: QueueColor;
  title: string;
  status: QueueStatus;
  joinedAt: string;
  position?: number;
}
