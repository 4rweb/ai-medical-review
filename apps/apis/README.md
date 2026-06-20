# apps/apis — Backend NestJS

Backend de triagem da aplicação AI Medical Review. Isolado do frontend
(`apps/web`); compartilha tipos via `@medical/contracts`.

## Scripts

```bash
pnpm dev      # nest start --watch (http://localhost:3001/api)
pnpm build    # nest build -> dist/main.js
pnpm start    # node dist/main.js
pnpm lint     # tsc --noEmit
```

## Variáveis de ambiente (`.env`)

Veja `.env.example`. Principais:

| Var | Descrição |
|-----|-----------|
| `API_PORT` | Porta do servidor (padrão 3001) |
| `WEB_ORIGIN` | Origem(ns) autorizada(s) no CORS (vírgula p/ múltiplas) |
| `INTERNAL_API_KEY` | Segredo compartilhado com o proxy BFF da web |
| `DASHSCOPE_API_KEY` | Chave Qwen Cloud (DashScope) |
| `DASHSCOPE_API_URL` | Base URL OpenAI-compatible da DashScope |
| `QWEN_MODEL` | Modelo dos agentes (padrão `qwen3.6-flash`) |
| `QWEN_MODEL_FALLBACKS` | (opcional) modelos de fallback p/ 503, vírgula |

## Segurança

- **`ApiKeyGuard`** (global): exige `x-internal-api-key === INTERNAL_API_KEY`;
  reforça com checagem de `Origin`/`Referer` quando presentes. `@Public()`
  isenta o healthcheck.
- **CORS** restrito a `WEB_ORIGIN`.
- **ThrottlerGuard**: 60 req/min por IP.
- **helmet** + **ValidationPipe** global.

## Estrutura

```
src/
├── main.ts                  bootstrap (CORS, helmet, prefixo /api)
├── app.module.ts            ConfigModule + Throttler + guards globais
├── health.controller.ts     GET /api/health (público)
├── common/                  guard de segredo, @Public, exception filter
├── qwen/                    QwenService (DashScope) + retry/fallback de modelo
└── triage/                  controller, service (IA + fallback local), fila
```
