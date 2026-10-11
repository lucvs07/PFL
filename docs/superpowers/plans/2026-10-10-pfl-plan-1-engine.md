# PFL — Plano 1: Fundação e Motor de Regras — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o monorepo do PFL com os dados da Gen 1 e um motor de regras puro e determinístico. Ao fim deste plano, uma partida 7v7 completa pode ser jogada de ponta a ponta via `step(state, action)`, coberta por testes.

**Architecture:** monorepo com npm workspaces. `packages/data` traz um script que baixa a PokéAPI uma única vez e gera JSON estático dentro de `packages/engine`. `packages/engine` é TypeScript puro, sem dependências de runtime: RNG semeado, tabela de tipos, cartas, time, fadiga, resolução de jogadas, campo e a máquina de estados da partida (`createMatch`/`step`/`playerView`/`replay`). Os módulos seguem a ordem das seções 2 a 5 da spec.

**Tech Stack:** Node 24, npm workspaces, TypeScript (strict), Vitest, tsx.

**Spec:** `docs/superpowers/specs/2026-10-10-pfl-core-design.md`

**Roteiro de planos** (cada um terá seu próprio documento):
1. **Este plano:** fundação, dados e motor.
2. Simulador de balanceamento + catálogo completo de cartas (~60 de tipo + ~20 assinatura) + 6 times sugeridos.
3. Servidor (salas por código, Socket.io, timers, reconexão, visão por jogador).
4. Cliente (React + Phaser, download de sprites Gen 1 Yellow, telas da seção 6).

**Decisões aprovadas em 2026-10-10 (já refletidas na spec):**
1. **Depth chart por vaga, compartilhado entre formações.** `WR1` usa a mesma ordem de reservas no Pistol e no Spread. A spec (5.4 e 6.1) pede um depth chart por formação/pacote.
2. **Atores derivados da categoria da carta** (tabela `MATCHUPS`) em vez do campo `actors` por carta (spec 3.1). O ator preferido é o Pokémon que cumpre o requisito da carta.
3. **Perfil de risco e variância por categoria** (`OFFENSE_PROFILES`). A carta só pode sobrescrever `baseYards`. A spec (3.1) previa um `profile` completo por carta.
4. **Catálogo inicial de 35 cartas** (3 básicas, 2 especiais, 15+15 de tipo, 5 assinatura). O catálogo completo (~60 + ~20) e a calibração ficam no Plano 2.
5. **Ajuste manual do depth chart entre drives (spec 5.4)** fica no Plano 3 (servidor), que adiciona a ação ao motor.

## Global Constraints

- Node ≥ 24 e npm (workspaces). **Não usar pnpm/yarn.**
- TypeScript `strict: true`. `packages/engine` **sem dependências de runtime**.
- O motor **não acessa rede nem a PokéAPI em runtime**. Os dados vêm de `packages/engine/src/data/*.json`, gerados por `npm run data:build`.
- Determinismo: toda aleatoriedade do motor vem de `rngNext`/`rngShuffle` com o estado guardado em `MatchState.rng`. **Nunca usar `Math.random`** no engine.
- Identificadores de código em inglês. Comentários, mensagens e nomes de cartas em português.
- Valores da spec, copiados literalmente:
  - **Partida:** 6 posses por time; mão de 5 cartas; deck de 12 + 12, no máximo 2 cópias.
  - **Elenco:** 16 + 1 especialista; teto de 120; custo `max(1, round((BST − 180) / 30))`; no máximo 1 lendário (144, 145, 146, 150, 151).
  - **Leitura:** ✖ ×1,6, · ×1,0, ✔ ×0,4 com risco ×2.
  - **Tipos:** 4x +60%, 2x +30%, 1x 0, ½x −30%, ¼x −45%, 0x −60% (escala dobrada por decisão do usuário em 2026-10-10); afinidade +10% por ator.
  - **Variância:** ±15%.
  - **Fadiga:** +1 por ator, +½ para QB/OL; limiar 2 (3 se HP ≥ 100); −1 por jogada fora de campo; −2 entre drives; retorno só com fadiga 0; −10% por nível acima do limiar.
  - **Campo:** touchback na 25; prorrogação a partir da 75 (25 do adversário); da 3ª prorrogação em diante, só tentativa de 2 a partir da 97.
  - **Tabela de tipos:** a da Gen 1, com Fantasma → Psíquico = 2.

## Review Focus

1. **Time importado malformado** (código de time corrompido ou editado à mão): `validateTeam` devolve `MALFORMED_TEAM` em vez de lançar exceção. Teste na Task 5.
2. **Ação repetida, fora de ordem ou após o fim da partida:** o motor lança `EngineError` com código (`ALREADY_CHOSEN`, `WRONG_PHASE`, `WRONG_TEAM`, `MATCH_OVER`) e **nunca altera o estado de entrada**. Testes na Task 9.
3. **Deck esgotado num drive longo:** o descarte é reembaralhado e a mão volta a 5. Teste na Task 9.
4. **Bola nas bordas do campo:** goal-to-go perto da end zone, safety a partir da linha de 1, punt que entra na end zone (touchback), FG errado de perto (mínimo na 20). Testes na Task 8.
5. **Todos os candidatos a uma vaga cansados ou descansando:** a escalação sai completa mesmo assim, usando um titular cansado. Teste na Task 6.

---

## File Structure

```
pfl/
  package.json                     workspaces + scripts (test, typecheck, data:build)
  tsconfig.json                    configuração TS única (strict, Bundler)
  vitest.config.ts                 inclui packages/**/test/**/*.test.ts
  .gitignore
  packages/
    data/
      package.json                 @pfl/data — script build
      scripts/build-data.ts        PokéAPI → engine/src/data/*.json
    engine/
      package.json                 @pfl/engine — main: src/index.ts
      src/
        index.ts                   reexporta a API pública
        model.ts                   todos os tipos de domínio
        rng.ts                     mulberry32 puro + shuffle
        data/pokemon.json          (gerado) 151 espécies Gen 1
        data/typechart.json        (gerado) 15×15 Gen 1 corrigida
        species.ts                 acesso aos dados, lendários
        typechart.ts               efetividade + escala de modificadores
        formations.ts              formações, pacotes, vagas, fillSlots
        cards/categories.ts        perfis por categoria + matriz de leitura
        cards/catalog.ts           catálogo inicial de cartas
        cards/eligibility.ts       requisitos: deck e em campo
        cards/deck.ts              compra, mão, descarte
        team.ts                    custo, aptidão, validação
        fatigue.ts                 escalação + fadiga
        resolve.ts                 pipeline de resolução de jogada
        specials.ts                punt, field goal, PAT
        field.ts                   down & distance, fim de drive, início do próximo
        errors.ts                  EngineError
        match.ts                   createMatch, step, playableCards, playerView
        replay.ts                  replay(seed, ações)
      test/
        fixtures.ts                time válido de teste
        *.test.ts
```

---

### Task 1: Monorepo, modelo de domínio e RNG

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- Create: `packages/engine/package.json`, `packages/engine/src/index.ts`, `packages/engine/src/model.ts`, `packages/engine/src/rng.ts`
- Test: `packages/engine/test/rng.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: todos os tipos de `model.ts` (abaixo, usados por todas as tasks); `rngNext(state: number): { value: number; state: number }`; `rngShuffle<T>(items: readonly T[], state: number): { items: T[]; state: number }`.

- [ ] **Step 1: Criar a configuração da raiz**

`package.json`:
```json
{
  "name": "pfl",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json",
    "data:build": "npm run build -w @pfl/data"
  }
}
```

`tsconfig.json`:
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
  "include": ["packages/*/src", "packages/*/test", "packages/*/scripts", "vitest.config.ts"]
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['packages/**/test/**/*.test.ts'] },
});
```

`.gitignore`:
```
node_modules/
coverage/
*.log
```

`packages/engine/package.json`:
```json
{
  "name": "@pfl/engine",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts"
}
```

- [ ] **Step 2: Instalar as ferramentas de desenvolvimento**

Run: `npm install -D typescript vitest tsx @types/node`
Expected: `package-lock.json` criado, `node_modules/` presente, sem erros.

- [ ] **Step 3: Escrever o modelo de domínio**

`packages/engine/src/model.ts`:
```ts
// Tipos de domínio do PFL. Todas as outras partes do motor importam daqui.

export const POKEMON_TYPES = [
  'normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison',
  'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon',
] as const;
export type PokemonType = (typeof POKEMON_TYPES)[number];

export interface Stats {
  hp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
}
export type StatKey = keyof Stats;

export interface Species {
  id: number;
  name: string;
  types: PokemonType[];
  stats: Stats;
}

export type Position = 'QB' | 'OL' | 'RB' | 'WR' | 'TE' | 'FB' | 'DL' | 'LB' | 'CB' | 'S';
export type OffenseSlot = 'QB' | 'OL1' | 'OL2' | 'OL3' | 'RB' | 'WR1' | 'WR2' | 'WR3' | 'TE' | 'FB';
export type DefenseSlot = 'DL1' | 'DL2' | 'DL3' | 'LB1' | 'LB2' | 'CB1' | 'CB2' | 'CB3' | 'S1' | 'S2';
export type SlotId = OffenseSlot | DefenseSlot;
export type FormationId = 'PISTOL' | 'HEAVY' | 'SPREAD' | 'DOUBLE';
export type PackageId = 'BASE' | 'HEAVY_D' | 'NICKEL' | 'DIME';
/** vaga → id da espécie em campo */
export type Lineup = Partial<Record<SlotId, number>>;

export type OffenseCategory = 'RUN_INSIDE' | 'RUN_OUTSIDE' | 'SHORT_PASS' | 'DEEP_PASS' | 'SCREEN' | 'PLAY_ACTION';
export type DefenseCategory = 'RUN_STUFF' | 'BLITZ' | 'MAN' | 'ZONE_SHORT' | 'ZONE_DEEP' | 'BASE_D';
export type SpecialCategory = 'PUNT' | 'FIELD_GOAL';
export type CardSide = 'OFFENSE' | 'DEFENSE';
export type CardOrigin = 'BASIC' | 'TYPE' | 'SIGNATURE' | 'SPECIAL';

/** Exige `count` (padrão 1) Pokémon na posição que tenham um dos tipos e/ou sejam uma das espécies. */
export interface Requirement {
  position: Position;
  types?: PokemonType[];
  species?: number[];
  count?: number;
}

export interface Card {
  id: string;
  name: string;
  side: CardSide;
  category: OffenseCategory | DefenseCategory | SpecialCategory;
  origin: CardOrigin;
  element: PokemonType | null;
  requirements: Requirement[];
  /** Sobrescreve as jardas base da categoria. */
  baseYards?: number;
}

export interface Team {
  name: string;
  roster: number[];
  specialist: number;
  depth: Partial<Record<SlotId, number[]>>;
  keepOnField: number[];
  offenseDeck: string[];
  defenseDeck: string[];
}

export interface TeamError {
  code: string;
  detail?: string;
}

export type TeamKey = 'A' | 'B';
/** Resultado da leitura do ponto de vista da defesa. */
export type ReadResult = 'RIGHT' | 'NEUTRAL' | 'WRONG';

export interface FieldState {
  down: number;
  yardsToGo: number;
  /** 0 = própria end zone do ataque, 100 = end zone adversária */
  ballOn: number;
}

export interface FatigueState {
  levels: Record<number, number>;
  resting: number[];
}

export interface DeckState {
  draw: string[];
  hand: string[];
  discard: string[];
}

export type Phase = 'FORMATION' | 'PACKAGE' | 'PLAYCALL' | 'CONVERSION' | 'MATCH_END';

export type Action =
  | { type: 'FORMATION'; team: TeamKey; formation: FormationId }
  | { type: 'PACKAGE'; team: TeamKey; package: PackageId }
  | { type: 'CARD'; team: TeamKey; cardId: string }
  | { type: 'CONVERSION'; team: TeamKey; choice: 'PAT' | 'TWO' }
  | { type: 'TIMEOUT' };

export type PlayKind = 'GAIN' | 'SACK' | 'INCOMPLETE' | 'INTERCEPTION' | 'FUMBLE';

export interface PlayOutcome {
  kind: PlayKind;
  /** GAIN/SACK: jardas; INTERCEPTION/FUMBLE: distância da linha até o ponto do turnover */
  yards: number;
  bigPlay: boolean;
  read: ReadResult;
  offActors: number[];
  defActors: number[];
  offTypeMult: number;
  defTypeMult: number;
}

export type GameEvent =
  | { t: 'DRIVE_START'; offense: TeamKey; ballOn: number; possession: number; overtimeRound: number }
  | { t: 'FORMATION'; team: TeamKey; formation: FormationId; lineup: Lineup }
  | { t: 'PACKAGE'; team: TeamKey; package: PackageId; lineup: Lineup }
  | { t: 'CARDS'; offense: string; defense: string; read: ReadResult }
  | { t: 'PLAY'; outcome: PlayOutcome }
  | { t: 'PUNT'; distance: number }
  | { t: 'FIELD_GOAL'; distance: number; good: boolean }
  | { t: 'FIRST_DOWN' }
  | { t: 'TOUCHDOWN'; team: TeamKey }
  | { t: 'SAFETY'; team: TeamKey }
  | { t: 'CONVERSION'; team: TeamKey; choice: 'PAT' | 'TWO'; good: boolean }
  | { t: 'TURNOVER_ON_DOWNS' }
  | { t: 'TURNOVER'; kind: 'INTERCEPTION' | 'FUMBLE' }
  | { t: 'OVERTIME'; round: number }
  | { t: 'MATCH_END'; score: Record<TeamKey, number> };
```

- [ ] **Step 4: Escrever o teste do RNG (deve falhar)**

`packages/engine/test/rng.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { rngNext, rngShuffle } from '../src/rng';

const sequence = (seed: number, n = 5): number[] => {
  let state = seed;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = rngNext(state);
    out.push(r.value);
    state = r.state;
  }
  return out;
};

describe('rng', () => {
  it('é determinístico para a mesma seed', () => {
    expect(sequence(42)).toEqual(sequence(42));
    expect(sequence(42)).not.toEqual(sequence(43));
  });

  it('gera valores em [0, 1)', () => {
    for (const v of sequence(7, 1000)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('embaralha de forma determinística sem perder itens', () => {
    const a = rngShuffle([1, 2, 3, 4, 5, 6, 7, 8], 99);
    const b = rngShuffle([1, 2, 3, 4, 5, 6, 7, 8], 99);
    expect(a.items).toEqual(b.items);
    expect([...a.items].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(a.state).not.toBe(99);
  });
});
```

- [ ] **Step 5: Rodar e ver falhar**

Run: `npx vitest run packages/engine/test/rng.test.ts`
Expected: FAIL — `Failed to resolve import "../src/rng"`.

- [ ] **Step 6: Implementar o RNG e o índice**

`packages/engine/src/rng.ts`:
```ts
/** mulberry32 puro: recebe o estado e devolve um valor em [0, 1) e o próximo estado. */
export function rngNext(state: number): { value: number; state: number } {
  const next = (state + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: next };
}

/** Fisher–Yates determinístico. */
export function rngShuffle<T>(items: readonly T[], state: number): { items: T[]; state: number } {
  const out = [...items];
  let s = state;
  for (let i = out.length - 1; i > 0; i--) {
    const r = rngNext(s);
    s = r.state;
    const j = Math.floor(r.value * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return { items: out, state: s };
}
```

`packages/engine/src/index.ts`:
```ts
export * from './model';
export * from './rng';
```

- [ ] **Step 7: Rodar os testes e o typecheck**

Run: `npm test && npm run typecheck`
Expected: 3 testes PASS; typecheck sem erros.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore packages/engine
git commit -m "chore: monorepo, modelo de domínio e RNG determinístico"
```

---

### Task 2: Dados da Gen 1 (PokéAPI → JSON estático)

**Files:**
- Create: `packages/data/package.json`, `packages/data/scripts/build-data.ts`
- Create (gerados): `packages/engine/src/data/pokemon.json`, `packages/engine/src/data/typechart.json`
- Create: `packages/engine/src/species.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/test/species.test.ts`

**Interfaces:**
- Consumes: `Species`, `PokemonType`, `POKEMON_TYPES` (Task 1).
- Produces: `ALL_SPECIES: readonly Species[]`; `getSpecies(id: number): Species` (lança erro se desconhecida); `hasSpecies(id: number): boolean`; `LEGENDARY_IDS: readonly number[]`; `TYPE_CHART: Record<PokemonType, Record<PokemonType, number>>`.

- [ ] **Step 1: Criar o pacote de dados e o script**

`packages/data/package.json`:
```json
{
  "name": "@pfl/data",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": { "build": "tsx scripts/build-data.ts" }
}
```

`packages/data/scripts/build-data.ts`:
```ts
// Baixa os dados da Gen 1 da PokéAPI uma única vez e grava JSON estático no engine.
// O jogo nunca chama a PokéAPI em runtime (spec, seção 4.1).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://pokeapi.co/api/v2';
const GEN1_TYPES = [
  'normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison',
  'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon',
];
const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../engine/src/data');
const STAT_KEYS: Record<string, string> = {
  hp: 'hp',
  attack: 'attack',
  defense: 'defense',
  'special-attack': 'spAttack',
  'special-defense': 'spDefense',
  speed: 'speed',
};

const generationNumber = (url: string): number => Number(url.split('/').filter(Boolean).pop());

async function getJson(url: string): Promise<any> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    if (attempt === 3) throw new Error(`${res.status} ao buscar ${url}`);
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

/** Uma entrada past_* da geração X vale até a geração X; a de menor X é a que vale na Gen 1. */
function earliest<T extends { generation: { url: string } }>(entries: T[]): T | undefined {
  return [...entries].sort((a, b) => generationNumber(a.generation.url) - generationNumber(b.generation.url))[0];
}

async function buildPokemon() {
  const list = [];
  for (let id = 1; id <= 151; id++) {
    const p = await getJson(`${API}/pokemon/${id}`);
    const past: any = earliest(p.past_types ?? []);
    const slots = (past ? past.types : p.types) as { slot: number; type: { name: string } }[];
    const types = [...slots].sort((a, b) => a.slot - b.slot).map((t) => t.type.name);
    const stats: Record<string, number> = {};
    for (const s of p.stats) stats[STAT_KEYS[s.stat.name]] = s.base_stat;
    list.push({ id, name: p.name, types, stats });
  }
  return list;
}

async function buildTypeChart() {
  const chart: Record<string, Record<string, number>> = {};
  for (const attacker of GEN1_TYPES) {
    const t = await getJson(`${API}/type/${attacker}`);
    const past: any = earliest(t.past_damage_relations ?? []);
    const rel = past ? past.damage_relations : t.damage_relations;
    const row: Record<string, number> = Object.fromEntries(GEN1_TYPES.map((d) => [d, 1]));
    for (const d of rel.double_damage_to) if (d.name in row) row[d.name] = 2;
    for (const d of rel.half_damage_to) if (d.name in row) row[d.name] = 0.5;
    for (const d of rel.no_damage_to) if (d.name in row) row[d.name] = 0;
    chart[attacker] = row;
  }
  chart.ghost.psychic = 2; // corrige o bug da Gen 1 (spec, seção 4.1)
  return chart;
}

const pokemon = await buildPokemon();
if (pokemon.length !== 151) throw new Error(`Esperava 151 Pokémon, veio ${pokemon.length}`);
for (const p of pokemon) {
  for (const t of p.types) {
    if (!GEN1_TYPES.includes(t)) throw new Error(`Tipo fora da Gen 1 em ${p.name}: ${t}`);
  }
}
const typechart = await buildTypeChart();

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, 'pokemon.json'), JSON.stringify(pokemon, null, 2) + '\n');
writeFileSync(resolve(OUT_DIR, 'typechart.json'), JSON.stringify(typechart, null, 2) + '\n');
console.log(`${pokemon.length} Pokémon, ${Object.keys(typechart).length} tipos`);
```

- [ ] **Step 2: Gerar os dados (precisa de rede, leva cerca de 1 minuto)**

Run: `npm install && npm run data:build`
Expected: `151 Pokémon, 15 tipos`. Os arquivos `packages/engine/src/data/pokemon.json` e `typechart.json` passam a existir.

- [ ] **Step 3: Escrever o teste dos dados (deve falhar)**

`packages/engine/test/species.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { ALL_SPECIES, getSpecies, hasSpecies, TYPE_CHART, LEGENDARY_IDS } from '../src/species';
import { POKEMON_TYPES } from '../src/model';

describe('dados da Gen 1', () => {
  it('tem os 151 Pokémon com ids 1..151', () => {
    expect(ALL_SPECIES).toHaveLength(151);
    expect(ALL_SPECIES.map((s) => s.id)).toEqual(Array.from({ length: 151 }, (_, i) => i + 1));
  });

  it('usa a tipagem original de Kanto', () => {
    expect(getSpecies(81).types).toEqual(['electric']); // Magnemite
    expect(getSpecies(35).types).toEqual(['normal']); // Clefairy
    for (const s of ALL_SPECIES) for (const t of s.types) expect(POKEMON_TYPES).toContain(t);
  });

  it('tem stats completos', () => {
    const snorlax = getSpecies(143).stats;
    const bst = snorlax.hp + snorlax.attack + snorlax.defense + snorlax.spAttack + snorlax.spDefense + snorlax.speed;
    expect(bst).toBe(540);
  });

  it('usa a tabela de tipos da Gen 1 com o bug Fantasma/Psíquico corrigido', () => {
    expect(TYPE_CHART.ghost.psychic).toBe(2);
    expect(TYPE_CHART.normal.ghost).toBe(0);
    expect(TYPE_CHART.bug.poison).toBe(2);
    expect(TYPE_CHART.poison.bug).toBe(2);
    expect(TYPE_CHART.ice.fire).toBe(1);
    expect(TYPE_CHART.electric.ground).toBe(0);
    expect(TYPE_CHART.water.fire).toBe(2);
  });

  it('identifica espécies e lendários', () => {
    expect(hasSpecies(151)).toBe(true);
    expect(hasSpecies(152)).toBe(false);
    expect(() => getSpecies(0)).toThrow(/desconhecida/);
    expect(LEGENDARY_IDS).toEqual([144, 145, 146, 150, 151]);
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `npx vitest run packages/engine/test/species.test.ts`
Expected: FAIL — `Failed to resolve import "../src/species"`.

- [ ] **Step 5: Implementar `species.ts`**

`packages/engine/src/species.ts`:
```ts
import pokemonData from './data/pokemon.json';
import typechartData from './data/typechart.json';
import type { PokemonType, Species } from './model';

export const ALL_SPECIES: readonly Species[] = pokemonData as Species[];
const BY_ID = new Map(ALL_SPECIES.map((s) => [s.id, s]));

/** Articuno, Zapdos, Moltres, Mewtwo, Mew */
export const LEGENDARY_IDS: readonly number[] = [144, 145, 146, 150, 151];

export const TYPE_CHART = typechartData as Record<PokemonType, Record<PokemonType, number>>;

export function hasSpecies(id: number): boolean {
  return BY_ID.has(id);
}

export function getSpecies(id: number): Species {
  const species = BY_ID.get(id);
  if (!species) throw new Error(`Espécie desconhecida: ${id}`);
  return species;
}
```

Adicionar em `packages/engine/src/index.ts`:
```ts
export * from './species';
```

- [ ] **Step 6: Rodar os testes**

Run: `npm test && npm run typecheck`
Expected: todos PASS. Se algum caso da tabela de tipos falhar, **não ajuste o teste**: confira em `typechart.json` o que a PokéAPI devolveu e reporte a divergência.

- [ ] **Step 7: Commit**

```bash
git add packages/data packages/engine package-lock.json
git commit -m "feat(data): dados Gen 1 da PokéAPI como JSON estático"
```

---

### Task 3: Tabela de tipos e escala de modificadores

**Files:**
- Create: `packages/engine/src/typechart.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/test/typechart.test.ts`

**Interfaces:**
- Consumes: `TYPE_CHART` (Task 2), `PokemonType`.
- Produces: `effectiveness(attack: PokemonType, defender: readonly PokemonType[]): number` (produto: 0, 0.25, 0.5, 1, 2 ou 4); `typeModifier(eff: number): number`; `TYPE_SCALE`.

- [ ] **Step 1: Escrever o teste (deve falhar)**

`packages/engine/test/typechart.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { effectiveness, typeModifier, TYPE_SCALE } from '../src/typechart';

describe('efetividade', () => {
  it('multiplica pelos dois tipos do defensor', () => {
    expect(effectiveness('electric', ['water', 'flying'])).toBe(4);
    expect(effectiveness('grass', ['fire', 'flying'])).toBe(0.25);
    expect(effectiveness('ground', ['flying'])).toBe(0);
    expect(effectiveness('normal', ['normal'])).toBe(1);
  });
});

describe('escala de modificadores', () => {
  it('segue os valores da spec', () => {
    expect(typeModifier(4)).toBe(0.6);
    expect(typeModifier(2)).toBe(0.3);
    expect(typeModifier(1)).toBe(0);
    expect(typeModifier(0.5)).toBe(-0.3);
    expect(typeModifier(0.25)).toBe(-0.45);
    expect(typeModifier(0)).toBe(-0.6);
  });

  it('é monotônica: maior efetividade nunca dá modificador menor', () => {
    const sorted = [...TYPE_SCALE].sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i][1]).toBeGreaterThan(sorted[i - 1][1]);
  });

  it('rejeita efetividade fora da escala', () => {
    expect(() => typeModifier(3)).toThrow(/inesperada/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/engine/test/typechart.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 3: Implementar**

`packages/engine/src/typechart.ts`:
```ts
import type { PokemonType } from './model';
import { TYPE_CHART } from './species';

export function effectiveness(attack: PokemonType, defender: readonly PokemonType[]): number {
  return defender.reduce((mult, d) => mult * TYPE_CHART[attack][d], 1);
}

/** [efetividade, modificador] — spec, seção 4.3. Imunidade é o melhor resultado defensivo. */
export const TYPE_SCALE: ReadonlyArray<readonly [number, number]> = [
  [4, 0.6],
  [2, 0.3],
  [1, 0],
  [0.5, -0.3],
  [0.25, -0.45],
  [0, -0.6],
];

export function typeModifier(eff: number): number {
  const hit = TYPE_SCALE.find(([e]) => e === eff);
  if (!hit) throw new Error(`Efetividade inesperada: ${eff}`);
  return hit[1];
}
```

Adicionar em `index.ts`:
```ts
export * from './typechart';
```

- [ ] **Step 4: Rodar os testes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): efetividade de tipos e escala monotônica"
```

---

### Task 4: Formações, categorias, matriz de leitura e catálogo de cartas

**Files:**
- Create: `packages/engine/src/formations.ts`, `packages/engine/src/cards/categories.ts`, `packages/engine/src/cards/catalog.ts`, `packages/engine/src/cards/eligibility.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/test/formations.test.ts`, `packages/engine/test/cards.test.ts`

**Interfaces:**
- Consumes: tipos de `model.ts`; `getSpecies` (Task 2).
- Produces:
  - `FORMATIONS: Record<FormationId, OffenseSlot[]>`, `PACKAGES: Record<PackageId, DefenseSlot[]>`, `OFFENSE_SLOTS`, `DEFENSE_SLOTS`
  - `slotPosition(slot: SlotId): Position`, `slotsOf(lineup: Lineup, position: Position): SlotId[]`
  - `fillSlots(slots: readonly SlotId[], depth: Team['depth'], preferred?: (id: number) => boolean): Lineup | null`
  - `CategoryProfile`, `OFFENSE_PROFILES: Record<OffenseCategory, CategoryProfile>`, `READ_MATRIX`, `readResult(def: DefenseCategory, off: OffenseCategory): ReadResult`
  - `CARDS: readonly Card[]`, `getCard(id: string): Card` (lança erro), `findCard(id: string): Card | undefined`, `BASIC_OFFENSE_IDS`, `BASIC_DEFENSE_IDS`, `SPECIAL_IDS`
  - `matchesRequirement(species: Species, req: Requirement): boolean`, `canIncludeInDeck(card: Card, roster: readonly number[]): boolean`, `canPlay(card: Card, lineup: Lineup): boolean`

- [ ] **Step 1: Escrever o teste de formações (deve falhar)**

`packages/engine/test/formations.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { FORMATIONS, PACKAGES, slotPosition, slotsOf, fillSlots } from '../src/formations';

describe('formações e pacotes', () => {
  it('todas têm 7 vagas', () => {
    for (const slots of Object.values(FORMATIONS)) expect(slots).toHaveLength(7);
    for (const slots of Object.values(PACKAGES)) expect(slots).toHaveLength(7);
  });

  it('ataque sempre tem QB e 3 OL', () => {
    for (const slots of Object.values(FORMATIONS)) {
      expect(slots.filter((s) => slotPosition(s) === 'OL')).toHaveLength(3);
      expect(slots).toContain('QB');
    }
  });

  it('deriva a posição da vaga', () => {
    expect(slotPosition('OL2')).toBe('OL');
    expect(slotPosition('S1')).toBe('S');
    expect(slotPosition('QB')).toBe('QB');
  });

  it('lista as vagas de uma posição na escalação', () => {
    expect(slotsOf({ QB: 1, WR1: 2, WR2: 3 }, 'WR')).toEqual(['WR1', 'WR2']);
  });
});

describe('fillSlots', () => {
  const depth = { QB: [1, 2], RB: [1, 3], WR1: [4] };

  it('não repete Pokémon e segue a ordem do depth chart', () => {
    expect(fillSlots(['QB', 'RB', 'WR1'], depth)).toEqual({ QB: 1, RB: 3, WR1: 4 });
  });

  it('prefere candidatos disponíveis e recorre aos demais se preciso', () => {
    expect(fillSlots(['QB', 'RB', 'WR1'], depth, (id) => id !== 1)).toEqual({ QB: 2, RB: 3, WR1: 4 });
    expect(fillSlots(['WR1'], depth, () => false)).toEqual({ WR1: 4 });
  });

  it('devolve null quando uma vaga fica sem candidato', () => {
    expect(fillSlots(['QB', 'RB', 'WR1', 'TE'], depth)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/engine/test/formations.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 3: Implementar `formations.ts`**

`packages/engine/src/formations.ts`:
```ts
import type { DefenseSlot, FormationId, Lineup, OffenseSlot, PackageId, Position, SlotId, Team } from './model';

// Spec, seção 5.4: QB + 3 OL fixos e 3 vagas variáveis no ataque.
export const FORMATIONS: Record<FormationId, OffenseSlot[]> = {
  PISTOL: ['QB', 'OL1', 'OL2', 'OL3', 'RB', 'WR1', 'WR2'],
  HEAVY: ['QB', 'OL1', 'OL2', 'OL3', 'RB', 'TE', 'WR1'],
  SPREAD: ['QB', 'OL1', 'OL2', 'OL3', 'WR1', 'WR2', 'WR3'],
  DOUBLE: ['QB', 'OL1', 'OL2', 'OL3', 'RB', 'FB', 'WR1'],
};

export const PACKAGES: Record<PackageId, DefenseSlot[]> = {
  BASE: ['DL1', 'DL2', 'DL3', 'LB1', 'CB1', 'CB2', 'S1'],
  HEAVY_D: ['DL1', 'DL2', 'DL3', 'LB1', 'LB2', 'CB1', 'S1'],
  NICKEL: ['DL1', 'DL2', 'LB1', 'CB1', 'CB2', 'CB3', 'S1'],
  DIME: ['DL1', 'DL2', 'CB1', 'CB2', 'CB3', 'S1', 'S2'],
};

export const OFFENSE_SLOTS: OffenseSlot[] = ['QB', 'OL1', 'OL2', 'OL3', 'RB', 'WR1', 'WR2', 'WR3', 'TE', 'FB'];
export const DEFENSE_SLOTS: DefenseSlot[] = ['DL1', 'DL2', 'DL3', 'LB1', 'LB2', 'CB1', 'CB2', 'CB3', 'S1', 'S2'];

export function slotPosition(slot: SlotId): Position {
  return slot.replace(/\d+$/, '') as Position;
}

export function slotsOf(lineup: Lineup, position: Position): SlotId[] {
  return (Object.keys(lineup) as SlotId[]).filter((s) => lineup[s] !== undefined && slotPosition(s) === position);
}

/**
 * Preenche as vagas em ordem, sem repetir Pokémon. Em cada vaga pega o primeiro candidato livre que
 * satisfaz `preferred`; se nenhum satisfizer, o primeiro livre. Devolve null se uma vaga ficar vazia.
 */
export function fillSlots(
  slots: readonly SlotId[],
  depth: Team['depth'],
  preferred: (id: number) => boolean = () => true,
): Lineup | null {
  const used = new Set<number>();
  const lineup: Lineup = {};
  for (const slot of slots) {
    const candidates = (depth[slot] ?? []).filter((id) => !used.has(id));
    const pick = candidates.find(preferred) ?? candidates[0];
    if (pick === undefined) return null;
    lineup[slot] = pick;
    used.add(pick);
  }
  return lineup;
}
```

- [ ] **Step 4: Rodar o teste de formações**

Run: `npx vitest run packages/engine/test/formations.test.ts`
Expected: PASS.

- [ ] **Step 5: Escrever o teste das cartas (deve falhar)**

`packages/engine/test/cards.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { READ_MATRIX, readResult } from '../src/cards/categories';
import { CARDS, getCard, findCard } from '../src/cards/catalog';
import { canIncludeInDeck, canPlay } from '../src/cards/eligibility';
import { POKEMON_TYPES, type OffenseCategory, type DefenseCategory } from '../src/model';

const OFF: OffenseCategory[] = ['RUN_INSIDE', 'RUN_OUTSIDE', 'SHORT_PASS', 'DEEP_PASS', 'SCREEN', 'PLAY_ACTION'];
const DEF = Object.keys(READ_MATRIX) as Exclude<DefenseCategory, 'BASE_D'>[];
const score = (r: string) => (r === 'RIGHT' ? 1 : r === 'WRONG' ? -1 : 0);

describe('matriz de leitura', () => {
  it('cada linha (defesa) tem saldo zero', () => {
    for (const d of DEF) expect(OFF.reduce((sum, o) => sum + score(READ_MATRIX[d][o]), 0)).toBe(0);
  });

  it('cada coluna (ataque) tem saldo zero', () => {
    for (const o of OFF) expect(DEF.reduce((sum, d) => sum + score(READ_MATRIX[d][o]), 0)).toBe(0);
  });

  it('a defesa base é sempre neutra', () => {
    for (const o of OFF) expect(readResult('BASE_D', o)).toBe('NEUTRAL');
  });

  it('bate com a spec em casos-chave', () => {
    expect(readResult('BLITZ', 'SCREEN')).toBe('WRONG');
    expect(readResult('ZONE_DEEP', 'DEEP_PASS')).toBe('RIGHT');
    expect(readResult('RUN_STUFF', 'PLAY_ACTION')).toBe('WRONG');
  });
});

describe('catálogo', () => {
  it('tem ids únicos', () => {
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
  });

  it('tem ao menos uma carta de ataque e uma de defesa por tipo', () => {
    for (const t of POKEMON_TYPES) {
      expect(CARDS.some((c) => c.origin === 'TYPE' && c.side === 'OFFENSE' && c.element === t)).toBe(true);
      expect(CARDS.some((c) => c.origin === 'TYPE' && c.side === 'DEFENSE' && c.element === t)).toBe(true);
    }
  });

  it('cobre todas as categorias de ataque e defesa', () => {
    for (const o of OFF) expect(CARDS.some((c) => c.category === o && c.origin !== 'BASIC')).toBe(true);
    for (const d of DEF) expect(CARDS.some((c) => c.category === d)).toBe(true);
  });

  it('busca por id', () => {
    expect(getCard('basic_run').category).toBe('RUN_INSIDE');
    expect(findCard('nao_existe')).toBeUndefined();
    expect(() => getCard('nao_existe')).toThrow(/desconhecida/);
  });
});

describe('elegibilidade', () => {
  const thunder = getCard('electric_thunder_screen'); // RB elétrico + WR elétrico
  const avalanche = getCard('rock_avalanche'); // 2 OL pedra

  it('no deck: o elenco precisa ter Pokémon que cumpram cada requisito', () => {
    expect(canIncludeInDeck(thunder, [25, 74])).toBe(true); // Pikachu
    expect(canIncludeInDeck(thunder, [74, 95])).toBe(false);
    expect(canIncludeInDeck(avalanche, [74])).toBe(false); // só 1 pedra
    expect(canIncludeInDeck(avalanche, [74, 95])).toBe(true); // Geodude + Onix
  });

  it('em campo: os requisitos valem para as vagas da escalação', () => {
    expect(canPlay(thunder, { QB: 63, RB: 25, WR1: 26 })).toBe(true); // Pikachu RB, Raichu WR
    expect(canPlay(thunder, { QB: 63, RB: 25, WR1: 16 })).toBe(false); // WR é Pidgey
    expect(canPlay(avalanche, { OL1: 95, OL2: 74, OL3: 66 })).toBe(true);
    expect(canPlay(avalanche, { OL1: 95, OL2: 66, OL3: 19 })).toBe(false);
  });

  it('cartas básicas são sempre jogáveis', () => {
    expect(canPlay(getCard('basic_pass'), {})).toBe(true);
  });
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `npx vitest run packages/engine/test/cards.test.ts`
Expected: FAIL — imports não resolvidos.

- [ ] **Step 7: Implementar categorias e matriz**

`packages/engine/src/cards/categories.ts`:
```ts
import type { DefenseCategory, OffenseCategory, ReadResult } from '../model';

export interface CategoryProfile {
  baseYards: number;
  /** amplitude relativa da variância (±) */
  variance: number;
  risk: { sack: number; interception: number; fumble: number; incompletion: number; bigPlay: number };
}

// Valores iniciais; o Plano 2 calibra com o simulador.
export const OFFENSE_PROFILES: Record<OffenseCategory, CategoryProfile> = {
  RUN_INSIDE: { baseYards: 4, variance: 0.15, risk: { sack: 0, interception: 0, fumble: 0.02, incompletion: 0, bigPlay: 0.04 } },
  RUN_OUTSIDE: { baseYards: 5, variance: 0.15, risk: { sack: 0, interception: 0, fumble: 0.02, incompletion: 0, bigPlay: 0.07 } },
  SHORT_PASS: { baseYards: 7, variance: 0.15, risk: { sack: 0.05, interception: 0.02, fumble: 0, incompletion: 0.25, bigPlay: 0.05 } },
  DEEP_PASS: { baseYards: 18, variance: 0.15, risk: { sack: 0.08, interception: 0.05, fumble: 0, incompletion: 0.5, bigPlay: 0.08 } },
  SCREEN: { baseYards: 6, variance: 0.15, risk: { sack: 0, interception: 0.01, fumble: 0, incompletion: 0.1, bigPlay: 0.06 } },
  PLAY_ACTION: { baseYards: 12, variance: 0.15, risk: { sack: 0.1, interception: 0.03, fumble: 0, incompletion: 0.35, bigPlay: 0.08 } },
};

const R: ReadResult = 'RIGHT';
const N: ReadResult = 'NEUTRAL';
const W: ReadResult = 'WRONG';

// Spec, seção 3.5 — saldo zero por linha e por coluna.
export const READ_MATRIX: Record<Exclude<DefenseCategory, 'BASE_D'>, Record<OffenseCategory, ReadResult>> = {
  RUN_STUFF: { RUN_INSIDE: R, RUN_OUTSIDE: R, SHORT_PASS: N, DEEP_PASS: W, SCREEN: N, PLAY_ACTION: W },
  BLITZ: { RUN_INSIDE: R, RUN_OUTSIDE: N, SHORT_PASS: W, DEEP_PASS: R, SCREEN: W, PLAY_ACTION: N },
  MAN: { RUN_INSIDE: W, RUN_OUTSIDE: W, SHORT_PASS: R, DEEP_PASS: N, SCREEN: R, PLAY_ACTION: N },
  ZONE_SHORT: { RUN_INSIDE: N, RUN_OUTSIDE: N, SHORT_PASS: R, DEEP_PASS: W, SCREEN: N, PLAY_ACTION: N },
  ZONE_DEEP: { RUN_INSIDE: W, RUN_OUTSIDE: N, SHORT_PASS: W, DEEP_PASS: R, SCREEN: N, PLAY_ACTION: R },
};

export function readResult(def: DefenseCategory, off: OffenseCategory): ReadResult {
  return def === 'BASE_D' ? 'NEUTRAL' : READ_MATRIX[def][off];
}
```

- [ ] **Step 8: Implementar o catálogo**

`packages/engine/src/cards/catalog.ts`:
```ts
import type { Card, CardOrigin, DefenseCategory, OffenseCategory, PokemonType, Position, Requirement } from '../model';

const offense = (
  id: string,
  name: string,
  category: OffenseCategory,
  element: PokemonType | null,
  requirements: Requirement[],
  origin: CardOrigin = 'TYPE',
  baseYards?: number,
): Card => ({ id, name, side: 'OFFENSE', category, origin, element, requirements, ...(baseYards !== undefined ? { baseYards } : {}) });

const defense = (
  id: string,
  name: string,
  category: DefenseCategory,
  element: PokemonType | null,
  requirements: Requirement[],
  origin: CardOrigin = 'TYPE',
): Card => ({ id, name, side: 'DEFENSE', category, origin, element, requirements });

const byType = (position: Position, types: PokemonType[], count = 1): Requirement => ({ position, types, count });
const bySpecies = (position: Position, species: number[]): Requirement => ({ position, species });

export const BASIC_OFFENSE_IDS = ['basic_run', 'basic_pass'] as const;
export const BASIC_DEFENSE_IDS = ['basic_defense'] as const;
export const SPECIAL_IDS = ['punt', 'field_goal'] as const;

export const CARDS: readonly Card[] = [
  // Básicas — sempre disponíveis, fora do deck (spec 2.3)
  offense('basic_run', 'Corrida Básica', 'RUN_INSIDE', null, [], 'BASIC'),
  offense('basic_pass', 'Passe Básico', 'SHORT_PASS', null, [], 'BASIC'),
  defense('basic_defense', 'Defesa Base', 'BASE_D', null, [], 'BASIC'),
  // Especiais de 4º down
  { id: 'punt', name: 'Punt', side: 'OFFENSE', category: 'PUNT', origin: 'SPECIAL', element: null, requirements: [] },
  { id: 'field_goal', name: 'Field Goal', side: 'OFFENSE', category: 'FIELD_GOAL', origin: 'SPECIAL', element: null, requirements: [] },

  // Ataque por tipo
  offense('normal_tackle', 'Investida', 'RUN_INSIDE', 'normal', [byType('RB', ['normal'])]),
  offense('fire_deep', 'Lança-Chamas Longo', 'DEEP_PASS', 'fire', [byType('WR', ['fire'])]),
  offense('water_surf_route', 'Surf Route', 'DEEP_PASS', 'water', [byType('QB', ['water']), byType('WR', ['water'])], 'TYPE', 20),
  offense('grass_vine_screen', 'Chicote de Vinha', 'SCREEN', 'grass', [byType('RB', ['grass'])]),
  offense('electric_thunder_screen', 'Thunder Screen', 'SCREEN', 'electric', [byType('RB', ['electric']), byType('WR', ['electric'])], 'TYPE', 7),
  offense('ice_beam_slant', 'Raio de Gelo', 'SHORT_PASS', 'ice', [byType('WR', ['ice'])]),
  offense('fighting_submission', 'Submissão', 'RUN_INSIDE', 'fighting', [byType('RB', ['fighting'])]),
  offense('poison_powder_fake', 'Pó Venenoso', 'PLAY_ACTION', 'poison', [byType('RB', ['poison'])]),
  offense('ground_earthquake', 'Terremoto', 'RUN_OUTSIDE', 'ground', [byType('RB', ['ground'])]),
  offense('flying_air_raid', 'Ataque Aéreo', 'DEEP_PASS', 'flying', [byType('WR', ['flying'])]),
  offense('psychic_confusion', 'Confusão', 'PLAY_ACTION', 'psychic', [byType('QB', ['psychic'])]),
  offense('bug_quick_bite', 'Picada Rápida', 'SHORT_PASS', 'bug', [byType('WR', ['bug'])]),
  offense('rock_avalanche', 'Avalanche', 'RUN_INSIDE', 'rock', [byType('OL', ['rock'], 2)]),
  offense('ghost_night_shade', 'Sombra Noturna', 'PLAY_ACTION', 'ghost', [byType('WR', ['ghost'])]),
  offense('dragon_rage_sweep', 'Fúria do Dragão', 'RUN_OUTSIDE', 'dragon', [byType('RB', ['dragon'])]),

  // Defesa por tipo
  defense('normal_wall', 'Muralha Normal', 'RUN_STUFF', 'normal', [byType('DL', ['normal'])]),
  defense('fire_crossfire', 'Fogo Cruzado', 'BLITZ', 'fire', [byType('LB', ['fire'])]),
  defense('water_high_tide', 'Maré Alta', 'ZONE_DEEP', 'water', [byType('S', ['water'])]),
  defense('grass_sleep_powder', 'Pó do Sono', 'ZONE_SHORT', 'grass', [byType('LB', ['grass'])]),
  defense('electric_paralysis', 'Paralisia', 'MAN', 'electric', [byType('CB', ['electric'])]),
  defense('ice_blizzard', 'Nevasca', 'ZONE_DEEP', 'ice', [byType('S', ['ice'])]),
  defense('fighting_low_kick', 'Golpe Baixo', 'BLITZ', 'fighting', [byType('LB', ['fighting'])]),
  defense('poison_toxic', 'Tóxico', 'RUN_STUFF', 'poison', [byType('DL', ['poison'])]),
  defense('ground_dig', 'Cova', 'BLITZ', 'ground', [byType('DL', ['ground'])]),
  defense('flying_gust', 'Rajada', 'MAN', 'flying', [byType('CB', ['flying'])]),
  defense('psychic_foresight', 'Previsão', 'ZONE_SHORT', 'psychic', [byType('S', ['psychic'])]),
  defense('bug_string_shot', 'Teia', 'ZONE_SHORT', 'bug', [byType('CB', ['bug'])]),
  defense('rock_slide_wall', 'Rock Slide Wall', 'RUN_STUFF', 'rock', [byType('DL', ['rock', 'ground'], 3)]),
  defense('ghost_lick', 'Lambida', 'MAN', 'ghost', [byType('CB', ['ghost'])]),
  defense('dragon_wrath', 'Ira Dracônica', 'BLITZ', 'dragon', [byType('DL', ['dragon'])]),

  // Assinatura
  offense('sig_snorlax_wall', 'Muralha Snorlax', 'RUN_INSIDE', 'normal', [bySpecies('OL', [143])], 'SIGNATURE', 5),
  offense('sig_fly_route', 'Fly Route', 'DEEP_PASS', 'flying', [bySpecies('WR', [17, 18])], 'SIGNATURE', 22),
  offense('sig_mewtwo_mind', 'Mente Mewtwo', 'PLAY_ACTION', 'psychic', [bySpecies('QB', [150])], 'SIGNATURE', 15),
  defense('sig_scyther_blade', 'Lâmina Scyther', 'MAN', 'bug', [bySpecies('CB', [123])], 'SIGNATURE'),
  defense('sig_gyarados_hyper_beam', 'Hiper Raio Gyarados', 'BLITZ', 'water', [bySpecies('DL', [130])], 'SIGNATURE'),
];

const BY_ID = new Map(CARDS.map((c) => [c.id, c]));

export function findCard(id: string): Card | undefined {
  return BY_ID.get(id);
}

export function getCard(id: string): Card {
  const card = BY_ID.get(id);
  if (!card) throw new Error(`Carta desconhecida: ${id}`);
  return card;
}
```

- [ ] **Step 9: Implementar a elegibilidade**

`packages/engine/src/cards/eligibility.ts`:
```ts
import type { Card, Lineup, Requirement, Species } from '../model';
import { getSpecies } from '../species';
import { slotsOf } from '../formations';

export function matchesRequirement(species: Species, req: Requirement): boolean {
  if (req.species && !req.species.includes(species.id)) return false;
  if (req.types && !species.types.some((t) => req.types!.includes(t))) return false;
  return true;
}

/** Montagem do deck: qualquer Pokémon pode jogar em qualquer posição, então só o elenco importa. */
export function canIncludeInDeck(card: Card, roster: readonly number[]): boolean {
  return card.requirements.every(
    (req) => roster.filter((id) => matchesRequirement(getSpecies(id), req)).length >= (req.count ?? 1),
  );
}

/** Em campo: os requisitos precisam ser cumpridos pelas vagas da posição exigida. */
export function canPlay(card: Card, lineup: Lineup): boolean {
  return card.requirements.every(
    (req) =>
      slotsOf(lineup, req.position).filter((slot) => matchesRequirement(getSpecies(lineup[slot] as number), req))
        .length >= (req.count ?? 1),
  );
}
```

Adicionar em `index.ts`:
```ts
export * from './formations';
export * from './cards/categories';
export * from './cards/catalog';
export * from './cards/eligibility';
```

- [ ] **Step 10: Rodar os testes**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): formações, matriz de leitura e catálogo inicial de cartas"
```

---

### Task 5: Time — custo, aptidão e validação

**Files:**
- Create: `packages/engine/src/team.ts`, `packages/engine/test/fixtures.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/test/team.test.ts`

**Interfaces:**
- Consumes: `getSpecies`, `hasSpecies`, `LEGENDARY_IDS` (Task 2); `FORMATIONS`, `PACKAGES`, `fillSlots`, `findCard`, `canIncludeInDeck` (Task 4).
- Produces:
  - Constantes `SALARY_CAP = 120`, `ROSTER_SIZE = 16`, `DECK_SIZE = 12`, `MAX_COPIES = 2`, `MAX_LEGENDARIES = 1`
  - `bst(species: Species): number`, `speciesCost(id: number): number`, `teamCost(team: Team): number`
  - `aptitude(id: number, position: Position): number` (1–5)
  - `validateTeam(team: unknown): TeamError[]` (vazio = válido)
  - Fixture de teste `electricTeam(name?: string): Team` em `test/fixtures.ts`, usada pelas Tasks 6–10

- [ ] **Step 1: Criar a fixture de teste**

`packages/engine/test/fixtures.ts`:
```ts
import type { Team } from '../src/model';

/**
 * Time válido de teste (custo 72, abaixo do teto de 120).
 * 25 Pikachu, 26 Raichu, 100 Voltorb, 81 Magnemite, 125 Electabuzz, 74 Geodude, 95 Onix, 66 Machop,
 * 19 Rattata, 16 Pidgey, 21 Spearow, 50 Diglett, 54 Psyduck, 63 Abra, 10 Caterpie, 13 Weedle; especialista 129 Magikarp.
 */
export function electricTeam(name = 'Kanto Thunder'): Team {
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
```

- [ ] **Step 2: Escrever o teste (deve falhar)**

`packages/engine/test/team.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { speciesCost, teamCost, aptitude, validateTeam, SALARY_CAP } from '../src/team';
import { electricTeam } from './fixtures';

const codes = (team: unknown) => validateTeam(team).map((e) => e.code);

describe('custo', () => {
  it('segue os exemplos da spec', () => {
    expect(speciesCost(129)).toBe(1); // Magikarp
    expect(speciesCost(25)).toBe(5); // Pikachu
    expect(speciesCost(143)).toBe(12); // Snorlax
    expect(speciesCost(149)).toBe(14); // Dragonite
    expect(speciesCost(150)).toBe(17); // Mewtwo
  });

  it('soma o elenco e o especialista', () => {
    const team = electricTeam();
    const manual = [...team.roster, team.specialist].reduce((s, id) => s + speciesCost(id), 0);
    expect(teamCost(team)).toBe(manual);
    expect(teamCost(team)).toBeLessThanOrEqual(SALARY_CAP);
  });
});

describe('aptidão', () => {
  it('fica entre 1 e 5 e reflete os stats', () => {
    expect(aptitude(143, 'OL')).toBeGreaterThan(aptitude(143, 'WR')); // Snorlax
    expect(aptitude(135, 'WR')).toBe(5); // Jolteon
    expect(aptitude(143, 'WR')).toBe(1);
  });
});

describe('validateTeam', () => {
  it('aceita a fixture', () => {
    expect(validateTeam(electricTeam())).toEqual([]);
  });

  it('rejeita time malformado sem lançar exceção', () => {
    expect(codes({})).toEqual(['MALFORMED_TEAM']);
    expect(codes(null)).toEqual(['MALFORMED_TEAM']);
    expect(codes({ ...electricTeam(), roster: ['25'] })).toEqual(['MALFORMED_TEAM']);
  });

  it('rejeita espécie inexistente', () => {
    expect(codes({ ...electricTeam(), specialist: 999 })).toEqual(['UNKNOWN_SPECIES']);
  });

  it('rejeita tamanho de elenco errado e espécie repetida', () => {
    const t = electricTeam();
    expect(codes({ ...t, roster: t.roster.slice(1) })).toContain('ROSTER_SIZE');
    expect(codes({ ...t, roster: [26, ...t.roster.slice(1)] })).toContain('DUPLICATE_SPECIES'); // Raichu duas vezes
  });

  it('rejeita mais de um lendário', () => {
    const t = electricTeam();
    expect(codes({ ...t, roster: [144, 145, ...t.roster.slice(2)] })).toContain('TOO_MANY_LEGENDARIES');
  });

  it('rejeita time acima do teto', () => {
    const expensive = [3, 6, 9, 149, 143, 130, 131, 59, 65, 68, 76, 94, 112, 134, 135, 136];
    expect(codes({ ...electricTeam(), roster: expensive })).toContain('OVER_CAP');
  });

  it('valida os decks', () => {
    const t = electricTeam();
    expect(codes({ ...t, offenseDeck: t.offenseDeck.slice(1) })).toContain('DECK_SIZE_OFFENSE');
    expect(codes({ ...t, offenseDeck: [...t.offenseDeck.slice(0, 9), 'normal_tackle', 'normal_tackle', 'normal_tackle'] })).toContain('DECK_COPIES');
    expect(codes({ ...t, offenseDeck: [...t.offenseDeck.slice(1), 'fire_deep'] })).toContain('CARD_NOT_ELIGIBLE');
    expect(codes({ ...t, offenseDeck: [...t.offenseDeck.slice(1), 'basic_run'] })).toContain('CARD_NOT_ALLOWED');
    expect(codes({ ...t, offenseDeck: [...t.offenseDeck.slice(1), 'normal_wall'] })).toContain('CARD_NOT_ALLOWED');
    expect(codes({ ...t, defenseDeck: [...t.defenseDeck.slice(1), 'xyz'] })).toContain('UNKNOWN_CARD');
  });

  it('valida o depth chart', () => {
    const t = electricTeam();
    expect(codes({ ...t, depth: { ...t.depth, QB: [150] } })).toContain('DEPTH_NOT_IN_ROSTER');
    expect(codes({ ...t, depth: { ...t.depth, TE: [] } })).toContain('FORMATION_UNFILLABLE');
    expect(codes({ ...t, depth: { ...t.depth, S2: [] } })).toContain('PACKAGE_UNFILLABLE');
    expect(codes({ ...t, keepOnField: [150] })).toContain('KEEP_NOT_IN_ROSTER');
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run packages/engine/test/team.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 4: Implementar `team.ts`**

`packages/engine/src/team.ts`:
```ts
import type { CardSide, Position, Species, StatKey, Team, TeamError } from './model';
import { getSpecies, hasSpecies, LEGENDARY_IDS } from './species';
import { FORMATIONS, PACKAGES, fillSlots } from './formations';
import { findCard } from './cards/catalog';
import { canIncludeInDeck } from './cards/eligibility';

export const SALARY_CAP = 120;
export const ROSTER_SIZE = 16;
export const DECK_SIZE = 12;
export const MAX_COPIES = 2;
export const MAX_LEGENDARIES = 1;

export function bst(species: Species): number {
  const s = species.stats;
  return s.hp + s.attack + s.defense + s.spAttack + s.spDefense + s.speed;
}

export function speciesCost(id: number): number {
  return Math.max(1, Math.round((bst(getSpecies(id)) - 180) / 30));
}

export function teamCost(team: Team): number {
  return [...team.roster, team.specialist].reduce((sum, id) => sum + speciesCost(id), 0);
}

/** Pesos por posição (spec 4.2), usados na nota de aptidão. */
export const POSITION_WEIGHTS: Record<Position, Partial<Record<StatKey, number>>> = {
  QB: { spAttack: 0.7, spDefense: 0.2, speed: 0.1 },
  OL: { defense: 0.5, attack: 0.3, hp: 0.2 },
  RB: { speed: 0.5, attack: 0.4, hp: 0.1 },
  WR: { speed: 0.7, attack: 0.2, spDefense: 0.1 },
  TE: { attack: 0.4, defense: 0.3, speed: 0.3 },
  FB: { attack: 0.5, defense: 0.3, hp: 0.2 },
  DL: { attack: 0.5, defense: 0.3, hp: 0.2 },
  LB: { attack: 0.4, speed: 0.3, spDefense: 0.3 },
  CB: { speed: 0.7, spDefense: 0.3 },
  S: { spDefense: 0.5, speed: 0.5 },
};
const APTITUDE_THRESHOLDS = [55, 70, 85, 100];

export function aptitude(id: number, position: Position): number {
  const stats = getSpecies(id).stats;
  const score = Object.entries(POSITION_WEIGHTS[position]).reduce(
    (sum, [key, w]) => sum + stats[key as StatKey] * (w as number),
    0,
  );
  return 1 + APTITUDE_THRESHOLDS.filter((t) => score >= t).length;
}

const isIntArray = (v: unknown): v is number[] => Array.isArray(v) && v.every((n) => Number.isInteger(n));
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');

function isTeamShape(value: unknown): value is Team {
  if (!value || typeof value !== 'object') return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.name === 'string' &&
    isIntArray(t.roster) &&
    Number.isInteger(t.specialist) &&
    isIntArray(t.keepOnField) &&
    isStringArray(t.offenseDeck) &&
    isStringArray(t.defenseDeck) &&
    !!t.depth &&
    typeof t.depth === 'object' &&
    Object.values(t.depth as object).every(isIntArray)
  );
}

function validateDeck(deck: string[], side: CardSide, roster: number[]): TeamError[] {
  const errors: TeamError[] = [];
  if (deck.length !== DECK_SIZE) errors.push({ code: `DECK_SIZE_${side}`, detail: String(deck.length) });
  const copies = new Map<string, number>();
  for (const id of deck) {
    copies.set(id, (copies.get(id) ?? 0) + 1);
    const card = findCard(id);
    if (!card) {
      errors.push({ code: 'UNKNOWN_CARD', detail: id });
    } else if (card.side !== side || card.origin === 'BASIC' || card.origin === 'SPECIAL') {
      errors.push({ code: 'CARD_NOT_ALLOWED', detail: id });
    } else if (!canIncludeInDeck(card, roster)) {
      errors.push({ code: 'CARD_NOT_ELIGIBLE', detail: id });
    }
  }
  for (const [id, n] of copies) if (n > MAX_COPIES) errors.push({ code: 'DECK_COPIES', detail: id });
  return errors;
}

function validateDepth(team: Team): TeamError[] {
  const errors: TeamError[] = [];
  const roster = new Set(team.roster);
  for (const [slot, ids] of Object.entries(team.depth)) {
    for (const id of ids ?? []) if (!roster.has(id)) errors.push({ code: 'DEPTH_NOT_IN_ROSTER', detail: `${slot}:${id}` });
  }
  for (const id of team.keepOnField) if (!roster.has(id)) errors.push({ code: 'KEEP_NOT_IN_ROSTER', detail: String(id) });
  for (const [id, slots] of Object.entries(FORMATIONS)) {
    if (!fillSlots(slots, team.depth)) errors.push({ code: 'FORMATION_UNFILLABLE', detail: id });
  }
  for (const [id, slots] of Object.entries(PACKAGES)) {
    if (!fillSlots(slots, team.depth)) errors.push({ code: 'PACKAGE_UNFILLABLE', detail: id });
  }
  return errors;
}

/** Lista vazia = time válido (spec 5.5). Nunca lança exceção: o time pode vir de um código importado. */
export function validateTeam(value: unknown): TeamError[] {
  if (!isTeamShape(value)) return [{ code: 'MALFORMED_TEAM' }];
  const team = value;
  const all = [...team.roster, team.specialist];
  const unknown = all.filter((id) => !hasSpecies(id));
  if (unknown.length) return unknown.map((id) => ({ code: 'UNKNOWN_SPECIES', detail: String(id) }));

  const errors: TeamError[] = [];
  if (team.roster.length !== ROSTER_SIZE) errors.push({ code: 'ROSTER_SIZE', detail: String(team.roster.length) });
  if (new Set(all).size !== all.length) errors.push({ code: 'DUPLICATE_SPECIES' });
  if (all.filter((id) => LEGENDARY_IDS.includes(id)).length > MAX_LEGENDARIES) errors.push({ code: 'TOO_MANY_LEGENDARIES' });
  const cost = teamCost(team);
  if (cost > SALARY_CAP) errors.push({ code: 'OVER_CAP', detail: String(cost) });
  errors.push(...validateDeck(team.offenseDeck, 'OFFENSE', team.roster));
  errors.push(...validateDeck(team.defenseDeck, 'DEFENSE', team.roster));
  errors.push(...validateDepth(team));
  return errors;
}
```

Adicionar em `index.ts`:
```ts
export * from './team';
```

- [ ] **Step 5: Rodar os testes**

Run: `npm test && npm run typecheck`
Expected: PASS. Se `validateTeam(electricTeam())` não vier vazio, imprima os erros (`console.log(validateTeam(electricTeam()))`) e corrija a **fixture**, não a regra.

- [ ] **Step 6: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): custo, aptidão e validação de time"
```

---

### Task 6: Escalação e fadiga

**Files:**
- Create: `packages/engine/src/fatigue.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/test/fatigue.test.ts`

**Interfaces:**
- Consumes: `getSpecies` (Task 2); `fillSlots`, `slotPosition`, `FORMATIONS`, `PACKAGES` (Task 4); fixture `electricTeam` (Task 5).
- Produces:
  - `FATIGUE` (parâmetros)
  - `threshold(id: number): number`
  - `fatigueMultiplier(id: number, level: number): number`
  - `initialFatigue(): FatigueState`
  - `pickLineup(slots: readonly SlotId[], team: Team, fatigue: FatigueState): Lineup`
  - `applyPlayFatigue(state: FatigueState, team: Team, lineup: Lineup, actors: readonly number[]): FatigueState`
  - `recoverBetweenDrives(state: FatigueState, team: Team): FatigueState`

- [ ] **Step 1: Escrever o teste (deve falhar)**

`packages/engine/test/fatigue.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  threshold, fatigueMultiplier, initialFatigue, pickLineup, applyPlayFatigue, recoverBetweenDrives,
} from '../src/fatigue';
import { FORMATIONS, PACKAGES } from '../src/formations';
import type { FatigueState } from '../src/model';
import { electricTeam } from './fixtures';

const team = electricTeam();

describe('limiar e penalidade', () => {
  it('limiar é 2, ou 3 com HP ≥ 100', () => {
    expect(threshold(25)).toBe(2); // Pikachu
    expect(threshold(143)).toBe(3); // Snorlax
  });

  it('penaliza 10% por nível acima do limiar, com piso de 50%', () => {
    expect(fatigueMultiplier(25, 2)).toBe(1);
    expect(fatigueMultiplier(25, 3)).toBeCloseTo(0.9);
    expect(fatigueMultiplier(25, 10)).toBe(0.5);
  });
});

describe('pickLineup', () => {
  it('usa os titulares do depth chart', () => {
    expect(pickLineup(FORMATIONS.PISTOL, team, initialFatigue())).toEqual({
      QB: 63, OL1: 95, OL2: 74, OL3: 66, RB: 25, WR1: 26, WR2: 125,
    });
    expect(pickLineup(PACKAGES.BASE, team, initialFatigue())).toEqual({
      DL1: 95, DL2: 74, DL3: 50, LB1: 66, CB1: 26, CB2: 100, S1: 63,
    });
  });

  it('troca um titular que está descansando', () => {
    const lineup = pickLineup(FORMATIONS.PISTOL, team, { levels: { 63: 2 }, resting: [63] });
    expect(lineup.QB).toBe(54);
  });

  it('escala um cansado se todos os candidatos estiverem descansando', () => {
    const lineup = pickLineup(FORMATIONS.PISTOL, team, { levels: { 63: 2, 54: 2 }, resting: [63, 54] });
    expect(lineup.QB).toBe(63);
    expect(Object.keys(lineup)).toHaveLength(7);
  });
});

describe('fadiga por jogada', () => {
  const lineup = pickLineup(FORMATIONS.PISTOL, team, initialFatigue());

  it('ator ganha 1; QB e OL ganham ½', () => {
    const f = applyPlayFatigue(initialFatigue(), team, lineup, [25, 63, 95]);
    expect(f.levels[25]).toBe(1);
    expect(f.levels[63]).toBe(0.5);
    expect(f.levels[95]).toBe(0.5);
  });

  it('ao atingir o limiar entra em descanso, a menos que esteja em "manter em campo"', () => {
    let f = initialFatigue();
    f = applyPlayFatigue(f, team, lineup, [25]);
    f = applyPlayFatigue(f, team, lineup, [25]);
    expect(f.resting).toContain(25);

    const keep = { ...team, keepOnField: [25] };
    let g = initialFatigue();
    g = applyPlayFatigue(g, keep, lineup, [25]);
    g = applyPlayFatigue(g, keep, lineup, [25]);
    expect(g.resting).not.toContain(25);
  });

  it('fora de campo recupera 1 por jogada e só sai do descanso com fadiga 0', () => {
    const benchLineup = { ...lineup, RB: 50 };
    let f: FatigueState = { levels: { 25: 2 }, resting: [25] };
    f = applyPlayFatigue(f, team, benchLineup, []);
    expect(f.levels[25]).toBe(1);
    expect(f.resting).toContain(25);
    f = applyPlayFatigue(f, team, benchLineup, []);
    expect(f.levels[25]).toBe(0);
    expect(f.resting).not.toContain(25);
  });

  it('entre drives recupera 2 níveis, sem zerar', () => {
    const f = recoverBetweenDrives({ levels: { 25: 3, 63: 1 }, resting: [25] }, team);
    expect(f.levels[25]).toBe(1);
    expect(f.levels[63]).toBe(0);
    expect(f.resting).toContain(25);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/engine/test/fatigue.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 3: Implementar**

`packages/engine/src/fatigue.ts`:
```ts
import type { FatigueState, Lineup, SlotId, Team } from './model';
import { getSpecies } from './species';
import { fillSlots, slotPosition } from './formations';

// Spec 3.6. Parâmetros calibráveis pelo simulador (Plano 2).
export const FATIGUE = {
  gain: 1,
  gainQbOl: 0.5,
  baseThreshold: 2,
  highHpThreshold: 3,
  highHp: 100,
  recoverPerPlayOff: 1,
  recoverBetweenDrives: 2,
  penaltyPerLevel: 0.1,
  minMultiplier: 0.5,
};

export function threshold(id: number): number {
  return getSpecies(id).stats.hp >= FATIGUE.highHp ? FATIGUE.highHpThreshold : FATIGUE.baseThreshold;
}

export function fatigueMultiplier(id: number, level: number): number {
  const over = Math.max(0, Math.floor(level) - threshold(id));
  return Math.max(FATIGUE.minMultiplier, 1 - over * FATIGUE.penaltyPerLevel);
}

export function initialFatigue(): FatigueState {
  return { levels: {}, resting: [] };
}

/** Prefere quem não está descansando; se a vaga não tiver alternativa, escala um cansado. */
export function pickLineup(slots: readonly SlotId[], team: Team, fatigue: FatigueState): Lineup {
  const resting = new Set(fatigue.resting);
  const lineup = fillSlots(slots, team.depth, (id) => !resting.has(id)) ?? fillSlots(slots, team.depth);
  if (!lineup) throw new Error(`Depth chart não preenche ${slots.join(',')}`);
  return lineup;
}

function updateResting(team: Team, levels: Record<number, number>, resting: readonly number[]): number[] {
  const set = new Set(resting);
  for (const id of team.roster) {
    const level = levels[id] ?? 0;
    if (level <= 0) set.delete(id);
    else if (level >= threshold(id) && !team.keepOnField.includes(id)) set.add(id);
  }
  return team.roster.filter((id) => set.has(id));
}

export function applyPlayFatigue(
  state: FatigueState,
  team: Team,
  lineup: Lineup,
  actors: readonly number[],
): FatigueState {
  const levels = { ...state.levels };
  const slotOf = new Map<number, SlotId>();
  for (const [slot, id] of Object.entries(lineup) as [SlotId, number][]) slotOf.set(id, slot);

  for (const id of team.roster) {
    if (!slotOf.has(id)) levels[id] = Math.max(0, (levels[id] ?? 0) - FATIGUE.recoverPerPlayOff);
  }
  for (const id of actors) {
    const slot = slotOf.get(id);
    if (!slot) continue;
    const position = slotPosition(slot);
    levels[id] = (levels[id] ?? 0) + (position === 'QB' || position === 'OL' ? FATIGUE.gainQbOl : FATIGUE.gain);
  }
  return { levels, resting: updateResting(team, levels, state.resting) };
}

export function recoverBetweenDrives(state: FatigueState, team: Team): FatigueState {
  const levels: Record<number, number> = {};
  for (const [id, level] of Object.entries(state.levels)) {
    levels[Number(id)] = Math.max(0, level - FATIGUE.recoverBetweenDrives);
  }
  return { levels, resting: updateResting(team, levels, state.resting) };
}
```

Adicionar em `index.ts`:
```ts
export * from './fatigue';
```

- [ ] **Step 4: Rodar os testes**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): escalação por depth chart e fadiga"
```

---

### Task 7: Resolução de jogadas e chutes

**Files:**
- Create: `packages/engine/src/resolve.ts`, `packages/engine/src/specials.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/test/resolve.test.ts`, `packages/engine/test/specials.test.ts`

**Interfaces:**
- Consumes: `rngNext` (Task 1); `getSpecies` (Task 2); `effectiveness`, `typeModifier` (Task 3); `slotsOf`, `OFFENSE_PROFILES`, `readResult`, `matchesRequirement` (Task 4); `fatigueMultiplier`, `pickLineup`, `initialFatigue` (Task 6); fixture (Task 5).
- Produces:
  - `PlayInput { offCard: Card; defCard: Card; offLineup: Lineup; defLineup: Lineup; offFatigue: Record<number, number>; defFatigue: Record<number, number>; rng: number }`
  - `resolvePlay(input: PlayInput): { outcome: PlayOutcome; rng: number }`
  - `MATCHUPS`, `FALLBACK`
  - `resolvePunt(specialist: number, rng: number): { distance: number; rng: number }`
  - `fieldGoalDistance(ballOn: number): number`
  - `fieldGoalProbability(distance: number, specialist: number): number`
  - `resolveFieldGoal(ballOn: number, specialist: number, rng: number): { distance: number; good: boolean; rng: number }`
  - `resolvePat(specialist: number, rng: number): { good: boolean; rng: number }`
  - `PAT_PROBABILITY`

- [ ] **Step 1: Escrever o teste de resolução (deve falhar)**

`packages/engine/test/resolve.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resolvePlay, type PlayInput } from '../src/resolve';
import { pickLineup, initialFatigue } from '../src/fatigue';
import { FORMATIONS, PACKAGES } from '../src/formations';
import type { Card, OffenseCategory, DefenseCategory, PokemonType } from '../src/model';
import { electricTeam } from './fixtures';

const team = electricTeam();
const offLineup = pickLineup(FORMATIONS.PISTOL, team, initialFatigue());
const defLineup = pickLineup(PACKAGES.BASE, team, initialFatigue());

const offCard = (category: OffenseCategory, element: PokemonType | null = null): Card =>
  ({ id: `t_${category}`, name: 't', side: 'OFFENSE', category, origin: 'TYPE', element, requirements: [] });
const defCard = (category: DefenseCategory, element: PokemonType | null = null): Card =>
  ({ id: `t_${category}`, name: 't', side: 'DEFENSE', category, origin: 'TYPE', element, requirements: [] });

const input = (o: Card, d: Card, rng: number, offFatigue: Record<number, number> = {}): PlayInput =>
  ({ offCard: o, defCard: d, offLineup, defLineup, offFatigue, defFatigue: {}, rng });

const N = 3000;
const avgYards = (o: Card, d: Card, offFatigue: Record<number, number> = {}): number => {
  let total = 0;
  for (let i = 0; i < N; i++) {
    const { outcome } = resolvePlay(input(o, d, i * 7919 + 1, offFatigue));
    if (outcome.kind === 'GAIN' || outcome.kind === 'SACK') total += outcome.yards;
  }
  return total / N;
};
const kinds = (o: Card, d: Card): Set<string> => {
  const set = new Set<string>();
  for (let i = 0; i < 2000; i++) set.add(resolvePlay(input(o, d, i * 104729 + 3)).outcome.kind);
  return set;
};

describe('resolvePlay', () => {
  it('é determinístico', () => {
    const a = resolvePlay(input(offCard('DEEP_PASS'), defCard('MAN'), 12345));
    const b = resolvePlay(input(offCard('DEEP_PASS'), defCard('MAN'), 12345));
    expect(a).toEqual(b);
  });

  it('leitura domina: ✔ < · < ✖ em jardas médias', () => {
    const run = offCard('RUN_INSIDE');
    const right = avgYards(run, defCard('RUN_STUFF'));
    const neutral = avgYards(run, defCard('ZONE_SHORT'));
    const wrong = avgYards(run, defCard('MAN'));
    expect(right).toBeLessThan(neutral);
    expect(neutral).toBeLessThan(wrong);
  });

  it('confronto de tipo pesa: água contra linha de pedra/terra rende mais; elétrico contra terra rende menos', () => {
    const d = defCard('ZONE_SHORT');
    const plain = avgYards(offCard('RUN_INSIDE'), d);
    expect(avgYards(offCard('RUN_INSIDE', 'water'), d)).toBeGreaterThan(plain);
    expect(avgYards(offCard('RUN_INSIDE', 'electric'), d)).toBeLessThan(plain);
  });

  it('fadiga do ator reduz o rendimento', () => {
    const o = offCard('RUN_INSIDE');
    const d = defCard('ZONE_SHORT');
    expect(avgYards(o, d, { 25: 6 })).toBeLessThan(avgYards(o, d));
  });

  it('corrida nunca gera sack, passe incompleto ou interceptação', () => {
    const set = kinds(offCard('RUN_INSIDE'), defCard('RUN_STUFF'));
    expect([...set].every((k) => k === 'GAIN' || k === 'FUMBLE')).toBe(true);
  });

  it('passe longo contra blitz gera sacks', () => {
    expect(kinds(offCard('DEEP_PASS'), defCard('BLITZ')).has('SACK')).toBe(true);
  });

  it('passe inclui QB e linha ofensiva entre os atores', () => {
    const { outcome } = resolvePlay(input(offCard('SHORT_PASS'), defCard('ZONE_SHORT'), 1));
    expect(outcome.offActors).toEqual(expect.arrayContaining([63, 95, 74, 66]));
    expect(outcome.defActors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Escrever o teste de chutes (deve falhar)**

`packages/engine/test/specials.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resolvePunt, fieldGoalDistance, fieldGoalProbability, resolveFieldGoal, resolvePat } from '../src/specials';

describe('chutes', () => {
  it('distância do FG = jardas até a end zone + 17', () => {
    expect(fieldGoalDistance(75)).toBe(42);
  });

  it('probabilidade de FG cai com a distância e sobe com o Sp. Atk do kicker', () => {
    expect(fieldGoalProbability(20, 65)).toBeGreaterThan(fieldGoalProbability(50, 65)); // Alakazam
    expect(fieldGoalProbability(30, 65)).toBeGreaterThan(fieldGoalProbability(30, 129)); // vs Magikarp
    expect(fieldGoalProbability(90, 129)).toBe(0.05);
    expect(fieldGoalProbability(1, 65)).toBe(0.98);
  });

  it('punt fica na faixa esperada e é determinístico', () => {
    for (let seed = 1; seed < 200; seed++) {
      const { distance } = resolvePunt(129, seed); // Magikarp: 30 + 1,25 ± 5
      expect(distance).toBeGreaterThanOrEqual(26);
      expect(distance).toBeLessThanOrEqual(37);
    }
    expect(resolvePunt(65, 9)).toEqual(resolvePunt(65, 9));
  });

  it('FG e PAT consomem RNG de forma determinística', () => {
    expect(resolveFieldGoal(70, 65, 5)).toEqual(resolveFieldGoal(70, 65, 5));
    const pat = resolvePat(129, 5);
    expect(pat.rng).not.toBe(5);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run packages/engine/test/resolve.test.ts packages/engine/test/specials.test.ts`
Expected: FAIL — imports não resolvidos.

- [ ] **Step 4: Implementar `resolve.ts`**

`packages/engine/src/resolve.ts`:
```ts
import type { Card, DefenseCategory, Lineup, OffenseCategory, PlayKind, PlayOutcome, PokemonType, Position, ReadResult, StatKey } from './model';
import { getSpecies } from './species';
import { slotsOf } from './formations';
import { effectiveness, typeModifier } from './typechart';
import { fatigueMultiplier } from './fatigue';
import { rngNext } from './rng';
import { OFFENSE_PROFILES, readResult } from './cards/categories';
import { matchesRequirement } from './cards/eligibility';

type Weights = Partial<Record<StatKey, number>>;
interface ActorSpec {
  position: Position;
  weights: Weights;
}
interface Matchup {
  protection: boolean;
  off: ActorSpec[];
  def: ActorSpec[];
}

/** Se a posição não está em campo, tenta a próxima da lista. */
export const FALLBACK: Record<Position, Position[]> = {
  QB: ['QB'],
  OL: ['OL'],
  RB: ['RB', 'FB', 'WR', 'QB'],
  WR: ['WR', 'TE', 'RB', 'FB'],
  TE: ['TE', 'WR', 'FB', 'RB'],
  FB: ['FB', 'RB', 'TE', 'WR'],
  DL: ['DL', 'LB'],
  LB: ['LB', 'S', 'CB'],
  CB: ['CB', 'S', 'LB'],
  S: ['S', 'CB', 'LB'],
};

/** Linhas (OL/DL) entram como grupo: a média de todas as vagas da posição. */
const GROUP_POSITIONS: Position[] = ['OL', 'DL'];

const PROTECTION_OFF: ActorSpec = { position: 'OL', weights: { defense: 1 } };
const PROTECTION_DEF: ActorSpec = { position: 'DL', weights: { attack: 1 } };

// Spec 4.2: quais atributos se enfrentam em cada categoria.
export const MATCHUPS: Record<OffenseCategory, Matchup> = {
  RUN_INSIDE: {
    protection: false,
    off: [{ position: 'RB', weights: { attack: 0.5, speed: 0.5 } }, { position: 'OL', weights: { attack: 1 } }],
    def: [{ position: 'DL', weights: { defense: 1 } }, { position: 'LB', weights: { attack: 1 } }],
  },
  RUN_OUTSIDE: {
    protection: false,
    off: [{ position: 'RB', weights: { speed: 1 } }, { position: 'WR', weights: { attack: 1 } }],
    def: [{ position: 'CB', weights: { speed: 1 } }, { position: 'LB', weights: { speed: 1 } }],
  },
  SHORT_PASS: {
    protection: true,
    off: [{ position: 'QB', weights: { spAttack: 1 } }, { position: 'WR', weights: { speed: 0.6, attack: 0.4 } }],
    def: [{ position: 'CB', weights: { speed: 0.6, spDefense: 0.4 } }, { position: 'LB', weights: { spDefense: 1 } }],
  },
  DEEP_PASS: {
    protection: true,
    off: [{ position: 'QB', weights: { spAttack: 1 } }, { position: 'WR', weights: { speed: 1 } }],
    def: [{ position: 'CB', weights: { speed: 1 } }, { position: 'S', weights: { spDefense: 1 } }],
  },
  SCREEN: {
    protection: false,
    off: [{ position: 'RB', weights: { speed: 0.5, attack: 0.5 } }, { position: 'OL', weights: { attack: 1 } }],
    def: [{ position: 'LB', weights: { speed: 1 } }, { position: 'CB', weights: { attack: 1 } }],
  },
  PLAY_ACTION: {
    protection: true,
    off: [{ position: 'QB', weights: { spAttack: 1 } }, { position: 'WR', weights: { speed: 1 } }],
    def: [{ position: 'S', weights: { spDefense: 1 } }, { position: 'LB', weights: { spDefense: 1 } }],
  },
};

// Spec 4.3
const READ_YARDS: Record<ReadResult, number> = { WRONG: 1.6, NEUTRAL: 1, RIGHT: 0.4 };
const READ_INCOMPLETION: Record<ReadResult, number> = { WRONG: 0.5, NEUTRAL: 1, RIGHT: 1.5 };
const READ_BIG_PLAY: Record<ReadResult, number> = { WRONG: 2, NEUTRAL: 1, RIGHT: 0.25 };
const STUFF_PENALTY = 2;
const AFFINITY_BONUS = 0.1;

export interface PlayInput {
  offCard: Card;
  defCard: Card;
  offLineup: Lineup;
  defLineup: Lineup;
  offFatigue: Record<number, number>;
  defFatigue: Record<number, number>;
  rng: number;
}

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const unique = (xs: number[]): number[] => [...new Set(xs)];

function pickActors(lineup: Lineup, position: Position, taken: Set<number>, prefer: (id: number) => boolean): number[] {
  for (const pos of FALLBACK[position]) {
    const ids = slotsOf(lineup, pos)
      .map((slot) => lineup[slot] as number)
      .filter((id) => !taken.has(id));
    if (ids.length === 0) continue;
    if (GROUP_POSITIONS.includes(pos)) return ids;
    return [ids.find(prefer) ?? ids[0]];
  }
  return [];
}

function weighted(id: number, weights: Weights, level: number): number {
  const stats = getSpecies(id).stats;
  let sum = 0;
  for (const [key, w] of Object.entries(weights) as [StatKey, number][]) sum += stats[key] * w;
  return sum * fatigueMultiplier(id, level);
}

function scoreSide(
  lineup: Lineup,
  specs: ActorSpec[],
  fatigue: Record<number, number>,
  prefer: (id: number) => boolean,
): { score: number; actors: number[] } {
  const taken = new Set<number>();
  const parts: number[] = [];
  for (const spec of specs) {
    const ids = pickActors(lineup, spec.position, taken, prefer);
    if (ids.length === 0) continue;
    ids.forEach((id) => taken.add(id));
    parts.push(mean(ids.map((id) => weighted(id, spec.weights, fatigue[id] ?? 0))));
  }
  return { score: parts.length ? mean(parts) : 1, actors: [...taken] };
}

/** 1 + média dos modificadores de tipo contra os atores adversários + afinidade dos próprios atores. */
function typeMult(element: PokemonType | null, opposing: number[], own: number[]): number {
  if (!element || opposing.length === 0) return 1;
  const mods = opposing.map((id) => typeModifier(effectiveness(element, getSpecies(id).types)));
  const affinity = own.filter((id) => getSpecies(id).types.includes(element)).length * AFFINITY_BONUS;
  return 1 + mean(mods) + affinity;
}

export function resolvePlay(input: PlayInput): { outcome: PlayOutcome; rng: number } {
  const category = input.offCard.category as OffenseCategory;
  const matchup = MATCHUPS[category];
  const profile = OFFENSE_PROFILES[category];
  const read = readResult(input.defCard.category as DefenseCategory, category);

  // Sempre 5 sorteios, na mesma ordem, para manter o determinismo: sack, turnover, incompleto, big play, variância.
  let rng = input.rng;
  const u: number[] = [];
  for (let i = 0; i < 5; i++) {
    const r = rngNext(rng);
    u.push(r.value);
    rng = r.state;
  }

  const preferOff = (id: number) => input.offCard.requirements.some((r) => matchesRequirement(getSpecies(id), r));
  const preferDef = (id: number) => input.defCard.requirements.some((r) => matchesRequirement(getSpecies(id), r));
  const off = scoreSide(input.offLineup, matchup.off, input.offFatigue, preferOff);
  const def = scoreSide(input.defLineup, matchup.def, input.defFatigue, preferDef);

  const statFactor = clamp(off.score / def.score, 0.6, 1.4);
  const offTypeMult = typeMult(input.offCard.element, def.actors, off.actors);
  const defTypeMult = typeMult(input.defCard.element, off.actors, def.actors);
  const edge = (statFactor * offTypeMult) / defTypeMult;
  const riskMult = read === 'RIGHT' ? 2 : 1;
  const base = input.offCard.baseYards ?? profile.baseYards;
  const variance = 1 + profile.variance * (u[4] * 2 - 1);

  let offActors = off.actors;
  let defActors = def.actors;
  const make = (kind: PlayKind, yards: number, bigPlay = false): PlayOutcome =>
    ({ kind, yards, bigPlay, read, offActors, defActors, offTypeMult, defTypeMult });

  if (matchup.protection) {
    const ol = scoreSide(input.offLineup, [PROTECTION_OFF], input.offFatigue, preferOff);
    const dl = scoreSide(input.defLineup, [PROTECTION_DEF], input.defFatigue, preferDef);
    offActors = unique([...offActors, ...ol.actors]);
    defActors = unique([...defActors, ...dl.actors]);
    const pressure = clamp(dl.score / ol.score, 0.5, 2);
    if (u[0] < profile.risk.sack * riskMult * pressure) {
      return { outcome: make('SACK', -(4 + Math.floor(u[4] * 5))), rng };
    }
  }

  const isPass = matchup.protection || category === 'SCREEN';
  const rawYards = Math.round(base * READ_YARDS[read] * edge * variance) - (read === 'RIGHT' ? STUFF_PENALTY : 0);

  const turnoverRisk = ((isPass ? profile.risk.interception : profile.risk.fumble) * riskMult) / edge;
  if (u[1] < turnoverRisk) {
    return { outcome: isPass ? make('INTERCEPTION', base) : make('FUMBLE', Math.max(0, rawYards)), rng };
  }
  if (isPass && u[2] < clamp((profile.risk.incompletion * READ_INCOMPLETION[read]) / edge, 0, 0.9)) {
    return { outcome: make('INCOMPLETE', 0), rng };
  }
  if (u[3] < profile.risk.bigPlay * READ_BIG_PLAY[read] * edge) {
    return { outcome: make('GAIN', rawYards * 2 + 10, true), rng };
  }
  return { outcome: make('GAIN', rawYards), rng };
}
```

- [ ] **Step 5: Implementar `specials.ts`**

`packages/engine/src/specials.ts`:
```ts
import { getSpecies } from './species';
import { rngNext } from './rng';

export const PAT_PROBABILITY = 0.97;

/** Spec 2.2: distância depende de Sp. Atk e Attack do especialista. */
export function resolvePunt(specialist: number, rng: number): { distance: number; rng: number } {
  const s = getSpecies(specialist).stats;
  const r = rngNext(rng);
  return { distance: Math.round(30 + (s.spAttack + s.attack) / 20 + (r.value * 10 - 5)), rng: r.state };
}

export function fieldGoalDistance(ballOn: number): number {
  return 100 - ballOn + 17;
}

export function fieldGoalProbability(distance: number, specialist: number): number {
  const spAttack = getSpecies(specialist).stats.spAttack;
  return Math.min(0.98, Math.max(0.05, 1.05 - distance * 0.012 + (spAttack - 80) / 400));
}

export function resolveFieldGoal(ballOn: number, specialist: number, rng: number): { distance: number; good: boolean; rng: number } {
  const distance = fieldGoalDistance(ballOn);
  const r = rngNext(rng);
  return { distance, good: r.value < fieldGoalProbability(distance, specialist), rng: r.state };
}

export function resolvePat(specialist: number, rng: number): { good: boolean; rng: number } {
  getSpecies(specialist); // garante que o especialista existe
  const r = rngNext(rng);
  return { good: r.value < PAT_PROBABILITY, rng: r.state };
}
```

Adicionar em `index.ts`:
```ts
export * from './resolve';
export * from './specials';
```

- [ ] **Step 6: Rodar os testes**

Run: `npm test && npm run typecheck`
Expected: PASS. Os testes estatísticos usam seeds fixas, então o resultado é estável (não são flaky).

- [ ] **Step 7: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): pipeline de resolução (leitura > tipo > stats > variância) e chutes"
```

---

### Task 8: Campo — downs, fim de drive e posição inicial

**Files:**
- Create: `packages/engine/src/field.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/test/field.test.ts`

**Interfaces:**
- Consumes: `FieldState`, `PlayOutcome` (Task 1).
- Produces:
  - `DriveEnd` (union: `TOUCHDOWN | SAFETY | CONVERSION | FIELD_GOAL{good, ballOn} | PUNT{landing} | TURNOVER{spot} | DOWNS{spot}`)
  - `PlayAdvance { field: FieldState; firstDown: boolean; end: DriveEnd | null }`
  - `advanceField(field: FieldState, outcome: PlayOutcome): PlayAdvance`
  - `nextDriveStart(end: DriveEnd): number`
  - `TOUCHBACK = 25`, `MISSED_FG_MIN = 20`, `KICK_SPOT_OFFSET = 7`

- [ ] **Step 1: Escrever o teste (deve falhar)**

`packages/engine/test/field.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { advanceField, nextDriveStart } from '../src/field';
import type { PlayKind, PlayOutcome } from '../src/model';

const o = (kind: PlayKind, yards: number): PlayOutcome => ({
  kind, yards, bigPlay: false, read: 'NEUTRAL', offActors: [], defActors: [], offTypeMult: 1, defTypeMult: 1,
});
const first = (ballOn: number, yardsToGo = 10, down = 1) => ({ down, yardsToGo, ballOn });

describe('advanceField', () => {
  it('avança o down', () => {
    expect(advanceField(first(25), o('GAIN', 4))).toEqual({ field: { down: 2, yardsToGo: 6, ballOn: 29 }, firstDown: false, end: null });
  });

  it('dá first down', () => {
    expect(advanceField(first(25), o('GAIN', 12))).toEqual({ field: { down: 1, yardsToGo: 10, ballOn: 37 }, firstDown: true, end: null });
  });

  it('usa goal-to-go perto da end zone', () => {
    expect(advanceField(first(85), o('GAIN', 10)).field).toEqual({ down: 1, yardsToGo: 5, ballOn: 95 });
  });

  it('passe incompleto gasta o down sem mexer na bola', () => {
    expect(advanceField(first(40, 10, 2), o('INCOMPLETE', 0)).field).toEqual({ down: 3, yardsToGo: 10, ballOn: 40 });
  });

  it('sack aumenta a distância', () => {
    expect(advanceField(first(40), o('SACK', -6)).field).toEqual({ down: 2, yardsToGo: 16, ballOn: 34 });
  });

  it('touchdown e safety', () => {
    expect(advanceField(first(95, 5), o('GAIN', 5)).end).toEqual({ kind: 'TOUCHDOWN' });
    expect(advanceField(first(1), o('SACK', -6)).end).toEqual({ kind: 'SAFETY' });
  });

  it('turnover on downs no 4º down', () => {
    expect(advanceField(first(60, 5, 4), o('GAIN', 2)).end).toEqual({ kind: 'DOWNS', spot: 62 });
  });

  it('interceptação e fumble marcam o ponto do turnover', () => {
    expect(advanceField(first(40), o('INTERCEPTION', 18)).end).toEqual({ kind: 'TURNOVER', spot: 58 });
    expect(advanceField(first(98), o('FUMBLE', 5)).end).toEqual({ kind: 'TURNOVER', spot: 99 });
  });
});

describe('nextDriveStart', () => {
  it('após pontuar: touchback na 25', () => {
    expect(nextDriveStart({ kind: 'TOUCHDOWN' })).toBe(25);
    expect(nextDriveStart({ kind: 'SAFETY' })).toBe(25);
    expect(nextDriveStart({ kind: 'CONVERSION' })).toBe(25);
    expect(nextDriveStart({ kind: 'FIELD_GOAL', good: true, ballOn: 70 })).toBe(25);
  });

  it('FG errado: ponto do chute invertido, no mínimo na 20', () => {
    expect(nextDriveStart({ kind: 'FIELD_GOAL', good: false, ballOn: 70 })).toBe(37);
    expect(nextDriveStart({ kind: 'FIELD_GOAL', good: false, ballOn: 90 })).toBe(20);
  });

  it('punt: onde a bola parou, ou touchback se entrar na end zone', () => {
    expect(nextDriveStart({ kind: 'PUNT', landing: 80 })).toBe(20);
    expect(nextDriveStart({ kind: 'PUNT', landing: 105 })).toBe(25);
  });

  it('turnover e downs: campo invertido no ponto', () => {
    expect(nextDriveStart({ kind: 'TURNOVER', spot: 58 })).toBe(42);
    expect(nextDriveStart({ kind: 'DOWNS', spot: 62 })).toBe(38);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/engine/test/field.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 3: Implementar**

`packages/engine/src/field.ts`:
```ts
import type { FieldState, PlayOutcome } from './model';

export type DriveEnd =
  | { kind: 'TOUCHDOWN' }
  | { kind: 'SAFETY' }
  | { kind: 'CONVERSION' }
  | { kind: 'FIELD_GOAL'; good: boolean; ballOn: number }
  | { kind: 'PUNT'; landing: number }
  | { kind: 'TURNOVER'; spot: number }
  | { kind: 'DOWNS'; spot: number };

export interface PlayAdvance {
  field: FieldState;
  firstDown: boolean;
  end: DriveEnd | null;
}

export const TOUCHBACK = 25;
export const MISSED_FG_MIN = 20;
export const KICK_SPOT_OFFSET = 7;

const clampSpot = (yard: number): number => Math.min(99, Math.max(1, yard));

export function advanceField(field: FieldState, outcome: PlayOutcome): PlayAdvance {
  if (outcome.kind === 'INTERCEPTION' || outcome.kind === 'FUMBLE') {
    return { field, firstDown: false, end: { kind: 'TURNOVER', spot: clampSpot(field.ballOn + outcome.yards) } };
  }
  const yards = outcome.kind === 'INCOMPLETE' ? 0 : outcome.yards;
  const ballOn = field.ballOn + yards;
  if (ballOn >= 100) return { field, firstDown: false, end: { kind: 'TOUCHDOWN' } };
  if (ballOn <= 0) return { field, firstDown: false, end: { kind: 'SAFETY' } };

  const toGo = field.yardsToGo - yards;
  if (toGo <= 0) {
    return { field: { down: 1, yardsToGo: Math.min(10, 100 - ballOn), ballOn }, firstDown: true, end: null };
  }
  if (field.down >= 4) return { field, firstDown: false, end: { kind: 'DOWNS', spot: ballOn } };
  return { field: { down: field.down + 1, yardsToGo: toGo, ballOn }, firstDown: false, end: null };
}

/** Linha de início do próximo drive, do ponto de vista do novo atacante (spec 2.1). */
export function nextDriveStart(end: DriveEnd): number {
  switch (end.kind) {
    case 'TOUCHDOWN':
    case 'SAFETY':
    case 'CONVERSION':
      return TOUCHBACK;
    case 'FIELD_GOAL':
      return end.good ? TOUCHBACK : Math.max(100 - (end.ballOn - KICK_SPOT_OFFSET), MISSED_FG_MIN);
    case 'PUNT':
      return end.landing >= 100 ? TOUCHBACK : 100 - end.landing;
    case 'TURNOVER':
    case 'DOWNS':
      return 100 - end.spot;
  }
}
```

Adicionar em `index.ts`:
```ts
export * from './field';
```

- [ ] **Step 4: Rodar os testes**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): down & distance, fins de drive e posição de campo"
```

---

### Task 9: Mão de cartas e máquina de estados da partida

**Files:**
- Create: `packages/engine/src/cards/deck.ts`, `packages/engine/src/errors.ts`, `packages/engine/src/match.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/test/deck.test.ts`, `packages/engine/test/match.test.ts`

**Interfaces:**
- Consumes: tudo das Tasks 1–8. Assinaturas usadas: `rngShuffle`, `getCard`, `canPlay`, `BASIC_OFFENSE_IDS`, `BASIC_DEFENSE_IDS`, `SPECIAL_IDS`, `FORMATIONS`, `PACKAGES`, `validateTeam`, `pickLineup`, `initialFatigue`, `applyPlayFatigue`, `recoverBetweenDrives`, `resolvePlay`, `resolvePunt`, `resolveFieldGoal`, `resolvePat`, `advanceField`, `nextDriveStart`, `DriveEnd`.
- Produces:
  - `drawCards(deck: DeckState, n: number, rng: number): { deck: DeckState; rng: number }`, `newHand(deck: DeckState, n: number, rng: number): { deck: DeckState; rng: number }`, `playFromHand(deck: DeckState, cardId: string): DeckState`
  - `EngineError` (com `code: EngineErrorCode`)
  - `MatchConfig`, `DEFAULT_CONFIG`, `TeamRuntime`, `MatchState`, `StepResult { state: MatchState; events: GameEvent[] }`
  - `createMatch(teamA: Team, teamB: Team, seed: number, config?: MatchConfig): StepResult`
  - `step(state: MatchState, action: Action): StepResult` (não altera `state`)
  - `playableCards(s: MatchState, team: TeamKey): string[]`
  - `PlayerView`, `playerView(s: MatchState, you: TeamKey): PlayerView`
  - `OVERTIME_START = 75`, `TWO_POINT_BALL_ON = 97`

- [ ] **Step 1: Escrever o teste do deck (deve falhar)**

`packages/engine/test/deck.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { drawCards, newHand, playFromHand } from '../src/cards/deck';

describe('deck', () => {
  it('compra do topo', () => {
    const { deck } = drawCards({ draw: ['a', 'b', 'c'], hand: [], discard: [] }, 2, 1);
    expect(deck).toEqual({ draw: ['c'], hand: ['a', 'b'], discard: [] });
  });

  it('reembaralha o descarte quando o monte acaba', () => {
    const { deck } = drawCards({ draw: ['a'], hand: [], discard: ['b', 'c', 'd'] }, 3, 7);
    expect(deck.hand).toHaveLength(3);
    expect(deck.hand[0]).toBe('a');
    expect(deck.discard).toEqual([]);
    expect([...deck.hand, ...deck.draw].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('para de comprar se não houver mais cartas', () => {
    const { deck } = drawCards({ draw: ['a'], hand: [], discard: [] }, 5, 1);
    expect(deck.hand).toEqual(['a']);
  });

  it('nova mão descarta a anterior', () => {
    const { deck } = newHand({ draw: ['c', 'd'], hand: ['a', 'b'], discard: [] }, 2, 1);
    expect(deck.hand).toEqual(['c', 'd']);
    expect(deck.discard).toEqual(['a', 'b']);
  });

  it('jogar move uma única cópia para o descarte', () => {
    expect(playFromHand({ draw: [], hand: ['a', 'b', 'a'], discard: [] }, 'a')).toEqual({ draw: [], hand: ['b', 'a'], discard: ['a'] });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/engine/test/deck.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 3: Implementar `deck.ts` e `errors.ts`**

`packages/engine/src/cards/deck.ts`:
```ts
import type { DeckState } from '../model';
import { rngShuffle } from '../rng';

export function drawCards(deck: DeckState, n: number, rng: number): { deck: DeckState; rng: number } {
  let draw = [...deck.draw];
  let discard = [...deck.discard];
  const hand = [...deck.hand];
  let state = rng;
  for (let i = 0; i < n; i++) {
    if (draw.length === 0) {
      if (discard.length === 0) break;
      const shuffled = rngShuffle(discard, state);
      draw = shuffled.items;
      state = shuffled.state;
      discard = [];
    }
    hand.push(draw.shift() as string);
  }
  return { deck: { draw, hand, discard }, rng: state };
}

/** Início de drive (spec 2.3): a mão anterior vai para o descarte e compra-se uma nova. */
export function newHand(deck: DeckState, n: number, rng: number): { deck: DeckState; rng: number } {
  return drawCards({ draw: deck.draw, hand: [], discard: [...deck.discard, ...deck.hand] }, n, rng);
}

export function playFromHand(deck: DeckState, cardId: string): DeckState {
  const index = deck.hand.indexOf(cardId);
  if (index < 0) return deck;
  return {
    draw: deck.draw,
    hand: [...deck.hand.slice(0, index), ...deck.hand.slice(index + 1)],
    discard: [...deck.discard, cardId],
  };
}
```

`packages/engine/src/errors.ts`:
```ts
export type EngineErrorCode =
  | 'INVALID_TEAM'
  | 'MATCH_OVER'
  | 'WRONG_PHASE'
  | 'WRONG_TEAM'
  | 'ALREADY_CHOSEN'
  | 'CARD_NOT_PLAYABLE'
  | 'UNKNOWN_FORMATION'
  | 'UNKNOWN_PACKAGE';

export class EngineError extends Error {
  readonly code: EngineErrorCode;

  constructor(code: EngineErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'EngineError';
    this.code = code;
  }
}
```

- [ ] **Step 4: Rodar o teste do deck**

Run: `npx vitest run packages/engine/test/deck.test.ts`
Expected: PASS.

- [ ] **Step 5: Escrever o teste da partida (deve falhar)**

`packages/engine/test/match.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createMatch, step, playableCards, playerView, type MatchState } from '../src/match';
import type { Action, GameEvent, TeamKey } from '../src/model';
import { electricTeam } from './fixtures';

const A = electricTeam('A');
const B = electricTeam('B');
const start = (seed = 1): MatchState => createMatch(A, B, seed).state;
const other = (k: TeamKey): TeamKey => (k === 'A' ? 'B' : 'A');

function run(s: MatchState, ...actions: Action[]): { state: MatchState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let state = s;
  for (const a of actions) {
    const r = step(state, a);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

function snap(s: MatchState, offCard = 'basic_run', defCard = 'basic_defense') {
  const o = s.offense;
  return run(
    s,
    { type: 'FORMATION', team: o, formation: 'PISTOL' },
    { type: 'PACKAGE', team: other(o), package: 'BASE' },
    { type: 'CARD', team: o, cardId: offCard },
    { type: 'CARD', team: other(o), cardId: defCard },
  );
}

describe('createMatch', () => {
  it('rejeita time inválido', () => {
    expect(() => createMatch({ ...A, roster: A.roster.slice(1) }, B, 1)).toThrow(/INVALID_TEAM/);
  });

  it('começa com A atacando da própria 25, mãos de 5', () => {
    const s = start();
    expect(s.phase).toBe('FORMATION');
    expect(s.offense).toBe('A');
    expect(s.possessions).toEqual({ A: 1, B: 0 });
    expect(s.field).toEqual({ down: 1, yardsToGo: 10, ballOn: 25 });
    expect(s.teams.A.offense.hand).toHaveLength(5);
    expect(s.teams.B.defense.hand).toHaveLength(5);
  });
});

describe('validação de ações', () => {
  it('rejeita time errado, fase errada e carta repetida', () => {
    const s = start();
    expect(() => step(s, { type: 'FORMATION', team: 'B', formation: 'PISTOL' })).toThrow(/WRONG_TEAM/);
    expect(() => step(s, { type: 'CARD', team: 'A', cardId: 'basic_run' })).toThrow(/WRONG_PHASE/);
    const { state } = run(
      s,
      { type: 'FORMATION', team: 'A', formation: 'PISTOL' },
      { type: 'PACKAGE', team: 'B', package: 'BASE' },
      { type: 'CARD', team: 'A', cardId: 'basic_run' },
    );
    expect(() => step(state, { type: 'CARD', team: 'A', cardId: 'basic_pass' })).toThrow(/ALREADY_CHOSEN/);
  });

  it('rejeita carta não jogável (punt fora do 4º down)', () => {
    const { state } = run(
      start(),
      { type: 'FORMATION', team: 'A', formation: 'PISTOL' },
      { type: 'PACKAGE', team: 'B', package: 'BASE' },
    );
    expect(() => step(state, { type: 'CARD', team: 'A', cardId: 'punt' })).toThrow(/CARD_NOT_PLAYABLE/);
  });

  it('não altera o estado de entrada', () => {
    const s = start();
    const before = structuredClone(s);
    snap(s);
    expect(s).toEqual(before);
  });
});

describe('loop da jogada', () => {
  it('um snap completo revela formação, pacote e cartas e avança o turno', () => {
    const s = start();
    const { state, events } = snap(s);
    const kinds = events.map((e) => e.t);
    expect(kinds).toEqual(expect.arrayContaining(['FORMATION', 'PACKAGE', 'CARDS', 'PLAY']));
    expect(state.turnId).toBeGreaterThan(s.turnId);
  });

  it('timeouts aplicam os padrões', () => {
    const { events } = run(start(), { type: 'TIMEOUT' }, { type: 'TIMEOUT' }, { type: 'TIMEOUT' });
    expect(events.find((e) => e.t === 'FORMATION')).toMatchObject({ formation: 'PISTOL' });
    expect(events.find((e) => e.t === 'PACKAGE')).toMatchObject({ package: 'BASE' });
    expect(events.find((e) => e.t === 'CARDS')).toMatchObject({ offense: 'basic_run', defense: 'basic_defense' });
  });

  it('aplica fadiga aos atores', () => {
    const { state } = snap(start());
    expect(Object.values(state.teams.A.fatigue.levels).some((l) => l > 0)).toBe(true);
  });

  it('jogar uma carta da mão mantém a mão com 5', () => {
    let s = run(start(), { type: 'FORMATION', team: 'A', formation: 'PISTOL' }, { type: 'PACKAGE', team: 'B', package: 'BASE' }).state;
    for (let seed = 2; !playableCards(s, 'A').some((id) => s.teams.A.offense.hand.includes(id)) && seed < 60; seed++) {
      s = run(start(seed), { type: 'FORMATION', team: 'A', formation: 'PISTOL' }, { type: 'PACKAGE', team: 'B', package: 'BASE' }).state;
    }
    const card = playableCards(s, 'A').find((id) => s.teams.A.offense.hand.includes(id));
    expect(card).toBeDefined();
    const next = run(s, { type: 'CARD', team: 'A', cardId: card! }, { type: 'CARD', team: 'B', cardId: 'basic_defense' }).state;
    expect(next.teams.A.offense.hand).toHaveLength(5);
    expect(next.teams.A.offense.discard).toContain(card);
  });
});

describe('4º down e chutes', () => {
  it('libera punt e field goal no 4º down', () => {
    const s = start();
    s.field = { down: 4, yardsToGo: 8, ballOn: 40 };
    const ready = run(s, { type: 'FORMATION', team: 'A', formation: 'PISTOL' }, { type: 'PACKAGE', team: 'B', package: 'BASE' }).state;
    expect(playableCards(ready, 'A')).toEqual(expect.arrayContaining(['punt', 'field_goal']));
  });

  it('punt passa a bola para B onde ela parou', () => {
    const s = start();
    s.field = { down: 4, yardsToGo: 8, ballOn: 40 };
    const { state, events } = snap(s, 'punt');
    const punt = events.find((e) => e.t === 'PUNT') as { distance: number };
    const landing = 40 + punt.distance;
    expect(state.offense).toBe('B');
    expect(state.possessions.B).toBe(1);
    expect(state.field.ballOn).toBe(landing >= 100 ? 25 : 100 - landing);
  });

  it('field goal: 3 pontos ou bola com B no ponto do chute', () => {
    const s = start();
    s.field = { down: 4, yardsToGo: 5, ballOn: 95 };
    const { state, events } = snap(s, 'field_goal');
    const fg = events.find((e) => e.t === 'FIELD_GOAL') as { good: boolean };
    if (fg.good) {
      expect(state.score.A).toBe(3);
      expect(state.field.ballOn).toBe(25);
    } else {
      expect(state.score.A).toBe(0);
      expect(state.field.ballOn).toBe(20);
    }
    expect(state.offense).toBe('B');
  });
});

describe('touchdown e conversão', () => {
  it('TD soma 6 e leva à fase de conversão', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = start(seed);
      s.field = { down: 1, yardsToGo: 1, ballOn: 99 };
      const { state } = snap(s);
      if (state.phase === 'CONVERSION') {
        expect(state.score.A).toBe(6);
        expect(state.offense).toBe('A');
        return;
      }
    }
    throw new Error('nenhuma seed gerou TD');
  });

  it('PAT encerra o drive e B começa na 25', () => {
    const s = start();
    s.phase = 'CONVERSION';
    const { state, events } = run(s, { type: 'CONVERSION', team: 'A', choice: 'PAT' });
    const conv = events.find((e) => e.t === 'CONVERSION') as { good: boolean };
    expect(state.score.A).toBe(conv.good ? 1 : 0);
    expect(state.offense).toBe('B');
    expect(state.field.ballOn).toBe(25);
  });

  it('conversão de 2: uma jogada a partir da 97', () => {
    const s = start();
    s.phase = 'CONVERSION';
    const { state } = run(s, { type: 'CONVERSION', team: 'A', choice: 'TWO' });
    expect(state.conversionAttempt).toBe(true);
    expect(state.field).toEqual({ down: 1, yardsToGo: 3, ballOn: 97 });
    expect(state.offense).toBe('A');
    const after = snap(state);
    expect(after.events.some((e) => e.t === 'CONVERSION')).toBe(true);
    expect(after.state.offense).toBe('B');
  });
});

describe('fim de jogo e prorrogação', () => {
  const lastPossession = (scoreA: number, scoreB: number): MatchState => {
    const s = start();
    s.offense = 'B';
    s.possessions = { A: 6, B: 6 };
    s.score = { A: scoreA, B: scoreB };
    s.field = { down: 4, yardsToGo: 10, ballOn: 30 };
    return s;
  };

  it('encerra quando as posses acabam e há vencedor', () => {
    const { state, events } = snap(lastPossession(7, 0), 'punt');
    expect(state.phase).toBe('MATCH_END');
    expect(events.at(-1)).toEqual({ t: 'MATCH_END', score: { A: 7, B: 0 } });
    expect(() => step(state, { type: 'TIMEOUT' })).toThrow(/MATCH_OVER/);
  });

  it('empate leva à prorrogação: A ataca da 25 do adversário', () => {
    const { state, events } = snap(lastPossession(7, 7), 'punt');
    expect(events.some((e) => e.t === 'OVERTIME')).toBe(true);
    expect(state.overtime).toEqual({ round: 1, turnsInRound: 0 });
    expect(state.offense).toBe('A');
    expect(state.field.ballOn).toBe(75);
    expect(state.possessions).toEqual({ A: 6, B: 6 });
  });

  it('a partir da 3ª prorrogação a posse é só uma tentativa de 2', () => {
    const s = lastPossession(7, 7);
    s.overtime = { round: 2, turnsInRound: 1 };
    const { state } = snap(s, 'punt');
    expect(state.overtime).toEqual({ round: 3, turnsInRound: 0 });
    expect(state.offense).toBe('A');
    expect(state.conversionAttempt).toBe(true);
    expect(state.field.ballOn).toBe(97);
  });
});

describe('playerView', () => {
  it('mostra a própria mão e esconde a do adversário', () => {
    const s = start();
    const view = playerView(s, 'B');
    expect(view.side).toBe('defense');
    expect(view.hand).toEqual(s.teams.B.defense.hand);
    expect(view.opponentHandSize).toBe(5);
    expect(view).not.toHaveProperty('teams');
    expect(view).not.toHaveProperty('rng');
  });

  it('não revela a carta já escolhida pelo adversário', () => {
    const { state } = run(
      start(),
      { type: 'FORMATION', team: 'A', formation: 'PISTOL' },
      { type: 'PACKAGE', team: 'B', package: 'BASE' },
      { type: 'CARD', team: 'A', cardId: 'basic_pass' },
    );
    const view = playerView(state, 'B');
    expect(view.opponentHasChosen).toBe(true);
    expect(JSON.stringify(view)).not.toContain('basic_pass');
  });
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `npx vitest run packages/engine/test/match.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 7: Implementar `match.ts`**

`packages/engine/src/match.ts`:
```ts
import type {
  Action, DeckState, FatigueState, FieldState, FormationId, GameEvent, Lineup, PackageId, Phase, Team, TeamKey,
} from './model';
import { FORMATIONS, PACKAGES } from './formations';
import { BASIC_DEFENSE_IDS, BASIC_OFFENSE_IDS, SPECIAL_IDS, getCard } from './cards/catalog';
import { canPlay } from './cards/eligibility';
import { drawCards, newHand, playFromHand } from './cards/deck';
import { applyPlayFatigue, initialFatigue, pickLineup, recoverBetweenDrives } from './fatigue';
import { resolvePlay } from './resolve';
import { resolveFieldGoal, resolvePat, resolvePunt } from './specials';
import { advanceField, nextDriveStart, type DriveEnd } from './field';
import { validateTeam } from './team';
import { rngShuffle } from './rng';
import { EngineError } from './errors';

export interface MatchConfig {
  possessionsPerTeam: number;
  handSize: number;
}
export const DEFAULT_CONFIG: MatchConfig = { possessionsPerTeam: 6, handSize: 5 };
export const OVERTIME_START = 75;
export const TWO_POINT_BALL_ON = 97;
const DEFAULT_FORMATION: FormationId = 'PISTOL';
const DEFAULT_PACKAGE: PackageId = 'BASE';

export interface TeamRuntime {
  team: Team;
  offense: DeckState;
  defense: DeckState;
  fatigue: FatigueState;
  lastFormation: FormationId;
}

export interface MatchState {
  config: MatchConfig;
  teams: Record<TeamKey, TeamRuntime>;
  rng: number;
  phase: Phase;
  turnId: number;
  score: Record<TeamKey, number>;
  offense: TeamKey;
  /** posses de tempo regulamentar já iniciadas */
  possessions: Record<TeamKey, number>;
  field: FieldState;
  formation: FormationId | null;
  package: PackageId | null;
  lineups: { offense: Lineup; defense: Lineup };
  cards: { offense: string | null; defense: string | null };
  /** a jogada atual é uma tentativa de 2 pontos */
  conversionAttempt: boolean;
  overtime: { round: number; turnsInRound: number } | null;
}

export interface StepResult {
  state: MatchState;
  events: GameEvent[];
}

const other = (k: TeamKey): TeamKey => (k === 'A' ? 'B' : 'A');

export function createMatch(teamA: Team, teamB: Team, seed: number, config: MatchConfig = DEFAULT_CONFIG): StepResult {
  for (const [key, team] of [['A', teamA], ['B', teamB]] as const) {
    const errors = validateTeam(team);
    if (errors.length) throw new EngineError('INVALID_TEAM', `${key}: ${errors.map((e) => e.code).join(', ')}`);
  }
  let rng = seed | 0;
  const runtime = (team: Team): TeamRuntime => {
    const off = rngShuffle(team.offenseDeck, rng);
    rng = off.state;
    const def = rngShuffle(team.defenseDeck, rng);
    rng = def.state;
    return {
      team,
      offense: { draw: off.items, hand: [], discard: [] },
      defense: { draw: def.items, hand: [], discard: [] },
      fatigue: initialFatigue(),
      lastFormation: DEFAULT_FORMATION,
    };
  };
  const teams = { A: runtime(teamA), B: runtime(teamB) };
  const state: MatchState = {
    config,
    teams,
    rng,
    phase: 'FORMATION',
    turnId: 0,
    score: { A: 0, B: 0 },
    offense: 'A',
    possessions: { A: 0, B: 0 },
    field: { down: 1, yardsToGo: 10, ballOn: 25 },
    formation: null,
    package: null,
    lineups: { offense: {}, defense: {} },
    cards: { offense: null, defense: null },
    conversionAttempt: false,
    overtime: null,
  };
  const events: GameEvent[] = [];
  startDrive(state, 'A', 25, events);
  return { state, events };
}

export function step(state: MatchState, action: Action): StepResult {
  if (state.phase === 'MATCH_END') throw new EngineError('MATCH_OVER');
  const s = structuredClone(state);
  const events: GameEvent[] = [];
  switch (s.phase) {
    case 'FORMATION':
      onFormation(s, action, events);
      break;
    case 'PACKAGE':
      onPackage(s, action, events);
      break;
    case 'PLAYCALL':
      onPlaycall(s, action, events);
      break;
    case 'CONVERSION':
      onConversion(s, action, events);
      break;
  }
  return { state: s, events };
}

export function playableCards(s: MatchState, team: TeamKey): string[] {
  if (s.phase !== 'PLAYCALL') return [];
  const isOffense = team === s.offense;
  const rt = s.teams[team];
  const lineup = isOffense ? s.lineups.offense : s.lineups.defense;
  const pool = isOffense ? [...BASIC_OFFENSE_IDS, ...rt.offense.hand] : [...BASIC_DEFENSE_IDS, ...rt.defense.hand];
  const ids = [...new Set(pool)].filter((id) => canPlay(getCard(id), lineup));
  if (isOffense && s.field.down === 4 && !s.conversionAttempt) ids.push(...SPECIAL_IDS);
  return ids;
}

/** Devolve a ação se for do tipo e do time esperados; null se for TIMEOUT. */
function accept<T extends Exclude<Action['type'], 'TIMEOUT'>>(
  action: Action,
  type: T,
  team: TeamKey,
): Extract<Action, { type: T }> | null {
  if (action.type === 'TIMEOUT') return null;
  if (action.type !== type) throw new EngineError('WRONG_PHASE', `${action.type} na fase de ${type}`);
  if (action.team !== team) throw new EngineError('WRONG_TEAM');
  return action as Extract<Action, { type: T }>;
}

function onFormation(s: MatchState, action: Action, events: GameEvent[]): void {
  const a = accept(action, 'FORMATION', s.offense);
  const rt = s.teams[s.offense];
  const formation = a ? a.formation : rt.lastFormation;
  if (!(formation in FORMATIONS)) throw new EngineError('UNKNOWN_FORMATION', formation);
  s.formation = formation;
  rt.lastFormation = formation;
  s.lineups.offense = pickLineup(FORMATIONS[formation], rt.team, rt.fatigue);
  events.push({ t: 'FORMATION', team: s.offense, formation, lineup: s.lineups.offense });
  s.phase = 'PACKAGE';
}

function onPackage(s: MatchState, action: Action, events: GameEvent[]): void {
  const defense = other(s.offense);
  const a = accept(action, 'PACKAGE', defense);
  const pkg = a ? a.package : DEFAULT_PACKAGE;
  if (!(pkg in PACKAGES)) throw new EngineError('UNKNOWN_PACKAGE', pkg);
  const rt = s.teams[defense];
  s.package = pkg;
  s.lineups.defense = pickLineup(PACKAGES[pkg], rt.team, rt.fatigue);
  events.push({ t: 'PACKAGE', team: defense, package: pkg, lineup: s.lineups.defense });
  s.phase = 'PLAYCALL';
}

function onPlaycall(s: MatchState, action: Action, events: GameEvent[]): void {
  if (action.type === 'TIMEOUT') {
    s.cards.offense ??= s.field.down === 4 && !s.conversionAttempt ? 'punt' : 'basic_run';
    s.cards.defense ??= 'basic_defense';
  } else {
    if (action.type !== 'CARD') throw new EngineError('WRONG_PHASE', `${action.type} na fase de CARD`);
    const side = action.team === s.offense ? 'offense' : 'defense';
    if (s.cards[side] !== null) throw new EngineError('ALREADY_CHOSEN');
    if (!playableCards(s, action.team).includes(action.cardId)) throw new EngineError('CARD_NOT_PLAYABLE', action.cardId);
    s.cards[side] = action.cardId;
  }
  if (s.cards.offense && s.cards.defense) resolveSnap(s, events);
}

function onConversion(s: MatchState, action: Action, events: GameEvent[]): void {
  const a = accept(action, 'CONVERSION', s.offense);
  const choice = a ? a.choice : 'PAT';
  if (choice === 'PAT') {
    const r = resolvePat(s.teams[s.offense].team.specialist, s.rng);
    s.rng = r.rng;
    if (r.good) s.score[s.offense] += 1;
    events.push({ t: 'CONVERSION', team: s.offense, choice, good: r.good });
    endDrive(s, { kind: 'CONVERSION' }, events);
    return;
  }
  s.conversionAttempt = true;
  s.field = { down: 1, yardsToGo: 3, ballOn: TWO_POINT_BALL_ON };
  beginSnap(s);
}

function consumeCard(s: MatchState, rt: TeamRuntime, side: 'offense' | 'defense', cardId: string): void {
  const card = getCard(cardId);
  if (card.origin === 'BASIC' || card.origin === 'SPECIAL') return;
  const after = drawCards(playFromHand(rt[side], cardId), 1, s.rng);
  rt[side] = after.deck;
  s.rng = after.rng;
}

function resolveSnap(s: MatchState, events: GameEvent[]): void {
  const offKey = s.offense;
  const defKey = other(offKey);
  const off = s.teams[offKey];
  const def = s.teams[defKey];
  const offCard = getCard(s.cards.offense as string);
  const defCard = getCard(s.cards.defense as string);
  consumeCard(s, off, 'offense', offCard.id);
  consumeCard(s, def, 'defense', defCard.id);

  if (offCard.category === 'PUNT') {
    events.push({ t: 'CARDS', offense: offCard.id, defense: defCard.id, read: 'NEUTRAL' });
    const r = resolvePunt(off.team.specialist, s.rng);
    s.rng = r.rng;
    events.push({ t: 'PUNT', distance: r.distance });
    endDrive(s, { kind: 'PUNT', landing: s.field.ballOn + r.distance }, events);
    return;
  }
  if (offCard.category === 'FIELD_GOAL') {
    events.push({ t: 'CARDS', offense: offCard.id, defense: defCard.id, read: 'NEUTRAL' });
    const r = resolveFieldGoal(s.field.ballOn, off.team.specialist, s.rng);
    s.rng = r.rng;
    events.push({ t: 'FIELD_GOAL', distance: r.distance, good: r.good });
    if (r.good) s.score[offKey] += 3;
    endDrive(s, { kind: 'FIELD_GOAL', good: r.good, ballOn: s.field.ballOn }, events);
    return;
  }

  const res = resolvePlay({
    offCard,
    defCard,
    offLineup: s.lineups.offense,
    defLineup: s.lineups.defense,
    offFatigue: off.fatigue.levels,
    defFatigue: def.fatigue.levels,
    rng: s.rng,
  });
  s.rng = res.rng;
  const outcome = res.outcome;
  events.push({ t: 'CARDS', offense: offCard.id, defense: defCard.id, read: outcome.read });
  events.push({ t: 'PLAY', outcome });
  off.fatigue = applyPlayFatigue(off.fatigue, off.team, s.lineups.offense, outcome.offActors);
  def.fatigue = applyPlayFatigue(def.fatigue, def.team, s.lineups.defense, outcome.defActors);

  const adv = advanceField(s.field, outcome);
  if (s.conversionAttempt) {
    const good = adv.end?.kind === 'TOUCHDOWN';
    if (good) s.score[offKey] += 2;
    events.push({ t: 'CONVERSION', team: offKey, choice: 'TWO', good });
    endDrive(s, { kind: 'CONVERSION' }, events);
    return;
  }
  if (!adv.end) {
    s.field = adv.field;
    if (adv.firstDown) events.push({ t: 'FIRST_DOWN' });
    beginSnap(s);
    return;
  }
  switch (adv.end.kind) {
    case 'TOUCHDOWN':
      s.score[offKey] += 6;
      events.push({ t: 'TOUCHDOWN', team: offKey });
      s.phase = 'CONVERSION';
      s.turnId += 1;
      return;
    case 'SAFETY':
      s.score[defKey] += 2;
      events.push({ t: 'SAFETY', team: defKey });
      break;
    case 'TURNOVER':
      events.push({ t: 'TURNOVER', kind: outcome.kind === 'FUMBLE' ? 'FUMBLE' : 'INTERCEPTION' });
      break;
    case 'DOWNS':
      events.push({ t: 'TURNOVER_ON_DOWNS' });
      break;
  }
  endDrive(s, adv.end, events);
}

function beginSnap(s: MatchState): void {
  s.phase = 'FORMATION';
  s.turnId += 1;
  s.formation = null;
  s.package = null;
  s.lineups = { offense: {}, defense: {} };
  s.cards = { offense: null, defense: null };
}

function startDrive(s: MatchState, offense: TeamKey, ballOn: number, events: GameEvent[]): void {
  s.offense = offense;
  if (!s.overtime) s.possessions[offense] += 1;
  for (const key of ['A', 'B'] as const) {
    s.teams[key].fatigue = recoverBetweenDrives(s.teams[key].fatigue, s.teams[key].team);
  }
  const off = s.teams[offense];
  const def = s.teams[other(offense)];
  const oh = newHand(off.offense, s.config.handSize, s.rng);
  off.offense = oh.deck;
  s.rng = oh.rng;
  const dh = newHand(def.defense, s.config.handSize, s.rng);
  def.defense = dh.deck;
  s.rng = dh.rng;
  off.lastFormation = DEFAULT_FORMATION;

  const twoPointOnly = s.overtime !== null && s.overtime.round >= 3;
  s.conversionAttempt = twoPointOnly;
  s.field = twoPointOnly
    ? { down: 1, yardsToGo: 3, ballOn: TWO_POINT_BALL_ON }
    : { down: 1, yardsToGo: Math.min(10, 100 - ballOn), ballOn };
  events.push({
    t: 'DRIVE_START',
    offense,
    ballOn: s.field.ballOn,
    possession: s.possessions[offense],
    overtimeRound: s.overtime?.round ?? 0,
  });
  beginSnap(s);
}

function endDrive(s: MatchState, end: DriveEnd, events: GameEvent[]): void {
  const next = other(s.offense);
  if (s.overtime) {
    s.overtime.turnsInRound += 1;
    if (s.overtime.turnsInRound < 2) return startDrive(s, next, OVERTIME_START, events);
    if (s.score.A !== s.score.B) return finish(s, events);
    s.overtime = { round: s.overtime.round + 1, turnsInRound: 0 };
    events.push({ t: 'OVERTIME', round: s.overtime.round });
    return startDrive(s, s.overtime.round % 2 === 1 ? 'A' : 'B', OVERTIME_START, events);
  }
  const n = s.config.possessionsPerTeam;
  if (s.possessions.A >= n && s.possessions.B >= n) {
    if (s.score.A !== s.score.B) return finish(s, events);
    s.overtime = { round: 1, turnsInRound: 0 };
    events.push({ t: 'OVERTIME', round: 1 });
    return startDrive(s, 'A', OVERTIME_START, events);
  }
  startDrive(s, next, nextDriveStart(end), events);
}

function finish(s: MatchState, events: GameEvent[]): void {
  s.phase = 'MATCH_END';
  s.turnId += 1;
  events.push({ t: 'MATCH_END', score: { ...s.score } });
}

export interface PlayerView {
  you: TeamKey;
  side: 'offense' | 'defense';
  phase: Phase;
  turnId: number;
  score: Record<TeamKey, number>;
  offense: TeamKey;
  possessions: Record<TeamKey, number>;
  possessionsPerTeam: number;
  field: FieldState;
  formation: FormationId | null;
  package: PackageId | null;
  lineups: { offense: Lineup; defense: Lineup };
  conversionAttempt: boolean;
  overtimeRound: number;
  hand: string[];
  playable: string[];
  opponentHandSize: number;
  yourCard: string | null;
  opponentHasChosen: boolean;
  fatigue: Record<TeamKey, Record<number, number>>;
}

/** Visão de um jogador: a própria mão; do adversário, só a contagem (spec 7.1). */
export function playerView(s: MatchState, you: TeamKey): PlayerView {
  const side = you === s.offense ? 'offense' : 'defense';
  const opponentSide = side === 'offense' ? 'defense' : 'offense';
  return {
    you,
    side,
    phase: s.phase,
    turnId: s.turnId,
    score: { ...s.score },
    offense: s.offense,
    possessions: { ...s.possessions },
    possessionsPerTeam: s.config.possessionsPerTeam,
    field: { ...s.field },
    formation: s.formation,
    package: s.package,
    lineups: structuredClone(s.lineups),
    conversionAttempt: s.conversionAttempt,
    overtimeRound: s.overtime?.round ?? 0,
    hand: [...s.teams[you][side].hand],
    playable: playableCards(s, you),
    opponentHandSize: s.teams[other(you)][opponentSide].hand.length,
    yourCard: s.cards[side],
    opponentHasChosen: s.cards[opponentSide] !== null,
    fatigue: { A: { ...s.teams.A.fatigue.levels }, B: { ...s.teams.B.fatigue.levels } },
  };
}
```

Adicionar em `index.ts`:
```ts
export * from './cards/deck';
export * from './errors';
export * from './match';
```

- [ ] **Step 8: Rodar os testes**

Run: `npm test && npm run typecheck`
Expected: PASS. Se o teste "não revela a carta" falhar porque `basic_pass` aparece em `playable` da defesa, isso é um bug real: a defesa nunca deve ter `basic_pass` em `playable`. Corrija `playableCards`, não o teste.

- [ ] **Step 9: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): máquina de estados da partida, mão de cartas e visão por jogador"
```

---

### Task 10: Replay, partidas completas e determinismo

**Files:**
- Create: `packages/engine/src/replay.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/test/full-match.test.ts`

**Interfaces:**
- Consumes: `createMatch`, `step`, `playableCards`, `MatchConfig`, `DEFAULT_CONFIG`, `StepResult` (Task 9); `rngNext` (Task 1).
- Produces: `replay(teamA: Team, teamB: Team, seed: number, actions: readonly Action[], config?: MatchConfig): StepResult`. Os Planos 2 a 4 usam isso para replays e para reproduzir bugs.

- [ ] **Step 1: Escrever o teste (deve falhar)**

`packages/engine/test/full-match.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createMatch, step, playableCards, type MatchState } from '../src/match';
import { replay } from '../src/replay';
import { rngNext } from '../src/rng';
import type { Action, FormationId, PackageId, TeamKey } from '../src/model';
import { electricTeam } from './fixtures';

const A = electricTeam('A');
const B = electricTeam('B');
const FORMATION_IDS: FormationId[] = ['PISTOL', 'HEAVY', 'SPREAD', 'DOUBLE'];
const PACKAGE_IDS: PackageId[] = ['BASE', 'HEAVY_D', 'NICKEL', 'DIME'];

/** Bot aleatório determinístico: escolhe entre as ações válidas. */
function autoPlay(seed: number, botSeed: number, maxSteps = 5000): { state: MatchState; actions: Action[] } {
  let state = createMatch(A, B, seed).state;
  const actions: Action[] = [];
  let r = botSeed;
  const pick = <T>(xs: readonly T[]): T => {
    const n = rngNext(r);
    r = n.state;
    return xs[Math.floor(n.value * xs.length)];
  };
  const botAction = (s: MatchState): Action => {
    const defense: TeamKey = s.offense === 'A' ? 'B' : 'A';
    switch (s.phase) {
      case 'FORMATION':
        return { type: 'FORMATION', team: s.offense, formation: pick(FORMATION_IDS) };
      case 'PACKAGE':
        return { type: 'PACKAGE', team: defense, package: pick(PACKAGE_IDS) };
      case 'PLAYCALL': {
        const team = s.cards.offense === null ? s.offense : defense;
        return { type: 'CARD', team, cardId: pick(playableCards(s, team)) };
      }
      case 'CONVERSION':
        return { type: 'CONVERSION', team: s.offense, choice: pick(['PAT', 'TWO'] as const) };
      default:
        throw new Error(`fase inesperada: ${s.phase}`);
    }
  };
  for (let i = 0; i < maxSteps && state.phase !== 'MATCH_END'; i++) {
    const action = botAction(state);
    actions.push(action);
    state = step(state, action).state;
  }
  return { state, actions };
}

describe('partidas completas', () => {
  it('20 partidas terminam com 6 posses para cada time', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { state } = autoPlay(seed, seed * 31);
      expect(state.phase).toBe('MATCH_END');
      expect(state.possessions).toEqual({ A: 6, B: 6 });
      expect(state.score.A).not.toBe(state.score.B);
      expect(state.score.A).toBeGreaterThanOrEqual(0);
      expect(state.score.B).toBeGreaterThanOrEqual(0);
    }
  });

  it('replay de seed + ações reproduz exatamente o estado final', () => {
    const { state, actions } = autoPlay(2026, 7);
    const replayed = replay(A, B, 2026, actions);
    expect(replayed.state).toEqual(state);
    expect(replayed.events.at(-1)?.t).toBe('MATCH_END');
  });

  it('golden: a seed 2026 produz sempre o mesmo resultado', () => {
    const { state, actions } = autoPlay(2026, 7);
    expect({ score: state.score, turnId: state.turnId, actions: actions.length }).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/engine/test/full-match.test.ts`
Expected: FAIL — `Failed to resolve import "../src/replay"`.

- [ ] **Step 3: Implementar `replay.ts`**

`packages/engine/src/replay.ts`:
```ts
import type { Action, GameEvent, Team } from './model';
import { createMatch, step, DEFAULT_CONFIG, type MatchConfig, type StepResult } from './match';

/** Reconstrói uma partida a partir da seed e do log de ações (spec 7.1). */
export function replay(
  teamA: Team,
  teamB: Team,
  seed: number,
  actions: readonly Action[],
  config: MatchConfig = DEFAULT_CONFIG,
): StepResult {
  let { state, events } = createMatch(teamA, teamB, seed, config);
  const all: GameEvent[] = [...events];
  for (const action of actions) {
    const r = step(state, action);
    state = r.state;
    all.push(...r.events);
  }
  return { state, events: all };
}
```

Adicionar em `index.ts`:
```ts
export * from './replay';
```

- [ ] **Step 4: Rodar a suíte inteira e o typecheck**

Run: `npm test && npm run typecheck`
Expected: todos PASS. Na primeira execução o Vitest cria `packages/engine/test/__snapshots__/full-match.test.ts.snap` (o golden). Rode `npm test` uma segunda vez e confirme que passa **sem** atualizar o snapshot.

- [ ] **Step 5: Verificar que o engine não usa `Math.random`**

Run: `grep -rn "Math.random" packages/engine/src || echo "ok: sem Math.random"`
Expected: `ok: sem Math.random`.

- [ ] **Step 6: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): replay determinístico e testes de partida completa"
```

---

## Self-Review (feito na escrita do plano)

- **Cobertura da spec:**

  | Seção da spec | Task |
  |---|---|
  | 2.1 regras gerais e posição de campo | 8, 9 |
  | 2.2 especialista | 7 |
  | 2.3 mão de cartas | 9 |
  | 2.4 loop da jogada | 9 |
  | 2.5 padrões de timeout | 9 |
  | 2.6 máquina de estados | 9 |
  | 3.1–3.4 cartas e deck | 4, 5 |
  | 3.5 matriz de leitura | 4 |
  | 3.6 fadiga | 6, 9 |
  | 4.1 dados | 2 |
  | 4.2 stats | 5, 7 |
  | 4.3 pipeline | 7 |
  | 5.1–5.5 time (exceto o ajuste manual entre drives, item 5 dos desvios) | 4, 5 |
  | 7.1 engine puro, `step`, visão por jogador | 9 |
  | 9 testes do engine e golden | 1–10 |

  Ficam para os Planos 2–4: protocolo Socket.io (7.2), simulador (7.3), interface (6), erros de rede (8), times sugeridos e catálogo completo.
- **Consistência de tipos:** `PlayOutcome`, `DriveEnd`, `MatchState`, `FatigueState` e `DeckState` usam os mesmos nomes de campo em todas as tasks. `fillSlots` é definido na Task 4 e usado nas Tasks 5 e 6. `matchesRequirement` é definido na Task 4 e usado na Task 7.
- **Placeholders:** nenhum.

---

## Adendo pós-execução (2026-10-11)

O plano foi executado no branch `pfl-1-engine`. O código dos blocos acima foi transcrito sem alterações, e a revisão final pediu os ajustes abaixo, já aplicados no código (os blocos de código deste documento **não** foram reescritos; vale o código do repositório):

- **Touchback em turnover na end zone adversária** (`field.ts`): `advanceField` devolve `TURNOVER` com `spot: 75` quando `ballOn + yards >= 100`. O teste de `FUMBLE` da 98 passou a ser um caso de meio de campo mais um teste novo de touchback.
- **Ids inválidos:** `Object.hasOwn` em `onFormation`/`onPackage`; novo código `INVALID_CHOICE` para conversão fora de `PAT`/`TWO`.
- **`createMatch`** clona os times; **`CARD`** valida `team ∈ {A, B}` (`WRONG_TEAM`).
- **Fadiga:** punt e FG recuperam 1 nível de quem está fora de campo; `pickLineup` escolhe o menos cansado entre os que descansam, mantendo o fallback `fillSlots`.
- **Testes novos:** reembaralhar o deck dentro da partida, TIMEOUT em 4º down/conversão/2 pontos, fim da prorrogação na rodada 1, estado intacto quando `step` lança, `pickLineup` pelo menos cansado, punt recuperando fadiga. Total: 113 testes.
- **Snapshot golden** regenerado com autorização do usuário: placar 14 × 22, 357 ações, `turnId` 94.
- **Catálogo:** tem 40 cartas (o texto acima diz 35; vale o contrato, seção 5).
