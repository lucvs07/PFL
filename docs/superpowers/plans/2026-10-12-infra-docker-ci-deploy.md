# README, Docker, CI e deploy da v1 — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Subir o jogo com `docker compose up`, rodar typecheck/testes/build em todo PR e deixar a v1 publicável de graça (servidor no Render, cliente no GitHub Pages).

**Architecture:** O código de jogo não muda. O servidor ganha só `CORS_ORIGIN` e `GET /health`. Docker, CI e deploy são arquivos novos na raiz (`docker/`, `.github/workflows/`, `render.yaml`) mais README e `docs/DEPLOY.md`.

**Tech Stack:** Node 24, npm workspaces, Socket.IO 4, Vite 8, Vitest 5, Docker/compose, nginx, GitHub Actions, Render (blueprint), GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-12-infra-docker-ci-deploy-design.md`

## Global Constraints

- Node 24 em CI e nas imagens (`node:24-alpine`).
- Servidor lê `PORT` (padrão 3001) e `CORS_ORIGIN` (lista separada por vírgula; ausente = qualquer origem, como hoje).
- `GET /health` responde `200` com corpo `ok`; o caminho `/socket.io` não pode ser afetado.
- Cliente: `VITE_SERVER_URL` (padrão `http://localhost:3001`) e `BASE_PATH` (padrão `/`, `/PFL/` no Pages) entram no build, não em runtime.
- Textos de README/DEPLOY e comentários em português, como o resto do projeto.
- Commits terminam com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Trabalho na branch `infra-docker-ci-deploy`; nada vai direto para `main`.
- Apagar branches remotas só com confirmação explícita do usuário.

## Review Focus

- `CORS_ORIGIN` com barra final (`https://x.github.io/`) nunca casa com o header `Origin` do navegador → deve ser normalizada (Task 1).
- `CORS_ORIGIN` vazio ou só espaços (variável criada em branco no Render) → comportamento padrão (qualquer origem), não lista vazia que bloqueia tudo (Task 1).
- `/health?x=1` e `HEAD /health` também respondem 200; qualquer outro caminho HTTP responde 404 e não pendura a conexão (Task 1).
- Build do cliente sem rede (sprites não baixam) não pode quebrar o CI nem a imagem (Task 3).
- Cliente servido em subpasta (`/PFL/`): os assets e os sprites usam `BASE_URL`; conferir o `dist` gerado (Task 5).

---

### Task 1: Servidor — `CORS_ORIGIN` e `/health`

**Files:**
- Create: `apps/server/src/config.ts`
- Create: `apps/server/test/config.test.ts`
- Create: `apps/server/test/http.test.ts`
- Modify: `apps/server/src/server.ts:52` (o `createServer()`)
- Modify: `apps/server/src/main.ts`

**Interfaces:**
- Produces: `parseCorsOrigin(raw: string | undefined): string | string[] | true` em `apps/server/src/config.ts`.

- [ ] **Step 1: Escrever os testes que falham**

`apps/server/test/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseCorsOrigin } from '../src/config';

describe('parseCorsOrigin', () => {
  it('sem valor (ou vazio/espaços) libera qualquer origem, como no dev local', () => {
    expect(parseCorsOrigin(undefined)).toBe(true);
    expect(parseCorsOrigin('')).toBe(true);
    expect(parseCorsOrigin('  , ')).toBe(true);
  });
  it('uma origem vira string', () => {
    expect(parseCorsOrigin('https://lucvs07.github.io')).toBe('https://lucvs07.github.io');
  });
  it('várias origens viram lista, com espaços aparados', () => {
    expect(parseCorsOrigin('https://a.io, http://localhost:5173')).toEqual(['https://a.io', 'http://localhost:5173']);
  });
  it('remove a barra final, que nunca casaria com o header Origin', () => {
    expect(parseCorsOrigin('https://lucvs07.github.io/')).toBe('https://lucvs07.github.io');
  });
});
```

`apps/server/test/http.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { createPflServer, type PflServer } from '../src/server';

let server: PflServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

describe('HTTP simples do servidor', () => {
  it('GET /health responde 200 ok (também com query string)', async () => {
    server = await createPflServer();
    for (const path of ['/health', '/health?x=1']) {
      const res = await fetch(`http://localhost:${server.port}${path}`);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('ok');
    }
  });
  it('HEAD /health responde 200', async () => {
    server = await createPflServer();
    const res = await fetch(`http://localhost:${server.port}/health`, { method: 'HEAD' });
    expect(res.status).toBe(200);
  });
  it('outros caminhos respondem 404 sem pendurar', async () => {
    server = await createPflServer();
    const res = await fetch(`http://localhost:${server.port}/nada`);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/server/test/config.test.ts apps/server/test/http.test.ts`
Expected: FAIL (`../src/config` não existe; `/health` pendura ou não dá 200).

- [ ] **Step 3: Implementar**

`apps/server/src/config.ts`:

```ts
/**
 * CORS_ORIGIN: origens permitidas, separadas por vírgula. Sem valor útil, libera qualquer origem
 * (o cliente Vite do dev roda em outra porta). A barra final é removida: o header Origin nunca a tem.
 */
export function parseCorsOrigin(raw: string | undefined): string | string[] | true {
  const origins = (raw ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  if (origins.length === 0) return true;
  return origins.length === 1 ? origins[0]! : origins;
}
```

Em `apps/server/src/server.ts`, trocar `const httpServer = createServer();` por:

```ts
  // O Socket.IO assume só /socket.io; o resto cai neste handler (healthcheck do Render/compose).
  const httpServer = createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0];
    if (path === '/health' && (req.method === 'GET' || req.method === 'HEAD')) {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(req.method === 'HEAD' ? undefined : 'ok');
      return;
    }
    res.writeHead(404);
    res.end();
  });
```

Em `apps/server/src/main.ts`: adicionar `import { parseCorsOrigin } from './config';` e trocar a criação por:

```ts
const server = await createPflServer({ port, corsOrigin: parseCorsOrigin(process.env.CORS_ORIGIN) });
```

- [ ] **Step 4: Rodar tudo do servidor e o typecheck**

Run: `npx vitest run apps/server && npm run typecheck`
Expected: PASS (incluindo os testes de integração existentes, que provam que `/socket.io` segue funcionando).

- [ ] **Step 5: Commit**

```bash
git add apps/server
git commit -m "feat(server): CORS_ORIGIN por env e GET /health

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Docker e docker compose

**Files:**
- Create: `.dockerignore`
- Create: `docker/server.Dockerfile`
- Create: `docker/client.Dockerfile`
- Create: `docker-compose.yml`

**Interfaces:**
- Consumes: `PORT`, `CORS_ORIGIN`, `/health` (Task 1); scripts `build:client` e `prebuild` do cliente.
- Produces: imagens `pfl-server` (porta `PORT`, padrão 3001) e `pfl-client` (nginx, porta 80), usadas pelo CI (Task 3) e pelo Render (Task 4).

- [ ] **Step 1: `.dockerignore`**

```
node_modules
**/node_modules
**/dist
.git
.github
.superpowers
docs
coverage
*.log
```

- [ ] **Step 2: `docker/server.Dockerfile`**

```dockerfile
FROM node:24-alpine
WORKDIR /app
COPY . .
# só o servidor, suas dependências de workspace (engine, protocol) e o tsx da raiz
RUN npm ci -w @pfl/server --include-workspace-root
ENV PORT=3001
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1
CMD ["npx", "tsx", "apps/server/src/main.ts"]
```

- [ ] **Step 3: `docker/client.Dockerfile`**

```dockerfile
FROM node:24-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci
ARG VITE_SERVER_URL=http://localhost:3001
ARG BASE_PATH=/
ENV VITE_SERVER_URL=$VITE_SERVER_URL BASE_PATH=$BASE_PATH
RUN npm run build:client

FROM nginx:alpine
COPY --from=build /app/apps/client/dist /usr/share/nginx/html
EXPOSE 80
```

- [ ] **Step 4: `docker-compose.yml`**

```yaml
# Subir tudo: docker compose up --build  →  jogo em http://localhost:8080
services:
  server:
    build:
      context: .
      dockerfile: docker/server.Dockerfile
    ports: ["3001:3001"]
  client:
    build:
      context: .
      dockerfile: docker/client.Dockerfile
      args:
        VITE_SERVER_URL: http://localhost:3001
    ports: ["8080:80"]
    depends_on: [server]
```

- [ ] **Step 5: Construir e verificar**

Run: `docker compose up --build -d && sleep 10 && curl -fsS localhost:3001/health && curl -fsSI localhost:8080 | head -1 && docker compose ps`
Expected: `ok`, `HTTP/1.1 200 OK`, servidor `healthy`.

Se o build do cliente falhar por falta de rede ao baixar sprites, o `prebuild` já usa `--allow-missing`; confira que o aviso aparece e o build termina.

- [ ] **Step 6: Derrubar e commitar**

```bash
docker compose down
git add .dockerignore docker docker-compose.yml
git commit -m "feat: Dockerfiles e docker compose para rodar local

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: CI no GitHub Actions

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `npm run typecheck`, `test`, `build:client`, `test:gate`; Dockerfiles (Task 2).

- [ ] **Step 1: Escrever o workflow**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build:client

  docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker build -f docker/server.Dockerfile -t pfl-server .
      - run: docker build -f docker/client.Dockerfile -t pfl-client .

  # portão de balanceamento (milhares de partidas): mais lento, fora dos PRs
  gate:
    if: github.event_name == 'push' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run test:gate
```

- [ ] **Step 2: Validar localmente o que o job `check` roda**

Run: `npm ci && npm run typecheck && npm test && npm run build:client`
Expected: tudo passa. (Se `act` ou `actionlint` estiverem instalados, rode-os no arquivo; senão a validação real é o primeiro run no PR.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: typecheck, testes, build e imagens Docker; gate em push na main

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Arquivos de deploy (Render + GitHub Pages)

**Files:**
- Create: `render.yaml`
- Create: `.github/workflows/pages.yml`
- Modify: `apps/client/vite.config.ts`
- Create: `docs/DEPLOY.md`

**Interfaces:**
- Consumes: imagem do servidor (Task 2), `CORS_ORIGIN` e `/health` (Task 1), `BASE_PATH`/`VITE_SERVER_URL` (Task 2).

- [ ] **Step 1: `vite.config.ts` aceita `base` por env**

Adicionar `base: process.env.BASE_PATH ?? '/',` dentro do `defineConfig` (antes de `plugins`).

- [ ] **Step 2: Conferir o build em subpasta**

Run: `BASE_PATH=/PFL/ npm run build:client && grep -o 'src="[^"]*"\|href="[^"]*"' apps/client/dist/index.html`
Expected: todo asset começa com `/PFL/`. O código de sprites já usa `import.meta.env.BASE_URL`. Se algum caminho absoluto sem base aparecer, corrigi-lo antes de seguir.

- [ ] **Step 3: `render.yaml`**

```yaml
services:
  - type: web
    name: pfl-server
    runtime: docker
    plan: free
    dockerfilePath: ./docker/server.Dockerfile
    dockerContext: .
    healthCheckPath: /health
    autoDeploy: true
    envVars:
      - key: CORS_ORIGIN
        value: https://lucvs07.github.io
```

O Render injeta `PORT` sozinho. Antes de commitar, conferir na documentação atual de blueprints do Render se `autoDeploy` ainda é a chave aceita (existe também `autoDeployTrigger`); usar a vigente.

- [ ] **Step 4: `.github/workflows/pages.yml`**

```yaml
name: Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run build:client
        env:
          BASE_PATH: /PFL/
          VITE_SERVER_URL: ${{ vars.VITE_SERVER_URL }}
      - uses: actions/upload-pages-artifact@v3
        with:
          path: apps/client/dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 5: `docs/DEPLOY.md`**

```markdown
# Deploy da v1 (Render + GitHub Pages)

Servidor no Render (plano grátis) e cliente no GitHub Pages. Passos manuais, uma vez só:

## 1. Servidor no Render
1. Em render.com, **New → Blueprint** e aponte para este repositório (lê o `render.yaml`).
2. Aguarde o primeiro deploy e copie a URL pública (algo como `https://pfl-server.onrender.com`).
3. Confira `<URL>/health` → `ok`.

## 2. Cliente no GitHub Pages
1. No repositório: **Settings → Pages → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables → New repository variable**:
   `VITE_SERVER_URL` = a URL do Render (sem barra final).
3. Rode o workflow **Pages** (Actions → Pages → Run workflow) ou faça push na `main`.
4. O jogo abre em `https://lucvs07.github.io/PFL/`.

## Limites do plano grátis
- O servidor dorme após ~15 min sem tráfego; o primeiro acesso depois disso leva ~1 min (cold start). Abra a página e aguarde antes de chamar os amigos.
- Reiniciar ou dormir derruba as partidas em andamento (ficam só em memória).
- Confira os termos atuais do Render na página oficial; eles mudam.

## Se o cliente não conectar
- `CORS_ORIGIN` (no `render.yaml`/painel) precisa ser exatamente a origem do Pages, sem caminho: `https://lucvs07.github.io`.
- `VITE_SERVER_URL` é lida no **build**: depois de mudá-la, rode o workflow Pages de novo.
```

- [ ] **Step 6: Verificar e commitar**

Run: `npm run typecheck && npm test`
Expected: PASS.

```bash
git add render.yaml .github/workflows/pages.yml apps/client/vite.config.ts docs/DEPLOY.md
git commit -m "feat(deploy): blueprint do Render, workflow do Pages e DEPLOY.md

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Ler o spec do jogo para descrever o projeto corretamente**

Ler o início de `docs/superpowers/specs/2026-10-10-pfl-core-design.md` e escrever a seção "O que é" em 2–3 frases fiéis a ele (não inventar regras).

- [ ] **Step 2: Escrever `README.md`** com estas seções, em português, comandos exatamente como abaixo:

````markdown
# PFL

<2–3 frases do passo 1>

## Estrutura
- `packages/engine` — regras e simulação da partida
- `packages/protocol` — tipos e códigos de time compartilhados
- `packages/data`, `packages/sim` — dados e simulador de balanceamento
- `apps/server` — servidor Socket.IO (salas e partidas)
- `apps/client` — cliente React + Phaser (Vite)

## Requisitos
Node 24+ e npm, ou apenas Docker.

## Rodar com Docker
```bash
docker compose up --build
```
Jogo em http://localhost:8080 (servidor em :3001, `GET /health`).

## Rodar sem Docker
```bash
npm ci
npm run dev:server   # :3001
npm run dev:client   # :5173 (baixa os sprites antes; sem rede segue com fallback)
```
Duas abas abertas simulam dois jogadores.

## Testes
```bash
npm test             # unitários e integração
npm run test:gate    # portão de balanceamento (lento)
npm run typecheck
npm run sim          # simulador de balanceamento (CLI)
```

## Variáveis
| Variável | Onde | Padrão |
|---|---|---|
| `PORT` | servidor | 3001 |
| `CORS_ORIGIN` | servidor (origens separadas por vírgula) | qualquer origem |
| `VITE_SERVER_URL` | build do cliente | http://localhost:3001 |
| `BASE_PATH` | build do cliente | `/` |

## CI e deploy
O CI (`.github/workflows/ci.yml`) roda typecheck, testes, build e as imagens Docker em todo PR; o gate roda em push na `main`. A publicação (Render + GitHub Pages) está em [docs/DEPLOY.md](docs/DEPLOY.md).
````

- [ ] **Step 3: Conferir que cada comando do README existe**

Run: `npm run | grep -E "dev:server|dev:client|test:gate|typecheck|sim|build:client"`
Expected: todos listados. Corrigir o README se algum nome divergir.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README com como subir, testar e publicar

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: PR, merge e limpeza de branches

**Files:** nenhum.

- [ ] **Step 1: Verificação final**

Run: `npm run typecheck && npm test && docker compose up --build -d && sleep 10 && curl -fsS localhost:3001/health && docker compose down`
Expected: tudo passa.

- [ ] **Step 2: Abrir o PR**

```bash
git push -u origin infra-docker-ci-deploy
gh pr create --base main --title "infra: README, Docker, CI e deploy da v1" --body "<resumo + o que não foi testado: deploy real no Render/Pages>

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Acompanhar o CI do PR (`gh pr checks --watch`) e corrigir o que falhar.

- [ ] **Step 3: Merge — só com o usuário aprovando**

Apresentar o PR ao usuário; fazer o merge apenas quando ele pedir.

- [ ] **Step 4: Apagar branches — só após confirmação explícita da lista**

Listar: `pfl-1-engine`, `pfl-2-sim`, `pfl-3-server`, `pfl-4-client`, `infra-docker-ci-deploy`. Confirmar que continuam mergeadas (`git branch -r --merged origin/main`), pedir o "sim" do usuário e então:

```bash
git checkout main && git pull
git branch -d pfl-1-engine pfl-2-sim pfl-3-server pfl-4-client infra-docker-ci-deploy
git push origin --delete pfl-1-engine pfl-2-sim pfl-3-server pfl-4-client infra-docker-ci-deploy
```

- [ ] **Step 5: Passos manuais do usuário**

Entregar o `docs/DEPLOY.md` e lembrar: criar o blueprint no Render, ativar o Pages, criar `VITE_SERVER_URL`. Reportar o deploy como **não testado** até o usuário concluir e a URL responder.

---

## Autoavaliação (spec → tarefas)

- Spec §1 (branches) → Task 6. §2 (servidor) → Task 1. §3 (Docker) → Task 2. §4 (CI) → Task 3. §5 (deploy) → Task 4. §6 (README) → Task 5. Verificação/testes → steps de cada task.
- Nomes consistentes: `parseCorsOrigin`, `CORS_ORIGIN`, `VITE_SERVER_URL`, `BASE_PATH`, `/health`.
- Cada linha do Review Focus tem teste ou passo de conferência na task que a possui.
