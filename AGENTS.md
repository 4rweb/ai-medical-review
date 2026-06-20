# AI Medical Review — Documento de Contexto de Engenharia

> Este documento é a **memória de engenharia** do projeto. Ele complementa
> os arquivos do hackathon já presentes na pasta `docs/` (rules.md,
> resources.md, pricing.md, first-api-call.md, etc.). Aqui ficam as
> **decisões de arquitetura, o racional por trás delas e o mapeamento para
> os critérios de julgamento** — para servir de contexto ao construir o
> backend e os agentes.

---

## 1. Visão geral do produto

**AI Medical Review** é um **agente de pré-triagem médica**. O paciente
preenche, pelo celular, enquanto está a caminho do pronto-socorro (ou na
sala de espera). O sistema produz uma **classificação de risco preliminar**
no modelo do **Protocolo de Manchester** (vermelho, laranja, amarelo, verde,
azul) e orientações práticas, e transmite a ficha para o painel da equipe.

**Princípio inegociável:** é **apoio à decisão e organização de fila —
nunca diagnóstico.** Esse enquadramento aparece no tom da interface, nos
disclaimers e na arquitetura (camada de segurança determinística).

Protocolo de Manchester (referência de calibração):

| Cor      | Significado     | Espera alvo |
|----------|-----------------|-------------|
| Vermelho | Emergência      | 0 min (imediato) |
| Laranja  | Muito urgente   | ~10 min |
| Amarelo  | Urgente         | ~60 min |
| Verde    | Pouco urgente   | ~120 min |
| Azul     | Não urgente     | ~240 min |

Regra de prioridade na fila: **gravidade primeiro, horário de chegada como
desempate.** (Amarelo passa na frente de verde — ver bug conhecido nº 2.)

---

## 2. Track escolhido: **Track 4 — Autopilot Agent**

O app automatiza um fluxo de negócio real de ponta a ponta (relato →
análise → perguntas adaptativas → classificação → fila do hospital). A
regra do Track 4 praticamente descreve o projeto: *"handle ambiguous
inputs, invoke external tools, and incorporate human-in-the-loop checkpoints
at critical decision points... production-readiness over toy demos."*

- **Entrada ambígua:** o paciente fala/escreve com as próprias palavras.
- **Ferramentas externas:** function calling (agendamento, validação de vitais).
- **Human-in-the-loop:** transcrição editável (Passo 2) + tela de revisão (Passo 6).

Track 3 (Agent Society) também encaixa de forma secundária (pipeline
multi-agente), mas não vamos submeter nele: faltam negociação entre agentes
e ganho medível vs. baseline. **Submissão = Track 4.** Não espalhar o app
por vários tracks; aprofundar o que já é Track 4.

---

## 3. Arquitetura do sistema

```
App do paciente (Next.js)  ─┐
                            ├─►  Backend API (Node.js/TS · Alibaba Function Compute)
Painel admin (Next.js)     ─┘            │
                                         ▼
                            Pipeline multi-agente
                            Coletor → Classificador → Agendador
                                         │
                            ┌────────────┴────────────┐
                            ▼                         ▼
                     Qwen Cloud (DashScope)      ApsaraDB
                     raciocínio dos agentes      triagens · auditoria
                                                   ▲
                            painel admin lê ───────┘
```

- **Frontend:** React + **TanStack** (Router, Query, Form, Store) + Tailwind
  + DaisyUI. Pode ficar na **Vercel** (frontend não é "backend").
- **Backend:** **Node.js + TypeScript** na **Alibaba Function Compute**.
  Escolha por Node/TS para **compartilhar o mesmo contrato tipado**
  (`triagem.contract.ts`) entre front e back, sem drift.
- **IA:** **Qwen Cloud** via API DashScope (compatível com OpenAI):
  `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`.
  No Node, usa-se o próprio SDK da OpenAI trocando `baseURL` e `apiKey`.
- **Banco:** **ApsaraDB** (gerenciado, Alibaba) — guarda as triagens e
  alimenta o painel/fila em tempo real (WebSocket ou polling).

---

## 4. Pipeline multi-agente

Três agentes com papéis distintos, contexto fluindo de forma tipada entre eles:

1. **Coletor** — recebe o relato livre (texto/áudio transcrito), extrai
   sintomas e red-flags preliminares, e **gera as perguntas adaptativas**
   (o conjunto de perguntas muda conforme o relato).
2. **Classificador de risco** — recebe relato + respostas + dor + sinais
   vitais e produz a **cor de Manchester com justificativa explícita** e
   fatores determinantes. (Maior aposta de qualidade — usa o modelo mais forte.)
3. **Agendador** — usa **function calling** para buscar disponibilidade e
   sugerir encaixe/tempo de espera. Pode começar como mock realista e
   ganhar profundidade depois.

---

## 5. Modelos Qwen por agente

Usar modelos diferentes por tarefa também pontua ("sophisticated use of APIs"):

| Agente         | Modelo         | Por quê |
|----------------|----------------|---------|
| Classificador  | `qwen3.7-max`  | Raciocínio clínico mais difícil; precisão crítica |
| Coletor        | `qwen3.7-plus` | Equilíbrio qualidade/velocidade |
| Tarefas leves  | `qwen3.6-flash`| Custo/latência (ex.: normalização de texto) |

Recursos da API que serão usados: **structured output (JSON schema)**,
**function calling**, e (alvo) **MCP**.

---

## 6. Contrato de dados

A fonte única da verdade é o arquivo **`triagem.contract.ts`** (tipos
TypeScript compartilhados front/back). Duas chamadas de IA:

- **A) `POST /triagem/analisar`** (Coletor) → `AnalisarRelatoResponse`
  (sintomas extraídos, red-flags, **perguntas adaptativas renderizáveis**,
  alerta de emergência opcional).
- **B) `POST /triagem/classificar`** (Classificador + Agendador) →
  `ClassificarResponse` (nível Manchester, **confiança**, **justificativa**,
  fatores determinantes, espera estimada, recomendações, red-flags,
  flag de emergência, agendamento, disclaimer).

`ClassificarResponse` **é o schema** que se passa ao Qwen via structured
output — o contrato e o schema são a mesma coisa.

Nota de UX: o campo `confianca` (0..1) é para o **painel da equipe**, não
para o paciente (mostrar "72% de confiança" assusta/confunde quem está com dor).

---

## 7. Decisões de arquitetura (ADRs)

### ADR-01 — Track 4 (Autopilot Agent)
Ver seção 2. Decisão: submeter no Track 4; não diluir em outros tracks.

### ADR-02 — Backend em Node.js/TypeScript
Motivo principal: **contrato tipado de ponta a ponta** (mesmo
`triagem.contract.ts` no front e no back), fluência do time em TS, e
integração Qwen idêntica à de Python (API OpenAI-compatível). Python só
venceria se houvesse ML local/processamento pesado — não é o caso (apenas
*chamamos* a API). Narrativa de engenharia forte: "stack tipado sem drift".

### ADR-03 — Banco: ApsaraDB (gerenciado, Alibaba)
Reforça a presença na infra Alibaba e simplifica o painel em tempo real.

### ADR-04 — Backend hospedado na Alibaba Function Compute (prova de deploy)
A regra pede "backend running on Alibaba Cloud" **e** "prova = link para um
arquivo de código que use serviços/APIs da Alibaba". DashScope/Qwen **já é**
serviço Alibaba (satisfaz a prova pela letra). Mas para eliminar a
interpretação de "tem que estar *hospedado* lá", **hospedamos o backend na
Function Compute**. Frontend permanece na Vercel. Pendência: confirmar no
Discord do hackathon se hospedar é obrigatório ou se chamar a API basta —
mas vamos hospedar de qualquer forma para zerar o risco.

### ADR-05 — **NÃO usar RAG vetorial. Usar grounding estático + structured output + validação determinística.** *(decisão central)*

**Contexto do debate.** Surgiu a tese de que "sem RAG não passa / RAG é o
mínimo / RAG resolve alucinação". Analisamos a fundo. Conclusão: **RAG
vetorial não é a ferramenta certa para o problema deste app**, e em saúde
pode até piorar a segurança.

**A distinção que resolve o debate** (mérito da discussão com o amigo):
existem **dois conhecimentos diferentes** em jogo, e eles pedem tratamentos
diferentes:

1. **A regra do Manchester** (discriminadores → cor → tempo). É **pequena,
   finita e estável**. Cabe no contexto. Não precisa de retrieval — basta
   **injetar a tabela oficial no prompt do Classificador (grounding
   estático)**. Ancorar em fonte oficial sem retriever no meio para errar.

2. **O conhecimento clínico das doenças** (o que é cefaleia thunderclap, o
   que torna uma dor torácica perigosa, etc.). Isso é **vasto** e hoje vem
   dos pesos do Qwen. *Aqui* mora o risco real de alucinação — o julgamento
   clínico de gravidade.

**Por que mesmo assim não fazemos RAG sobre conhecimento clínico:**

- **"Zero alucinação com RAG" é mito.** RAG troca "inventar do nada" por
  "ancorar no que o retriever trouxe". Se o retriever puxa o trecho errado
  (provável com sintomas ambíguos), o modelo **erra com fonte** — alucinação
  fundamentada, *mais difícil de auditar*. Em triagem, o caso ambíguo é
  justamente o perigoso.
- **O gargalo é a base, não a infra.** "RAG monta em um dia" mede subir
  Qdrant + embeddings + ingestão. **Não** mede curar um corpus clínico
  confiável, em português, que não introduza erro. Base clínica séria
  (diretrizes oficiais, UpToDate) é licenciada/cara e não se cura em 19 dias.
  Indexar conteúdo médico aleatório da web é **pior** que confiar no Qwen.
- **Custo de oportunidade.** RAG não toca **70%+ da nota** (Innovation/arq.,
  Problem Value, Presentation) e compete por horas com error handling,
  testes de red-flag, MCP e a demo — que *estão* nos critérios.

**O que fazemos no lugar** (ataca o medo real — alucinação no que importa —
de forma auditável):

- **Grounding estático** da tabela de discriminadores de Manchester no
  contexto do Classificador.
- **Structured output com schema** (`ClassificarResponse`) — controla formato.
- **Justificativa explícita** — torna o raciocínio auditável.
- **Validador determinístico de red-flags** (ver seção 9) — código que
  **sobrepõe** a decisão da IA quando há sinal crítico. Conhecimento perigoso
  vira **código auditável**, não memória do modelo.
- **Function calling para fatos verificáveis** (faixas de risco de vitais,
  idade) — em vez de o modelo "lembrar", uma tool determinística retorna.

**Frase-resumo da decisão:** *para um app de saúde, fonte que eu controlo e
audito > retriever que eu torço para puxar o chunk certo.*

### ADR-06 — MCP como caminho de sofisticação alinhado ao critério
O critério cita **nominalmente** "custom skills, **MCP integrations**" como
exemplos de uso sofisticado de API. **RAG não é citado.** Logo, se buscamos
um "selo" reconhecível na régua, o alvo é **expor nossas tools via um
servidor MCP** (ex.: disponibilidade de consultório, validação de sinais
vitais), não RAG.

### ADR-07 — Não usar TanStack AI
Ótima lib, mas otimizada para **chat com streaming / AG-UI**. Nosso fluxo é
**estruturado em etapas** com 2 chamadas discretas de structured output.
Além disso: **sem adapter nativo de Qwen** (só dá para tentar via
compat-OpenAI, não testado) e está em **beta**. Risco desnecessário a 19
dias. Ficamos com **OpenAI SDK → DashScope + TanStack Query**.

---

## 8. Estratégia anti-alucinação (resumo operacional)

Camadas, da mais "mole" para a mais "dura":

1. **Grounding estático** — tabela de Manchester no prompt.
2. **Structured output** — schema obriga o formato de saída.
3. **Justificativa + fatores determinantes** — raciocínio auditável.
4. **Function calling** — fatos verificáveis vêm de código, não da memória.
5. **Validador determinístico de red-flags** — a rede de segurança que
   **sobrepõe** a IA. É a camada que de fato derruba a alucinação *perigosa*.

Nenhuma promete "zero alucinação" — a meta é **alucinação contida e
auditável**, com a decisão crítica protegida por código determinístico.

---

## 9. Camada de segurança clínica — validador determinístico de red-flags

Lista curada de condições "não pode errar" (10–20). Se o relato/respostas
batem com um red-flag, o código **força** a escalada, independentemente do
que a IA classificou. Exemplos de red-flags a tratar:

- Cefaleia súbita e explosiva ("a pior da vida") → suspeita de thunderclap → vermelho.
- Dor torácica com irradiação para braço/mandíbula + sudorese fria.
- Falta de ar intensa / dificuldade para falar.
- Sinais de AVC (fraqueza súbita, fala arrastada, assimetria facial).
- Alteração de consciência, convulsão.
- SpO₂ baixa, instabilidade de sinais vitais.
- Sangramento intenso, trauma grave.

Fluxo: `resultado_IA` → `validadorRedFlags(payload)` → se red-flag de
severidade alta e cor da IA < esperada, **eleva a cor** e marca
`emergencia = true`. Tudo logado para auditoria.

---

## 10. Function calling / tools (caminho principal de sofisticação)

Tools determinísticas (e candidatas a expor via MCP):

- `verificarFaixaVital(tipo, valor, idade)` → normal/alerta/crítico.
- `buscarDisponibilidadeConsultorio(especialidade)` → slots (mock no início).
- `consultarDiscriminadorManchester(sintoma)` → discriminador aplicável.
- `validarRedFlags(payload)` → lista de red-flags acionados.

Benefício: o conhecimento crítico fica em **código testável**, e o uso de
tools é exatamente o que os critérios premiam.

---

## 11. Segurança, ética e conformidade

- **Pré-triagem, não diagnóstico** — em todo lugar (tom + disclaimer fixo).
- **Consentimento LGPD** — checkbox obrigatório no Passo 1 (dado sensível de saúde).
- **Saída de emergência sempre visível** — "Emergência? Ligar 192" (SAMU)
  em todas as telas; quem está em risco real não fica preso no formulário.
- **Sinais vitais opcionais chegam como `null`** se pulados (nunca o valor
  padrão do slider) — senão a IA recebe dado falso.
- **Orientações por cor revisadas** — evitar conselho médico ativo arriscado
  (ex.: jejum) sem necessidade; manter disclaimer.

---

## 12. Mapeamento para os Critérios de Julgamento

> Stage One é **pass/fail** (usa Qwen de verdade + encaixa no tema → passamos
> folgado). Stage Two são os 4 critérios abaixo. "Só chamada de API não passa"
> confunde os dois estágios — nosso uso de API **não** é raso.

| Critério (peso) | Como o projeto pontua |
|---|---|
| **Technical Depth & Engineering (30%)** | Pipeline multi-agente; **function calling**; **structured output com schema**; modelos Qwen distintos por tarefa; alvo **MCP** (citado na régua); validador determinístico como componente custom. |
| **Innovation & AI Creativity (30%)** | Arquitetura modular (3 agentes + contrato tipado); **error handling** real nas chamadas; perguntas adaptativas geradas pela IA; raciocínio **explicável** (justificativa), não caixa-preta; stack TanStack coeso. |
| **Problem Value & Impact (25%)** | Dor real e cronometrada (gargalo de triagem no SUS/Manchester); **segurança levada a sério** (red-flags, LGPD, disclaimer); potencial claro de produtização. Diferencial que muitos concorrentes vão negligenciar. |
| **Presentation & Documentation (15%)** | Diagrama de arquitetura; **este `docs.md` + ADRs** no repo; demo de 3 min focada no raciocínio da IA e no loop fechado. |

**Decisão estratégica:** RAG só tocaria (parcialmente) o 1º critério e
*derruba* "error handling/clean code" se mal feito. Os outros **70%** vêm de
arquitetura limpa, impacto real e apresentação clara — onde vamos investir.

---

## 13. Pendências e bugs conhecidos (review das telas)

1. **Passo 3:** chips "DESTAQUE CLÍNICO" e "MANCHESTER AI" são placeholder —
   trocar pelos **sintomas reais extraídos** do relato.
2. **Fila:** amarelo (urgente) aparece **atrás** de verde (pouco urgente).
   Corrigir ordenação: gravidade primeiro, chegada como desempate.
3. **Tempo de espera:** amarelo aparece "60-120 min" (invade faixa do verde).
   Calibrar: amarelo ~60, verde ~120.
4. **Payload de vitais:** garantir `null` quando pulado (não o default do slider).
5. **Coerência relato × escala:** "forte" no texto vs "5/10" — sinalizar
   quando qualitativo e numérico divergirem muito.
6. **"Sexo" como critério:** não listar dado demográfico como critério
   quando não discriminou a decisão.
7. **Typo (já visto antes):** "neste momento comercial" → "neste momento".

---

## 14. Roteiro de teste de red-flags (obrigatório antes da demo)

Validar a calibração com casos-limite. Entradas e cor **esperada**:

- "Dor de cabeça súbita e explosiva, a pior da minha vida." → **Vermelho**
- "Dor no peito que irradia pro braço, com suor frio." → **Vermelho/Laranja**
- "Falta de ar intensa, não consigo completar frases." → **Vermelho/Laranja**
- "Fraqueza súbita de um lado do corpo e fala arrastada." → **Vermelho**
- "Febre alta há 1 dia, sem outros sinais." → **Amarelo/Verde**
- "Dor de garganta leve há 2 dias." → **Verde/Azul**

Se qualquer vermelho cair em amarelo/verde, é **subtriagem** — corrigir
prompt + validador antes de prosseguir. Idealmente, revisão por alguém da saúde.

---

## 15. Checklist de entregáveis obrigatórios

- [ ] Repo **público** com **LICENSE (MIT) na raiz** desde o 1º commit
      (visível no "About" do GitHub).
- [ ] Frase de **projeto novo** na descrição (protótipo visual anterior
      descartado; agente/back/IA construídos do zero no período).
- [ ] **Prova de Alibaba Cloud**: link para arquivo de código (ex.
      `qwenClient.ts`) que usa serviço/API Alibaba (DashScope) + backend na
      Function Compute.
- [ ] **Diagrama de arquitetura** anexado.
- [ ] **Vídeo < 3 min** (YouTube/Vimeo/Youku), público; legendado em inglês
      se falado em PT.
- [ ] **Descrição em texto** (em inglês; história já pronta em PT e EN).
- [ ] Identificar **Track 4**.
- [ ] (Bônus) **Blog post** público da jornada com Qwen Cloud → prêmio extra.
- [ ] Materiais em **inglês** ou com tradução.

**Prazo:** 9/jul, 14h Pacific = **18h Brasília**. Reservar os últimos 3-4
dias só para vídeo + diagrama + prova de deploy + revisão de elegibilidade.
