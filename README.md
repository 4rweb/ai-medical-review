# AI Medical Review — Monorepo

Medical pre-triage (Manchester Protocol) powered by a Qwen agent pipeline.
Frontend and backend are **isolated apps** in a pnpm workspace.

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
│   ├── web/    → Frontend (Vite + React + Tailwind/DaisyUI). Frontend only.
│   ├── apis/   → NestJS backend. /api/triage/* endpoints + Qwen AI + ApsaraDB.
│   └── mcp/    → MCP server exposing the clinical tools (stdio + HTTP).
└── packages/
    ├── contracts/  → @medical/contracts: shared typed contract.
    └── clinical/   → @medical/clinical: deterministic clinical logic (single
                      source used by the backend function calling AND the MCP).
```

## Security architecture (public app)

The frontend calls `/api/*` on the **same origin**. In dev, the **Vite proxy**
forwards to NestJS (`:3001`) and injects the `x-internal-api-key` header on the
**server side** — the secret never reaches the bundle/browser. NestJS requires
that secret (+ CORS allowlist + Origin/Referer + rate-limit), so that **only the
web app** can use the API.

> In production (static web), the host must inject the secret on the server hop
> (rewrite/Edge Function on Vercel, or `proxy_set_header` on nginx).

## Running (dev)

Prerequisites: Node 20+, pnpm 11+.

```bash
pnpm install                      # at the root (installs all 3 projects)

# Configure the .env files (copy from .env.example) — INTERNAL_API_KEY MUST be
# the same in apps/web/.env and apps/apis/.env.
cp apps/apis/.env.example apps/apis/.env
cp apps/web/.env.example  apps/web/.env

pnpm dev                          # starts web (:3000) + apis (:3001) in parallel
# or separately:
pnpm dev:apis                     # NestJS at http://localhost:3001/api
pnpm dev:web                      # Vite   at http://localhost:3000
```

## Endpoints (`apps/apis`, `/api` prefix)

| Method | Route                       | Purpose |
|--------|-----------------------------|---------|
| GET    | `/api/health`               | Healthcheck (public) |
| POST   | `/api/triage/analyze`       | Collector — symptoms + adaptive questions |
| POST   | `/api/triage/classify`      | Classifier — Manchester color |
| POST   | `/api/triage/transcrever`   | Qwen-ASR — audio → editable text |
| GET    | `/api/triage/queue`         | Real-time queue |
| POST   | `/api/triage/queue/submit`  | Add a patient to the queue |
| POST   | `/api/triage/queue/advance` | Advance the queue |

Every route except `/health` requires the `x-internal-api-key` header.

## AI

Qwen Cloud (DashScope, OpenAI-compatible), model **`qwen3.6-flash`** via the
`openai` SDK. If the key is missing or the AI fails/exceeds quota, a **local
fallback engine** (pt-BR rules) keeps the flow working.

The classifier uses **function calling** with two deterministic tools
(`verificarFaixaVital`, `buscarDisponibilidadeConsultorio`). The appointment
availability is read **from the tool-executor trail**, not from the model text.

Voice input is transcribed by **Qwen-ASR** (`qwen3-asr-flash`): the browser
re-encodes the recording to 16 kHz mono WAV and posts it as a base64 data URI;
the transcript lands in an **editable field** the patient can correct first.

## Database (ApsaraDB / PostgreSQL)

Persistence via **Drizzle ORM + `pg`**. Set `DATABASE_URL` in `apps/apis/.env`
and apply the migration:

```bash
pnpm --filter apis db:generate   # generates SQL from the schema (already versioned)
pnpm --filter apis db:migrate    # applies it to ApsaraDB
```

Without `DATABASE_URL`, the app degrades to in-memory storage (queue does not
persist; audit goes to the log only). The queue and the **audit trail** of
red-flag escalations (`audit_logs`) live in the database.

## MCP server

`apps/mcp` exposes the clinical tools over the **Model Context Protocol**,
reusing exactly the same `@medical/clinical` logic the backend function calling
uses — a canonical tool host, no duplication.

Two transports:

```bash
pnpm dev                    # starts api + web + MCP (HTTP) together
pnpm --filter mcp start     # always-on MCP server (Streamable HTTP)
                            # → http://localhost:3002/mcp  (health: /health)
pnpm --filter mcp inspect   # MCP Inspector via stdio (spawns the process on demand)
```

The HTTP mode is session-based (`mcp-session-id`): the client `initialize`s and
keeps the session on subsequent calls. Exposed tools: `verificarFaixaVital`,
`buscarDisponibilidadeConsultorio`.

## Documentation

- [Architecture + diagram](./docs/architecture.md)
- [Red-flag test script (§14)](./docs/red-flag-tests.md)
- [Project story](./docs/ai-medical-review-story.md)
- [Submission eligibility checklist](./docs/submission-checklist.md)
