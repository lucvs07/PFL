# PFL — README, Docker, CI e deploy da v1 (design)

Data: 2026-10-12 · Escopo: infraestrutura em volta do código dos Planos 1–4 (nenhuma regra de jogo muda).

## Objetivo

Qualquer pessoa clona o repositório e sobe o jogo com um comando; todo PR roda os testes sozinho; a primeira versão fica publicada de graça para um playtest pequeno.

**Fora de escopo:** escala, múltiplas instâncias, persistência de partidas, domínio próprio, monitoramento.

## Premissas (confirmadas ou assumidas)

- Confirmado: deploy grátis — servidor no **Render (free)**, cliente no **GitHub Pages**; Fly.io descartado por ser pago.
- Confirmado: PR #6 já está na `main`; as branches `pfl-1-engine` … `pfl-4-client` estão todas mergeadas (local e `origin`).
- Assumido: CI no GitHub Actions; README em português; Node 24 (versão local).
- Limite aceito do plano grátis: o servidor "dorme" após ~15 min sem tráfego (cold start ≈ 1 min) e partidas em memória se perdem num restart. Os termos do Render devem ser conferidos na página oficial no momento do deploy.

## 1. Limpeza de branches

Apagar `pfl-1-engine`, `pfl-2-sim`, `pfl-3-server`, `pfl-4-client` localmente e em `origin`, **só após confirmação explícita da lista** (apagar remoto é difícil de desfazer). A branch de trabalho desta infra também é descartável depois do merge.

## 2. Ajustes mínimos no servidor

1. `apps/server/src/main.ts` lê `CORS_ORIGIN` (lista separada por vírgula) e passa a `corsOrigin`; sem a variável mantém o padrão atual (qualquer origem), para o dev local não mudar. No deploy ela vale a origem do GitHub Pages (`https://lucvs07.github.io`).
2. `GET /health` → `200 ok` no `httpServer`, sem interferir no caminho `/socket.io`. Usado pelo healthcheck do Render e do compose. Coberto por teste em `apps/server/test`.

## 3. Docker (execução local e base do deploy)

- `docker/server.Dockerfile`: `node:24-alpine`, `npm ci`, copia o monorepo, `CMD tsx apps/server/src/main.ts`; `PORT` padrão 3001; `HEALTHCHECK` em `/health`.
- `docker/client.Dockerfile`: estágio de build (`npm ci` + `vite build`, com `ARG VITE_SERVER_URL` e `ARG BASE_PATH`) e estágio final `nginx:alpine` servindo `dist/`.
- `docker-compose.yml`: `server` (:3001) e `client` (:8080); `VITE_SERVER_URL` padrão `http://localhost:3001`.
- `.dockerignore` (node_modules, dist, .git, .superpowers, docs).
- O download de sprites roda no build do cliente (`prebuild`, com `--allow-missing`); sem rede o build segue com o fallback do `<Sprite>`.

## 4. CI — `.github/workflows/ci.yml`

Dispara em `pull_request` e `push` na `main`. Node 24, cache do npm.

| Job | Passos |
|---|---|
| `check` | `npm ci` → `npm run typecheck` → `npm test` → `npm run build:client` |
| `docker` | `docker build` das duas imagens (sem push) |
| `gate` | `npm run test:gate`; só em `push` na `main` e `workflow_dispatch` (é o portão de balanceamento, mais lento) |

## 5. Deploy

- **Servidor — `render.yaml`** (blueprint): web service Docker, plano `free`, `dockerfilePath: docker/server.Dockerfile`, `healthCheckPath: /health`, `autoDeploy` na `main`, env `CORS_ORIGIN`.
- **Cliente — `.github/workflows/pages.yml`**: em push na `main`, builda com `BASE_PATH=/PFL/` e `VITE_SERVER_URL=${{ vars.VITE_SERVER_URL }}`, publica via `actions/deploy-pages`. `vite.config.ts` passa a aceitar `base` por env (padrão `/`).
- **`docs/DEPLOY.md`**: passos manuais que o código não faz — criar o serviço no Render pelo blueprint; ativar Pages com fonte "GitHub Actions"; criar a variável `VITE_SERVER_URL` apontando para a URL do Render; avisar sobre o cold start.

## 6. README.md (português)

O que é o jogo; estrutura (`packages/*`, `apps/*`); requisitos; rodar sem Docker (`npm ci`, `dev:server`, `dev:client`); rodar com Docker (`docker compose up`); comandos de teste (`test`, `test:gate`, `typecheck`, `sim`); nota sobre sprites; visão do CI; link para `docs/DEPLOY.md`.

## Testes e verificação

- Teste automatizado do `/health` e do parsing de `CORS_ORIGIN`.
- Local: `docker compose up --build`, conferir `/health` e o cliente em :8080; rodar os mesmos comandos do CI.
- **Não verificável por mim:** o deploy real no Render/Pages — depende dos passos manuais do `DEPLOY.md`; o resultado será reportado como não testado até o usuário concluir.

## Ordem de execução

1. Spec aprovado → plano. 2. Ajustes do servidor (TDD). 3. Docker. 4. CI. 5. Deploy files. 6. README/DEPLOY. 7. PR. 8. Confirmar e apagar as branches antigas.
