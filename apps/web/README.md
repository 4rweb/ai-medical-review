# apps/web — Frontend (Vite + React)

Aplicação do paciente (Protocolo de Manchester). **Somente frontend** — toda
a lógica de IA e de fila vive no backend NestJS (`apps/apis`).

## Rodar localmente

Pré-requisitos: Node 20+, pnpm 11+. Rode `pnpm install` na **raiz** do monorepo.

```bash
# 1. Suba o backend (em apps/apis): pnpm dev:apis  (porta 3001)
# 2. Configure o .env (copie de .env.example). O INTERNAL_API_KEY DEVE ser
#    igual ao do apps/apis/.env — ele é usado só pelo proxy do Vite (servidor).
cp .env.example .env

# 3. Suba o frontend:
pnpm dev            # http://localhost:3000
```

## Como fala com a API

O código chama `/api/*` na mesma origem. O **proxy do Vite**
(`vite.config.ts`) encaminha para o NestJS injetando o header
`x-internal-api-key` no lado do servidor — o segredo nunca vai ao browser.
Em produção (build estático), o host deve fazer esse hop com o segredo.
