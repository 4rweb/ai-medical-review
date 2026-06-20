# AI Medical Review — Monorepo

Pré-triagem médica (Protocolo de Manchester) com pipeline de agentes Qwen.
Frontend e backend são **apps isolados** num workspace pnpm.

> **Global AI Hackathon with Qwen Cloud — Track 4: Autopilot Agent.**
> End-to-end automation of a real clinical workflow: free-text/voice report →
> AI analysis → adaptive questions → Manchester risk classification → scheduling
> → hospital queue, with deterministic safety overrides and human-in-the-loop
> checkpoints (editable transcription + review screen + schedule confirmation).
>
> **New project:** built from scratch and significantly developed during the
> Hackathon Submission Period (an earlier visual prototype was discarded; the
> agent pipeline, NestJS backend and Qwen integration are new work).
>
> **License:** MIT (see [`LICENSE`](./LICENSE)).
>
> **Proof of Alibaba Cloud usage:** the backend calls Alibaba's Qwen Cloud
> (DashScope) in [`apps/apis/src/qwen/qwen.service.ts`](./apps/apis/src/qwen/qwen.service.ts).

```
medical-review/
├── apps/
│   ├── web/    → Frontend (Vite + React + Tailwind/DaisyUI). SÓ frontend.
│   ├── apis/   → Backend NestJS. Endpoints /api/triage/* + IA Qwen + ApsaraDB.
│   └── mcp/    → Servidor MCP expondo as ferramentas clínicas (stdio).
└── packages/
    ├── contracts/  → @medical/contracts: contrato tipado compartilhado.
    └── clinical/   → @medical/clinical: lógica clínica determinística (fonte
                      única usada pelo function calling do backend E pelo MCP).
```

## Arquitetura de segurança (app público)

O frontend chama `/api/*` na **mesma origem**. Em dev, o **proxy do Vite**
encaminha para o NestJS (`:3001`) e injeta o header `x-internal-api-key` no
**lado do servidor** — o segredo nunca vai ao bundle/browser. O NestJS exige
esse segredo (+ CORS allowlist + Origin/Referer + rate-limit), de modo que
**só a aplicação web** consegue usar a API.

> Em produção (web estático), o host deve injetar o segredo no hop servidor
> (rewrite/Edge Function na Vercel, ou `proxy_set_header` no nginx).

## Como rodar (dev)

Pré-requisitos: Node 20+, pnpm 11+.

```bash
pnpm install                      # na raiz (instala os 3 projetos)

# Configure os .env (copie dos .env.example) — o INTERNAL_API_KEY DEVE ser
# o mesmo em apps/web/.env e apps/apis/.env.
cp apps/apis/.env.example apps/apis/.env
cp apps/web/.env.example  apps/web/.env

pnpm dev                          # sobe web (:3000) + apis (:3001) em paralelo
# ou separadamente:
pnpm dev:apis                     # NestJS em http://localhost:3001/api
pnpm dev:web                      # Vite   em http://localhost:3000
```

## Endpoints (`apps/apis`, prefixo `/api`)

| Método | Rota                     | Função |
|--------|--------------------------|--------|
| GET    | `/api/health`            | Healthcheck (público) |
| POST   | `/api/triage/analyze`    | Coletor — sintomas + perguntas adaptativas |
| POST   | `/api/triage/classify`   | Classificador — cor de Manchester |
| GET    | `/api/triage/queue`      | Fila em tempo real |
| POST   | `/api/triage/queue/submit`  | Insere paciente na fila |
| POST   | `/api/triage/queue/advance` | Avança a fila |

Todas as rotas (exceto `/health`) exigem o header `x-internal-api-key`.

## IA

Qwen Cloud (DashScope, OpenAI-compatible), modelo **`qwen3.6-flash`** via SDK
`openai`. Se a chave estiver ausente ou a IA falhar/estourar cota, há um
**motor de fallback local** (regras PT-BR) que mantém o fluxo funcionando.

O classificador usa **function calling** com duas ferramentas determinísticas
(`verificarFaixaVital`, `buscarDisponibilidadeConsultorio`). A disponibilidade
do encaixe é lida **da trilha do executor de tools**, não do texto do modelo.

## Banco de dados (ApsaraDB / PostgreSQL)

Persistência via **Drizzle ORM + `pg`**. Configure `DATABASE_URL` em
`apps/apis/.env` e aplique a migração:

```bash
pnpm --filter apis db:generate   # gera SQL a partir do schema (já versionado)
pnpm --filter apis db:migrate    # aplica no ApsaraDB
```

Sem `DATABASE_URL`, o app degrada para armazenamento em memória (fila não
persiste; auditoria vai só para o log). A fila e a **trilha de auditoria** de
elevações de red-flag (`audit_logs`) ficam no banco.

## Servidor MCP

`apps/mcp` expõe as ferramentas clínicas via **Model Context Protocol**,
reaproveitando exatamente a mesma lógica de `@medical/clinical` usada pelo
function calling do backend — host canônico de tools, sem duplicação.

Dois transportes:

```bash
pnpm dev                    # sobe api + web + MCP (HTTP) juntos
pnpm --filter mcp start     # servidor MCP sempre ligado (Streamable HTTP)
                            # → http://localhost:3002/mcp  (health: /health)
pnpm --filter mcp inspect   # MCP Inspector via stdio (sobe o processo sob demanda)
```

O modo HTTP usa sessão (`mcp-session-id`): o cliente faz `initialize` e mantém a
sessão nas chamadas seguintes. Ferramentas expostas: `verificarFaixaVital`,
`buscarDisponibilidadeConsultorio`.
