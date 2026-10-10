# PFL — Plano 4: Cliente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar `apps/client` (Vite + React + TypeScript + Phaser 3 + socket.io-client) com todas as telas da seção 6 da spec: Início, Montar time, Lobby, Partida e Fim de jogo. O cliente joga uma partida completa contra o servidor do Plano 3, com sprites Gen 1 Yellow baixados no setup e servidos localmente.

**Architecture:** a lógica pura e testável fica separada da apresentação:
- `builder/`: rascunho do time, depth chart, derivados e persistência.
- `match/`: reducer da partida a partir das mensagens do servidor, narração, timeline de animação, prévia de escalação, rascunho de depth e frames de replay.
- `lib/`: armazenamento seguro, rótulos e formatação.
- `net/session.ts`: sessão e reação a erros.

Tudo isso roda no Vitest em ambiente node. Os componentes React (`components/`, `screens/`), a cena Phaser (`phaser/`) e a camada fina `net/socket.ts` só consomem essas funções. Eles são verificados por `npm run typecheck`, pelo build do Vite e pelo checklist de playtest manual da Task 19. O cliente só envia intenções e anima os `GameEvent`s recebidos.

**Tech Stack:** Node 24, npm workspaces, TypeScript strict, Vite, React 19, Phaser 3, socket.io-client 4, `@fontsource/press-start-2p`, Vitest, tsx.

**Spec:** `docs/superpowers/specs/2026-10-10-pfl-core-design.md` (principalmente seções 5, 6, 2.4, 7.2 e 8). **Contratos:** `docs/superpowers/plans/2026-10-10-pfl-contracts.md`. Este plano consome `SUGGESTED_TEAMS` (Plano 2), `PlayerView.canEditDepth` e o evento `team:depth` (Plano 3) e todo o pacote `@pfl/protocol` (Plano 3). Nada disso é redefinido aqui.

**Pré-requisitos:** Planos 1, 2 e 3 executados (`@pfl/engine` com `SUGGESTED_TEAMS` e `SET_DEPTH`, `@pfl/protocol` em `packages/protocol`, `apps/server` rodando com `npm run dev:server`).

## Global Constraints

- Node ≥ 24 e npm (workspaces). **Não usar pnpm/yarn.**
- TypeScript `strict: true`.
- Stack: "Monorepo TypeScript (npm workspaces): `engine` puro + `server` Node/Socket.io + `client` React/Phaser".
- Phaser **3** (fixar `phaser@^3`; o Phaser 4 tem outra API).
- Visual: "Pixel art 2D, sprites Gen 1 (Pokémon Yellow, GBC) da PokéAPI".
- "Sem dependência em tempo de execução: ... Os sprites também são baixados no build e servidos pelo próprio client." O jogo nunca chama a PokéAPI em runtime.
- Estilo: "fonte bitmap, paleta inspirada no Game Boy Color, componentes React com visual pixel art".
- Sprites: "ataque com `back_gbc`, defesa com `front_gbc` (Yellow)".
- "O client só envia intenções e anima os `events` recebidos. Não calcula resultados."
- "O servidor revalida o time recebido. O client nunca é confiável."
- "toda ação `play:*` e `team:depth` carrega o `turnId`". Se o `turnId` estiver errado, o servidor responde `STALE_TURN` e reenvia o `match:phase` atual.
- "Ação inválida (etapa errada, carta não jogável, `turnId` antigo) | Servidor rejeita com `error { code }`; o client faz `match:resync`".
- "Quando a partida acaba, `match:end` substitui o último `match:phase`."
- Reconexão: "O cliente guarda o token em `sessionStorage` e o reenvia em `room:join` para retomar a mesma vaga (A ou B)."
- "Sem contas nesta versão: O time fica salvo no **localStorage**. **Exportar/importar** como código de texto".
- "`npm run dev:client`: Vite em `http://localhost:5173`, que acessa o servidor via `VITE_SERVER_URL` (padrão `http://localhost:3001`)".
- "Plataforma: desktop primeiro. No celular a tela precisa caber, sem polimento nesta versão."
- "Client: playtest manual nesta versão." Além disso, toda a lógica pura tem testes Vitest em ambiente node.
- Identificadores de código em inglês. Textos de UI, comentários e mensagens em português.
- Testes do cliente em `apps/client/test/**/*.test.ts` (`.ts`, nunca `.tsx`). Eles **não importam** `react`, `phaser`, `socket.io-client` nem `import.meta.env`.

## Review Focus

1. **Código de time corrompido ou editado à mão colado no import.** O esperado é uma mensagem clara e nenhuma exceção. Ids desconhecidos (espécie, carta, vaga) são descartados antes de qualquer `getSpecies`/`getCard`, que lançam erro. Testes na Task 6 (`importTeamCode`, `sanitizeTeam`).
2. **localStorage/sessionStorage indisponível**: modo privado, cookies bloqueados (o próprio acesso a `window.localStorage` lança) ou cota cheia. O esperado:
   - o montador funciona em memória e avisa para exportar o código;
   - a sessão cai para um armazenamento em memória;
   - nada quebra.

   Testes na Task 3 (`probeStorage`, `readJson`, `writeJson`), na Task 6 (`loadTeams`, `saveTeams`) e na Task 7 (`loadSession`, `saveSession`).
3. **`match:phase` (ou `match:end`) chegando durante a animação do resultado.** O esperado:
   - a animação continua com o snapshot pré-jogada;
   - o painel da próxima fase e a tela de fim só aparecem quando a animação termina;
   - mensagens antigas ou fora de ordem são ignoradas.

   Testes na Task 10 (`matchReducer`, `panelMode`, `showEndScreen`).
4. **Aba recarregada no meio da partida.** O token e o código do time ficam no `sessionStorage`. O cliente volta à mesma vaga, pede **um** `match:resync` e reconstrói tudo a partir do `match:phase` seguinte. `match:reveal`/`match:result` reenviados não duplicam o log. Testes na Task 7 (sessão), na Task 10 (`needsResync`, deduplicação) e na Task 18 (`screenFor`).
5. **Carta não jogável clicada, clique duplo ou ação fora da fase.** O esperado: nada é emitido, o botão fica desabilitado e um `STALE_TURN` libera o reenvio. Testes na Task 10 (`canSubmitCard`, `panelMode` após `SENT`, `ERROR`).

---

## File Structure

```
pfl/
  package.json                      (Modify) scripts dev:client, build:client; typecheck cobre o client
  tsconfig.json                     (Modify) exclude apps/client (o client tem tsconfig próprio com DOM/JSX)
  apps/client/
    package.json                    @pfl/client — scripts dev/build/sprites/typecheck
    tsconfig.json                   DOM + JSX + vite/client; cobre src, test, scripts
    vite.config.ts                  plugin React, porta 5173
    index.html
    .gitignore                      dist/, public/sprites/
    scripts/
      sprites-lib.ts                URLs, PNG, retry, download idempotente
      download-sprites.ts           CLI: baixa os 151 × {front, back}
    public/sprites/{front,back}/{id}.png   (gerados, fora do git)
    src/
      main.tsx                      entrada: fonte, CSS, <App/>
      App.tsx                       socket, sessão, roteamento de telas, envio de ações
      vite-env.d.ts
      styles/tokens.css             paleta GBC, tipos, espaçamentos
      styles/app.css                base: botões, painéis, inputs
      lib/storage.ts                StorageLike seguro (probe, JSON, memória)
      lib/names.ts                  rótulos pt-BR, nomes de espécie
      lib/format.ts                 down & distance, bola, posse, timer
      lib/sprites.ts                caminho público do sprite
      builder/draft.ts              TeamDraft ⇄ Team
      builder/depth.ts              ações de depth chart, depth automático
      builder/builderState.ts       reducer do time em montagem
      builder/derived.ts            custo, teto, cartas liberadas, filtros, erros
      builder/cardInfo.ts           texto de tooltip: requisitos, perfil, leitura
      builder/teamStore.ts          sanitização, localStorage, importar/exportar
      net/session.ts                sessão, código de sala, reação a erros, AckError
      net/socket.ts                 socket tipado + create/join com ack
      match/effect.ts               efetividade para narração e animação
      match/narration.ts            GameEvent → linhas estilo Gen 1
      match/timeline.ts             GameEvent → passos de animação
      match/matchState.ts           reducer da partida + seletores
      match/lineupPreview.ts        prévia de quem entra por formação/pacote
      match/depthDraft.ts           rascunho de depth durante a partida
      match/replayFrames.ts         replay → frames (via engine)
      phaser/layout.ts              coordenadas de vagas, jardas, fadiga
      phaser/FieldScene.ts          cena Phaser do campo
      phaser/PhaserField.tsx        wrapper React da cena
      phaser/phaser-field.css
      components/                   Sprite, TypeBadge, Stars, CardTile, ErrorList, DepthChartEditor (+ ui.css)
      screens/builder/              Pokedex, CapBar, RosterPanel, DeckEditor, TeamCodePanel, SuggestedTeams, BuilderScreen (+ builder.css)
      screens/HomeScreen.tsx, LobbyScreen.tsx (+ lobby.css)
      screens/match/                Hud, NarrationLog, RevealBanner, LineupPicker, CardHand, ConversionPicker, DepthPanel, MatchScreen (+ match.css)
      screens/end/                  StatsTable, ReplayViewer, EndScreen (+ end.css)
      app/screen.ts                 screenFor, namesFromRoom
      app/useNow.ts                 relógio para timers
    test/
      fixtures.ts                   time válido e PlayerView de teste
      *.test.ts
```

---

### Task 1: Scaffold do `apps/client`, tema GBC e integração com a raiz

**Files:**
- Create: `apps/client/package.json`, `apps/client/tsconfig.json`, `apps/client/vite.config.ts`, `apps/client/index.html`, `apps/client/.gitignore`
- Create: `apps/client/src/main.tsx`, `apps/client/src/App.tsx`, `apps/client/src/vite-env.d.ts`, `apps/client/src/styles/tokens.css`, `apps/client/src/styles/app.css`
- Modify: `package.json` (raiz), `tsconfig.json` (raiz)

**Interfaces:**
- Consumes: `@pfl/engine` e `@pfl/protocol` como dependências de workspace.
- Produces:
  - o workspace `@pfl/client`;
  - os scripts raiz `npm run dev:client` e `npm run build:client`;
  - o `npm run typecheck` raiz, que passa a cobrir o client;
  - os tokens CSS (`--gbc-*`, `--type-*`, `--fs-*`, `--space-*`) e as classes base (`.screen`, `.panel`, `.btn`, `.btn-primary`, `.btn-small`, `.input`, `.row`, `.stack`, `.muted`, `.notice`, `.error-list`, `.ok-text`, `.error-text`) usadas por todas as telas.

- [ ] **Step 1: Criar o `package.json` do client**

`apps/client/package.json`:
```json
{
  "name": "@pfl/client",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@pfl/engine": "*",
    "@pfl/protocol": "*"
  }
}
```

- [ ] **Step 2: Instalar as dependências**

Run:
```bash
npm install react react-dom phaser@^3 socket.io-client @fontsource/press-start-2p -w @pfl/client
npm install -D vite @vitejs/plugin-react @types/react @types/react-dom -w @pfl/client
```
Expected: `apps/client/package.json` ganha `dependencies` e `devDependencies` com versões, e o `package-lock.json` é atualizado sem erros. O `vite` entra explicitamente porque o `@vitejs/plugin-react` só o declara como peer. O `phaser@^3` fixa a major 3. Confira com `npm ls phaser -w @pfl/client`: deve mostrar `phaser@3.x`.

- [ ] **Step 3: Criar tsconfig, Vite, HTML e gitignore do client**

`apps/client/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["node", "vite/client"],
    "strict": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "test", "scripts", "vite.config.ts"]
}
```

`apps/client/vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173 },
  // O Phaser sozinho tem ~1,2 MB; o aviso padrão de 500 kB não ajuda aqui.
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
```

`apps/client/index.html`:
```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PFL — Pokémon Football League</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/client/.gitignore`:
```
dist/
public/sprites/
```

`apps/client/src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 4: Criar os tokens e o CSS base**

`apps/client/src/styles/tokens.css`:
```css
/* Paleta inspirada no Game Boy Color (menus do Pokémon Yellow + verdes do DMG). */
:root {
  --gbc-ink: #181010;
  --gbc-paper: #f8f8f0;
  --gbc-panel: #e8e0c8;
  --gbc-panel-dark: #c8b890;
  --gbc-border: #383028;
  --gbc-muted: #6c6458;
  --gbc-green-0: #0f380f;
  --gbc-green-1: #306230;
  --gbc-green-2: #8bac0f;
  --gbc-green-3: #9bbc0f;
  --gbc-field: #48a058;
  --gbc-red: #d03028;
  --gbc-blue: #3058c0;
  --gbc-yellow: #f8d030;
  --gbc-orange: #e88830;

  /* Leitura do ponto de vista da defesa: ✔ azul, · cinza, ✖ vermelho */
  --read-right: var(--gbc-blue);
  --read-neutral: var(--gbc-muted);
  --read-wrong: var(--gbc-red);

  --type-normal: #a8a878;
  --type-fire: #f08030;
  --type-water: #6890f0;
  --type-grass: #78c850;
  --type-electric: #f8d030;
  --type-ice: #98d8d8;
  --type-fighting: #c03028;
  --type-poison: #a040a0;
  --type-ground: #e0c068;
  --type-flying: #a890f0;
  --type-psychic: #f85888;
  --type-bug: #a8b820;
  --type-rock: #b8a038;
  --type-ghost: #705898;
  --type-dragon: #7038f8;

  --font-pixel: 'Press Start 2P', monospace;
  --fs-xs: 8px;
  --fs-sm: 10px;
  --fs-md: 12px;
  --fs-lg: 16px;
  --fs-xl: 24px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;

  --border: 4px solid var(--gbc-border);
  --shadow: 4px 4px 0 var(--gbc-border);
}
```

`apps/client/src/styles/app.css`:
```css
*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body,
#root {
  min-height: 100%;
  margin: 0;
}

body {
  background: var(--gbc-green-3);
  color: var(--gbc-ink);
  font-family: var(--font-pixel);
  font-size: var(--fs-sm);
  line-height: 1.7;
  -webkit-font-smoothing: none;
}

img {
  image-rendering: pixelated;
}

h1,
h2,
h3 {
  margin: 0 0 var(--space-3);
  font-weight: 400;
  line-height: 1.3;
}

h1 { font-size: var(--fs-xl); }
h2 { font-size: var(--fs-lg); }
h3 { font-size: var(--fs-md); }

button,
input,
select,
textarea {
  font: inherit;
  color: inherit;
}

.screen {
  min-height: 100vh;
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 1280px;
  margin: 0 auto;
}

.screen-center {
  align-items: center;
  justify-content: center;
  text-align: center;
}

.title {
  font-size: 32px;
  color: var(--gbc-red);
  text-shadow: 4px 4px 0 var(--gbc-border);
  letter-spacing: 2px;
  margin: 0;
}

.subtitle {
  font-size: var(--fs-md);
  margin: 0;
}

/* Caixa de menu do GBC: borda escura grossa com um filete claro por dentro. */
.panel {
  background: var(--gbc-paper);
  border: var(--border);
  box-shadow: var(--shadow);
  padding: var(--space-4);
  outline: 2px solid var(--gbc-panel-dark);
  outline-offset: -8px;
}

.panel-title {
  font-size: var(--fs-md);
  margin-bottom: var(--space-3);
}

.btn {
  background: var(--gbc-paper);
  border: 3px solid var(--gbc-border);
  box-shadow: 3px 3px 0 var(--gbc-border);
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
  text-transform: uppercase;
  font-size: var(--fs-sm);
  line-height: 1.4;
}

.btn:hover:not(:disabled) { background: var(--gbc-yellow); }

.btn:active:not(:disabled) {
  transform: translate(2px, 2px);
  box-shadow: 1px 1px 0 var(--gbc-border);
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn:focus-visible,
.input:focus-visible {
  outline: 3px dashed var(--gbc-blue);
  outline-offset: 2px;
}

.btn-primary {
  background: var(--gbc-red);
  color: var(--gbc-paper);
}

.btn-primary:hover:not(:disabled) { background: var(--gbc-orange); }

.btn-small {
  padding: 2px 6px;
  font-size: var(--fs-xs);
  border-width: 2px;
  box-shadow: 2px 2px 0 var(--gbc-border);
}

.input {
  background: var(--gbc-paper);
  border: 3px solid var(--gbc-border);
  padding: var(--space-2);
  min-width: 0;
}

textarea.input {
  width: 100%;
  resize: vertical;
  font-size: var(--fs-xs);
  word-break: break-all;
}

.row {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  flex-wrap: wrap;
}

.stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.muted { color: var(--gbc-muted); }
.ok-text { color: var(--gbc-green-1); margin: 0; }
.error-text { color: var(--gbc-red); margin: 0; }

.notice {
  background: var(--gbc-yellow);
  border: 3px solid var(--gbc-border);
  padding: var(--space-2) var(--space-3);
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
  align-items: center;
}

.notice-top {
  position: sticky;
  top: 0;
  z-index: 50;
}

.error-list {
  margin: 0;
  padding-left: var(--space-4);
  color: var(--gbc-red);
  font-size: var(--fs-xs);
}

@media (max-width: 720px) {
  body { font-size: var(--fs-xs); }
  .title { font-size: 22px; }
  .screen { padding: var(--space-2); }
}
```

- [ ] **Step 5: Criar a entrada e um `App` inicial**

`apps/client/src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/press-start-2p';
import './styles/tokens.css';
import './styles/app.css';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`apps/client/src/App.tsx` (substituído pela versão completa na Task 18):
```tsx
export function App() {
  return (
    <main className="screen screen-center">
      <h1 className="title">PFL</h1>
      <p className="subtitle">Pokémon Football League</p>
    </main>
  );
}
```

- [ ] **Step 6: Integrar com a configuração da raiz**

No `tsconfig.json` da raiz, **mantenha o `include` atual** (o Plano 3 já adicionou `apps/*/src`/`apps/*/test`) e acrescente `"exclude": ["apps/client"]`, porque o client precisa de `DOM` e `JSX` e é checado pelo próprio tsconfig. Resultado esperado (o `include` pode ter mais itens do Plano 3):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["packages/*/src", "packages/*/test", "packages/*/scripts", "apps/*/src", "apps/*/test", "vitest.config.ts"],
  "exclude": ["apps/client"]
}
```

No `package.json` da raiz:
- No script `typecheck`, acrescente ao valor atual ` && tsc -p apps/client/tsconfig.json`. Com o valor do Plano 1, fica `"typecheck": "tsc -p tsconfig.json && tsc -p apps/client/tsconfig.json"`.
- Adicione (ou substitua, se o contrato já tiver criado `dev:client`) estes scripts:
```json
"dev:client": "npm run dev -w @pfl/client",
"build:client": "npm run build -w @pfl/client"
```

Confira se o `vitest.config.ts` da raiz já inclui os testes de apps (o Plano 3 faz isso, conforme o contrato). O conteúdo esperado é:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['packages/**/test/**/*.test.ts', 'apps/**/test/**/*.test.ts'] },
});
```
Se `apps/**/test/**/*.test.ts` estiver faltando, adicione-o ao array `include` e mantenha os demais itens.

- [ ] **Step 7: Verificar typecheck e build**

Run: `npm run typecheck && npm run build:client`
Expected: typecheck sem erros nos dois projetos. O Vite gera `apps/client/dist/index.html` e `dist/assets/*.js|css` sem erros.

Run: `npm run dev:client`, abra `http://localhost:5173` e encerre com Ctrl+C.
Expected: o título "PFL" em vermelho com sombra, na fonte pixel, sobre o fundo verde GBC.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts apps/client
git commit -m "chore(client): scaffold Vite + React + Phaser e tema GBC"
```

---

### Task 2: Script de download dos sprites Gen 1 Yellow

**Files:**
- Create: `apps/client/scripts/sprites-lib.ts`, `apps/client/scripts/download-sprites.ts`
- Modify: `apps/client/package.json` (scripts), `package.json` raiz (`dev:client`)
- Test: `apps/client/test/sprites.test.ts`

**Interfaces:**
- Consumes: nada do app (só `node:fs`, `node:path` e `fetch` global).
- Produces:
  - `GEN1_COUNT = 151`
  - `type SpriteView = 'front' | 'back'`, `SPRITE_VIEWS`
  - `spriteUrl(view: SpriteView, id: number): string`
  - `spriteFile(root: string, view: SpriteView, id: number): string`
  - `isPng(bytes: Uint8Array): boolean`
  - `type FetchLike = (url: string) => Promise<FetchResponseLike>`
  - `interface RetryOptions { attempts: number; delayMs: number; sleep: (ms: number) => Promise<void> }`, `DEFAULT_RETRY`
  - `fetchPng(fetchFn: FetchLike, url: string, opts?: RetryOptions): Promise<Uint8Array>`
  - `ensureSprite(fetchFn: FetchLike, root: string, view: SpriteView, id: number, opts?: RetryOptions): Promise<'skipped' | 'downloaded'>`
  - `downloadAll(fetchFn: FetchLike, root: string, ids: readonly number[], opts?: RetryOptions, concurrency?: number): Promise<DownloadReport>`
  - arquivos em `apps/client/public/sprites/{front,back}/{id}.png`

- [ ] **Step 1: Escrever o teste (deve falhar)**

`apps/client/test/sprites.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  downloadAll, ensureSprite, fetchPng, isPng, spriteFile, spriteUrl,
  type FetchLike, type FetchResponseLike, type RetryOptions,
} from '../scripts/sprites-lib';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const HTML = new TextEncoder().encode('<html>404</html>');
const noSleep: RetryOptions = { attempts: 3, delayMs: 1, sleep: async () => {} };
const ok = (bytes: Uint8Array): FetchResponseLike => ({ ok: true, status: 200, arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer });
const fail = (status: number): FetchResponseLike => ({ ok: false, status, arrayBuffer: async () => new ArrayBuffer(0) });

/** fetch falso que devolve as respostas na ordem e conta as chamadas */
function scripted(...responses: (FetchResponseLike | Error)[]): FetchLike & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (url: string) => {
    calls.push(url);
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (next instanceof Error) throw next;
    return next;
  }) as FetchLike & { calls: string[] };
  fn.calls = calls;
  return fn;
}

describe('URLs e caminhos', () => {
  it('usa os sprites GBC do Yellow verificados', () => {
    expect(spriteUrl('front', 25)).toBe(
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-i/yellow/gbc/25.png',
    );
    expect(spriteUrl('back', 25)).toBe(
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-i/yellow/back/gbc/25.png',
    );
  });

  it('grava em {root}/{view}/{id}.png', () => {
    expect(spriteFile('/x/sprites', 'back', 7)).toBe(join('/x/sprites', 'back', '7.png'));
  });

  it('reconhece PNG pela assinatura', () => {
    expect(isPng(PNG)).toBe(true);
    expect(isPng(HTML)).toBe(false);
    expect(isPng(new Uint8Array())).toBe(false);
  });
});

describe('fetchPng', () => {
  it('tenta de novo após falhas e devolve os bytes', async () => {
    const f = scripted(fail(503), new Error('ECONNRESET'), ok(PNG));
    expect(await fetchPng(f, 'u', noSleep)).toEqual(PNG);
    expect(f.calls).toHaveLength(3);
  });

  it('desiste após as tentativas e cita a URL', async () => {
    const f = scripted(fail(404));
    await expect(fetchPng(f, 'https://exemplo/1.png', noSleep)).rejects.toThrow(/https:\/\/exemplo\/1.png.*HTTP 404/);
    expect(f.calls).toHaveLength(3);
  });

  it('rejeita resposta 200 que não é PNG (página de erro)', async () => {
    await expect(fetchPng(scripted(ok(HTML)), 'u', noSleep)).rejects.toThrow(/não é PNG/);
  });
});

describe('ensureSprite e downloadAll', () => {
  it('é idempotente: a segunda execução não baixa de novo', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pfl-sprites-'));
    const f = scripted(ok(PNG));
    expect(await ensureSprite(f, root, 'front', 1, noSleep)).toBe('downloaded');
    expect(await ensureSprite(f, root, 'front', 1, noSleep)).toBe('skipped');
    expect(f.calls).toHaveLength(1);
    expect(new Uint8Array(await readFile(spriteFile(root, 'front', 1)))).toEqual(PNG);
  });

  it('baixa de novo um arquivo corrompido', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pfl-sprites-'));
    await mkdir(join(root, 'back'), { recursive: true });
    await writeFile(spriteFile(root, 'back', 4), HTML);
    expect(await ensureSprite(scripted(ok(PNG)), root, 'back', 4, noSleep)).toBe('downloaded');
  });

  it('relata falhas sem abortar os demais downloads', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pfl-sprites-'));
    const f: FetchLike = async (url) => (url.endsWith('/2.png') ? fail(404) : ok(PNG));
    const report = await downloadAll(f, root, [1, 2, 3], noSleep, 2);
    expect(report.downloaded).toBe(4);
    expect(report.skipped).toBe(0);
    expect(report.failed).toHaveLength(2);
    expect(report.failed[0]).toMatch(/^back\/2:/);
    const again = await downloadAll(f, root, [1, 3], noSleep, 2);
    expect(again).toEqual({ downloaded: 0, skipped: 4, failed: [] });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/sprites.test.ts`
Expected: FAIL — `Failed to resolve import "../scripts/sprites-lib"`.

- [ ] **Step 3: Implementar a biblioteca e o CLI**

`apps/client/scripts/sprites-lib.ts`:
```ts
// Download dos sprites Gen 1 Yellow (GBC) no setup/build. O jogo nunca chama a PokéAPI em runtime.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const GEN1_COUNT = 151;
export type SpriteView = 'front' | 'back';
export const SPRITE_VIEWS: readonly SpriteView[] = ['front', 'back'];

const BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-i/yellow';

export function spriteUrl(view: SpriteView, id: number): string {
  return view === 'front' ? `${BASE}/gbc/${id}.png` : `${BASE}/back/gbc/${id}.png`;
}

export function spriteFile(root: string, view: SpriteView, id: number): string {
  return join(root, view, `${id}.png`);
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length > PNG_MAGIC.length && PNG_MAGIC.every((b, i) => bytes[i] === b);
}

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}
export type FetchLike = (url: string) => Promise<FetchResponseLike>;

export interface RetryOptions {
  attempts: number;
  delayMs: number;
  sleep: (ms: number) => Promise<void>;
}

export const DEFAULT_RETRY: RetryOptions = {
  attempts: 3,
  delayMs: 500,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

const describe = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export async function fetchPng(fetchFn: FetchLike, url: string, opts: RetryOptions = DEFAULT_RETRY): Promise<Uint8Array> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    try {
      const res = await fetchFn(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (!isPng(bytes)) throw new Error('resposta não é PNG');
      return bytes;
    } catch (err) {
      lastError = err;
      if (attempt < opts.attempts) await opts.sleep(opts.delayMs * attempt);
    }
  }
  throw new Error(`Falha ao baixar ${url}: ${describe(lastError)}`);
}

async function hasValidFile(path: string): Promise<boolean> {
  try {
    return isPng(new Uint8Array(await readFile(path)));
  } catch {
    return false;
  }
}

/** Baixa um sprite se ainda não existir um PNG válido. Grava num .tmp e renomeia, para nunca deixar arquivo pela metade. */
export async function ensureSprite(
  fetchFn: FetchLike,
  root: string,
  view: SpriteView,
  id: number,
  opts: RetryOptions = DEFAULT_RETRY,
): Promise<'skipped' | 'downloaded'> {
  const path = spriteFile(root, view, id);
  if (await hasValidFile(path)) return 'skipped';
  const bytes = await fetchPng(fetchFn, spriteUrl(view, id), opts);
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, bytes);
  await rename(tmp, path);
  return 'downloaded';
}

export interface DownloadReport {
  downloaded: number;
  skipped: number;
  failed: string[];
}

export async function downloadAll(
  fetchFn: FetchLike,
  root: string,
  ids: readonly number[],
  opts: RetryOptions = DEFAULT_RETRY,
  concurrency = 8,
): Promise<DownloadReport> {
  const jobs = ids.flatMap((id) => SPRITE_VIEWS.map((view) => ({ id, view })));
  const report: DownloadReport = { downloaded: 0, skipped: 0, failed: [] };
  let next = 0;
  async function worker(): Promise<void> {
    while (next < jobs.length) {
      const job = jobs[next++];
      try {
        const result = await ensureSprite(fetchFn, root, job.view, job.id, opts);
        report[result] += 1;
      } catch (err) {
        report.failed.push(`${job.view}/${job.id}: ${describe(err)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()));
  report.failed.sort();
  return report;
}
```

`apps/client/scripts/download-sprites.ts`:
```ts
// npm run sprites -w @pfl/client — baixa os 151 sprites (front e back) para public/sprites.
// Com --allow-missing, falhas viram aviso (útil no dev offline; o <Sprite> tem fallback).
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadAll, GEN1_COUNT } from './sprites-lib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../public/sprites');
const allowMissing = process.argv.includes('--allow-missing');
const ids = Array.from({ length: GEN1_COUNT }, (_, i) => i + 1);

const report = await downloadAll((url) => fetch(url), root, ids);
console.log(`sprites: ${report.downloaded} baixados, ${report.skipped} já existiam, ${report.failed.length} falharam`);
if (report.failed.length > 0) {
  for (const line of report.failed.slice(0, 10)) console.error(`  ${line}`);
  if (!allowMissing) process.exit(1);
  console.warn('Continuando sem esses sprites (--allow-missing).');
}
```

Em `apps/client/package.json`, adicione ao objeto `scripts`:
```json
"sprites": "tsx scripts/download-sprites.ts",
"sprites:dev": "tsx scripts/download-sprites.ts --allow-missing",
"prebuild": "npm run sprites:dev"
```

O `prebuild` usa a variante tolerante para que `npm run build:client` funcione offline ou num worktree recém-criado (os sprites ficam fora do git); a instalação estrita é o `npm run sprites` do Step 5 e da Task 19.

No `package.json` da raiz, troque `dev:client` por:
```json
"dev:client": "npm run sprites:dev -w @pfl/client && npm run dev -w @pfl/client"
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run apps/client/test/sprites.test.ts`
Expected: 9 testes PASS.

- [ ] **Step 5: Baixar os sprites de verdade (precisa de rede)**

Run: `npm run sprites -w @pfl/client`
Expected: `sprites: 302 baixados, 0 já existiam, 0 falharam`. Rode de novo e confira: `sprites: 0 baixados, 302 já existiam, 0 falharam`. `ls apps/client/public/sprites/front | wc -l` deve mostrar `151`.

- [ ] **Step 6: Typecheck e commit**

Run: `npm run typecheck`
Expected: sem erros.

```bash
git add apps/client/scripts apps/client/test/sprites.test.ts apps/client/package.json package.json
git commit -m "feat(client): download idempotente dos sprites Gen 1 Yellow"
```

---

### Task 3: Utilitários: armazenamento seguro, rótulos e formatação

**Files:**
- Create: `apps/client/src/lib/storage.ts`, `apps/client/src/lib/names.ts`, `apps/client/src/lib/format.ts`, `apps/client/src/lib/sprites.ts`
- Test: `apps/client/test/storage.test.ts`, `apps/client/test/names-format.test.ts`

**Interfaces:**
- Consumes: `getSpecies`, tipos `PokemonType`, `Position`, `FormationId`, `PackageId`, `OffenseCategory`, `DefenseCategory`, `SpecialCategory`, `CardOrigin`, `ReadResult`, `FieldState`, `Phase`, `PlayerView` (`@pfl/engine`); `PHASE_SECONDS`, `RESULT_ANIMATION_MS` (`@pfl/protocol`).
- Produces:
  - `interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }`
  - `probeStorage(get: () => StorageLike | null | undefined): StorageLike | null`, `getLocalStorage(): StorageLike | null`, `getSessionStorage(): StorageLike | null`
  - `readJson(storage: StorageLike | null, key: string): unknown`, `writeJson(storage: StorageLike | null, key: string, value: unknown): boolean`, `removeKey(storage: StorageLike | null, key: string): void`, `memoryStorage(): StorageLike`
  - `TYPE_LABELS`, `POSITION_LABELS`, `FORMATION_LABELS`, `PACKAGE_LABELS`, `CATEGORY_LABELS`, `ORIGIN_LABELS`, `READ_SYMBOL`, `READ_LABELS`, `displayName(slug: string): string`, `speciesName(id: number): string`
  - `formatDown(field: FieldState, conversionAttempt: boolean): string`, `formatBallOn(ballOn: number): string`, `formatPossession(view: Pick<PlayerView, 'possessions' | 'offense' | 'possessionsPerTeam' | 'overtimeRound'>): string`, `secondsLeft(phase: Phase, deadline: number, now: number): number`, `PHASE_LABELS`
  - `spriteSrc(view: 'front' | 'back', id: number): string` (não testado; usa `import.meta.env`)

- [ ] **Step 1: Escrever os testes (devem falhar)**

`apps/client/test/storage.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { memoryStorage, probeStorage, readJson, removeKey, writeJson, type StorageLike } from '../src/lib/storage';

const throwing = (what: 'get' | 'set'): StorageLike => ({
  getItem: () => { if (what === 'get') throw new Error('SecurityError'); return null; },
  setItem: () => { throw new Error('QuotaExceededError'); },
  removeItem: () => {},
});

describe('probeStorage', () => {
  it('devolve null quando o próprio acesso ao storage lança (modo privado)', () => {
    expect(probeStorage(() => { throw new Error('SecurityError'); })).toBeNull();
  });

  it('devolve null quando a escrita falha (cota cheia)', () => {
    expect(probeStorage(() => throwing('set'))).toBeNull();
  });

  it('devolve null quando não há storage', () => {
    expect(probeStorage(() => undefined)).toBeNull();
  });

  it('devolve o storage quando funciona e não deixa a chave de teste', () => {
    const mem = memoryStorage();
    expect(probeStorage(() => mem)).toBe(mem);
    expect(mem.getItem('__pfl_probe__')).toBeNull();
  });
});

describe('readJson / writeJson', () => {
  it('faz ida e volta', () => {
    const mem = memoryStorage();
    expect(writeJson(mem, 'k', { a: 1 })).toBe(true);
    expect(readJson(mem, 'k')).toEqual({ a: 1 });
    removeKey(mem, 'k');
    expect(readJson(mem, 'k')).toBeNull();
  });

  it('JSON corrompido vira null', () => {
    const mem = memoryStorage();
    mem.setItem('k', '{nao-e-json');
    expect(readJson(mem, 'k')).toBeNull();
  });

  it('nunca lança: storage nulo, getItem que lança, setItem que lança', () => {
    expect(readJson(null, 'k')).toBeNull();
    expect(writeJson(null, 'k', 1)).toBe(false);
    expect(readJson(throwing('get'), 'k')).toBeNull();
    expect(writeJson(throwing('set'), 'k', 1)).toBe(false);
    expect(() => removeKey(null, 'k')).not.toThrow();
  });
});
```

`apps/client/test/names-format.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { displayName, speciesName, TYPE_LABELS, CATEGORY_LABELS } from '../src/lib/names';
import { formatBallOn, formatDown, formatPossession, secondsLeft } from '../src/lib/format';

describe('nomes', () => {
  it('converte os slugs da PokéAPI em nomes de exibição', () => {
    expect(displayName('pikachu')).toBe('Pikachu');
    expect(displayName('mr-mime')).toBe('Mr. Mime');
    expect(displayName('nidoran-f')).toBe('Nidoran♀');
    expect(displayName('nidoran-m')).toBe('Nidoran♂');
    expect(displayName('farfetchd')).toBe("Farfetch'd");
  });

  it('busca o nome pela espécie', () => {
    expect(speciesName(135)).toBe('Jolteon');
    expect(speciesName(122)).toBe('Mr. Mime');
  });

  it('tem rótulos em português', () => {
    expect(TYPE_LABELS.electric).toBe('Elétrico');
    expect(CATEGORY_LABELS.RUN_OUTSIDE).toBe('Corrida por Fora');
  });
});

describe('down & distance e campo', () => {
  it('formata o down', () => {
    expect(formatDown({ down: 1, yardsToGo: 10, ballOn: 25 }, false)).toBe('1st & 10');
    expect(formatDown({ down: 2, yardsToGo: 6, ballOn: 44 }, false)).toBe('2nd & 6');
    expect(formatDown({ down: 4, yardsToGo: 1, ballOn: 50 }, false)).toBe('4th & 1');
  });

  it('usa "Goal" quando a distância chega à end zone', () => {
    expect(formatDown({ down: 3, yardsToGo: 5, ballOn: 95 }, false)).toBe('3rd & Goal');
  });

  it('mostra a tentativa de 2 pontos', () => {
    expect(formatDown({ down: 1, yardsToGo: 3, ballOn: 97 }, true)).toBe('Conversão de 2');
  });

  it('formata a posição da bola do ponto de vista do ataque', () => {
    expect(formatBallOn(44)).toBe('OWN 44');
    expect(formatBallOn(50)).toBe('50');
    expect(formatBallOn(70)).toBe('OPP 30');
  });

  it('formata a posse e a prorrogação', () => {
    expect(formatPossession({ possessions: { A: 3, B: 2 }, offense: 'A', possessionsPerTeam: 6, overtimeRound: 0 })).toBe('Posse 3/6');
    expect(formatPossession({ possessions: { A: 6, B: 6 }, offense: 'B', possessionsPerTeam: 6, overtimeRound: 2 })).toBe('Prorrogação 2');
  });
});

describe('secondsLeft', () => {
  it('arredonda para cima e nunca fica negativo', () => {
    expect(secondsLeft('PLAYCALL', 10_000 + 2_100, 10_000)).toBe(3);
    expect(secondsLeft('PLAYCALL', 9_000, 10_000)).toBe(0);
    expect(secondsLeft('MATCH_END', 99_999, 0)).toBe(0);
  });

  it('limita a diferença de relógio entre cliente e servidor (etapa + animação)', () => {
    expect(secondsLeft('FORMATION', 60_000, 0)).toBe(10); // 5 s de formação + 5 s (ceil de 4,5 s) de animação
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/storage.test.ts apps/client/test/names-format.test.ts`
Expected: FAIL — imports não resolvidos.

- [ ] **Step 3: Implementar**

`apps/client/src/lib/storage.ts`:
```ts
// Acesso seguro a localStorage/sessionStorage. Em modo privado, com cookies bloqueados ou com a cota cheia,
// até ler `window.localStorage` pode lançar. Nenhuma função daqui lança.

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const PROBE_KEY = '__pfl_probe__';

export function probeStorage(get: () => StorageLike | null | undefined): StorageLike | null {
  try {
    const storage = get();
    if (!storage) return null;
    storage.setItem(PROBE_KEY, '1');
    storage.removeItem(PROBE_KEY);
    return storage;
  } catch {
    return null;
  }
}

export function getLocalStorage(): StorageLike | null {
  return probeStorage(() => (typeof window === 'undefined' ? null : window.localStorage));
}

export function getSessionStorage(): StorageLike | null {
  return probeStorage(() => (typeof window === 'undefined' ? null : window.sessionStorage));
}

export function readJson(storage: StorageLike | null, key: string): unknown {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeJson(storage: StorageLike | null, key: string, value: unknown): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(storage: StorageLike | null, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    // nada a fazer: o storage está indisponível
  }
}

/** Substituto em memória quando o navegador não oferece storage (dura até recarregar a aba). */
export function memoryStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}
```

`apps/client/src/lib/names.ts`:
```ts
import type {
  CardOrigin, DefenseCategory, FormationId, OffenseCategory, PackageId, PokemonType, Position, ReadResult, SpecialCategory,
} from '@pfl/engine';
import { getSpecies } from '@pfl/engine';

export const TYPE_LABELS: Record<PokemonType, string> = {
  normal: 'Normal', fire: 'Fogo', water: 'Água', grass: 'Planta', electric: 'Elétrico', ice: 'Gelo',
  fighting: 'Lutador', poison: 'Venenoso', ground: 'Terra', flying: 'Voador', psychic: 'Psíquico',
  bug: 'Inseto', rock: 'Pedra', ghost: 'Fantasma', dragon: 'Dragão',
};

export const POSITION_LABELS: Record<Position, string> = {
  QB: 'Quarterback', OL: 'Linha ofensiva', RB: 'Running back', WR: 'Wide receiver', TE: 'Tight end',
  FB: 'Fullback', DL: 'Linha defensiva', LB: 'Linebacker', CB: 'Cornerback', S: 'Safety',
};

export const FORMATION_LABELS: Record<FormationId, string> = {
  PISTOL: 'Pistol', HEAVY: 'Pesada', SPREAD: 'Spread', DOUBLE: 'Dupla',
};

export const PACKAGE_LABELS: Record<PackageId, string> = {
  BASE: 'Base', HEAVY_D: 'Pesado', NICKEL: 'Nickel', DIME: 'Dime',
};

export const CATEGORY_LABELS: Record<OffenseCategory | DefenseCategory | SpecialCategory, string> = {
  RUN_INSIDE: 'Corrida por Dentro', RUN_OUTSIDE: 'Corrida por Fora', SHORT_PASS: 'Passe Curto',
  DEEP_PASS: 'Passe Longo', SCREEN: 'Screen', PLAY_ACTION: 'Play-Action',
  RUN_STUFF: 'Contenção de Corrida', BLITZ: 'Blitz', MAN: 'Homem a Homem', ZONE_SHORT: 'Zona Curta',
  ZONE_DEEP: 'Zona Profunda', BASE_D: 'Defesa Base', PUNT: 'Punt', FIELD_GOAL: 'Field Goal',
};

export const ORIGIN_LABELS: Record<CardOrigin, string> = {
  BASIC: 'Básica', TYPE: 'De tipo', SIGNATURE: 'Assinatura', SPECIAL: 'Especial',
};

/** Leitura do ponto de vista da defesa (spec 3.5). */
export const READ_SYMBOL: Record<ReadResult, string> = { RIGHT: '✔', NEUTRAL: '·', WRONG: '✖' };
export const READ_LABELS: Record<ReadResult, string> = {
  RIGHT: 'Leitura certa da defesa',
  NEUTRAL: 'Leitura neutra',
  WRONG: 'Leitura errada da defesa',
};

const SPECIAL_NAMES: Record<string, string> = {
  'nidoran-f': 'Nidoran♀',
  'nidoran-m': 'Nidoran♂',
  'mr-mime': 'Mr. Mime',
  farfetchd: "Farfetch'd",
};

/** Os nomes da PokéAPI são slugs ("mr-mime"); aqui viram nomes de exibição. */
export function displayName(slug: string): string {
  const special = SPECIAL_NAMES[slug];
  if (special) return special;
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('-');
}

export function speciesName(id: number): string {
  return displayName(getSpecies(id).name);
}
```

`apps/client/src/lib/format.ts`:
```ts
import type { FieldState, Phase, PlayerView } from '@pfl/engine';
import { PHASE_SECONDS, RESULT_ANIMATION_MS } from '@pfl/protocol';

const ORDINALS = ['1st', '2nd', '3rd', '4th'];

/** "2nd & 6", "3rd & Goal" ou "Conversão de 2" (HUD da spec 6.2). */
export function formatDown(field: FieldState, conversionAttempt: boolean): string {
  if (conversionAttempt) return 'Conversão de 2';
  const ordinal = ORDINALS[field.down - 1] ?? `${field.down}th`;
  const goal = field.ballOn + field.yardsToGo >= 100;
  return `${ordinal} & ${goal ? 'Goal' : field.yardsToGo}`;
}

/** ballOn é do ponto de vista do ataque: 0 = própria end zone, 100 = end zone adversária. */
export function formatBallOn(ballOn: number): string {
  if (ballOn === 50) return '50';
  return ballOn < 50 ? `OWN ${ballOn}` : `OPP ${100 - ballOn}`;
}

export function formatPossession(
  view: Pick<PlayerView, 'possessions' | 'offense' | 'possessionsPerTeam' | 'overtimeRound'>,
): string {
  if (view.overtimeRound > 0) return `Prorrogação ${view.overtimeRound}`;
  return `Posse ${view.possessions[view.offense]}/${view.possessionsPerTeam}`;
}

/**
 * Segundos restantes até o deadline (epoch ms do servidor). O teto é a duração da etapa mais a folga da
 * animação, porque o relógio do cliente pode estar adiantado ou atrasado em relação ao servidor.
 */
export function secondsLeft(phase: Phase, deadline: number, now: number): number {
  if (phase === 'MATCH_END') return 0;
  const max = PHASE_SECONDS[phase] + Math.ceil(RESULT_ANIMATION_MS / 1000);
  return Math.min(max, Math.max(0, Math.ceil((deadline - now) / 1000)));
}

export const PHASE_LABELS: Record<Phase, string> = {
  FORMATION: 'Formação',
  PACKAGE: 'Pacote',
  PLAYCALL: 'Carta',
  CONVERSION: 'Conversão',
  MATCH_END: 'Fim de jogo',
};
```

`apps/client/src/lib/sprites.ts`:
```ts
/** Sprites baixados pela Task 2 e servidos de public/sprites (ataque = back, defesa = front). */
export function spriteSrc(view: 'front' | 'back', id: number): string {
  return `${import.meta.env.BASE_URL}sprites/${view}/${id}.png`;
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run apps/client/test/storage.test.ts apps/client/test/names-format.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck e commit**

Run: `npm run typecheck`
Expected: sem erros.

```bash
git add apps/client/src/lib apps/client/test/storage.test.ts apps/client/test/names-format.test.ts
git commit -m "feat(client): storage seguro, rótulos pt-BR e formatação de campo"
```

---

### Task 4: Montagem do time: rascunho, depth chart e reducer

**Files:**
- Create: `apps/client/src/builder/draft.ts`, `apps/client/src/builder/depth.ts`, `apps/client/src/builder/builderState.ts`
- Create: `apps/client/test/fixtures.ts`
- Test: `apps/client/test/builder.test.ts`

**Interfaces:**
- Consumes (`@pfl/engine`): `Team`, `SlotId`, `Position`, `StatKey`, `CardSide`, `PlayerView`, `OFFENSE_SLOTS`, `DEFENSE_SLOTS`, `POSITION_WEIGHTS`, `slotPosition`, `getSpecies`, `hasSpecies`, `findCard`, `canIncludeInDeck`, `ROSTER_SIZE`, `DECK_SIZE`, `MAX_COPIES`. Nos testes: `validateTeam`, `fillSlots`, `FORMATIONS`, `PACKAGES`.
- Produces:
  - `interface TeamDraft { name: string; roster: number[]; specialist: number | null; depth: Team['depth']; keepOnField: number[]; offenseDeck: string[]; defenseDeck: string[] }`
  - `emptyDraft(name?: string): TeamDraft`, `draftFromTeam(team: Team): TeamDraft`, `draftToTeam(d: TeamDraft): Team | null`
  - `ALL_SLOTS: readonly SlotId[]`, `AUTO_DEPTH_SIZE = 7`, `interface DepthState { depth: Team['depth']; keepOnField: number[] }`
  - `type DepthAction = { type: 'DEPTH_ADD'; slot: SlotId; id: number } | { type: 'DEPTH_REMOVE'; slot: SlotId; id: number } | { type: 'DEPTH_MOVE'; slot: SlotId; id: number; dir: -1 | 1 } | { type: 'TOGGLE_KEEP'; id: number } | { type: 'AUTO_DEPTH' }`
  - `positionScore(id: number, position: Position): number`, `rankForPosition(roster: readonly number[], position: Position): number[]`, `autoDepth(roster: readonly number[]): Team['depth']`, `applyDepthAction(state: DepthState, roster: readonly number[], action: DepthAction): DepthState`, `pruneDepth(state: DepthState, roster: readonly number[]): DepthState`
  - `MAX_NAME_LENGTH = 24`, `type BuilderAction`, `isDeckCard(cardId: string, side: CardSide, roster: readonly number[]): boolean`, `builderReducer(d: TeamDraft, a: BuilderAction): TeamDraft`
  - Fixtures de teste: `testTeam(name?: string): Team`, `makeView(overrides?: Partial<PlayerView>): PlayerView`

- [ ] **Step 1: Criar as fixtures de teste**

`apps/client/test/fixtures.ts`:
```ts
import type { PlayerView, Team } from '@pfl/engine';

/**
 * Cópia do time válido do Plano 1 (packages/engine/test/fixtures.ts), custo 72.
 * Os testes do cliente não dependem do conteúdo dos times sugeridos do Plano 2.
 */
export function testTeam(name = 'Kanto Thunder'): Team {
  return {
    name,
    roster: [25, 26, 100, 81, 125, 74, 95, 66, 19, 16, 21, 50, 54, 63, 10, 13],
    specialist: 129,
    depth: {
      QB: [63, 54],
      OL1: [95, 66, 19],
      OL2: [74, 19, 66],
      OL3: [66, 50, 74],
      RB: [25, 50, 19],
      WR1: [26, 100, 13],
      WR2: [125, 10, 16],
      WR3: [100, 13, 21],
      TE: [81, 54],
      FB: [19, 66],
      DL1: [95, 74, 19],
      DL2: [74, 66, 50],
      DL3: [50, 19, 95],
      LB1: [66, 21, 16],
      LB2: [21, 16],
      CB1: [26, 10, 100],
      CB2: [100, 13, 125],
      CB3: [13, 10],
      S1: [63, 16, 54],
      S2: [16, 54],
    },
    keepOnField: [],
    offenseDeck: [
      'electric_thunder_screen', 'electric_thunder_screen',
      'normal_tackle', 'normal_tackle',
      'fighting_submission', 'fighting_submission',
      'ground_earthquake', 'ground_earthquake',
      'rock_avalanche', 'rock_avalanche',
      'bug_quick_bite', 'bug_quick_bite',
    ],
    defenseDeck: [
      'electric_paralysis', 'electric_paralysis',
      'normal_wall', 'normal_wall',
      'fighting_low_kick', 'fighting_low_kick',
      'ground_dig', 'ground_dig',
      'bug_string_shot', 'bug_string_shot',
      'psychic_foresight', 'psychic_foresight',
    ],
  };
}

/** PlayerView mínima e válida; os testes sobrescrevem só o que importa. */
export function makeView(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    you: 'A',
    side: 'offense',
    phase: 'FORMATION',
    turnId: 1,
    score: { A: 0, B: 0 },
    offense: 'A',
    possessions: { A: 1, B: 0 },
    possessionsPerTeam: 6,
    field: { down: 1, yardsToGo: 10, ballOn: 25 },
    formation: null,
    package: null,
    lineups: { offense: {}, defense: {} },
    conversionAttempt: false,
    overtimeRound: 0,
    hand: [],
    playable: [],
    opponentHandSize: 5,
    yourCard: null,
    opponentHasChosen: false,
    fatigue: { A: {}, B: {} },
    canEditDepth: false,
    ...overrides,
  };
}
```

- [ ] **Step 2: Escrever o teste (deve falhar)**

`apps/client/test/builder.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { FORMATIONS, PACKAGES, ROSTER_SIZE, fillSlots, validateTeam } from '@pfl/engine';
import { builderReducer, type BuilderAction } from '../src/builder/builderState';
import { draftFromTeam, draftToTeam, emptyDraft } from '../src/builder/draft';
import { ALL_SLOTS, AUTO_DEPTH_SIZE, applyDepthAction, autoDepth, type DepthState } from '../src/builder/depth';
import { testTeam } from './fixtures';

const run = (actions: BuilderAction[], start = emptyDraft()) => actions.reduce(builderReducer, start);

describe('rascunho ⇄ time', () => {
  it('sem especialista não vira Team', () => {
    expect(draftToTeam(emptyDraft())).toBeNull();
  });

  it('ida e volta preserva o time sem compartilhar referências', () => {
    const team = testTeam();
    const draft = draftFromTeam(team);
    expect(draftToTeam(draft)).toEqual(team);
    draft.roster.push(1);
    draft.depth.QB?.push(25);
    expect(team.roster).not.toContain(1);
    expect(team.depth.QB).toEqual([63, 54]);
  });
});

describe('elenco', () => {
  it('adiciona sem repetir, ignora espécie inexistente e respeita o limite de 16', () => {
    expect(run([{ type: 'ADD_SPECIES', id: 25 }, { type: 'ADD_SPECIES', id: 25 }, { type: 'ADD_SPECIES', id: 999 }]).roster).toEqual([25]);
    const full = run(Array.from({ length: 20 }, (_, i): BuilderAction => ({ type: 'ADD_SPECIES', id: i + 1 })));
    expect(full.roster).toHaveLength(ROSTER_SIZE);
  });

  it('o especialista sai do elenco e não pode voltar a ele', () => {
    const d = run([
      { type: 'ADD_SPECIES', id: 129 },
      { type: 'SET_SPECIALIST', id: 129 },
      { type: 'ADD_SPECIES', id: 129 },
    ]);
    expect(d.specialist).toBe(129);
    expect(d.roster).toEqual([]);
  });

  it('remover o especialista só libera a vaga de kicker', () => {
    const d = builderReducer(draftFromTeam(testTeam()), { type: 'REMOVE_SPECIES', id: 129 });
    expect(d.specialist).toBeNull();
    expect(d.roster).toHaveLength(16);
  });

  it('remover um Pokémon limpa o depth chart, o "manter em campo" e as cartas que só ele liberava', () => {
    const start = { ...draftFromTeam(testTeam()), keepOnField: [63] };
    const d = builderReducer(start, { type: 'REMOVE_SPECIES', id: 63 }); // Abra, único psíquico
    expect(d.roster).not.toContain(63);
    expect(d.depth.QB).toEqual([54]);
    expect(d.depth.S1).toEqual([16, 54]);
    expect(d.keepOnField).toEqual([]);
    expect(d.defenseDeck).not.toContain('psychic_foresight');
    expect(d.defenseDeck).toHaveLength(10);
    expect(d.offenseDeck).toHaveLength(12);
  });

  it('renomeia com limite de tamanho', () => {
    expect(run([{ type: 'RENAME', name: 'x'.repeat(40) }]).name).toHaveLength(24);
  });
});

describe('deck', () => {
  const noDecks = () => ({ ...draftFromTeam(testTeam()), offenseDeck: [], defenseDeck: [] });

  it('aceita carta liberada até 2 cópias', () => {
    let d = noDecks();
    for (let i = 0; i < 3; i++) d = builderReducer(d, { type: 'DECK_ADD', side: 'OFFENSE', cardId: 'electric_thunder_screen' });
    expect(d.offenseDeck).toEqual(['electric_thunder_screen', 'electric_thunder_screen']);
  });

  it('recusa básica, especial, lado errado, carta inexistente e carta não liberada pelo elenco', () => {
    let d = noDecks();
    for (const cardId of ['basic_run', 'punt', 'normal_wall', 'nao_existe', 'fire_deep']) {
      d = builderReducer(d, { type: 'DECK_ADD', side: 'OFFENSE', cardId });
    }
    expect(d.offenseDeck).toEqual([]);
  });

  it('limita o deck a 12 cartas', () => {
    const full = draftFromTeam(testTeam());
    expect(builderReducer(full, { type: 'DECK_ADD', side: 'OFFENSE', cardId: 'psychic_confusion' }).offenseDeck).toHaveLength(12);
  });

  it('remove uma cópia por vez', () => {
    const d = builderReducer(draftFromTeam(testTeam()), { type: 'DECK_REMOVE', side: 'DEFENSE', cardId: 'ground_dig' });
    expect(d.defenseDeck.filter((id) => id === 'ground_dig')).toHaveLength(1);
    expect(d.defenseDeck).toHaveLength(11);
  });
});

describe('depth chart', () => {
  const roster = testTeam().roster;
  const state: DepthState = { depth: { QB: [63, 54] }, keepOnField: [] };

  it('adiciona só quem está no elenco e não repete', () => {
    expect(applyDepthAction(state, roster, { type: 'DEPTH_ADD', slot: 'QB', id: 25 }).depth.QB).toEqual([63, 54, 25]);
    expect(applyDepthAction(state, roster, { type: 'DEPTH_ADD', slot: 'QB', id: 63 })).toBe(state);
    expect(applyDepthAction(state, roster, { type: 'DEPTH_ADD', slot: 'QB', id: 150 })).toBe(state);
  });

  it('move e remove', () => {
    expect(applyDepthAction(state, roster, { type: 'DEPTH_MOVE', slot: 'QB', id: 54, dir: -1 }).depth.QB).toEqual([54, 63]);
    expect(applyDepthAction(state, roster, { type: 'DEPTH_MOVE', slot: 'QB', id: 63, dir: -1 })).toBe(state);
    expect(applyDepthAction(state, roster, { type: 'DEPTH_REMOVE', slot: 'QB', id: 63 }).depth.QB).toEqual([54]);
  });

  it('alterna "manter em campo" só para quem está no elenco', () => {
    const on = applyDepthAction(state, roster, { type: 'TOGGLE_KEEP', id: 25 });
    expect(on.keepOnField).toEqual([25]);
    expect(applyDepthAction(on, roster, { type: 'TOGGLE_KEEP', id: 25 }).keepOnField).toEqual([]);
    expect(applyDepthAction(state, roster, { type: 'TOGGLE_KEEP', id: 150 })).toBe(state);
  });

  it('o depth automático preenche todas as formações e pacotes', () => {
    const depth = autoDepth(roster);
    for (const slot of ALL_SLOTS) expect(depth[slot]).toHaveLength(AUTO_DEPTH_SIZE);
    for (const slots of [...Object.values(FORMATIONS), ...Object.values(PACKAGES)]) {
      expect(fillSlots(slots, depth)).not.toBeNull();
    }
    expect(validateTeam({ ...testTeam(), depth })).toEqual([]);
  });

  it('o reducer do time repassa as ações de depth', () => {
    const d = run([{ type: 'ADD_SPECIES', id: 25 }, { type: 'DEPTH_ADD', slot: 'RB', id: 25 }]);
    expect(d.depth.RB).toEqual([25]);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/builder.test.ts`
Expected: FAIL — imports não resolvidos.

- [ ] **Step 4: Implementar**

`apps/client/src/builder/draft.ts`:
```ts
import type { Team } from '@pfl/engine';

/** Time em montagem: igual a Team, mas o especialista pode faltar. */
export interface TeamDraft {
  name: string;
  roster: number[];
  specialist: number | null;
  depth: Team['depth'];
  keepOnField: number[];
  offenseDeck: string[];
  defenseDeck: string[];
}

export function emptyDraft(name = 'Meu time'): TeamDraft {
  return { name, roster: [], specialist: null, depth: {}, keepOnField: [], offenseDeck: [], defenseDeck: [] };
}

export function draftFromTeam(team: Team): TeamDraft {
  const copy = structuredClone(team);
  return {
    name: copy.name,
    roster: copy.roster,
    specialist: copy.specialist,
    depth: copy.depth,
    keepOnField: copy.keepOnField,
    offenseDeck: copy.offenseDeck,
    defenseDeck: copy.defenseDeck,
  };
}

export function draftToTeam(draft: TeamDraft): Team | null {
  if (draft.specialist === null) return null;
  const copy = structuredClone(draft);
  return {
    name: copy.name,
    roster: copy.roster,
    specialist: draft.specialist,
    depth: copy.depth,
    keepOnField: copy.keepOnField,
    offenseDeck: copy.offenseDeck,
    defenseDeck: copy.defenseDeck,
  };
}
```

`apps/client/src/builder/depth.ts`:
```ts
import type { Position, SlotId, StatKey, Team } from '@pfl/engine';
import { DEFENSE_SLOTS, OFFENSE_SLOTS, POSITION_WEIGHTS, getSpecies, slotPosition } from '@pfl/engine';

export const ALL_SLOTS: readonly SlotId[] = [...OFFENSE_SLOTS, ...DEFENSE_SLOTS];

/**
 * Candidatos por vaga no depth automático. Uma formação/pacote tem 7 vagas, então, ao preencher a k-ésima,
 * no máximo 6 Pokémon já foram usados: com 7 candidatos distintos sempre sobra um (fillSlots nunca falha).
 */
export const AUTO_DEPTH_SIZE = 7;

export interface DepthState {
  depth: Team['depth'];
  keepOnField: number[];
}

export type DepthAction =
  | { type: 'DEPTH_ADD'; slot: SlotId; id: number }
  | { type: 'DEPTH_REMOVE'; slot: SlotId; id: number }
  | { type: 'DEPTH_MOVE'; slot: SlotId; id: number; dir: -1 | 1 }
  | { type: 'TOGGLE_KEEP'; id: number }
  | { type: 'AUTO_DEPTH' };

/** Mesma soma ponderada da aptidão do engine, sem arredondar em estrelas (desempata melhor). */
export function positionScore(id: number, position: Position): number {
  const stats = getSpecies(id).stats;
  return Object.entries(POSITION_WEIGHTS[position]).reduce(
    (sum, [key, weight]) => sum + stats[key as StatKey] * (weight as number),
    0,
  );
}

export function rankForPosition(roster: readonly number[], position: Position): number[] {
  return [...roster].sort((a, b) => positionScore(b, position) - positionScore(a, position) || a - b);
}

export function autoDepth(roster: readonly number[]): Team['depth'] {
  const depth: Team['depth'] = {};
  for (const slot of ALL_SLOTS) depth[slot] = rankForPosition(roster, slotPosition(slot)).slice(0, AUTO_DEPTH_SIZE);
  return depth;
}

function setSlot(depth: Team['depth'], slot: SlotId, ids: number[]): Team['depth'] {
  const next: Team['depth'] = { ...depth };
  next[slot] = ids;
  return next;
}

export function applyDepthAction(state: DepthState, roster: readonly number[], action: DepthAction): DepthState {
  switch (action.type) {
    case 'DEPTH_ADD': {
      const list = state.depth[action.slot] ?? [];
      if (!roster.includes(action.id) || list.includes(action.id)) return state;
      return { ...state, depth: setSlot(state.depth, action.slot, [...list, action.id]) };
    }
    case 'DEPTH_REMOVE': {
      const list = state.depth[action.slot] ?? [];
      if (!list.includes(action.id)) return state;
      return { ...state, depth: setSlot(state.depth, action.slot, list.filter((id) => id !== action.id)) };
    }
    case 'DEPTH_MOVE': {
      const list = [...(state.depth[action.slot] ?? [])];
      const from = list.indexOf(action.id);
      const to = from + action.dir;
      if (from < 0 || to < 0 || to >= list.length) return state;
      [list[from], list[to]] = [list[to], list[from]];
      return { ...state, depth: setSlot(state.depth, action.slot, list) };
    }
    case 'TOGGLE_KEEP': {
      if (!roster.includes(action.id)) return state;
      const keep = state.keepOnField.includes(action.id)
        ? state.keepOnField.filter((id) => id !== action.id)
        : [...state.keepOnField, action.id];
      return { ...state, keepOnField: keep };
    }
    case 'AUTO_DEPTH':
      return { ...state, depth: autoDepth(roster) };
  }
}

/** Remove do depth chart e do "manter em campo" quem não está mais no elenco. */
export function pruneDepth(state: DepthState, roster: readonly number[]): DepthState {
  const depth: Team['depth'] = {};
  for (const [slot, ids] of Object.entries(state.depth) as [SlotId, number[] | undefined][]) {
    depth[slot] = (ids ?? []).filter((id) => roster.includes(id));
  }
  return { depth, keepOnField: state.keepOnField.filter((id) => roster.includes(id)) };
}
```

`apps/client/src/builder/builderState.ts`:
```ts
import type { CardSide } from '@pfl/engine';
import { DECK_SIZE, MAX_COPIES, ROSTER_SIZE, canIncludeInDeck, findCard, hasSpecies } from '@pfl/engine';
import type { TeamDraft } from './draft';
import { applyDepthAction, pruneDepth, type DepthAction } from './depth';

export const MAX_NAME_LENGTH = 24;

export type BuilderAction =
  | { type: 'LOAD'; draft: TeamDraft }
  | { type: 'RENAME'; name: string }
  | { type: 'ADD_SPECIES'; id: number }
  | { type: 'REMOVE_SPECIES'; id: number }
  | { type: 'SET_SPECIALIST'; id: number | null }
  | { type: 'DECK_ADD'; side: CardSide; cardId: string }
  | { type: 'DECK_REMOVE'; side: CardSide; cardId: string }
  | DepthAction;

/** Só cartas de tipo/assinatura do lado certo, liberadas pelo elenco (spec 3.4). */
export function isDeckCard(cardId: string, side: CardSide, roster: readonly number[]): boolean {
  const card = findCard(cardId);
  return (
    !!card &&
    card.side === side &&
    (card.origin === 'TYPE' || card.origin === 'SIGNATURE') &&
    canIncludeInDeck(card, roster)
  );
}

const deckOf = (d: TeamDraft, side: CardSide): string[] => (side === 'OFFENSE' ? d.offenseDeck : d.defenseDeck);
const withDeck = (d: TeamDraft, side: CardSide, deck: string[]): TeamDraft =>
  side === 'OFFENSE' ? { ...d, offenseDeck: deck } : { ...d, defenseDeck: deck };

/** Troca o elenco e remove do depth chart e dos decks o que deixou de ser válido. */
function withRoster(d: TeamDraft, roster: number[]): TeamDraft {
  const pruned = pruneDepth({ depth: d.depth, keepOnField: d.keepOnField }, roster);
  return {
    ...d,
    roster,
    depth: pruned.depth,
    keepOnField: pruned.keepOnField,
    offenseDeck: d.offenseDeck.filter((id) => isDeckCard(id, 'OFFENSE', roster)),
    defenseDeck: d.defenseDeck.filter((id) => isDeckCard(id, 'DEFENSE', roster)),
  };
}

export function builderReducer(d: TeamDraft, a: BuilderAction): TeamDraft {
  switch (a.type) {
    case 'LOAD':
      return a.draft;
    case 'RENAME':
      return { ...d, name: a.name.slice(0, MAX_NAME_LENGTH) };
    case 'ADD_SPECIES':
      if (!hasSpecies(a.id) || d.roster.includes(a.id) || d.specialist === a.id || d.roster.length >= ROSTER_SIZE) return d;
      return { ...d, roster: [...d.roster, a.id] };
    case 'REMOVE_SPECIES':
      if (d.specialist === a.id) return { ...d, specialist: null };
      if (!d.roster.includes(a.id)) return d;
      return withRoster(d, d.roster.filter((id) => id !== a.id));
    case 'SET_SPECIALIST':
      if (a.id === null) return { ...d, specialist: null };
      if (!hasSpecies(a.id)) return d;
      return { ...withRoster(d, d.roster.filter((id) => id !== a.id)), specialist: a.id };
    case 'DECK_ADD': {
      const deck = deckOf(d, a.side);
      const copies = deck.filter((id) => id === a.cardId).length;
      if (deck.length >= DECK_SIZE || copies >= MAX_COPIES || !isDeckCard(a.cardId, a.side, d.roster)) return d;
      return withDeck(d, a.side, [...deck, a.cardId]);
    }
    case 'DECK_REMOVE': {
      const deck = deckOf(d, a.side);
      const index = deck.lastIndexOf(a.cardId);
      if (index < 0) return d;
      return withDeck(d, a.side, [...deck.slice(0, index), ...deck.slice(index + 1)]);
    }
    default: {
      const next = applyDepthAction({ depth: d.depth, keepOnField: d.keepOnField }, d.roster, a);
      return { ...d, depth: next.depth, keepOnField: next.keepOnField };
    }
  }
}
```

- [ ] **Step 5: Rodar os testes**

Run: `npx vitest run apps/client/test/builder.test.ts`
Expected: PASS. Se `validateTeam({ ...testTeam(), depth })` não vier vazio, imprima os erros: a garantia do `AUTO_DEPTH_SIZE = 7` vale para qualquer elenco de 16, então o erro está no `autoDepth`, não no teste.

- [ ] **Step 6: Typecheck e commit**

Run: `npm run typecheck`
Expected: sem erros.

```bash
git add apps/client/src/builder apps/client/test/fixtures.ts apps/client/test/builder.test.ts
git commit -m "feat(client): reducer do time em montagem e depth chart por vaga"
```

---

### Task 5: Montagem do time: derivados (custo, cartas liberadas, filtros, erros) e tooltip de carta

**Files:**
- Create: `apps/client/src/builder/derived.ts`, `apps/client/src/builder/cardInfo.ts`
- Test: `apps/client/test/derived.test.ts`

**Interfaces:**
- Consumes (`@pfl/engine`): `ALL_SPECIES`, `CARDS`, `SALARY_CAP`, `READ_MATRIX`, `OFFENSE_PROFILES`, `aptitude`, `canIncludeInDeck`, `findCard`, `getSpecies`, `speciesCost`, `validateTeam` e os tipos `Card`, `CardSide`, `Position`, `PokemonType`, `Species`, `TeamError`, `Requirement`, `OffenseCategory`, `DefenseCategory`, `FormationId`, `PackageId`. Consome também `TeamDraft`, `draftToTeam` (Task 4) e `TYPE_LABELS`, `CATEGORY_LABELS`, `ORIGIN_LABELS`, `FORMATION_LABELS`, `PACKAGE_LABELS`, `displayName`, `speciesName` (Task 3).
- Produces:
  - `draftCost(d: TeamDraft): number`
  - `interface CapInfo { cost: number; cap: number; remaining: number; over: boolean; ratio: number }`, `capInfo(d: TeamDraft): CapInfo`
  - `eligibleCards(roster: readonly number[], side: CardSide): Card[]`, `deckCardTotal(side: CardSide): number`, `copiesIn(deck: readonly string[], cardId: string): number`
  - `interface PokedexFilter { search: string; type: PokemonType | 'ALL'; maxCost: number | null; position: Position | 'ALL'; minAptitude: number }`, `DEFAULT_FILTER`, `filterPokedex(f: PokedexFilter): Species[]`
  - `draftErrors(d: TeamDraft): TeamError[]` (vazio = válido), `teamErrorMessage(e: TeamError): string`
  - `interface CardInfo { name: string; category: string; element: string | null; origin: string; requirements: string[]; profile: string[]; reads: string[] }`, `requirementText(req: Requirement): string`, `cardInfo(card: Card): CardInfo`

- [ ] **Step 1: Escrever o teste (deve falhar)**

`apps/client/test/derived.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { OFFENSE_PROFILES, SALARY_CAP, getCard, teamCost } from '@pfl/engine';
import {
  DEFAULT_FILTER, capInfo, copiesIn, draftErrors, eligibleCards, filterPokedex, teamErrorMessage,
} from '../src/builder/derived';
import { cardInfo, requirementText } from '../src/builder/cardInfo';
import { draftFromTeam, emptyDraft } from '../src/builder/draft';
import { testTeam } from './fixtures';

describe('teto salarial', () => {
  it('soma elenco e especialista como o engine', () => {
    const team = testTeam();
    const info = capInfo(draftFromTeam(team));
    expect(info.cost).toBe(teamCost(team));
    expect(info.cap).toBe(SALARY_CAP);
    expect(info.remaining).toBe(SALARY_CAP - info.cost);
    expect(info.over).toBe(false);
  });

  it('marca time acima do teto', () => {
    const expensive = [3, 6, 9, 149, 143, 130, 131, 59, 65, 68, 76, 94, 112, 134, 135, 136];
    const info = capInfo({ ...draftFromTeam(testTeam()), roster: expensive });
    expect(info.over).toBe(true);
    expect(info.ratio).toBe(1);
  });

  it('rascunho vazio custa 0', () => {
    expect(capInfo(emptyDraft()).cost).toBe(0);
  });
});

describe('cartas liberadas pelo elenco', () => {
  const roster = testTeam().roster;

  it('lista só cartas de tipo/assinatura do lado pedido que o elenco libera', () => {
    const offense = eligibleCards(roster, 'OFFENSE').map((c) => c.id);
    expect(offense).toContain('electric_thunder_screen');
    expect(offense).not.toContain('fire_deep');
    expect(offense).not.toContain('basic_run');
    expect(offense).not.toContain('punt');
    expect(eligibleCards(roster, 'DEFENSE').every((c) => c.side === 'DEFENSE')).toBe(true);
    expect(eligibleCards([], 'OFFENSE')).toEqual([]);
  });

  it('conta cópias no deck', () => {
    expect(copiesIn(testTeam().offenseDeck, 'normal_tackle')).toBe(2);
    expect(copiesIn([], 'normal_tackle')).toBe(0);
  });
});

describe('Pokédex', () => {
  it('filtra por tipo, custo, aptidão e busca', () => {
    const electric = filterPokedex({ ...DEFAULT_FILTER, type: 'electric' }).map((s) => s.id);
    expect(electric).toContain(25);
    expect(electric).not.toContain(1);
    expect(filterPokedex({ ...DEFAULT_FILTER, maxCost: 1 }).map((s) => s.id)).toContain(129);
    const fastWr = filterPokedex({ ...DEFAULT_FILTER, position: 'WR', minAptitude: 5 }).map((s) => s.id);
    expect(fastWr).toContain(135);
    expect(fastWr).not.toContain(143);
    expect(filterPokedex({ ...DEFAULT_FILTER, search: 'mr. m' }).map((s) => s.id)).toEqual([122]);
    expect(filterPokedex({ ...DEFAULT_FILTER, search: '25' }).map((s) => s.id)).toEqual([25]);
    expect(filterPokedex(DEFAULT_FILTER)).toHaveLength(151);
  });
});

describe('erros do time', () => {
  it('pede especialista antes de validar', () => {
    expect(draftErrors(emptyDraft()).map((e) => e.code)).toEqual(['NO_SPECIALIST']);
  });

  it('time válido não tem erros', () => {
    expect(draftErrors(draftFromTeam(testTeam()))).toEqual([]);
  });

  it('traduz os códigos do engine', () => {
    expect(teamErrorMessage({ code: 'OVER_CAP', detail: '130' })).toMatch(/130.*120/);
    expect(teamErrorMessage({ code: 'CARD_NOT_ELIGIBLE', detail: 'fire_deep' })).toContain(getCard('fire_deep').name);
    expect(teamErrorMessage({ code: 'FORMATION_UNFILLABLE', detail: 'HEAVY' })).toContain('Pesada');
    expect(teamErrorMessage({ code: 'CODIGO_NOVO', detail: 'x' })).toBe('CODIGO_NOVO: x');
  });
});

describe('tooltip de carta', () => {
  it('descreve requisitos', () => {
    expect(requirementText({ position: 'RB', types: ['electric'] })).toBe('RB Elétrico');
    expect(requirementText({ position: 'OL', types: ['rock'], count: 2 })).toBe('2 OL Pedra');
    expect(requirementText({ position: 'DL', types: ['rock', 'ground'], count: 3 })).toBe('3 DL Pedra/Terra');
    expect(requirementText({ position: 'WR', species: [17, 18] })).toBe('WR: Pidgeotto/Pidgeot');
  });

  it('mostra o perfil da categoria e a leitura', () => {
    const info = cardInfo(getCard('basic_run'));
    expect(info.category).toBe('Corrida por Dentro');
    expect(info.element).toBeNull();
    expect(info.requirements).toEqual([]);
    expect(info.profile[0]).toBe(`Jardas base: ${OFFENSE_PROFILES.RUN_INSIDE.baseYards}`);
    expect(info.reads.join(' ')).toContain('Contenção de Corrida');
    expect(info.reads[1]).toMatch(/Homem a Homem/);
  });

  it('defesa base é sempre neutra; especiais explicam o chute', () => {
    expect(cardInfo(getCard('basic_defense')).reads).toEqual(['Leitura sempre neutra']);
    expect(cardInfo(getCard('punt')).profile[0]).toMatch(/especialista/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/derived.test.ts`
Expected: FAIL — imports não resolvidos.

- [ ] **Step 3: Implementar**

`apps/client/src/builder/derived.ts`:
```ts
import type { Card, CardSide, FormationId, PackageId, PokemonType, Position, Species, TeamError } from '@pfl/engine';
import {
  ALL_SPECIES, CARDS, SALARY_CAP, aptitude, canIncludeInDeck, findCard, speciesCost, validateTeam,
} from '@pfl/engine';
import { draftToTeam, type TeamDraft } from './draft';
import { FORMATION_LABELS, PACKAGE_LABELS, displayName } from '../lib/names';

export function draftCost(d: TeamDraft): number {
  const ids = d.specialist === null ? d.roster : [...d.roster, d.specialist];
  return ids.reduce((sum, id) => sum + speciesCost(id), 0);
}

export interface CapInfo {
  cost: number;
  cap: number;
  remaining: number;
  over: boolean;
  /** 0..1 para a barra */
  ratio: number;
}

export function capInfo(d: TeamDraft): CapInfo {
  const cost = draftCost(d);
  return { cost, cap: SALARY_CAP, remaining: SALARY_CAP - cost, over: cost > SALARY_CAP, ratio: Math.min(1, cost / SALARY_CAP) };
}

const ORIGIN_ORDER: Record<Card['origin'], number> = { SIGNATURE: 0, TYPE: 1, BASIC: 2, SPECIAL: 3 };
const isDeckOrigin = (c: Card) => c.origin === 'TYPE' || c.origin === 'SIGNATURE';

/** Cartas que o elenco libera para o deck (spec 3.4); assinaturas primeiro. */
export function eligibleCards(roster: readonly number[], side: CardSide): Card[] {
  if (roster.length === 0) return [];
  return CARDS.filter((c) => c.side === side && isDeckOrigin(c) && canIncludeInDeck(c, roster)).sort(
    (a, b) => ORIGIN_ORDER[a.origin] - ORIGIN_ORDER[b.origin] || a.name.localeCompare(b.name, 'pt-BR'),
  );
}

/** Quantas cartas de deck existem no catálogo para o lado (para mostrar "X bloqueadas"). */
export function deckCardTotal(side: CardSide): number {
  return CARDS.filter((c) => c.side === side && isDeckOrigin(c)).length;
}

export function copiesIn(deck: readonly string[], cardId: string): number {
  return deck.filter((id) => id === cardId).length;
}

export interface PokedexFilter {
  search: string;
  type: PokemonType | 'ALL';
  maxCost: number | null;
  position: Position | 'ALL';
  minAptitude: number;
}

export const DEFAULT_FILTER: PokedexFilter = { search: '', type: 'ALL', maxCost: null, position: 'ALL', minAptitude: 1 };

export function filterPokedex(f: PokedexFilter): Species[] {
  const q = f.search.trim().toLowerCase();
  return ALL_SPECIES.filter(
    (s) =>
      (!q || String(s.id) === q || s.name.includes(q) || displayName(s.name).toLowerCase().includes(q)) &&
      (f.type === 'ALL' || s.types.includes(f.type)) &&
      (f.maxCost === null || speciesCost(s.id) <= f.maxCost) &&
      (f.position === 'ALL' || aptitude(s.id, f.position) >= f.minAptitude),
  );
}

/** Erros locais (os mesmos do servidor, que revalida). Lista vazia = válido. */
export function draftErrors(d: TeamDraft): TeamError[] {
  const team = draftToTeam(d);
  if (!team) return [{ code: 'NO_SPECIALIST' }];
  return validateTeam(team);
}

const cardName = (id: string | undefined): string => (id ? findCard(id)?.name ?? id : '?');

export function teamErrorMessage(e: TeamError): string {
  const d = e.detail ?? '';
  switch (e.code) {
    case 'NO_SPECIALIST': return 'Escolha um especialista (kicker/punter).';
    case 'MALFORMED_TEAM': return 'O time está malformado.';
    case 'UNKNOWN_SPECIES': return `Pokémon desconhecido: ${d}.`;
    case 'ROSTER_SIZE': return `O elenco precisa de 16 Pokémon de linha (tem ${d}).`;
    case 'DUPLICATE_SPECIES': return 'Cada espécie só pode aparecer uma vez no time.';
    case 'TOO_MANY_LEGENDARIES': return 'No máximo 1 lendário por time.';
    case 'OVER_CAP': return `Custo ${d} acima do teto de ${SALARY_CAP}.`;
    case 'DECK_SIZE_OFFENSE': return `O deck de ataque precisa de 12 cartas (tem ${d}).`;
    case 'DECK_SIZE_DEFENSE': return `O deck de defesa precisa de 12 cartas (tem ${d}).`;
    case 'DECK_COPIES': return `No máximo 2 cópias de ${cardName(e.detail)}.`;
    case 'UNKNOWN_CARD': return `Carta desconhecida: ${d}.`;
    case 'CARD_NOT_ALLOWED': return `${cardName(e.detail)} não pode entrar neste deck.`;
    case 'CARD_NOT_ELIGIBLE': return `O elenco não libera a carta ${cardName(e.detail)}.`;
    case 'DEPTH_NOT_IN_ROSTER': return `Depth chart com Pokémon fora do elenco (${d}).`;
    case 'KEEP_NOT_IN_ROSTER': return `"Manter em campo" com Pokémon fora do elenco (${d}).`;
    case 'FORMATION_UNFILLABLE':
      return `O depth chart não preenche a formação ${FORMATION_LABELS[d as FormationId] ?? d}.`;
    case 'PACKAGE_UNFILLABLE':
      return `O depth chart não preenche o pacote ${PACKAGE_LABELS[d as PackageId] ?? d}.`;
    default:
      return e.detail ? `${e.code}: ${e.detail}` : e.code;
  }
}
```

`apps/client/src/builder/cardInfo.ts`:
```ts
import type { Card, DefenseCategory, OffenseCategory, ReadResult, Requirement } from '@pfl/engine';
import { OFFENSE_PROFILES, READ_MATRIX, getSpecies } from '@pfl/engine';
import { CATEGORY_LABELS, ORIGIN_LABELS, TYPE_LABELS, displayName } from '../lib/names';

export interface CardInfo {
  name: string;
  category: string;
  element: string | null;
  origin: string;
  requirements: string[];
  profile: string[];
  reads: string[];
}

export function requirementText(req: Requirement): string {
  const count = (req.count ?? 1) > 1 ? `${req.count} ` : '';
  const types = req.types?.length ? ` ${req.types.map((t) => TYPE_LABELS[t]).join('/')}` : '';
  const species = req.species?.length ? `: ${req.species.map((id) => displayName(getSpecies(id).name)).join('/')}` : '';
  return `${count}${req.position}${types}${species}`;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
type ReadableDefense = keyof typeof READ_MATRIX;
const DEFENSES = Object.keys(READ_MATRIX) as ReadableDefense[];
const OFFENSES = Object.keys(OFFENSE_PROFILES) as OffenseCategory[];
const labels = (cats: string[]) => (cats.length ? cats.map((c) => CATEGORY_LABELS[c as OffenseCategory]).join(', ') : 'nenhuma');

function offenseReads(category: OffenseCategory): string[] {
  const by = (r: ReadResult) => DEFENSES.filter((d) => READ_MATRIX[d][category] === r);
  return [`Defesas que acertam (✔): ${labels(by('RIGHT'))}`, `Defesas que erram (✖): ${labels(by('WRONG'))}`];
}

function defenseReads(category: DefenseCategory): string[] {
  if (category === 'BASE_D') return ['Leitura sempre neutra'];
  const row = READ_MATRIX[category];
  const by = (r: ReadResult) => OFFENSES.filter((o) => row[o] === r);
  return [`Acerta (✔): ${labels(by('RIGHT'))}`, `Erra (✖): ${labels(by('WRONG'))}`];
}

function offenseProfile(card: Card, category: OffenseCategory): string[] {
  const p = OFFENSE_PROFILES[category];
  const risks: [string, number][] = [
    ['Sack', p.risk.sack],
    ['Interceptação', p.risk.interception],
    ['Fumble', p.risk.fumble],
    ['Incompleto', p.risk.incompletion],
    ['Big play', p.risk.bigPlay],
  ];
  return [
    `Jardas base: ${card.baseYards ?? p.baseYards}`,
    ...risks.filter(([, v]) => v > 0).map(([name, v]) => `${name} ${pct(v)}`),
  ];
}

/** Texto do tooltip: requisitos, perfil da categoria e leitura (spec 6.2). */
export function cardInfo(card: Card): CardInfo {
  let profile: string[] = [];
  let reads: string[] = [];
  if (card.category === 'PUNT') {
    profile = ['Chute do especialista (Sp. Atk + Attack)'];
  } else if (card.category === 'FIELD_GOAL') {
    profile = ['Chute do especialista (Sp. Atk); cai com a distância'];
  } else if (card.side === 'OFFENSE') {
    const category = card.category as OffenseCategory;
    profile = offenseProfile(card, category);
    reads = offenseReads(category);
  } else {
    reads = defenseReads(card.category as DefenseCategory);
  }
  return {
    name: card.name,
    category: CATEGORY_LABELS[card.category],
    element: card.element ? TYPE_LABELS[card.element] : null,
    origin: ORIGIN_LABELS[card.origin],
    requirements: card.requirements.map(requirementText),
    profile,
    reads,
  };
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run apps/client/test/derived.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck e commit**

Run: `npm run typecheck`
Expected: sem erros.

```bash
git add apps/client/src/builder/derived.ts apps/client/src/builder/cardInfo.ts apps/client/test/derived.test.ts
git commit -m "feat(client): teto, cartas liberadas, filtros da Pokédex e tooltip de carta"
```

---

### Task 6: Persistência e código de time (localStorage, exportar/importar)

**Files:**
- Create: `apps/client/src/builder/teamStore.ts`
- Test: `apps/client/test/team-store.test.ts`

**Interfaces:**
- Consumes: `encodeTeam`, `decodeTeam` (`@pfl/protocol`); `hasSpecies`, `findCard`, `canIncludeInDeck`, `ROSTER_SIZE`, `DECK_SIZE`, `MAX_COPIES`, `Team`, `CardSide`, `SlotId` (`@pfl/engine`); `TeamDraft`, `draftToTeam`, `ALL_SLOTS`, `MAX_NAME_LENGTH` (Task 4); `StorageLike`, `readJson`, `writeJson` (Task 3).
- Produces:
  - `TEAMS_KEY = 'pfl:teams:v1'`, `MAX_CODE_LENGTH = 20000`
  - `sanitizeTeam(value: unknown): { draft: TeamDraft; dropped: number } | null`
  - `loadTeams(storage: StorageLike | null): TeamDraft[]`, `saveTeams(storage: StorageLike | null, teams: readonly TeamDraft[]): boolean`
  - `type ImportResult = { ok: true; draft: TeamDraft; dropped: number } | { ok: false; message: string }`, `importTeamCode(code: string): ImportResult`
  - `exportTeamCode(d: TeamDraft): string | null` (null sem especialista)

- [ ] **Step 1: Escrever o teste (deve falhar)**

`apps/client/test/team-store.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { Team } from '@pfl/engine';
import { encodeTeam } from '@pfl/protocol';
import { exportTeamCode, importTeamCode, loadTeams, sanitizeTeam, saveTeams, TEAMS_KEY } from '../src/builder/teamStore';
import { draftErrors } from '../src/builder/derived';
import { draftFromTeam, emptyDraft } from '../src/builder/draft';
import { memoryStorage, type StorageLike } from '../src/lib/storage';
import { testTeam } from './fixtures';

/** Codifica qualquer objeto no formato de código de time (o encodeTeam não valida o conteúdo). */
const codeOf = (value: unknown) => encodeTeam(value as Team);

describe('exportar e importar', () => {
  it('faz ida e volta sem perdas', () => {
    const draft = draftFromTeam(testTeam());
    const code = exportTeamCode(draft);
    expect(code).not.toBeNull();
    const result = importTeamCode(`  ${code}\n`);
    expect(result).toEqual({ ok: true, draft, dropped: 0 });
  });

  it('não exporta sem especialista', () => {
    expect(exportTeamCode(emptyDraft())).toBeNull();
  });

  it('recusa código vazio, lixo, base64 que não é JSON e JSON que não é time', () => {
    expect(importTeamCode('   ')).toMatchObject({ ok: false });
    expect(importTeamCode('isto não é um código!!!')).toMatchObject({ ok: false });
    expect(importTeamCode(Buffer.from('olá, mundo').toString('base64url'))).toMatchObject({ ok: false });
    expect(importTeamCode(codeOf([1, 2, 3]))).toMatchObject({ ok: false, message: 'O código não contém um time.' });
    expect(importTeamCode(codeOf({ name: 'x' }))).toMatchObject({ ok: false });
    expect(importTeamCode('A'.repeat(30000))).toMatchObject({ ok: false });
  });

  it('código editado à mão: descarta o inválido sem lançar e o resto continua utilizável', () => {
    const t = testTeam();
    const edited = {
      ...t,
      name: 42,
      roster: [...t.roster.slice(0, 14), 999, '25', 25, -1, 3.5],
      specialist: 151000,
      depth: { ...t.depth, QB: [63, 999, 'x'], XX: [1, 2], WR1: 'nope' },
      keepOnField: [63, 777],
      offenseDeck: [...t.offenseDeck.slice(0, 10), 'xyz', 'basic_run', 'normal_wall', 'fire_deep'],
      defenseDeck: Array(20).fill('ground_dig'),
    };
    const result = importTeamCode(codeOf(edited));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const d = result.draft;
    expect(d.name).toBe('Time importado');
    expect(d.roster).toEqual(t.roster.slice(0, 14)); // 999, '25', 25 repetido, -1 e 3.5 descartados
    expect(d.specialist).toBeNull();
    expect(d.depth.QB).toEqual([63]);
    expect(d.depth).not.toHaveProperty('XX');
    expect(d.depth.WR1).toBeUndefined();
    expect(d.keepOnField).toEqual([63]);
    expect(d.offenseDeck).toHaveLength(10);
    expect(d.defenseDeck).toEqual(['ground_dig', 'ground_dig']);
    expect(result.dropped).toBeGreaterThan(10);
    expect(() => draftErrors(d)).not.toThrow();
  });

  it('sanitizeTeam recusa o que não é objeto com elenco', () => {
    expect(sanitizeTeam(null)).toBeNull();
    expect(sanitizeTeam('time')).toBeNull();
    expect(sanitizeTeam({ roster: 'x' })).toBeNull();
  });
});

describe('localStorage', () => {
  const broken = (): StorageLike => ({
    getItem: () => { throw new Error('SecurityError'); },
    setItem: () => { throw new Error('QuotaExceededError'); },
    removeItem: () => {},
  });

  it('salva e carrega', () => {
    const mem = memoryStorage();
    const teams = [draftFromTeam(testTeam('A')), emptyDraft('Rascunho')];
    expect(saveTeams(mem, teams)).toBe(true);
    expect(loadTeams(mem)).toEqual(teams);
  });

  it('storage indisponível ou cheio: carrega lista vazia e informa que não salvou', () => {
    expect(loadTeams(null)).toEqual([]);
    expect(loadTeams(broken())).toEqual([]);
    expect(saveTeams(null, [emptyDraft()])).toBe(false);
    expect(saveTeams(broken(), [emptyDraft()])).toBe(false);
  });

  it('conteúdo corrompido: ignora entradas inválidas e mantém as boas', () => {
    const mem = memoryStorage();
    mem.setItem(TEAMS_KEY, '{quebrado');
    expect(loadTeams(mem)).toEqual([]);
    mem.setItem(TEAMS_KEY, JSON.stringify([null, 7, { roster: 'x' }, draftFromTeam(testTeam())]));
    expect(loadTeams(mem)).toEqual([draftFromTeam(testTeam())]);
    mem.setItem(TEAMS_KEY, JSON.stringify({ not: 'array' }));
    expect(loadTeams(mem)).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/team-store.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 3: Implementar**

`apps/client/src/builder/teamStore.ts`:
```ts
import type { CardSide, SlotId, Team } from '@pfl/engine';
import { DECK_SIZE, MAX_COPIES, ROSTER_SIZE, canIncludeInDeck, findCard, hasSpecies } from '@pfl/engine';
import { decodeTeam, encodeTeam } from '@pfl/protocol';
import { draftToTeam, type TeamDraft } from './draft';
import { ALL_SLOTS } from './depth';
import { MAX_NAME_LENGTH } from './builderState';
import { readJson, writeJson, type StorageLike } from '../lib/storage';

export const TEAMS_KEY = 'pfl:teams:v1';
export const MAX_CODE_LENGTH = 20000;
const IMPORTED_NAME = 'Time importado';

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isSpeciesId = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && hasSpecies(v);

/**
 * Converte qualquer valor (código importado, localStorage) num rascunho seguro. Descarta espécies,
 * cartas e vagas desconhecidas ANTES de qualquer getSpecies/getCard, que lançam erro. Nunca lança.
 * Devolve null se o valor nem parece um time (não é objeto ou não tem lista de elenco).
 */
export function sanitizeTeam(value: unknown): { draft: TeamDraft; dropped: number } | null {
  if (!isRecord(value) || !Array.isArray(value.roster)) return null;
  let dropped = 0;

  const roster: number[] = [];
  for (const v of value.roster) {
    if (isSpeciesId(v) && !roster.includes(v) && roster.length < ROSTER_SIZE) roster.push(v);
    else dropped++;
  }

  let specialist: number | null = null;
  if (value.specialist !== undefined && value.specialist !== null) {
    if (isSpeciesId(value.specialist) && !roster.includes(value.specialist)) specialist = value.specialist;
    else dropped++;
  }

  const depth: Team['depth'] = {};
  if (isRecord(value.depth)) {
    for (const [key, list] of Object.entries(value.depth)) {
      if (!(ALL_SLOTS as readonly string[]).includes(key) || !Array.isArray(list)) {
        dropped++;
        continue;
      }
      const ids: number[] = [];
      for (const v of list) {
        if (typeof v === 'number' && roster.includes(v) && !ids.includes(v)) ids.push(v);
        else dropped++;
      }
      depth[key as SlotId] = ids;
    }
  }

  const keepOnField: number[] = [];
  if (Array.isArray(value.keepOnField)) {
    for (const v of value.keepOnField) {
      if (typeof v === 'number' && roster.includes(v) && !keepOnField.includes(v)) keepOnField.push(v);
      else dropped++;
    }
  }

  const deck = (raw: unknown, side: CardSide): string[] => {
    const out: string[] = [];
    if (!Array.isArray(raw)) return out;
    for (const v of raw) {
      const card = typeof v === 'string' ? findCard(v) : undefined;
      const ok =
        !!card &&
        card.side === side &&
        (card.origin === 'TYPE' || card.origin === 'SIGNATURE') &&
        canIncludeInDeck(card, roster) &&
        out.length < DECK_SIZE &&
        out.filter((id) => id === card.id).length < MAX_COPIES;
      if (ok) out.push(card.id);
      else dropped++;
    }
    return out;
  };

  const name =
    typeof value.name === 'string' && value.name.trim() ? value.name.trim().slice(0, MAX_NAME_LENGTH) : IMPORTED_NAME;

  return {
    draft: {
      name,
      roster,
      specialist,
      depth,
      keepOnField,
      offenseDeck: deck(value.offenseDeck, 'OFFENSE'),
      defenseDeck: deck(value.defenseDeck, 'DEFENSE'),
    },
    dropped,
  };
}

export function loadTeams(storage: StorageLike | null): TeamDraft[] {
  const raw = readJson(storage, TEAMS_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const s = sanitizeTeam(entry);
    return s ? [s.draft] : [];
  });
}

/** false = não salvou (storage indisponível ou cheio); a interface avisa para exportar o código. */
export function saveTeams(storage: StorageLike | null, teams: readonly TeamDraft[]): boolean {
  return writeJson(storage, TEAMS_KEY, teams);
}

export type ImportResult = { ok: true; draft: TeamDraft; dropped: number } | { ok: false; message: string };

export function importTeamCode(code: string): ImportResult {
  const trimmed = code.trim();
  if (!trimmed) return { ok: false, message: 'Cole um código de time.' };
  if (trimmed.length > MAX_CODE_LENGTH) return { ok: false, message: 'Código grande demais para ser um time.' };
  let decoded: unknown = null;
  try {
    decoded = decodeTeam(trimmed);
  } catch {
    decoded = null; // o contrato diz que nunca lança; a proteção é barata
  }
  if (decoded === null || decoded === undefined) return { ok: false, message: 'Código inválido: não foi possível lê-lo.' };
  const sanitized = sanitizeTeam(decoded);
  if (!sanitized) return { ok: false, message: 'O código não contém um time.' };
  if (sanitized.draft.roster.length === 0 && sanitized.draft.specialist === null) {
    return { ok: false, message: 'O código não contém nenhum Pokémon válido.' };
  }
  return { ok: true, draft: sanitized.draft, dropped: sanitized.dropped };
}

export function exportTeamCode(d: TeamDraft): string | null {
  const team = draftToTeam(d);
  return team ? encodeTeam(team) : null;
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run apps/client/test/team-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck e commit**

Run: `npm run typecheck`
Expected: sem erros.

```bash
git add apps/client/src/builder/teamStore.ts apps/client/test/team-store.test.ts
git commit -m "feat(client): salvar times no localStorage e importar código de forma segura"
```

---

### Task 7: Rede: sessão, código de sala, reação a erros e socket tipado

**Files:**
- Create: `apps/client/src/net/session.ts`, `apps/client/src/net/socket.ts`
- Test: `apps/client/test/session.test.ts`

**Interfaces:**
- Consumes: `ROOM_CODE_LENGTH`, `ErrorCode`, `ErrorMessage`, `ClientToServerEvents`, `ServerToClientEvents` (`@pfl/protocol`); `TeamKey` (`@pfl/engine`); `StorageLike`, `readJson`, `writeJson`, `removeKey` (Task 3).
- Produces:
  - `SESSION_KEY = 'pfl:session:v1'`, `interface Session { code: string; token: string; you: TeamKey; teamCode: string | null }`
  - `loadSession(storage: StorageLike | null): Session | null`, `saveSession(storage: StorageLike | null, s: Session): boolean`, `clearSession(storage: StorageLike | null): void`
  - `normalizeRoomCode(input: string): string | null`
  - `ERROR_MESSAGES: Record<ErrorCode, string>`, `interface ErrorReaction { notice: string | null; resync: boolean; leaveRoom: boolean }`, `errorReaction(e: ErrorMessage): ErrorReaction`
  - `class AckError extends Error { readonly error: ErrorMessage }`, `describeFailure(err: unknown): string`
  - `type PflSocket = Socket<ServerToClientEvents, ClientToServerEvents>`, `interface Joined { code: string; you: TeamKey; token: string }`, `ACK_TIMEOUT_MS = 8000`, `serverUrl(): string`, `createSocket(url?: string): PflSocket`, `createRoom(socket: PflSocket): Promise<Joined>`, `joinRoom(socket: PflSocket, code: string, token?: string): Promise<Joined>` (as promises rejeitam com `AckError` ou `Error` de timeout)

- [ ] **Step 1: Escrever o teste (deve falhar)**

`apps/client/test/session.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  AckError, ERROR_MESSAGES, SESSION_KEY, clearSession, describeFailure, errorReaction, loadSession,
  normalizeRoomCode, saveSession, type Session,
} from '../src/net/session';
import { memoryStorage } from '../src/lib/storage';

const session: Session = { code: 'ABCDEF', token: 'tok-123', you: 'B', teamCode: 'xyz' };

describe('sessão (reconexão por aba)', () => {
  it('salva, carrega e limpa', () => {
    const mem = memoryStorage();
    expect(saveSession(mem, session)).toBe(true);
    expect(loadSession(mem)).toEqual(session);
    clearSession(mem);
    expect(loadSession(mem)).toBeNull();
  });

  it('ignora sessão corrompida ou incompleta', () => {
    const mem = memoryStorage();
    for (const raw of ['{x', JSON.stringify({ ...session, you: 'C' }), JSON.stringify({ ...session, code: 'abc' }), JSON.stringify({ ...session, token: '' })]) {
      mem.setItem(SESSION_KEY, raw);
      expect(loadSession(mem)).toBeNull();
    }
    mem.setItem(SESSION_KEY, JSON.stringify({ ...session, teamCode: 42 }));
    expect(loadSession(mem)?.teamCode).toBeNull();
  });

  it('sem storage: não carrega e informa que não salvou', () => {
    expect(loadSession(null)).toBeNull();
    expect(saveSession(null, session)).toBe(false);
    expect(() => clearSession(null)).not.toThrow();
  });
});

describe('normalizeRoomCode', () => {
  it('aceita 6 letras sem I/O, em qualquer caixa e com espaços', () => {
    expect(normalizeRoomCode(' abc def ')).toBe('ABCDEF');
    expect(normalizeRoomCode('QWERTY')).toBe('QWERTY');
  });

  it('recusa tamanho errado, dígitos e as letras I e O', () => {
    expect(normalizeRoomCode('ABCDE')).toBeNull();
    expect(normalizeRoomCode('ABCDE1')).toBeNull();
    expect(normalizeRoomCode('ABCDIO')).toBeNull();
    expect(normalizeRoomCode('')).toBeNull();
  });
});

describe('errorReaction', () => {
  it('STALE_TURN é silencioso: o servidor reenvia a fase', () => {
    expect(errorReaction({ code: 'STALE_TURN', message: '' })).toEqual({ notice: null, resync: false, leaveRoom: false });
  });

  it('ENGINE_ERROR mostra o motivo e pede resync', () => {
    expect(errorReaction({ code: 'ENGINE_ERROR', message: 'CARD_NOT_PLAYABLE: punt' })).toEqual({
      notice: 'Ação recusada: CARD_NOT_PLAYABLE: punt', resync: true, leaveRoom: false,
    });
    expect(errorReaction({ code: 'ENGINE_ERROR', message: 'INVALID_DEPTH: FORMATION_UNFILLABLE' }).notice).toMatch(/recusou o depth chart/);
    expect(errorReaction({ code: 'ENGINE_ERROR', message: 'DEPTH_LOCKED' }).notice).toMatch(/primeiro snap do seu drive/);
  });

  it('sala inexistente ou cheia tira o jogador da sala', () => {
    expect(errorReaction({ code: 'ROOM_NOT_FOUND', message: '' })).toMatchObject({ leaveRoom: true, notice: ERROR_MESSAGES.ROOM_NOT_FOUND });
    expect(errorReaction({ code: 'ROOM_FULL', message: '' }).leaveRoom).toBe(true);
  });

  it('erros de time só avisam', () => {
    expect(errorReaction({ code: 'INVALID_TEAM_CODE', message: '' })).toEqual({ notice: ERROR_MESSAGES.INVALID_TEAM_CODE, resync: false, leaveRoom: false });
  });

  it('describeFailure traduz AckError e timeouts', () => {
    expect(describeFailure(new AckError({ code: 'ROOM_FULL', message: 'full' }))).toBe(ERROR_MESSAGES.ROOM_FULL);
    expect(describeFailure(new Error('O servidor não respondeu.'))).toBe('O servidor não respondeu.');
    expect(describeFailure('???')).toBe('Erro inesperado.');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/session.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 3: Implementar**

`apps/client/src/net/session.ts`:
```ts
import type { TeamKey } from '@pfl/engine';
import { ROOM_CODE_LENGTH, type ErrorCode, type ErrorMessage } from '@pfl/protocol';
import { readJson, removeKey, writeJson, type StorageLike } from '../lib/storage';

export const SESSION_KEY = 'pfl:session:v1';

/** Fica no sessionStorage (por aba): duas abas do mesmo navegador são dois jogadores. */
export interface Session {
  code: string;
  token: string;
  you: TeamKey;
  /** time enviado ao lobby, para a aba recarregada reconstruir prévias e o depth chart */
  teamCode: string | null;
}

const ROOM_LETTERS = /^[A-HJ-NP-Z]+$/; // A–Z sem I e O

export function normalizeRoomCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  return code.length === ROOM_CODE_LENGTH && ROOM_LETTERS.test(code) ? code : null;
}

export function loadSession(storage: StorageLike | null): Session | null {
  const raw = readJson(storage, SESSION_KEY);
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const code = r.code;
  const token = r.token;
  const you = r.you;
  if (typeof code !== 'string' || normalizeRoomCode(code) !== code) return null;
  if (typeof token !== 'string' || token.length === 0) return null;
  if (you !== 'A' && you !== 'B') return null;
  return { code, token, you, teamCode: typeof r.teamCode === 'string' ? r.teamCode : null };
}

export function saveSession(storage: StorageLike | null, session: Session): boolean {
  return writeJson(storage, SESSION_KEY, session);
}

export function clearSession(storage: StorageLike | null): void {
  removeKey(storage, SESSION_KEY);
}

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  ROOM_NOT_FOUND: 'Sala não encontrada. Confira o código.',
  ROOM_FULL: 'Essa sala já tem dois jogadores.',
  NOT_IN_ROOM: 'Você não está nessa sala.',
  INVALID_TEAM_CODE: 'O servidor não conseguiu ler o código do time.',
  TEAM_INVALID: 'O servidor recusou o time. Veja os motivos no lobby.',
  NOT_READY: 'Os dois jogadores precisam de um time válido antes de começar.',
  STALE_TURN: 'Essa ação chegou atrasada.',
  ENGINE_ERROR: 'Ação recusada pelo servidor.',
};

/** Códigos do engine que chegam em ENGINE_ERROR.message e merecem texto próprio. */
const ENGINE_NOTICES: Record<string, string> = {
  INVALID_DEPTH: 'O servidor recusou o depth chart: ele deixaria o time inválido.',
  DEPTH_LOCKED: 'O depth chart só pode ser ajustado no primeiro snap do seu drive; ele será reenviado no próximo.',
};

export interface ErrorReaction {
  notice: string | null;
  resync: boolean;
  leaveRoom: boolean;
}

/** Spec 8: ação inválida → o client faz match:resync. STALE_TURN: o servidor já reenvia a fase. */
export function errorReaction(e: ErrorMessage): ErrorReaction {
  switch (e.code) {
    case 'STALE_TURN':
      return { notice: null, resync: false, leaveRoom: false };
    case 'ENGINE_ERROR': {
      const known = Object.keys(ENGINE_NOTICES).find((code) => e.message.includes(code));
      return { notice: known ? ENGINE_NOTICES[known] : `Ação recusada: ${e.message}`, resync: true, leaveRoom: false };
    }
    case 'ROOM_NOT_FOUND':
    case 'ROOM_FULL':
    case 'NOT_IN_ROOM':
      return { notice: ERROR_MESSAGES[e.code], resync: false, leaveRoom: true };
    default:
      return { notice: ERROR_MESSAGES[e.code] ?? e.message, resync: false, leaveRoom: false };
  }
}

/** Falha devolvida pelo ack de room:create/room:join. */
export class AckError extends Error {
  readonly error: ErrorMessage;

  constructor(error: ErrorMessage) {
    super(error.message);
    this.name = 'AckError';
    this.error = error;
  }
}

export function describeFailure(err: unknown): string {
  if (err instanceof AckError) return ERROR_MESSAGES[err.error.code] ?? err.error.message;
  if (err instanceof Error) return err.message;
  return 'Erro inesperado.';
}
```

`apps/client/src/net/socket.ts`:
```ts
// Camada fina sobre o socket.io-client, tipada pelo @pfl/protocol. Sem lógica de jogo.
import { io, type Socket } from 'socket.io-client';
import type { TeamKey } from '@pfl/engine';
import type { ClientToServerEvents, ErrorMessage, ServerToClientEvents } from '@pfl/protocol';
import { AckError } from './session';

export type PflSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface Joined {
  code: string;
  you: TeamKey;
  token: string;
}

export const ACK_TIMEOUT_MS = 8000;

export function serverUrl(): string {
  return import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';
}

/** Só WebSocket: evita depender de CORS no long-polling entre :5173 e :3001. */
export function createSocket(url: string = serverUrl()): PflSocket {
  return io(url, { transports: ['websocket'], reconnection: true, reconnectionDelay: 500, reconnectionDelayMax: 3000 });
}

type AckResult<T> = { ok: true; data: T } | { ok: false; error: ErrorMessage };

function awaitAck<T>(send: (ack: (res: AckResult<T>) => void) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('O servidor não respondeu. Tente de novo.')), ACK_TIMEOUT_MS);
    send((res) => {
      clearTimeout(timer);
      if (res.ok) resolve(res.data);
      else reject(new AckError(res.error));
    });
  });
}

export function createRoom(socket: PflSocket): Promise<Joined> {
  return awaitAck<Joined>((ack) => socket.emit('room:create', ack));
}

export function joinRoom(socket: PflSocket, code: string, token?: string): Promise<Joined> {
  return awaitAck<Joined>((ack) => socket.emit('room:join', token ? { code, token } : { code }, ack));
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run apps/client/test/session.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck e commit**

Run: `npm run typecheck`
Expected: sem erros. O `socket.ts` não tem teste automatizado: é coberto pelos itens P1–P3 e P14 do checklist da Task 19.

```bash
git add apps/client/src/net apps/client/test/session.test.ts
git commit -m "feat(client): sessão por aba, código de sala, reação a erros e socket tipado"
```

---

### Task 8: Narração estilo Gen 1 a partir dos `GameEvent`s

**Files:**
- Create: `apps/client/src/match/effect.ts`, `apps/client/src/match/narration.ts`
- Test: `apps/client/test/narration.test.ts`

**Interfaces:**
- Consumes: `effectiveness`, `typeModifier`, `getSpecies`, `findCard` e os tipos `GameEvent`, `PlayOutcome`, `PokemonType`, `TeamKey` (`@pfl/engine`); `FORMATION_LABELS`, `PACKAGE_LABELS`, `READ_LABELS`, `READ_SYMBOL`, `speciesName`, `formatBallOn` (Task 3).
- Produces:
  - `type TypeEffect = 'SUPER' | 'WEAK' | 'IMMUNE' | 'NEUTRAL'`, `typeEffect(element: PokemonType | null, targets: readonly number[]): TypeEffect | null`, `EFFECT_TEXT: Record<TypeEffect, string | null>`
  - `type LineKind = 'drive' | 'call' | 'play' | 'effect' | 'result' | 'score' | 'system'`, `interface NarrationLine { text: string; kind: LineKind }`, `interface NarrationContext { names: Record<TeamKey, string>; possessionsPerTeam: number }`
  - `outcomeText(o: PlayOutcome): string`, `narrate(events: readonly GameEvent[], ctx: NarrationContext): NarrationLine[]`

- [ ] **Step 1: Escrever o teste (deve falhar)**

`apps/client/test/narration.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { getCard, type GameEvent, type PlayOutcome } from '@pfl/engine';
import { narrate, outcomeText, type NarrationContext } from '../src/match/narration';
import { typeEffect } from '../src/match/effect';

const ctx: NarrationContext = { names: { A: 'Trovões', B: 'Pedreiras' }, possessionsPerTeam: 6 };
const outcome = (o: Partial<PlayOutcome> = {}): PlayOutcome => ({
  kind: 'GAIN', yards: 8, bigPlay: false, read: 'WRONG', offActors: [135, 63], defActors: [130, 66],
  offTypeMult: 1, defTypeMult: 1, readFactor: 1, statFactor: 1, varianceFactor: 1, ...o,
});
const texts = (events: GameEvent[]) => narrate(events, ctx).map((l) => l.text);
const name = (id: string) => getCard(id).name;

describe('typeEffect', () => {
  it('usa a tabela de tipos contra os atores, sem o bônus de afinidade', () => {
    expect(typeEffect('electric', [130])).toBe('SUPER'); // Gyarados água/voador: 4x
    expect(typeEffect('electric', [69])).toBe('WEAK'); // Bellsprout planta/veneno: ½x
    expect(typeEffect('electric', [50])).toBe('IMMUNE'); // Diglett terra: 0x
    expect(typeEffect('electric', [19])).toBe('NEUTRAL'); // Rattata
    expect(typeEffect(null, [130])).toBeNull();
    expect(typeEffect('electric', [])).toBeNull();
  });
});

describe('narrate', () => {
  it('narra a jogada no estilo Gen 1', () => {
    expect(
      texts([
        { t: 'CARDS', offense: 'electric_thunder_screen', defense: 'basic_defense', read: 'WRONG' },
        { t: 'PLAY', outcome: outcome() },
        { t: 'FIRST_DOWN' },
      ]),
    ).toEqual([
      `${name('electric_thunder_screen')} × ${name('basic_defense')}`,
      '✖ Leitura errada da defesa!',
      `Jolteon usou ${name('electric_thunder_screen')}!`,
      'É super efetivo!',
      `Gyarados usou ${name('basic_defense')}!`,
      'Ganho de 8 jardas!',
      'FIRST DOWN!',
    ]);
  });

  it('narra a efetividade da carta de defesa contra os atores do ataque', () => {
    const lines = texts([
      { t: 'CARDS', offense: 'basic_run', defense: 'ground_dig', read: 'RIGHT' },
      { t: 'PLAY', outcome: outcome({ offActors: [135], defActors: [50], read: 'RIGHT', yards: 1 }) },
    ]);
    expect(lines).toContain('✔ Leitura certa da defesa!');
    expect(lines).toContain(`Diglett usou ${name('ground_dig')}!`);
    expect(lines.indexOf('É super efetivo!')).toBeGreaterThan(lines.indexOf(`Diglett usou ${name('ground_dig')}!`));
    expect(lines.at(-1)).toBe('Ganho de 1 jarda!');
  });

  it('imunidade e pouca efetividade', () => {
    const immune = texts([
      { t: 'CARDS', offense: 'electric_thunder_screen', defense: 'basic_defense', read: 'NEUTRAL' },
      { t: 'PLAY', outcome: outcome({ defActors: [50] }) },
    ]);
    expect(immune).toContain('Não teve efeito...');
    const weak = texts([
      { t: 'CARDS', offense: 'electric_thunder_screen', defense: 'basic_defense', read: 'NEUTRAL' },
      { t: 'PLAY', outcome: outcome({ defActors: [69] }) },
    ]);
    expect(weak).toContain('Não é muito efetivo...');
  });

  it('chutes não têm linha de leitura', () => {
    expect(
      texts([
        { t: 'CARDS', offense: 'punt', defense: 'basic_defense', read: 'NEUTRAL' },
        { t: 'PUNT', distance: 42 },
      ]),
    ).toEqual(['Punt de 42 jardas!']);
    expect(texts([{ t: 'FIELD_GOAL', distance: 45, good: false }])).toEqual(['Field goal de 45 jardas... errou!']);
  });

  it('narra drives, pontos e o fim', () => {
    const lines = narrate(
      [
        { t: 'DRIVE_START', offense: 'B', ballOn: 25, possession: 2, overtimeRound: 0 },
        { t: 'FORMATION', team: 'B', formation: 'SPREAD', lineup: {} },
        { t: 'PACKAGE', team: 'A', package: 'NICKEL', lineup: {} },
        { t: 'TOUCHDOWN', team: 'A' },
        { t: 'CONVERSION', team: 'A', choice: 'PAT', good: true },
        { t: 'OVERTIME', round: 2 },
        { t: 'DRIVE_START', offense: 'A', ballOn: 75, possession: 6, overtimeRound: 2 },
        { t: 'MATCH_END', score: { A: 7, B: 3 } },
      ],
      ctx,
    );
    expect(lines.map((l) => l.text)).toEqual([
      'Pedreiras começa a posse 2/6 na OWN 25.',
      'Pedreiras entra em formação Spread.',
      'Trovões responde com o pacote Nickel.',
      'TOUCHDOWN de Trovões!',
      'PAT convertido por Trovões!',
      'Prorrogação 2!',
      'Trovões ataca na prorrogação 2, bola na OPP 25.',
      'Fim de jogo! Trovões 7 × 3 Pedreiras',
    ]);
    expect(lines[3].kind).toBe('score');
  });

  it('PLAY sem CARDS antes (eventos parciais) não quebra', () => {
    expect(texts([{ t: 'PLAY', outcome: outcome({ kind: 'INCOMPLETE', yards: 0 }) }])).toEqual(['Passe incompleto.']);
  });
});

describe('outcomeText', () => {
  it('cobre todos os resultados', () => {
    expect(outcomeText(outcome({ kind: 'SACK', yards: -6 }))).toBe('Sack! Perda de 6 jardas.');
    expect(outcomeText(outcome({ kind: 'INTERCEPTION', yards: 18 }))).toBe('Interceptado por Gyarados!');
    expect(outcomeText(outcome({ kind: 'FUMBLE', yards: 2 }))).toBe('Fumble! Gyarados recupera a bola!');
    expect(outcomeText(outcome({ yards: 0 }))).toBe('Sem ganho.');
    expect(outcomeText(outcome({ yards: -2 }))).toBe('Perda de 2 jardas.');
    expect(outcomeText(outcome({ yards: 30, bigPlay: true }))).toBe('Jogada explosiva! Ganho de 30 jardas!');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/narration.test.ts`
Expected: FAIL — imports não resolvidos.

- [ ] **Step 3: Implementar**

`apps/client/src/match/effect.ts`:
```ts
import type { PokemonType } from '@pfl/engine';
import { effectiveness, getSpecies, typeModifier } from '@pfl/engine';

export type TypeEffect = 'SUPER' | 'WEAK' | 'IMMUNE' | 'NEUTRAL';

/**
 * Efetividade do tipo da carta contra os atores adversários: média dos modificadores da escala do engine.
 * Não usa offTypeMult/defTypeMult, porque eles somam a afinidade dos próprios atores (+10%).
 */
export function typeEffect(element: PokemonType | null, targets: readonly number[]): TypeEffect | null {
  if (!element || targets.length === 0) return null;
  const effs = targets.map((id) => effectiveness(element, getSpecies(id).types));
  if (effs.every((e) => e === 0)) return 'IMMUNE';
  const mean = effs.reduce((sum, e) => sum + typeModifier(e), 0) / effs.length;
  if (mean > 0) return 'SUPER';
  if (mean < 0) return 'WEAK';
  return 'NEUTRAL';
}

export const EFFECT_TEXT: Record<TypeEffect, string | null> = {
  SUPER: 'É super efetivo!',
  WEAK: 'Não é muito efetivo...',
  IMMUNE: 'Não teve efeito...',
  NEUTRAL: null,
};
```

`apps/client/src/match/narration.ts`:
```ts
import type { GameEvent, PlayOutcome, TeamKey } from '@pfl/engine';
import { findCard } from '@pfl/engine';
import { FORMATION_LABELS, PACKAGE_LABELS, READ_LABELS, READ_SYMBOL, speciesName } from '../lib/names';
import { formatBallOn } from '../lib/format';
import { EFFECT_TEXT, typeEffect } from './effect';

export type LineKind = 'drive' | 'call' | 'play' | 'effect' | 'result' | 'score' | 'system';

export interface NarrationLine {
  text: string;
  kind: LineKind;
}

export interface NarrationContext {
  names: Record<TeamKey, string>;
  possessionsPerTeam: number;
}

const yardsText = (n: number) => `${n} jarda${n === 1 ? '' : 's'}`;
const actorName = (id: number | undefined) => (id === undefined ? null : speciesName(id));

export function outcomeText(o: PlayOutcome): string {
  const defender = actorName(o.defActors[0]);
  switch (o.kind) {
    case 'SACK':
      return `Sack! Perda de ${yardsText(Math.abs(o.yards))}.`;
    case 'INCOMPLETE':
      return 'Passe incompleto.';
    case 'INTERCEPTION':
      return defender ? `Interceptado por ${defender}!` : 'Interceptado!';
    case 'FUMBLE':
      return defender ? `Fumble! ${defender} recupera a bola!` : 'Fumble!';
    case 'GAIN': {
      const base = o.yards > 0 ? `Ganho de ${yardsText(o.yards)}!` : o.yards === 0 ? 'Sem ganho.' : `Perda de ${yardsText(-o.yards)}.`;
      return o.bigPlay ? `Jogada explosiva! ${base}` : base;
    }
  }
}

const isKick = (cardId: string) => {
  const category = findCard(cardId)?.category;
  return category === 'PUNT' || category === 'FIELD_GOAL';
};

/** Transforma eventos do motor em linhas de log ("Jolteon usou Corrida por Fora! É super efetivo!"). */
export function narrate(events: readonly GameEvent[], ctx: NarrationContext): NarrationLine[] {
  const lines: NarrationLine[] = [];
  const add = (text: string, kind: LineKind) => lines.push({ text, kind });
  let cards: { offense: string; defense: string } | null = null;

  for (const e of events) {
    switch (e.t) {
      case 'DRIVE_START':
        if (e.overtimeRound > 0) {
          add(`${ctx.names[e.offense]} ataca na prorrogação ${e.overtimeRound}, bola na ${formatBallOn(e.ballOn)}.`, 'drive');
        } else {
          add(`${ctx.names[e.offense]} começa a posse ${e.possession}/${ctx.possessionsPerTeam} na ${formatBallOn(e.ballOn)}.`, 'drive');
        }
        break;
      case 'FORMATION':
        add(`${ctx.names[e.team]} entra em formação ${FORMATION_LABELS[e.formation]}.`, 'call');
        break;
      case 'PACKAGE':
        add(`${ctx.names[e.team]} responde com o pacote ${PACKAGE_LABELS[e.package]}.`, 'call');
        break;
      case 'CARDS': {
        cards = { offense: e.offense, defense: e.defense };
        if (isKick(e.offense)) break;
        const off = findCard(e.offense)?.name ?? e.offense;
        const def = findCard(e.defense)?.name ?? e.defense;
        add(`${off} × ${def}`, 'call');
        add(`${READ_SYMBOL[e.read]} ${READ_LABELS[e.read]}!`, 'effect');
        break;
      }
      case 'PLAY': {
        const o = e.outcome;
        const offCard = cards ? findCard(cards.offense) : undefined;
        const defCard = cards ? findCard(cards.defense) : undefined;
        const offActor = actorName(o.offActors[0]);
        const defActor = actorName(o.defActors[0]);
        if (offCard && offActor) {
          add(`${offActor} usou ${offCard.name}!`, 'play');
          const effect = typeEffect(offCard.element, o.defActors);
          const text = effect ? EFFECT_TEXT[effect] : null;
          if (text) add(text, 'effect');
        }
        if (defCard && defActor) {
          add(`${defActor} usou ${defCard.name}!`, 'play');
          const effect = typeEffect(defCard.element, o.offActors);
          const text = effect ? EFFECT_TEXT[effect] : null;
          if (text) add(text, 'effect');
        }
        add(outcomeText(o), 'result');
        break;
      }
      case 'PUNT':
        add(`Punt de ${yardsText(e.distance)}!`, 'play');
        break;
      case 'FIELD_GOAL':
        add(`Field goal de ${yardsText(e.distance)}... ${e.good ? 'é bom!' : 'errou!'}`, e.good ? 'score' : 'result');
        break;
      case 'FIRST_DOWN':
        add('FIRST DOWN!', 'result');
        break;
      case 'TOUCHDOWN':
        add(`TOUCHDOWN de ${ctx.names[e.team]}!`, 'score');
        break;
      case 'SAFETY':
        add(`Safety! 2 pontos para ${ctx.names[e.team]}.`, 'score');
        break;
      case 'CONVERSION':
        if (e.choice === 'PAT') {
          add(e.good ? `PAT convertido por ${ctx.names[e.team]}!` : `${ctx.names[e.team]} perdeu o PAT.`, e.good ? 'score' : 'result');
        } else {
          add(e.good ? `Conversão de 2 de ${ctx.names[e.team]}!` : `A conversão de 2 de ${ctx.names[e.team]} falhou.`, e.good ? 'score' : 'result');
        }
        break;
      case 'TURNOVER_ON_DOWNS':
        add('Turnover on downs! A bola troca de mãos.', 'result');
        break;
      case 'TURNOVER':
        add('A bola troca de mãos!', 'result');
        break;
      case 'OVERTIME':
        add(`Prorrogação ${e.round}!`, 'system');
        break;
      case 'MATCH_END':
        add(`Fim de jogo! ${ctx.names.A} ${e.score.A} × ${e.score.B} ${ctx.names.B}`, 'system');
        break;
      default:
        break;
    }
  }
  return lines;
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run apps/client/test/narration.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck e commit**

Run: `npm run typecheck`
Expected: sem erros.

```bash
git add apps/client/src/match/effect.ts apps/client/src/match/narration.ts apps/client/test/narration.test.ts
git commit -m "feat(client): narração estilo Gen 1 a partir dos eventos do motor"
```

---

### Task 9: Timeline de animação a partir dos `GameEvent`s

**Files:**
- Create: `apps/client/src/match/timeline.ts`
- Test: `apps/client/test/timeline.test.ts`

**Interfaces:**
- Consumes: `findCard`, `GameEvent`, `OffenseCategory`, `PlayOutcome` (`@pfl/engine`); `RESULT_ANIMATION_MS` (`@pfl/protocol`); `typeEffect`, `TypeEffect` (Task 8).
- Produces:
  - `type AnimStep = { at: number; duration: number } & (...)`, com `kind` igual a:
    - `'SNAP'`
    - `'BLOCK'`
    - `'CLASH'` (`off: number; def: number; effect: TypeEffect | null`)
    - `'THROW'` (`from: number | null; to: number`)
    - `'RUN'` (`carrier: number; yards: number`)
    - `'TACKLE'` (`by: number; carrier: number`)
    - `'INCOMPLETE'`
    - `'SACK'` (`qb: number; by: number; yards: number`)
    - `'TURNOVER'` (`by: number`)
    - `'KICK'` (`distance: number; good: boolean | null`)
    - `'BANNER'` (`text: string; tone: 'good' | 'bad' | 'info'`)
  - `TIMELINE_BUDGET_MS = RESULT_ANIMATION_MS - 500`
  - `buildTimeline(events: readonly GameEvent[]): AnimStep[]`, `timelineDuration(steps: readonly AnimStep[]): number`

- [ ] **Step 1: Escrever o teste (deve falhar)**

`apps/client/test/timeline.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { GameEvent, PlayOutcome } from '@pfl/engine';
import { RESULT_ANIMATION_MS } from '@pfl/protocol';
import { buildTimeline, timelineDuration, TIMELINE_BUDGET_MS, type AnimStep } from '../src/match/timeline';

const outcome = (o: Partial<PlayOutcome> = {}): PlayOutcome => ({
  kind: 'GAIN', yards: 6, bigPlay: false, read: 'NEUTRAL', offActors: [25, 95], defActors: [130, 66],
  offTypeMult: 1, defTypeMult: 1, readFactor: 1, statFactor: 1, varianceFactor: 1, ...o,
});
const play = (offense: string, o: Partial<PlayOutcome> = {}, extra: GameEvent[] = []): GameEvent[] => [
  { t: 'CARDS', offense, defense: 'basic_defense', read: 'NEUTRAL' },
  { t: 'PLAY', outcome: outcome(o) },
  ...extra,
];
const kinds = (steps: AnimStep[]) => steps.map((s) => s.kind);

function expectWellFormed(steps: AnimStep[]): void {
  for (let i = 0; i < steps.length; i++) {
    expect(steps[i].duration).toBeGreaterThan(0);
    if (i > 0) expect(steps[i].at).toBeGreaterThanOrEqual(steps[i - 1].at + steps[i - 1].duration);
  }
  expect(timelineDuration(steps)).toBeLessThanOrEqual(TIMELINE_BUDGET_MS);
}

describe('buildTimeline', () => {
  it('corrida: snap → confronto → corrida → tackle', () => {
    const steps = buildTimeline(play('basic_run'));
    expect(kinds(steps)).toEqual(['SNAP', 'CLASH', 'RUN', 'TACKLE']);
    expect(steps[2]).toMatchObject({ carrier: 25, yards: 6 });
    expect(steps[3]).toMatchObject({ by: 130, carrier: 25 });
    expectWellFormed(steps);
  });

  it('passe protegido: bloqueio e lançamento do QB para o recebedor', () => {
    const steps = buildTimeline(play('basic_pass', { offActors: [63, 26, 95] }));
    expect(kinds(steps)).toEqual(['SNAP', 'BLOCK', 'CLASH', 'THROW', 'RUN', 'TACKLE']);
    expect(steps.find((s) => s.kind === 'THROW')).toMatchObject({ from: 63, to: 26 });
  });

  it('o confronto carrega o efeito de tipo da carta', () => {
    const steps = buildTimeline(play('electric_thunder_screen'));
    expect(steps.find((s) => s.kind === 'CLASH')).toMatchObject({ effect: 'SUPER' }); // elétrico × Gyarados
    expect(buildTimeline(play('basic_run')).find((s) => s.kind === 'CLASH')).toMatchObject({ effect: null });
  });

  it('sack para no QB; incompleto e interceptação não têm corrida', () => {
    expect(kinds(buildTimeline(play('basic_pass', { kind: 'SACK', yards: -6, offActors: [63, 26], defActors: [66, 95] })))).toEqual(['SNAP', 'BLOCK', 'SACK']);
    expect(kinds(buildTimeline(play('basic_pass', { kind: 'INCOMPLETE', yards: 0 })))).toEqual(['SNAP', 'BLOCK', 'CLASH', 'THROW', 'INCOMPLETE']);
    expect(kinds(buildTimeline(play('basic_pass', { kind: 'INTERCEPTION', yards: 18 }, [{ t: 'TURNOVER', kind: 'INTERCEPTION' }])))).toEqual([
      'SNAP', 'BLOCK', 'CLASH', 'THROW', 'TURNOVER', 'BANNER',
    ]);
  });

  it('touchdown: sem tackle, com banner', () => {
    const steps = buildTimeline(play('basic_run', { yards: 30, bigPlay: true }, [{ t: 'TOUCHDOWN', team: 'A' }]));
    expect(kinds(steps)).toEqual(['SNAP', 'CLASH', 'RUN', 'BANNER']);
    expect(steps.at(-1)).toMatchObject({ text: 'TOUCHDOWN!', tone: 'good' });
  });

  it('punt, field goal e PAT viram chutes', () => {
    expect(kinds(buildTimeline([{ t: 'CARDS', offense: 'punt', defense: 'basic_defense', read: 'NEUTRAL' }, { t: 'PUNT', distance: 40 }]))).toEqual(['SNAP', 'KICK']);
    const fg = buildTimeline([{ t: 'FIELD_GOAL', distance: 35, good: true }]);
    expect(kinds(fg)).toEqual(['SNAP', 'KICK', 'BANNER']);
    expect(fg[1]).toMatchObject({ distance: 35, good: true });
    expect(kinds(buildTimeline([{ t: 'CONVERSION', team: 'A', choice: 'PAT', good: false }]))).toEqual(['KICK', 'BANNER']);
  });

  it('nenhuma sequência passa do orçamento da animação', () => {
    const long: GameEvent[] = [
      ...play('basic_pass', { yards: 40, bigPlay: true, offActors: [63, 26, 95] }, [{ t: 'TOUCHDOWN', team: 'A' }]),
      { t: 'CONVERSION', team: 'A', choice: 'TWO', good: true },
      { t: 'OVERTIME', round: 1 },
      { t: 'FIRST_DOWN' },
      { t: 'MATCH_END', score: { A: 8, B: 0 } },
    ];
    const steps = buildTimeline(long);
    expectWellFormed(steps);
    expect(timelineDuration(steps)).toBeLessThan(RESULT_ANIMATION_MS);
  });

  it('sem eventos animáveis: timeline vazia', () => {
    expect(buildTimeline([])).toEqual([]);
    expect(timelineDuration([])).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/timeline.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 3: Implementar**

`apps/client/src/match/timeline.ts`:
```ts
import type { GameEvent, OffenseCategory, PlayOutcome } from '@pfl/engine';
import { findCard } from '@pfl/engine';
import { RESULT_ANIMATION_MS } from '@pfl/protocol';
import { typeEffect, type TypeEffect } from './effect';

interface Timed {
  /** ms desde o início da animação */
  at: number;
  duration: number;
}

export type AnimStep = Timed &
  (
    | { kind: 'SNAP' }
    | { kind: 'BLOCK' }
    | { kind: 'CLASH'; off: number; def: number; effect: TypeEffect | null }
    | { kind: 'THROW'; from: number | null; to: number }
    | { kind: 'RUN'; carrier: number; yards: number }
    | { kind: 'TACKLE'; by: number; carrier: number }
    | { kind: 'INCOMPLETE' }
    | { kind: 'SACK'; qb: number; by: number; yards: number }
    | { kind: 'TURNOVER'; by: number }
    | { kind: 'KICK'; distance: number; good: boolean | null }
    | { kind: 'BANNER'; text: string; tone: 'good' | 'bad' | 'info' }
  );

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type StepBody = DistributiveOmit<AnimStep, 'at' | 'duration'>;

/** A animação precisa terminar antes do próximo timer (RESULT_ANIMATION_MS), com folga. */
export const TIMELINE_BUDGET_MS = RESULT_ANIMATION_MS - 500;

const D = {
  snap: 350, block: 350, clash: 550, throw: 450, run: 700, runBig: 900, tackle: 300,
  incomplete: 450, sack: 650, turnover: 600, kick: 800, banner: 800,
};

const PASSES: OffenseCategory[] = ['SHORT_PASS', 'DEEP_PASS', 'PLAY_ACTION', 'SCREEN'];
const PROTECTED: OffenseCategory[] = ['SHORT_PASS', 'DEEP_PASS', 'PLAY_ACTION'];

export function timelineDuration(steps: readonly AnimStep[]): number {
  return steps.reduce((max, s) => Math.max(max, s.at + s.duration), 0);
}

function fitToBudget(steps: AnimStep[], budget: number): AnimStep[] {
  const total = timelineDuration(steps);
  if (total <= budget) return steps;
  const f = budget / total;
  return steps.map((s) => ({ ...s, at: Math.floor(s.at * f), duration: Math.max(1, Math.floor(s.duration * f)) }));
}

/**
 * Eventos do motor → passos de animação (spec 6.2: snap → bloqueio → confronto com efeito de tipo →
 * tackle/recepção/TD). Os atores vêm da ordem de PlayOutcome.offActors/defActors: na corrida o primeiro
 * atacante é o RB; nos passes protegidos é o QB, e o segundo é o recebedor; no screen, o RB.
 */
export function buildTimeline(events: readonly GameEvent[]): AnimStep[] {
  const steps: AnimStep[] = [];
  let t = 0;
  const push = (body: StepBody, duration: number) => {
    steps.push({ ...body, at: t, duration } as AnimStep);
    t += duration;
  };
  const scored = events.some((e) => e.t === 'TOUCHDOWN' || (e.t === 'CONVERSION' && e.choice === 'TWO' && e.good));
  let offenseCard: string | null = null;

  const playSteps = (o: PlayOutcome) => {
    const card = offenseCard ? findCard(offenseCard) : undefined;
    const category = (card?.category ?? 'RUN_INSIDE') as OffenseCategory;
    const isPass = PASSES.includes(category);
    const isProtected = PROTECTED.includes(category);
    const qb = isProtected ? o.offActors[0] : undefined;
    const carrier = isProtected ? (o.offActors[1] ?? o.offActors[0]) : o.offActors[0];
    const defender = o.defActors[0];

    push({ kind: 'SNAP' }, D.snap);
    if (isProtected) push({ kind: 'BLOCK' }, D.block);
    if (o.kind === 'SACK') {
      const by = o.defActors.at(-1);
      if (qb !== undefined && by !== undefined) push({ kind: 'SACK', qb, by, yards: o.yards }, D.sack);
      return;
    }
    if (carrier !== undefined && defender !== undefined) {
      push({ kind: 'CLASH', off: carrier, def: defender, effect: typeEffect(card?.element ?? null, o.defActors) }, D.clash);
    }
    if (isPass && carrier !== undefined) push({ kind: 'THROW', from: qb ?? null, to: carrier }, D.throw);
    switch (o.kind) {
      case 'INCOMPLETE':
        push({ kind: 'INCOMPLETE' }, D.incomplete);
        break;
      case 'INTERCEPTION':
      case 'FUMBLE':
        if (defender !== undefined) push({ kind: 'TURNOVER', by: defender }, D.turnover);
        break;
      case 'GAIN':
        if (carrier !== undefined) {
          push({ kind: 'RUN', carrier, yards: o.yards }, o.bigPlay ? D.runBig : D.run);
          if (!scored && defender !== undefined) push({ kind: 'TACKLE', by: defender, carrier }, D.tackle);
        }
        break;
    }
  };

  for (const e of events) {
    switch (e.t) {
      case 'CARDS':
        offenseCard = e.offense;
        break;
      case 'PLAY':
        playSteps(e.outcome);
        break;
      case 'PUNT':
        push({ kind: 'SNAP' }, D.snap);
        push({ kind: 'KICK', distance: e.distance, good: null }, D.kick);
        break;
      case 'FIELD_GOAL':
        push({ kind: 'SNAP' }, D.snap);
        push({ kind: 'KICK', distance: e.distance, good: e.good }, D.kick);
        push({ kind: 'BANNER', text: e.good ? 'É BOM!' : 'ERROU!', tone: e.good ? 'good' : 'bad' }, D.banner);
        break;
      case 'FIRST_DOWN':
        push({ kind: 'BANNER', text: 'FIRST DOWN!', tone: 'info' }, D.banner);
        break;
      case 'TOUCHDOWN':
        push({ kind: 'BANNER', text: 'TOUCHDOWN!', tone: 'good' }, D.banner);
        break;
      case 'SAFETY':
        push({ kind: 'BANNER', text: 'SAFETY!', tone: 'bad' }, D.banner);
        break;
      case 'TURNOVER':
      case 'TURNOVER_ON_DOWNS':
        push({ kind: 'BANNER', text: 'TROCA DE POSSE!', tone: 'bad' }, D.banner);
        break;
      case 'CONVERSION':
        if (e.choice === 'PAT') {
          push({ kind: 'KICK', distance: 20, good: e.good }, D.kick);
          push({ kind: 'BANNER', text: e.good ? 'PAT BOM!' : 'PAT ERROU!', tone: e.good ? 'good' : 'bad' }, D.banner);
        } else {
          push({ kind: 'BANNER', text: e.good ? 'CONVERSÃO!' : 'FALHOU!', tone: e.good ? 'good' : 'bad' }, D.banner);
        }
        break;
      case 'OVERTIME':
        push({ kind: 'BANNER', text: `PRORROGAÇÃO ${e.round}`, tone: 'info' }, D.banner);
        break;
      case 'MATCH_END':
        push({ kind: 'BANNER', text: 'FIM DE JOGO', tone: 'info' }, D.banner);
        break;
      default:
        break;
    }
  }
  return fitToBudget(steps, TIMELINE_BUDGET_MS);
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run apps/client/test/timeline.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck e commit**

Run: `npm run typecheck`
Expected: sem erros.

```bash
git add apps/client/src/match/timeline.ts apps/client/test/timeline.test.ts
git commit -m "feat(client): timeline de animação derivada dos eventos do motor"
```

---

### Task 10: Estado da partida: reducer das mensagens do servidor, seletores, prévia de escalação e rascunho de depth

**Files:**
- Create: `apps/client/src/match/matchState.ts`, `apps/client/src/match/lineupPreview.ts`, `apps/client/src/match/depthDraft.ts`
- Test: `apps/client/test/match-state.test.ts`, `apps/client/test/depth-preview.test.ts`

**Interfaces:**
- Consumes:
  - `@pfl/engine`: `BASIC_OFFENSE_IDS`, `BASIC_DEFENSE_IDS`, `SPECIAL_IDS`, `findCard`, `fillSlots`, `threshold`, `validateTeam`; tipos `GameEvent`, `Lineup`, `Phase`, `PlayerView`, `ReadResult`, `SlotId`, `Team`, `TeamError`, `TeamKey`.
  - `@pfl/protocol`: `PhaseMessage`, `RevealMessage`, `ResultMessage`, `EndMessage`, `ErrorMessage`, `RoomStatus`.
  - Tasks anteriores: `narrate`, `NarrationLine`, `NarrationContext` (Task 8); `buildTimeline`, `timelineDuration`, `AnimStep` (Task 9); `secondsLeft` (Task 3); `ALL_SLOTS` (Task 4).
- Produces:
  - `interface Stage { turnId: number; offenseTeam: TeamKey; ballOn: number; yardsToGo: number; lineups: { offense: Lineup; defense: Lineup }; fatigue: Record<TeamKey, Record<number, number>> }`
  - `interface Animation { seq: number; events: GameEvent[]; steps: AnimStep[]; stage: Stage; startedAt: number; endsAt: number }`
  - `interface CardReveal { offense: string; defense: string; read: ReadResult | null }` (`read` é null em punt/FG)
  - `interface MatchClientState { phase; view; stage; log; reveal; animation; sent; end; names; lastError; seenReveals; lastResultTurn; seq }` (tipos completos no código)
  - `type MatchInput = { type: 'PHASE'; msg: PhaseMessage } | { type: 'REVEAL'; msg: RevealMessage } | { type: 'RESULT'; msg: ResultMessage; now: number } | { type: 'END'; msg: EndMessage } | { type: 'ERROR'; error: ErrorMessage } | { type: 'SENT'; turnId: number; phase: Phase } | { type: 'NAMES'; names: Record<TeamKey, string> } | { type: 'RESET' }`
  - `MAX_LOG = 200`, `initialMatchState(): MatchClientState`, `matchReducer(s: MatchClientState, input: MatchInput): MatchClientState`
  - `isNewerView(next: PlayerView, current: PlayerView | null): boolean`, `stageFromView(view: PlayerView, prev: Stage | null): Stage`
  - Seletores:
    - `isAnimating(s, now): boolean`
    - `type PanelMode = 'WAITING' | 'ANIMATING' | 'PICK_FORMATION' | 'PICK_PACKAGE' | 'PICK_CARD' | 'PICK_CONVERSION' | 'WAIT_OPPONENT' | 'ENDED'`, `panelMode(s, now): PanelMode`
    - `showEndScreen(s, now): boolean`
    - `canSubmitCard(s, cardId: string, now: number): boolean`
    - `interface HandEntry { key: string; cardId: string; source: 'HAND' | 'BASIC' | 'SPECIAL'; playable: boolean }`, `handEntries(view: PlayerView): HandEntry[]`
    - `timerSeconds(s, now): number | null`
    - `needsResync(status: RoomStatus | null, s): boolean`
  - `previewLineup(slots: readonly SlotId[], team: Team, levels: Record<number, number>): Lineup | null`
  - `interface DepthDraft { depth: Team['depth']; keepOnField: number[] }`, `interface PendingDepth { turnId: number; draft: DepthDraft }`, `draftFromTeamDepth(team: Team): DepthDraft`, `isDepthDirty(draft: DepthDraft, team: Team): boolean`, `depthDraftErrors(team: Team, draft: DepthDraft): TeamError[]`, `shouldSendDepth(view: PlayerView | null, team: Team | null, draft: DepthDraft | null, lastSentTurn: number | null): boolean`, `resolvePendingDepth(pending: PendingDepth, msg: PhaseMessage): 'commit' | 'keep'`

- [ ] **Step 1: Escrever o teste do reducer (deve falhar)**

`apps/client/test/match-state.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { GameEvent, PlayerView } from '@pfl/engine';
import type { EndMessage } from '@pfl/protocol';
import {
  canSubmitCard, handEntries, initialMatchState, isAnimating, matchReducer, needsResync, panelMode, showEndScreen,
  timerSeconds, type MatchClientState, type MatchInput,
} from '../src/match/matchState';
import { makeView, testTeam } from './fixtures';

const T0 = 1_000_000;
const phase = (view: PlayerView, deadline = T0 + 5000): MatchInput => ({
  type: 'PHASE', msg: { turnId: view.turnId, phase: view.phase, deadline, view },
});
const apply = (...inputs: MatchInput[]): MatchClientState => inputs.reduce(matchReducer, initialMatchState());

const offLineup = { QB: 63, OL1: 95, OL2: 74, OL3: 66, RB: 25, WR1: 26, WR2: 125 };
const defLineup = { DL1: 95, DL2: 74, DL3: 50, LB1: 66, CB1: 26, CB2: 100, S1: 63 };
const formationReveal: MatchInput = {
  type: 'REVEAL', msg: { turnId: 1, events: [{ t: 'FORMATION', team: 'A', formation: 'PISTOL', lineup: offLineup }] },
};
const packageReveal: MatchInput = {
  type: 'REVEAL', msg: { turnId: 1, events: [{ t: 'PACKAGE', team: 'B', package: 'BASE', lineup: defLineup }] },
};
const playEvents: GameEvent[] = [
  { t: 'CARDS', offense: 'basic_run', defense: 'basic_defense', read: 'NEUTRAL' },
  {
    t: 'PLAY',
    outcome: {
      kind: 'GAIN', yards: 5, bigPlay: false, read: 'NEUTRAL', offActors: [25, 95, 74, 66], defActors: [95, 74, 50, 66],
      offTypeMult: 1, defTypeMult: 1, readFactor: 1, statFactor: 1, varianceFactor: 1,
    },
  },
];
const nextView = makeView({ turnId: 2, field: { down: 2, yardsToGo: 5, ballOn: 30 } });
const result = (turnId = 1, events = playEvents, view = nextView): MatchInput => ({
  type: 'RESULT', msg: { turnId, events, view }, now: T0,
});
const playcallView = (overrides: Partial<PlayerView> = {}) =>
  makeView({
    phase: 'PLAYCALL', formation: 'PISTOL', package: 'BASE', lineups: { offense: offLineup, defense: defLineup },
    hand: ['normal_tackle'], playable: ['basic_run', 'basic_pass'], ...overrides,
  });

/** Uma jogada completa do ponto de vista do ataque (A), até o match:result. */
function untilResult(): MatchClientState {
  return apply(
    phase(makeView()),
    formationReveal,
    phase(makeView({ phase: 'PACKAGE', formation: 'PISTOL', lineups: { offense: offLineup, defense: {} } })),
    packageReveal,
    phase(playcallView()),
    result(),
  );
}

const endMessage: EndMessage = {
  score: { A: 7, B: 0 },
  stats: { pokemon: [], yards: { A: 0, B: 0 }, turnovers: { A: 0, B: 0 }, sacks: { A: 0, B: 0 } },
  replay: { seed: 1, teams: { A: testTeam('A'), B: testTeam('B') }, actions: [] },
};

describe('mensagens de fase', () => {
  it('a fase atual define view, estágio, timer e painel', () => {
    const s = apply(phase(makeView()));
    expect(s.view?.turnId).toBe(1);
    expect(s.stage?.ballOn).toBe(25);
    expect(timerSeconds(s, T0)).toBe(5);
    expect(panelMode(s, T0)).toBe('PICK_FORMATION');
  });

  it('ignora mensagens antigas ou fora de ordem', () => {
    const older = apply(phase(makeView({ turnId: 2 })), phase(makeView({ turnId: 1, phase: 'PLAYCALL' })));
    expect(older.view).toMatchObject({ turnId: 2, phase: 'FORMATION' });
    const samTurn = apply(phase(makeView({ phase: 'PACKAGE' })), phase(makeView({ phase: 'FORMATION' })));
    expect(samTurn.view?.phase).toBe('PACKAGE');
  });

  it('as revelações preenchem a escalação e narram uma vez só', () => {
    const s = apply(phase(makeView()), formationReveal, formationReveal);
    expect(s.stage?.lineups.offense).toEqual(offLineup);
    expect(s.log.filter((l) => l.text.includes('formação Pistol'))).toHaveLength(1);
  });

  it('a defesa espera na formação; o ataque espera no pacote; conversão é do ataque', () => {
    expect(panelMode(apply(phase(makeView({ you: 'B', side: 'defense' }))), T0)).toBe('WAIT_OPPONENT');
    expect(panelMode(apply(phase(makeView({ you: 'B', side: 'defense', phase: 'PACKAGE' }))), T0)).toBe('PICK_PACKAGE');
    expect(panelMode(apply(phase(makeView({ phase: 'PACKAGE' }))), T0)).toBe('WAIT_OPPONENT');
    expect(panelMode(apply(phase(makeView({ phase: 'CONVERSION' }))), T0)).toBe('PICK_CONVERSION');
  });
});

describe('resultado e animação', () => {
  it('anima a partir do estado pré-jogada e atualiza o pós-jogada', () => {
    const s = untilResult();
    expect(s.animation?.stage.ballOn).toBe(25);
    expect(s.animation?.stage.lineups).toEqual({ offense: offLineup, defense: defLineup });
    expect(s.animation?.steps.length).toBeGreaterThan(0);
    expect(s.stage?.ballOn).toBe(30);
    expect(s.reveal).toEqual({ offense: 'basic_run', defense: 'basic_defense', read: 'NEUTRAL' });
    expect(s.log.map((l) => l.text)).toContain('Ganho de 5 jardas!');
    expect(isAnimating(s, T0 + 10)).toBe(true);
    expect(panelMode(s, T0 + 10)).toBe('ANIMATING');
  });

  it('match:phase chegando durante a animação não a interrompe', () => {
    const s = untilResult();
    const s2 = matchReducer(s, phase(nextView, T0 + 9000));
    expect(s2.animation).toBe(s.animation);
    expect(s2.view?.turnId).toBe(2);
    expect(panelMode(s2, T0 + 100)).toBe('ANIMATING');
    const end = s.animation!.endsAt;
    expect(panelMode(s2, end)).toBe('PICK_FORMATION');
    expect(timerSeconds(s2, end)).toBeGreaterThan(0);
  });

  it('o timer some quando a view já é de outro turno que a última fase', () => {
    expect(timerSeconds(untilResult(), T0)).toBeNull();
  });

  it('resultado reenviado (reconexão) não duplica o log nem reinicia a animação', () => {
    const s = untilResult();
    expect(matchReducer(s, result())).toBe(s);
  });

  it('punt e field goal não mostram leitura', () => {
    const s = matchReducer(
      apply(phase(playcallView())),
      result(1, [{ t: 'CARDS', offense: 'punt', defense: 'basic_defense', read: 'NEUTRAL' }, { t: 'PUNT', distance: 40 }]),
    );
    expect(s.reveal).toEqual({ offense: 'punt', defense: 'basic_defense', read: null });
  });

  it('match:end durante a animação final só mostra o fim depois dela', () => {
    const s = matchReducer(untilResult(), { type: 'END', msg: endMessage });
    expect(showEndScreen(s, T0 + 10)).toBe(false);
    expect(showEndScreen(s, s.animation!.endsAt)).toBe(true);
    expect(panelMode(s, s.animation!.endsAt)).toBe('ENDED');
  });
});

describe('envio de carta', () => {
  it('carta não jogável, clique duplo e fase errada não são enviados', () => {
    const s = apply(phase(playcallView()));
    expect(canSubmitCard(s, 'normal_tackle', T0)).toBe(false);
    expect(canSubmitCard(s, 'basic_run', T0)).toBe(true);
    const sent = matchReducer(s, { type: 'SENT', turnId: 1, phase: 'PLAYCALL' });
    expect(canSubmitCard(sent, 'basic_run', T0)).toBe(false);
    expect(panelMode(sent, T0)).toBe('WAIT_OPPONENT');
    expect(canSubmitCard(apply(phase(playcallView({ yourCard: 'basic_run' }))), 'basic_pass', T0)).toBe(false);
    expect(canSubmitCard(apply(phase(makeView({ playable: ['basic_run'] }))), 'basic_run', T0)).toBe(false);
  });

  it('STALE_TURN libera o reenvio depois que o servidor reenvia a fase', () => {
    const sent = matchReducer(apply(phase(playcallView())), { type: 'SENT', turnId: 1, phase: 'PLAYCALL' });
    const stale = matchReducer(sent, { type: 'ERROR', error: { code: 'STALE_TURN', message: '' } });
    expect(canSubmitCard(stale, 'basic_run', T0)).toBe(true);
  });

  it('a mão mostra cópias repetidas, básicas fora da mão e especiais só quando jogáveis', () => {
    const view = makeView({ phase: 'PLAYCALL', hand: ['normal_tackle', 'normal_tackle'], playable: ['basic_run', 'normal_tackle'] });
    const entries = handEntries(view);
    expect(entries.map((e) => e.cardId)).toEqual(['normal_tackle', 'normal_tackle', 'basic_run', 'basic_pass']);
    expect(new Set(entries.map((e) => e.key)).size).toBe(4);
    expect(entries.find((e) => e.cardId === 'basic_pass')?.playable).toBe(false);
    const fourth = handEntries({ ...view, playable: [...view.playable, 'punt', 'field_goal'] });
    expect(fourth.filter((e) => e.source === 'SPECIAL').map((e) => e.cardId)).toEqual(['punt', 'field_goal']);
    const defense = handEntries(makeView({ side: 'defense', hand: ['ground_dig'], playable: ['basic_defense'] }));
    expect(defense.map((e) => e.cardId)).toEqual(['ground_dig', 'basic_defense']);
  });
});

describe('aba recarregada', () => {
  it('pede resync só quando a sala está em partida e ainda não há view', () => {
    expect(needsResync('IN_MATCH', initialMatchState())).toBe(true);
    expect(needsResync('PAUSED', initialMatchState())).toBe(true);
    expect(needsResync('WAITING', initialMatchState())).toBe(false);
    expect(needsResync(null, initialMatchState())).toBe(false);
    expect(needsResync('IN_MATCH', apply(phase(makeView())))).toBe(false);
    expect(needsResync('IN_MATCH', apply({ type: 'END', msg: endMessage }))).toBe(false);
  });

  it('um único match:phase reconstrói a tela, mesmo sem as revelações perdidas', () => {
    const s = apply(phase(playcallView()));
    expect(s.stage?.lineups).toEqual({ offense: offLineup, defense: defLineup });
    expect(panelMode(s, T0)).toBe('PICK_CARD');
  });

  it('RESET volta ao estado inicial', () => {
    expect(matchReducer(untilResult(), { type: 'RESET' })).toEqual(initialMatchState());
  });
});
```

- [ ] **Step 2: Escrever o teste de prévia e rascunho de depth (deve falhar)**

`apps/client/test/depth-preview.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { FORMATIONS, PACKAGES } from '@pfl/engine';
import { previewLineup } from '../src/match/lineupPreview';
import {
  depthDraftErrors, draftFromTeamDepth, isDepthDirty, resolvePendingDepth, shouldSendDepth, type DepthDraft,
} from '../src/match/depthDraft';
import { makeView, testTeam } from './fixtures';

const team = testTeam();

describe('previewLineup', () => {
  it('mostra os titulares do depth chart', () => {
    expect(previewLineup(FORMATIONS.PISTOL, team, {})).toEqual({ QB: 63, OL1: 95, OL2: 74, OL3: 66, RB: 25, WR1: 26, WR2: 125 });
    expect(previewLineup(PACKAGES.DIME, team, {})).toMatchObject({ DL1: 95, S2: 16 });
  });

  it('troca quem atingiu o limiar de fadiga, salvo "manter em campo"', () => {
    expect(previewLineup(FORMATIONS.PISTOL, team, { 25: 2 })?.RB).toBe(50);
    expect(previewLineup(FORMATIONS.PISTOL, { ...team, keepOnField: [25] }, { 25: 5 })?.RB).toBe(25);
  });
});

describe('rascunho de depth durante a partida', () => {
  const moved = (): DepthDraft => {
    const d = draftFromTeamDepth(team);
    d.depth.QB = [54, 63];
    return d;
  };

  it('detecta alteração independente da ordem das chaves', () => {
    const same = draftFromTeamDepth(team);
    expect(isDepthDirty(same, team)).toBe(false);
    expect(isDepthDirty({ ...same, depth: Object.fromEntries(Object.entries(same.depth).reverse()) }, team)).toBe(false);
    expect(isDepthDirty(moved(), team)).toBe(true);
    expect(isDepthDirty({ ...same, keepOnField: [25] }, team)).toBe(true);
  });

  it('valida com as regras do engine', () => {
    expect(depthDraftErrors(team, moved())).toEqual([]);
    const broken = draftFromTeamDepth(team);
    broken.depth.TE = [];
    expect(depthDraftErrors(team, broken).map((e) => e.code)).toContain('FORMATION_UNFILLABLE');
  });

  it('envia só na janela permitida, uma vez por turno, e só se válido e alterado', () => {
    const open = makeView({ phase: 'FORMATION', canEditDepth: true, turnId: 7 });
    expect(shouldSendDepth(open, team, moved(), null)).toBe(true);
    expect(shouldSendDepth(open, team, moved(), 7)).toBe(false);
    expect(shouldSendDepth({ ...open, canEditDepth: false }, team, moved(), null)).toBe(false);
    expect(shouldSendDepth({ ...open, phase: 'PACKAGE' }, team, moved(), null)).toBe(false);
    expect(shouldSendDepth(open, team, draftFromTeamDepth(team), null)).toBe(false);
    const broken = moved();
    broken.depth.TE = [];
    expect(shouldSendDepth(open, team, broken, null)).toBe(false);
    expect(shouldSendDepth(null, team, moved(), null)).toBe(false);
  });

  it('confirma o depth enviado quando o servidor avança sem erro', () => {
    const pending = { turnId: 7, draft: moved() };
    const msg = (turnId: number, phase: 'FORMATION' | 'PACKAGE') => ({
      turnId, phase, deadline: 0, view: makeView({ turnId, phase }),
    });
    expect(resolvePendingDepth(pending, msg(7, 'FORMATION'))).toBe('keep');
    expect(resolvePendingDepth(pending, msg(7, 'PACKAGE'))).toBe('commit');
    expect(resolvePendingDepth(pending, msg(8, 'FORMATION'))).toBe('commit');
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/match-state.test.ts apps/client/test/depth-preview.test.ts`
Expected: FAIL — imports não resolvidos.

- [ ] **Step 4: Implementar o reducer da partida**

`apps/client/src/match/matchState.ts`:
```ts
import type { GameEvent, Lineup, Phase, PlayerView, ReadResult, TeamKey } from '@pfl/engine';
import { BASIC_DEFENSE_IDS, BASIC_OFFENSE_IDS, SPECIAL_IDS, findCard } from '@pfl/engine';
import type { EndMessage, ErrorMessage, PhaseMessage, ResultMessage, RevealMessage, RoomStatus } from '@pfl/protocol';
import { narrate, type NarrationContext, type NarrationLine } from './narration';
import { buildTimeline, timelineDuration, type AnimStep } from './timeline';
import { secondsLeft } from '../lib/format';

/** O que o campo mostra: posição da bola e quem está em cada vaga. */
export interface Stage {
  turnId: number;
  offenseTeam: TeamKey;
  ballOn: number;
  yardsToGo: number;
  lineups: { offense: Lineup; defense: Lineup };
  fatigue: Record<TeamKey, Record<number, number>>;
}

/** Animação de um match:result; `stage` é o snapshot pré-jogada. */
export interface Animation {
  seq: number;
  events: GameEvent[];
  steps: AnimStep[];
  stage: Stage;
  startedAt: number;
  endsAt: number;
}

export interface CardReveal {
  offense: string;
  defense: string;
  /** null em punt/field goal: o engine sempre manda NEUTRAL nesses casos e não há leitura a destacar */
  read: ReadResult | null;
}

export interface MatchClientState {
  /** último match:phase aceito (deadline e fase) */
  phase: PhaseMessage | null;
  /** view mais recente (de match:phase ou match:result) */
  view: PlayerView | null;
  stage: Stage | null;
  log: NarrationLine[];
  reveal: CardReveal | null;
  animation: Animation | null;
  /** ação já enviada nesta fase (evita clique duplo) */
  sent: { turnId: number; phase: Phase } | null;
  end: EndMessage | null;
  names: Record<TeamKey, string>;
  lastError: ErrorMessage | null;
  seenReveals: string[];
  lastResultTurn: number | null;
  seq: number;
}

export type MatchInput =
  | { type: 'PHASE'; msg: PhaseMessage }
  | { type: 'REVEAL'; msg: RevealMessage }
  | { type: 'RESULT'; msg: ResultMessage; now: number }
  | { type: 'END'; msg: EndMessage }
  | { type: 'ERROR'; error: ErrorMessage }
  | { type: 'SENT'; turnId: number; phase: Phase }
  | { type: 'NAMES'; names: Record<TeamKey, string> }
  | { type: 'RESET' };

export const MAX_LOG = 200;

export function initialMatchState(): MatchClientState {
  return {
    phase: null,
    view: null,
    stage: null,
    log: [],
    reveal: null,
    animation: null,
    sent: null,
    end: null,
    names: { A: 'Time A', B: 'Time B' },
    lastError: null,
    seenReveals: [],
    lastResultTurn: null,
    seq: 0,
  };
}

const PHASE_RANK: Record<Phase, number> = { FORMATION: 0, PACKAGE: 1, PLAYCALL: 2, CONVERSION: 3, MATCH_END: 4 };

/** O turnId é o mesmo nas três etapas de um snap; a ordem é (turnId, etapa). */
export function isNewerView(next: PlayerView, current: PlayerView | null): boolean {
  if (!current) return true;
  if (next.turnId !== current.turnId) return next.turnId > current.turnId;
  return PHASE_RANK[next.phase] >= PHASE_RANK[current.phase];
}

const isEmpty = (lineup: Lineup) => Object.keys(lineup).length === 0;

/** Usa as escalações da view; se vierem vazias no mesmo turno, mantém as reveladas antes. */
export function stageFromView(view: PlayerView, prev: Stage | null): Stage {
  const kept = prev && prev.turnId === view.turnId ? prev.lineups : { offense: {}, defense: {} };
  return {
    turnId: view.turnId,
    offenseTeam: view.offense,
    ballOn: view.field.ballOn,
    yardsToGo: view.field.yardsToGo,
    lineups: {
      offense: isEmpty(view.lineups.offense) ? kept.offense : view.lineups.offense,
      defense: isEmpty(view.lineups.defense) ? kept.defense : view.lineups.defense,
    },
    fatigue: view.fatigue,
  };
}

function withLineups(stage: Stage, events: readonly GameEvent[]): Stage {
  let lineups = stage.lineups;
  for (const e of events) {
    if (e.t === 'FORMATION') lineups = { ...lineups, offense: e.lineup };
    if (e.t === 'PACKAGE') lineups = { ...lineups, defense: e.lineup };
  }
  return lineups === stage.lineups ? stage : { ...stage, lineups };
}

function revealFrom(events: readonly GameEvent[]): CardReveal | null {
  for (const e of events) {
    if (e.t !== 'CARDS') continue;
    const category = findCard(e.offense)?.category;
    const kick = category === 'PUNT' || category === 'FIELD_GOAL';
    return { offense: e.offense, defense: e.defense, read: kick ? null : e.read };
  }
  return null;
}

const contextOf = (s: MatchClientState): NarrationContext => ({
  names: s.names,
  possessionsPerTeam: s.view?.possessionsPerTeam ?? 6,
});
const appendLog = (log: NarrationLine[], lines: NarrationLine[]) => (lines.length ? [...log, ...lines].slice(-MAX_LOG) : log);
const revealKey = (turnId: number, e: GameEvent) => `${turnId}:${e.t}`;

export function matchReducer(s: MatchClientState, input: MatchInput): MatchClientState {
  switch (input.type) {
    case 'PHASE': {
      const { msg } = input;
      if (!isNewerView(msg.view, s.view)) return s;
      const changed = !s.view || s.view.turnId !== msg.view.turnId || s.view.phase !== msg.view.phase;
      return { ...s, phase: msg, view: msg.view, stage: stageFromView(msg.view, s.stage), sent: changed ? null : s.sent };
    }
    case 'REVEAL': {
      const { msg } = input;
      if (s.view && msg.turnId < s.view.turnId) return s;
      const fresh = msg.events.filter((e) => !s.seenReveals.includes(revealKey(msg.turnId, e)));
      if (fresh.length === 0) return s;
      const stage = s.stage && s.stage.turnId === msg.turnId ? withLineups(s.stage, fresh) : s.stage;
      return {
        ...s,
        stage,
        log: appendLog(s.log, narrate(fresh, contextOf(s))),
        seenReveals: [...s.seenReveals, ...fresh.map((e) => revealKey(msg.turnId, e))].slice(-16),
      };
    }
    case 'RESULT': {
      const { msg, now } = input;
      if (s.lastResultTurn !== null && msg.turnId <= s.lastResultTurn) return s;
      const pre = s.stage ? withLineups(s.stage, msg.events) : stageFromView(msg.view, null);
      const steps = buildTimeline(msg.events);
      const seq = s.seq + 1;
      const newer = isNewerView(msg.view, s.view);
      return {
        ...s,
        seq,
        lastResultTurn: msg.turnId,
        animation: { seq, events: msg.events, steps, stage: pre, startedAt: now, endsAt: now + timelineDuration(steps) },
        reveal: revealFrom(msg.events) ?? s.reveal,
        log: appendLog(s.log, narrate(msg.events, contextOf(s))),
        view: newer ? msg.view : s.view,
        stage: newer ? stageFromView(msg.view, s.stage) : s.stage,
        sent: null,
      };
    }
    case 'END':
      return { ...s, end: input.msg, sent: null };
    case 'ERROR': {
      const clears = input.error.code === 'STALE_TURN' || input.error.code === 'ENGINE_ERROR';
      return { ...s, lastError: input.error, sent: clears ? null : s.sent };
    }
    case 'SENT':
      return { ...s, sent: { turnId: input.turnId, phase: input.phase } };
    case 'NAMES':
      return { ...s, names: input.names };
    case 'RESET':
      return initialMatchState();
  }
}

export function isAnimating(s: MatchClientState, now: number): boolean {
  return s.animation !== null && now < s.animation.endsAt;
}

export type PanelMode =
  | 'WAITING'
  | 'ANIMATING'
  | 'PICK_FORMATION'
  | 'PICK_PACKAGE'
  | 'PICK_CARD'
  | 'PICK_CONVERSION'
  | 'WAIT_OPPONENT'
  | 'ENDED';

/** O painel da próxima etapa só aparece depois da animação (o deadline já inclui RESULT_ANIMATION_MS). */
export function panelMode(s: MatchClientState, now: number): PanelMode {
  if (isAnimating(s, now)) return 'ANIMATING';
  if (s.end) return 'ENDED';
  const v = s.view;
  if (!v) return 'WAITING';
  const alreadySent = s.sent !== null && s.sent.turnId === v.turnId && s.sent.phase === v.phase;
  switch (v.phase) {
    case 'FORMATION':
      return v.side === 'offense' && !alreadySent ? 'PICK_FORMATION' : 'WAIT_OPPONENT';
    case 'PACKAGE':
      return v.side === 'defense' && !alreadySent ? 'PICK_PACKAGE' : 'WAIT_OPPONENT';
    case 'PLAYCALL':
      return v.yourCard === null && !alreadySent ? 'PICK_CARD' : 'WAIT_OPPONENT';
    case 'CONVERSION':
      return v.side === 'offense' && !alreadySent ? 'PICK_CONVERSION' : 'WAIT_OPPONENT';
    case 'MATCH_END':
      return 'ENDED';
  }
}

export function showEndScreen(s: MatchClientState, now: number): boolean {
  return s.end !== null && !isAnimating(s, now);
}

/** Carta só sai se a etapa é de carta, nada foi enviado e o servidor a listou em `playable`. */
export function canSubmitCard(s: MatchClientState, cardId: string, now: number): boolean {
  return panelMode(s, now) === 'PICK_CARD' && s.view !== null && s.view.playable.includes(cardId);
}

export interface HandEntry {
  key: string;
  cardId: string;
  source: 'HAND' | 'BASIC' | 'SPECIAL';
  playable: boolean;
}

/** Mão (pode ter cópias repetidas) + básicas sempre disponíveis + Punt/FG quando jogáveis (4º down). */
export function handEntries(view: PlayerView): HandEntry[] {
  const playable = (id: string) => view.playable.includes(id);
  const basics: readonly string[] = view.side === 'offense' ? BASIC_OFFENSE_IDS : BASIC_DEFENSE_IDS;
  const specials: readonly string[] = view.side === 'offense' ? SPECIAL_IDS.filter((id) => playable(id)) : [];
  return [
    ...view.hand.map((cardId, i): HandEntry => ({ key: `hand-${i}-${cardId}`, cardId, source: 'HAND', playable: playable(cardId) })),
    ...basics.map((cardId): HandEntry => ({ key: `basic-${cardId}`, cardId, source: 'BASIC', playable: playable(cardId) })),
    ...specials.map((cardId): HandEntry => ({ key: `special-${cardId}`, cardId, source: 'SPECIAL', playable: true })),
  ];
}

/** Segundos da etapa atual; null quando a última fase recebida não é a da view (ex.: logo após o resultado). */
export function timerSeconds(s: MatchClientState, now: number): number | null {
  if (!s.phase || !s.view) return null;
  if (s.phase.view.turnId !== s.view.turnId || s.phase.phase !== s.view.phase) return null;
  return secondsLeft(s.phase.phase, s.phase.deadline, now);
}

/** Aba recarregada (ou reconexão) no meio da partida: pedir o estado atual ao servidor. */
export function needsResync(status: RoomStatus | null, s: MatchClientState): boolean {
  return (status === 'IN_MATCH' || status === 'PAUSED') && s.view === null && s.end === null;
}
```

- [ ] **Step 5: Implementar a prévia e o rascunho de depth**

`apps/client/src/match/lineupPreview.ts`:
```ts
import type { Lineup, SlotId, Team } from '@pfl/engine';
import { fillSlots, threshold } from '@pfl/engine';

/**
 * Prévia de quem entra em campo (spec 6.2: "lista de quem entra"). O cliente não conhece a lista de
 * descanso do servidor; aproxima pelo limiar de fadiga. Quem decide a escalação real é o servidor.
 */
export function previewLineup(slots: readonly SlotId[], team: Team, levels: Record<number, number>): Lineup | null {
  return fillSlots(slots, team.depth, (id) => team.keepOnField.includes(id) || (levels[id] ?? 0) < threshold(id));
}
```

`apps/client/src/match/depthDraft.ts`:
```ts
import type { PlayerView, Team, TeamError } from '@pfl/engine';
import { validateTeam } from '@pfl/engine';
import type { PhaseMessage } from '@pfl/protocol';
import { ALL_SLOTS } from '../builder/depth';

/**
 * Ajuste manual do depth chart (spec 5.4). O servidor só aceita na etapa FORMATION do primeiro snap do
 * drive (view.canEditDepth), uma janela de poucos segundos. Por isso o jogador edita um rascunho a
 * qualquer momento, e o cliente o envia sozinho quando a janela abre.
 */
export interface DepthDraft {
  depth: Team['depth'];
  keepOnField: number[];
}

export interface PendingDepth {
  turnId: number;
  draft: DepthDraft;
}

export function draftFromTeamDepth(team: Team): DepthDraft {
  return structuredClone({ depth: team.depth, keepOnField: team.keepOnField });
}

const canonical = (d: DepthDraft) =>
  JSON.stringify([ALL_SLOTS.map((slot) => d.depth[slot] ?? []), [...d.keepOnField].sort((a, b) => a - b)]);

export function isDepthDirty(draft: DepthDraft, team: Team): boolean {
  return canonical(draft) !== canonical({ depth: team.depth, keepOnField: team.keepOnField });
}

export function depthDraftErrors(team: Team, draft: DepthDraft): TeamError[] {
  return validateTeam({ ...team, depth: draft.depth, keepOnField: draft.keepOnField });
}

export function shouldSendDepth(
  view: PlayerView | null,
  team: Team | null,
  draft: DepthDraft | null,
  lastSentTurn: number | null,
): boolean {
  if (!view || !team || !draft) return false;
  if (!view.canEditDepth || view.phase !== 'FORMATION' || lastSentTurn === view.turnId) return false;
  return isDepthDirty(draft, team) && depthDraftErrors(team, draft).length === 0;
}

/**
 * team:depth não tem ack. Se o servidor recusar, o `error` chega antes da próxima fase (e o App descarta o
 * pendente); se a etapa avançar sem erro, o depth foi aceito.
 */
export function resolvePendingDepth(pending: PendingDepth, msg: PhaseMessage): 'commit' | 'keep' {
  if (msg.view.turnId > pending.turnId) return 'commit';
  if (msg.view.turnId === pending.turnId && msg.view.phase !== 'FORMATION') return 'commit';
  return 'keep';
}
```

- [ ] **Step 6: Rodar os testes**

Run: `npx vitest run apps/client/test/match-state.test.ts apps/client/test/depth-preview.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck e commit**

Run: `npm run typecheck`
Expected: sem erros.

```bash
git add apps/client/src/match/matchState.ts apps/client/src/match/lineupPreview.ts apps/client/src/match/depthDraft.ts apps/client/test/match-state.test.ts apps/client/test/depth-preview.test.ts
git commit -m "feat(client): reducer da partida com animação protegida, seletores e rascunho de depth"
```

---

### Task 11: Frames de replay a partir de `EndMessage.replay`

**Files:**
- Create: `apps/client/src/match/replayFrames.ts`
- Test: `apps/client/test/replay.test.ts`

**Interfaces:**
- Consumes: `createMatch`, `step`, `replay`, `DEFAULT_CONFIG` e os tipos `GameEvent`, `MatchState`, `TeamKey`, `Action` (`@pfl/engine`); `ReplayData` (`@pfl/protocol`); `narrate`, `NarrationLine` (Task 8); `buildTimeline`, `AnimStep` (Task 9); `Stage` (Task 10).
- Produces:
  - `interface ReplayFrame { index: number; stage: Stage; events: GameEvent[]; steps: AnimStep[]; lines: NarrationLine[] }`
  - `type ReplayBuild = { ok: true; frames: ReplayFrame[]; allEvents: GameEvent[]; finalScore: Record<TeamKey, number> } | { ok: false; message: string }`
  - `stageFromState(s: MatchState): Stage`
  - `buildReplay(data: ReplayData, expectedScore?: Record<TeamKey, number>): ReplayBuild` (nunca lança)

- [ ] **Step 1: Escrever o teste (deve falhar)**

`apps/client/test/replay.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createMatch, step, type Action, type MatchState } from '@pfl/engine';
import type { ReplayData } from '@pfl/protocol';
import { buildReplay } from '../src/match/replayFrames';
import { testTeam } from './fixtures';

const teams = { A: testTeam('Trovões'), B: testTeam('Pedreiras') };

/** Partida inteira só com timeouts (padrões da spec 2.5): determinística e sempre termina. */
function timeoutMatch(seed: number): { state: MatchState; actions: Action[] } {
  let state = createMatch(teams.A, teams.B, seed).state;
  const actions: Action[] = [];
  for (let i = 0; i < 20000 && state.phase !== 'MATCH_END'; i++) {
    const action: Action = { type: 'TIMEOUT' };
    actions.push(action);
    state = step(state, action).state;
  }
  return { state, actions };
}

describe('buildReplay', () => {
  const { state, actions } = timeoutMatch(2026);
  const data: ReplayData = { seed: 2026, teams, actions };

  it('a partida de referência termina', () => {
    expect(state.phase).toBe('MATCH_END');
  });

  it('gera um frame por jogada, com o estado pré-jogada e a animação', () => {
    const build = buildReplay(data, state.score);
    expect(build.ok).toBe(true);
    if (!build.ok) return;
    expect(build.finalScore).toEqual(state.score);
    expect(build.frames.length).toBeGreaterThanOrEqual(12);
    expect(build.frames[0].events[0].t).toBe('DRIVE_START');
    expect(build.frames.at(-1)!.events.at(-1)!.t).toBe('MATCH_END');
    const plays = build.frames.filter((f) => f.events.some((e) => e.t === 'PLAY'));
    expect(plays.length).toBeGreaterThan(0);
    for (const f of plays) {
      expect(Object.keys(f.stage.lineups.offense)).toHaveLength(7);
      expect(Object.keys(f.stage.lineups.defense)).toHaveLength(7);
      expect(f.steps.length).toBeGreaterThan(0);
      expect(f.lines.length).toBeGreaterThan(0);
    }
    expect(build.allEvents.filter((e) => e.t === 'MATCH_END')).toHaveLength(1);
    expect(build.frames.map((f) => f.index)).toEqual(build.frames.map((_, i) => i));
  });

  it('acusa replay que não bate com o placar final', () => {
    const build = buildReplay(data, { A: state.score.A + 1, B: state.score.B });
    expect(build).toMatchObject({ ok: false });
  });

  it('nunca lança com dados corrompidos', () => {
    const badAction = { seed: 1, teams, actions: [{ type: 'CARD', team: 'A', cardId: 'nao_existe' } as Action] };
    expect(buildReplay(badAction)).toEqual({ ok: false, message: 'Não foi possível reproduzir o replay.' });
    const badTeam = { seed: 1, teams: { A: { ...teams.A, roster: [] }, B: teams.B }, actions: [] };
    expect(buildReplay(badTeam).ok).toBe(false);
  });

  it('replay sem ações vira um único frame com o início da partida', () => {
    const build = buildReplay({ seed: 5, teams, actions: [] });
    expect(build.ok && build.frames.length).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/replay.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 3: Implementar**

`apps/client/src/match/replayFrames.ts`:
```ts
import type { GameEvent, MatchState, TeamKey } from '@pfl/engine';
import { DEFAULT_CONFIG, createMatch, replay, step } from '@pfl/engine';
import type { ReplayData } from '@pfl/protocol';
import { narrate, type NarrationLine } from './narration';
import { buildTimeline, type AnimStep } from './timeline';
import type { Stage } from './matchState';

export interface ReplayFrame {
  index: number;
  /** estado pré-jogada (escalações já reveladas) */
  stage: Stage;
  /** eventos desde o frame anterior até a resolução desta jogada */
  events: GameEvent[];
  steps: AnimStep[];
  lines: NarrationLine[];
}

export type ReplayBuild =
  | { ok: true; frames: ReplayFrame[]; allEvents: GameEvent[]; finalScore: Record<TeamKey, number> }
  | { ok: false; message: string };

export function stageFromState(s: MatchState): Stage {
  return {
    turnId: s.turnId,
    offenseTeam: s.offense,
    ballOn: s.field.ballOn,
    yardsToGo: s.field.yardsToGo,
    lineups: structuredClone(s.lineups),
    fatigue: { A: { ...s.teams.A.fatigue.levels }, B: { ...s.teams.B.fatigue.levels } },
  };
}

/** Eventos que marcam a resolução de uma jogada (uma jogada = um frame). */
const RESOLVES = new Set<GameEvent['t']>(['CARDS', 'CONVERSION', 'MATCH_END']);

/**
 * Reproduz a partida com o engine (spec 6.1: replay a partir de seed + ações). O `step` dá o estado
 * pré-jogada de cada frame. O `replay` confere o placar final. Ações sem eventos (TIMEOUT de etapa,
 * SET_DEPTH) só acumulam. Nunca lança: dados corrompidos ou de outra versão do motor viram mensagem.
 */
export function buildReplay(data: ReplayData, expectedScore?: Record<TeamKey, number>): ReplayBuild {
  try {
    const ctx = {
      names: { A: data.teams.A.name, B: data.teams.B.name },
      possessionsPerTeam: DEFAULT_CONFIG.possessionsPerTeam,
    };
    const start = createMatch(data.teams.A, data.teams.B, data.seed);
    let state = start.state;
    let pending: GameEvent[] = [...start.events];
    const frames: ReplayFrame[] = [];
    const flush = (stage: Stage, resolved: readonly GameEvent[]) => {
      frames.push({ index: frames.length, stage, events: pending, steps: buildTimeline(resolved), lines: narrate(pending, ctx) });
      pending = [];
    };

    for (const action of data.actions) {
      const before = state;
      const r = step(state, action);
      state = r.state;
      pending.push(...r.events);
      if (r.events.some((e) => RESOLVES.has(e.t))) flush(stageFromState(before), r.events);
    }
    if (pending.length > 0) flush(stageFromState(state), pending);

    const full = replay(data.teams.A, data.teams.B, data.seed, data.actions);
    if (expectedScore && (full.state.score.A !== expectedScore.A || full.state.score.B !== expectedScore.B)) {
      return { ok: false, message: 'O replay não reproduz o placar final (versões diferentes do motor?).' };
    }
    return { ok: true, frames, allEvents: full.events, finalScore: { ...full.state.score } };
  } catch {
    return { ok: false, message: 'Não foi possível reproduzir o replay.' };
  }
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run apps/client/test/replay.test.ts`
Expected: PASS. Se "a partida de referência termina" falhar, a partida com timeouts não acabou em 20000 ações. Troque a seed por outra (o resultado continua determinístico). Não aumente o limite sem entender o motivo.

- [ ] **Step 5: Typecheck e commit**

Run: `npm run typecheck`
Expected: sem erros.

```bash
git add apps/client/src/match/replayFrames.ts apps/client/test/replay.test.ts
git commit -m "feat(client): frames de replay reproduzidos pelo engine"
```

---

### Task 12: Campo em Phaser: layout puro, cena e wrapper React

**Files:**
- Create: `apps/client/src/phaser/layout.ts`, `apps/client/src/phaser/FieldScene.ts`, `apps/client/src/phaser/PhaserField.tsx`, `apps/client/src/phaser/phaser-field.css`
- Test: `apps/client/test/layout.test.ts`

**Interfaces:**
- Consumes: `threshold`, `FORMATIONS`, `PACKAGES` e os tipos `Lineup`, `SlotId`, `TeamKey` (`@pfl/engine`); `Stage` (Task 10); `AnimStep` (Task 9); `EFFECT_TEXT` (Task 8); `spriteSrc` (Task 3).
- Produces:
  - `FIELD_WIDTH = 360`, `FIELD_HEIGHT = 560`, `LOS_Y = 340`, `PX_PER_YARD = 8`
  - `slotPoint(slot: SlotId): { x: number; y: number }`, `yardLineY(yard: number, ballOn: number): number`, `clampY(y: number): number`
  - `visibleYardLines(ballOn: number): { yard: number; y: number; label: string | null }[]`
  - `fatigueRatio(id: number, level: number): number`, `fatigueColor(ratio: number): number`, `slotOfId(lineup: Lineup, id: number): SlotId | null`
  - `interface PlaySpec { seq: number; stage: Stage; steps: AnimStep[] }`, `class FieldScene extends Phaser.Scene { sync(stage: Stage | null, play: PlaySpec | null): void }`
  - componente React `PhaserField({ stage: Stage | null; play: PlaySpec | null })`

- [ ] **Step 1: Escrever o teste do layout (deve falhar)**

`apps/client/test/layout.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { DEFENSE_SLOTS, FORMATIONS, OFFENSE_SLOTS, PACKAGES, type SlotId } from '@pfl/engine';
import {
  FIELD_HEIGHT, FIELD_WIDTH, LOS_Y, PX_PER_YARD, clampY, fatigueColor, fatigueRatio, slotOfId, slotPoint,
  visibleYardLines, yardLineY,
} from '../src/phaser/layout';

const distance = (a: SlotId, b: SlotId) => {
  const p = slotPoint(a);
  const q = slotPoint(b);
  return Math.hypot(p.x - q.x, p.y - q.y);
};

describe('posição das vagas no campo vertical', () => {
  it('todas cabem no canvas', () => {
    for (const slot of [...OFFENSE_SLOTS, ...DEFENSE_SLOTS]) {
      const { x, y } = slotPoint(slot);
      expect(x).toBeGreaterThanOrEqual(20);
      expect(x).toBeLessThanOrEqual(FIELD_WIDTH - 20);
      expect(y).toBeGreaterThanOrEqual(20);
      expect(y).toBeLessThanOrEqual(FIELD_HEIGHT - 20);
    }
  });

  it('ataque abaixo da linha de scrimmage, defesa acima (o ataque sobe)', () => {
    for (const slot of OFFENSE_SLOTS) expect(slotPoint(slot).y).toBeGreaterThan(LOS_Y);
    for (const slot of DEFENSE_SLOTS) expect(slotPoint(slot).y).toBeLessThan(LOS_Y);
  });

  it('nenhuma formação ou pacote sobrepõe sprites', () => {
    for (const slots of [...Object.values(FORMATIONS), ...Object.values(PACKAGES)]) {
      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) expect(distance(slots[i], slots[j])).toBeGreaterThanOrEqual(36);
      }
    }
  });
});

describe('jardas e fadiga', () => {
  it('converte jardas em y relativo à bola', () => {
    expect(yardLineY(25, 25)).toBe(LOS_Y);
    expect(yardLineY(30, 25)).toBe(LOS_Y - 5 * PX_PER_YARD);
    expect(clampY(-50)).toBe(12);
    expect(clampY(FIELD_HEIGHT + 50)).toBe(FIELD_HEIGHT - 12);
  });

  it('lista as linhas visíveis com os números do campo', () => {
    const lines = visibleYardLines(25);
    expect(lines.find((l) => l.yard === 25)?.y).toBe(LOS_Y);
    expect(lines.find((l) => l.yard === 30)?.label).toBe('30');
    expect(lines.find((l) => l.yard === 60)?.label).toBe('40');
    expect(lines.find((l) => l.yard === 0)?.label).toBe('G');
    expect(lines.every((l) => l.y >= 0 && l.y <= FIELD_HEIGHT)).toBe(true);
  });

  it('fadiga relativa ao limiar do Pokémon', () => {
    expect(fatigueRatio(25, 1)).toBe(0.5); // Pikachu: limiar 2
    expect(fatigueRatio(25, 4)).toBe(1);
    expect(fatigueRatio(143, 1)).toBeCloseTo(1 / 3); // Snorlax: limiar 3
    expect(fatigueColor(0)).not.toBe(fatigueColor(1));
    expect(fatigueColor(0.6)).not.toBe(fatigueColor(0.2));
  });

  it('encontra a vaga de um Pokémon', () => {
    expect(slotOfId({ QB: 63, RB: 25 }, 25)).toBe('RB');
    expect(slotOfId({ QB: 63 }, 1)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/layout.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 3: Implementar o layout**

`apps/client/src/phaser/layout.ts`:
```ts
import type { Lineup, SlotId } from '@pfl/engine';
import { threshold } from '@pfl/engine';

export const FIELD_WIDTH = 360;
export const FIELD_HEIGHT = 560;
/** Linha de scrimmage fixa na tela; as linhas de jarda rolam conforme a bola. O ataque sobe. */
export const LOS_Y = 340;
export const PX_PER_YARD = 8;
const COL_PX = 44;
const ROW_PX = 36;
const EDGE = 12;

/** col: colunas a partir do centro; row: fileiras a partir da linha (positivo = campo do ataque). */
const SLOT_OFFSETS: Record<SlotId, { col: number; row: number }> = {
  QB: { col: 0, row: 2 },
  OL1: { col: -1, row: 0.9 },
  OL2: { col: 0, row: 0.9 },
  OL3: { col: 1, row: 0.9 },
  RB: { col: 0, row: 3.2 },
  FB: { col: -0.9, row: 2.6 },
  TE: { col: 2, row: 1 },
  WR1: { col: -3.4, row: 0.9 },
  WR2: { col: 3.4, row: 0.9 },
  WR3: { col: -2.4, row: 1.8 },
  DL1: { col: -1, row: -0.9 },
  DL2: { col: 0, row: -0.9 },
  DL3: { col: 1, row: -0.9 },
  LB1: { col: -1, row: -2 },
  LB2: { col: 1, row: -2 },
  CB1: { col: -3.4, row: -1.2 },
  CB2: { col: 3.4, row: -1.2 },
  CB3: { col: 2.4, row: -2.2 },
  S1: { col: -1, row: -3.4 },
  S2: { col: 1.4, row: -3.4 },
};

export function slotPoint(slot: SlotId): { x: number; y: number } {
  const o = SLOT_OFFSETS[slot];
  return { x: FIELD_WIDTH / 2 + o.col * COL_PX, y: LOS_Y + o.row * ROW_PX };
}

/** y da jarda `yard` (0..100, do ponto de vista do ataque) com a bola em `ballOn`. */
export function yardLineY(yard: number, ballOn: number): number {
  return LOS_Y - (yard - ballOn) * PX_PER_YARD;
}

export function clampY(y: number): number {
  return Math.min(FIELD_HEIGHT - EDGE, Math.max(EDGE, y));
}

/** Linhas de 5 em 5 jardas visíveis; números de 10 em 10 como no campo real (10..50..10) e "G" nas linhas de gol. */
export function visibleYardLines(ballOn: number): { yard: number; y: number; label: string | null }[] {
  const lines: { yard: number; y: number; label: string | null }[] = [];
  for (let yard = 0; yard <= 100; yard += 5) {
    const y = yardLineY(yard, ballOn);
    if (y < 0 || y > FIELD_HEIGHT) continue;
    let label: string | null = null;
    if (yard === 0 || yard === 100) label = 'G';
    else if (yard % 10 === 0) label = String(yard <= 50 ? yard : 100 - yard);
    lines.push({ yard, y, label });
  }
  return lines;
}

/** 0..1 em relação ao limiar de fadiga do Pokémon (spec 3.6). */
export function fatigueRatio(id: number, level: number): number {
  return Math.max(0, Math.min(1, level / threshold(id)));
}

export function fatigueColor(ratio: number): number {
  if (ratio >= 1) return 0xd03028;
  if (ratio >= 0.5) return 0xf8d030;
  return 0x58a038;
}

export function slotOfId(lineup: Lineup, id: number): SlotId | null {
  for (const [slot, value] of Object.entries(lineup) as [SlotId, number | undefined][]) {
    if (value === id) return slot;
  }
  return null;
}
```

- [ ] **Step 4: Rodar o teste do layout**

Run: `npx vitest run apps/client/test/layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Implementar a cena e o wrapper**

`apps/client/src/phaser/FieldScene.ts`:
```ts
import Phaser from 'phaser';
import type { Lineup, SlotId, TeamKey } from '@pfl/engine';
import type { Stage } from '../match/matchState';
import type { AnimStep } from '../match/timeline';
import { EFFECT_TEXT } from '../match/effect';
import { spriteSrc } from '../lib/sprites';
import {
  FIELD_HEIGHT, FIELD_WIDTH, LOS_Y, PX_PER_YARD, clampY, fatigueColor, fatigueRatio, slotPoint, visibleYardLines, yardLineY,
} from './layout';

export interface PlaySpec {
  seq: number;
  stage: Stage;
  steps: AnimStep[];
}

type Side = 'offense' | 'defense';

interface PlayerSprite {
  container: Phaser.GameObjects.Container;
  slot: SlotId;
  id: number;
  side: Side;
}

interface Wanted {
  slot: SlotId;
  id: number;
  side: Side;
}

const SPRITE_SIZE = 40;
const COLORS = {
  grassA: 0x48a058,
  grassB: 0x409850,
  line: 0xf8f8f0,
  los: 0x3058c0,
  firstDown: 0xf8d030,
  endZoneOwn: 0x3058c0,
  endZoneOpp: 0xd03028,
  ball: 0x8b4a20,
  barBg: 0x181010,
};
const TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: '"Press Start 2P", monospace',
  fontSize: '10px',
  color: '#f8f8f0',
  stroke: '#181010',
  strokeThickness: 4,
};

// Spec 6.2: ataque com back_gbc, defesa com front_gbc.
const textureKey = (side: Side, id: number) => `${side === 'offense' ? 'back' : 'front'}-${id}`;
const other = (k: TeamKey): TeamKey => (k === 'A' ? 'B' : 'A');

function lineupEntries(lineup: Lineup, side: Side): Wanted[] {
  return (Object.entries(lineup) as [SlotId, number | undefined][])
    .filter((entry): entry is [SlotId, number] => entry[1] !== undefined)
    .map(([slot, id]) => ({ slot, id, side }));
}

/**
 * Campo vertical. Ela não decide nada: posiciona o estágio recebido e toca os passos da timeline.
 * O React chama `sync` a cada render. Enquanto há `play`, o estágio atual é ignorado; assim, um
 * match:phase que chegue no meio da animação não a interrompe.
 */
export class FieldScene extends Phaser.Scene {
  private ready = false;
  private pending: { stage: Stage | null; play: PlaySpec | null } = { stage: null, play: null };
  private shownStage: Stage | null = null;
  private playedSeq = -1;
  private generation = 0;
  private failedTextures = new Set<string>();
  private fieldGfx!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private transient: Phaser.GameObjects.GameObject[] = [];
  private players = new Map<string, PlayerSprite>();
  private ball!: Phaser.GameObjects.Ellipse;
  private banner!: Phaser.GameObjects.Text;

  constructor() {
    super('field');
  }

  create(): void {
    this.fieldGfx = this.add.graphics().setDepth(0);
    this.ball = this.add.ellipse(FIELD_WIDTH / 2, LOS_Y, 10, 7, COLORS.ball).setStrokeStyle(1, COLORS.line).setDepth(20).setVisible(false);
    this.banner = this.add
      .text(FIELD_WIDTH / 2, FIELD_HEIGHT / 2, '', { ...TEXT_STYLE, fontSize: '18px', strokeThickness: 6, align: 'center' })
      .setOrigin(0.5)
      .setDepth(40)
      .setVisible(false);
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => this.failedTextures.add(file.key));
    this.ready = true;
    this.sync(this.pending.stage, this.pending.play);
  }

  sync(stage: Stage | null, play: PlaySpec | null): void {
    if (!this.ready) {
      this.pending = { stage, play };
      return;
    }
    if (play) {
      if (play.seq !== this.playedSeq) {
        this.playedSeq = play.seq;
        this.shownStage = play.stage;
        this.layout(play.stage, () => this.schedule(play.steps));
      }
      return;
    }
    if (stage !== this.shownStage) {
      this.shownStage = stage;
      this.layout(stage, null);
    }
  }

  private layout(stage: Stage | null, onReady: (() => void) | null): void {
    const gen = ++this.generation;
    this.time.removeAllEvents();
    this.tweens.killAll();
    for (const obj of this.transient) obj.destroy();
    this.transient = [];
    this.banner.setVisible(false);
    this.drawField(stage);
    this.clearPlayers();
    if (!stage) {
      this.ball.setVisible(false);
      return;
    }
    this.ball.setPosition(FIELD_WIDTH / 2, LOS_Y + 2).setAlpha(1).setVisible(true);
    const wanted = [...lineupEntries(stage.lineups.offense, 'offense'), ...lineupEntries(stage.lineups.defense, 'defense')];
    this.ensureTextures(wanted, () => {
      if (gen !== this.generation) return;
      for (const w of wanted) {
        const team = w.side === 'offense' ? stage.offenseTeam : other(stage.offenseTeam);
        this.addPlayer(w, stage.fatigue[team]?.[w.id] ?? 0);
      }
      onReady?.();
    });
  }

  private ensureTextures(wanted: readonly Wanted[], done: () => void): void {
    const missing = wanted.filter((w) => {
      const key = textureKey(w.side, w.id);
      return !this.textures.exists(key) && !this.failedTextures.has(key);
    });
    if (missing.length === 0) {
      done();
      return;
    }
    for (const w of missing) this.load.image(textureKey(w.side, w.id), spriteSrc(w.side === 'offense' ? 'back' : 'front', w.id));
    this.load.once(Phaser.Loader.Events.COMPLETE, done);
    this.load.start();
  }

  private addPlayer(w: Wanted, level: number): void {
    const { x, y } = slotPoint(w.slot);
    const key = textureKey(w.side, w.id);
    const body: Phaser.GameObjects.GameObject = this.textures.exists(key)
      ? this.add.image(0, 0, key).setDisplaySize(SPRITE_SIZE, SPRITE_SIZE)
      : this.add.circle(0, 0, 14, w.side === 'offense' ? COLORS.los : COLORS.endZoneOpp).setStrokeStyle(2, COLORS.line);
    const ratio = fatigueRatio(w.id, level);
    const barBg = this.add.rectangle(0, -SPRITE_SIZE / 2 - 4, 32, 6, COLORS.barBg);
    const bar = this.add
      .rectangle(-15, -SPRITE_SIZE / 2 - 4, Math.max(2, 30 * ratio), 4, fatigueColor(ratio))
      .setOrigin(0, 0.5);
    barBg.setVisible(level > 0);
    bar.setVisible(level > 0);
    const container = this.add.container(x, y, [body, barBg, bar]).setDepth(w.side === 'defense' ? 10 : 11);
    this.players.set(`${w.side}:${w.id}`, { container, slot: w.slot, id: w.id, side: w.side });
  }

  private clearPlayers(): void {
    for (const p of this.players.values()) p.container.destroy();
    this.players.clear();
  }

  private drawField(stage: Stage | null): void {
    const g = this.fieldGfx;
    g.clear();
    for (const label of this.labels) label.destroy();
    this.labels = [];
    const ballOn = stage?.ballOn ?? 50;

    g.fillStyle(COLORS.grassA, 1).fillRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);
    for (let yard = -10; yard < 110; yard += 10) {
      const top = yardLineY(yard + 10, ballOn);
      const bottom = yardLineY(yard, ballOn);
      if (bottom < 0 || top > FIELD_HEIGHT) continue;
      if (yard < 0) g.fillStyle(COLORS.endZoneOwn, 0.55);
      else if (yard >= 100) g.fillStyle(COLORS.endZoneOpp, 0.55);
      else g.fillStyle((yard / 10) % 2 === 0 ? COLORS.grassA : COLORS.grassB, 1);
      g.fillRect(0, top, FIELD_WIDTH, bottom - top);
    }

    g.lineStyle(2, COLORS.line, 0.8);
    for (const line of visibleYardLines(ballOn)) {
      g.lineBetween(0, line.y, FIELD_WIDTH, line.y);
      if (line.label) {
        this.labels.push(this.add.text(4, line.y + 3, line.label, { ...TEXT_STYLE, fontSize: '8px' }).setDepth(1));
        this.labels.push(this.add.text(FIELD_WIDTH - 4, line.y + 3, line.label, { ...TEXT_STYLE, fontSize: '8px' }).setOrigin(1, 0).setDepth(1));
      }
    }
    if (!stage) return;

    g.lineStyle(3, COLORS.los, 1).lineBetween(0, LOS_Y, FIELD_WIDTH, LOS_Y);
    const target = stage.ballOn + stage.yardsToGo;
    if (target < 100) {
      const y = yardLineY(target, stage.ballOn);
      g.lineStyle(3, COLORS.firstDown, 1).lineBetween(0, y, FIELD_WIDTH, y);
    }
  }

  private schedule(steps: readonly AnimStep[]): void {
    for (const step of steps) this.time.delayedCall(step.at, () => this.runStep(step));
  }

  private player(side: Side, id: number | null | undefined): PlayerSprite | undefined {
    return id === null || id === undefined ? undefined : this.players.get(`${side}:${id}`);
  }

  private bySlot(side: Side, prefix: string): PlayerSprite[] {
    return [...this.players.values()].filter((p) => p.side === side && p.slot.startsWith(prefix));
  }

  private floatText(x: number, y: number, text: string, color: string): void {
    const t = this.add.text(x, y, text, { ...TEXT_STYLE, color }).setOrigin(0.5).setDepth(30);
    this.transient.push(t);
    this.tweens.add({ targets: t, y: y - 20, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  private runStep(step: AnimStep): void {
    const d = step.duration;
    switch (step.kind) {
      case 'SNAP': {
        const qb = this.bySlot('offense', 'QB')[0];
        this.tweens.add({ targets: this.ball, x: qb?.container.x ?? FIELD_WIDTH / 2, y: (qb?.container.y ?? LOS_Y + 60) - 4, duration: d });
        break;
      }
      case 'BLOCK':
        for (const p of [...this.bySlot('offense', 'OL'), ...this.bySlot('defense', 'DL')]) {
          this.tweens.add({ targets: p.container, y: p.container.y + (p.side === 'offense' ? -4 : 4), duration: d / 4, yoyo: true, repeat: 1 });
        }
        break;
      case 'CLASH': {
        const off = this.player('offense', step.off);
        const def = this.player('defense', step.def);
        if (!off || !def) break;
        const mx = (off.container.x + def.container.x) / 2;
        const my = (off.container.y + def.container.y) / 2;
        for (const p of [off, def]) {
          this.tweens.add({
            targets: p.container,
            x: p.container.x + (mx - p.container.x) * 0.5,
            y: p.container.y + (my - p.container.y) * 0.5,
            duration: d * 0.5,
            yoyo: true,
          });
        }
        const text = step.effect ? EFFECT_TEXT[step.effect] : null;
        if (text) this.floatText(mx, my - 24, text, step.effect === 'SUPER' ? '#f8d030' : '#c8c8c8');
        this.cameras.main.shake(120, 0.004);
        break;
      }
      case 'THROW': {
        const from = this.player('offense', step.from) ?? this.bySlot('offense', 'QB')[0];
        const to = this.player('offense', step.to);
        if (!to) break;
        if (from) this.ball.setPosition(from.container.x, from.container.y - 4);
        this.tweens.add({ targets: this.ball, x: to.container.x, y: to.container.y - 4, duration: d, ease: 'Sine.easeOut' });
        break;
      }
      case 'RUN': {
        const carrier = this.player('offense', step.carrier);
        if (!carrier) break;
        const y = clampY(carrier.container.y - step.yards * PX_PER_YARD);
        this.tweens.add({ targets: carrier.container, y, duration: d, ease: 'Quad.easeOut' });
        this.tweens.add({ targets: this.ball, x: carrier.container.x, y: y - 4, duration: d, ease: 'Quad.easeOut' });
        break;
      }
      case 'TACKLE': {
        const by = this.player('defense', step.by);
        const carrier = this.player('offense', step.carrier);
        if (!by || !carrier) break;
        this.tweens.add({ targets: by.container, x: carrier.container.x + 10, y: carrier.container.y - 10, duration: d });
        break;
      }
      case 'INCOMPLETE':
        this.tweens.add({ targets: this.ball, y: this.ball.y + 16, alpha: 0.3, duration: d });
        this.floatText(this.ball.x, this.ball.y - 16, 'INCOMPLETO', '#f8f8f0');
        break;
      case 'SACK': {
        const qb = this.player('offense', step.qb);
        if (!qb) break;
        const y = clampY(qb.container.y - step.yards * PX_PER_YARD);
        this.tweens.add({ targets: qb.container, y, duration: d });
        this.tweens.add({ targets: this.ball, x: qb.container.x, y: y - 4, duration: d });
        const by = this.player('defense', step.by);
        if (by) this.tweens.add({ targets: by.container, x: qb.container.x + 10, y: y - 10, duration: d });
        this.floatText(qb.container.x, y - 30, 'SACK!', '#f86858');
        break;
      }
      case 'TURNOVER': {
        const by = this.player('defense', step.by);
        if (by) this.tweens.add({ targets: this.ball, x: by.container.x, y: by.container.y - 4, duration: d });
        this.cameras.main.flash(150, 208, 48, 40);
        break;
      }
      case 'KICK': {
        const y = clampY(this.ball.y - step.distance * PX_PER_YARD);
        const drift = step.good === false ? 60 : 0;
        this.tweens.add({ targets: this.ball, x: this.ball.x + drift, y, duration: d, ease: 'Sine.easeOut' });
        break;
      }
      case 'BANNER': {
        const color = step.tone === 'good' ? '#f8d030' : step.tone === 'bad' ? '#f86858' : '#f8f8f0';
        this.banner.setText(step.text).setColor(color).setScale(0.6).setAlpha(1).setVisible(true);
        this.tweens.add({ targets: this.banner, scale: 1, duration: Math.min(250, d / 2), ease: 'Back.easeOut' });
        this.time.delayedCall(d, () => this.banner.setVisible(false));
        break;
      }
    }
  }
}
```

`apps/client/src/phaser/PhaserField.tsx`:
```tsx
import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import type { Stage } from '../match/matchState';
import { FieldScene, type PlaySpec } from './FieldScene';
import { FIELD_HEIGHT, FIELD_WIDTH } from './layout';
import './phaser-field.css';

interface Props {
  stage: Stage | null;
  play: PlaySpec | null;
}

/** Monta um Phaser.Game por instância e repassa estágio/animação à cena. */
export function PhaserField({ stage, play }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<FieldScene | null>(null);
  const latest = useRef<Props>({ stage, play });
  latest.current = { stage, play };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new FieldScene();
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host,
      width: FIELD_WIDTH,
      height: FIELD_HEIGHT,
      pixelArt: true,
      backgroundColor: '#48a058',
      banner: false,
      audio: { noAudio: true },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene,
    });
    sceneRef.current = scene;
    scene.sync(latest.current.stage, latest.current.play);
    return () => {
      sceneRef.current = null;
      game.destroy(true);
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.sync(stage, play);
  }, [stage, play]);

  return <div className="phaser-field" ref={hostRef} aria-label="Campo" role="img" />;
}
```

`apps/client/src/phaser/phaser-field.css`:
```css
.phaser-field {
  width: 100%;
  max-width: 360px;
  aspect-ratio: 360 / 560;
  margin: 0 auto;
  border: var(--border);
  background: var(--gbc-field);
}

.phaser-field canvas {
  display: block;
  image-rendering: pixelated;
}
```

- [ ] **Step 6: Verificar typecheck e build**

Run: `npm run typecheck && npm run build:client`
Expected: sem erros. O build ainda não inclui a cena (o `App` da Task 1 não a importa); o typecheck cobre os arquivos. A verificação visual é feita pelos itens P8, P9, P10 e P15 do checklist da Task 19.

- [ ] **Step 7: Commit**

```bash
git add apps/client/src/phaser apps/client/test/layout.test.ts
git commit -m "feat(client): campo vertical em Phaser com sprites, fadiga e animação por timeline"
```

---

### Task 13: Componentes compartilhados: sprite, tipo, estrelas, carta com tooltip, erros e editor de depth chart

**Files:**
- Create: `apps/client/src/components/Sprite.tsx`, `apps/client/src/components/TypeBadge.tsx`, `apps/client/src/components/Stars.tsx`, `apps/client/src/components/CardTile.tsx`, `apps/client/src/components/ErrorList.tsx`, `apps/client/src/components/DepthChartEditor.tsx`, `apps/client/src/components/ui.css`

**Interfaces:**
- Consumes: `aptitude`, `slotPosition`, `OFFENSE_SLOTS`, `DEFENSE_SLOTS`, `Card`, `PokemonType`, `SlotId`, `Team`, `TeamError` (`@pfl/engine`); `spriteSrc`, `speciesName`, `TYPE_LABELS`, `POSITION_LABELS` (Task 3); `cardInfo` (Task 5); `teamErrorMessage` (Task 5); `DepthAction`, `rankForPosition` (Task 4).
- Produces (props exatas):
  - `Sprite({ id: number; view?: 'front' | 'back'; size?: number })`
  - `TypeBadge({ type: PokemonType })`
  - `Stars({ value: number })`
  - `CardTile({ card: Card; disabled?: boolean; selected?: boolean; badge?: string; onClick?: () => void })`
  - `ErrorList({ errors: readonly TeamError[] })`
  - `DepthChartEditor({ roster: readonly number[]; depth: Team['depth']; keepOnField: readonly number[]; onAction: (a: DepthAction) => void })`

- [ ] **Step 1: Criar os componentes**

`apps/client/src/components/Sprite.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { spriteSrc } from '../lib/sprites';
import { speciesName } from '../lib/names';
import './ui.css';

interface Props {
  id: number;
  view?: 'front' | 'back';
  size?: number;
}

/** Sprite Gen 1 Yellow servido localmente; se faltar (sprites não baixados), mostra as iniciais. */
export function Sprite({ id, view = 'front', size = 40 }: Props) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [id, view]);
  const name = speciesName(id);
  if (failed) {
    return (
      <span className="sprite sprite-missing" style={{ width: size, height: size }} title={name}>
        {name.slice(0, 2)}
      </span>
    );
  }
  return (
    <img
      className="sprite"
      src={spriteSrc(view, id)}
      alt={name}
      title={name}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
```

`apps/client/src/components/TypeBadge.tsx`:
```tsx
import type { PokemonType } from '@pfl/engine';
import { TYPE_LABELS } from '../lib/names';
import './ui.css';

export function TypeBadge({ type }: { type: PokemonType }) {
  return (
    <span className="type-badge" style={{ background: `var(--type-${type})` }}>
      {TYPE_LABELS[type]}
    </span>
  );
}
```

`apps/client/src/components/Stars.tsx`:
```tsx
import './ui.css';

/** Nota de aptidão de 1 a 5 estrelas (spec 5.3). */
export function Stars({ value }: { value: number }) {
  const n = Math.max(0, Math.min(5, value));
  return (
    <span className="stars" aria-label={`${n} de 5 estrelas`} title={`Aptidão ${n}/5`}>
      {'★'.repeat(n)}
      {'☆'.repeat(5 - n)}
    </span>
  );
}
```

`apps/client/src/components/CardTile.tsx`:
```tsx
import { useId } from 'react';
import type { Card } from '@pfl/engine';
import { cardInfo } from '../builder/cardInfo';
import { TypeBadge } from './TypeBadge';
import './ui.css';

interface Props {
  card: Card;
  disabled?: boolean;
  selected?: boolean;
  /** texto curto no canto (ex.: "1/2", "básica", "4º down") */
  badge?: string;
  onClick?: () => void;
}

/** Carta clicável com tooltip de requisitos, perfil e leitura. Desabilitada = acinzentada (spec 3.4). */
export function CardTile({ card, disabled = false, selected = false, badge, onClick }: Props) {
  const tipId = useId();
  const info = cardInfo(card);
  return (
    <div className={`card-tile${disabled ? ' is-disabled' : ''}${selected ? ' is-selected' : ''}`}>
      <button type="button" className="card-face" disabled={disabled} onClick={onClick} aria-describedby={tipId}>
        <span className="card-name">{card.name}</span>
        <span className="card-category">{info.category}</span>
        <span className="card-meta">
          {card.element ? <TypeBadge type={card.element} /> : <span className="muted">sem tipo</span>}
          {badge && <span className="card-badge">{badge}</span>}
        </span>
      </button>
      <div className="card-tooltip" role="tooltip" id={tipId}>
        <h4>{info.name}</h4>
        <p>
          {info.category} · {info.origin}
          {info.element ? ` · ${info.element}` : ''}
        </p>
        <p>Requisitos: {info.requirements.length ? info.requirements.join(' + ') : 'nenhum'}</p>
        {info.profile.length > 0 && (
          <ul>
            {info.profile.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        {info.reads.length > 0 && (
          <ul>
            {info.reads.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

`apps/client/src/components/ErrorList.tsx`:
```tsx
import type { TeamError } from '@pfl/engine';
import { teamErrorMessage } from '../builder/derived';

export function ErrorList({ errors }: { errors: readonly TeamError[] }) {
  if (errors.length === 0) return <p className="ok-text">Time válido!</p>;
  return (
    <ul className="error-list">
      {errors.map((e, i) => (
        <li key={`${e.code}-${e.detail ?? ''}-${i}`}>{teamErrorMessage(e)}</li>
      ))}
    </ul>
  );
}
```

`apps/client/src/components/DepthChartEditor.tsx`:
```tsx
import type { SlotId, Team } from '@pfl/engine';
import { DEFENSE_SLOTS, OFFENSE_SLOTS, aptitude, slotPosition } from '@pfl/engine';
import { rankForPosition, type DepthAction } from '../builder/depth';
import { POSITION_LABELS, speciesName } from '../lib/names';
import { Sprite } from './Sprite';
import { Stars } from './Stars';
import './ui.css';

interface Props {
  roster: readonly number[];
  depth: Team['depth'];
  keepOnField: readonly number[];
  onAction: (a: DepthAction) => void;
}

/** Depth chart por vaga (spec 5.4): a mesma ordem vale em todas as formações/pacotes que usam a vaga. */
export function DepthChartEditor({ roster, depth, keepOnField, onAction }: Props) {
  return (
    <div className="depth-editor stack">
      <div className="row">
        <button type="button" className="btn btn-small" disabled={roster.length === 0} onClick={() => onAction({ type: 'AUTO_DEPTH' })}>
          Preencher automaticamente
        </button>
        <span className="muted">O primeiro de cada vaga é o titular; os demais entram por fadiga, na ordem.</span>
      </div>
      <h3>Ataque</h3>
      <div className="depth-grid">
        {OFFENSE_SLOTS.map((slot) => (
          <SlotEditor key={slot} slot={slot} roster={roster} list={depth[slot] ?? []} onAction={onAction} />
        ))}
      </div>
      <h3>Defesa</h3>
      <div className="depth-grid">
        {DEFENSE_SLOTS.map((slot) => (
          <SlotEditor key={slot} slot={slot} roster={roster} list={depth[slot] ?? []} onAction={onAction} />
        ))}
      </div>
      <h3>Manter em campo</h3>
      <p className="muted">Ignora a substituição por fadiga e aceita −10% nos stats por nível acima do limiar.</p>
      <div className="keep-list">
        {roster.map((id) => (
          <label key={id} className="keep-item">
            <input type="checkbox" checked={keepOnField.includes(id)} onChange={() => onAction({ type: 'TOGGLE_KEEP', id })} />
            {speciesName(id)}
          </label>
        ))}
      </div>
    </div>
  );
}

interface SlotProps {
  slot: SlotId;
  roster: readonly number[];
  list: readonly number[];
  onAction: (a: DepthAction) => void;
}

function SlotEditor({ slot, roster, list, onAction }: SlotProps) {
  const position = slotPosition(slot);
  const available = rankForPosition(roster.filter((id) => !list.includes(id)), position);
  return (
    <div className="depth-slot">
      <div className="depth-slot-head">
        <strong>{slot}</strong>
        <span className="muted">{POSITION_LABELS[position]}</span>
      </div>
      {list.length === 0 ? (
        <p className="error-text">vaga vazia</p>
      ) : (
        <ol className="depth-list">
          {list.map((id, i) => (
            <li key={id}>
              <Sprite id={id} size={24} />
              <span className="depth-name">{speciesName(id)}</span>
              <Stars value={aptitude(id, position)} />
              <span className="depth-buttons">
                <button type="button" className="btn btn-small" aria-label="Subir" disabled={i === 0} onClick={() => onAction({ type: 'DEPTH_MOVE', slot, id, dir: -1 })}>
                  ▲
                </button>
                <button type="button" className="btn btn-small" aria-label="Descer" disabled={i === list.length - 1} onClick={() => onAction({ type: 'DEPTH_MOVE', slot, id, dir: 1 })}>
                  ▼
                </button>
                <button type="button" className="btn btn-small" aria-label="Remover" onClick={() => onAction({ type: 'DEPTH_REMOVE', slot, id })}>
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
      <select
        className="input depth-add"
        value=""
        disabled={available.length === 0}
        onChange={(e) => {
          const id = Number(e.target.value);
          if (id) onAction({ type: 'DEPTH_ADD', slot, id });
        }}
      >
        <option value="">+ adicionar</option>
        {available.map((id) => (
          <option key={id} value={id}>
            {speciesName(id)} {'★'.repeat(aptitude(id, position))}
          </option>
        ))}
      </select>
    </div>
  );
}
```

`apps/client/src/components/ui.css`:
```css
.sprite {
  display: inline-block;
  vertical-align: middle;
  image-rendering: pixelated;
  flex: none;
}

.sprite-missing {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--gbc-panel);
  border: 2px dashed var(--gbc-muted);
  font-size: var(--fs-xs);
}

.type-badge {
  display: inline-block;
  padding: 0 4px;
  border: 2px solid var(--gbc-border);
  font-size: var(--fs-xs);
  line-height: 1.6;
  text-transform: uppercase;
  color: var(--gbc-ink);
  white-space: nowrap;
}

.stars {
  color: var(--gbc-orange);
  font-family: monospace;
  font-size: var(--fs-md);
  white-space: nowrap;
}

.card-tile {
  position: relative;
  display: inline-flex;
}

.card-face {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  width: 136px;
  min-height: 100px;
  padding: var(--space-2);
  background: var(--gbc-paper);
  border: 3px solid var(--gbc-border);
  box-shadow: 3px 3px 0 var(--gbc-border);
  text-align: left;
  cursor: pointer;
}

.card-face:hover:not(:disabled) { background: var(--gbc-yellow); }

.card-face:focus-visible {
  outline: 3px dashed var(--gbc-blue);
  outline-offset: 2px;
}

.card-face:disabled {
  cursor: not-allowed;
  filter: grayscale(1);
  opacity: 0.5;
}

.card-tile.is-selected .card-face {
  outline: 3px solid var(--gbc-blue);
  outline-offset: 2px;
}

.card-name {
  font-size: var(--fs-sm);
  line-height: 1.3;
}

.card-category {
  font-size: var(--fs-xs);
  color: var(--gbc-muted);
}

.card-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-1);
  margin-top: auto;
  font-size: var(--fs-xs);
}

.card-badge {
  background: var(--gbc-ink);
  color: var(--gbc-paper);
  padding: 0 4px;
}

.card-tooltip {
  display: none;
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  z-index: 60;
  width: 260px;
  background: var(--gbc-ink);
  color: var(--gbc-paper);
  border: 3px solid var(--gbc-border);
  padding: var(--space-2);
  font-size: var(--fs-xs);
  line-height: 1.6;
  pointer-events: none;
}

.card-tooltip h4 {
  margin: 0 0 var(--space-1);
  font-size: var(--fs-sm);
  font-weight: 400;
  color: var(--gbc-yellow);
}

.card-tooltip p { margin: 0 0 var(--space-1); }
.card-tooltip ul { margin: 0 0 var(--space-1); padding-left: var(--space-3); }

.card-tile:hover .card-tooltip,
.card-tile:focus-within .card-tooltip {
  display: block;
}

.depth-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: var(--space-2);
}

.depth-slot {
  border: 3px solid var(--gbc-border);
  background: var(--gbc-paper);
  padding: var(--space-2);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.depth-slot-head {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
  font-size: var(--fs-xs);
}

.depth-list {
  margin: 0;
  padding-left: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.depth-list li {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--fs-xs);
}

.depth-list li:first-child .depth-name { color: var(--gbc-red); }

.depth-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.depth-buttons {
  display: inline-flex;
  gap: 2px;
}

.depth-add { font-size: var(--fs-xs); }

.keep-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: var(--space-1);
  font-size: var(--fs-xs);
}

.keep-item {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}
```

- [ ] **Step 2: Verificar typecheck e build**

Run: `npm run typecheck && npm run build:client`
Expected: sem erros. A verificação visual é feita pelos itens P4–P6 e P11 do checklist da Task 19.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/components
git commit -m "feat(client): componentes pixel art (sprite, carta com tooltip, depth chart)"
```

---

### Task 14: Tela Montar time

**Files:**
- Create: `apps/client/src/screens/builder/CapBar.tsx`, `apps/client/src/screens/builder/Pokedex.tsx`, `apps/client/src/screens/builder/RosterPanel.tsx`, `apps/client/src/screens/builder/DeckEditor.tsx`, `apps/client/src/screens/builder/TeamCodePanel.tsx`, `apps/client/src/screens/builder/SuggestedTeams.tsx`, `apps/client/src/screens/builder/BuilderScreen.tsx`, `apps/client/src/screens/builder/builder.css`

**Interfaces:**
- Consumes:
  - `@pfl/engine`: `SUGGESTED_TEAMS`, `POKEMON_TYPES`, `ROSTER_SIZE`, `DECK_SIZE`, `MAX_COPIES`, `LEGENDARY_IDS`, `aptitude`, `findCard`, `getSpecies`, `speciesCost`, `teamCost` e os tipos `CardSide`, `Position`, `PokemonType`, `Team`.
  - Task 3: `getLocalStorage`, `speciesName`, `displayName`, `TYPE_LABELS`, `POSITION_LABELS`.
  - Task 4: `TeamDraft`, `emptyDraft`, `draftFromTeam`, `builderReducer`.
  - Task 5: `capInfo`, `CapInfo`, `draftErrors`, `eligibleCards`, `deckCardTotal`, `copiesIn`, `filterPokedex`, `DEFAULT_FILTER`, `PokedexFilter`.
  - Task 6: `loadTeams`, `saveTeams`, `importTeamCode`, `exportTeamCode`.
  - Task 13: `Sprite`, `TypeBadge`, `Stars`, `CardTile`, `ErrorList`, `DepthChartEditor`.
- Produces: `BuilderScreen({ onBack: () => void })`, além dos componentes internos com as props declaradas em cada arquivo.

- [ ] **Step 1: Criar os componentes da tela**

`apps/client/src/screens/builder/CapBar.tsx`:
```tsx
import type { CapInfo } from '../../builder/derived';
import './builder.css';

export function CapBar({ info }: { info: CapInfo }) {
  return (
    <div className={`cap-bar${info.over ? ' is-over' : ''}`}>
      <div className="cap-bar-label">
        <span>Teto salarial</span>
        <span>
          {info.cost}/{info.cap} {info.over ? `(estourou ${-info.remaining})` : `(restam ${info.remaining})`}
        </span>
      </div>
      <div className="cap-bar-track" role="progressbar" aria-valuemin={0} aria-valuemax={info.cap} aria-valuenow={info.cost}>
        <div className="cap-bar-fill" style={{ width: `${info.ratio * 100}%` }} />
      </div>
    </div>
  );
}
```

`apps/client/src/screens/builder/Pokedex.tsx`:
```tsx
import { useMemo, useState } from 'react';
import type { PokemonType, Position } from '@pfl/engine';
import { LEGENDARY_IDS, POKEMON_TYPES, ROSTER_SIZE, aptitude, speciesCost } from '@pfl/engine';
import type { TeamDraft } from '../../builder/draft';
import { DEFAULT_FILTER, filterPokedex, type PokedexFilter } from '../../builder/derived';
import { POSITION_LABELS, TYPE_LABELS, displayName } from '../../lib/names';
import { Sprite } from '../../components/Sprite';
import { TypeBadge } from '../../components/TypeBadge';
import { Stars } from '../../components/Stars';
import './builder.css';

const POSITIONS = Object.keys(POSITION_LABELS) as Position[];
const COST_LIMITS = [2, 4, 6, 8, 10, 12, 14, 17];

interface Props {
  draft: TeamDraft;
  onAdd: (id: number) => void;
  onSpecialist: (id: number) => void;
}

/** Pokédex dos 151 com filtros por tipo, custo e aptidão (spec 6.1). */
export function Pokedex({ draft, onAdd, onSpecialist }: Props) {
  const [filter, setFilter] = useState<PokedexFilter>(DEFAULT_FILTER);
  const list = useMemo(() => filterPokedex(filter), [filter]);
  const full = draft.roster.length >= ROSTER_SIZE;
  const set = (patch: Partial<PokedexFilter>) => setFilter((f) => ({ ...f, ...patch }));

  return (
    <section className="panel pokedex">
      <h2 className="panel-title">Pokédex</h2>
      <div className="pokedex-filters">
        <input className="input" placeholder="Nome ou nº" value={filter.search} onChange={(e) => set({ search: e.target.value })} aria-label="Buscar" />
        <select className="input" value={filter.type} onChange={(e) => set({ type: e.target.value as PokemonType | 'ALL' })} aria-label="Tipo">
          <option value="ALL">Todos os tipos</option>
          {POKEMON_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={filter.maxCost ?? ''}
          onChange={(e) => set({ maxCost: e.target.value === '' ? null : Number(e.target.value) })}
          aria-label="Custo máximo"
        >
          <option value="">Qualquer custo</option>
          {COST_LIMITS.map((c) => (
            <option key={c} value={c}>
              Custo até {c}
            </option>
          ))}
        </select>
        <select className="input" value={filter.position} onChange={(e) => set({ position: e.target.value as Position | 'ALL' })} aria-label="Posição">
          <option value="ALL">Qualquer posição</option>
          {POSITIONS.map((p) => (
            <option key={p} value={p}>
              {p} · {POSITION_LABELS[p]}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={filter.minAptitude}
          disabled={filter.position === 'ALL'}
          onChange={(e) => set({ minAptitude: Number(e.target.value) })}
          aria-label="Aptidão mínima"
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {'★'.repeat(n)} ou mais
            </option>
          ))}
        </select>
      </div>
      <p className="muted">{list.length} Pokémon</p>
      <ul className="pokedex-list">
        {list.map((s) => {
          const inRoster = draft.roster.includes(s.id);
          const isSpecialist = draft.specialist === s.id;
          return (
            <li key={s.id} className={`pokedex-row${inRoster || isSpecialist ? ' is-picked' : ''}`}>
              <span className="dex-no">#{String(s.id).padStart(3, '0')}</span>
              <Sprite id={s.id} size={32} />
              <span className="dex-name">
                {displayName(s.name)}
                {LEGENDARY_IDS.includes(s.id) && <span className="legend-tag">LEND.</span>}
                <span className="dex-types">
                  {s.types.map((t) => (
                    <TypeBadge key={t} type={t} />
                  ))}
                </span>
              </span>
              <span className="dex-cost">{speciesCost(s.id)}pt</span>
              <span className="dex-actions">
                {filter.position !== 'ALL' && <Stars value={aptitude(s.id, filter.position)} />}
                <button type="button" className="btn btn-small" disabled={inRoster || isSpecialist || full} onClick={() => onAdd(s.id)}>
                  + Elenco
                </button>
                <button type="button" className="btn btn-small" disabled={isSpecialist} onClick={() => onSpecialist(s.id)}>
                  Kicker
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

`apps/client/src/screens/builder/RosterPanel.tsx`:
```tsx
import type { Position } from '@pfl/engine';
import { LEGENDARY_IDS, ROSTER_SIZE, aptitude, getSpecies, speciesCost } from '@pfl/engine';
import type { TeamDraft } from '../../builder/draft';
import { POSITION_LABELS, speciesName } from '../../lib/names';
import { Sprite } from '../../components/Sprite';
import { TypeBadge } from '../../components/TypeBadge';
import './builder.css';

const POSITIONS = Object.keys(POSITION_LABELS) as Position[];

function bestPositions(id: number): string {
  return [...POSITIONS]
    .sort((a, b) => aptitude(id, b) - aptitude(id, a))
    .slice(0, 2)
    .join('/');
}

interface Props {
  draft: TeamDraft;
  onRemove: (id: number) => void;
}

export function RosterPanel({ draft, onRemove }: Props) {
  const specialist = draft.specialist;
  return (
    <section className="panel roster-panel">
      <h2 className="panel-title">
        Elenco {draft.roster.length}/{ROSTER_SIZE}
      </h2>
      {draft.roster.length === 0 && <p className="muted">Adicione Pokémon pela Pokédex ou carregue um time sugerido.</p>}
      <ul className="roster-list">
        {draft.roster.map((id) => (
          <li key={id} className="roster-row">
            <Sprite id={id} size={32} />
            <span className="roster-name">
              {speciesName(id)}
              {LEGENDARY_IDS.includes(id) && <span className="legend-tag">LEND.</span>}
            </span>
            <span className="roster-types">
              {getSpecies(id).types.map((t) => (
                <TypeBadge key={t} type={t} />
              ))}
            </span>
            <span className="muted">{bestPositions(id)}</span>
            <span className="roster-cost">{speciesCost(id)}pt</span>
            <button type="button" className="btn btn-small" aria-label={`Remover ${speciesName(id)}`} onClick={() => onRemove(id)}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <h3>Especialista (kicker/punter)</h3>
      {specialist === null ? (
        <p className="muted">Nenhum. Use "Kicker" na Pokédex. Sp. Atk define FG e PAT; Sp. Atk + Attack, o punt.</p>
      ) : (
        <div className="roster-row">
          <Sprite id={specialist} size={32} />
          <span className="roster-name">{speciesName(specialist)}</span>
          <span className="muted">
            Sp.Atk {getSpecies(specialist).stats.spAttack} · Atk {getSpecies(specialist).stats.attack}
          </span>
          <span className="roster-cost">{speciesCost(specialist)}pt</span>
          <button type="button" className="btn btn-small" aria-label="Remover especialista" onClick={() => onRemove(specialist)}>
            ✕
          </button>
        </div>
      )}
    </section>
  );
}
```

`apps/client/src/screens/builder/DeckEditor.tsx`:
```tsx
import { useMemo } from 'react';
import type { CardSide } from '@pfl/engine';
import { DECK_SIZE, MAX_COPIES, findCard } from '@pfl/engine';
import type { TeamDraft } from '../../builder/draft';
import { copiesIn, deckCardTotal, eligibleCards } from '../../builder/derived';
import { CardTile } from '../../components/CardTile';
import './builder.css';

interface Props {
  draft: TeamDraft;
  onAdd: (side: CardSide, cardId: string) => void;
  onRemove: (side: CardSide, cardId: string) => void;
}

/** Editor de deck: só aparecem as cartas liberadas pelo elenco (spec 3.4 e 6.1). */
export function DeckEditor({ draft, onAdd, onRemove }: Props) {
  return (
    <div className="deck-editor">
      <DeckColumn side="OFFENSE" draft={draft} onAdd={onAdd} onRemove={onRemove} />
      <DeckColumn side="DEFENSE" draft={draft} onAdd={onAdd} onRemove={onRemove} />
    </div>
  );
}

function DeckColumn({ side, draft, onAdd, onRemove }: Props & { side: CardSide }) {
  const deck = side === 'OFFENSE' ? draft.offenseDeck : draft.defenseDeck;
  const eligible = useMemo(() => eligibleCards(draft.roster, side), [draft.roster, side]);
  const locked = deckCardTotal(side) - eligible.length;
  const full = deck.length >= DECK_SIZE;
  const unique = [...new Set(deck)];
  return (
    <section className="panel deck-column">
      <h2 className="panel-title">
        {side === 'OFFENSE' ? 'Deck de ataque' : 'Deck de defesa'} {deck.length}/{DECK_SIZE}
      </h2>
      <h3>No deck</h3>
      {unique.length === 0 ? (
        <p className="muted">Vazio. Clique nas cartas abaixo para adicionar.</p>
      ) : (
        <ul className="deck-list">
          {unique.map((id) => (
            <li key={id}>
              <span>{findCard(id)?.name ?? id}</span>
              <span className="muted">×{copiesIn(deck, id)}</span>
              <button type="button" className="btn btn-small" aria-label="Remover uma cópia" onClick={() => onRemove(side, id)}>
                −
              </button>
            </li>
          ))}
        </ul>
      )}
      <h3>Liberadas pelo elenco ({eligible.length})</h3>
      <p className="muted">{locked} carta(s) ainda bloqueada(s): escale Pokémon dos tipos/espécies exigidos.</p>
      <div className="card-grid">
        {eligible.map((card) => {
          const n = copiesIn(deck, card.id);
          return (
            <CardTile
              key={card.id}
              card={card}
              badge={`${n}/${MAX_COPIES}`}
              selected={n > 0}
              disabled={full || n >= MAX_COPIES}
              onClick={() => onAdd(side, card.id)}
            />
          );
        })}
      </div>
    </section>
  );
}
```

`apps/client/src/screens/builder/TeamCodePanel.tsx`:
```tsx
import { useMemo, useState } from 'react';
import type { TeamDraft } from '../../builder/draft';
import { exportTeamCode, importTeamCode } from '../../builder/teamStore';
import './builder.css';

interface Props {
  draft: TeamDraft;
  onImport: (draft: TeamDraft, dropped: number) => void;
}

/** Exportar/importar o time como código de texto (spec 5.5). */
export function TeamCodePanel({ draft, onImport }: Props) {
  const code = useMemo(() => exportTeamCode(draft), [draft]);
  const [input, setInput] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setMessage({ ok: true, text: 'Código copiado.' });
    } catch {
      setMessage({ ok: false, text: 'Não foi possível copiar. Selecione o texto e copie manualmente.' });
    }
  };

  const doImport = () => {
    const result = importTeamCode(input);
    if (!result.ok) {
      setMessage({ ok: false, text: result.message });
      return;
    }
    onImport(result.draft, result.dropped);
    setInput('');
    setMessage({
      ok: true,
      text: result.dropped > 0 ? `Time importado. ${result.dropped} item(ns) inválido(s) foram descartados.` : 'Time importado.',
    });
  };

  return (
    <div className="code-panel">
      <section className="panel stack">
        <h2 className="panel-title">Exportar</h2>
        {code ? (
          <>
            <textarea className="input" rows={6} readOnly value={code} onFocus={(e) => e.currentTarget.select()} aria-label="Código do time" />
            <button type="button" className="btn" onClick={() => void copy()}>
              Copiar código
            </button>
          </>
        ) : (
          <p className="muted">Escolha um especialista para gerar o código.</p>
        )}
      </section>
      <section className="panel stack">
        <h2 className="panel-title">Importar</h2>
        <textarea
          className="input"
          rows={6}
          value={input}
          placeholder="Cole aqui o código de um time"
          aria-label="Código para importar"
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="button" className="btn btn-primary" disabled={!input.trim()} onClick={doImport}>
          Importar
        </button>
      </section>
      {message && (
        <p className={message.ok ? 'ok-text' : 'error-text'} role="status">
          {message.text}
        </p>
      )}
    </div>
  );
}
```

`apps/client/src/screens/builder/SuggestedTeams.tsx`:
```tsx
import type { Team } from '@pfl/engine';
import { SUGGESTED_TEAMS, teamCost } from '@pfl/engine';
import { Sprite } from '../../components/Sprite';
import './builder.css';

export function SuggestedTeams({ onPick }: { onPick: (team: Team) => void }) {
  return (
    <section className="panel">
      <h2 className="panel-title">Times sugeridos</h2>
      <ul className="suggested-list">
        {SUGGESTED_TEAMS.map((team) => (
          <li key={team.name} className="suggested-row">
            <span className="suggested-name">{team.name}</span>
            <span className="suggested-sprites">
              {team.roster.slice(0, 6).map((id) => (
                <Sprite key={id} id={id} size={28} />
              ))}
            </span>
            <span className="muted">{teamCost(team)}pt</span>
            <button type="button" className="btn btn-small" onClick={() => onPick(team)}>
              Usar
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

`apps/client/src/screens/builder/BuilderScreen.tsx`:
```tsx
import { useMemo, useReducer, useState } from 'react';
import type { Team } from '@pfl/engine';
import { builderReducer } from '../../builder/builderState';
import { draftFromTeam, emptyDraft, type TeamDraft } from '../../builder/draft';
import { capInfo, draftErrors } from '../../builder/derived';
import { loadTeams, saveTeams } from '../../builder/teamStore';
import { getLocalStorage } from '../../lib/storage';
import { ErrorList } from '../../components/ErrorList';
import { DepthChartEditor } from '../../components/DepthChartEditor';
import { CapBar } from './CapBar';
import { Pokedex } from './Pokedex';
import { RosterPanel } from './RosterPanel';
import { DeckEditor } from './DeckEditor';
import { TeamCodePanel } from './TeamCodePanel';
import { SuggestedTeams } from './SuggestedTeams';
import './builder.css';

type Tab = 'ROSTER' | 'DEPTH' | 'DECK' | 'CODE';
const TABS: { id: Tab; label: string }[] = [
  { id: 'ROSTER', label: 'Elenco' },
  { id: 'DEPTH', label: 'Depth chart' },
  { id: 'DECK', label: 'Deck' },
  { id: 'CODE', label: 'Código' },
];
const NO_STORAGE = 'Este navegador não permite salvar times. Use a aba Código para exportar o seu.';

export function BuilderScreen({ onBack }: { onBack: () => void }) {
  const storage = useMemo(() => getLocalStorage(), []);
  const [saved, setSaved] = useState<TeamDraft[]>(() => loadTeams(storage));
  const [index, setIndex] = useState<number | null>(null);
  const [draft, dispatch] = useReducer(builderReducer, undefined, () => emptyDraft());
  const [tab, setTab] = useState<Tab>('ROSTER');
  const [message, setMessage] = useState<string | null>(storage ? null : NO_STORAGE);
  const errors = useMemo(() => draftErrors(draft), [draft]);
  const cap = useMemo(() => capInfo(draft), [draft]);

  const load = (draftToLoad: TeamDraft, at: number | null, text: string | null) => {
    dispatch({ type: 'LOAD', draft: draftToLoad });
    setIndex(at);
    setMessage(text);
  };

  const save = () => {
    const next = index === null ? [...saved, draft] : saved.map((t, i) => (i === index ? draft : t));
    setSaved(next);
    if (index === null) setIndex(next.length - 1);
    setMessage(saveTeams(storage, next) ? 'Time salvo neste navegador.' : 'Não foi possível salvar neste navegador. Exporte o código para não perder o time.');
  };

  const pickSuggested = (team: Team) => load(draftFromTeam(team), null, `"${team.name}" carregado. Salve para guardar uma cópia editável.`);

  return (
    <main className="screen builder">
      <header className="builder-header panel">
        <div className="row">
          <button type="button" className="btn btn-small" onClick={onBack}>
            ◀ Voltar
          </button>
          <h1 className="builder-title">Montar time</h1>
        </div>
        <div className="row">
          <input className="input" value={draft.name} aria-label="Nome do time" onChange={(e) => dispatch({ type: 'RENAME', name: e.target.value })} />
          <select
            className="input"
            aria-label="Times salvos"
            value={index ?? ''}
            onChange={(e) => {
              if (e.target.value === '') return;
              const i = Number(e.target.value);
              load(saved[i], i, null);
            }}
          >
            <option value="">{index === null ? 'Time não salvo' : 'Times salvos'}</option>
            {saved.map((t, i) => (
              <option key={`${t.name}-${i}`} value={i}>
                {t.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn" onClick={() => load(emptyDraft(), null, null)}>
            Novo
          </button>
          <button type="button" className="btn btn-primary" onClick={save}>
            Salvar
          </button>
        </div>
        <CapBar info={cap} />
        {message && <p className="muted" role="status">{message}</p>}
        <details className="builder-errors" open={errors.length > 0 && errors.length <= 4}>
          <summary>{errors.length === 0 ? 'Time válido' : `${errors.length} pendência(s)`}</summary>
          <ErrorList errors={errors} />
        </details>
      </header>

      <nav className="tabs" aria-label="Seções do time">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={`btn tab${tab === t.id ? ' is-active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'ROSTER' && (
        <div className="builder-roster-layout">
          <Pokedex draft={draft} onAdd={(id) => dispatch({ type: 'ADD_SPECIES', id })} onSpecialist={(id) => dispatch({ type: 'SET_SPECIALIST', id })} />
          <div className="stack">
            <RosterPanel draft={draft} onRemove={(id) => dispatch({ type: 'REMOVE_SPECIES', id })} />
            <SuggestedTeams onPick={pickSuggested} />
          </div>
        </div>
      )}
      {tab === 'DEPTH' && (
        <section className="panel">
          <DepthChartEditor roster={draft.roster} depth={draft.depth} keepOnField={draft.keepOnField} onAction={dispatch} />
        </section>
      )}
      {tab === 'DECK' && (
        <DeckEditor
          draft={draft}
          onAdd={(side, cardId) => dispatch({ type: 'DECK_ADD', side, cardId })}
          onRemove={(side, cardId) => dispatch({ type: 'DECK_REMOVE', side, cardId })}
        />
      )}
      {tab === 'CODE' && (
        <TeamCodePanel
          draft={draft}
          onImport={(imported) => load(imported, null, `"${imported.name}" importado. Salve para guardá-lo.`)}
        />
      )}
    </main>
  );
}
```

`apps/client/src/screens/builder/builder.css`:
```css
.builder-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.builder-header > .row:first-child { justify-content: space-between; }

.builder-title {
  font-size: var(--fs-lg);
  margin: 0;
}

.builder-errors summary { cursor: pointer; }

.cap-bar {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.cap-bar-label {
  display: flex;
  justify-content: space-between;
  font-size: var(--fs-xs);
}

.cap-bar-track {
  height: 14px;
  border: 3px solid var(--gbc-border);
  background: var(--gbc-panel);
}

.cap-bar-fill {
  height: 100%;
  background: var(--gbc-green-1);
}

.cap-bar.is-over .cap-bar-fill { background: var(--gbc-red); }
.cap-bar.is-over .cap-bar-label { color: var(--gbc-red); }

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.tab.is-active {
  background: var(--gbc-ink);
  color: var(--gbc-paper);
}

.builder-roster-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: var(--space-4);
  align-items: start;
}

.pokedex-filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.pokedex-filters .input { font-size: var(--fs-xs); }

.pokedex-list,
.roster-list,
.suggested-list,
.deck-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.pokedex-list {
  max-height: 62vh;
  overflow-y: auto;
  border-top: 3px solid var(--gbc-border);
}

.pokedex-row {
  display: grid;
  grid-template-columns: 44px 36px minmax(0, 1fr) 44px auto;
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-1) 0;
  border-bottom: 2px solid var(--gbc-panel);
  font-size: var(--fs-xs);
}

.pokedex-row.is-picked { background: var(--gbc-panel); }

.dex-name {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.dex-types {
  display: flex;
  gap: 2px;
  flex-wrap: wrap;
}

.dex-actions {
  display: flex;
  gap: var(--space-1);
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.legend-tag {
  margin-left: var(--space-1);
  color: var(--gbc-paper);
  background: var(--gbc-orange);
  padding: 0 3px;
  font-size: var(--fs-xs);
}

.roster-row {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto auto 40px auto;
  gap: var(--space-2);
  align-items: center;
  padding: 2px 0;
  border-bottom: 2px solid var(--gbc-panel);
  font-size: var(--fs-xs);
}

.roster-types {
  display: flex;
  gap: 2px;
}

.roster-cost,
.dex-cost { text-align: right; }

.suggested-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 44px auto;
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-1) 0;
  font-size: var(--fs-xs);
}

.suggested-sprites { display: flex; }

.deck-editor {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
  align-items: start;
}

.deck-list li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 32px auto;
  gap: var(--space-2);
  align-items: center;
  font-size: var(--fs-xs);
  padding: 2px 0;
}

.card-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding-top: var(--space-2);
}

.code-panel {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}

.code-panel > p { grid-column: 1 / -1; }

@media (max-width: 900px) {
  .builder-roster-layout,
  .deck-editor,
  .code-panel {
    grid-template-columns: 1fr;
  }

  .pokedex-row { grid-template-columns: 36px minmax(0, 1fr) 40px; }
  .pokedex-row .dex-no { display: none; }
  .pokedex-row .dex-actions { grid-column: 1 / -1; justify-content: flex-start; }
  .roster-row { grid-template-columns: 36px minmax(0, 1fr) 40px auto; }
  .roster-row .roster-types,
  .roster-row .muted { display: none; }
}
```

- [ ] **Step 2: Verificar typecheck e build**

Run: `npm run typecheck && npm run build:client`
Expected: sem erros. A tela é exercitada pelos itens P4–P7 do checklist da Task 19 depois que o `App` a ligar (Task 18).

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/screens/builder
git commit -m "feat(client): tela de montagem do time (Pokédex, teto, depth, deck, código, sugeridos)"
```

---

### Task 15: Telas Início e Lobby

**Files:**
- Create: `apps/client/src/screens/HomeScreen.tsx`, `apps/client/src/screens/LobbyScreen.tsx`, `apps/client/src/screens/lobby.css`

**Interfaces:**
- Consumes: `ROOM_CODE_LENGTH`, `RoomState`, `RoomPlayer` (`@pfl/protocol`); `SUGGESTED_TEAMS`, `Team`, `TeamKey` (`@pfl/engine`); `normalizeRoomCode` (Task 7); `loadTeams` (Task 6); `draftToTeam` (Task 4); `draftErrors` (Task 5); `getLocalStorage` (Task 3); `Sprite`, `ErrorList` (Task 13).
- Produces:
  - `HomeScreen({ busy: boolean; onCreate: () => void; onJoin: (code: string) => void; onBuilder: () => void })`
  - `LobbyScreen({ room: RoomState; myTeam: Team | null; onSubmitTeam: (team: Team) => void; onReady: (ready: boolean) => void; onLeave: () => void })`

- [ ] **Step 1: Criar as telas**

`apps/client/src/screens/HomeScreen.tsx`:
```tsx
import { useState, type FormEvent } from 'react';
import { ROOM_CODE_LENGTH } from '@pfl/protocol';
import { normalizeRoomCode } from '../net/session';
import { Sprite } from '../components/Sprite';
import './lobby.css';

interface Props {
  busy: boolean;
  onCreate: () => void;
  onJoin: (code: string) => void;
  onBuilder: () => void;
}

/** Spec 6.1 (1): criar sala ou entrar com um código. */
export function HomeScreen({ busy, onCreate, onJoin, onBuilder }: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const normalized = normalizeRoomCode(code);
    if (!normalized) {
      setError(`O código tem ${ROOM_CODE_LENGTH} letras (sem I e O).`);
      return;
    }
    setError(null);
    onJoin(normalized);
  };

  return (
    <main className="screen screen-center home">
      <div className="home-title">
        <h1 className="title">PFL</h1>
        <p className="subtitle">Pokémon Football League</p>
        <div className="home-sprites">
          <Sprite id={25} view="back" size={72} />
          <span className="home-vs">VS</span>
          <Sprite id={135} size={72} />
        </div>
      </div>
      <section className="panel home-menu stack">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={onCreate}>
          Criar sala
        </button>
        <form className="row home-join" onSubmit={submit}>
          <input
            className="input home-code"
            value={code}
            maxLength={12}
            placeholder="CÓDIGO"
            aria-label="Código da sala"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button type="submit" className="btn" disabled={busy}>
            Entrar
          </button>
        </form>
        {error && <p className="error-text">{error}</p>}
        <button type="button" className="btn" onClick={onBuilder}>
          Montar time
        </button>
      </section>
      <p className="muted home-hint">Monte um time, crie uma sala e passe o código de 6 letras para um amigo.</p>
    </main>
  );
}
```

`apps/client/src/screens/LobbyScreen.tsx`:
```tsx
import { useMemo, useState } from 'react';
import type { Team, TeamKey } from '@pfl/engine';
import { SUGGESTED_TEAMS } from '@pfl/engine';
import type { RoomPlayer, RoomState } from '@pfl/protocol';
import { loadTeams } from '../builder/teamStore';
import { draftToTeam } from '../builder/draft';
import { draftErrors } from '../builder/derived';
import { getLocalStorage } from '../lib/storage';
import { ErrorList } from '../components/ErrorList';
import { Sprite } from '../components/Sprite';
import './lobby.css';

interface Props {
  room: RoomState;
  myTeam: Team | null;
  onSubmitTeam: (team: Team) => void;
  onReady: (ready: boolean) => void;
  onLeave: () => void;
}

interface TeamOption {
  key: string;
  source: 'Salvo' | 'Sugerido';
  team: Team;
}

const KEYS: TeamKey[] = ['A', 'B'];

/** Spec 6.1 (3): escolher o time e marcar "pronto"; o servidor valida os dois e começa a partida. */
export function LobbyScreen({ room, myTeam, onSubmitTeam, onReady, onLeave }: Props) {
  const options = useMemo<TeamOption[]>(() => {
    const saved = loadTeams(getLocalStorage()).flatMap((draft, i): TeamOption[] => {
      const team = draftToTeam(draft);
      return team && draftErrors(draft).length === 0 ? [{ key: `saved-${i}`, source: 'Salvo', team }] : [];
    });
    const suggested = SUGGESTED_TEAMS.map((team, i): TeamOption => ({ key: `suggested-${i}`, source: 'Sugerido', team }));
    return [...saved, ...suggested];
  }, []);
  const [selected, setSelected] = useState(options[0]?.key ?? '');
  const me: RoomPlayer | undefined = room.players.find((p) => p.key === room.you);
  const canReady = !!me && me.teamName !== null && me.teamErrors.length === 0;
  const chosen = options.find((o) => o.key === selected);

  return (
    <main className="screen lobby">
      <header className="panel lobby-header">
        <div>
          <p className="muted">Código da sala</p>
          <p className="room-code" aria-label="Código da sala">{room.code}</p>
          <p className="muted">Passe este código para seu amigo entrar.</p>
        </div>
        <button type="button" className="btn btn-small" onClick={onLeave}>
          Sair da sala
        </button>
      </header>

      <section className="lobby-players">
        {KEYS.map((key) => {
          const p = room.players.find((player) => player.key === key);
          return (
            <div key={key} className={`panel lobby-player${key === room.you ? ' is-you' : ''}`}>
              <h2 className="panel-title">
                Jogador {key} {key === room.you ? '(você)' : ''}
              </h2>
              {!p ? (
                <p className="muted">Aguardando entrar...</p>
              ) : (
                <div className="stack">
                  <p>{p.connected ? '● conectado' : '○ desconectado'}</p>
                  <p>Time: {p.teamName ?? <span className="muted">nenhum</span>}</p>
                  <p className={p.ready ? 'ok-text' : 'muted'}>{p.ready ? 'PRONTO!' : 'não está pronto'}</p>
                  {p.teamName !== null && p.teamErrors.length > 0 && <ErrorList errors={p.teamErrors} />}
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="panel stack">
        <h2 className="panel-title">Seu time</h2>
        {options.length === 0 ? (
          <p className="muted">Nenhum time válido salvo. Monte um na tela inicial ou use um sugerido.</p>
        ) : (
          <ul className="team-options">
            {options.map((o) => (
              <li key={o.key}>
                <label className={`team-option${selected === o.key ? ' is-selected' : ''}`}>
                  <input type="radio" name="team" value={o.key} checked={selected === o.key} onChange={() => setSelected(o.key)} />
                  <span className="team-option-name">{o.team.name}</span>
                  <span className="muted">{o.source}</span>
                  <span className="team-option-sprites">
                    {o.team.roster.slice(0, 5).map((id) => (
                      <Sprite key={id} id={id} size={24} />
                    ))}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="row">
          <button type="button" className="btn" disabled={!chosen || me?.ready} onClick={() => chosen && onSubmitTeam(chosen.team)}>
            Enviar time
          </button>
          <button type="button" className="btn btn-primary" disabled={!canReady} onClick={() => onReady(!me?.ready)}>
            {me?.ready ? 'Cancelar pronto' : 'Estou pronto'}
          </button>
        </div>
        {myTeam && <p className="muted">Enviado: {myTeam.name}. O servidor revalida o time.</p>}
        <p className="muted">{room.status === 'WAITING' ? 'A partida começa quando os dois estiverem prontos.' : `Sala: ${room.status}`}</p>
      </section>
    </main>
  );
}
```

`apps/client/src/screens/lobby.css`:
```css
.home { gap: var(--space-6); }

.home-title {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
}

.home-sprites {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.home-vs {
  font-size: var(--fs-lg);
  color: var(--gbc-red);
}

.home-menu {
  width: min(360px, 100%);
}

.home-menu > .btn { width: 100%; }
.home-join { flex-wrap: nowrap; }

.home-code {
  flex: 1;
  text-transform: uppercase;
  letter-spacing: 4px;
  text-align: center;
}

.home-hint { max-width: 420px; }

.lobby-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-3);
}

.lobby-header p { margin: 0; }

.room-code {
  font-size: 28px;
  letter-spacing: 8px;
  color: var(--gbc-red);
}

.lobby-players {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}

.lobby-player p { margin: 0; }
.lobby-player.is-you { background: var(--gbc-panel); }

.team-options {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.team-option {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-1) var(--space-2);
  border: 2px solid transparent;
  cursor: pointer;
}

.team-option.is-selected { border-color: var(--gbc-border); background: var(--gbc-panel); }
.team-option-sprites { display: flex; }

@media (max-width: 720px) {
  .lobby-players { grid-template-columns: 1fr; }
  .team-option { grid-template-columns: auto minmax(0, 1fr) auto; }
  .team-option-sprites { display: none; }
}
```

- [ ] **Step 2: Verificar typecheck e build**

Run: `npm run typecheck && npm run build:client`
Expected: sem erros. A verificação visual é feita pelos itens P1–P3 e P7 do checklist da Task 19.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/screens/HomeScreen.tsx apps/client/src/screens/LobbyScreen.tsx apps/client/src/screens/lobby.css
git commit -m "feat(client): telas de início e lobby"
```

---

### Task 16: Tela de Partida

**Files:**
- Create: `apps/client/src/screens/match/Hud.tsx`, `apps/client/src/screens/match/NarrationLog.tsx`, `apps/client/src/screens/match/RevealBanner.tsx`, `apps/client/src/screens/match/LineupPicker.tsx`, `apps/client/src/screens/match/CardHand.tsx`, `apps/client/src/screens/match/ConversionPicker.tsx`, `apps/client/src/screens/match/DepthPanel.tsx`, `apps/client/src/screens/match/MatchScreen.tsx`, `apps/client/src/screens/match/match.css`

**Interfaces:**
- Consumes:
  - `@pfl/engine`: `FORMATIONS`, `PACKAGES`, `findCard`; tipos `FormationId`, `PackageId`, `PlayerView`, `SlotId`, `Team`, `TeamKey`.
  - `@pfl/protocol`: `RoomState`, `RECONNECT_GRACE_MS`.
  - Task 3: `formatDown`, `formatBallOn`, `formatPossession`, `PHASE_LABELS`, `FORMATION_LABELS`, `PACKAGE_LABELS`, `READ_SYMBOL`, `READ_LABELS`, `speciesName`.
  - Task 4: `applyDepthAction`, `DepthAction`.
  - Task 8: `NarrationLine`.
  - Task 10: `MatchClientState`, `CardReveal`, `panelMode`, `canSubmitCard`, `handEntries`, `timerSeconds`, `previewLineup`, `DepthDraft`, `draftFromTeamDepth`, `isDepthDirty`, `depthDraftErrors`, `shouldSendDepth`.
  - Task 12: `PhaserField`, `PlaySpec`.
  - Task 13: `CardTile`, `ErrorList`, `DepthChartEditor`.
- Produces: `MatchScreen(props: { state: MatchClientState; room: RoomState; myTeam: Team | null; now: number; onFormation: (id: FormationId) => void; onPackage: (id: PackageId) => void; onCard: (cardId: string) => void; onConversion: (choice: 'PAT' | 'TWO') => void; onSendDepth: (draft: DepthDraft) => void })`. `onSendDepth` precisa ser estável (`useCallback`) porque é dependência de efeito.

- [ ] **Step 1: Criar os componentes da partida**

`apps/client/src/screens/match/Hud.tsx`:
```tsx
import type { PlayerView, TeamKey } from '@pfl/engine';
import { PHASE_LABELS, formatBallOn, formatDown, formatPossession } from '../../lib/format';
import './match.css';

interface Props {
  view: PlayerView;
  names: Record<TeamKey, string>;
  seconds: number | null;
}

/** HUD da spec 6.2: placar | posse | down & distance | bola | timer da etapa. */
export function Hud({ view, names, seconds }: Props) {
  const team = (k: TeamKey) => (
    <span className={`hud-team${view.offense === k ? ' has-ball' : ''}${view.you === k ? ' is-you' : ''}`}>
      {view.offense === k ? '● ' : ''}
      {names[k]}
    </span>
  );
  return (
    <header className="hud panel">
      <div className="hud-score">
        {team('A')}
        <strong>{view.score.A}</strong>
        <span>×</span>
        <strong>{view.score.B}</strong>
        {team('B')}
      </div>
      <div>{formatPossession(view)}</div>
      <div>{formatDown(view.field, view.conversionAttempt)}</div>
      <div>Bola na {formatBallOn(view.field.ballOn)}</div>
      <div>Você: {view.side === 'offense' ? 'Ataque' : 'Defesa'}</div>
      <div className={`hud-timer${seconds !== null && seconds <= 3 ? ' is-urgent' : ''}`}>
        {PHASE_LABELS[view.phase]} {seconds === null ? '--' : `${seconds}s`}
      </div>
    </header>
  );
}
```

`apps/client/src/screens/match/NarrationLog.tsx`:
```tsx
import { useEffect, useRef } from 'react';
import type { NarrationLine } from '../../match/narration';
import './match.css';

export function NarrationLog({ lines }: { lines: readonly NarrationLine[] }) {
  const listRef = useRef<HTMLOListElement | null>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);
  return (
    <div className="log">
      <h2 className="panel-title">Log</h2>
      <ol className="log-list" ref={listRef} aria-live="polite">
        {lines.map((line, i) => (
          <li key={i} className={`log-line log-${line.kind}`}>
            {line.text}
          </li>
        ))}
      </ol>
    </div>
  );
}
```

`apps/client/src/screens/match/RevealBanner.tsx`:
```tsx
import { findCard } from '@pfl/engine';
import type { CardReveal } from '../../match/matchState';
import { READ_LABELS, READ_SYMBOL } from '../../lib/names';
import './match.css';

/** Revelação simultânea das cartas com destaque da leitura ✔/·/✖ (spec 6.2). */
export function RevealBanner({ reveal }: { reveal: CardReveal | null }) {
  if (!reveal) return null;
  const off = findCard(reveal.offense)?.name ?? reveal.offense;
  const def = findCard(reveal.defense)?.name ?? reveal.defense;
  const tone = reveal.read ? reveal.read.toLowerCase() : 'kick';
  return (
    <div className={`reveal reveal-${tone}`} role="status">
      <span className="reveal-card">{off}</span>
      <span className="reveal-vs">×</span>
      <span className="reveal-card">{def}</span>
      {reveal.read && (
        <span className="reveal-read">
          <span className="reveal-symbol">{READ_SYMBOL[reveal.read]}</span> {READ_LABELS[reveal.read]}
        </span>
      )}
    </div>
  );
}
```

`apps/client/src/screens/match/LineupPicker.tsx`:
```tsx
import type { FormationId, PackageId, SlotId, Team } from '@pfl/engine';
import { FORMATIONS, PACKAGES } from '@pfl/engine';
import { previewLineup } from '../../match/lineupPreview';
import { FORMATION_LABELS, PACKAGE_LABELS, speciesName } from '../../lib/names';
import './match.css';

export interface LineupOption<T extends string> {
  id: T;
  label: string;
  slots: readonly SlotId[];
}

export const FORMATION_OPTIONS: LineupOption<FormationId>[] = (Object.keys(FORMATIONS) as FormationId[]).map((id) => ({
  id,
  label: FORMATION_LABELS[id],
  slots: FORMATIONS[id],
}));

export const PACKAGE_OPTIONS: LineupOption<PackageId>[] = (Object.keys(PACKAGES) as PackageId[]).map((id) => ({
  id,
  label: PACKAGE_LABELS[id],
  slots: PACKAGES[id],
}));

interface Props<T extends string> {
  title: string;
  hint?: string;
  options: LineupOption<T>[];
  team: Team | null;
  levels: Record<number, number>;
  onPick: (id: T) => void;
}

/** 4 botões, cada um com a lista de quem entra em campo (spec 6.2). */
export function LineupPicker<T extends string>({ title, hint, options, team, levels, onPick }: Props<T>) {
  return (
    <div className="picker-wrap">
      <h3>{title}</h3>
      {hint && <p className="muted">{hint}</p>}
      <div className="picker">
        {options.map((o) => {
          const lineup = team ? previewLineup(o.slots, team, levels) : null;
          return (
            <button key={o.id} type="button" className="btn picker-option" onClick={() => onPick(o.id)}>
              <span className="picker-title">{o.label}</span>
              {lineup ? (
                <ul className="picker-lineup">
                  {o.slots.map((slot) => {
                    const id = lineup[slot];
                    return id === undefined ? null : (
                      <li key={slot}>
                        <b>{slot}</b> {speciesName(id)}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <span className="picker-slots">{o.slots.join(' ')}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

`apps/client/src/screens/match/CardHand.tsx`:
```tsx
import type { PlayerView } from '@pfl/engine';
import { findCard } from '@pfl/engine';
import { handEntries } from '../../match/matchState';
import { CardTile } from '../../components/CardTile';
import './match.css';

interface Props {
  view: PlayerView;
  canPick: (cardId: string) => boolean;
  onPick: (cardId: string) => void;
}

/** Mão de 5 + básicas (+ Punt/FG no 4º down). Não jogáveis ficam acinzentadas (view.playable). */
export function CardHand({ view, canPick, onPick }: Props) {
  return (
    <div className="hand">
      {handEntries(view).map((entry) => {
        const card = findCard(entry.cardId);
        if (!card) return null;
        const badge = entry.source === 'BASIC' ? 'básica' : entry.source === 'SPECIAL' ? '4º down' : undefined;
        return (
          <CardTile key={entry.key} card={card} badge={badge} disabled={!canPick(entry.cardId)} onClick={() => onPick(entry.cardId)} />
        );
      })}
    </div>
  );
}
```

`apps/client/src/screens/match/ConversionPicker.tsx`:
```tsx
import './match.css';

export function ConversionPicker({ onPick }: { onPick: (choice: 'PAT' | 'TWO') => void }) {
  return (
    <div className="picker">
      <button type="button" className="btn picker-option" onClick={() => onPick('PAT')}>
        <span className="picker-title">PAT</span>
        <span>1 ponto · chute quase automático do especialista</span>
      </button>
      <button type="button" className="btn picker-option" onClick={() => onPick('TWO')}>
        <span className="picker-title">Conversão de 2</span>
        <span>uma jogada normal a partir da linha de 3</span>
      </button>
    </div>
  );
}
```

`apps/client/src/screens/match/DepthPanel.tsx`:
```tsx
import type { Team } from '@pfl/engine';
import type { DepthAction } from '../../builder/depth';
import { depthDraftErrors, isDepthDirty, type DepthDraft } from '../../match/depthDraft';
import { DepthChartEditor } from '../../components/DepthChartEditor';
import { ErrorList } from '../../components/ErrorList';
import './match.css';

interface Props {
  team: Team;
  draft: DepthDraft;
  canEditNow: boolean;
  onAction: (a: DepthAction) => void;
  onReset: () => void;
}

/** Ajuste do depth chart entre drives (spec 5.4): rascunho enviado sozinho quando a janela abre. */
export function DepthPanel({ team, draft, canEditNow, onAction, onReset }: Props) {
  const dirty = isDepthDirty(draft, team);
  const errors = dirty ? depthDraftErrors(team, draft) : [];
  let status = 'Sem alterações pendentes.';
  if (dirty && errors.length > 0) status = 'Corrija o depth chart para que ele possa ser enviado.';
  else if (dirty && canEditNow) status = 'Enviando agora...';
  else if (dirty) status = 'Alterações pendentes: serão enviadas no início do seu próximo drive.';
  return (
    <section className="depth-panel stack">
      <div className="row">
        <strong>Depth chart</strong>
        <span className="muted">{status}</span>
        <button type="button" className="btn btn-small" disabled={!dirty} onClick={onReset}>
          Desfazer
        </button>
      </div>
      {errors.length > 0 && <ErrorList errors={errors} />}
      <DepthChartEditor roster={team.roster} depth={draft.depth} keepOnField={draft.keepOnField} onAction={onAction} />
    </section>
  );
}
```

`apps/client/src/screens/match/MatchScreen.tsx`:
```tsx
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { FormationId, PackageId, PlayerView, Team } from '@pfl/engine';
import { RECONNECT_GRACE_MS, type RoomState } from '@pfl/protocol';
import { applyDepthAction, type DepthAction } from '../../builder/depth';
import { canSubmitCard, panelMode, timerSeconds, type MatchClientState } from '../../match/matchState';
import { draftFromTeamDepth, shouldSendDepth, type DepthDraft } from '../../match/depthDraft';
import { FORMATION_LABELS } from '../../lib/names';
import { PhaserField } from '../../phaser/PhaserField';
import type { PlaySpec } from '../../phaser/FieldScene';
import { Hud } from './Hud';
import { NarrationLog } from './NarrationLog';
import { RevealBanner } from './RevealBanner';
import { FORMATION_OPTIONS, LineupPicker, PACKAGE_OPTIONS } from './LineupPicker';
import { CardHand } from './CardHand';
import { ConversionPicker } from './ConversionPicker';
import { DepthPanel } from './DepthPanel';
import './match.css';

interface Props {
  state: MatchClientState;
  room: RoomState;
  myTeam: Team | null;
  now: number;
  onFormation: (id: FormationId) => void;
  onPackage: (id: PackageId) => void;
  onCard: (cardId: string) => void;
  onConversion: (choice: 'PAT' | 'TWO') => void;
  onSendDepth: (draft: DepthDraft) => void;
}

function waitingText(view: PlayerView): string {
  switch (view.phase) {
    case 'FORMATION':
      return view.side === 'offense' ? 'Formação enviada. Aguardando a defesa...' : 'O ataque está escolhendo a formação...';
    case 'PACKAGE':
      return view.side === 'defense' ? 'Pacote enviado. Aguardando...' : 'A defesa está escolhendo o pacote...';
    case 'PLAYCALL':
      return view.opponentHasChosen ? 'Revelando as cartas...' : 'Carta escolhida. Aguardando o adversário...';
    case 'CONVERSION':
      return view.side === 'offense' ? 'Conversão enviada.' : 'O ataque está escolhendo a conversão...';
    case 'MATCH_END':
      return 'Fim de jogo!';
  }
}

/** Spec 6.2: HUD em cima, campo Phaser vertical, log lateral e painel que muda por etapa. */
export function MatchScreen({ state, room, myTeam, now, onFormation, onPackage, onCard, onConversion, onSendDepth }: Props) {
  const view = state.view;
  const mode = panelMode(state, now);
  const animating = mode === 'ANIMATING';
  const [depthOpen, setDepthOpen] = useState(false);
  const [draft, setDraft] = useState<DepthDraft | null>(() => (myTeam ? draftFromTeamDepth(myTeam) : null));
  const [lastSentTurn, setLastSentTurn] = useState<number | null>(null);

  useEffect(() => {
    if (myTeam && !draft) setDraft(draftFromTeamDepth(myTeam));
  }, [myTeam, draft]);

  useEffect(() => {
    if (view && draft && shouldSendDepth(view, myTeam, draft, lastSentTurn)) {
      setLastSentTurn(view.turnId);
      onSendDepth(draft);
    }
  }, [view, myTeam, draft, lastSentTurn, onSendDepth]);

  const play = useMemo<PlaySpec | null>(
    () => (state.animation ? { seq: state.animation.seq, stage: state.animation.stage, steps: state.animation.steps } : null),
    [state.animation],
  );

  if (!view) {
    return (
      <main className="screen screen-center">
        <div className="panel">Sincronizando a partida...</div>
      </main>
    );
  }

  const opponent = room.players.find((p) => p.key !== room.you);
  const paused = room.status === 'PAUSED' || opponent?.connected === false;
  const levels = view.fatigue[view.you] ?? {};
  const applyDepth = (a: DepthAction) => {
    if (!myTeam) return;
    setDraft((d) => applyDepthAction(d ?? draftFromTeamDepth(myTeam), myTeam.roster, a));
  };

  let panel: ReactNode;
  switch (mode) {
    case 'ANIMATING':
      panel = <p className="muted">Jogada em andamento...</p>;
      break;
    case 'PICK_FORMATION':
      panel = (
        <LineupPicker
          title="Escolha a formação"
          hint="A defesa verá quem está em campo e em quais vagas."
          options={FORMATION_OPTIONS}
          team={myTeam}
          levels={levels}
          onPick={onFormation}
        />
      );
      break;
    case 'PICK_PACKAGE':
      panel = (
        <LineupPicker
          title={`O ataque entrou em ${view.formation ? FORMATION_LABELS[view.formation] : '?'}. Escolha o pacote`}
          options={PACKAGE_OPTIONS}
          team={myTeam}
          levels={levels}
          onPick={onPackage}
        />
      );
      break;
    case 'PICK_CARD':
      panel = (
        <>
          <h3>Escolha sua carta ({view.side === 'offense' ? 'ataque' : 'defesa'})</h3>
          <CardHand view={view} canPick={(id) => canSubmitCard(state, id, now)} onPick={onCard} />
          <p className="muted">
            Adversário: {view.opponentHasChosen ? 'já escolheu' : 'escolhendo...'} · {view.opponentHandSize} cartas na mão
          </p>
        </>
      );
      break;
    case 'PICK_CONVERSION':
      panel = (
        <>
          <h3>Touchdown! Escolha a conversão</h3>
          <ConversionPicker onPick={onConversion} />
        </>
      );
      break;
    case 'WAIT_OPPONENT':
      panel = <p className="muted">{waitingText(view)}</p>;
      break;
    case 'ENDED':
      panel = <p>Fim de jogo!</p>;
      break;
    case 'WAITING':
      panel = <p className="muted">Aguardando o servidor...</p>;
      break;
  }

  return (
    <main className="match">
      <Hud view={view} names={state.names} seconds={animating ? null : timerSeconds(state, now)} />
      {paused && (
        <div className="notice match-notice">
          Adversário desconectado. Aguardando a reconexão (até {RECONNECT_GRACE_MS / 1000} s)...
        </div>
      )}
      <section className="match-field">
        <PhaserField stage={animating && state.animation ? state.animation.stage : state.stage} play={animating ? play : null} />
        {animating && <RevealBanner reveal={state.reveal} />}
      </section>
      <aside className="match-log panel">
        <NarrationLog lines={state.log} />
      </aside>
      <section className="match-panel panel">
        {panel}
        <div className="row match-tools">
          <button type="button" className="btn btn-small" disabled={!myTeam} onClick={() => setDepthOpen((o) => !o)}>
            {depthOpen ? 'Fechar depth chart' : 'Depth chart'}
          </button>
          {view.canEditDepth && <span className="ok-text">Janela de ajuste do depth chart aberta.</span>}
        </div>
        {depthOpen && myTeam && draft && (
          <DepthPanel
            team={myTeam}
            draft={draft}
            canEditNow={view.canEditDepth && view.phase === 'FORMATION'}
            onAction={applyDepth}
            onReset={() => setDraft(draftFromTeamDepth(myTeam))}
          />
        )}
      </section>
    </main>
  );
}
```

`apps/client/src/screens/match/match.css`:
```css
.match {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  grid-template-areas:
    'hud hud'
    'notice notice'
    'field log'
    'panel panel';
  gap: var(--space-3);
  padding: var(--space-3);
  max-width: 1280px;
  margin: 0 auto;
  align-content: start;
}

.hud {
  grid-area: hud;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  font-size: var(--fs-sm);
}

.hud-score {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  font-size: var(--fs-md);
}

.hud-team.has-ball { color: var(--gbc-red); }
.hud-team.is-you { text-decoration: underline; }

.hud-timer {
  min-width: 120px;
  text-align: right;
}

.hud-timer.is-urgent {
  color: var(--gbc-red);
  animation: blink 0.5s steps(2) infinite;
}

@keyframes blink {
  50% { opacity: 0.3; }
}

.match-notice { grid-area: notice; }

.match-field {
  grid-area: field;
  position: relative;
}

.match-log {
  grid-area: log;
  max-height: 600px;
  display: flex;
  flex-direction: column;
}

.match-panel {
  grid-area: panel;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.log {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}

.log-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  flex: 1;
  font-size: var(--fs-xs);
  line-height: 1.8;
}

.log-line { padding: 1px 0; }
.log-drive { color: var(--gbc-blue); margin-top: var(--space-2); }
.log-call { color: var(--gbc-muted); }
.log-effect { color: var(--gbc-orange); }
.log-score { color: var(--gbc-red); }
.log-system { color: var(--gbc-green-1); }

.reveal {
  position: absolute;
  top: var(--space-2);
  left: 50%;
  transform: translateX(-50%);
  width: min(340px, 95%);
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  background: var(--gbc-paper);
  border: var(--border);
  box-shadow: var(--shadow);
  font-size: var(--fs-xs);
  text-align: center;
}

.reveal-vs { color: var(--gbc-muted); }
.reveal-read { width: 100%; }
.reveal-symbol { font-size: var(--fs-lg); }
.reveal-right .reveal-read { color: var(--read-right); }
.reveal-neutral .reveal-read { color: var(--read-neutral); }
.reveal-wrong .reveal-read { color: var(--read-wrong); }

.picker {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: var(--space-2);
}

.picker-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-1);
  text-align: left;
  text-transform: none;
}

.picker-title {
  font-size: var(--fs-md);
  text-transform: uppercase;
}

.picker-slots { color: var(--gbc-muted); font-size: var(--fs-xs); }

.picker-lineup {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: var(--fs-xs);
  line-height: 1.6;
}

.hand {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding-top: 80px; /* espaço para o tooltip acima das cartas */
  margin-top: -80px;
}

.match-tools { margin-top: var(--space-2); }

.depth-panel {
  border-top: 3px solid var(--gbc-border);
  padding-top: var(--space-2);
}

@media (max-width: 900px) {
  .match {
    grid-template-columns: 1fr;
    grid-template-areas:
      'hud'
      'notice'
      'field'
      'panel'
      'log';
    padding: var(--space-2);
  }

  .match-log { max-height: 240px; }
  .hud { gap: var(--space-2); font-size: var(--fs-xs); }
}
```

- [ ] **Step 2: Verificar typecheck e build**

Run: `npm run typecheck && npm run build:client`
Expected: sem erros. A tela é exercitada pelos itens P9–P17 do checklist da Task 19.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/screens/match
git commit -m "feat(client): tela de partida com HUD, campo, painel por etapa, log e depth chart"
```

---

### Task 17: Tela de Fim de jogo com estatísticas e replay

**Files:**
- Create: `apps/client/src/screens/end/StatsTable.tsx`, `apps/client/src/screens/end/ReplayViewer.tsx`, `apps/client/src/screens/end/EndScreen.tsx`, `apps/client/src/screens/end/end.css`

**Interfaces:**
- Consumes: `EndMessage`, `MatchStats`, `ReplayData`, `RESULT_ANIMATION_MS`, `computeStats` (`@pfl/protocol`); `TeamKey` (`@pfl/engine`); `buildReplay` (Task 11); `PhaserField`, `PlaySpec` (Task 12); `Sprite` (Task 13); `speciesName` (Task 3).
- Produces:
  - `EndScreen({ end: EndMessage; you: TeamKey; onLeave: () => void })`
  - `StatsTable({ stats: MatchStats; names: Record<TeamKey, string> })`
  - `ReplayViewer({ data: ReplayData; score: Record<TeamKey, number> })`

- [ ] **Step 1: Criar as telas**

`apps/client/src/screens/end/StatsTable.tsx`:
```tsx
import type { TeamKey } from '@pfl/engine';
import type { MatchStats } from '@pfl/protocol';
import { speciesName } from '../../lib/names';
import { Sprite } from '../../components/Sprite';
import './end.css';

const KEYS: TeamKey[] = ['A', 'B'];

/** Estatísticas por Pokémon vindas de EndMessage.stats (spec 6.1, item 5). */
export function StatsTable({ stats, names }: { stats: MatchStats; names: Record<TeamKey, string> }) {
  return (
    <div className="stats-grid">
      {KEYS.map((team) => {
        const rows = stats.pokemon
          .filter((p) => p.team === team)
          .sort((a, b) => b.plays - a.plays || b.yards - a.yards);
        return (
          <section key={team} className="panel">
            <h2 className="panel-title">{names[team]}</h2>
            <p className="muted">
              Jardas {stats.yards[team]} · Turnovers {stats.turnovers[team]} · Sacks {stats.sacks[team]}
            </p>
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Pokémon</th>
                  <th>Jogadas</th>
                  <th>Jardas</th>
                  <th>TD</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.speciesId}>
                    <td>
                      <Sprite id={r.speciesId} size={24} /> {speciesName(r.speciesId)}
                    </td>
                    <td>{r.plays}</td>
                    <td>{r.yards}</td>
                    <td>{r.touchdowns}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      Sem estatísticas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
```

`apps/client/src/screens/end/ReplayViewer.tsx`:
```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TeamKey } from '@pfl/engine';
import { RESULT_ANIMATION_MS, computeStats, type ReplayData } from '@pfl/protocol';
import { buildReplay } from '../../match/replayFrames';
import { PhaserField } from '../../phaser/PhaserField';
import type { PlaySpec } from '../../phaser/FieldScene';
import '../match/match.css';
import './end.css';

interface Props {
  data: ReplayData;
  score: Record<TeamKey, number>;
}

/** Replay jogada a jogada, reproduzido pelo engine a partir de seed + ações (spec 6.1, item 5). */
export function ReplayViewer({ data, score }: Props) {
  const build = useMemo(() => buildReplay(data, score), [data, score]);
  const frames = useMemo(() => (build.ok ? build.frames : []), [build]);
  const last = frames.length - 1;
  const [index, setIndex] = useState(0);
  const [nonce, setNonce] = useState(1);
  const [auto, setAuto] = useState(false);

  const go = useCallback(
    (i: number) => {
      setIndex(Math.max(0, Math.min(last, i)));
      setNonce((n) => n + 1);
    },
    [last],
  );

  useEffect(() => {
    if (!auto) return;
    if (index >= last) {
      setAuto(false);
      return;
    }
    const id = window.setTimeout(() => go(index + 1), RESULT_ANIMATION_MS);
    return () => window.clearTimeout(id);
  }, [auto, index, last, go]);

  const frame = frames[index] ?? null;
  const play = useMemo<PlaySpec | null>(() => (frame ? { seq: nonce, stage: frame.stage, steps: frame.steps } : null), [frame, nonce]);
  const partial = useMemo(() => computeStats(frames.slice(0, index + 1).flatMap((f) => f.events)), [frames, index]);

  if (!build.ok) {
    return (
      <section className="panel">
        <h2 className="panel-title">Replay</h2>
        <p className="error-text">{build.message}</p>
      </section>
    );
  }
  if (!frame) {
    return (
      <section className="panel">
        <p className="muted">Replay vazio.</p>
      </section>
    );
  }

  return (
    <section className="panel replay">
      <h2 className="panel-title">Replay</h2>
      <div className="replay-layout">
        <PhaserField stage={frame.stage} play={play} />
        <div className="stack">
          <div className="row">
            <button type="button" className="btn btn-small" aria-label="Primeira jogada" disabled={index === 0} onClick={() => go(0)}>
              ⏮
            </button>
            <button type="button" className="btn btn-small" aria-label="Jogada anterior" disabled={index === 0} onClick={() => go(index - 1)}>
              ◀
            </button>
            <span>
              Jogada {index + 1}/{frames.length}
            </span>
            <button type="button" className="btn btn-small" aria-label="Próxima jogada" disabled={index === last} onClick={() => go(index + 1)}>
              ▶
            </button>
            <button type="button" className="btn btn-small" aria-label="Última jogada" disabled={index === last} onClick={() => go(last)}>
              ⏭
            </button>
            <button type="button" className="btn btn-small" onClick={() => setAuto((a) => !a)}>
              {auto ? 'Pausar' : 'Reproduzir'}
            </button>
            <button type="button" className="btn btn-small" onClick={() => go(index)}>
              Repetir
            </button>
          </div>
          <ol className="log-list replay-lines">
            {frame.lines.map((line, i) => (
              <li key={i} className={`log-line log-${line.kind}`}>
                {line.text}
              </li>
            ))}
          </ol>
          <p className="muted">
            Até aqui: {data.teams.A.name} {partial.yards.A} jardas · {data.teams.B.name} {partial.yards.B} jardas
          </p>
        </div>
      </div>
    </section>
  );
}
```

`apps/client/src/screens/end/EndScreen.tsx`:
```tsx
import type { TeamKey } from '@pfl/engine';
import type { EndMessage } from '@pfl/protocol';
import { StatsTable } from './StatsTable';
import { ReplayViewer } from './ReplayViewer';
import './end.css';

interface Props {
  end: EndMessage;
  you: TeamKey;
  onLeave: () => void;
}

export function EndScreen({ end, you, onLeave }: Props) {
  const names = { A: end.replay.teams.A.name, B: end.replay.teams.B.name };
  const opponent: TeamKey = you === 'A' ? 'B' : 'A';
  const result = end.score[you] > end.score[opponent] ? 'Vitória!' : end.score[you] < end.score[opponent] ? 'Derrota...' : 'Empate';
  return (
    <main className="screen end">
      <section className="panel end-score">
        <p className="end-result">{result}</p>
        <p className="end-line">
          <span>{names.A}</span>
          <strong>{end.score.A}</strong>
          <span>×</span>
          <strong>{end.score.B}</strong>
          <span>{names.B}</span>
        </p>
        <button type="button" className="btn btn-primary" onClick={onLeave}>
          Voltar ao início
        </button>
      </section>
      <StatsTable stats={end.stats} names={names} />
      <ReplayViewer data={end.replay} score={end.score} />
    </main>
  );
}
```

`apps/client/src/screens/end/end.css`:
```css
.end-score {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  text-align: center;
}

.end-result {
  font-size: var(--fs-xl);
  color: var(--gbc-red);
  margin: 0;
}

.end-line {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--fs-md);
  margin: 0;
}

.end-line strong { font-size: var(--fs-xl); }

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}

.stats-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-xs);
}

.stats-table th,
.stats-table td {
  padding: var(--space-1);
  border-bottom: 2px solid var(--gbc-panel);
  text-align: right;
}

.stats-table th:first-child,
.stats-table td:first-child { text-align: left; }

.replay-layout {
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  gap: var(--space-4);
  align-items: start;
}

.replay-lines {
  max-height: 360px;
  border: 3px solid var(--gbc-panel);
  padding: var(--space-2);
}

@media (max-width: 900px) {
  .stats-grid,
  .replay-layout {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 2: Verificar typecheck e build**

Run: `npm run typecheck && npm run build:client`
Expected: sem erros. A tela é exercitada pelo item P18 do checklist da Task 19.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/screens/end
git commit -m "feat(client): tela de fim de jogo com estatísticas por Pokémon e replay"
```

---

### Task 18: App: roteamento de telas, socket, sessão e envio de ações

**Files:**
- Create: `apps/client/src/app/screen.ts`, `apps/client/src/app/useNow.ts`
- Modify: `apps/client/src/App.tsx` (substitui a versão da Task 1)
- Test: `apps/client/test/app-screen.test.ts`

**Interfaces:**
- Consumes:
  - `@pfl/protocol`: `encodeTeam`; tipos `RoomState`, `RoomStatus`, `PhaseMessage`, `RevealMessage`, `ResultMessage`, `EndMessage`, `ErrorMessage`.
  - Task 7: `createSocket`, `createRoom`, `joinRoom`, `Joined`, `PflSocket`, `loadSession`, `saveSession`, `clearSession`, `Session`, `errorReaction`, `describeFailure`.
  - Task 3: `getSessionStorage`, `memoryStorage`.
  - Task 10: `matchReducer`, `initialMatchState`, `panelMode`, `canSubmitCard`, `needsResync`, `isAnimating`, `MatchClientState`, `resolvePendingDepth`, `DepthDraft`, `PendingDepth`.
  - Tasks 4 e 6: `importTeamCode`, `draftToTeam`.
  - Telas das Tasks 14–17.
- Produces:
  - `type LocalScreen = 'HOME' | 'BUILDER'`, `type Screen = LocalScreen | 'LOBBY' | 'MATCH' | 'END'`
  - `screenFor(input: { local: LocalScreen; room: RoomState | null; match: MatchClientState; now: number }): Screen`
  - `namesFromRoom(room: RoomState): Record<TeamKey, string>`
  - `useNow(intervalMs: number | null): number`
  - `App()`

- [ ] **Step 1: Escrever o teste (deve falhar)**

`apps/client/test/app-screen.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { EndMessage, RoomPlayer, RoomState, RoomStatus } from '@pfl/protocol';
import { namesFromRoom, screenFor } from '../src/app/screen';
import { initialMatchState, matchReducer, type MatchClientState } from '../src/match/matchState';
import { makeView, testTeam } from './fixtures';

const player = (key: 'A' | 'B', teamName: string | null): RoomPlayer => ({ key, connected: true, ready: false, teamName, teamErrors: [] });
const room = (status: RoomStatus, players: RoomPlayer[] = []): RoomState => ({ code: 'ABCDEF', you: 'A', status, players });
const end: EndMessage = {
  score: { A: 3, B: 0 },
  stats: { pokemon: [], yards: { A: 0, B: 0 }, turnovers: { A: 0, B: 0 }, sacks: { A: 0, B: 0 } },
  replay: { seed: 1, teams: { A: testTeam(), B: testTeam() }, actions: [] },
};
const T0 = 5_000;
const withView: MatchClientState = matchReducer(initialMatchState(), {
  type: 'PHASE', msg: { turnId: 1, phase: 'FORMATION', deadline: T0, view: makeView() },
});
const animatingEnd: MatchClientState = matchReducer(
  matchReducer(withView, {
    type: 'RESULT', now: T0,
    msg: { turnId: 1, view: makeView({ turnId: 2 }), events: [{ t: 'FIELD_GOAL', distance: 30, good: true }] },
  }),
  { type: 'END', msg: end },
);

describe('screenFor', () => {
  const base = { local: 'HOME' as const, room: null, match: initialMatchState(), now: T0 };

  it('sem sala, mostra a tela local', () => {
    expect(screenFor(base)).toBe('HOME');
    expect(screenFor({ ...base, local: 'BUILDER' })).toBe('BUILDER');
  });

  it('sala esperando é lobby; em partida ou pausada é partida', () => {
    expect(screenFor({ ...base, room: room('WAITING') })).toBe('LOBBY');
    expect(screenFor({ ...base, room: room('IN_MATCH') })).toBe('MATCH');
    expect(screenFor({ ...base, room: room('PAUSED') })).toBe('MATCH');
  });

  it('a primeira fase pode chegar antes do room:state com IN_MATCH', () => {
    expect(screenFor({ ...base, room: room('WAITING'), match: withView })).toBe('MATCH');
  });

  it('o fim só aparece depois da animação final', () => {
    expect(screenFor({ ...base, room: room('FINISHED'), match: animatingEnd, now: T0 + 1 })).toBe('MATCH');
    expect(screenFor({ ...base, room: room('FINISHED'), match: animatingEnd, now: animatingEnd.animation!.endsAt })).toBe('END');
    expect(screenFor({ ...base, room: null, match: animatingEnd, now: animatingEnd.animation!.endsAt })).toBe('END');
  });
});

describe('namesFromRoom', () => {
  it('usa o nome do time ou um padrão', () => {
    expect(namesFromRoom(room('WAITING', [player('A', 'Trovões')]))).toEqual({ A: 'Trovões', B: 'Time B' });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/app-screen.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 3: Implementar `screen.ts` e `useNow.ts`**

`apps/client/src/app/screen.ts`:
```ts
import type { TeamKey } from '@pfl/engine';
import type { RoomState } from '@pfl/protocol';
import { isAnimating, type MatchClientState } from '../match/matchState';

export type LocalScreen = 'HOME' | 'BUILDER';
export type Screen = LocalScreen | 'LOBBY' | 'MATCH' | 'END';

interface ScreenInput {
  local: LocalScreen;
  room: RoomState | null;
  match: MatchClientState;
  now: number;
}

/** Decide a tela a partir do estado do servidor; a animação final termina antes da tela de fim. */
export function screenFor({ local, room, match, now }: ScreenInput): Screen {
  if (match.end) return isAnimating(match, now) ? 'MATCH' : 'END';
  if (room && (room.status === 'IN_MATCH' || room.status === 'PAUSED' || match.view !== null)) return 'MATCH';
  if (room) return 'LOBBY';
  return local;
}

export function namesFromRoom(room: RoomState): Record<TeamKey, string> {
  const name = (key: TeamKey) => room.players.find((p) => p.key === key)?.teamName ?? `Time ${key}`;
  return { A: name('A'), B: name('B') };
}
```

`apps/client/src/app/useNow.ts`:
```ts
import { useEffect, useState } from 'react';

/** Relógio para timers e para saber quando a animação acabou; null pausa. */
export function useNow(intervalMs: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (intervalMs === null) return;
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
```

- [ ] **Step 4: Rodar o teste**

Run: `npx vitest run apps/client/test/app-screen.test.ts`
Expected: PASS.

- [ ] **Step 5: Substituir o `App.tsx`**

`apps/client/src/App.tsx`:
```tsx
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { FormationId, PackageId, Team } from '@pfl/engine';
import {
  encodeTeam,
  type EndMessage,
  type ErrorMessage,
  type PhaseMessage,
  type ResultMessage,
  type RevealMessage,
  type RoomState,
} from '@pfl/protocol';
import { createRoom, createSocket, joinRoom, type Joined, type PflSocket } from './net/socket';
import { clearSession, describeFailure, errorReaction, loadSession, saveSession, type Session } from './net/session';
import { getSessionStorage, memoryStorage } from './lib/storage';
import { canSubmitCard, initialMatchState, matchReducer, needsResync, panelMode } from './match/matchState';
import { resolvePendingDepth, type DepthDraft, type PendingDepth } from './match/depthDraft';
import { importTeamCode } from './builder/teamStore';
import { draftToTeam } from './builder/draft';
import { namesFromRoom, screenFor, type LocalScreen } from './app/screen';
import { useNow } from './app/useNow';
import { HomeScreen } from './screens/HomeScreen';
import { BuilderScreen } from './screens/builder/BuilderScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { MatchScreen } from './screens/match/MatchScreen';
import { EndScreen } from './screens/end/EndScreen';

function teamFromCode(code: string | null): Team | null {
  if (!code) return null;
  const result = importTeamCode(code);
  return result.ok ? draftToTeam(result.draft) : null;
}

export function App() {
  // useRef com guarda (e não useMemo): no StrictMode o useMemo roda duas vezes e o socket descartado já teria conectado.
  const socketRef = useRef<PflSocket | null>(null);
  if (socketRef.current === null) socketRef.current = createSocket();
  const socket = socketRef.current;
  const storage = useMemo(() => getSessionStorage() ?? memoryStorage(), []);
  const sessionRef = useRef<Session | null>(null);
  const sessionLoaded = useRef(false);
  if (!sessionLoaded.current) {
    sessionLoaded.current = true;
    sessionRef.current = loadSession(storage);
  }

  const [local, setLocal] = useState<LocalScreen>('HOME');
  const [room, setRoom] = useState<RoomState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [myTeam, setMyTeam] = useState<Team | null>(() => teamFromCode(sessionRef.current?.teamCode ?? null));
  const [match, dispatch] = useReducer(matchReducer, undefined, initialMatchState);
  const matchRef = useRef(match);
  matchRef.current = match;
  const pendingDepth = useRef<PendingDepth | null>(null);
  const resyncAsked = useRef(false);
  const now = useNow(room ? 200 : null);

  const updateSession = useCallback(
    (s: Session | null) => {
      sessionRef.current = s;
      if (s) saveSession(storage, s);
      else clearSession(storage);
    },
    [storage],
  );

  const leave = useCallback(() => {
    updateSession(null);
    setRoom(null);
    setMyTeam(null);
    dispatch({ type: 'RESET' });
    pendingDepth.current = null;
    resyncAsked.current = false;
    setLocal('HOME');
    socket.disconnect();
    socket.connect();
  }, [socket, updateSession]);

  const onJoined = useCallback(
    (j: Joined) => {
      const prev = sessionRef.current;
      updateSession({ code: j.code, token: j.token, you: j.you, teamCode: prev && prev.code === j.code ? prev.teamCode : null });
    },
    [updateSession],
  );

  // Eventos do servidor. Ao (re)conectar com sessão salva, volta para a mesma vaga com o token.
  useEffect(() => {
    const rejoin = () => {
      const s = sessionRef.current;
      if (!s) return;
      joinRoom(socket, s.code, s.token)
        .then((j) => {
          onJoined(j);
          const m = matchRef.current;
          if (m.view && !m.end) socket.emit('match:resync'); // reconexão no meio da partida: estado atual
        })
        .catch((err: unknown) => {
          updateSession(null);
          setRoom(null);
          dispatch({ type: 'RESET' });
          setNotice(`Não foi possível voltar à sala ${s.code}: ${describeFailure(err)}`);
        });
    };
    const onRoom = (s: RoomState) => {
      setRoom(s);
      dispatch({ type: 'NAMES', names: namesFromRoom(s) });
    };
    const onPhase = (m: PhaseMessage) => {
      const pending = pendingDepth.current;
      if (pending && resolvePendingDepth(pending, m) === 'commit') {
        pendingDepth.current = null;
        setMyTeam((t) => (t ? { ...t, depth: pending.draft.depth, keepOnField: pending.draft.keepOnField } : t));
      }
      dispatch({ type: 'PHASE', msg: m });
    };
    const onReveal = (m: RevealMessage) => dispatch({ type: 'REVEAL', msg: m });
    const onResult = (m: ResultMessage) => dispatch({ type: 'RESULT', msg: m, now: Date.now() });
    const onEnd = (m: EndMessage) => {
      dispatch({ type: 'END', msg: m });
      updateSession(null); // a partida acabou: recarregar a aba não deve tentar voltar a ela
    };
    const onError = (e: ErrorMessage) => {
      // Qualquer erro (ENGINE_ERROR, STALE_TURN...) pode ser a recusa do team:depth, que não tem ack: descarta o pendente.
      // O rascunho continua "sujo" e é reenviado na próxima janela.
      pendingDepth.current = null;
      const reaction = errorReaction(e);
      dispatch({ type: 'ERROR', error: e });
      if (reaction.notice) setNotice(reaction.notice);
      if (reaction.resync) socket.emit('match:resync');
      if (reaction.leaveRoom) leave();
    };

    socket.on('connect', rejoin);
    socket.on('room:state', onRoom);
    socket.on('match:phase', onPhase);
    socket.on('match:reveal', onReveal);
    socket.on('match:result', onResult);
    socket.on('match:end', onEnd);
    socket.on('error', onError);
    if (socket.connected) rejoin();
    return () => {
      socket.off('connect', rejoin);
      socket.off('room:state', onRoom);
      socket.off('match:phase', onPhase);
      socket.off('match:reveal', onReveal);
      socket.off('match:result', onResult);
      socket.off('match:end', onEnd);
      socket.off('error', onError);
    };
  }, [socket, onJoined, updateSession, leave]);

  // Aba recarregada no meio da partida: um único match:resync até chegar a primeira view.
  useEffect(() => {
    if (!room) return;
    if (!needsResync(room.status, match)) {
      if (match.view) resyncAsked.current = false;
      return;
    }
    if (resyncAsked.current) return;
    resyncAsked.current = true;
    socket.emit('match:resync');
  }, [room, match, socket]);

  // O time enviado vai junto com a sessão da aba, para a prévia de escalação e o depth sobreviverem ao F5.
  useEffect(() => {
    const s = sessionRef.current;
    if (s && myTeam) updateSession({ ...s, teamCode: encodeTeam(myTeam) });
  }, [myTeam, updateSession]);

  const enterRoom = (action: Promise<Joined>) => {
    setBusy(true);
    setNotice(null);
    action
      .then((j) => {
        setMyTeam(null);
        dispatch({ type: 'RESET' });
        onJoined(j);
      })
      .catch((err: unknown) => setNotice(describeFailure(err)))
      .finally(() => setBusy(false));
  };

  const submitTeam = (team: Team) => {
    socket.emit('team:submit', { teamCode: encodeTeam(team) });
    setMyTeam(team);
  };

  const sendFormation = (formation: FormationId) => {
    const m = matchRef.current;
    if (!m.view || panelMode(m, Date.now()) !== 'PICK_FORMATION') return;
    socket.emit('play:formation', { turnId: m.view.turnId, formation });
    dispatch({ type: 'SENT', turnId: m.view.turnId, phase: 'FORMATION' });
  };

  const sendPackage = (pkg: PackageId) => {
    const m = matchRef.current;
    if (!m.view || panelMode(m, Date.now()) !== 'PICK_PACKAGE') return;
    socket.emit('play:package', { turnId: m.view.turnId, package: pkg });
    dispatch({ type: 'SENT', turnId: m.view.turnId, phase: 'PACKAGE' });
  };

  const sendCard = (cardId: string) => {
    const m = matchRef.current;
    if (!m.view || !canSubmitCard(m, cardId, Date.now())) return;
    socket.emit('play:card', { turnId: m.view.turnId, cardId });
    dispatch({ type: 'SENT', turnId: m.view.turnId, phase: 'PLAYCALL' });
  };

  const sendConversion = (choice: 'PAT' | 'TWO') => {
    const m = matchRef.current;
    if (!m.view || panelMode(m, Date.now()) !== 'PICK_CONVERSION') return;
    socket.emit('play:conversion', { turnId: m.view.turnId, choice });
    dispatch({ type: 'SENT', turnId: m.view.turnId, phase: 'CONVERSION' });
  };

  const sendDepth = useCallback(
    (draft: DepthDraft) => {
      const m = matchRef.current;
      if (!m.view) return;
      socket.emit('team:depth', { turnId: m.view.turnId, depth: draft.depth, keepOnField: draft.keepOnField });
      pendingDepth.current = { turnId: m.view.turnId, draft };
    },
    [socket],
  );

  const screen = screenFor({ local, room, match, now: room ? now : Date.now() });

  return (
    <>
      {notice && (
        <div className="notice notice-top" role="status">
          <span>{notice}</span>
          <button type="button" className="btn btn-small" onClick={() => setNotice(null)}>
            OK
          </button>
        </div>
      )}
      {screen === 'HOME' && (
        <HomeScreen
          busy={busy}
          onCreate={() => enterRoom(createRoom(socket))}
          onJoin={(code) => enterRoom(joinRoom(socket, code))}
          onBuilder={() => setLocal('BUILDER')}
        />
      )}
      {screen === 'BUILDER' && <BuilderScreen onBack={() => setLocal('HOME')} />}
      {screen === 'LOBBY' && room && (
        <LobbyScreen
          room={room}
          myTeam={myTeam}
          onSubmitTeam={submitTeam}
          onReady={(ready) => socket.emit('room:ready', { ready })}
          onLeave={leave}
        />
      )}
      {screen === 'MATCH' && room && (
        <MatchScreen
          state={match}
          room={room}
          myTeam={myTeam}
          now={now}
          onFormation={sendFormation}
          onPackage={sendPackage}
          onCard={sendCard}
          onConversion={sendConversion}
          onSendDepth={sendDepth}
        />
      )}
      {screen === 'END' && match.end && <EndScreen end={match.end} you={room?.you ?? 'A'} onLeave={leave} />}
    </>
  );
}
```

- [ ] **Step 6: Rodar tudo e fazer o build**

Run: `npm test && npm run typecheck && npm run build:client`
Expected: todos os testes PASS (engine, server, protocol e client), typecheck sem erros e build do Vite gerando `apps/client/dist`. O aviso de chunk acima de 500 kB fica silenciado pelo `chunkSizeWarningLimit`.

- [ ] **Step 7: Commit**

```bash
git add apps/client/src/App.tsx apps/client/src/app apps/client/test/app-screen.test.ts
git commit -m "feat(client): app com roteamento de telas, sessão por aba e envio de ações com turnId"
```

---

### Task 19: Playtest manual completo (duas abas contra o servidor do Plano 3)

**Files:**
- Nenhum arquivo novo. Se o playtest revelar bugs, corrija na task dona: escreva primeiro um teste que falha quando a lógica for pura e faça um commit por correção.

**Interfaces:**
- Consumes: o cliente completo (Tasks 1–18) e o servidor do Plano 3 (`npm run dev:server`, porta 3001).
- Produces: o checklist P1–P20 aprovado, registrado na descrição do PR ou da entrega.

- [ ] **Step 1: Subir servidor e cliente**

Run (terminal 1): `npm run dev:server`
Expected: servidor ouvindo em `http://localhost:3001`.

Run (terminal 2): `npm run dev:client`
Expected: `sprites: 0 baixados, 302 já existiam, 0 falharam`, seguido do Vite em `http://localhost:5173`.

Abra **duas abas** do mesmo navegador em `http://localhost:5173`: aba 1 = Jogador A, aba 2 = Jogador B. O `sessionStorage` é por aba, então cada aba é um jogador; o `localStorage` (times salvos) é compartilhado.

- [ ] **Step 2: Executar o checklist**

| # | Passos | Resultado esperado |
|---|---|---|
| P1 | Aba 1: abrir o Início. | "PFL" vermelho com sombra na fonte pixel, Pikachu de costas × Jolteon de frente, botões Criar sala, Entrar e Montar time sobre fundo verde GBC. |
| P2 | Digitar `abc` e clicar Entrar. Depois `ZZZZZZ` + Entrar. | Primeiro: "O código tem 6 letras (sem I e O).", sem chamada ao servidor. Depois: aviso "Sala não encontrada. Confira o código." e o jogador continua no Início. |
| P3 | Aba 1: Criar sala. Aba 2: digitar o código em minúsculas, com espaço no meio, e Entrar. | Aba 1 mostra o lobby com o código de 6 letras. Aba 2 entra na mesma sala. As duas veem Jogador A e B "● conectado". |
| P4 | Aba 1 (antes de criar a sala, ou numa terceira aba): Montar time. Filtrar tipo Elétrico, custo até 4, posição WR com ★★★★★ e buscar "mr". | A Pokédex lista 151 no início. Cada filtro reduz a lista coerentemente, as estrelas aparecem com a posição escolhida e "mr" mostra Mr. Mime. |
| P5 | Adicionar 16 Pokémon e um Kicker; incluir 2 lendários; passar do teto. | O contador vai a 16/16 e "+ Elenco" desabilita. A barra fica vermelha acima de 120. A lista de pendências mostra "No máximo 1 lendário" e "Custo X acima do teto de 120". Remover resolve. |
| P6 | Aba Depth chart: "Preencher automaticamente", mover ▲/▼, remover ✕, marcar "manter em campo". Aba Deck: passar o mouse e clicar nas cartas. | Todas as vagas se preenchem, com o titular em vermelho. Na aba Deck só aparecem cartas liberadas pelo elenco. O tooltip mostra requisitos, perfil e leitura ✔/✖. A 3ª cópia e a 13ª carta ficam desabilitadas. Com 12+12, as pendências chegam a "Time válido". |
| P7 | Salvar; recarregar a página; abrir "Times salvos". Aba Código: Copiar; Novo; colar e Importar. Colar o código com 10 caracteres apagados no meio e Importar. | O time salvo volta após o F5. O import restaura o time idêntico. O código corrompido mostra "Código inválido..." ou "O código não contém um time." sem quebrar a tela. **Storage bloqueado:** no Firefox, com `dom.storage.enabled = false` em `about:config`, o montador abre com o aviso "Este navegador não permite salvar times..." e o Salvar avisa que não salvou. |
| P8 | Lobby nas duas abas: escolher um time (aba 1 salvo, aba 2 sugerido), Enviar time e Estou pronto. | O nome do time aparece no card do jogador nas duas abas. "Estou pronto" só habilita sem erros de validação. Quando os dois ficam prontos, as duas abas vão para a Partida. |
| P9 | Etapa de formação (aba de quem ataca). | O HUD mostra placar, "Posse 1/6", "1st & 10", "Bola na OWN 25" e "Formação 5s" em contagem regressiva, piscando em ≤3 s. São 4 botões, cada um com a lista vaga → Pokémon. A outra aba vê "O ataque está escolhendo a formação...". O campo mostra a linha azul e a linha amarela do first down. |
| P10 | Escolher Pistol. A defesa escolhe Nickel. | Os sprites de costas do ataque aparecem abaixo da linha, e a defesa vê a formação antes de escolher o pacote. Depois aparecem os sprites de frente da defesa acima da linha. O log mostra "X entra em formação Pistol." e "Y responde com o pacote Nickel.". |
| P11 | Etapa de carta nas duas abas: passar o mouse numa carta acinzentada e clicar; depois clicar numa jogável e clicar de novo. | A mão (até 5) aparece mais as básicas. Cartas cujos requisitos não estão em campo ficam cinza e não fazem nada ao clicar. Depois do primeiro clique o painel diz "Carta escolhida...". O segundo clique não envia nada (aba Network/WS: um único `play:card`). A outra aba mostra "Adversário: já escolheu". |
| P12 | Resolução. | As duas abas mostram o banner com as duas cartas e ✔/·/✖ colorido. A animação segue snap → bloqueio (passes) → confronto com "É super efetivo!" quando houver → corrida/passe → tackle ou banner. O log mostra "Jolteon usou ...!" no estilo Gen 1. O painel da próxima formação só aparece quando a animação termina, e o campo rola para a nova posição da bola. |
| P13 | Não escolher nada até o timer zerar: na formação, no pacote e na carta; depois forçar um 4º down sem escolher. | O servidor aplica os padrões: Pistol, Base, Corrida Básica/Defesa Base e Punt no 4º down (com a animação do chute e o banner "TROCA DE POSSE!" quando houver). |
| P14 | No meio da partida, F5 na aba 2. | A aba volta direto para a Partida (não para o Início), do mesmo lado, e um único `match:resync` aparece no WS. O painel correto aparece no próximo `match:phase`. O log recomeça sem linhas duplicadas. A prévia de escalação continua com os nomes (o time veio do `sessionStorage`). |
| P15 | Abrir "Depth chart" durante o drive do adversário, trocar a ordem do QB e esperar o próximo drive. Depois esvaziar a vaga TE. | O status passa de "Alterações pendentes: serão enviadas no início do seu próximo drive." para "Sem alterações pendentes." depois do primeiro snap do drive. A prévia da formação já mostra o novo QB. Com o TE vazio aparece "O depth chart não preenche a formação Pesada." e nada é enviado. |
| P16 | Jogar vários snaps seguidos com o mesmo RB. | A barra de fadiga aparece sobre o sprite e passa de verde a amarela a vermelha. Ao atingir o limiar, a escalação revelada traz o reserva do depth chart. |
| P17 | Marcar um touchdown. | Aparece o banner "TOUCHDOWN!" e o log "TOUCHDOWN de ...!". O atacante vê os botões PAT e Conversão de 2; a defesa vê "O ataque está escolhendo a conversão...". O placar muda no HUD. |
| P18 | Jogar até o fim (6 posses cada; prorrogação se empatar). | A animação da última jogada termina e só então aparece a tela de Fim: Vitória/Derrota, placar, tabelas por Pokémon (jogadas, jardas, TD) e totais. No Replay, ◀ ▶ ⏮ ⏭, Repetir e Reproduzir animam as jogadas no campo, com narração e "Até aqui: ... jardas" atualizando. "Voltar ao início" leva ao Início. |
| P19 | Durante a partida, DevTools da aba 2 → Network → Offline por 10 s → Online. | A aba 1 mostra "Adversário desconectado. Aguardando a reconexão (até 60 s)...". Quando a aba 2 volta, ela reentra na vaga com o token, pede resync e a partida segue nas duas abas. |
| P20 | DevTools → modo dispositivo 375×812, percorrendo Início, Montar time, Lobby, Partida e Fim. | Tudo cabe sem rolagem horizontal: o campo escala, os painéis empilham e o log fica abaixo do painel. O polimento mobile fica fora do escopo. |

- [ ] **Step 3: Verificação final**

Run: `npm test && npm run typecheck && npm run build:client`
Expected: tudo PASS e build sem erros.

Run: `grep -rn "pokeapi.co" apps/client/src || echo "ok: sem chamadas à PokéAPI em runtime"`
Expected: `ok: sem chamadas à PokéAPI em runtime`.

- [ ] **Step 4: Commit (somente se houve correções)**

```bash
git status --short
git commit -am "fix(client): ajustes do playtest manual"
```

---

## Self-Review (feito na escrita do plano)

**1. Cobertura da spec (seção 6 e relacionadas):**

| Requisito | Task |
|---|---|
| 6.1 estilo: fonte bitmap, paleta GBC, React pixel art | 1 (tokens, Press Start 2P), 13–17 (CSS) |
| 6.1.1 Início: criar sala (6 letras) / entrar com código | 7 (`normalizeRoomCode`, `createRoom`/`joinRoom`), 15, 18 |
| 6.1.2 Pokédex 151 com filtros tipo/custo/aptidão | 5 (`filterPokedex`), 14 (`Pokedex`) |
| 6.1.2 barra do teto | 5 (`capInfo`), 14 (`CapBar`) |
| 6.1.2 depth chart por vaga (+ manter em campo) | 4 (`applyDepthAction`, `autoDepth`), 13 (`DepthChartEditor`) |
| 6.1.2 deck com cartas liberadas pelo elenco | 4 (`isDeckCard`), 5 (`eligibleCards`), 14 (`DeckEditor`) |
| 6.1.2 exportar/importar código | 6 (`importTeamCode`/`exportTeamCode` sobre `encodeTeam`/`decodeTeam`), 14 |
| 6.1.2 time sugerido | 14 (`SuggestedTeams` com `SUGGESTED_TEAMS`), 15 (opção no lobby) |
| 5.5 localStorage (com try/catch) | 3 (`storage.ts`), 6 (`loadTeams`/`saveTeams`) |
| 6.1.3 Lobby: escolher time, pronto, erros de `room:state` | 15, 18 |
| 6.1.4 / 6.2 HUD (placar, posse, down & distance, bola, timer) | 3 (`format.ts`), 10 (`timerSeconds`), 16 (`Hud`) |
| 6.2 campo Phaser vertical, back/front, fadiga | 12 |
| 6.2 animação dirigida pelos eventos | 9 (`buildTimeline`), 12 (`FieldScene.runStep`) |
| 6.2 painel por etapa: formação/pacote com lista de quem entra | 10 (`panelMode`, `previewLineup`), 16 (`LineupPicker`) |
| 6.2 mão + básicas, acinzentadas via `view.playable`, tooltip | 5 (`cardInfo`), 10 (`handEntries`, `canSubmitCard`), 13 (`CardTile`), 16 (`CardHand`) |
| 6.2 log Gen 1 ("usou ...! É super efetivo!") | 8 |
| 6.2 revelação com ✔/·/✖ | 10 (`CardReveal`), 16 (`RevealBanner`) |
| 2.4 loop de etapas e 2.5 timeouts (client só reflete) | 10, 16, P13 |
| 5.4 ajuste de depth entre drives (`canEditDepth`, `team:depth`) | 10 (`depthDraft.ts`), 16 (`DepthPanel`), 18 (`sendDepth`, commit por `resolvePendingDepth`) |
| 6.1.5 Fim: placar, stats por Pokémon, replay | 11 (`buildReplay` via `replay`), 17 |
| 7.2 protocolo (todos os eventos, `turnId`) | 7 (`socket.ts`), 18 (`App`) |
| 8 erros: `STALE_TURN`, `ENGINE_ERROR` → resync, sala inexistente/cheia, desconexão 60 s | 7 (`errorReaction`), 10 (`ERROR`), 16 (aviso de pausa), 18, P2, P19 |
| Reconexão por token em `sessionStorage` | 7 (`Session`), 18 (`rejoin`, resync único), P14 |
| Desktop primeiro; mobile cabe | CSS das Tasks 1 e 13–17, P20 |
| Sprites baixados no setup, sem PokéAPI em runtime | 2, Task 19 Step 3 |

**2. Placeholders:** todos os passos de código trazem o código completo, inclusive CSS e componentes. Não há "TBD", "TODO" ou "similar à Task N". A única instrução condicional é de configuração (Task 1, Step 6: manter o `include` atual do Plano 3 e acrescentar `exclude`), e ela mostra o resultado esperado.

**3. Consistência de tipos:**
- Nomes do Plano 1 usados exatamente: `Team`, `PlayerView`, `GameEvent`, `PlayOutcome`, `Lineup`, `SlotId`, `FormationId`, `PackageId`, `Phase`, `CARDS`, `getCard`/`findCard`, `canIncludeInDeck`, `validateTeam`, `speciesCost`, `teamCost`, `aptitude`, `ALL_SPECIES`, `getSpecies`, `FORMATIONS`, `PACKAGES`, `OFFENSE_SLOTS`, `DEFENSE_SLOTS`, `SALARY_CAP`, `slotPosition`, `fillSlots`, `threshold`, `POSITION_WEIGHTS`, `READ_MATRIX`, `OFFENSE_PROFILES`, `BASIC_*_IDS`, `SPECIAL_IDS`, `effectiveness`, `typeModifier`, `createMatch`, `step`, `replay`, `DEFAULT_CONFIG`.
- Do contrato: `SUGGESTED_TEAMS`, `PlayerView.canEditDepth`, `team:depth { turnId, depth, keepOnField }`, `ClientToServerEvents`/`ServerToClientEvents` com payloads `{ formation }`, `{ package }`, `{ ready }`, `RevealMessage.events`, `PhaseMessage`, `ResultMessage`, `EndMessage`, `ReplayData`, `MatchStats`, `RoomState`/`RoomPlayer`/`RoomStatus`, `ErrorCode`, `ROOM_CODE_LENGTH`, `PHASE_SECONDS`, `RESULT_ANIMATION_MS`, `RECONNECT_GRACE_MS`, `encodeTeam`, `decodeTeam`, `computeStats`.
- Tipos internos: `TeamDraft` (Task 4) é usado nas Tasks 5, 6, 14 e 15. `Stage` (Task 10) é usado nas Tasks 11 e 12. `AnimStep` (Task 9) nas Tasks 10–12. `DepthAction` (Task 4) nas Tasks 13 e 16. `DepthDraft`/`PendingDepth` (Task 10) nas Tasks 16 e 18. `PlaySpec` (Task 12) nas Tasks 16 e 17.

**4. Review Focus:** cada um dos 5 itens tem teste na task dona:
1. Import corrompido: Task 6, "código editado à mão" e "recusa código vazio, lixo...".
2. Storage indisponível: Task 3 (`probeStorage`, `readJson`, `writeJson`), Task 6 ("storage indisponível ou cheio") e Task 7 ("sem storage").
3. Fase durante a animação: Task 10, "match:phase chegando durante a animação" e "match:end durante a animação final".
4. Aba recarregada: Task 7 (sessão), Task 10 ("aba recarregada", "resultado reenviado") e Task 18 ("a primeira fase pode chegar antes do room:state").
5. Carta não jogável ou clique duplo: Task 10, "carta não jogável, clique duplo e fase errada" e "STALE_TURN libera o reenvio".

**Premissas sobre o Plano 3 (a confirmar na integração):**
- `PhaseMessage.turnId === PhaseMessage.view.turnId`. As ações usam `view.turnId`.
- Na reconexão, o cliente pede `match:resync`; se o servidor já empurrar a fase sozinho, nada quebra.
- `ReplayData.teams` são os times iniciais, sem os ajustes de depth, que entram como ações `SET_DEPTH`. A partida usa `DEFAULT_CONFIG`.
- `team:depth` não tem ack. A recusa chega como `error` (`ENGINE_ERROR` com `INVALID_DEPTH`/`DEPTH_LOCKED`, ou `STALE_TURN`) antes do próximo `match:phase`. Qualquer `error` descarta o depth pendente.
- O socket do cliente usa só o transporte `websocket`, para não depender de CORS no long-polling.
