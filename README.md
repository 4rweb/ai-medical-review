# AI Medical Review — Monorepo

Pré-triagem médica (Protocolo de Manchester) com pipeline de agentes Qwen.
Frontend e backend são **apps isolados** num workspace pnpm.

```
medical-review/
├── apps/
│   ├── web/    → Frontend (Vite + React + Tailwind/DaisyUI). SÓ frontend.
│   └── apis/   → Backend NestJS. Endpoints /api/triage/* + IA Qwen.
└── packages/
    └── contracts/  → @medical/contracts: contrato tipado compartilhado.
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
