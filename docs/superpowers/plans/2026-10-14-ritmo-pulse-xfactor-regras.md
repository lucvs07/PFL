# Battle Rhythm, Stadium Pulse e Ace X-Factors (regras) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao motor um medidor de momentum, a pressão do estádio (pulse) e dois capitães por time com perks de "zona", mais o timeout do técnico, tudo determinístico, no replay, no protocolo, no servidor e calibrado pelo simulador.

**Architecture:** Módulo puro `rhythm.ts` no engine (estado em `MatchState.rhythm`, eventos novos no `GameEvent`). O `resolvePlay` recebe um `PlayModifiers` opcional e aplica pulse nível 2 e perks. O servidor só repassa `USE_TIMEOUT` e encurta o `PLAYCALL` do jogador pressionado. O simulador ganha capitães determinísticos, uso de timeout no bot e um portão de balanceamento por perk.

**Tech Stack:** TypeScript 7, Vitest 5, npm workspaces (`@pfl/engine`, `@pfl/protocol`, `@pfl/server`, `@pfl/sim`, `@pfl/client`), Socket.io.

**Spec:** `docs/superpowers/specs/2026-10-14-ritmo-pulse-xfactor-regras-design.md`

**Branch de trabalho:** `feat/ritmo-pulse-xfactor-regras`, criada a partir da `main` (use `superpowers:using-git-worktrees`).

## Global Constraints

- `resolvePlay` faz exatamente 5 sorteios por jogada, na mesma ordem. Perks e pulse nunca mudam a quantidade de sorteios.
- `Team.captains` é opcional; cada lado (`offense`, `defense`) também é opcional. Código de time antigo continua válido.
- Com `modifiers` neutro, `resolvePlay` devolve resultado idêntico ao de hoje. Com `MatchConfig.rhythm === false`, a partida inteira é idêntica à de hoje (golden `2026`: placar A 14 × B 22, `turnId` 94, 357 ações).
- Convenção de lado: momentum positivo a favor do time `A`, negativo a favor do `B`; limite `[-100, 100]`.
- Pulse nível 1 a partir de `|momentum| >= 50`; nível 2 a partir de `|momentum| >= 80`. Timer de `PLAYCALL` do pressionado: 8 s → 6 s (corte de 2 s, só nessa etapa).
- Timeouts: 2 por time; `USE_TIMEOUT` só em `FORMATION` ou `PACKAGE`, uma vez por time por snap; não pausa o timer.
- Momentum, zona e pulse não se aplicam a punt, field goal, PAT nem tentativa de 2 pontos.
- Textos de erro e comentários em português, como no resto do código. Commits: `tipo(escopo): resumo` e o trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Comandos: `npx vitest run <arquivo>` por arquivo; `npm test` (suíte inteira, sem o portão); `npm run typecheck`; `npm run test:gate` (portão, lento).

## Review Focus

1. **Time sem `captains` e partida com `rhythm: false`** devem reproduzir o golden antigo (Task 7).
2. **Mesma espécie em dois papéis** (Onix é OL1 e DL1 no fixture): o perk só vale no lado do capitão e só se ele for ator da jogada (Tasks 4 e 6).
3. **`USE_TIMEOUT` inválido**: duplicado no mesmo snap, sem timeouts, em `PLAYCALL`, com `turnId` velho ou com o rival já em vantagem menor que a do próprio time (Tasks 5, 7 e 8).
4. **Limite de ±100 e corte do timeout** quando o momentum já favorece quem chama (sem corte) ou está em 0 (Tasks 3 e 5).
5. **Reconexão no meio do `PLAYCALL` do jogador pressionado**: o `match:phase` reenviado mostra o deadline cortado; o `TIMEOUT` por jogador não resolve a jogada se o outro ainda não escolheu (Task 8).

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `packages/engine/src/model.ts` (modificar) | Tipos novos: `XFactorId`, `Captain(s)`, `RhythmState`, eventos, `Action`, `PlayOutcome.perks` |
| `packages/engine/src/xfactors.ts` (criar) | Tabela `PERKS`, constantes `RHYTHM_TUNING`, `PlayModifiers` |
| `packages/engine/src/rhythm.ts` (criar) | Estado e regras puras: `pulseTier`, `applyPlay`, `applyTimeout`, `modifiersFor`, `rhythmView` |
| `packages/engine/src/resolve.ts` (modificar) | Aplica `PlayModifiers` |
| `packages/engine/src/team.ts` (modificar) | Valida `captains` |
| `packages/engine/src/match.ts` (modificar) | Estado, `USE_TIMEOUT`, `TIMEOUT` por time, integração, `PlayerView.rhythm` |
| `packages/engine/src/errors.ts` (modificar) | `TIMEOUT_NOT_ALLOWED`, `NO_TIMEOUTS_LEFT` |
| `packages/protocol/src/messages.ts` (modificar) | `play:timeout`, `PULSE_PLAYCALL_CUT_SECONDS` |
| `apps/server/src/parse.ts`, `server.ts`, `match-session.ts` (modificar) | Parse e rota de `play:timeout`; deadline e timer do pressionado |
| `packages/sim/src/captains.ts`, `perks.ts` (criar) | Capitães determinísticos; medições para o portão |
| `packages/sim/src/bot.ts`, `runner.ts` (modificar) | Bot usa timeout; `runSim` com `captains` |
| `apps/client/test/fixtures.ts` (modificar) | `makeView` com `rhythm` (só compatibilidade de tipo) |

---

### Task 1: Tipos, tabela de perks e estado inicial do ritmo

**Files:**
- Modify: `packages/engine/src/model.ts`
- Modify: `packages/engine/src/errors.ts`
- Create: `packages/engine/src/xfactors.ts`
- Create: `packages/engine/src/rhythm.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/test/rhythm.test.ts`

**Interfaces:**
- Produces (em `model.ts`): `XFactorId`, `Captain`, `Captains`, `PulseTier`, `ZoneSide`, `ZoneProgress`, `RhythmState`, `MomentumReason`, `ZoneExitCause`; `Team.captains?`; `Action` com `USE_TIMEOUT` e `TIMEOUT` com `team?`; `PlayOutcome.perks?`; eventos `MOMENTUM`, `PULSE_TIER`, `ZONE_ENTER`, `ZONE_EXIT`, `ZONE_CLASH`, `TIMEOUT_CALLED`.
- Produces (`xfactors.ts`): `XFACTOR_IDS`, `PERKS`, `RHYTHM_TUNING`, `PerkCall`, `PlayModifiers`, `NEUTRAL_MODIFIERS`.
- Produces (`rhythm.ts`): `MOMENTUM_LIMIT`, `TIER_1_AT`, `TIER_2_AT`, `TIMEOUTS_PER_MATCH`, `clampMomentum(v)`, `initialRhythm()`, `pulseTier(momentum): { dominant: TeamKey | null; tier: PulseTier }`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `packages/engine/test/rhythm.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { clampMomentum, initialRhythm, pulseTier, TIMEOUTS_PER_MATCH } from '../src/rhythm';
import { PERKS, XFACTOR_IDS } from '../src/xfactors';

describe('pulseTier', () => {
  it.each([
    [0, null, 0],
    [49, null, 0],
    [-49, null, 0],
    [50, 'A', 1],
    [79, 'A', 1],
    [80, 'A', 2],
    [100, 'A', 2],
    [-50, 'B', 1],
    [-79, 'B', 1],
    [-80, 'B', 2],
    [-100, 'B', 2],
  ])('momentum %i → dominante %s, nível %i', (momentum, dominant, tier) => {
    expect(pulseTier(momentum)).toEqual({ dominant, tier });
  });
});

describe('clampMomentum', () => {
  it('limita a [-100, 100]', () => {
    expect(clampMomentum(140)).toBe(100);
    expect(clampMomentum(-140)).toBe(-100);
    expect(clampMomentum(37)).toBe(37);
  });
});

describe('initialRhythm', () => {
  it('começa neutro, sem zona e com 2 timeouts por time', () => {
    const r = initialRhythm();
    expect(r.momentum).toBe(0);
    expect(r.streak).toEqual({ team: null, count: 0 });
    expect(r.timeouts).toEqual({ A: TIMEOUTS_PER_MATCH, B: TIMEOUTS_PER_MATCH });
    expect(r.calledThisSnap).toEqual({ A: false, B: false });
    for (const k of ['A', 'B'] as const) {
      expect(r.zone[k].offense).toEqual({ progress: 0, inZone: false });
      expect(r.zone[k].defense).toEqual({ progress: 0, inZone: false });
    }
  });
});

describe('PERKS', () => {
  it('cobre os 8 X-Factors, 4 ofensivos e 4 defensivos', () => {
    expect(XFACTOR_IDS).toHaveLength(8);
    expect(XFACTOR_IDS.filter((id) => PERKS[id].side === 'offense')).toHaveLength(4);
    expect(XFACTOR_IDS.filter((id) => PERKS[id].side === 'defense')).toHaveLength(4);
    expect(PERKS.TELEPATHIC_POCKET).toEqual({ side: 'offense', position: 'QB' });
    expect(PERKS.PREDATOR_HAWK).toEqual({ side: 'defense', position: 'S' });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/engine/test/rhythm.test.ts`
Expected: FAIL (módulos `../src/rhythm` e `../src/xfactors` não existem).

- [ ] **Step 3: Tipos em `model.ts`**

Em `packages/engine/src/model.ts`, no `interface Team`, acrescentar depois de `defenseDeck: string[];`:

```ts
  /** Capitães de X-Factor (opcional): um ofensivo e um defensivo, cada lado também opcional. */
  captains?: Captains;
```

Depois da linha `export type TeamKey = 'A' | 'B';` acrescentar:

```ts
export type XFactorId =
  | 'TELEPATHIC_POCKET'
  | 'OVERDRIVE_BREAKTHROUGH'
  | 'SLIPSTREAM_SEPARATION'
  | 'IMMOVABLE_WALL'
  | 'INTIMIDATE_RUSH'
  | 'ENFORCER_STOMP'
  | 'ISLAND_LOCKDOWN'
  | 'PREDATOR_HAWK';
export interface Captain {
  species: number;
  xFactor: XFactorId;
}
export interface Captains {
  offense?: Captain;
  defense?: Captain;
}
export type PulseTier = 0 | 1 | 2;
export type ZoneSide = 'offense' | 'defense';
export interface ZoneProgress {
  progress: number;
  inZone: boolean;
}
export interface RhythmState {
  /** -100 a +100: positivo a favor do A, negativo a favor do B */
  momentum: number;
  streak: { team: TeamKey | null; count: number };
  zone: Record<TeamKey, Record<ZoneSide, ZoneProgress>>;
  /** timeouts restantes de cada time */
  timeouts: Record<TeamKey, number>;
  /** o time já chamou timeout neste snap */
  calledThisSnap: Record<TeamKey, boolean>;
}
export type MomentumReason =
  | 'STREAK' | 'SACK' | 'SACK_SUFFERED' | 'LONG_CONVERSION' | 'TURNOVER' | 'TOUCHDOWN' | 'DOWNS' | 'TIMEOUT';
export type ZoneExitCause = 'NEGATIVE_PLAY' | 'BIG_GAIN' | 'TIMEOUT';
```

Trocar o tipo `Action` inteiro por:

```ts
export type Action =
  | { type: 'FORMATION'; team: TeamKey; formation: FormationId }
  | { type: 'PACKAGE'; team: TeamKey; package: PackageId }
  | { type: 'CARD'; team: TeamKey; cardId: string }
  | { type: 'CONVERSION'; team: TeamKey; choice: 'PAT' | 'TWO' }
  | { type: 'SET_DEPTH'; team: TeamKey; depth: Team['depth']; keepOnField: number[] }
  /** Estouro de timer. Em PLAYCALL, com `team`, só preenche o padrão desse time. */
  | { type: 'TIMEOUT'; team?: TeamKey }
  /** Timeout do técnico (spec do ritmo, 5.5). */
  | { type: 'USE_TIMEOUT'; team: TeamKey };
```

No `interface PlayOutcome`, acrescentar depois de `varianceFactor: number;`:

```ts
  /** Perks aplicados na jogada; ausente quando nenhum capitão em zona foi ator. `clash`: os dois se anularam. */
  perks?: { offense?: XFactorId; defense?: XFactorId; clash?: boolean };
```

No fim do tipo `GameEvent`, antes do `;` final (depois da linha `MATCH_END`), acrescentar:

```ts
  | { t: 'MOMENTUM'; delta: number; value: number; reason: MomentumReason }
  | { t: 'PULSE_TIER'; dominant: TeamKey | null; tier: PulseTier }
  | { t: 'ZONE_ENTER'; team: TeamKey; side: ZoneSide; species: number; xFactor: XFactorId }
  | { t: 'ZONE_EXIT'; team: TeamKey; side: ZoneSide; species: number; cause: ZoneExitCause }
  | { t: 'ZONE_CLASH'; offense: number; defense: number }
  | { t: 'TIMEOUT_CALLED'; team: TeamKey; remaining: number }
```

(a linha `| { t: 'MATCH_END'; ... };` perde o `;` e as seis linhas acima fecham o tipo com `;` na última.)

- [ ] **Step 4: Códigos de erro em `errors.ts`**

Trocar `| 'DEPTH_LOCKED';` por:

```ts
  | 'DEPTH_LOCKED'
  | 'TIMEOUT_NOT_ALLOWED'
  | 'NO_TIMEOUTS_LEFT';
```

- [ ] **Step 5: Criar `xfactors.ts`**

```ts
import type { Position, XFactorId, ZoneSide } from './model';

export const XFACTOR_IDS = [
  'TELEPATHIC_POCKET', 'OVERDRIVE_BREAKTHROUGH', 'SLIPSTREAM_SEPARATION', 'IMMOVABLE_WALL',
  'INTIMIDATE_RUSH', 'ENFORCER_STOMP', 'ISLAND_LOCKDOWN', 'PREDATOR_HAWK',
] as const satisfies readonly XFactorId[];

/** Lado e posição de cada perk (spec do ritmo, 4.1). TE e FB não têm perk. */
export const PERKS: Record<XFactorId, { side: ZoneSide; position: Position }> = {
  TELEPATHIC_POCKET: { side: 'offense', position: 'QB' },
  OVERDRIVE_BREAKTHROUGH: { side: 'offense', position: 'RB' },
  SLIPSTREAM_SEPARATION: { side: 'offense', position: 'WR' },
  IMMOVABLE_WALL: { side: 'offense', position: 'OL' },
  INTIMIDATE_RUSH: { side: 'defense', position: 'DL' },
  ENFORCER_STOMP: { side: 'defense', position: 'LB' },
  ISLAND_LOCKDOWN: { side: 'defense', position: 'CB' },
  PREDATOR_HAWK: { side: 'defense', position: 'S' },
};

/** Valores iniciais (spec do ritmo, 5.2 e 5.4); o portão de balanceamento os calibra (Task 10). */
export const RHYTHM_TUNING = {
  /** pulse nível 2: fator sobre o `edge` das corridas e sobre a razão de pressão */
  pressureEdge: 0.85,
  /** pulse nível 2: incompletude do ataque pressionado quando a razão de pressão é > 1 */
  pressureIncompletion: 1.15,
  slipstreamEdge: 1.15,
  slipstreamIncompletion: 0.5,
  intimidatePressure: 1.3,
  enforcerFumble: 1.2,
  islandRisk: 1.5,
  predatorEdge: 1.15,
  overdriveMinYards: 3,
};

export interface PerkCall {
  species: number;
  xFactor: XFactorId;
}

/**
 * O que o ritmo muda numa jogada. `pressed` só é preenchido no nível 2 do pulse (o nível 1 mexe só no timer
 * do servidor). `perks` traz os capitães que estão em zona; o `resolvePlay` só aplica o perk se a espécie
 * for ator da jogada.
 */
export interface PlayModifiers {
  pressed: 'offense' | 'defense' | null;
  perks: { offense?: PerkCall; defense?: PerkCall };
}

export const NEUTRAL_MODIFIERS: PlayModifiers = { pressed: null, perks: {} };
```

- [ ] **Step 6: Criar `rhythm.ts` (base)**

```ts
import type { PulseTier, RhythmState, TeamKey } from './model';

export const MOMENTUM_LIMIT = 100;
export const TIER_1_AT = 50;
export const TIER_2_AT = 80;
export const TIMEOUTS_PER_MATCH = 2;

export const clampMomentum = (value: number): number => Math.max(-MOMENTUM_LIMIT, Math.min(MOMENTUM_LIMIT, value));

export function initialRhythm(): RhythmState {
  const side = () => ({ offense: { progress: 0, inZone: false }, defense: { progress: 0, inZone: false } });
  return {
    momentum: 0,
    streak: { team: null, count: 0 },
    zone: { A: side(), B: side() },
    timeouts: { A: TIMEOUTS_PER_MATCH, B: TIMEOUTS_PER_MATCH },
    calledThisSnap: { A: false, B: false },
  };
}

/** Quem domina e em que nível. O time pressionado é o adversário do dominante. */
export function pulseTier(momentum: number): { dominant: TeamKey | null; tier: PulseTier } {
  const size = Math.abs(momentum);
  const tier: PulseTier = size >= TIER_2_AT ? 2 : size >= TIER_1_AT ? 1 : 0;
  return { dominant: tier === 0 ? null : momentum > 0 ? 'A' : 'B', tier };
}
```

- [ ] **Step 7: Exportar no índice**

Em `packages/engine/src/index.ts`, acrescentar ao fim:

```ts
export * from './xfactors';
export * from './rhythm';
```

- [ ] **Step 8: Rodar o teste e o typecheck**

Run: `npx vitest run packages/engine/test/rhythm.test.ts && npm run typecheck`
Expected: testes PASS. O typecheck pode acusar `switch` não exaustivos no cliente/sim por causa de `USE_TIMEOUT` e dos eventos novos; se acusar, anote os erros e deixe para as Tasks 7 a 11 (cada uma corrige o que é dela). Nenhum erro deve vir de `packages/engine/src`.

- [ ] **Step 9: Commit**

```bash
git add packages/engine/src packages/engine/test/rhythm.test.ts
git commit -m "feat(engine/rhythm): tipos, tabela de perks e estado inicial do ritmo" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Validação dos capitães no `Team`

**Files:**
- Modify: `packages/engine/src/team.ts`
- Test: `packages/engine/test/team.test.ts`

**Interfaces:**
- Consumes: `PERKS`, `XFACTOR_IDS` (Task 1); `slotPosition` de `./formations`.
- Produces: `validateTeam` devolve `MALFORMED_TEAM` para `captains` malformado, `CAPTAIN_NOT_IN_ROSTER` e `XFACTOR_POSITION_MISMATCH` (detail `offense:<espécie>` ou `defense:<espécie>`).

- [ ] **Step 1: Escrever os testes que falham**

Ao fim de `packages/engine/test/team.test.ts` acrescentar (os imports `describe`, `it`, `expect`, `electricTeam` e `validateTeam` já existem no arquivo; confirme e acrescente o que faltar):

```ts
describe('validateTeam: capitães', () => {
  const base = electricTeam();
  const withCaptains = (captains: unknown) => ({ ...base, captains });

  it('time sem capitães continua válido', () => {
    expect(validateTeam(base)).toEqual([]);
  });

  it('aceita um capitão ofensivo e um defensivo válidos, ou só um deles', () => {
    const off = { species: 63, xFactor: 'TELEPATHIC_POCKET' }; // 63 Abra é o QB titular
    const def = { species: 95, xFactor: 'INTIMIDATE_RUSH' }; // 95 Onix é DL1
    expect(validateTeam(withCaptains({ offense: off, defense: def }))).toEqual([]);
    expect(validateTeam(withCaptains({ offense: off }))).toEqual([]);
    expect(validateTeam(withCaptains({ defense: def }))).toEqual([]);
    expect(validateTeam(withCaptains({}))).toEqual([]);
  });

  it('rejeita captains malformado', () => {
    for (const bad of [null, 'x', [], { offense: 'x' }, { offense: { species: 63 } }, { offense: { species: 63, xFactor: 'NOPE' } }, { offense: { species: 1.5, xFactor: 'TELEPATHIC_POCKET' } }]) {
      expect(validateTeam(withCaptains(bad))).toEqual([{ code: 'MALFORMED_TEAM' }]);
    }
  });

  it('exige a espécie no elenco', () => {
    const errors = validateTeam(withCaptains({ offense: { species: 6, xFactor: 'TELEPATHIC_POCKET' } }));
    expect(errors).toEqual([{ code: 'CAPTAIN_NOT_IN_ROSTER', detail: 'offense:6' }]);
  });

  it('exige o perk do lado certo e a espécie numa vaga da posição do perk', () => {
    // perk defensivo no capitão ofensivo
    expect(validateTeam(withCaptains({ offense: { species: 95, xFactor: 'INTIMIDATE_RUSH' } }))).toEqual([
      { code: 'XFACTOR_POSITION_MISMATCH', detail: 'offense:95' },
    ]);
    // 25 Pikachu é RB, não QB
    expect(validateTeam(withCaptains({ offense: { species: 25, xFactor: 'TELEPATHIC_POCKET' } }))).toEqual([
      { code: 'XFACTOR_POSITION_MISMATCH', detail: 'offense:25' },
    ]);
    // 25 Pikachu não joga de DL
    expect(validateTeam(withCaptains({ defense: { species: 25, xFactor: 'INTIMIDATE_RUSH' } }))).toEqual([
      { code: 'XFACTOR_POSITION_MISMATCH', detail: 'defense:25' },
    ]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/engine/test/team.test.ts`
Expected: FAIL nos casos de capitães (hoje `captains` é ignorado e o time é "válido").

- [ ] **Step 3: Implementar**

Em `packages/engine/src/team.ts`:

1. Trocar a linha de import do modelo por:

```ts
import type { CardSide, Captains, Position, Species, StatKey, Team, TeamError } from './model';
```

2. Trocar a linha `import { FORMATIONS, PACKAGES, fillSlots } from './formations';` por:

```ts
import { FORMATIONS, PACKAGES, fillSlots, slotPosition } from './formations';
import { PERKS } from './xfactors';
```

3. Depois de `const isStringArray = ...` acrescentar:

```ts
const isCaptain = (v: unknown): boolean => {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  return Number.isInteger(c.species) && typeof c.xFactor === 'string' && Object.hasOwn(PERKS, c.xFactor);
};

function isCaptainsShape(value: unknown): value is Captains {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const c = value as Record<string, unknown>;
  return (c.offense === undefined || isCaptain(c.offense)) && (c.defense === undefined || isCaptain(c.defense));
}
```

4. Dentro de `isTeamShape`, acrescentar uma condição antes do `!!t.depth &&`:

```ts
    isCaptainsShape(t.captains) &&
```

5. Antes de `/** Lista vazia = time válido ...` acrescentar:

```ts
function validateCaptains(team: Team): TeamError[] {
  const errors: TeamError[] = [];
  const roster = new Set(team.roster);
  for (const side of ['offense', 'defense'] as const) {
    const captain = team.captains?.[side];
    if (!captain) continue;
    const detail = `${side}:${captain.species}`;
    if (!roster.has(captain.species)) {
      errors.push({ code: 'CAPTAIN_NOT_IN_ROSTER', detail });
      continue;
    }
    const perk = PERKS[captain.xFactor];
    const playsPosition = Object.entries(team.depth).some(
      ([slot, ids]) => slotPosition(slot as never) === perk.position && (ids ?? []).includes(captain.species),
    );
    if (perk.side !== side || !playsPosition) errors.push({ code: 'XFACTOR_POSITION_MISMATCH', detail });
  }
  return errors;
}
```

6. Em `validateTeam`, depois de `errors.push(...validateDepth(team));` acrescentar:

```ts
  errors.push(...validateCaptains(team));
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run packages/engine/test/team.test.ts`
Expected: PASS (todos, inclusive os antigos).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/team.ts packages/engine/test/team.test.ts
git commit -m "feat(engine/rhythm): valida os capitães do time" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Momentum por jogada (`applyPlay`, parte do momentum)

**Files:**
- Modify: `packages/engine/src/rhythm.ts`
- Create: `packages/engine/test/rhythm-helpers.ts`
- Test: `packages/engine/test/rhythm-momentum.test.ts`

**Interfaces:**
- Consumes: `RhythmState`, `GameEvent`, `PlayOutcome` etc. (Task 1); `DriveEnd` de `./field`.
- Produces: `PlayReport` e `applyPlay(prev: RhythmState, report: PlayReport): { rhythm: RhythmState; events: GameEvent[] }`. Nesta task `applyPlay` já devolve momentum, sequência e `PULSE_TIER`; a zona entra na Task 4 (o método chama `updateZones`, que aqui é um esqueleto vazio).

- [ ] **Step 1: Escrever os testes que falham**

Criar `packages/engine/test/rhythm-helpers.ts` (helpers compartilhados pelos testes do ritmo; o `PlayReport` só existe depois do Step 3, então o typecheck desse arquivo só fecha lá):

```ts
import type { PlayOutcome } from '../src/model';
import type { PlayReport } from '../src/rhythm';

export const outcome = (o: Partial<PlayOutcome> = {}): PlayOutcome => ({
  kind: 'GAIN', yards: 4, bigPlay: false, read: 'NEUTRAL', offActors: [], defActors: [],
  offTypeMult: 1, defTypeMult: 1, readFactor: 1, statFactor: 1, varianceFactor: 1, ...o,
});
export const report = (o: Partial<PlayReport> = {}): PlayReport => ({
  offense: 'A', category: 'RUN_INSIDE', outcome: outcome(), field: { down: 1, yardsToGo: 10, ballOn: 25 },
  firstDown: false, end: null, captains: { A: undefined, B: undefined }, ...o,
});
```

Criar `packages/engine/test/rhythm-momentum.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyPlay, initialRhythm, type PlayReport } from '../src/rhythm';
import type { GameEvent, RhythmState } from '../src/model';
import { outcome, report } from './rhythm-helpers';

const withMomentum = (m: number): RhythmState => ({ ...initialRhythm(), momentum: m });
const momentumEvents = (events: GameEvent[]) => events.filter((e) => e.t === 'MOMENTUM');

describe('applyPlay: sequência de leituras', () => {
  it('leitura errada da defesa dá ao ataque +10, +20 e +35 (e continua em +35)', () => {
    let r = initialRhythm();
    const values: number[] = [];
    for (let i = 0; i < 4; i++) {
      r = applyPlay(r, report({ outcome: outcome({ read: 'WRONG' }) })).rhythm;
      values.push(r.momentum);
    }
    expect(values).toEqual([10, 30, 65, 100]);
    expect(r.streak).toEqual({ team: 'A', count: 4 });
  });

  it('leitura certa da defesa B dá momentum a favor do B (negativo)', () => {
    const r = applyPlay(initialRhythm(), report({ outcome: outcome({ read: 'RIGHT' }) })).rhythm;
    expect(r.momentum).toBe(-10);
    expect(r.streak).toEqual({ team: 'B', count: 1 });
  });

  it('o outro time ganhar a leitura reinicia a sequência em 1', () => {
    let r = applyPlay(initialRhythm(), report({ outcome: outcome({ read: 'WRONG' }) })).rhythm;
    r = applyPlay(r, report({ outcome: outcome({ read: 'WRONG' }) })).rhythm; // A: 10 + 20
    r = applyPlay(r, report({ outcome: outcome({ read: 'RIGHT' }) })).rhythm; // B: -10
    expect(r.momentum).toBe(20);
    expect(r.streak).toEqual({ team: 'B', count: 1 });
  });

  it('leitura neutra zera a sequência e não dá pontos', () => {
    let r = applyPlay(initialRhythm(), report({ outcome: outcome({ read: 'WRONG' }) })).rhythm;
    const step = applyPlay(r, report({ outcome: outcome({ read: 'NEUTRAL' }) }));
    expect(step.rhythm.momentum).toBe(10);
    expect(step.rhythm.streak).toEqual({ team: null, count: 0 });
    expect(momentumEvents(step.events)).toEqual([]);
  });
});

describe('applyPlay: grandes jogadas', () => {
  it('sack de 5+ jardas: +25 da defesa e −30 do ataque (swing de 55)', () => {
    const step = applyPlay(initialRhythm(), report({ outcome: outcome({ kind: 'SACK', yards: -6 }) }));
    expect(step.rhythm.momentum).toBe(-55);
    expect(momentumEvents(step.events).map((e) => (e as { reason: string }).reason)).toEqual(['SACK', 'SACK_SUFFERED']);
  });

  it('sack de 4 jardas: só o −30 do ataque', () => {
    const step = applyPlay(initialRhythm(), report({ outcome: outcome({ kind: 'SACK', yards: -4 }) }));
    expect(step.rhythm.momentum).toBe(-30);
  });

  it('conversão de 3ª ou 4ª com 8+ jardas: +20 do ataque; menos que isso, ou outra descida, não', () => {
    const converted = (down: number, yardsToGo: number) =>
      applyPlay(initialRhythm(), report({ field: { down, yardsToGo, ballOn: 40 }, firstDown: true })).rhythm.momentum;
    expect(converted(3, 8)).toBe(20);
    expect(converted(4, 12)).toBe(20);
    expect(converted(3, 7)).toBe(0);
    expect(converted(2, 12)).toBe(0);
    const notConverted = applyPlay(initialRhythm(), report({ field: { down: 3, yardsToGo: 9, ballOn: 40 }, firstDown: false }));
    expect(notConverted.rhythm.momentum).toBe(0);
  });

  it('turnover dá +40 à defesa; touchdown dá +40 ao ataque; downs tira 30 do ataque', () => {
    const run = (o: Partial<PlayReport>) => applyPlay(initialRhythm(), report(o)).rhythm.momentum;
    expect(run({ outcome: outcome({ kind: 'INTERCEPTION', yards: 10 }), end: 'TURNOVER' })).toBe(-40);
    expect(run({ outcome: outcome({ kind: 'FUMBLE', yards: 2 }), end: 'TURNOVER' })).toBe(-40);
    expect(run({ end: 'TOUCHDOWN' })).toBe(40);
    expect(run({ end: 'DOWNS' })).toBe(-30);
  });

  it('quando o B ataca, os sinais se invertem', () => {
    const r = applyPlay(initialRhythm(), report({ offense: 'B', end: 'TOUCHDOWN' })).rhythm;
    expect(r.momentum).toBe(-40);
  });
});

describe('applyPlay: limite e nível do pulse', () => {
  it('limita a 100 uma vez no fim; o último evento mostra o valor final', () => {
    const step = applyPlay(withMomentum(90), report({ outcome: outcome({ read: 'WRONG' }), end: 'TOUCHDOWN' }));
    expect(step.rhythm.momentum).toBe(100);
    const events = momentumEvents(step.events) as { value: number; delta: number }[];
    expect(events.map((e) => e.delta)).toEqual([10, 40]);
    expect(events.at(-1)?.value).toBe(100);
  });

  it('emite PULSE_TIER só quando o nível ou o dominante muda, depois dos MOMENTUM', () => {
    const up = applyPlay(withMomentum(45), report({ outcome: outcome({ read: 'WRONG' }) }));
    expect(up.events.map((e) => e.t)).toEqual(['MOMENTUM', 'PULSE_TIER']);
    expect(up.events.at(-1)).toEqual({ t: 'PULSE_TIER', dominant: 'A', tier: 1 });
    const same = applyPlay(withMomentum(60), report({ outcome: outcome({ read: 'WRONG' }) }));
    expect(same.events.map((e) => e.t)).toEqual(['MOMENTUM']);
  });

  it('não altera o estado de entrada', () => {
    const before = withMomentum(10);
    const copy = structuredClone(before);
    applyPlay(before, report({ outcome: outcome({ read: 'WRONG' }) }));
    expect(before).toEqual(copy);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/engine/test/rhythm-momentum.test.ts`
Expected: FAIL (`applyPlay` não existe).

- [ ] **Step 3: Implementar em `rhythm.ts`**

Trocar o import do topo de `packages/engine/src/rhythm.ts` por:

```ts
import type {
  Captains, FieldState, GameEvent, MomentumReason, OffenseCategory, PlayOutcome, PulseTier, RhythmState, TeamKey,
} from './model';
import type { DriveEnd } from './field';
```

Acrescentar ao fim do arquivo:

```ts
/** Pontos do spec do ritmo, 5.1. Valores iniciais a calibrar (Task 10). */
export const MOMENTUM_POINTS = {
  streak: [10, 20, 35],
  sack: 25,
  sackSuffered: 30,
  longConversion: 20,
  turnover: 40,
  touchdown: 40,
  downs: 30,
};
export const SACK_BIG_LOSS = 5;
export const LONG_CONVERSION_YARDS = 8;

/** O que `applyPlay` precisa saber de uma jogada resolvida (corrida ou passe, fora da conversão de 2). */
export interface PlayReport {
  offense: TeamKey;
  category: OffenseCategory;
  outcome: PlayOutcome;
  /** campo antes da jogada */
  field: FieldState;
  firstDown: boolean;
  end: DriveEnd['kind'] | null;
  captains: Record<TeamKey, Captains | undefined>;
}

const other = (k: TeamKey): TeamKey => (k === 'A' ? 'B' : 'A');
/** Pontos a favor de `team`: positivo para o A, negativo para o B. */
const toward = (team: TeamKey, points: number): number => (team === 'A' ? points : -points);

function momentumDeltas(rhythm: RhythmState, r: PlayReport): { delta: number; reason: MomentumReason }[] {
  const deltas: { delta: number; reason: MomentumReason }[] = [];
  const defense = other(r.offense);
  const { outcome, field } = r;

  const winner = outcome.read === 'WRONG' ? r.offense : outcome.read === 'RIGHT' ? defense : null;
  if (winner) {
    const count = rhythm.streak.team === winner ? rhythm.streak.count + 1 : 1;
    rhythm.streak = { team: winner, count };
    const table = MOMENTUM_POINTS.streak;
    deltas.push({ delta: toward(winner, table[Math.min(count, table.length) - 1]), reason: 'STREAK' });
  } else {
    rhythm.streak = { team: null, count: 0 };
  }

  if (outcome.kind === 'SACK') {
    if (-outcome.yards >= SACK_BIG_LOSS) deltas.push({ delta: toward(defense, MOMENTUM_POINTS.sack), reason: 'SACK' });
    deltas.push({ delta: toward(defense, MOMENTUM_POINTS.sackSuffered), reason: 'SACK_SUFFERED' });
  }
  if (r.firstDown && (field.down === 3 || field.down === 4) && field.yardsToGo >= LONG_CONVERSION_YARDS) {
    deltas.push({ delta: toward(r.offense, MOMENTUM_POINTS.longConversion), reason: 'LONG_CONVERSION' });
  }
  if (r.end === 'TURNOVER') deltas.push({ delta: toward(defense, MOMENTUM_POINTS.turnover), reason: 'TURNOVER' });
  if (r.end === 'TOUCHDOWN') deltas.push({ delta: toward(r.offense, MOMENTUM_POINTS.touchdown), reason: 'TOUCHDOWN' });
  if (r.end === 'DOWNS') deltas.push({ delta: toward(defense, MOMENTUM_POINTS.downs), reason: 'DOWNS' });
  return deltas;
}

function tierEvents(before: number, after: number): GameEvent[] {
  const a = pulseTier(before);
  const b = pulseTier(after);
  return a.dominant === b.dominant && a.tier === b.tier ? [] : [{ t: 'PULSE_TIER', dominant: b.dominant, tier: b.tier }];
}

/** Atualiza zonas e devolve os eventos ZONE_EXIT, ZONE_ENTER e ZONE_CLASH. Implementada na Task 4. */
function updateZones(_rhythm: RhythmState, _report: PlayReport): GameEvent[] {
  return [];
}

/**
 * Momentum, sequência, zonas e pulse depois de uma jogada. Puro: não altera `prev`.
 * Ordem dos eventos: MOMENTUM (na ordem da tabela do spec 5.1), zona, PULSE_TIER.
 */
export function applyPlay(prev: RhythmState, report: PlayReport): { rhythm: RhythmState; events: GameEvent[] } {
  const rhythm = structuredClone(prev);
  const events: GameEvent[] = [];
  let running = rhythm.momentum;
  for (const { delta, reason } of momentumDeltas(rhythm, report)) {
    running += delta;
    events.push({ t: 'MOMENTUM', delta, value: clampMomentum(running), reason });
  }
  rhythm.momentum = clampMomentum(running);
  events.push(...updateZones(rhythm, report));
  events.push(...tierEvents(prev.momentum, rhythm.momentum));
  return { rhythm, events };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run packages/engine/test/rhythm-momentum.test.ts packages/engine/test/rhythm.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/rhythm.ts packages/engine/test/rhythm-momentum.test.ts packages/engine/test/rhythm-helpers.ts
git commit -m "feat(engine/rhythm): momentum, sequência de leituras e nível do pulse por jogada" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Zona dos capitães (entrada, saída e clash)

**Files:**
- Modify: `packages/engine/src/rhythm.ts`
- Test: `packages/engine/test/rhythm-zone.test.ts`

**Interfaces:**
- Consumes: `applyPlay`, `PlayReport`, `updateZones` (esqueleto da Task 3); os helpers `outcome`/`report` de `rhythm-helpers.ts`.
- Produces: `zoneGain(perk: XFactorId, report: PlayReport): number` (exportada) e `updateZones` completo. `ZONE_TRIGGER = 2`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `packages/engine/test/rhythm-zone.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyPlay, initialRhythm, zoneGain, type PlayReport } from '../src/rhythm';
import type { Captains, GameEvent, RhythmState, TeamKey, XFactorId } from '../src/model';
import { outcome, report } from './rhythm-helpers';

const captains: Record<TeamKey, Captains> = {
  A: { offense: { species: 63, xFactor: 'TELEPATHIC_POCKET' }, defense: { species: 95, xFactor: 'INTIMIDATE_RUSH' } },
  B: { offense: { species: 25, xFactor: 'OVERDRIVE_BREAKTHROUGH' }, defense: { species: 66, xFactor: 'ENFORCER_STOMP' } },
};
const play = (o: Partial<PlayReport> = {}): PlayReport => report({ captains, ...o });
const inZone = (r: RhythmState, team: TeamKey, side: 'offense' | 'defense'): RhythmState => {
  const copy = structuredClone(r);
  copy.zone[team][side] = { progress: 2, inZone: true };
  return copy;
};
const types = (events: GameEvent[]) => events.map((e) => e.t);

describe('zoneGain: gatilhos por perk', () => {
  const gain = (perk: XFactorId, o: Partial<PlayReport>) => zoneGain(perk, play(o));
  it('QB: passe completo com leitura errada da defesa', () => {
    expect(gain('TELEPATHIC_POCKET', { category: 'SHORT_PASS', outcome: outcome({ read: 'WRONG' }) })).toBe(1);
    expect(gain('TELEPATHIC_POCKET', { category: 'SHORT_PASS', outcome: outcome({ read: 'NEUTRAL' }) })).toBe(0);
    expect(gain('TELEPATHIC_POCKET', { category: 'RUN_INSIDE', outcome: outcome({ read: 'WRONG' }) })).toBe(0);
    expect(gain('TELEPATHIC_POCKET', { category: 'SHORT_PASS', outcome: outcome({ kind: 'INCOMPLETE', yards: 0, read: 'WRONG' }) })).toBe(0);
  });
  it('RB: corrida de 10+ jardas', () => {
    expect(gain('OVERDRIVE_BREAKTHROUGH', { category: 'RUN_OUTSIDE', outcome: outcome({ yards: 10 }) })).toBe(1);
    expect(gain('OVERDRIVE_BREAKTHROUGH', { category: 'RUN_OUTSIDE', outcome: outcome({ yards: 9 }) })).toBe(0);
    expect(gain('OVERDRIVE_BREAKTHROUGH', { category: 'SHORT_PASS', outcome: outcome({ yards: 12 }) })).toBe(0);
  });
  it('WR: passe completo que faz 1st down (ou touchdown)', () => {
    expect(gain('SLIPSTREAM_SEPARATION', { category: 'DEEP_PASS', firstDown: true })).toBe(1);
    expect(gain('SLIPSTREAM_SEPARATION', { category: 'DEEP_PASS', end: 'TOUCHDOWN' })).toBe(1);
    expect(gain('SLIPSTREAM_SEPARATION', { category: 'DEEP_PASS' })).toBe(0);
  });
  it('OL: jogada que não é sack nem perda', () => {
    expect(gain('IMMOVABLE_WALL', { outcome: outcome({ yards: 0 }) })).toBe(1);
    expect(gain('IMMOVABLE_WALL', { outcome: outcome({ kind: 'INCOMPLETE', yards: 0 }) })).toBe(1);
    expect(gain('IMMOVABLE_WALL', { outcome: outcome({ yards: -1 }) })).toBe(0);
    expect(gain('IMMOVABLE_WALL', { outcome: outcome({ kind: 'SACK', yards: -5 }) })).toBe(0);
    expect(gain('IMMOVABLE_WALL', { outcome: outcome({ kind: 'FUMBLE', yards: 3 }) })).toBe(0);
  });
  it('DL: sack vale 2; corrida contida (ganho ≤ 2) vale 1', () => {
    expect(gain('INTIMIDATE_RUSH', { outcome: outcome({ kind: 'SACK', yards: -5 }) })).toBe(2);
    expect(gain('INTIMIDATE_RUSH', { category: 'RUN_INSIDE', outcome: outcome({ yards: 2 }) })).toBe(1);
    expect(gain('INTIMIDATE_RUSH', { category: 'RUN_INSIDE', outcome: outcome({ yards: 3 }) })).toBe(0);
    expect(gain('INTIMIDATE_RUSH', { category: 'SHORT_PASS', outcome: outcome({ yards: 1 }) })).toBe(0);
  });
  it('LB: RUN_INSIDE com ganho ≤ 3', () => {
    expect(gain('ENFORCER_STOMP', { category: 'RUN_INSIDE', outcome: outcome({ yards: 3 }) })).toBe(1);
    expect(gain('ENFORCER_STOMP', { category: 'RUN_INSIDE', outcome: outcome({ yards: 4 }) })).toBe(0);
    expect(gain('ENFORCER_STOMP', { category: 'RUN_OUTSIDE', outcome: outcome({ yards: 1 }) })).toBe(0);
  });
  it('CB: passe incompleto', () => {
    expect(gain('ISLAND_LOCKDOWN', { category: 'SHORT_PASS', outcome: outcome({ kind: 'INCOMPLETE', yards: 0 }) })).toBe(1);
    expect(gain('ISLAND_LOCKDOWN', { category: 'SHORT_PASS' })).toBe(0);
  });
  it('S: qualquer jogada que não seja DEEP_PASS completo', () => {
    expect(gain('PREDATOR_HAWK', { category: 'DEEP_PASS' })).toBe(0);
    expect(gain('PREDATOR_HAWK', { category: 'DEEP_PASS', outcome: outcome({ kind: 'INCOMPLETE', yards: 0 }) })).toBe(1);
    expect(gain('PREDATOR_HAWK', { category: 'RUN_INSIDE' })).toBe(1);
  });
});

describe('applyPlay: entrada na zona', () => {
  const qbPlay = play({ category: 'SHORT_PASS', outcome: outcome({ read: 'WRONG', offActors: [63] }) });

  it('o capitão ator que qualifica duas vezes seguidas entra na zona', () => {
    const first = applyPlay(initialRhythm(), qbPlay);
    expect(first.rhythm.zone.A.offense).toEqual({ progress: 1, inZone: false });
    expect(types(first.events)).not.toContain('ZONE_ENTER');
    const second = applyPlay(first.rhythm, qbPlay);
    expect(second.rhythm.zone.A.offense.inZone).toBe(true);
    expect(second.events).toContainEqual({ t: 'ZONE_ENTER', team: 'A', side: 'offense', species: 63, xFactor: 'TELEPATHIC_POCKET' });
  });

  it('jogada que não qualifica zera o progresso quando o capitão é ator', () => {
    const first = applyPlay(initialRhythm(), qbPlay).rhythm;
    const miss = play({ category: 'SHORT_PASS', outcome: outcome({ read: 'NEUTRAL', offActors: [63] }) });
    expect(applyPlay(first, miss).rhythm.zone.A.offense.progress).toBe(0);
  });

  it('se o capitão não é ator, o progresso fica como está', () => {
    const first = applyPlay(initialRhythm(), qbPlay).rhythm;
    const notActor = play({ category: 'SHORT_PASS', outcome: outcome({ read: 'NEUTRAL', offActors: [25] }) });
    expect(applyPlay(first, notActor).rhythm.zone.A.offense.progress).toBe(1);
  });

  it('o sack do DL (+2) basta para entrar na zona; vale para o lado que defende', () => {
    const sack = play({ offense: 'B', outcome: outcome({ kind: 'SACK', yards: -6, defActors: [95] }) });
    const step = applyPlay(initialRhythm(), sack);
    expect(step.rhythm.zone.A.defense.inZone).toBe(true);
    expect(step.events).toContainEqual({ t: 'ZONE_ENTER', team: 'A', side: 'defense', species: 95, xFactor: 'INTIMIDATE_RUSH' });
  });

  it('time sem capitão não faz nada', () => {
    const step = applyPlay(initialRhythm(), report({ outcome: outcome({ read: 'WRONG', offActors: [63] }), category: 'SHORT_PASS' }));
    expect(step.rhythm.zone.A.offense).toEqual({ progress: 0, inZone: false });
  });
});

describe('applyPlay: saída da zona', () => {
  it('o capitão ofensivo sai com sack, perda ou turnover, mesmo sem ser ator', () => {
    const start = inZone(initialRhythm(), 'A', 'offense');
    for (const o of [outcome({ kind: 'SACK', yards: -6 }), outcome({ yards: -2 }), outcome({ kind: 'INTERCEPTION', yards: 10 }), outcome({ kind: 'FUMBLE', yards: 1 })]) {
      const step = applyPlay(start, play({ outcome: o }));
      expect(step.rhythm.zone.A.offense).toEqual({ progress: 0, inZone: false });
      expect(step.events).toContainEqual({ t: 'ZONE_EXIT', team: 'A', side: 'offense', species: 63, cause: 'NEGATIVE_PLAY' });
    }
  });

  it('jogada neutra mantém o capitão ofensivo na zona', () => {
    const start = inZone(initialRhythm(), 'A', 'offense');
    const step = applyPlay(start, play({ outcome: outcome({ yards: 3 }) }));
    expect(step.rhythm.zone.A.offense.inZone).toBe(true);
    expect(types(step.events)).not.toContain('ZONE_EXIT');
  });

  it('o capitão defensivo sai ao ceder 20+ jardas ou touchdown', () => {
    const start = inZone(initialRhythm(), 'B', 'defense');
    for (const o of [play({ outcome: outcome({ yards: 20 }) }), play({ end: 'TOUCHDOWN', outcome: outcome({ yards: 6 }) })]) {
      const step = applyPlay(start, o);
      expect(step.rhythm.zone.B.defense.inZone).toBe(false);
      expect(step.events).toContainEqual({ t: 'ZONE_EXIT', team: 'B', side: 'defense', species: 66, cause: 'BIG_GAIN' });
    }
    expect(applyPlay(start, play({ outcome: outcome({ yards: 19 }) })).rhythm.zone.B.defense.inZone).toBe(true);
  });

  it('o capitão defensivo ator que não qualifica perde o progresso, enquanto o ofensivo sai', () => {
    const r = inZone(initialRhythm(), 'A', 'offense');
    r.zone.B.defense = { progress: 1, inZone: false };
    const step = applyPlay(r, play({ category: 'RUN_INSIDE', outcome: outcome({ kind: 'SACK', yards: -6, defActors: [66] }) }));
    expect(types(step.events).filter((t) => t.startsWith('ZONE'))).toEqual(['ZONE_EXIT']);
    expect(step.rhythm.zone.B.defense.progress).toBe(0);
  });
});

describe('applyPlay: clash', () => {
  it('emite ZONE_CLASH com as espécies dos dois capitães quando a jogada traz perks.clash', () => {
    const step = applyPlay(
      initialRhythm(),
      play({ offense: 'A', outcome: outcome({ perks: { offense: 'TELEPATHIC_POCKET', defense: 'ENFORCER_STOMP', clash: true } }) }),
    );
    expect(step.events).toContainEqual({ t: 'ZONE_CLASH', offense: 63, defense: 66 });
  });

  it('sem clash na jogada, nada', () => {
    const step = applyPlay(initialRhythm(), play({ outcome: outcome({ perks: { offense: 'TELEPATHIC_POCKET' } }) }));
    expect(types(step.events)).not.toContain('ZONE_CLASH');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/engine/test/rhythm-zone.test.ts packages/engine/test/rhythm-momentum.test.ts`
Expected: `rhythm-momentum` continua PASS; `rhythm-zone` FAIL (`zoneGain` não existe, `updateZones` vazio).

- [ ] **Step 3: Implementar em `rhythm.ts`**

Acrescentar `XFactorId, ZoneExitCause, ZoneSide` à lista do `import type` do topo do `rhythm.ts`. Substituir o esqueleto `updateZones` por:

```ts
export const ZONE_TRIGGER = 2;
const PASSES: readonly OffenseCategory[] = ['SHORT_PASS', 'DEEP_PASS', 'PLAY_ACTION', 'SCREEN'];
const RUNS: readonly OffenseCategory[] = ['RUN_INSIDE', 'RUN_OUTSIDE'];
const BIG_GAIN_YARDS = 20;

/** Progresso que a jogada dá ao perk (spec do ritmo, 5.3). 0 = a jogada não qualifica. */
export function zoneGain(perk: XFactorId, r: PlayReport): number {
  const o = r.outcome;
  const gain = o.kind === 'GAIN';
  switch (perk) {
    case 'TELEPATHIC_POCKET':
      return gain && PASSES.includes(r.category) && o.read === 'WRONG' ? 1 : 0;
    case 'OVERDRIVE_BREAKTHROUGH':
      return gain && RUNS.includes(r.category) && o.yards >= 10 ? 1 : 0;
    case 'SLIPSTREAM_SEPARATION':
      return gain && PASSES.includes(r.category) && (r.firstDown || r.end === 'TOUCHDOWN') ? 1 : 0;
    case 'IMMOVABLE_WALL':
      return (gain || o.kind === 'INCOMPLETE') && o.yards >= 0 ? 1 : 0;
    case 'INTIMIDATE_RUSH':
      if (o.kind === 'SACK') return 2;
      return gain && RUNS.includes(r.category) && o.yards <= 2 ? 1 : 0;
    case 'ENFORCER_STOMP':
      return gain && r.category === 'RUN_INSIDE' && o.yards <= 3 ? 1 : 0;
    case 'ISLAND_LOCKDOWN':
      return o.kind === 'INCOMPLETE' ? 1 : 0;
    case 'PREDATOR_HAWK':
      return gain && r.category === 'DEEP_PASS' ? 0 : 1;
  }
}

function exitCause(side: ZoneSide, r: PlayReport): ZoneExitCause | null {
  const o = r.outcome;
  if (side === 'offense') {
    const negative = o.kind === 'SACK' || o.kind === 'INTERCEPTION' || o.kind === 'FUMBLE' || (o.kind === 'GAIN' && o.yards < 0);
    return negative ? 'NEGATIVE_PLAY' : null;
  }
  return (o.kind === 'GAIN' && o.yards >= BIG_GAIN_YARDS) || r.end === 'TOUCHDOWN' ? 'BIG_GAIN' : null;
}

/** Atualiza as zonas dos dois capitães em campo. Saídas antes das entradas; o clash por último. */
function updateZones(rhythm: RhythmState, r: PlayReport): GameEvent[] {
  const exits: GameEvent[] = [];
  const enters: GameEvent[] = [];
  const defense = other(r.offense);
  const sides: { team: TeamKey; side: ZoneSide; actors: number[] }[] = [
    { team: r.offense, side: 'offense', actors: r.outcome.offActors },
    { team: defense, side: 'defense', actors: r.outcome.defActors },
  ];
  for (const { team, side, actors } of sides) {
    const captain = r.captains[team]?.[side];
    if (!captain) continue;
    const zone = rhythm.zone[team][side];
    if (zone.inZone) {
      const cause = exitCause(side, r);
      if (cause) {
        zone.inZone = false;
        zone.progress = 0;
        exits.push({ t: 'ZONE_EXIT', team, side, species: captain.species, cause });
      }
      continue;
    }
    if (!actors.includes(captain.species)) continue;
    const gain = zoneGain(captain.xFactor, r);
    zone.progress = gain > 0 ? Math.min(ZONE_TRIGGER, zone.progress + gain) : 0;
    if (zone.progress >= ZONE_TRIGGER) {
      zone.inZone = true;
      enters.push({ t: 'ZONE_ENTER', team, side, species: captain.species, xFactor: captain.xFactor });
    }
  }
  const events = [...exits, ...enters];
  const offCaptain = r.captains[r.offense]?.offense;
  const defCaptain = r.captains[defense]?.defense;
  if (r.outcome.perks?.clash && offCaptain && defCaptain) {
    events.push({ t: 'ZONE_CLASH', offense: offCaptain.species, defense: defCaptain.species });
  }
  return events;
}
```

(o `import type` do topo passa a ser `Captains, FieldState, GameEvent, MomentumReason, OffenseCategory, PlayOutcome, PulseTier, RhythmState, TeamKey, XFactorId, ZoneExitCause, ZoneSide`.)

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run packages/engine/test/rhythm-zone.test.ts packages/engine/test/rhythm-momentum.test.ts packages/engine/test/rhythm.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/rhythm.ts packages/engine/test/rhythm-zone.test.ts
git commit -m "feat(engine/rhythm): zona dos capitães (entrada, saída e clash)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Timeout do técnico, `modifiersFor` e a visão pública do ritmo

**Files:**
- Modify: `packages/engine/src/rhythm.ts`
- Test: `packages/engine/test/rhythm-timeout.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 3 e 4.
- Produces:
  - `applyTimeout(prev: RhythmState, team: TeamKey, captains: Record<TeamKey, Captains | undefined>): { rhythm: RhythmState; events: GameEvent[] }`
  - `modifiersFor(rhythm: RhythmState, offense: TeamKey, captains: Record<TeamKey, Captains | undefined>): PlayModifiers`
  - `interface CaptainView { species: number; xFactor: XFactorId; progress: number; inZone: boolean }`
  - `interface RhythmView { momentum: number; dominant: TeamKey | null; tier: PulseTier; timeouts: Record<TeamKey, number>; calledThisSnap: Record<TeamKey, boolean>; captains: Record<TeamKey, Record<ZoneSide, CaptainView | null>> }`
  - `rhythmView(rhythm: RhythmState, captains: Record<TeamKey, Captains | undefined>): RhythmView`

- [ ] **Step 1: Escrever os testes que falham**

Criar `packages/engine/test/rhythm-timeout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyTimeout, initialRhythm, modifiersFor, rhythmView } from '../src/rhythm';
import type { Captains, RhythmState, TeamKey } from '../src/model';

const captains: Record<TeamKey, Captains | undefined> = {
  A: { offense: { species: 63, xFactor: 'TELEPATHIC_POCKET' }, defense: { species: 95, xFactor: 'INTIMIDATE_RUSH' } },
  B: { offense: { species: 25, xFactor: 'OVERDRIVE_BREAKTHROUGH' }, defense: { species: 66, xFactor: 'ENFORCER_STOMP' } },
};
const state = (patch: Partial<RhythmState> = {}): RhythmState => ({ ...initialRhythm(), ...patch });

describe('applyTimeout', () => {
  it('gasta um timeout, marca o snap e corta pela metade o momentum que favorece o rival', () => {
    const step = applyTimeout(state({ momentum: -80 }), 'A', captains);
    expect(step.rhythm.momentum).toBe(-40);
    expect(step.rhythm.timeouts).toEqual({ A: 1, B: 2 });
    expect(step.rhythm.calledThisSnap).toEqual({ A: true, B: false });
    expect(step.events).toEqual([
      { t: 'TIMEOUT_CALLED', team: 'A', remaining: 1 },
      { t: 'MOMENTUM', delta: 40, value: -40, reason: 'TIMEOUT' },
      { t: 'PULSE_TIER', dominant: null, tier: 0 },
    ]);
  });

  it('arredonda em direção a zero', () => {
    expect(applyTimeout(state({ momentum: -75 }), 'A', captains).rhythm.momentum).toBe(-37);
    expect(applyTimeout(state({ momentum: 75 }), 'B', captains).rhythm.momentum).toBe(37);
  });

  it('não corta o momentum que favorece quem chama nem o neutro', () => {
    for (const m of [60, 0]) {
      const step = applyTimeout(state({ momentum: m }), 'A', captains);
      expect(step.rhythm.momentum).toBe(m);
      expect(step.events.map((e) => e.t)).toEqual(['TIMEOUT_CALLED']);
    }
  });

  it('zera a sequência do rival, mas não a de quem chama', () => {
    const rival = applyTimeout(state({ momentum: -20, streak: { team: 'B', count: 2 } }), 'A', captains).rhythm;
    expect(rival.streak).toEqual({ team: null, count: 0 });
    const own = applyTimeout(state({ momentum: 20, streak: { team: 'A', count: 2 } }), 'A', captains).rhythm;
    expect(own.streak).toEqual({ team: 'A', count: 2 });
  });

  it('tira os dois capitães do rival da zona, e só os dele', () => {
    const r = state({ momentum: -60 });
    r.zone.B.offense = { progress: 2, inZone: true };
    r.zone.B.defense = { progress: 2, inZone: true };
    r.zone.A.offense = { progress: 2, inZone: true };
    const step = applyTimeout(r, 'A', captains);
    expect(step.rhythm.zone.B.offense).toEqual({ progress: 0, inZone: false });
    expect(step.rhythm.zone.B.defense).toEqual({ progress: 0, inZone: false });
    expect(step.rhythm.zone.A.offense.inZone).toBe(true);
    expect(step.events).toContainEqual({ t: 'ZONE_EXIT', team: 'B', side: 'offense', species: 25, cause: 'TIMEOUT' });
    expect(step.events).toContainEqual({ t: 'ZONE_EXIT', team: 'B', side: 'defense', species: 66, cause: 'TIMEOUT' });
  });

  it('não altera o estado de entrada', () => {
    const before = state({ momentum: -80 });
    const copy = structuredClone(before);
    applyTimeout(before, 'A', captains);
    expect(before).toEqual(copy);
  });
});

describe('modifiersFor', () => {
  it('sem pulse nem zona é neutro', () => {
    expect(modifiersFor(initialRhythm(), 'A', captains)).toEqual({ pressed: null, perks: {} });
  });

  it('só o nível 2 marca o lado pressionado', () => {
    expect(modifiersFor(state({ momentum: 79 }), 'A', captains).pressed).toBeNull();
    // A domina com 80: o B é o pressionado
    expect(modifiersFor(state({ momentum: 80 }), 'A', captains).pressed).toBe('defense');
    expect(modifiersFor(state({ momentum: 80 }), 'B', captains).pressed).toBe('offense');
    expect(modifiersFor(state({ momentum: -90 }), 'A', captains).pressed).toBe('offense');
  });

  it('repassa só os capitães em zona, cada um no seu lado da jogada', () => {
    const r = state();
    r.zone.A.offense = { progress: 2, inZone: true };
    r.zone.B.defense = { progress: 2, inZone: true };
    r.zone.B.offense = { progress: 2, inZone: true }; // B não ataca neste snap: não entra
    expect(modifiersFor(r, 'A', captains).perks).toEqual({
      offense: { species: 63, xFactor: 'TELEPATHIC_POCKET' },
      defense: { species: 66, xFactor: 'ENFORCER_STOMP' },
    });
  });

  it('zona marcada mas time sem capitão não gera perk', () => {
    const r = state();
    r.zone.A.offense = { progress: 2, inZone: true };
    expect(modifiersFor(r, 'A', { A: undefined, B: undefined }).perks).toEqual({});
  });
});

describe('rhythmView', () => {
  it('resume momentum, nível, timeouts e capitães dos dois times', () => {
    const r = state({ momentum: 65 });
    r.zone.A.offense = { progress: 2, inZone: true };
    const v = rhythmView(r, { A: captains.A, B: { defense: captains.B!.defense } });
    expect(v).toMatchObject({ momentum: 65, dominant: 'A', tier: 1, timeouts: { A: 2, B: 2 }, calledThisSnap: { A: false, B: false } });
    expect(v.captains.A.offense).toEqual({ species: 63, xFactor: 'TELEPATHIC_POCKET', progress: 2, inZone: true });
    expect(v.captains.B.offense).toBeNull();
    expect(v.captains.B.defense).toEqual({ species: 66, xFactor: 'ENFORCER_STOMP', progress: 0, inZone: false });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/engine/test/rhythm-timeout.test.ts`
Expected: FAIL (funções não existem).

- [ ] **Step 3: Implementar em `rhythm.ts`**

Acrescentar `import type { PlayModifiers } from './xfactors';` no topo e `XFactorId` já está importado. Acrescentar ao fim do arquivo:

```ts
/**
 * Timeout do técnico (spec do ritmo, 5.5). O corte só vale se o momentum favorece o rival.
 * Ordem dos eventos: TIMEOUT_CALLED, MOMENTUM, ZONE_EXIT, PULSE_TIER.
 */
export function applyTimeout(
  prev: RhythmState,
  team: TeamKey,
  captains: Record<TeamKey, Captains | undefined>,
): { rhythm: RhythmState; events: GameEvent[] } {
  const rhythm = structuredClone(prev);
  const rival = other(team);
  rhythm.timeouts[team] -= 1;
  rhythm.calledThisSnap[team] = true;
  const events: GameEvent[] = [{ t: 'TIMEOUT_CALLED', team, remaining: rhythm.timeouts[team] }];

  const favorsRival = rival === 'A' ? rhythm.momentum > 0 : rhythm.momentum < 0;
  if (favorsRival) {
    const next = Math.trunc(rhythm.momentum / 2);
    events.push({ t: 'MOMENTUM', delta: next - rhythm.momentum, value: next, reason: 'TIMEOUT' });
    rhythm.momentum = next;
  }
  if (rhythm.streak.team === rival) rhythm.streak = { team: null, count: 0 };
  for (const side of ['offense', 'defense'] as const) {
    const zone = rhythm.zone[rival][side];
    const captain = captains[rival]?.[side];
    if (!zone.inZone) continue;
    zone.inZone = false;
    zone.progress = 0;
    if (captain) events.push({ t: 'ZONE_EXIT', team: rival, side, species: captain.species, cause: 'TIMEOUT' });
  }
  events.push(...tierEvents(prev.momentum, rhythm.momentum));
  return { rhythm, events };
}

/** O que o ritmo muda na próxima jogada (pulse nível 2 e perks dos capitães em zona). */
export function modifiersFor(
  rhythm: RhythmState,
  offense: TeamKey,
  captains: Record<TeamKey, Captains | undefined>,
): PlayModifiers {
  const { dominant, tier } = pulseTier(rhythm.momentum);
  const pressedTeam = dominant && tier === 2 ? other(dominant) : null;
  const perks: PlayModifiers['perks'] = {};
  const defense = other(offense);
  const off = captains[offense]?.offense;
  const def = captains[defense]?.defense;
  if (off && rhythm.zone[offense].offense.inZone) perks.offense = { species: off.species, xFactor: off.xFactor };
  if (def && rhythm.zone[defense].defense.inZone) perks.defense = { species: def.species, xFactor: def.xFactor };
  return { pressed: pressedTeam === null ? null : pressedTeam === offense ? 'offense' : 'defense', perks };
}

export interface CaptainView {
  species: number;
  xFactor: XFactorId;
  progress: number;
  inZone: boolean;
}

/** Visão pública do ritmo: os dois jogadores veem tudo, como no futebol. */
export interface RhythmView {
  momentum: number;
  dominant: TeamKey | null;
  tier: PulseTier;
  timeouts: Record<TeamKey, number>;
  calledThisSnap: Record<TeamKey, boolean>;
  captains: Record<TeamKey, Record<ZoneSide, CaptainView | null>>;
}

export function rhythmView(rhythm: RhythmState, captains: Record<TeamKey, Captains | undefined>): RhythmView {
  const captainView = (team: TeamKey, side: ZoneSide): CaptainView | null => {
    const c = captains[team]?.[side];
    return c ? { species: c.species, xFactor: c.xFactor, ...rhythm.zone[team][side] } : null;
  };
  return {
    ...pulseTier(rhythm.momentum),
    momentum: rhythm.momentum,
    timeouts: { ...rhythm.timeouts },
    calledThisSnap: { ...rhythm.calledThisSnap },
    captains: {
      A: { offense: captainView('A', 'offense'), defense: captainView('A', 'defense') },
      B: { offense: captainView('B', 'offense'), defense: captainView('B', 'defense') },
    },
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run packages/engine/test/rhythm-timeout.test.ts packages/engine/test/rhythm-zone.test.ts packages/engine/test/rhythm-momentum.test.ts packages/engine/test/rhythm.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/rhythm.ts packages/engine/test/rhythm-timeout.test.ts
git commit -m "feat(engine/rhythm): timeout do técnico, modificadores da jogada e visão pública" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `resolvePlay` aplica pulse e perks

**Files:**
- Modify: `packages/engine/src/resolve.ts`
- Test: `packages/engine/test/resolve-rhythm.test.ts`

**Interfaces:**
- Consumes: `PlayModifiers`, `NEUTRAL_MODIFIERS`, `RHYTHM_TUNING`, `PerkCall` (Task 1).
- Produces: `PlayInput.modifiers?: PlayModifiers`. `PlayOutcome.read` passa a ser a leitura **efetiva** (Telepathic Pocket troca `RIGHT` por `NEUTRAL`). `PlayOutcome.perks` só existe quando algum capitão em zona foi ator.

- [ ] **Step 1: Escrever os testes que falham**

Criar `packages/engine/test/resolve-rhythm.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolvePlay, type PlayInput } from '../src/resolve';
import { pickLineup, initialFatigue } from '../src/fatigue';
import { FORMATIONS, PACKAGES } from '../src/formations';
import type { Card, DefenseCategory, OffenseCategory, PlayOutcome, XFactorId } from '../src/model';
import type { PlayModifiers } from '../src/xfactors';
import { electricTeam } from './fixtures';

const team = electricTeam();
const offLineup = pickLineup(FORMATIONS.PISTOL, team, initialFatigue());
const defLineup = pickLineup(PACKAGES.BASE, team, initialFatigue());

const offCard = (category: OffenseCategory): Card =>
  ({ id: `t_${category}`, name: 't', side: 'OFFENSE', category, origin: 'TYPE', element: null, requirements: [] });
const defCard = (category: DefenseCategory): Card =>
  ({ id: `t_${category}`, name: 't', side: 'DEFENSE', category, origin: 'TYPE', element: null, requirements: [] });
const input = (o: Card, d: Card, rng: number, modifiers?: PlayModifiers): PlayInput =>
  ({ offCard: o, defCard: d, offLineup, defLineup, offFatigue: {}, defFatigue: {}, rng, modifiers });

const N = 4000;
const outcomes = (o: Card, d: Card, modifiers?: PlayModifiers): PlayOutcome[] =>
  Array.from({ length: N }, (_, i) => resolvePlay(input(o, d, i * 7919 + 1, modifiers)).outcome);
const avg = (xs: PlayOutcome[]): number => xs.reduce((s, x) => s + (x.kind === 'GAIN' || x.kind === 'SACK' ? x.yards : 0), 0) / xs.length;
const rate = (xs: PlayOutcome[], kind: PlayOutcome['kind']): number => xs.filter((x) => x.kind === kind).length / xs.length;

// atores no fixture (PISTOL × BASE): QB 63 e RB 25 no ataque; OL 95/74/66; WR1 26; DL 95/74/50; LB1 66; CB 26/100; S1 63.
// QB só é ator em passes; RB só em corridas e screen.
const perk = (side: 'offense' | 'defense', species: number, xFactor: XFactorId): PlayModifiers =>
  ({ pressed: null, perks: { [side]: { species, xFactor } } });

describe('resolvePlay: neutralidade', () => {
  it('modificadores neutros dão exatamente o mesmo resultado que sem modificadores', () => {
    for (const [o, d] of [['RUN_INSIDE', 'RUN_STUFF'], ['DEEP_PASS', 'BLITZ'], ['SHORT_PASS', 'MAN'], ['SCREEN', 'ZONE_SHORT']] as const) {
      for (let i = 0; i < 300; i++) {
        const a = resolvePlay(input(offCard(o), defCard(d), i * 31 + 5));
        const b = resolvePlay(input(offCard(o), defCard(d), i * 31 + 5, { pressed: null, perks: {} }));
        expect(b).toEqual(a);
        expect(a.outcome.perks).toBeUndefined();
      }
    }
  });

  it('perk de capitão que não é ator não muda nada', () => {
    const mods = perk('offense', 126, 'TELEPATHIC_POCKET'); // 126 não está em campo
    for (let i = 0; i < 300; i++) {
      expect(resolvePlay(input(offCard('RUN_INSIDE'), defCard('RUN_STUFF'), i + 1, mods))).toEqual(
        resolvePlay(input(offCard('RUN_INSIDE'), defCard('RUN_STUFF'), i + 1)),
      );
    }
  });
});

describe('resolvePlay: pulse nível 2', () => {
  it('ataque pressionado rende menos nas corridas; defesa pressionada rende mais', () => {
    const o = offCard('RUN_INSIDE');
    const d = defCard('ZONE_SHORT');
    const base = avg(outcomes(o, d));
    expect(avg(outcomes(o, d, { pressed: 'offense', perks: {} }))).toBeLessThan(base);
    expect(avg(outcomes(o, d, { pressed: 'defense', perks: {} }))).toBeGreaterThan(base);
  });

  it('ataque pressionado sofre mais sacks nos passes protegidos; defesa pressionada, menos', () => {
    const o = offCard('SHORT_PASS');
    const d = defCard('ZONE_SHORT');
    const base = outcomes(o, d);
    expect(rate(outcomes(o, d, { pressed: 'offense', perks: {} }), 'SACK')).toBeGreaterThan(rate(base, 'SACK'));
    expect(rate(outcomes(o, d, { pressed: 'defense', perks: {} }), 'SACK')).toBeLessThan(rate(base, 'SACK'));
  });
});

describe('resolvePlay: perks ofensivos', () => {
  it('Telepathic Pocket: leitura RIGHT vira NEUTRAL, registrada no outcome', () => {
    const mods = perk('offense', 63, 'TELEPATHIC_POCKET'); // o QB só é ator em passes
    const withPerk = outcomes(offCard('SHORT_PASS'), defCard('MAN'), mods); // MAN × SHORT_PASS = RIGHT
    expect(outcomes(offCard('SHORT_PASS'), defCard('MAN')).every((x) => x.read === 'RIGHT')).toBe(true);
    expect(withPerk.every((x) => x.read === 'NEUTRAL')).toBe(true);
    expect(withPerk.every((x) => x.perks?.offense === 'TELEPATHIC_POCKET')).toBe(true);
    // WRONG fica como está (ZONE_DEEP × SHORT_PASS = WRONG)
    expect(outcomes(offCard('SHORT_PASS'), defCard('ZONE_DEEP'), mods).every((x) => x.read === 'WRONG')).toBe(true);
  });

  it('Telepathic Pocket rende mais jardas que a leitura RIGHT sem perk', () => {
    const o = offCard('SHORT_PASS');
    const d = defCard('MAN'); // RIGHT para SHORT_PASS
    expect(avg(outcomes(o, d, perk('offense', 63, 'TELEPATHIC_POCKET')))).toBeGreaterThan(avg(outcomes(o, d)));
  });

  it('Overdrive Breakthrough: corrida com ganho nunca fica abaixo de 3 jardas', () => {
    const o = offCard('RUN_INSIDE');
    const d = defCard('RUN_STUFF');
    const gains = (xs: PlayOutcome[]) => xs.filter((x) => x.kind === 'GAIN');
    expect(Math.min(...gains(outcomes(o, d)).map((x) => x.yards))).toBeLessThan(3); // o teste só vale se o caso existe
    expect(Math.min(...gains(outcomes(o, d, perk('offense', 25, 'OVERDRIVE_BREAKTHROUGH'))).map((x) => x.yards))).toBeGreaterThanOrEqual(3);
  });

  it('Slipstream Separation: contra MAN, menos incompletos e mais jardas', () => {
    const o = offCard('SHORT_PASS');
    const d = defCard('MAN');
    const base = outcomes(o, d);
    const withPerk = outcomes(o, d, perk('offense', 26, 'SLIPSTREAM_SEPARATION'));
    expect(rate(withPerk, 'INCOMPLETE')).toBeLessThan(rate(base, 'INCOMPLETE'));
    expect(avg(withPerk)).toBeGreaterThan(avg(base));
    // contra outra carta, não faz nada
    const zone = defCard('ZONE_SHORT');
    expect(outcomes(o, zone, perk('offense', 26, 'SLIPSTREAM_SEPARATION'))).toEqual(
      outcomes(o, zone).map((x) => ({ ...x, perks: { offense: 'SLIPSTREAM_SEPARATION' } })),
    );
  });

  it('Immovable Wall: contra BLITZ não há sack', () => {
    const o = offCard('DEEP_PASS');
    const d = defCard('BLITZ');
    expect(rate(outcomes(o, d), 'SACK')).toBeGreaterThan(0);
    expect(rate(outcomes(o, d, perk('offense', 95, 'IMMOVABLE_WALL')), 'SACK')).toBe(0);
  });
});

describe('resolvePlay: perks defensivos', () => {
  it('Intimidate Rush: mais sacks', () => {
    const o = offCard('DEEP_PASS');
    const d = defCard('ZONE_SHORT');
    expect(rate(outcomes(o, d, perk('defense', 95, 'INTIMIDATE_RUSH')), 'SACK')).toBeGreaterThan(rate(outcomes(o, d), 'SACK'));
  });

  it('Enforcer Stomp: mais fumbles nas corridas', () => {
    const o = offCard('RUN_INSIDE');
    const d = defCard('ZONE_SHORT');
    expect(rate(outcomes(o, d, perk('defense', 66, 'ENFORCER_STOMP')), 'FUMBLE')).toBeGreaterThan(rate(outcomes(o, d), 'FUMBLE'));
  });

  it('Island Lockdown: mais incompletos e mais interceptações nos passes', () => {
    const o = offCard('SHORT_PASS');
    const d = defCard('ZONE_SHORT');
    const base = outcomes(o, d);
    const withPerk = outcomes(o, d, perk('defense', 26, 'ISLAND_LOCKDOWN'));
    expect(rate(withPerk, 'INCOMPLETE')).toBeGreaterThan(rate(base, 'INCOMPLETE'));
    expect(rate(withPerk, 'INTERCEPTION')).toBeGreaterThan(rate(base, 'INTERCEPTION'));
  });

  it('Predator Hawk: o ataque rende menos nos passes profundos e nada muda nas corridas por dentro', () => {
    const d = defCard('ZONE_SHORT');
    const mods = perk('defense', 63, 'PREDATOR_HAWK'); // 63 é o S1 do BASE
    expect(avg(outcomes(offCard('DEEP_PASS'), d, mods))).toBeLessThan(avg(outcomes(offCard('DEEP_PASS'), d)));
    // o S não é ator contra corrida por dentro: o perk nem é registrado
    expect(outcomes(offCard('RUN_INSIDE'), d, mods)).toEqual(outcomes(offCard('RUN_INSIDE'), d));
  });
});

describe('resolvePlay: clash', () => {
  it('perks dos dois lados se anulam: mesmo resultado do jogo sem perks, com perks.clash', () => {
    const mods: PlayModifiers = {
      pressed: null,
      perks: { offense: { species: 26, xFactor: 'SLIPSTREAM_SEPARATION' }, defense: { species: 26, xFactor: 'ISLAND_LOCKDOWN' } },
    };
    // 26 é CB1 na defesa e WR1 no ataque (pistol): ator dos dois lados em SHORT_PASS
    const o = offCard('SHORT_PASS');
    const d = defCard('MAN');
    const clashed = outcomes(o, d, mods);
    const plain = outcomes(o, d);
    expect(clashed.every((x) => x.perks?.clash === true)).toBe(true);
    expect(clashed.map((x) => ({ ...x, perks: undefined }))).toEqual(plain.map((x) => ({ ...x, perks: undefined })));
  });
});
```

Nota: o fixture escala as mesmas espécies nos dois lados (a mesma lista de `electricTeam` joga ataque e defesa). Se uma espécie escolhida pelo teste não for ator no `PISTOL`/`BASE`, imprima `outcome.offActors`/`defActors` de uma jogada e troque a espécie do teste por uma que apareça; o objetivo de cada caso é ter o capitão **como ator** do lado certo.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/engine/test/resolve-rhythm.test.ts`
Expected: FAIL (`modifiers` ainda não existe em `PlayInput`; os casos de efeito falham).

- [ ] **Step 3: Implementar em `resolve.ts`**

1. Imports: trocar a linha de `import type` do modelo por:

```ts
import type { Card, DefenseCategory, Lineup, OffenseCategory, PlayKind, PlayOutcome, PokemonType, Position, ReadResult, StatKey, XFactorId } from './model';
```

e acrescentar:

```ts
import { NEUTRAL_MODIFIERS, RHYTHM_TUNING as T, type PlayModifiers } from './xfactors';
```

2. No `interface PlayInput`, acrescentar depois de `rng: number;`:

```ts
  /** Pulse nível 2 e perks (ritmo). Ausente = comportamento anterior ao ritmo. */
  modifiers?: PlayModifiers;
```

3. Substituir a função `resolvePlay` inteira por:

```ts
export function resolvePlay(input: PlayInput): { outcome: PlayOutcome; rng: number } {
  const category = input.offCard.category as OffenseCategory;
  const matchup = MATCHUPS[category];
  const profile = OFFENSE_PROFILES[category];
  const mods = input.modifiers ?? NEUTRAL_MODIFIERS;

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

  let offActors = off.actors;
  let defActors = def.actors;
  let pressureRatio = 1;
  if (matchup.protection) {
    const ol = scoreSide(input.offLineup, [PROTECTION_OFF], input.offFatigue, preferOff);
    const dl = scoreSide(input.defLineup, [PROTECTION_DEF], input.defFatigue, preferDef);
    offActors = unique([...offActors, ...ol.actors]);
    defActors = unique([...defActors, ...dl.actors]);
    pressureRatio = dl.score / ol.score;
  }

  // Perks: só valem se o capitão em zona é ator da jogada; se os dois lados valem, anulam-se (clash).
  const perkOff = mods.perks.offense && offActors.includes(mods.perks.offense.species) ? mods.perks.offense.xFactor : undefined;
  const perkDef = mods.perks.defense && defActors.includes(mods.perks.defense.species) ? mods.perks.defense.xFactor : undefined;
  const clash = perkOff !== undefined && perkDef !== undefined;
  const offPerk: XFactorId | undefined = clash ? undefined : perkOff;
  const defPerk: XFactorId | undefined = clash ? undefined : perkDef;

  const rawRead = readResult(input.defCard.category as DefenseCategory, category);
  const read: ReadResult = offPerk === 'TELEPATHIC_POCKET' && rawRead === 'RIGHT' ? 'NEUTRAL' : rawRead;
  const isRun = category === 'RUN_INSIDE' || category === 'RUN_OUTSIDE';
  const isPass = matchup.protection || category === 'SCREEN';
  const vsMan = input.defCard.category === 'MAN';

  const statFactor = clamp(off.score / def.score, 0.6, 1.4);
  const offTypeMult = typeMult(input.offCard.element, def.actors, off.actors);
  const defTypeMult = typeMult(input.defCard.element, off.actors, def.actors);
  let edge = (statFactor * offTypeMult) / defTypeMult;
  if (isRun && mods.pressed === 'offense') edge *= T.pressureEdge;
  if (isRun && mods.pressed === 'defense') edge /= T.pressureEdge;
  if (offPerk === 'SLIPSTREAM_SEPARATION' && isPass && vsMan) edge *= T.slipstreamEdge;
  if (defPerk === 'PREDATOR_HAWK' && (category === 'DEEP_PASS' || category === 'PLAY_ACTION')) edge /= T.predatorEdge;

  const riskMult = read === 'RIGHT' ? 2 : 1;
  const base = input.offCard.baseYards ?? profile.baseYards;
  const variance = 1 + profile.variance * (u[4] * 2 - 1);

  const perks = {
    ...(perkOff ? { offense: perkOff } : {}),
    ...(perkDef ? { defense: perkDef } : {}),
    ...(clash ? { clash: true } : {}),
  };
  const make = (kind: PlayKind, yards: number, bigPlay = false): PlayOutcome => ({
    kind, yards, bigPlay, read, offActors, defActors, offTypeMult, defTypeMult,
    readFactor: READ_YARDS[read], statFactor, varianceFactor: variance,
    ...(perkOff || perkDef ? { perks } : {}),
  });

  let pressure = 1;
  if (matchup.protection) {
    let ratio = pressureRatio;
    if (mods.pressed === 'offense') ratio /= T.pressureEdge;
    if (mods.pressed === 'defense') ratio *= T.pressureEdge;
    if (defPerk === 'INTIMIDATE_RUSH') ratio *= T.intimidatePressure;
    pressure = clamp(ratio, 0.5, 2);
    const blocked = offPerk === 'IMMOVABLE_WALL' && input.defCard.category === 'BLITZ';
    const sackRisk = blocked ? 0 : profile.risk.sack * riskMult * pressure;
    if (u[0] < sackRisk) {
      return { outcome: make('SACK', -(4 + Math.floor(u[4] * 5))), rng };
    }
  }

  const stuff = read === 'RIGHT' && offPerk !== 'OVERDRIVE_BREAKTHROUGH' ? STUFF_PENALTY : 0;
  let rawYards = Math.round(base * READ_YARDS[read] * edge * variance) - stuff;
  if (offPerk === 'OVERDRIVE_BREAKTHROUGH' && isRun) rawYards = Math.max(T.overdriveMinYards, rawYards);

  let turnoverRisk = ((isPass ? profile.risk.interception : profile.risk.fumble) * riskMult) / edge;
  if (defPerk === 'ISLAND_LOCKDOWN' && isPass) turnoverRisk *= T.islandRisk;
  if (defPerk === 'ENFORCER_STOMP' && !isPass) turnoverRisk *= T.enforcerFumble;
  if (u[1] < turnoverRisk) {
    return { outcome: isPass ? make('INTERCEPTION', base) : make('FUMBLE', Math.max(0, rawYards)), rng };
  }

  let incompletion = profile.risk.incompletion * READ_INCOMPLETION[read];
  if (offPerk === 'SLIPSTREAM_SEPARATION' && vsMan) incompletion *= T.slipstreamIncompletion;
  if (defPerk === 'ISLAND_LOCKDOWN') incompletion *= T.islandRisk;
  if (matchup.protection && mods.pressed === 'offense' && pressure > 1) incompletion *= T.pressureIncompletion;
  if (isPass && u[2] < clamp(incompletion / edge, 0, 0.9)) {
    return { outcome: make('INCOMPLETE', 0), rng };
  }
  if (u[3] < profile.risk.bigPlay * READ_BIG_PLAY[read] * edge) {
    return { outcome: make('GAIN', rawYards * 2 + 10, true), rng };
  }
  return { outcome: make('GAIN', rawYards), rng };
}
```

- [ ] **Step 4: Rodar tudo do engine que toca o resolve**

Run: `npx vitest run packages/engine/test/resolve-rhythm.test.ts packages/engine/test/resolve.test.ts packages/engine/test/outcome-factors.test.ts`
Expected: PASS. Se um caso de efeito falhar por a espécie do teste não ser ator, siga a nota do Step 1 do teste (troque a espécie). Se falhar por magnitude pequena (diferença dentro do ruído), aumente `N` no teste, não os valores de `RHYTHM_TUNING`.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/resolve.ts packages/engine/test/resolve-rhythm.test.ts
git commit -m "feat(engine/rhythm): resolvePlay aplica o pulse nível 2 e os perks dos capitães" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Integração no `match.ts` (estado, `USE_TIMEOUT`, `PlayerView.rhythm`, regressão)

**Files:**
- Modify: `packages/engine/src/match.ts`
- Modify: `packages/engine/test/full-match.test.ts`
- Test: `packages/engine/test/rhythm-match.test.ts`

**Interfaces:**
- Consumes: `initialRhythm`, `applyPlay`, `applyTimeout`, `modifiersFor`, `rhythmView`, `RhythmView` (Tasks 1 a 5); `PlayModifiers` no `resolvePlay` (Task 6).
- Produces:
  - `MatchConfig.rhythm?: boolean` (padrão ligado; `false` = comportamento anterior ao ritmo, sem timeout).
  - `MatchState.rhythm: RhythmState`.
  - `PlayerView.rhythm: RhythmView`.
  - `step` aceita `{ type: 'USE_TIMEOUT', team }` (lança `TIMEOUT_NOT_ALLOWED` / `NO_TIMEOUTS_LEFT` conforme a spec) e `{ type: 'TIMEOUT', team }` (em PLAYCALL só preenche o padrão desse time).

- [ ] **Step 1: Escrever os testes que falham**

Criar `packages/engine/test/rhythm-match.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createMatch, step, playableCards, playerView, DEFAULT_CONFIG, type MatchState } from '../src/match';
import { replay } from '../src/replay';
import { rngNext } from '../src/rng';
import { EngineError } from '../src/errors';
import type { Action, FormationId, GameEvent, PackageId, Team, TeamKey } from '../src/model';
import { electricTeam } from './fixtures';

const captained = (name: string): Team => ({
  ...electricTeam(name),
  captains: {
    offense: { species: 63, xFactor: 'TELEPATHIC_POCKET' },
    defense: { species: 95, xFactor: 'INTIMIDATE_RUSH' },
  },
});
const A = captained('A');
const B = captained('B');
const start = (config = DEFAULT_CONFIG): MatchState => createMatch(A, B, 1, config).state;
const other = (k: TeamKey): TeamKey => (k === 'A' ? 'B' : 'A');
const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return (e as EngineError).code;
  }
  return undefined;
};

describe('estado e visão', () => {
  it('a partida começa com ritmo neutro e a visão traz o ritmo', () => {
    const s = start();
    expect(s.rhythm.momentum).toBe(0);
    expect(s.rhythm.timeouts).toEqual({ A: 2, B: 2 });
    const v = playerView(s, 'A');
    expect(v.rhythm.momentum).toBe(0);
    expect(v.rhythm.captains.A.offense).toEqual({ species: 63, xFactor: 'TELEPATHIC_POCKET', progress: 0, inZone: false });
    expect(v.rhythm.captains.B.defense?.species).toBe(95);
    expect(playerView(s, 'B').rhythm).toEqual(v.rhythm);
  });

  it('time sem capitães: visão com capitães nulos', () => {
    const s = createMatch(electricTeam('A'), electricTeam('B'), 1).state;
    expect(playerView(s, 'A').rhythm.captains.A).toEqual({ offense: null, defense: null });
  });
});

describe('USE_TIMEOUT', () => {
  it('corta o momentum do rival, gasta o timeout e não avança a fase', () => {
    const s = start();
    s.rhythm.momentum = -80; // B domina
    const r = step(s, { type: 'USE_TIMEOUT', team: 'A' });
    expect(r.state.rhythm.momentum).toBe(-40);
    expect(r.state.rhythm.timeouts).toEqual({ A: 1, B: 2 });
    expect(r.state.phase).toBe('FORMATION');
    expect(r.state.turnId).toBe(s.turnId);
    expect(r.events.map((e) => e.t)).toEqual(['TIMEOUT_CALLED', 'MOMENTUM', 'PULSE_TIER']);
    expect(s.rhythm.momentum).toBe(-80); // o estado de entrada não muda
  });

  it('o time na defesa também pode chamar, na FORMATION ou na PACKAGE', () => {
    const s = start();
    const inPackage = step(s, { type: 'FORMATION', team: s.offense, formation: 'PISTOL' }).state;
    expect(step(inPackage, { type: 'USE_TIMEOUT', team: other(s.offense) }).state.rhythm.timeouts[other(s.offense)]).toBe(1);
    expect(step(s, { type: 'USE_TIMEOUT', team: other(s.offense) }).state.rhythm.timeouts[other(s.offense)]).toBe(1);
  });

  it('só uma vez por time por snap; no snap seguinte libera de novo', () => {
    const s = start();
    const once = step(s, { type: 'USE_TIMEOUT', team: 'A' }).state;
    expect(code(() => step(once, { type: 'USE_TIMEOUT', team: 'A' }))).toBe('TIMEOUT_NOT_ALLOWED');
    expect(step(once, { type: 'USE_TIMEOUT', team: 'B' }).state.rhythm.timeouts.B).toBe(1);
    expect(once.rhythm.calledThisSnap.A).toBe(true);
    // joga um snap e a marca volta a false
    const played = [
      { type: 'FORMATION', team: 'A', formation: 'PISTOL' },
      { type: 'PACKAGE', team: 'B', package: 'BASE' },
      { type: 'CARD', team: 'A', cardId: 'basic_run' },
      { type: 'CARD', team: 'B', cardId: 'basic_defense' },
    ] satisfies Action[];
    let next = once;
    for (const a of played) next = step(next, a).state;
    expect(next.rhythm.calledThisSnap).toEqual({ A: false, B: false });
  });

  it('recusa sem timeouts, em PLAYCALL, com ritmo desligado e para time inválido', () => {
    const none = start();
    none.rhythm.timeouts.A = 0;
    expect(code(() => step(none, { type: 'USE_TIMEOUT', team: 'A' }))).toBe('NO_TIMEOUTS_LEFT');

    const s = start();
    const call = [
      { type: 'FORMATION', team: 'A', formation: 'PISTOL' },
      { type: 'PACKAGE', team: 'B', package: 'BASE' },
    ] satisfies Action[];
    let inCall = s;
    for (const a of call) inCall = step(inCall, a).state;
    expect(inCall.phase).toBe('PLAYCALL');
    expect(code(() => step(inCall, { type: 'USE_TIMEOUT', team: 'A' }))).toBe('TIMEOUT_NOT_ALLOWED');

    const off = start({ ...DEFAULT_CONFIG, rhythm: false });
    expect(code(() => step(off, { type: 'USE_TIMEOUT', team: 'A' }))).toBe('TIMEOUT_NOT_ALLOWED');
    expect(code(() => step(s, { type: 'USE_TIMEOUT', team: 'C' as TeamKey }))).toBe('WRONG_TEAM');
  });
});

describe('TIMEOUT por time em PLAYCALL', () => {
  const toPlaycall = (): MatchState => {
    let s = start();
    s = step(s, { type: 'FORMATION', team: 'A', formation: 'PISTOL' }).state;
    return step(s, { type: 'PACKAGE', team: 'B', package: 'BASE' }).state;
  };

  it('com team, só preenche o padrão desse time', () => {
    const s = toPlaycall();
    const r = step(s, { type: 'TIMEOUT', team: 'B' });
    expect(r.state.phase).toBe('PLAYCALL');
    expect(r.state.cards).toEqual({ offense: null, defense: 'basic_defense' });
    expect(r.events).toEqual([]);
  });

  it('quando o outro já tinha escolhido, a jogada resolve', () => {
    let s = toPlaycall();
    s = step(s, { type: 'CARD', team: 'A', cardId: 'basic_run' }).state;
    const r = step(s, { type: 'TIMEOUT', team: 'B' });
    expect(r.events.some((e) => e.t === 'PLAY')).toBe(true);
  });

  it('sem team continua preenchendo os dois', () => {
    const r = step(toPlaycall(), { type: 'TIMEOUT' });
    expect(r.events.some((e) => e.t === 'PLAY')).toBe(true);
  });
});

describe('integração do ritmo nas jogadas', () => {
  function autoPlay(seed: number, config = DEFAULT_CONFIG, timeouts = true): { state: MatchState; actions: Action[]; events: GameEvent[] } {
    let { state, events: first } = createMatch(A, B, seed, config);
    const events: GameEvent[] = [...first];
    const actions: Action[] = [];
    let r = seed * 17 + 3;
    const pick = <T>(xs: readonly T[]): T => {
      const n = rngNext(r);
      r = n.state;
      return xs[Math.floor(n.value * xs.length)];
    };
    const formations: FormationId[] = ['PISTOL', 'HEAVY', 'SPREAD', 'DOUBLE'];
    const packages: PackageId[] = ['BASE', 'HEAVY_D', 'NICKEL', 'DIME'];
    for (let i = 0; i < 5000 && state.phase !== 'MATCH_END'; i++) {
      const defense = other(state.offense);
      let action: Action;
      const maybeTimeout = timeouts && config.rhythm !== false && (state.phase === 'FORMATION' || state.phase === 'PACKAGE') && pick([0, 0, 0, 1]) === 1;
      const caller = state.phase === 'FORMATION' ? state.offense : defense;
      if (maybeTimeout && state.rhythm.timeouts[caller] > 0 && !state.rhythm.calledThisSnap[caller]) {
        action = { type: 'USE_TIMEOUT', team: caller };
      } else if (state.phase === 'FORMATION') action = { type: 'FORMATION', team: state.offense, formation: pick(formations) };
      else if (state.phase === 'PACKAGE') action = { type: 'PACKAGE', team: defense, package: pick(packages) };
      else if (state.phase === 'PLAYCALL') {
        const team = state.cards.offense === null ? state.offense : defense;
        action = { type: 'CARD', team, cardId: pick(playableCards(state, team)) };
      } else action = { type: 'CONVERSION', team: state.offense, choice: pick(['PAT', 'TWO'] as const) };
      actions.push(action);
      const out = step(state, action);
      state = out.state;
      events.push(...out.events);
    }
    return { state, actions, events };
  }

  it('o último MOMENTUM mostra o momentum final e o momentum nunca sai de ±100', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { state, events } = autoPlay(seed);
      expect(state.phase).toBe('MATCH_END');
      const last = [...events].reverse().find((e) => e.t === 'MOMENTUM');
      expect(last && last.t === 'MOMENTUM' ? last.value : 0).toBe(state.rhythm.momentum);
      for (const e of events) if (e.t === 'MOMENTUM') expect(Math.abs(e.value)).toBeLessThanOrEqual(100);
      expect(events.some((e) => e.t === 'MOMENTUM')).toBe(true);
    }
  });

  it('o replay com timeouts e capitães reproduz estado e eventos', () => {
    const { state, actions, events } = autoPlay(2026);
    expect(actions.some((a) => a.type === 'USE_TIMEOUT')).toBe(true);
    const replayed = replay(A, B, 2026, actions);
    expect(replayed.state).toEqual(state);
    expect(replayed.events).toEqual(events);
  });

  it('zona e timeouts aparecem em partidas reais (nenhum capitão fica sempre fora)', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) for (const e of autoPlay(seed).events) kinds.add(e.t);
    for (const t of ['MOMENTUM', 'PULSE_TIER', 'ZONE_ENTER', 'ZONE_EXIT', 'TIMEOUT_CALLED']) expect(kinds.has(t)).toBe(true);
  });

  it('com rhythm: false não há nenhum evento de ritmo', () => {
    const { events } = autoPlay(7, { ...DEFAULT_CONFIG, rhythm: false }, false);
    const rhythmEvents = new Set(['MOMENTUM', 'PULSE_TIER', 'ZONE_ENTER', 'ZONE_EXIT', 'ZONE_CLASH', 'TIMEOUT_CALLED']);
    expect(events.filter((e) => rhythmEvents.has(e.t))).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/engine/test/rhythm-match.test.ts`
Expected: FAIL (`s.rhythm` indefinido, `USE_TIMEOUT` desconhecido).

- [ ] **Step 3: Implementar em `match.ts`**

1. Imports. Trocar o primeiro `import type {...} from './model'` acrescentando `Captains, RhythmState`:

```ts
import type {
  Action, Captains, DeckState, FatigueState, FieldState, FormationId, GameEvent, Lineup, PackageId, Phase, RhythmState, Team, TeamKey,
} from './model';
```

e, junto aos demais imports:

```ts
import { applyPlay, applyTimeout, initialRhythm, modifiersFor, rhythmView, type RhythmView } from './rhythm';
```

2. `MatchConfig`:

```ts
export interface MatchConfig {
  possessionsPerTeam: number;
  handSize: number;
  /** Ritmo (momentum, pulse, capitães e timeout). Ligado a menos que seja `false`. */
  rhythm?: boolean;
}
```

3. `MatchState`: acrescentar `rhythm: RhythmState;` depois de `overtime: ...;` e em `createMatch` acrescentar `rhythm: initialRhythm(),` depois de `overtime: null,`.

4. Helpers (antes de `function deepFreeze`):

```ts
const rhythmOn = (s: MatchState): boolean => s.config.rhythm !== false;
const captainsOf = (s: MatchState): Record<TeamKey, Captains | undefined> => ({
  A: s.teams.A.team.captains,
  B: s.teams.B.team.captains,
});
```

5. `step`: depois do bloco `if (action.type === 'SET_DEPTH') {...}` acrescentar:

```ts
  if (action.type === 'USE_TIMEOUT') {
    onUseTimeout(s, action, events);
    return { state: s, events };
  }
```

e criar, depois de `onSetDepth`:

```ts
/** Timeout do técnico: entre os snaps (FORMATION ou PACKAGE), uma vez por time por snap, 2 por partida. */
function onUseTimeout(s: MatchState, action: Extract<Action, { type: 'USE_TIMEOUT' }>, events: GameEvent[]): void {
  if (action.team !== 'A' && action.team !== 'B') throw new EngineError('WRONG_TEAM', String(action.team));
  if (!rhythmOn(s)) throw new EngineError('TIMEOUT_NOT_ALLOWED', 'ritmo desligado');
  if (s.phase !== 'FORMATION' && s.phase !== 'PACKAGE') throw new EngineError('TIMEOUT_NOT_ALLOWED', s.phase);
  if (s.rhythm.calledThisSnap[action.team]) throw new EngineError('TIMEOUT_NOT_ALLOWED', 'já usado neste snap');
  if (s.rhythm.timeouts[action.team] <= 0) throw new EngineError('NO_TIMEOUTS_LEFT');
  const r = applyTimeout(s.rhythm, action.team, captainsOf(s));
  s.rhythm = r.rhythm;
  events.push(...r.events);
}
```

6. `onPlaycall`, ramo do `TIMEOUT`: trocar

```ts
  if (action.type === 'TIMEOUT') {
    s.cards.offense ??= s.field.down === 4 && !s.conversionAttempt ? 'punt' : 'basic_run';
    s.cards.defense ??= 'basic_defense';
  } else {
```

por

```ts
  if (action.type === 'TIMEOUT') {
    // com `team`, só o padrão desse time (o servidor corta o PLAYCALL do jogador pressionado pelo pulse)
    if (action.team === undefined || action.team === s.offense) {
      s.cards.offense ??= s.field.down === 4 && !s.conversionAttempt ? 'punt' : 'basic_run';
    }
    if (action.team === undefined || action.team !== s.offense) s.cards.defense ??= 'basic_defense';
  } else {
```

(o `accept` das outras fases continua ignorando `team` do `TIMEOUT`.)

7. `resolveSnap`: antes de `const res = resolvePlay({`, e nele:

```ts
  const modifiers = rhythmOn(s) ? modifiersFor(s.rhythm, offKey, captainsOf(s)) : undefined;
  const res = resolvePlay({
    offCard,
    defCard,
    offLineup: s.lineups.offense,
    defLineup: s.lineups.defense,
    offFatigue: off.fatigue.levels,
    defFatigue: def.fatigue.levels,
    rng: s.rng,
    modifiers,
  });
```

Depois de `const adv = advanceField(s.field, outcome);` e **antes** de `if (s.conversionAttempt) {`, acrescentar:

```ts
  if (rhythmOn(s) && !s.conversionAttempt) {
    const r = applyPlay(s.rhythm, {
      offense: offKey,
      category: offCard.category as OffenseCategory,
      outcome,
      field: s.field,
      firstDown: adv.firstDown,
      end: adv.end?.kind ?? null,
      captains: captainsOf(s),
    });
    s.rhythm = r.rhythm;
    events.push(...r.events);
  }
```

e acrescentar `OffenseCategory` à lista do `import type ... from './model'`.

Fadiga dobrada do Enforcer Stomp: trocar as duas linhas

```ts
  off.fatigue = applyPlayFatigue(off.fatigue, off.team, s.lineups.offense, outcome.offActors);
```

por

```ts
  // Enforcer Stomp (perk): o portador da bola cansa em dobro (o ator repetido soma o ganho duas vezes)
  const carrier = outcome.perks?.defense === 'ENFORCER_STOMP' ? outcome.offActors.slice(0, 1) : [];
  off.fatigue = applyPlayFatigue(off.fatigue, off.team, s.lineups.offense, [...outcome.offActors, ...carrier]);
```

8. `beginSnap`: acrescentar a primeira linha do corpo:

```ts
  s.rhythm.calledThisSnap = { A: false, B: false };
```

9. `PlayerView` e `playerView`: acrescentar o campo

```ts
  /** momentum, pulse, timeouts e capitães dos dois times (público) */
  rhythm: RhythmView;
```

ao fim de `interface PlayerView`, e `rhythm: rhythmView(s.rhythm, captainsOf(s)),` ao fim do objeto devolvido por `playerView` (depois de `canEditDepth: canEditDepth(s),`).

- [ ] **Step 4: Regressão do golden e do replay existentes**

Em `packages/engine/test/full-match.test.ts`:

1. Trocar a assinatura de `autoPlay` e o `createMatch`:

```ts
import { createMatch, step, playableCards, DEFAULT_CONFIG, type MatchConfig, type MatchState } from '../src/match';
```

```ts
function autoPlay(seed: number, botSeed: number, maxSteps = 5000, config: MatchConfig = DEFAULT_CONFIG): { state: MatchState; actions: Action[] } {
  let state = createMatch(A, B, seed, config).state;
```

2. Trocar o teste `golden` por dois:

```ts
  it('golden sem ritmo: a seed 2026 continua dando o resultado de antes do ritmo', () => {
    const { state, actions } = autoPlay(2026, 7, 5000, { ...DEFAULT_CONFIG, rhythm: false });
    expect({ score: state.score, turnId: state.turnId, actions: actions.length }).toMatchSnapshot();
  });

  it('golden com ritmo: a seed 2026 produz sempre o mesmo resultado', () => {
    const { state, actions } = autoPlay(2026, 7);
    expect({ score: state.score, turnId: state.turnId, actions: actions.length }).toMatchSnapshot();
  });
```

3. Em `packages/engine/test/__snapshots__/full-match.test.ts.snap`, **renomear** a chave do snapshot existente de `partidas completas > golden: a seed 2026 produz sempre o mesmo resultado 1` para `partidas completas > golden sem ritmo: a seed 2026 continua dando o resultado de antes do ritmo 1` (conteúdo intacto: `actions: 357`, `A: 14`, `B: 22`, `turnId: 94`). **Não** use `-u` neste snapshot: ele é a prova de regressão.

- [ ] **Step 5: Rodar**

Run: `npx vitest run packages/engine`
Expected: PASS em tudo, e o snapshot "sem ritmo" sem alteração. O snapshot "com ritmo" é novo: o vitest o grava na primeira execução (confira que o arquivo `.snap` ganhou a entrada e que o placar é plausível).

Se algum teste antigo falhar porque uma `PlayerView`/estado ganhou `rhythm`, ajuste só o teste (por exemplo `toEqual` de objeto completo) e explique no commit.

- [ ] **Step 6: Commit**

```bash
git add packages/engine
git commit -m "feat(engine/rhythm): integra o ritmo ao motor (USE_TIMEOUT, PlayerView.rhythm, rhythm:false)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Protocolo e servidor (`play:timeout` e corte do `PLAYCALL` do pressionado)

**Files:**
- Modify: `packages/protocol/src/messages.ts`
- Modify: `apps/server/src/parse.ts`
- Modify: `apps/server/src/server.ts`
- Modify: `apps/server/src/match-session.ts`
- Test: `apps/server/test/parse.test.ts`, `apps/server/test/match-session-rhythm.test.ts`

**Interfaces:**
- Consumes: `pulseTier` e `Action` (engine).
- Produces:
  - `PULSE_PLAYCALL_CUT_SECONDS = 2` e o evento `'play:timeout': (p: { turnId: number }) => void` em `ClientToServerEvents`.
  - `PlayRequest` ganha `{ kind: 'timeout'; turnId: number }`; `PlayEvent` ganha `'play:timeout'`; `toAction` devolve `{ type: 'USE_TIMEOUT', team }`.
  - `MatchSession`: a `match:phase` do jogador pressionado traz `deadline` 2 s mais curto no `PLAYCALL`; um timer próprio aplica `{ type: 'TIMEOUT', team }` quando ele vence.

- [ ] **Step 1: Escrever os testes que falham**

Em `apps/server/test/parse.test.ts`, no teste `aceita payloads válidos`, acrescentar:

```ts
    expect(parsePlay('play:timeout', { turnId: 3 })).toEqual({ kind: 'timeout', turnId: 3 });
```

e na lista `cases` de `rejeita payloads malformados ou maliciosos`:

```ts
      ['play:timeout', null],
      ['play:timeout', {}],
      ['play:timeout', { turnId: '3' }],
```

No `describe('toAction'...)` (veja o fim do arquivo) acrescentar um caso:

```ts
  it('timeout do técnico vira USE_TIMEOUT do time do socket', () => {
    expect(toAction('B', { kind: 'timeout', turnId: 3 })).toEqual({ type: 'USE_TIMEOUT', team: 'B' });
  });
```

Criar `apps/server/test/match-session-rhythm.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Team, TeamKey } from '@pfl/engine';
import { PULSE_PLAYCALL_CUT_SECONDS } from '@pfl/protocol';
import { MatchSession } from '../src/match-session';
import { realScheduler, resolveTimings } from '../src/timings';
import { electricTeam } from './fixtures';
import { failOnConsoleError, recorder } from './helpers';

const T0 = 1_000_000;
const KEYS = ['A', 'B'] as const;
const teams = (): Record<TeamKey, Team> => ({ A: electricTeam('A'), B: electricTeam('B') });

function setup() {
  const rec = recorder();
  const session = new MatchSession(teams(), 42, {
    scheduler: realScheduler,
    timings: resolveTimings(),
    send: rec.send,
    isAbsent: () => false,
    onEnd: () => {},
  });
  session.start();
  return { session, rec };
}
const toPlaycall = (session: MatchSession): number => {
  const turnId = session.state.turnId;
  session.handle('A', { kind: 'formation', turnId, formation: 'PISTOL' });
  session.handle('B', { kind: 'package', turnId, package: 'BASE' });
  return turnId;
};

failOnConsoleError();
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('play:timeout', () => {
  it('corta o momentum, avisa os dois com match:reveal e mantém fase, turno e deadline', () => {
    const { session, rec } = setup();
    session.state.rhythm.momentum = 85; // A domina; o B chama
    const turnId = session.state.turnId;
    const deadline = session.deadline;
    rec.clear();
    session.handle('B', { kind: 'timeout', turnId });
    for (const k of KEYS) {
      const reveal = rec.last(k, 'match:reveal')!;
      expect(reveal.events.map((e) => e.t)).toContain('TIMEOUT_CALLED');
      const phase = rec.last(k, 'match:phase')!;
      expect(phase.phase).toBe('FORMATION');
      expect(phase.turnId).toBe(turnId);
      expect(phase.deadline).toBe(deadline);
      expect(phase.view.rhythm.momentum).toBe(42);
      expect(phase.view.rhythm.timeouts.B).toBe(1);
    }
  });

  it('timeout recusado pelo motor vira ENGINE_ERROR só para quem chamou; turno velho vira STALE_TURN', () => {
    const { session, rec } = setup();
    const turnId = session.state.turnId;
    session.handle('B', { kind: 'timeout', turnId });
    rec.clear();
    session.handle('B', { kind: 'timeout', turnId }); // já usou neste snap
    expect(rec.all('B', 'error').map((e) => e.code)).toEqual(['ENGINE_ERROR']);
    expect(rec.all('A', 'error')).toEqual([]);
    session.handle('A', { kind: 'timeout', turnId: turnId + 5 });
    expect(rec.all('A', 'error').map((e) => e.code)).toEqual(['STALE_TURN']);
  });
});

describe('corte do PLAYCALL pelo pulse', () => {
  const cut = PULSE_PLAYCALL_CUT_SECONDS * 1000;

  it('o jogador pressionado vê um deadline 2 s menor; o outro, o cheio', () => {
    const { session, rec } = setup();
    session.state.rhythm.momentum = -60; // B domina, A é pressionado
    toPlaycall(session);
    expect(rec.last('A', 'match:phase')!.phase).toBe('PLAYCALL');
    expect(rec.last('A', 'match:phase')!.deadline).toBe(T0 + 8000 - cut);
    expect(rec.last('B', 'match:phase')!.deadline).toBe(T0 + 8000);
  });

  it('sem pulse, os dois veem o deadline cheio', () => {
    const { session, rec } = setup();
    toPlaycall(session);
    expect(rec.last('A', 'match:phase')!.deadline).toBe(T0 + 8000);
    expect(rec.last('B', 'match:phase')!.deadline).toBe(T0 + 8000);
  });

  it('ao vencer o prazo curto, só o padrão do pressionado é jogado; a jogada espera o outro', () => {
    const { session, rec } = setup();
    session.state.rhythm.momentum = -60;
    const turnId = toPlaycall(session);
    vi.advanceTimersByTime(8000 - cut);
    expect(session.state.phase).toBe('PLAYCALL');
    expect(session.state.cards.offense).toBe('basic_run'); // A ataca e é o pressionado
    expect(session.state.cards.defense).toBeNull();
    expect(rec.last('B', 'match:phase')!.view.opponentHasChosen).toBe(true);
    expect(session.state.turnId).toBe(turnId);
    // o prazo cheio resolve a jogada com o padrão do B
    vi.advanceTimersByTime(cut);
    expect(rec.last('A', 'match:result')).toBeDefined();
  });

  it('se o outro já escolheu, o prazo curto do pressionado resolve a jogada', () => {
    const { session, rec } = setup();
    session.state.rhythm.momentum = -60;
    const turnId = toPlaycall(session);
    session.handle('B', { kind: 'card', turnId, cardId: 'basic_defense' });
    vi.advanceTimersByTime(8000 - cut);
    expect(rec.last('A', 'match:result')).toBeDefined();
  });

  it('o pressionado que escolhe a tempo não dispara o prazo curto', () => {
    const { session, rec } = setup();
    session.state.rhythm.momentum = -60;
    const turnId = toPlaycall(session);
    session.handle('A', { kind: 'card', turnId, cardId: 'basic_pass' });
    vi.advanceTimersByTime(8000 - cut + 100);
    expect(rec.last('A', 'match:result')).toBeUndefined();
    expect(session.state.cards.defense).toBeNull();
  });

  it('o resync no meio do PLAYCALL reenvia o deadline cortado', () => {
    const { session, rec } = setup();
    session.state.rhythm.momentum = -60;
    toPlaycall(session);
    vi.advanceTimersByTime(1000);
    rec.clear();
    session.sendCurrent('A');
    expect(rec.last('A', 'match:phase')!.deadline).toBe(T0 + 8000 - cut);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/server/test/parse.test.ts apps/server/test/match-session-rhythm.test.ts`
Expected: FAIL (`play:timeout` e `kind: 'timeout'` não existem).

- [ ] **Step 3: Protocolo**

Em `packages/protocol/src/messages.ts`, depois de `export const RESULT_ANIMATION_MS = 4500; ...` acrescentar:

```ts
/** Pulse (ritmo): quanto o PLAYCALL do jogador pressionado encurta, em segundos. */
export const PULSE_PLAYCALL_CUT_SECONDS = 2;
```

e em `ClientToServerEvents`, depois de `'play:conversion': ...`:

```ts
  'play:timeout': (p: { turnId: number }) => void;
```

- [ ] **Step 4: Parse e rota**

Em `apps/server/src/parse.ts`:

1. `PlayRequest`: acrescentar `| { kind: 'timeout'; turnId: number }` antes de `| { kind: 'depth'; ...}`.
2. `PlayEvent`: `'play:formation' | 'play:package' | 'play:card' | 'play:conversion' | 'play:timeout' | 'team:depth'`.
3. Em `parsePlay`, depois do `case 'play:conversion': {...}` acrescentar:

```ts
    case 'play:timeout':
      return { kind: 'timeout', turnId };
```

4. Em `toAction`, depois do `case 'conversion':` acrescentar:

```ts
    case 'timeout':
      return { type: 'USE_TIMEOUT', team };
```

Em `apps/server/src/server.ts`, depois da linha do `socket.on('play:conversion', ...)` (linha ~219) acrescentar:

```ts
    socket.on('play:timeout', guard((payload: unknown) => play('play:timeout', payload)));
```

- [ ] **Step 5: `MatchSession`**

Em `apps/server/src/match-session.ts`:

1. Imports:

```ts
import {
  EngineError, actingTeams, createMatch, playerView, pulseTier, step,
  type Action, type GameEvent, type MatchState, type StepResult, type Team, type TeamKey,
} from '@pfl/engine';
import { PULSE_PLAYCALL_CUT_SECONDS, computeStats, type EndMessage, type ErrorCode } from '@pfl/protocol';
```

2. Campos, depois de `private cancelTimer: (() => void) | null = null;`:

```ts
  /** timer do prazo curto do jogador pressionado pelo pulse (só no PLAYCALL) */
  private cancelPressed: (() => void) | null = null;
  private readonly pulseCutMs = PULSE_PLAYCALL_CUT_SECONDS * 1000;
```

3. Métodos novos (junto aos privados, antes de `armTimer`):

```ts
  /** Jogador sob pulse (nível ≥ 1) no PLAYCALL; null nas outras etapas ou com o ritmo desligado. */
  private pressedKey(): TeamKey | null {
    const s = this.current;
    if (s.phase !== 'PLAYCALL' || s.config.rhythm === false) return null;
    const { dominant, tier } = pulseTier(s.rhythm.momentum);
    return dominant && tier >= 1 ? (dominant === 'A' ? 'B' : 'A') : null;
  }

  /** Deadline que o jogador vê: o do pulse (2 s menor) se ele está pressionado. */
  private deadlineFor(key: TeamKey): number {
    return this.pressedKey() === key ? Math.max(this.phaseStartsAt, this.deadlineAt - this.pulseCutMs) : this.deadlineAt;
  }

  private onPressedDeadline(seq: number, key: TeamKey): void {
    if (this.disposed || seq !== this.phaseSeq || this.endMessage || this.pausedOffsets) return;
    this.apply({ type: 'TIMEOUT', team: key }, null);
  }
```

4. `sendCurrent`: trocar `deadline: this.deadlineAt,` por `deadline: this.deadlineFor(key),`.

5. `armTimer`: acrescentar ao fim do corpo (depois do `this.cancelTimer = ...;`):

```ts
    const pressed = this.pressedKey();
    if (pressed && pending.includes(pressed)) {
      const at = Math.max(this.phaseStartsAt, this.deadlineAt - this.pulseCutMs);
      if (at < this.deadlineAt) {
        this.cancelPressed = this.deps.scheduler.schedule(Math.max(0, at - now), () => this.onPressedDeadline(seq, pressed));
      }
    }
```

6. `clearTimer`: acrescentar `this.cancelPressed?.(); this.cancelPressed = null;` antes de `this.phaseSeq += 1;`.

7. `dispatch`: logo depois do bloco `if (action.type === 'SET_DEPTH') {...}` acrescentar:

```ts
    if (action.type === 'USE_TIMEOUT') {
      // o estado muda (momentum, timeouts, zona), mas a etapa, o turno e os timers não
      for (const k of KEYS) this.deps.send(k, { event: 'match:reveal', payload: { turnId: prev.turnId, events } });
      for (const k of KEYS) this.sendCurrent(k);
      return;
    }
```

8. `expireIfDue`: trocar o corpo por

```ts
  private expireIfDue(): void {
    if (this.endMessage || this.pausedOffsets) return;
    const now = this.deps.scheduler.now();
    if (now >= this.deadlineAt) {
      this.onDeadline(this.phaseSeq);
      return;
    }
    const pressed = this.pressedKey();
    if (pressed && actingTeams(this.current).includes(pressed) && now >= this.deadlineAt - this.pulseCutMs) {
      this.apply({ type: 'TIMEOUT', team: pressed }, null);
    }
  }
```

- [ ] **Step 6: Rodar o servidor**

Run: `npx vitest run apps/server && npm run typecheck`
Expected: testes do servidor PASS (os antigos e os novos). O typecheck deve acusar no máximo erros do cliente/sim (`PlayerView.rhythm` ausente em `makeView`, `Action` novo); esses ficam para as Tasks 9 e 11. Nada de `apps/server` ou `packages/protocol`.

- [ ] **Step 7: Commit**

```bash
git add packages/protocol apps/server
git commit -m "feat(server/rhythm): play:timeout e corte do PLAYCALL do jogador pressionado pelo pulse" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Simulador: capitães determinísticos e uso de timeout pelo bot

**Files:**
- Create: `packages/sim/src/captains.ts`
- Modify: `packages/sim/src/index.ts`, `packages/sim/src/bot.ts`, `packages/sim/src/runner.ts`
- Test: `packages/sim/test/captains.test.ts`, `packages/sim/test/bot-rhythm.test.ts`

**Interfaces:**
- Consumes: `PERKS`, `XFACTOR_IDS`, `Captains`, `slotPosition`, `validateTeam` (engine); `PlayerView.rhythm`.
- Produces:
  - `starterAt(team: Team, xFactor: XFactorId): number | null`
  - `withPerk(team: Team, xFactor: XFactorId): Team` (só o capitão desse perk, o outro lado vazio)
  - `assignCaptains(team: Team): Team` (um perk ofensivo e um defensivo, escolhidos pelo hash do elenco)
  - `SimOptions.captains?: boolean`
  - O bot chama `USE_TIMEOUT` quando o rival domina (nível ≥ 1), em `FORMATION`/`PACKAGE`, com 50% de chance, se tem timeouts e ainda não chamou neste snap.

- [ ] **Step 1: Escrever os testes que falham**

Criar `packages/sim/test/captains.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PERKS, SUGGESTED_TEAMS, XFACTOR_IDS, validateTeam } from '@pfl/engine';
import { assignCaptains, starterAt, withPerk } from '../src/captains';
import { randomTeam } from '../src/random-team';
import { runSim } from '../src/runner';

describe('captains', () => {
  it('withPerk escolhe o titular da posição do perk e deixa o outro lado vazio', () => {
    for (const team of SUGGESTED_TEAMS) {
      for (const id of XFACTOR_IDS) {
        const boosted = withPerk(team, id);
        const side = PERKS[id].side;
        const other = side === 'offense' ? 'defense' : 'offense';
        expect(boosted.captains?.[side]).toEqual({ species: starterAt(team, id), xFactor: id });
        expect(boosted.captains?.[other]).toBeUndefined();
        expect(validateTeam(boosted)).toEqual([]);
      }
    }
  });

  it('assignCaptains é determinístico, válido e traz os dois lados', () => {
    for (const team of SUGGESTED_TEAMS) {
      const a = assignCaptains(team);
      expect(assignCaptains(team)).toEqual(a);
      expect(a.captains?.offense && a.captains?.defense).toBeTruthy();
      expect(validateTeam(a)).toEqual([]);
      expect(team.captains).toBeUndefined(); // não altera o original
    }
  });

  it('assignCaptains varia os perks entre elencos diferentes e vale para times aleatórios', () => {
    const perks = new Set<string>();
    let rng = 5;
    for (let i = 0; i < 24; i++) {
      const r = randomTeam(rng, `T${i}`);
      rng = r.rng;
      const t = assignCaptains(r.team);
      expect(validateTeam(t)).toEqual([]);
      perks.add(`${t.captains?.offense?.xFactor}/${t.captains?.defense?.xFactor}`);
    }
    expect(perks.size).toBeGreaterThan(3);
  });

  it('runSim com captains: true joga partidas completas com capitães', () => {
    const recs = runSim({ games: 10, seed: 9, captains: true });
    expect(recs).toHaveLength(10);
    expect(recs.every((r) => r.events.at(-1)?.t === 'MATCH_END')).toBe(true);
    expect(recs.some((r) => r.events.some((e) => e.t === 'ZONE_ENTER'))).toBe(true);
  });
});
```

Criar `packages/sim/test/bot-rhythm.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SUGGESTED_TEAMS, createMatch, step, type MatchState } from '@pfl/engine';
import { botAction } from '../src/bot';
import { playMatch } from '../src/runner';

const [T1, T2] = SUGGESTED_TEAMS;
const start = (): MatchState => createMatch(T1, T2, 1).state;

describe('bot: timeout do técnico', () => {
  it('nunca chama timeout com o ritmo neutro', () => {
    const s = start();
    for (let rng = 1; rng < 200; rng++) expect(botAction(s, 'A', rng).action.type).not.toBe('USE_TIMEOUT');
  });

  it('chama timeout, em parte das vezes, quando o rival domina (nível ≥ 1)', () => {
    const s = start();
    s.rhythm.momentum = -70; // B domina; A é o atacante da FORMATION
    const types = new Set<string>();
    for (let rng = 1; rng < 200; rng++) types.add(botAction(s, 'A', rng).action.type);
    expect(types.has('USE_TIMEOUT')).toBe(true);
    expect(types.has('FORMATION')).toBe(true);
  });

  it('não chama sem timeouts, nem duas vezes no snap, nem quando o próprio time domina', () => {
    const none = start();
    none.rhythm.momentum = -70;
    none.rhythm.timeouts.A = 0;
    const used = start();
    used.rhythm.momentum = -70;
    used.rhythm.calledThisSnap.A = true;
    const own = start();
    own.rhythm.momentum = 70;
    for (const s of [none, used, own]) {
      for (let rng = 1; rng < 200; rng++) expect(botAction(s, 'A', rng).action.type).not.toBe('USE_TIMEOUT');
    }
  });

  it('a ação do bot é sempre aceita pelo motor', () => {
    const s = start();
    s.rhythm.momentum = -85;
    for (let rng = 1; rng < 50; rng++) {
      const { action } = botAction(s, 'A', rng);
      expect(() => step(s, action)).not.toThrow();
    }
  });

  it('partidas bot × bot com timeouts terminam e são determinísticas', () => {
    const a = playMatch(T1, T2, 21, 22);
    expect(a.events.at(-1)?.t).toBe('MATCH_END');
    expect(playMatch(T1, T2, 21, 22)).toEqual(a);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/sim/test/captains.test.ts packages/sim/test/bot-rhythm.test.ts`
Expected: FAIL (`../src/captains` não existe, `captains` não é opção).

- [ ] **Step 3: `captains.ts`**

```ts
import { PERKS, XFACTOR_IDS, slotPosition, type Captains, type SlotId, type Team, type XFactorId } from '@pfl/engine';

const OFFENSE_PERKS = XFACTOR_IDS.filter((id) => PERKS[id].side === 'offense');
const DEFENSE_PERKS = XFACTOR_IDS.filter((id) => PERKS[id].side === 'defense');

/** Titular (primeiro do depth chart) da primeira vaga da posição do perk; null se o time não tem a vaga. */
export function starterAt(team: Team, xFactor: XFactorId): number | null {
  const position = PERKS[xFactor].position;
  for (const [slot, ids] of Object.entries(team.depth) as [SlotId, number[] | undefined][]) {
    if (slotPosition(slot) === position && ids && ids.length > 0) return ids[0];
  }
  return null;
}

/** Cópia do time com só o capitão desse perk (o outro lado vazio): isola o efeito de um X-Factor. */
export function withPerk(team: Team, xFactor: XFactorId): Team {
  const species = starterAt(team, xFactor);
  if (species === null) return { ...team, captains: undefined };
  return { ...team, captains: { [PERKS[xFactor].side]: { species, xFactor } } as Captains };
}

/**
 * Capitães escolhidos só pelo elenco (hash determinístico), sem consumir RNG: assim a geração de times
 * do simulador não muda quando os capitães são ligados.
 */
export function assignCaptains(team: Team): Team {
  const hash = team.roster.reduce((acc, id) => (Math.imul(acc, 31) + id) | 0, 7) >>> 0;
  const offensePerk = OFFENSE_PERKS[hash % OFFENSE_PERKS.length];
  const defensePerk = DEFENSE_PERKS[(hash >>> 8) % DEFENSE_PERKS.length];
  const captains: Captains = {};
  const offense = starterAt(team, offensePerk);
  const defense = starterAt(team, defensePerk);
  if (offense !== null) captains.offense = { species: offense, xFactor: offensePerk };
  if (defense !== null) captains.defense = { species: defense, xFactor: defensePerk };
  return { ...team, captains };
}
```

Em `packages/sim/src/index.ts` acrescentar `export * from './captains';`.

- [ ] **Step 4: Bot**

Em `packages/sim/src/bot.ts`, acrescentar antes de `/** Decide a partir apenas do que o jogador sabe. */`:

```ts
/** Chance de o bot chamar timeout quando o rival domina e ele ainda pode. */
const TIMEOUT_CHANCE = 0.5;

/** Timeout do técnico: só entre os snaps, se o rival domina (pulse ≥ 1), há timeout e ainda não chamou no snap. */
function chooseTimeout(k: BotKnowledge, rng: number): { action: Action; rng: number } | null {
  const { view } = k;
  const r = view.rhythm;
  const opponent: TeamKey = view.you === 'A' ? 'B' : 'A';
  const canCall = (view.phase === 'FORMATION' || view.phase === 'PACKAGE') && r.dominant === opponent && r.tier >= 1;
  if (!canCall || r.timeouts[view.you] <= 0 || r.calledThisSnap[view.you]) return null;
  const pick = weightedPick(['CALL', 'SKIP'] as const, [TIMEOUT_CHANCE, 1 - TIMEOUT_CHANCE], rng);
  return pick.item === 'CALL' ? { action: { type: 'USE_TIMEOUT', team: view.you }, rng: pick.rng } : null;
}
```

e, em `botDecide`, no início do corpo, antes do `switch`:

```ts
  const timeout = chooseTimeout(k, rng);
  if (timeout) return timeout;
```

**Cuidado com o RNG:** quando `chooseTimeout` consome um sorteio e decide `SKIP`, o `rng` avançado é descartado e a decisão seguinte usa o `rng` original; isso é determinístico e aceitável. Não propague o `rng` do `SKIP`.

- [ ] **Step 5: Runner**

Em `packages/sim/src/runner.ts`: acrescentar `import { assignCaptains } from './captains';`, o campo na interface:

```ts
  /** dá a todos os times um capitão ofensivo e um defensivo (hash do elenco). Padrão: sem capitães. */
  captains?: boolean;
```

e, em `runSim`, logo depois do bloco que define `x` e `y` (antes de `const seed = next();`):

```ts
      if (options.captains) {
        x = assignCaptains(x);
        y = assignCaptains(y);
      }
```

- [ ] **Step 6: Rodar**

Run: `npx vitest run packages/sim --exclude '**/*.gate.test.ts'`
Expected: PASS nos testes novos e nos antigos. Se algum teste antigo do sim comparar valores numéricos que dependiam de partidas sem ritmo (por exemplo contagens exatas em `report.test.ts`/`runner-context.test.ts`), atualize o valor esperado e registre no commit que a mudança vem do ritmo ligado por padrão.

- [ ] **Step 7: Commit**

```bash
git add packages/sim
git commit -m "feat(sim/rhythm): capitães determinísticos e timeout do técnico no bot" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Portão de balanceamento do ritmo e calibração

**Files:**
- Create: `packages/sim/src/perks.ts`
- Modify: `packages/sim/src/index.ts`
- Create: `packages/sim/test/rhythm-gate.gate.test.ts`
- Test: `packages/sim/test/perks.test.ts`
- Modify (calibração): `packages/engine/src/xfactors.ts` (`RHYTHM_TUNING`), `packages/engine/src/rhythm.ts` (`MOMENTUM_POINTS`)

**Interfaces:**
- Consumes: `withPerk`, `assignCaptains` (Task 9), `playMatch`, `randomTeam`, `wilsonInterval` (`report.ts`).
- Produces:
  - `perkMatchup(xFactor, games, seed): { wins: number; games: number }`: o time com o capitão desse perk contra o mesmo time sem capitães (vitórias do time com perk).
  - `mirrorMatchup(games, seed): { wins: number; games: number }`: o mesmo time com os dois capitães contra ele mesmo (vitórias do lado A, com lados trocados em pares).
  - `tier2Share(records): number`: fração das jogadas feitas com `|momentum| >= 80`.

- [ ] **Step 1: Teste de unidade das medições (rápido)**

Criar `packages/sim/test/perks.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { GameEvent } from '@pfl/engine';
import { mirrorMatchup, perkMatchup, tier2Share } from '../src/perks';
import type { MatchRecord } from '../src/runner';

const record = (events: GameEvent[]): MatchRecord => ({ teams: { A: 'a', B: 'b' }, score: { A: 1, B: 0 }, winner: 'A', events });
const play = { t: 'PLAY' } as unknown as GameEvent;

describe('tier2Share', () => {
  it('conta as jogadas feitas com |momentum| ≥ 80 (o MOMENTUM vem depois do PLAY)', () => {
    const events: GameEvent[] = [
      play, { t: 'MOMENTUM', delta: 85, value: 85, reason: 'TOUCHDOWN' }, // 1ª jogada com 0
      play, { t: 'MOMENTUM', delta: -10, value: 75, reason: 'STREAK' }, //   2ª jogada com 85
      play, //                                                              3ª jogada com 75
    ];
    expect(tier2Share([record(events)])).toBeCloseTo(1 / 3);
  });

  it('sem jogadas devolve 0', () => {
    expect(tier2Share([record([])])).toBe(0);
  });
});

describe('perkMatchup e mirrorMatchup', () => {
  it('jogam o número pedido de partidas, de forma determinística', () => {
    const a = perkMatchup('TELEPATHIC_POCKET', 6, 3);
    expect(a.games).toBe(6);
    expect(a.wins).toBeGreaterThanOrEqual(0);
    expect(a.wins).toBeLessThanOrEqual(6);
    expect(perkMatchup('TELEPATHIC_POCKET', 6, 3)).toEqual(a);
    expect(mirrorMatchup(6, 3).games).toBe(6);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/sim/test/perks.test.ts`
Expected: FAIL (`../src/perks` não existe).

- [ ] **Step 3: `perks.ts`**

```ts
import { rngNext, pulseTier, type GameEvent, type XFactorId } from '@pfl/engine';
import { assignCaptains, withPerk } from './captains';
import { randomTeam } from './random-team';
import { playMatch, type MatchRecord } from './runner';

export interface MatchupResult {
  wins: number;
  games: number;
}

function sequence(seed: number): () => number {
  let rng = seed | 0;
  return () => {
    const r = rngNext(rng);
    rng = r.state;
    return Math.floor(r.value * 2 ** 31);
  };
}

/**
 * Isola um perk: o time com o capitão desse X-Factor contra o mesmo time sem capitães. As partidas vêm em
 * pares com os lados trocados e as mesmas seeds. `wins` = vitórias do time com o perk.
 */
export function perkMatchup(xFactor: XFactorId, games: number, seed: number): MatchupResult {
  const next = sequence(seed);
  let wins = 0;
  let played = 0;
  for (let pair = 0; played < games; pair++) {
    const base = randomTeam(next(), `Base ${pair}`).team;
    const boosted = withPerk(base, xFactor);
    const matchSeed = next();
    const botSeed = next();
    if (playMatch(boosted, base, matchSeed, botSeed).winner === 'A') wins += 1;
    played += 1;
    if (played < games) {
      if (playMatch(base, boosted, matchSeed, botSeed).winner === 'B') wins += 1;
      played += 1;
    }
  }
  return { wins, games: played };
}

/** Espelho: o mesmo time, com os dois capitães, contra ele mesmo. `wins` = vitórias do lado A. */
export function mirrorMatchup(games: number, seed: number): MatchupResult {
  const next = sequence(seed);
  let wins = 0;
  let played = 0;
  for (let pair = 0; played < games; pair++) {
    const team = assignCaptains(randomTeam(next(), `Espelho ${pair}`).team);
    const matchSeed = next();
    const botSeed = next();
    if (playMatch(team, team, matchSeed, botSeed).winner === 'A') wins += 1;
    played += 1;
    if (played < games) {
      if (playMatch(team, team, matchSeed + 1, botSeed + 1).winner === 'A') wins += 1;
      played += 1;
    }
  }
  return { wins, games: played };
}

/** Fração das jogadas feitas sob pulse nível 2. O MOMENTUM vem depois do PLAY, então o valor é o anterior à jogada. */
export function tier2Share(records: readonly MatchRecord[]): number {
  let plays = 0;
  let tier2 = 0;
  for (const rec of records) {
    let momentum = 0;
    for (const e of rec.events as readonly GameEvent[]) {
      if (e.t === 'PLAY') {
        plays += 1;
        if (pulseTier(momentum).tier === 2) tier2 += 1;
      } else if (e.t === 'MOMENTUM') {
        momentum = e.value;
      }
    }
  }
  return plays === 0 ? 0 : tier2 / plays;
}
```

Em `packages/sim/src/index.ts` acrescentar `export * from './perks';`.

- [ ] **Step 4: Rodar o teste de unidade**

Run: `npx vitest run packages/sim/test/perks.test.ts`
Expected: PASS.

- [ ] **Step 5: O portão (lento, fora da suíte normal)**

Criar `packages/sim/test/rhythm-gate.gate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { XFACTOR_IDS } from '@pfl/engine';
import { mirrorMatchup, perkMatchup, tier2Share } from '../src/perks';
import { runSim } from '../src/runner';
import { wilsonInterval } from '../src/report';

// Portão do ritmo (spec do ritmo, seção 8). N e seed fixos → resultado determinístico.
const GAMES_PER_PERK = 1200;
const MIRROR_GAMES = 1200;
const SHARE_GAMES = 400;
const SEED = 2026;
/** um perk isolado não pode prejudicar nem decidir a partida: o IC 95% (Wilson) fica dentro desta faixa */
const PERK_LOW = 0.45;
const PERK_HIGH = 0.65;
/** teto da fração de jogadas sob pulse nível 2 (calibrado na Task 10, Step 6) */
const TIER_2_SHARE_MAX = 0.25;

describe('portão do ritmo', () => {
  it.each([...XFACTOR_IDS])(
    '%s isolado: IC 95% da taxa de vitória dentro de 45–65%%',
    (xFactor) => {
      const { wins, games } = perkMatchup(xFactor, GAMES_PER_PERK, SEED);
      const [lo, hi] = wilsonInterval(wins, games);
      expect({ xFactor, lo, hi, ok: lo > PERK_LOW && hi < PERK_HIGH }).toMatchObject({ ok: true });
    },
    300_000,
  );

  it('espelho com capitães: o IC 95% do lado A contém 50%', () => {
    const { wins, games } = mirrorMatchup(MIRROR_GAMES, SEED);
    const [lo, hi] = wilsonInterval(wins, games);
    expect(lo).toBeLessThanOrEqual(0.5);
    expect(hi).toBeGreaterThanOrEqual(0.5);
  }, 300_000);

  it(`no máximo ${TIER_2_SHARE_MAX * 100}% das jogadas acontecem sob pulse nível 2`, () => {
    const share = tier2Share(runSim({ games: SHARE_GAMES, seed: SEED, captains: true }));
    expect(share).toBeLessThanOrEqual(TIER_2_SHARE_MAX);
  }, 300_000);
});
```

- [ ] **Step 6: Medir, calibrar e fixar os limites**

1. Rodar: `npx vitest run --config vitest.gate.config.ts packages/sim/test/rhythm-gate.gate.test.ts`. Para ver os números, acrescente temporariamente `console.log` do `{ xFactor, lo, hi }` e de `share`.
2. **Se algum perk ou o espelho reprovar:** calibre somente as constantes, nesta ordem, uma de cada vez, e rode de novo:
   - perk forte demais (IC acima de 65%): reduzir o efeito em `RHYTHM_TUNING` (`xfactors.ts`) em ~1/3 do desvio do valor neutro (por exemplo `slipstreamEdge 1.15 → 1.10`, `intimidatePressure 1.3 → 1.2`, `islandRisk 1.5 → 1.3`);
   - perk fraco demais (IC abaixo de 45%): o perk não está sendo atingido; confira se o gatilho acontece (veja `ZONE_ENTER` por perk em `runSim({ captains: true })`) antes de mexer no efeito;
   - espelho reprovado: investigar assimetria de lados antes de mexer em números (um erro de sinal em `toward` ou `pressed` aparece aqui);
   - fração de nível 2 alta: reduzir `MOMENTUM_POINTS` em `rhythm.ts` (por exemplo `streak [10, 20, 35] → [8, 16, 28]`) ou aumentar o corte do timeout.
3. **Não** mexa nos limites `PERK_LOW`, `PERK_HIGH` nem `MIRROR`; eles são critério de aceite do spec. O único número que se fixa aqui é `TIER_2_SHARE_MAX`: se a fração medida com os valores iniciais for ≤ 0,25, mantenha 0,25. Se for maior, calibre `MOMENTUM_POINTS` até caber; se não couber sem perder o sentido da feature, pare e peça decisão ao usuário.
4. Registrar no commit os valores finais de `RHYTHM_TUNING`/`MOMENTUM_POINTS` e os números medidos (perk: IC; espelho: IC; fração do nível 2).
5. Remover os `console.log` temporários.

- [ ] **Step 7: Revalidar o portão de cartas existente**

Run: `npm run test:gate`
Expected: PASS nos dois portões. O de cartas agora roda com ritmo ligado (sem capitães, só momentum e pulse). Se alguma carta sair da faixa 45–55%, corrija com o mesmo procedimento do Step 6 (constantes do ritmo primeiro); só use `GATE_EXCEPTIONS` com a aprovação do usuário.

- [ ] **Step 8: Commit**

```bash
git add packages/sim packages/engine/src
git commit -m "feat(sim/rhythm): portão de balanceamento do ritmo e calibração dos perks" -m "<valores finais e números medidos>" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Compatibilidade do cliente e verificação final

**Files:**
- Modify: `apps/client/test/fixtures.ts`
- Modify (se o typecheck acusar): arquivos do cliente que fazem `switch` exaustivo sobre `Action` ou `GameEvent`

**Interfaces:**
- Consumes: `PlayerView.rhythm: RhythmView` (Task 7).
- Produces: cliente que compila e passa os testes sem usar o ritmo (a apresentação é a Parte 2).

- [ ] **Step 1: Rodar o typecheck e ver o que quebra**

Run: `npm run typecheck`
Expected: erro em `apps/client/test/fixtures.ts` (`rhythm` ausente em `PlayerView`), e talvez outros pontos do cliente.

- [ ] **Step 2: Corrigir `makeView`**

Em `apps/client/test/fixtures.ts`, dentro do objeto devolvido por `makeView`, depois de `canEditDepth: false,` acrescentar:

```ts
    rhythm: {
      momentum: 0,
      dominant: null,
      tier: 0,
      timeouts: { A: 2, B: 2 },
      calledThisSnap: { A: false, B: false },
      captains: { A: { offense: null, defense: null }, B: { offense: null, defense: null } },
    },
```

Se o typecheck acusar outro ponto (um `switch` sobre `Action` ou `GameEvent` sem `default`), acrescente o caso mínimo sem comportamento novo (`break`/retorno neutro) e um comentário `// ritmo: apresentação na Parte 2`.

- [ ] **Step 3: Verificação completa**

Run: `npm run typecheck && npm test`
Expected: typecheck limpo e a suíte inteira PASS (o portão não entra aqui).

- [ ] **Step 4: Rodar o portão uma última vez**

Run: `npm run test:gate`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client
git commit -m "test(client): makeView com o ritmo da PlayerView (apresentação fica para a Parte 2)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Abrir o PR**

Seguir `superpowers:finishing-a-development-branch`. A descrição do PR resume: regras do ritmo, o corte do `PLAYCALL`, a flag `MatchConfig.rhythm`, os valores calibrados e os números do portão. Termina com:

`🤖 Generated with [Claude Code](https://claude.com/claude-code)`

---

## Auto-revisão

**Cobertura do spec:**

| Seção do spec | Task |
| --- | --- |
| 4.1 `Team.captains` + validação | 1, 2 |
| 4.2 `RhythmState`, `pulseTier` | 1 |
| 4.3 Eventos novos | 1, 3, 4, 5 |
| 5.1 Momentum (tabela, ordem, limite único) | 3 |
| 5.2 Pulse nível 1 (timer) / nível 2 (edge, pressão, incompletude) | 6, 8 |
| 5.3 Zona (gatilhos, ator, saídas) | 4 |
| 5.4 Perks e clash | 6, 4 |
| 5.5 Timeout do técnico | 5, 7 |
| 6 Protocolo (`play:timeout`, `PlayerView.rhythm`) | 7, 8 |
| 7 Servidor (deadline por jogador, timer próprio, reveal) | 8 |
| 8 Simulador, bot, portão | 9, 10 |
| 9 Testes (itens 1 a 9) | 3 a 10 (item 7 = golden "sem ritmo", Task 7) |

**Diferenças deliberadas do spec original** (o spec foi atualizado junto com este plano): cada lado de `captains` é opcional; `RhythmState.calledThisSnap`; `MatchConfig.rhythm`; `TIMEOUT` com `team`; `PlayOutcome.perks`; `PlayOutcome.read` é a leitura efetiva; o OL qualifica com `GAIN`/`INCOMPLETE` de ganho ≥ 0; `MOMENTUM` e os demais eventos do ritmo saem logo depois do `PLAY` e antes de `FIRST_DOWN`/`TOUCHDOWN`/`TURNOVER`; o servidor manda `match:reveal` com os eventos do `USE_TIMEOUT`.

**Tipos consistentes:** `PlayModifiers` (`pressed`, `perks`) é produzido por `modifiersFor` (Task 5) e consumido por `resolvePlay` (Task 6) e `match.ts` (Task 7); `RhythmView` (Task 5) é o tipo de `PlayerView.rhythm` (Task 7) e o que o bot lê (Task 9) e `makeView` replica (Task 11); `PULSE_PLAYCALL_CUT_SECONDS` (Task 8) é o único lugar do corte de 2 s.
