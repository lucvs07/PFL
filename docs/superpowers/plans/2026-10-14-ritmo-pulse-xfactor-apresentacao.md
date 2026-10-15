# Battle Rhythm, Stadium Pulse e Ace X-Factors (apresentação) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar no cliente o ritmo da Parte 1: medidor de momentum, fichas dos capitães, aura e faixas na zona, efeitos para quem é pressionado, botão de timeout, narração, áudio e a aba "Capitães" do builder.

**Architecture:** Funções puras em `rhythm/viewModel.ts` decidem o que mostrar a partir de `view.rhythm`; componentes React finos (`PulseGauge`, `ZoneStrip`, `TimeoutButton`, `CaptainsEditor`) só as exibem. O campo Phaser ganha passos aditivos na timeline (`ZONE`, `ZONE_CLASH`, `PULSE`) e uma aura de 2 quadros. O áudio ganha 7 cues e `setDuck`. Nada muda em engine, protocolo ou servidor.

**Tech Stack:** React 19, Phaser 3.90, Vitest 5 + Testing Library (jsdom), CSS puro com tokens `--gbc-*`.

**Spec:** `docs/superpowers/specs/2026-10-14-ritmo-pulse-xfactor-apresentacao-design.md` (depende de `...-regras-design.md` e do PR da Parte 1 já na base da branch)

**Branch de trabalho:** `feat/ritmo-pulse-xfactor-apresentacao`, criada a partir da branch da Parte 1 (ou da `main` depois que a Parte 1 entrar).

## Global Constraints

- Identidade GBC: Press Start 2P (números e rótulos), Pixelify Sans (corpo), `steps()` em toda animação, sem blur, sem gradiente decorativo, borda de 4 px, sombra dura. Saturação só para tipo, lado e leitura; o amarelo `--pulse` (= `--gbc-yellow`) passa a significar também "ritmo e zona".
- Toda animação CSS nova só existe dentro de `@media (prefers-reduced-motion: no-preference)`; só `transform` e `opacity`. Com `reduced`, a informação (texto, símbolo, padrão) permanece.
- Alvo de toque mínimo `var(--hit-min)` (44 px no celular). Sem rolagem horizontal. Contraste AA nos tokens novos (`contrast.test.ts`).
- Nenhum travessão (`—` ou `–`) nem emoji nos textos da interface. Frases curtas em português; nomes de X-Factor em inglês.
- O medidor, as fichas e a aura mostram o ritmo **anterior à jogada** enquanto a animação roda (`animation.rhythmBefore`), para não adiantar o resultado.
- Os passos novos da timeline cabem em `TIMELINE_BUDGET_MS` (4000 ms); `fitToBudget` é a garantia. O pior caso novo soma 1700 ms.
- `Stage.auras` é opcional (os literais de `Stage` existentes continuam válidos).
- Comandos: `npx vitest run <arquivo>`; `npm test`; `npm run typecheck`. Commits: `tipo(escopo): resumo` + trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Gauge adiantando o resultado** durante a animação e depois de reconexão (`resync` sem animação) (Tasks 3 e 6).
2. **Mesma espécie nos dois times**: a aura só vale no time certo; sem capitão a linha de fichas some (Tasks 3, 6 e 8).
3. **Timeout acidental**: dois passos, desarma sozinho, nunca habilitado em `PLAYCALL`, durante a animação ou depois de usado (Tasks 2 e 7).
4. **`reduced-motion`**: aura parada, tremor e faixa sem movimento, medidor sem transição (Tasks 6, 7 e 8).
5. **Capitão que sai do depth chart**: some do rascunho sem deixar o time inválido (Task 9).

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `lib/perks.ts` (criar) | Textos dos 8 perks (nome, gatilho, efeito) |
| `rhythm/viewModel.ts` (criar) | Funções puras: `gaugeModel`, `pressureFor`, `shakeActive`, `foggedCardKey`, `timeoutState`, `zoneChips` |
| `app/useBurst.ts` (criar) | Hook de rajada curta (classe ligada por N ms) |
| `match/matchState.ts` (modificar) | `Stage.auras`, `Animation.rhythmBefore` |
| `match/timeline.ts`, `match/narration.ts`, `match/replayFrames.ts` (modificar) | Passos e linhas novos |
| `audio/cues.ts`, `recipes.ts`, `engine.ts`, `gameAudio.ts`, `useGameAudio.ts` (modificar) | Cues, `setDuck`, batimento, timeout |
| `screens/match/PulseGauge.tsx`, `ZoneStrip.tsx`, `TimeoutButton.tsx` (criar) | Componentes da partida |
| `screens/match/Hud.tsx`, `MatchScreen.tsx`, `CardHand.tsx`, `components/CardTile.tsx`, `App.tsx` (modificar) | Integração |
| `phaser/zoneFx.ts` (criar), `phaser/FieldScene.ts` (modificar) | Aura e faixas |
| `builder/captains.ts` (criar), `builder/draft.ts`, `builderState.ts`, `derived.ts` (modificar) | Modelo dos capitães |
| `screens/builder/CaptainsEditor.tsx` (criar), `BuilderScreen.tsx` (modificar) | Aba "Capitães" |
| `styles/tokens.css`, `screens/match/match.css`, `components/ui.css`, `screens/builder/builder.css` (modificar) | Estilos |

Todos os caminhos de `src/` abaixo são relativos a `apps/client/src/`, e os de `test/` a `apps/client/test/`.

---

### Task 1: Tokens, textos dos perks e fixture de ritmo

**Files:**
- Modify: `src/styles/tokens.css`
- Create: `src/lib/perks.ts`
- Modify: `test/fixtures.ts`, `test/contrast.test.ts`
- Test: `test/perks.test.ts`

**Interfaces:**
- Produces: `PerkInfo { name; position: Position; side: 'offense' | 'defense'; trigger; effect }`, `perkInfo(id: XFactorId): PerkInfo`; `makeRhythm(overrides?: Partial<RhythmView>): RhythmView` em `test/fixtures.ts`; tokens `--pulse`, `--pulse-ink`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `test/perks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PERKS, XFACTOR_IDS } from '@pfl/engine';
import { perkInfo } from '../src/lib/perks';

describe('perkInfo', () => {
  it.each([...XFACTOR_IDS])('%s tem nome, gatilho e efeito, sem travessão', (id) => {
    const info = perkInfo(id);
    expect(info.name.length).toBeGreaterThan(3);
    expect(info.trigger.length).toBeGreaterThan(10);
    expect(info.effect.length).toBeGreaterThan(10);
    for (const text of [info.name, info.trigger, info.effect]) expect(text).not.toMatch(/[—–]/);
  });

  it('posição e lado vêm da tabela do motor', () => {
    for (const id of XFACTOR_IDS) {
      expect(perkInfo(id).position).toBe(PERKS[id].position);
      expect(perkInfo(id).side).toBe(PERKS[id].side);
    }
    expect(perkInfo('TELEPATHIC_POCKET').name).toBe('Telepathic Pocket');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/perks.test.ts`
Expected: FAIL (`../src/lib/perks` não existe).

- [ ] **Step 3: Criar `src/lib/perks.ts`**

```ts
import { PERKS, type Position, type XFactorId, type ZoneSide } from '@pfl/engine';

export interface PerkInfo {
  name: string;
  position: Position;
  side: ZoneSide;
  trigger: string;
  effect: string;
}

const TEXT: Record<XFactorId, { name: string; trigger: string; effect: string }> = {
  TELEPATHIC_POCKET: {
    name: 'Telepathic Pocket',
    trigger: '2 passes completos seguidos com a defesa errando a leitura',
    effect: 'A leitura certa da defesa vale como neutra.',
  },
  OVERDRIVE_BREAKTHROUGH: {
    name: 'Overdrive Breakthrough',
    trigger: '2 corridas seguidas de 10 jardas ou mais',
    effect: 'A corrida avança pelo menos 3 jardas e escapa da contenção.',
  },
  SLIPSTREAM_SEPARATION: {
    name: 'Slipstream Separation',
    trigger: '2 recepções seguidas que fazem 1st down',
    effect: 'Contra homem a homem, mais jardas e menos passes incompletos.',
  },
  IMMOVABLE_WALL: {
    name: 'Immovable Wall',
    trigger: '2 jogadas seguidas sem sack e sem perda de jardas',
    effect: 'Contra Blitz, o ataque não sofre sack.',
  },
  INTIMIDATE_RUSH: {
    name: 'Intimidate Rush',
    trigger: '1 sack, ou 2 corridas contidas em até 2 jardas',
    effect: 'A pressão da linha aumenta: mais sacks.',
  },
  ENFORCER_STOMP: {
    name: 'Enforcer Stomp',
    trigger: '2 corridas por dentro contidas em até 3 jardas',
    effect: 'Mais fumbles, e o portador da bola cansa em dobro.',
  },
  ISLAND_LOCKDOWN: {
    name: 'Island Lockdown',
    trigger: '2 passes incompletos forçados',
    effect: 'O passe sob a marcação dele arrisca incompletar ou ser interceptado.',
  },
  PREDATOR_HAWK: {
    name: 'Predator Hawk',
    trigger: '2 jogadas seguidas sem ceder passe profundo completo',
    effect: 'O ataque rende menos em passes profundos e em play-action.',
  },
};

export function perkInfo(id: XFactorId): PerkInfo {
  return { ...TEXT[id], position: PERKS[id].position, side: PERKS[id].side };
}
```

- [ ] **Step 4: Tokens e contraste**

Em `src/styles/tokens.css`, depois da linha `--read-wrong: var(--gbc-red-text);` acrescentar:

```css

  /* Ritmo da partida (medidor, zona dos capitães): amarelo sobre tinta, tinta sobre amarelo */
  --pulse: var(--gbc-yellow);
  --pulse-ink: var(--gbc-ink);
```

Em `test/contrast.test.ts`, no array `PAIRS`, acrescentar antes do `];`:

```ts
  ['pulse', 'gbc-ink', 4.5, 'medidor de ritmo no HUD'],
  ['pulse-ink', 'pulse', 4.5, 'ficha de capitão na zona'],
```

- [ ] **Step 5: `makeRhythm` na fixture**

Em `test/fixtures.ts`: acrescentar `RhythmView` ao import de tipos (`import type { PlayerView, RhythmView, Team } from '@pfl/engine';`) e, antes de `makeView`, a função:

```ts
/** Ritmo neutro e sem capitães; os testes sobrescrevem só o que importa. */
export function makeRhythm(overrides: Partial<RhythmView> = {}): RhythmView {
  return {
    momentum: 0,
    dominant: null,
    tier: 0,
    timeouts: { A: 2, B: 2 },
    calledThisSnap: { A: false, B: false },
    captains: { A: { offense: null, defense: null }, B: { offense: null, defense: null } },
    ...overrides,
  };
}
```

e trocar o bloco `rhythm: {...},` de `makeView` (adicionado na Parte 1) por `rhythm: makeRhythm(),`.

- [ ] **Step 6: Rodar**

Run: `npx vitest run apps/client/test/perks.test.ts apps/client/test/contrast.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/client
git commit -m "feat(client/rhythm): tokens do ritmo, textos dos perks e fixture de ritmo" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: View-model puro do ritmo

**Files:**
- Create: `src/rhythm/viewModel.ts`
- Test: `test/rhythm-view-model.test.ts`

**Interfaces:**
- Consumes: `RhythmView`, `PlayerView`, `handEntries` (matchState), `PHASE_SECONDS`, `PULSE_PLAYCALL_CUT_SECONDS` (protocolo, Parte 1).
- Produces:
  - `GaugeModel { valueA; valueB; ratioA; ratioB; tier; dominant; youPressed; themPressed; valueText; statusText }` e `gaugeModel(r, you, names): GaugeModel`
  - `pressureFor(r, you): { tier: PulseTier; youPressed: boolean }`
  - `shakeActive(view): boolean`, `foggedCardKey(view): string | null`
  - `TimeoutState { enabled; reason: string | null; effect: string }` e `timeoutState(view, animating): TimeoutState`
  - `ZoneChip { team; side; species; xFactor; progress; inZone }` e `zoneChips(r): ZoneChip[]`
  - `PRESSED_PLAYCALL_SECONDS`

- [ ] **Step 1: Escrever o teste que falha**

Criar `test/rhythm-view-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PHASE_SECONDS, PULSE_PLAYCALL_CUT_SECONDS } from '@pfl/protocol';
import {
  PRESSED_PLAYCALL_SECONDS, foggedCardKey, gaugeModel, pressureFor, shakeActive, timeoutState, zoneChips,
} from '../src/rhythm/viewModel';
import { makeRhythm, makeView } from './fixtures';

const names = { A: 'Trovões', B: 'Pedreiras' };

describe('gaugeModel', () => {
  it('neutro: zero dos dois lados e "Equilíbrio."', () => {
    const g = gaugeModel(makeRhythm(), 'A', names);
    expect(g).toMatchObject({ valueA: 0, valueB: 0, ratioA: 0, ratioB: 0, tier: 0, youPressed: false, themPressed: false });
    expect(g.statusText).toBe('Equilíbrio.');
    expect(g.valueText).toBe('Momentum neutro');
  });

  it.each([
    [49, 0, 0.49, 0, 'Momentum 49 a favor de Trovões, sem pressão'],
    [50, 1, 0.5, 0, 'Momentum 50 a favor de Trovões, nível 1'],
    [80, 2, 0.8, 0, 'Momentum 80 a favor de Trovões, nível 2'],
    [-79, 1, 0, 0.79, 'Momentum 79 a favor de Pedreiras, nível 1'],
    [100, 2, 1, 0, 'Momentum 100 a favor de Trovões, nível 2'],
    [-100, 2, 0, 1, 'Momentum 100 a favor de Pedreiras, nível 2'],
  ])('momentum %i: nível %i, razão A %f, razão B %f', (momentum, tier, ratioA, ratioB, valueText) => {
    const dominant = tier === 0 ? null : momentum > 0 ? 'A' : 'B';
    const g = gaugeModel(makeRhythm({ momentum, dominant, tier: tier as 0 | 1 | 2 }), 'A', names);
    expect(g.ratioA).toBeCloseTo(ratioA);
    expect(g.ratioB).toBeCloseTo(ratioB);
    expect(g.valueA).toBe(Math.max(0, momentum));
    expect(g.valueB).toBe(Math.max(0, -momentum));
    expect(g.valueText).toBe(valueText);
  });

  it('o texto de estado depende de quem é o pressionado e do nível', () => {
    const six = PHASE_SECONDS.PLAYCALL - PULSE_PLAYCALL_CUT_SECONDS;
    expect(PRESSED_PLAYCALL_SECONDS).toBe(six);
    const bDominates1 = makeRhythm({ momentum: -60, dominant: 'B', tier: 1 });
    expect(gaugeModel(bDominates1, 'A', names).statusText).toBe(`Pressão tática contra você: ${six} s para jogar.`);
    expect(gaugeModel(bDominates1, 'B', names).statusText).toBe(`Seu time pressiona: o adversário tem ${six} s.`);
    const bDominates2 = makeRhythm({ momentum: -90, dominant: 'B', tier: 2 });
    expect(gaugeModel(bDominates2, 'A', names).statusText).toBe('Caldeirão hostil contra você: corridas e pressão da linha pioram.');
    expect(gaugeModel(bDominates2, 'B', names).statusText).toBe('Caldeirão hostil contra o adversário.');
    expect(gaugeModel(bDominates2, 'A', names)).toMatchObject({ youPressed: true, themPressed: false });
    expect(gaugeModel(bDominates2, 'B', names)).toMatchObject({ youPressed: false, themPressed: true });
  });
});

describe('pressureFor, shakeActive e foggedCardKey', () => {
  const pressedView = (over = {}) =>
    makeView({
      you: 'A', phase: 'PLAYCALL', turnId: 7, side: 'offense',
      hand: ['electric_thunder_screen', 'normal_tackle', 'fighting_submission'],
      rhythm: makeRhythm({ momentum: -90, dominant: 'B', tier: 2 }),
      ...over,
    });

  it('pressureFor aponta o pressionado', () => {
    expect(pressureFor(makeRhythm({ momentum: -90, dominant: 'B', tier: 2 }), 'A')).toEqual({ tier: 2, youPressed: true });
    expect(pressureFor(makeRhythm({ momentum: -90, dominant: 'B', tier: 2 }), 'B')).toEqual({ tier: 2, youPressed: false });
    expect(pressureFor(makeRhythm(), 'A')).toEqual({ tier: 0, youPressed: false });
  });

  it('o tremor só vale no nível 2, pressionado, em PLAYCALL', () => {
    expect(shakeActive(pressedView())).toBe(true);
    expect(shakeActive(pressedView({ phase: 'FORMATION' }))).toBe(false);
    expect(shakeActive(pressedView({ rhythm: makeRhythm({ momentum: -60, dominant: 'B', tier: 1 }) }))).toBe(false);
    expect(shakeActive(pressedView({ you: 'B' }))).toBe(false);
  });

  it('a névoa vale no nível 1 ou 2, pressionado, em PLAYCALL, numa carta da mão (nunca básica), estável por turno', () => {
    const view = pressedView();
    const key = foggedCardKey(view);
    expect(key).toMatch(/^hand-\d+-/);
    expect(foggedCardKey(view)).toBe(key);
    expect(foggedCardKey(pressedView({ turnId: 8 }))).not.toBe(key);
    expect(foggedCardKey(pressedView({ rhythm: makeRhythm({ momentum: -60, dominant: 'B', tier: 1 }) }))).not.toBeNull();
    expect(foggedCardKey(pressedView({ rhythm: makeRhythm() }))).toBeNull();
    expect(foggedCardKey(pressedView({ phase: 'PACKAGE' }))).toBeNull();
    expect(foggedCardKey(pressedView({ hand: [] }))).toBeNull();
  });
});

describe('timeoutState', () => {
  const view = (over = {}) => makeView({ phase: 'FORMATION', you: 'A', ...over });

  it('habilita em FORMATION e PACKAGE com timeouts e sem uso no snap', () => {
    expect(timeoutState(view(), false).enabled).toBe(true);
    expect(timeoutState(view({ phase: 'PACKAGE' }), false).enabled).toBe(true);
  });

  it('explica por que está desabilitado', () => {
    expect(timeoutState(view({ phase: 'PLAYCALL' }), false)).toMatchObject({ enabled: false, reason: 'Disponível entre as jogadas' });
    expect(timeoutState(view(), true)).toMatchObject({ enabled: false, reason: 'Disponível entre as jogadas' });
    expect(timeoutState(view({ rhythm: makeRhythm({ timeouts: { A: 0, B: 2 } }) }), false)).toMatchObject({ enabled: false, reason: 'Sem timeouts' });
    expect(timeoutState(view({ rhythm: makeRhythm({ calledThisSnap: { A: true, B: false } }) }), false)).toMatchObject({
      enabled: false,
      reason: 'Você já chamou timeout neste snap',
    });
  });

  it('descreve o efeito pelo momentum do adversário e pelos capitães dele na zona', () => {
    const rivalLeads = makeRhythm({ momentum: -70, dominant: 'B', tier: 1 });
    expect(timeoutState(view({ rhythm: rivalLeads }), false).effect).toBe('Corta o momentum dele pela metade.');
    expect(timeoutState(view(), false).effect).toBe('Sem efeito agora. Guarde o timeout.');
    const rivalZone = makeRhythm({
      captains: { A: { offense: null, defense: null }, B: { offense: { species: 63, xFactor: 'TELEPATHIC_POCKET', progress: 2, inZone: true }, defense: null } },
    });
    expect(timeoutState(view({ rhythm: rivalZone }), false).effect).toBe('Tira os capitães dele da zona.');
    expect(timeoutState(view({ rhythm: { ...rivalZone, momentum: -70, dominant: 'B', tier: 1 } }), false).effect).toBe(
      'Corta o momentum dele pela metade e tira os capitães dele da zona.',
    );
  });
});

describe('zoneChips', () => {
  it('lista só os capitães que existem, A antes de B, ataque antes de defesa', () => {
    const r = makeRhythm({
      captains: {
        A: { offense: { species: 63, xFactor: 'TELEPATHIC_POCKET', progress: 1, inZone: false }, defense: null },
        B: { offense: null, defense: { species: 95, xFactor: 'INTIMIDATE_RUSH', progress: 2, inZone: true } },
      },
    });
    expect(zoneChips(r)).toEqual([
      { team: 'A', side: 'offense', species: 63, xFactor: 'TELEPATHIC_POCKET', progress: 1, inZone: false },
      { team: 'B', side: 'defense', species: 95, xFactor: 'INTIMIDATE_RUSH', progress: 2, inZone: true },
    ]);
    expect(zoneChips(makeRhythm())).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/rhythm-view-model.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Criar `src/rhythm/viewModel.ts`**

```ts
import type { PlayerView, PulseTier, RhythmView, TeamKey, XFactorId, ZoneSide } from '@pfl/engine';
import { PHASE_SECONDS, PULSE_PLAYCALL_CUT_SECONDS } from '@pfl/protocol';
import { handEntries } from '../match/matchState';

const other = (k: TeamKey): TeamKey => (k === 'A' ? 'B' : 'A');

/** Tempo do PLAYCALL do jogador pressionado (o servidor corta o prazo; ver a Parte 1). */
export const PRESSED_PLAYCALL_SECONDS = PHASE_SECONDS.PLAYCALL - PULSE_PLAYCALL_CUT_SECONDS;

export function pressureFor(r: RhythmView, you: TeamKey): { tier: PulseTier; youPressed: boolean } {
  const pressed = r.dominant ? other(r.dominant) : null;
  return { tier: r.tier, youPressed: pressed === you };
}

export interface GaugeModel {
  valueA: number;
  valueB: number;
  /** 0 a 1: fração da metade da trilha */
  ratioA: number;
  ratioB: number;
  tier: PulseTier;
  dominant: TeamKey | null;
  youPressed: boolean;
  themPressed: boolean;
  valueText: string;
  statusText: string;
}

function statusFor(tier: PulseTier, youPressed: boolean): string {
  if (tier === 0) return 'Equilíbrio.';
  if (tier === 1) {
    return youPressed
      ? `Pressão tática contra você: ${PRESSED_PLAYCALL_SECONDS} s para jogar.`
      : `Seu time pressiona: o adversário tem ${PRESSED_PLAYCALL_SECONDS} s.`;
  }
  return youPressed ? 'Caldeirão hostil contra você: corridas e pressão da linha pioram.' : 'Caldeirão hostil contra o adversário.';
}

export function gaugeModel(r: RhythmView, you: TeamKey, names: Record<TeamKey, string>): GaugeModel {
  const valueA = Math.max(0, r.momentum);
  const valueB = Math.max(0, -r.momentum);
  const { youPressed } = pressureFor(r, you);
  const themPressed = r.dominant !== null && !youPressed;
  const level = r.tier === 0 ? 'sem pressão' : `nível ${r.tier}`;
  return {
    valueA,
    valueB,
    ratioA: valueA / 100,
    ratioB: valueB / 100,
    tier: r.tier,
    dominant: r.dominant,
    youPressed,
    themPressed,
    valueText: r.momentum === 0 ? 'Momentum neutro' : `Momentum ${Math.abs(r.momentum)} a favor de ${names[r.momentum > 0 ? 'A' : 'B']}, ${level}`,
    statusText: statusFor(r.tier, youPressed),
  };
}

/** Tremor curto no início do PLAYCALL de quem está no nível 2 do pulse. */
export function shakeActive(view: PlayerView): boolean {
  const { tier, youPressed } = pressureFor(view.rhythm, view.you);
  return youPressed && tier === 2 && view.phase === 'PLAYCALL';
}

/** Chave (de `handEntries`) da carta da mão cujo tooltip fica sob névoa; nunca uma básica. */
export function foggedCardKey(view: PlayerView): string | null {
  const { tier, youPressed } = pressureFor(view.rhythm, view.you);
  if (!youPressed || tier < 1 || view.phase !== 'PLAYCALL') return null;
  const hand = handEntries(view).filter((e) => e.source === 'HAND');
  return hand.length === 0 ? null : hand[view.turnId % hand.length].key;
}

export interface TimeoutState {
  enabled: boolean;
  /** por que está desabilitado; null quando habilitado */
  reason: string | null;
  /** o que o timeout faria agora */
  effect: string;
}

export function timeoutState(view: PlayerView, animating: boolean): TimeoutState {
  const r = view.rhythm;
  const rival = other(view.you);
  const rivalLeads = rival === 'A' ? r.momentum > 0 : r.momentum < 0;
  const rivalCaptains = [r.captains[rival].offense, r.captains[rival].defense];
  const clearsZone = rivalCaptains.some((c) => c?.inZone);
  const effect =
    rivalLeads && clearsZone
      ? 'Corta o momentum dele pela metade e tira os capitães dele da zona.'
      : rivalLeads
        ? 'Corta o momentum dele pela metade.'
        : clearsZone
          ? 'Tira os capitães dele da zona.'
          : 'Sem efeito agora. Guarde o timeout.';
  const betweenPlays = (view.phase === 'FORMATION' || view.phase === 'PACKAGE') && !animating;
  if (!betweenPlays) return { enabled: false, reason: 'Disponível entre as jogadas', effect };
  if (r.timeouts[view.you] <= 0) return { enabled: false, reason: 'Sem timeouts', effect };
  if (r.calledThisSnap[view.you]) return { enabled: false, reason: 'Você já chamou timeout neste snap', effect };
  return { enabled: true, reason: null, effect };
}

export interface ZoneChip {
  team: TeamKey;
  side: ZoneSide;
  species: number;
  xFactor: XFactorId;
  progress: number;
  inZone: boolean;
}

export function zoneChips(r: RhythmView): ZoneChip[] {
  const chips: ZoneChip[] = [];
  for (const team of ['A', 'B'] as const) {
    for (const side of ['offense', 'defense'] as const) {
      const c = r.captains[team][side];
      if (c) chips.push({ team, side, species: c.species, xFactor: c.xFactor, progress: c.progress, inZone: c.inZone });
    }
  }
  return chips;
}
```

- [ ] **Step 4: Rodar**

Run: `npx vitest run apps/client/test/rhythm-view-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client
git commit -m "feat(client/rhythm): view-model puro do medidor, da névoa, do timeout e das fichas" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Estado da partida: auras e ritmo anterior à jogada

**Files:**
- Modify: `src/match/matchState.ts`
- Test: `test/match-state.test.ts`

**Interfaces:**
- Consumes: `RhythmView` (engine, Parte 1).
- Produces: `Aura { team; side; id }`, `Stage.auras?: Aura[]`, `aurasFrom(r: RhythmView): Aura[]`, `Animation.rhythmBefore: RhythmView | null`.

- [ ] **Step 1: Escrever os testes que falham**

Em `test/match-state.test.ts`, ao fim do arquivo, acrescentar (os helpers `phase`, `apply`, `result`, `playcallView`, `nextView` e `makeView` já existem no arquivo; acrescente o import de `makeRhythm` junto de `makeView` e de `aurasFrom` junto de `canSubmitCard`):

```ts
describe('ritmo no estado da partida', () => {
  const zoneRhythm = makeRhythm({
    momentum: 55,
    dominant: 'A',
    tier: 1,
    captains: {
      A: { offense: { species: 63, xFactor: 'TELEPATHIC_POCKET', progress: 2, inZone: true }, defense: { species: 95, xFactor: 'INTIMIDATE_RUSH', progress: 1, inZone: false } },
      B: { offense: null, defense: { species: 66, xFactor: 'ENFORCER_STOMP', progress: 2, inZone: true } },
    },
  });

  it('aurasFrom lista só os capitães que estão na zona, com o time', () => {
    expect(aurasFrom(zoneRhythm)).toEqual([
      { team: 'A', side: 'offense', id: 63 },
      { team: 'B', side: 'defense', id: 66 },
    ]);
    expect(aurasFrom(makeRhythm())).toEqual([]);
  });

  it('o estágio vem da view com as auras', () => {
    const s = apply(phase(playcallView({ rhythm: zoneRhythm })));
    expect(s.stage?.auras).toEqual(aurasFrom(zoneRhythm));
  });

  it('o RESULT guarda o ritmo anterior à jogada na animação', () => {
    const before = makeRhythm({ momentum: 20 });
    const after = makeRhythm({ momentum: 60, dominant: 'A', tier: 1 });
    const s = apply(
      phase(playcallView({ rhythm: before })),
      result(1, playEvents, makeView({ turnId: 2, rhythm: after })),
    );
    expect(s.animation?.rhythmBefore).toEqual(before);
    expect(s.view?.rhythm).toEqual(after);
  });

  it('sem view anterior, o ritmo anterior é null', () => {
    const s = apply(result(1, playEvents, makeView({ turnId: 2 })));
    expect(s.animation?.rhythmBefore).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/match-state.test.ts`
Expected: FAIL (`aurasFrom` não existe).

- [ ] **Step 3: Implementar em `matchState.ts`**

1. Trocar a linha de import do engine por (acrescenta `RhythmView`):

```ts
import type { GameEvent, Lineup, Phase, PlayerView, ReadResult, RhythmView, TeamKey } from '@pfl/engine';
```

2. Em `interface Stage`, acrescentar depois de `fatigue: ...;`:

```ts
  /** capitães em zona, para a aura (ritmo); opcional para não quebrar os estágios existentes */
  auras?: Aura[];
```

3. Antes de `interface Stage`, acrescentar:

```ts
export interface Aura {
  team: TeamKey;
  side: 'offense' | 'defense';
  id: number;
}

/** Capitães em zona dos dois times. O campo filtra pelo time que está de fato em cada lado. */
export function aurasFrom(r: RhythmView): Aura[] {
  const auras: Aura[] = [];
  for (const team of ['A', 'B'] as const) {
    for (const side of ['offense', 'defense'] as const) {
      const c = r.captains[team][side];
      if (c?.inZone) auras.push({ team, side, id: c.species });
    }
  }
  return auras;
}
```

4. Em `interface Animation`, acrescentar depois de `stage: Stage;`:

```ts
  /** ritmo anterior à jogada: o HUD o mostra até a animação acabar */
  rhythmBefore: RhythmView | null;
```

5. Em `stageFromView`, acrescentar ao objeto devolvido, depois de `fatigue: view.fatigue,`:

```ts
    auras: aurasFrom(view.rhythm),
```

6. No `case 'RESULT'`, no objeto `animation: {...}`, acrescentar `rhythmBefore: s.view?.rhythm ?? null,` (junto de `seq`, `events`...):

```ts
        animation: {
          seq, events: msg.events, steps, stage: pre, rhythmBefore: s.view?.rhythm ?? null,
          startedAt: now, endsAt: now + timelineDuration(steps),
        },
```

(preserve a ordem dos campos como já está; só acrescente `rhythmBefore`.)

- [ ] **Step 4: Rodar**

Run: `npx vitest run apps/client/test/match-state.test.ts apps/client/test/replay.test.ts && npm run typecheck`
Expected: PASS. Se algum literal de `Animation` em outro teste/arquivo acusar `rhythmBefore` ausente, acrescente `rhythmBefore: null`.

- [ ] **Step 5: Commit**

```bash
git add apps/client
git commit -m "feat(client/rhythm): auras no estágio e ritmo anterior à jogada na animação" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Timeline e narração dos eventos do ritmo

**Files:**
- Modify: `src/match/timeline.ts`, `src/match/narration.ts`, `src/match/replayFrames.ts`, `src/match/matchState.ts` (passa o nível anterior ao `buildTimeline`)
- Test: `test/timeline.test.ts`, `test/narration.test.ts`

**Interfaces:**
- Consumes: eventos `ZONE_ENTER`, `ZONE_EXIT`, `ZONE_CLASH`, `PULSE_TIER`, `TIMEOUT_CALLED` (Parte 1); `perkInfo` (Task 1).
- Produces:
  - `AnimStep` com `{ kind: 'ZONE'; team; side; species; xFactor: XFactorId | null; enter: boolean }`, `{ kind: 'ZONE_CLASH'; offense; defense }`, `{ kind: 'PULSE'; dominant; tier }`.
  - `buildTimeline(events, tierBefore = 0)`: o segundo argumento é o nível do pulse antes da jogada; só gera `PULSE` quando o nível sobe.
  - Linhas de narração para os 5 eventos.

- [ ] **Step 1: Escrever os testes que falham**

Em `test/timeline.test.ts`, ao fim do arquivo:

```ts
describe('buildTimeline: ritmo', () => {
  const base = (extra: GameEvent[]) => play('basic_run', {}, extra);

  it('ZONE_ENTER e ZONE_EXIT viram passos ZONE depois da jogada', () => {
    const steps = buildTimeline(
      base([
        { t: 'ZONE_EXIT', team: 'B', side: 'defense', species: 66, cause: 'BIG_GAIN' },
        { t: 'ZONE_ENTER', team: 'A', side: 'offense', species: 25, xFactor: 'OVERDRIVE_BREAKTHROUGH' },
      ]),
    );
    expect(kinds(steps).slice(-2)).toEqual(['ZONE', 'ZONE']);
    expect(steps.at(-2)).toMatchObject({ kind: 'ZONE', enter: false, species: 66, xFactor: null });
    expect(steps.at(-1)).toMatchObject({ kind: 'ZONE', enter: true, species: 25, xFactor: 'OVERDRIVE_BREAKTHROUGH', team: 'A', side: 'offense' });
    expectWellFormed(steps);
  });

  it('ZONE_CLASH vira um passo próprio', () => {
    const steps = buildTimeline(base([{ t: 'ZONE_CLASH', offense: 63, defense: 66 }]));
    expect(steps.at(-1)).toMatchObject({ kind: 'ZONE_CLASH', offense: 63, defense: 66 });
  });

  it('PULSE só aparece quando o nível sobe em relação ao anterior', () => {
    const rise = buildTimeline(base([{ t: 'PULSE_TIER', dominant: 'A', tier: 1 }]), 0);
    expect(rise.at(-1)).toMatchObject({ kind: 'PULSE', tier: 1, dominant: 'A' });
    expect(kinds(buildTimeline(base([{ t: 'PULSE_TIER', dominant: 'A', tier: 1 }]), 2))).not.toContain('PULSE');
    expect(kinds(buildTimeline(base([{ t: 'PULSE_TIER', dominant: null, tier: 0 }]), 1))).not.toContain('PULSE');
    expect(kinds(buildTimeline(base([{ t: 'PULSE_TIER', dominant: 'A', tier: 2 }]), 1))).toContain('PULSE');
  });

  it('dentro da mesma lista o nível acompanha as subidas', () => {
    const steps = buildTimeline(
      base([
        { t: 'PULSE_TIER', dominant: 'A', tier: 1 },
        { t: 'PULSE_TIER', dominant: 'A', tier: 2 },
      ]),
    );
    expect(steps.filter((s) => s.kind === 'PULSE')).toHaveLength(2);
  });

  it('o pior caso (touchdown, zona, clash e pulse) cabe no orçamento', () => {
    const steps = buildTimeline(
      play('electric_thunder_screen', { yards: 40 }, [
        { t: 'ZONE_ENTER', team: 'A', side: 'offense', species: 25, xFactor: 'OVERDRIVE_BREAKTHROUGH' },
        { t: 'ZONE_CLASH', offense: 25, defense: 66 },
        { t: 'PULSE_TIER', dominant: 'A', tier: 2 },
        { t: 'TOUCHDOWN', team: 'A' },
      ]),
    );
    expect(kinds(steps)).toEqual(expect.arrayContaining(['ZONE', 'ZONE_CLASH', 'PULSE', 'BANNER']));
    expectWellFormed(steps);
  });
});
```

Em `test/narration.test.ts`, ao fim do arquivo:

```ts
describe('narrate: ritmo', () => {
  it('pulse sobe, cai e some', () => {
    expect(texts([{ t: 'PULSE_TIER', dominant: 'A', tier: 1 }])).toEqual(['O estádio pressiona Pedreiras: pressão tática.']);
    expect(texts([{ t: 'PULSE_TIER', dominant: 'B', tier: 2 }])).toEqual(['Caldeirão hostil contra Trovões!']);
    expect(texts([{ t: 'PULSE_TIER', dominant: null, tier: 0 }])).toEqual(['A torcida se acalma.']);
  });

  it('zona, saída, clash e timeout', () => {
    expect(texts([{ t: 'ZONE_ENTER', team: 'A', side: 'offense', species: 63, xFactor: 'TELEPATHIC_POCKET' }])).toEqual([
      'Abra entrou na zona! (Telepathic Pocket)',
    ]);
    expect(texts([{ t: 'ZONE_EXIT', team: 'A', side: 'offense', species: 63, cause: 'TIMEOUT' }])).toEqual(['Abra saiu da zona.']);
    expect(texts([{ t: 'ZONE_CLASH', offense: 63, defense: 66 }])).toEqual(['Choque de capitães: Abra contra Machop!']);
    expect(texts([{ t: 'TIMEOUT_CALLED', team: 'B', remaining: 1 }])).toEqual(['Pedreiras chamou timeout (restam 1).']);
  });

  it('o momentum não gera linha', () => {
    expect(texts([{ t: 'MOMENTUM', delta: 10, value: 10, reason: 'STREAK' }])).toEqual([]);
  });
});
```

(`speciesName(63)` deve ser "Abra" e `speciesName(66)` "Machop"; se o helper exibir diferente, ajuste o texto esperado ao que `speciesName` devolve, sem mudar o código de narração.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/timeline.test.ts apps/client/test/narration.test.ts`
Expected: FAIL nos casos novos.

- [ ] **Step 3: Timeline**

Em `src/match/timeline.ts`:

1. Import: `import type { GameEvent, OffenseCategory, PlayOutcome, PulseTier, TeamKey, XFactorId, ZoneSide } from '@pfl/engine';`

2. Na união `AnimStep`, acrescentar antes de `| { kind: 'BANNER'; ... }`:

```ts
    | { kind: 'ZONE'; team: TeamKey; side: ZoneSide; species: number; xFactor: XFactorId | null; enter: boolean }
    | { kind: 'ZONE_CLASH'; offense: number; defense: number }
    | { kind: 'PULSE'; dominant: TeamKey | null; tier: PulseTier }
```

3. No objeto `D`, acrescentar `zone: 600, zoneExit: 200, pulse: 500,`.

4. Mudar a assinatura: `export function buildTimeline(events: readonly GameEvent[], tierBefore: PulseTier = 0): AnimStep[] {` e, logo depois de `let blitz = false;`, acrescentar `let tier: PulseTier = tierBefore;`.

5. No `switch (e.t)` principal, antes de `default:`, acrescentar:

```ts
      case 'ZONE_ENTER':
        push({ kind: 'ZONE', team: e.team, side: e.side, species: e.species, xFactor: e.xFactor, enter: true }, D.zone);
        break;
      case 'ZONE_EXIT':
        push({ kind: 'ZONE', team: e.team, side: e.side, species: e.species, xFactor: null, enter: false }, D.zoneExit);
        break;
      case 'ZONE_CLASH':
        push({ kind: 'ZONE_CLASH', offense: e.offense, defense: e.defense }, D.zone);
        break;
      case 'PULSE_TIER':
        if (e.tier >= 1 && e.tier > tier) push({ kind: 'PULSE', dominant: e.dominant, tier: e.tier }, D.pulse);
        tier = e.tier;
        break;
```

6. Em `src/match/matchState.ts`, no `case 'RESULT'`, trocar `const steps = buildTimeline(msg.events);` por:

```ts
      const steps = buildTimeline(msg.events, s.view?.rhythm.tier ?? 0);
```

7. Em `src/match/replayFrames.ts`, em `buildReplay`: importar `PulseTier` do engine e acrescentar `let tier: PulseTier = 0;` junto de `let pending`. O nível anterior de cada frame é o nível depois de **todos os eventos anteriores**. Trocar a chamada `buildTimeline(resolved)` dentro de `flush` por `buildTimeline(resolved, tier)` e, no fim de `flush`, depois de `pending = [];`, acrescentar `for (const e of resolved) if (e.t === 'PULSE_TIER') tier = e.tier;`. No laço `for (const action of data.actions)`, trocar a linha do `if (r.events.some(...)) flush(...)` por:

```ts
      if (r.events.some((e) => RESOLVES.has(e.t))) flush(stageFromState(before), r.events);
      else for (const e of r.events) if (e.t === 'PULSE_TIER') tier = e.tier; // timeout e afins: só atualizam o nível
```

(o `flush` final, `if (pending.length > 0) flush(stageFromState(state), pending)`, continua igual.)

- [ ] **Step 4: Narração**

Em `src/match/narration.ts`: acrescentar `import { perkInfo } from '../lib/perks';` e, no `switch (e.t)` de `narrate`, antes de `default:`:

```ts
      case 'PULSE_TIER': {
        if (e.tier === 0 || !e.dominant) {
          add('A torcida se acalma.', 'system');
          break;
        }
        const pressed = ctx.names[e.dominant === 'A' ? 'B' : 'A'];
        add(e.tier === 1 ? `O estádio pressiona ${pressed}: pressão tática.` : `Caldeirão hostil contra ${pressed}!`, 'system');
        break;
      }
      case 'ZONE_ENTER':
        add(`${speciesName(e.species)} entrou na zona! (${perkInfo(e.xFactor).name})`, 'effect');
        break;
      case 'ZONE_EXIT':
        add(`${speciesName(e.species)} saiu da zona.`, 'effect');
        break;
      case 'ZONE_CLASH':
        add(`Choque de capitães: ${speciesName(e.offense)} contra ${speciesName(e.defense)}!`, 'effect');
        break;
      case 'TIMEOUT_CALLED':
        add(`${ctx.names[e.team]} chamou timeout (restam ${e.remaining}).`, 'system');
        break;
```

`speciesName` já é importado no topo do arquivo (`import { ..., speciesName } from '../lib/names'`); confirme e acrescente se faltar.

- [ ] **Step 5: Rodar**

Run: `npx vitest run apps/client/test/timeline.test.ts apps/client/test/narration.test.ts apps/client/test/replay.test.ts apps/client/test/match-state.test.ts && npm run typecheck`
Expected: PASS. O typecheck pode acusar o `switch` exaustivo de `cueForStep` em `audio/cues.ts` (Task 5 resolve); se acusar, deixe para a Task 5.

- [ ] **Step 6: Commit**

```bash
git add apps/client
git commit -m "feat(client/rhythm): passos de timeline e narração para zona, pulse, clash e timeout" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Áudio: cues, ducking, batimento e som do timeout

**Files:**
- Modify: `src/audio/cues.ts`, `recipes.ts`, `engine.ts`, `gameAudio.ts`, `useGameAudio.ts`
- Modify: `test/use-game-audio.test.tsx` (acrescentar `setDuck` ao mock)
- Modify: `../../docs/AUDIO.md`
- Test: `test/audio-rhythm.test.ts`, `test/use-game-audio.test.tsx`

**Interfaces:**
- Consumes: passos `ZONE`, `ZONE_CLASH`, `PULSE` (Task 4); `pressureFor` (Task 2).
- Produces: cues `zone-enter`, `zone-exit`, `zone-clash`, `pulse-1`, `pulse-2`, `timeout`, `heartbeat`; `Audio.setDuck(factor: number)`; em `gameAudio.ts`: `HEARTBEAT_MS`, `DUCK_PRESSED_TIER_2`, `heartbeatActive(view, mode)`, `duckFor(view)`, `timeoutCalled(prev, next)`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `test/audio-rhythm.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CUES, cuesFor } from '../src/audio/cues';
import { RECIPES } from '../src/audio/recipes';
import { recipeDuration } from '../src/audio/synth';
import { DUCK_PRESSED_TIER_2, duckFor, heartbeatActive, timeoutCalled } from '../src/audio/gameAudio';
import { createAudio } from '../src/audio/engine';
import { DEFAULT_SETTINGS, MUSIC_BASE, SFX_BASE } from '../src/audio/mixer';
import { memoryStorage } from '../src/lib/storage';
import { parseScore } from '../src/audio/score';
import type { AnimStep } from '../src/match/timeline';
import { FakeBackend } from './audio-fakes';
import { makeRhythm, makeView } from './fixtures';

const step = (s: Record<string, unknown>): AnimStep => ({ ...s, at: 0, duration: 100 }) as unknown as AnimStep;

describe('cues do ritmo', () => {
  it('existem e têm receita dentro dos limites', () => {
    for (const cue of ['zone-enter', 'zone-exit', 'zone-clash', 'pulse-1', 'pulse-2', 'timeout', 'heartbeat'] as const) {
      expect(CUES).toContain(cue);
      expect(RECIPES[cue].length).toBeGreaterThan(0);
      expect(recipeDuration(RECIPES[cue])).toBeLessThanOrEqual(1.5);
    }
    expect(recipeDuration(RECIPES['zone-enter'])).toBeGreaterThan(1);
  });

  it('os passos novos escolhem o cue certo', () => {
    const cues = cuesFor([
      step({ kind: 'ZONE', team: 'A', side: 'offense', species: 63, xFactor: 'TELEPATHIC_POCKET', enter: true }),
      step({ kind: 'ZONE', team: 'A', side: 'offense', species: 63, xFactor: null, enter: false }),
      step({ kind: 'ZONE_CLASH', offense: 63, defense: 66 }),
      step({ kind: 'PULSE', dominant: 'A', tier: 1 }),
      step({ kind: 'PULSE', dominant: 'A', tier: 2 }),
    ]);
    expect(cues.map((c) => c.cue)).toEqual(['zone-enter', 'zone-exit', 'zone-clash', 'pulse-1', 'pulse-2']);
  });
});

describe('decisões de áudio do ritmo', () => {
  const pressed = (over = {}) => makeView({ you: 'A', rhythm: makeRhythm({ momentum: -90, dominant: 'B', tier: 2 }), ...over });

  it('o batimento só toca pressionado no nível 2 enquanto o jogador escolhe', () => {
    expect(heartbeatActive(pressed(), 'PICK_CARD')).toBe(true);
    expect(heartbeatActive(pressed(), 'PICK_FORMATION')).toBe(true);
    expect(heartbeatActive(pressed(), 'ANIMATING')).toBe(false);
    expect(heartbeatActive(pressed(), 'WAIT_OPPONENT')).toBe(false);
    expect(heartbeatActive(pressed({ you: 'B' }), 'PICK_CARD')).toBe(false);
    expect(heartbeatActive(makeView(), 'PICK_CARD')).toBe(false);
    expect(heartbeatActive(null, 'PICK_CARD')).toBe(false);
  });

  it('a música abafa só no nível 2, pressionado', () => {
    expect(duckFor(pressed())).toBe(DUCK_PRESSED_TIER_2);
    expect(duckFor(pressed({ you: 'B' }))).toBe(1);
    expect(duckFor(makeView())).toBe(1);
    expect(duckFor(null)).toBe(1);
  });

  it('timeout chamado = a soma dos timeouts diminuiu', () => {
    expect(timeoutCalled(4, 3)).toBe(true);
    expect(timeoutCalled(4, 4)).toBe(false);
    expect(timeoutCalled(null, 3)).toBe(false);
  });
});

describe('Audio.setDuck', () => {
  const tiny = parseScore({ bpm: 120, channels: [{ voice: 'pulse1', bars: ['C4 - - - . . . . . . . . . . . .'] }] });
  const scores = { menu: tiny, match: tiny, win: tiny, lose: tiny };

  it('abaixa só a música e volta ao normal', () => {
    const backend = new FakeBackend();
    const audio = createAudio({ backend, storage: memoryStorage(), scores });
    audio.unlock();
    const last = (node: 'music' | 'sfx') => backend.gains.filter((g) => g.node === node).at(-1)!.value;
    audio.setDuck(0.5);
    expect(last('music')).toBeCloseTo(DEFAULT_SETTINGS.music * MUSIC_BASE * 0.5, 9);
    expect(last('sfx')).toBeCloseTo(DEFAULT_SETTINGS.sfx * SFX_BASE, 9);
    audio.setDuck(1);
    expect(last('music')).toBeCloseTo(DEFAULT_SETTINGS.music * MUSIC_BASE, 9);
    audio.setDuck(5);
    expect(last('music')).toBeCloseTo(DEFAULT_SETTINGS.music * MUSIC_BASE, 9);
  });

  it('o ganho continua valendo quando o volume muda com a música abafada', () => {
    const backend = new FakeBackend();
    const audio = createAudio({ backend, storage: memoryStorage(), scores });
    audio.unlock();
    audio.setDuck(0.5);
    audio.setVolume('music', 1);
    expect(backend.gains.filter((g) => g.node === 'music').at(-1)!.value).toBeCloseTo(1 * MUSIC_BASE * 0.5, 9);
  });
});
```

Em `test/use-game-audio.test.tsx`: no `vi.hoisted` do `fake`, acrescentar `setDuck: vi.fn(),`. No fim do arquivo acrescentar:

```ts
describe('useGameAudio: ritmo', () => {
  const pressedView = (over = {}) =>
    makeView({
      you: 'A', phase: 'PLAYCALL', formation: 'PISTOL', package: 'BASE', turnId: 3,
      rhythm: makeRhythm({ momentum: -90, dominant: 'B', tier: 2 }), ...over,
    });
  const matchWith = (over = {}) => apply(phase(pressedView(over)));

  it('abafa a música e toca o batimento enquanto o jogador pressionado escolhe', () => {
    vi.useFakeTimers();
    try {
      mount(props({ screen: 'MATCH', room: room('A'), match: matchWith({ yourCard: null }) }));
      expect(fake.setDuck).toHaveBeenCalledWith(0.55);
      expect(fake.play).toHaveBeenCalledWith('heartbeat');
      const first = fake.play.mock.calls.filter(([c]) => c === 'heartbeat').length;
      vi.advanceTimersByTime(2500);
      expect(fake.play.mock.calls.filter(([c]) => c === 'heartbeat').length).toBeGreaterThan(first);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sem pressão, a música volta ao normal e não há batimento', () => {
    mount(props({ screen: 'MATCH', room: room('A'), match: apply(phase({ phase: 'PLAYCALL' })) }));
    expect(fake.setDuck).toHaveBeenLastCalledWith(1);
    expect(fake.play).not.toHaveBeenCalledWith('heartbeat');
  });

  it('toca o som de timeout quando a soma dos timeouts diminui', () => {
    const before = apply(phase({ phase: 'FORMATION' }));
    const { rerender } = mount(props({ screen: 'MATCH', room: room('A'), match: before }));
    fake.play.mockClear();
    const after = matchReducer(before, phase({ phase: 'FORMATION', turnId: 1, rhythm: makeRhythm({ timeouts: { A: 2, B: 1 } }) }));
    rerender(props({ screen: 'MATCH', room: room('A'), match: after }));
    expect(fake.play).toHaveBeenCalledWith('timeout');
  });
});
```

Se `makeRhythm` não estiver importado nesse arquivo, acrescente-o ao import de `./fixtures`. Se o reducer ignorar a `PHASE` repetida (mesmo `turnId` e fase, `isNewerView` é `>=`, então aceita), o último teste funciona; senão use `turnId: 2`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/audio-rhythm.test.ts apps/client/test/use-game-audio.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Cues e receitas**

Em `src/audio/cues.ts`: acrescentar à lista `CUES`, antes de `'ui-click'`:

```ts
  'zone-enter', 'zone-exit', 'zone-clash', 'pulse-1', 'pulse-2', 'timeout', 'heartbeat',
```

e em `cueForStep`, antes do `case 'BANNER':`:

```ts
    case 'ZONE':
      return step.enter ? 'zone-enter' : 'zone-exit';
    case 'ZONE_CLASH':
      return 'zone-clash';
    case 'PULSE':
      return step.tier === 1 ? 'pulse-1' : 'pulse-2';
```

Em `src/audio/recipes.ts`, dentro de `RECIPES`, antes do comentário `// interface`:

```ts
  // ritmo e zona
  'zone-enter': [sq(440, 0, 0.9, 0.4, 1760), sq(660, 0.1, 0.8, 0.25, 2640), nz(3000, 0, 0.12, 0.3, 1500), tri(220, 0.5, 0.9, 0.5, 440)],
  'zone-exit': [sq(660, 0, 0.1, 0.35, 440), sq(440, 0.11, 0.2, 0.35, 220)],
  'zone-clash': [sq(220, 0, 0.14, 0.5, 110), nz(900, 0, 0.1, 0.4, 300), sq(523, 0.15, 0.3, 0.35), sq(784, 0.15, 0.3, 0.35), sq(1046, 0.15, 0.3, 0.3)],
  'pulse-1': [nz(400, 0, 0.8, 0.25, 1200), tri(110, 0, 0.8, 0.4, 150)],
  'pulse-2': [nz(300, 0, 1.2, 0.35, 900), tri(82, 0, 1.2, 0.6, 110), sq(110, 0.6, 0.5, 0.25, 90)],
  timeout: [sq(1568, 0, 0.12, 0.35), sq(1568, 0.2, 0.15, 0.35)],
  heartbeat: [tri(70, 0, 0.1, 0.8, 50), tri(65, 0.17, 0.12, 0.7, 45)],
```

- [ ] **Step 4: Motor de áudio**

Em `src/audio/engine.ts`: na interface `Audio`, acrescentar depois de `setHidden(hidden: boolean): void;`:

```ts
  /** 0 a 1: abafa só a música (ritmo: nível 2 do pulse). 1 = normal. */
  setDuck(factor: number): void;
```

dentro de `createAudio`, junto de `let hidden = false;`: `let duck = 1;`; trocar a linha do ganho da música em `applyGains`:

```ts
    backend.setGain('music', g.music * duck, rampSeconds);
```

e no objeto devolvido, depois de `setHidden`... (se `setHidden` for um método, acrescente depois dele):

```ts
    setDuck(factor) {
      duck = Math.min(1, Math.max(0, factor));
      if (unlocked) applyGains(0.2);
    },
```

- [ ] **Step 5: Decisões e hook**

Em `src/audio/gameAudio.ts`: acrescentar o import `import type { GameEvent, PlayerView, TeamKey } from '@pfl/engine';` (troque o import existente de `GameEvent, TeamKey`), `import { pressureFor } from '../rhythm/viewModel';` e, ao fim do arquivo:

```ts
/** Intervalo do batimento sob o nível 2 do pulse. */
export const HEARTBEAT_MS = 1200;
/** Fator da música quando o jogador está no nível 2, pressionado. */
export const DUCK_PRESSED_TIER_2 = 0.55;

/** Batimento: pressionado no nível 2, enquanto o jogador ainda precisa escolher. */
export function heartbeatActive(view: PlayerView | null, mode: PanelMode | null): boolean {
  if (!view || !mode || !mode.startsWith('PICK_')) return false;
  const { tier, youPressed } = pressureFor(view.rhythm, view.you);
  return youPressed && tier === 2;
}

export function duckFor(view: PlayerView | null): number {
  if (!view) return 1;
  const { tier, youPressed } = pressureFor(view.rhythm, view.you);
  return youPressed && tier === 2 ? DUCK_PRESSED_TIER_2 : 1;
}

/** Um timeout foi chamado quando a soma dos timeouts restantes diminui. `prev` null = primeira leitura. */
export function timeoutCalled(prev: number | null, next: number): boolean {
  return prev !== null && next < prev;
}
```

Em `src/audio/useGameAudio.ts`: trocar o import de `./gameAudio` por `import { HEARTBEAT_MS, duckFor, heartbeatActive, jingleFor, musicForScreen, planAnimationSound, timeoutCalled, turnStartCue } from './gameAudio';` e acrescentar, depois do efeito de "Aviso de vez" (o que usa `prevMode`), antes de "Erros":

```ts
  // Ritmo: batimento e música abafada sob o nível 2 do pulse, e o apito do timeout.
  const beating = screen === 'MATCH' && heartbeatActive(match.view, mode);
  useEffect(() => {
    if (!beating) return;
    audio.play('heartbeat');
    const id = setInterval(() => audio.play('heartbeat'), HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [beating]);

  const duck = screen === 'MATCH' ? duckFor(match.view) : 1;
  useEffect(() => {
    audio.setDuck(duck);
  }, [duck]);
  useEffect(() => () => audio.setDuck(1), []);

  const timeoutsLeft = match.view ? match.view.rhythm.timeouts.A + match.view.rhythm.timeouts.B : null;
  const lastTimeouts = useRef<number | null>(null);
  useEffect(() => {
    if (timeoutsLeft === null) {
      lastTimeouts.current = null;
      return;
    }
    if (timeoutCalled(lastTimeouts.current, timeoutsLeft)) audio.play('timeout');
    lastTimeouts.current = timeoutsLeft;
  }, [timeoutsLeft]);
```

- [ ] **Step 6: Documentação**

Em `docs/AUDIO.md`, depois da seção "Como funciona", acrescentar:

```md
## Sons do ritmo (zona e pulse)

`zone-enter` (capitão entra na zona), `zone-exit`, `zone-clash` (choque de capitães), `pulse-1` e `pulse-2` (a torcida aperta), `timeout` (apito) e `heartbeat` (batimento sob o nível 2). O batimento repete a cada 1,2 s enquanto o jogador pressionado escolhe, e a música cai para 55% (`Audio.setDuck`) nesse mesmo momento. Todos são sintetizados em `recipes.ts`.
```

- [ ] **Step 7: Rodar**

Run: `npx vitest run apps/client && npm run typecheck`
Expected: PASS. Se algum teste de áudio existente construir um objeto `Audio` literal sem `setDuck`, acrescente `setDuck: () => {}` a ele.

- [ ] **Step 8: Commit**

```bash
git add apps/client docs/AUDIO.md
git commit -m "feat(client/rhythm): cues do ritmo, música abafada, batimento e som do timeout" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: HUD: medidor de ritmo e fichas dos capitães

**Files:**
- Create: `src/screens/match/PulseGauge.tsx`, `src/screens/match/ZoneStrip.tsx`
- Modify: `src/screens/match/Hud.tsx`, `src/screens/match/MatchScreen.tsx`, `src/screens/match/match.css`
- Test: `test/pulse-gauge.test.tsx`, `test/zone-strip.test.tsx`, `test/css-platform.test.ts`

**Interfaces:**
- Consumes: `gaugeModel`, `zoneChips` (Task 2); `perkInfo` (Task 1); `Sprite`; `Animation.rhythmBefore` (Task 3).
- Produces: `<PulseGauge rhythm you names />`, `<ZoneStrip rhythm />`; `Hud` ganha a prop `rhythm: RhythmView`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `test/pulse-gauge.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PulseGauge } from '../src/screens/match/PulseGauge';
import { makeRhythm } from './fixtures';

afterEach(cleanup);
const names = { A: 'Trovões', B: 'Pedreiras' };

describe('<PulseGauge>', () => {
  it('neutro: zero dos dois lados e meter com texto acessível', () => {
    const { container } = render(<PulseGauge rhythm={makeRhythm()} you="A" names={names} />);
    expect(container.querySelector('.pulse-end-A')!.textContent).toBe('0');
    expect(container.querySelector('.pulse-end-B')!.textContent).toBe('0');
    const meter = screen.getByRole('meter');
    expect(meter.getAttribute('aria-valuenow')).toBe('0');
    expect(meter.getAttribute('aria-valuetext')).toBe('Momentum neutro');
    expect(container.firstElementChild!.className).toContain('is-tier-0');
    expect(screen.getByRole('status').textContent).toBe('Equilíbrio.');
  });

  it('momentum do A: preenche a metade do A, mostra o valor e o nível', () => {
    const { container } = render(<PulseGauge rhythm={makeRhythm({ momentum: 65, dominant: 'A', tier: 1 })} you="B" names={names} />);
    expect(container.querySelector('.pulse-end-A')!.textContent).toBe('65');
    expect(container.querySelector('.pulse-half-A')!.getAttribute('style')).toContain('--r: 0.65');
    expect(container.querySelector('.pulse-half-B')!.getAttribute('style')).toContain('--r: 0');
    expect(container.firstElementChild!.className).toContain('is-tier-1');
    expect(screen.getByRole('meter').getAttribute('aria-valuetext')).toBe('Momentum 65 a favor de Trovões, nível 1');
  });

  it('nível 2 pressionado: marca a classe e usa o texto de caldeirão', () => {
    const { container } = render(<PulseGauge rhythm={makeRhythm({ momentum: -90, dominant: 'B', tier: 2 })} you="A" names={names} />);
    expect(container.firstElementChild!.className).toContain('is-tier-2');
    expect(container.firstElementChild!.className).toContain('is-pressed-you');
    expect(screen.getByRole('status').textContent).toContain('Caldeirão hostil contra você');
  });
});
```

Criar `test/zone-strip.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ZoneStrip } from '../src/screens/match/ZoneStrip';
import { makeRhythm } from './fixtures';

afterEach(cleanup);

const withCaptains = () =>
  makeRhythm({
    captains: {
      A: { offense: { species: 63, xFactor: 'TELEPATHIC_POCKET', progress: 1, inZone: false }, defense: null },
      B: { offense: null, defense: { species: 95, xFactor: 'INTIMIDATE_RUSH', progress: 2, inZone: true } },
    },
  });

describe('<ZoneStrip>', () => {
  it('não renderiza nada sem capitães', () => {
    const { container } = render(<ZoneStrip rhythm={makeRhythm()} />);
    expect(container.firstChild).toBeNull();
  });

  it('mostra o progresso em texto e a zona com o nome do perk', () => {
    const { container } = render(<ZoneStrip rhythm={withCaptains()} />);
    const chips = container.querySelectorAll('.zone-chip');
    expect(chips).toHaveLength(2);
    expect(chips[0].textContent).toContain('progresso 1 de 2');
    expect(chips[0].className).not.toContain('is-in-zone');
    expect(chips[1].className).toContain('is-in-zone');
    expect(chips[1].textContent).toContain('Intimidate Rush');
    expect(chips[1].textContent).toContain('na zona');
  });

  it('o clique abre e fecha a descrição do perk', () => {
    render(<ZoneStrip rhythm={withCaptains()} />);
    const chip = screen.getAllByRole('button')[0];
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('tooltip').textContent).toContain('A leitura certa da defesa vale como neutra.');
    expect(screen.getByRole('tooltip').textContent).toContain('2 passes completos seguidos');
    fireEvent.click(chip);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('Escape fecha a descrição', () => {
    render(<ZoneStrip rhythm={withCaptains()} />);
    const chip = screen.getAllByRole('button')[0];
    fireEvent.click(chip);
    fireEvent.keyDown(chip, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
```

Em `test/css-platform.test.ts`, ao fim do arquivo, acrescentar:

```ts
describe('animações do ritmo', () => {
  /** true se toda ocorrência de `needle` (fora de @keyframes) está dentro de uma @media que case `media`. */
  function onlyInside(css: string, needle: RegExp, media: RegExp): boolean {
    const stack: string[] = [];
    let header = '';
    let ok = true;
    let depthLine = '';
    for (const ch of stripComments(css)) {
      if (ch === '{') {
        stack.push(header.trim());
        header = '';
        depthLine = '';
      } else if (ch === '}') {
        stack.pop();
        header = '';
        depthLine = '';
      } else if (ch === ';') {
        const declaration = depthLine;
        const inKeyframes = stack.some((s) => s.startsWith('@keyframes'));
        if (!inKeyframes && needle.test(declaration) && !stack.some((s) => media.test(s))) ok = false;
        header = '';
        depthLine = '';
      } else {
        header += ch;
        depthLine += ch;
      }
    }
    return ok;
  }

  const match = cssFiles().find((f) => f.file.endsWith('screens/match/match.css'))!.css;

  it('os detectores do próprio teste funcionam', () => {
    expect(onlyInside('.a { animation: x 1s; }', /animation:.*\bx\b/, /no-preference/)).toBe(false);
    expect(onlyInside('@media (prefers-reduced-motion: no-preference) { .a { animation: x 1s; } }', /animation:.*\bx\b/, /no-preference/)).toBe(true);
  });

  it.each(['hostile-shake'])('%s só é usada dentro de prefers-reduced-motion: no-preference', (name) => {
    expect(match).toContain(name);
    expect(onlyInside(match, new RegExp(`animation:.*\\b${name}\\b`), /prefers-reduced-motion:\s*no-preference/)).toBe(true);
  });

  it('a transição do medidor só existe dentro de no-preference', () => {
    expect(onlyInside(match, /transition:.*steps/, /prefers-reduced-motion:\s*no-preference/)).toBe(true);
  });
});
```

(confira que `cssFiles` e `stripComments` já estão importados no topo do arquivo; estão.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/pulse-gauge.test.tsx apps/client/test/zone-strip.test.tsx apps/client/test/css-platform.test.ts`
Expected: FAIL (componentes não existem; `hostile-shake` ainda não está no CSS).

- [ ] **Step 3: `PulseGauge.tsx`**

```tsx
import type { CSSProperties } from 'react';
import type { RhythmView, TeamKey } from '@pfl/engine';
import { gaugeModel } from '../../rhythm/viewModel';
import './match.css';

interface Props {
  rhythm: RhythmView;
  you: TeamKey;
  names: Record<TeamKey, string>;
}

/** Medidor de ritmo (momentum) entre o placar e os segmentos do HUD: A cresce para a esquerda, B para a direita. */
export function PulseGauge({ rhythm, you, names }: Props) {
  const g = gaugeModel(rhythm, you, names);
  return (
    <div className={`hud-pulse is-tier-${g.tier}${g.youPressed ? ' is-pressed-you' : ''}`}>
      <span className="pulse-end pulse-end-A">{g.valueA}</span>
      <div
        className="pulse-track"
        role="meter"
        aria-label="Momentum"
        aria-valuemin={-100}
        aria-valuemax={100}
        aria-valuenow={rhythm.momentum}
        aria-valuetext={g.valueText}
      >
        <span className="pulse-half pulse-half-A" style={{ '--r': g.ratioA } as CSSProperties} />
        <span className="pulse-half pulse-half-B" style={{ '--r': g.ratioB } as CSSProperties} />
        {[10, 25, 75, 90].map((at) => (
          <span key={at} className={`pulse-notch${at === 10 || at === 90 ? ' is-tier-2-mark' : ''}`} style={{ left: `${at}%` }} aria-hidden="true" />
        ))}
      </div>
      <span className="pulse-end pulse-end-B">{g.valueB}</span>
      <p className="pulse-status" role="status">
        {g.statusText}
      </p>
    </div>
  );
}
```

- [ ] **Step 4: `ZoneStrip.tsx`**

```tsx
import { useId, useState } from 'react';
import type { RhythmView } from '@pfl/engine';
import { Sprite } from '../../components/Sprite';
import { perkInfo } from '../../lib/perks';
import { POSITION_LABELS, speciesName } from '../../lib/names';
import { zoneChips, type ZoneChip } from '../../rhythm/viewModel';
import './match.css';

function Chip({ chip }: { chip: ZoneChip }) {
  const [open, setOpen] = useState(false);
  const tipId = useId();
  const info = perkInfo(chip.xFactor);
  const done = Math.min(2, chip.progress);
  return (
    <li className={`zone-item zone-item-${chip.team}`}>
      <button
        type="button"
        className={`zone-chip${chip.inZone ? ' is-in-zone' : ''}`}
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      >
        <Sprite id={chip.species} view={chip.side === 'offense' ? 'back' : 'front'} size={24} />
        <span className="zone-role">{chip.side === 'offense' ? 'Ataque' : 'Defesa'}</span>
        <span className="zone-pips" aria-hidden="true">
          {'●'.repeat(done)}
          {'○'.repeat(2 - done)}
        </span>
        <span className="sr-only">
          {speciesName(chip.species)}, progresso {chip.progress} de 2{chip.inZone ? ', na zona' : ''}
        </span>
        {chip.inZone && <span className="zone-perk">{info.name}</span>}
      </button>
      {open && (
        <div className="zone-tip" role="tooltip" id={tipId}>
          <h4 className="zone-tip-title">{info.name}</h4>
          <p>
            {speciesName(chip.species)}, {POSITION_LABELS[info.position]}
          </p>
          <p>Entra na zona: {info.trigger}.</p>
          <p>{info.effect}</p>
        </div>
      )}
    </li>
  );
}

/** Fichas dos capitães com o progresso para a zona. Some quando nenhum time tem capitão. */
export function ZoneStrip({ rhythm }: { rhythm: RhythmView }) {
  const chips = zoneChips(rhythm);
  if (chips.length === 0) return null;
  return (
    <ul className="zone-strip" aria-label="Capitães">
      {chips.map((c) => (
        <Chip key={`${c.team}:${c.side}`} chip={c} />
      ))}
    </ul>
  );
}
```

- [ ] **Step 5: HUD e tela**

Em `src/screens/match/Hud.tsx`: importar `RhythmView` (junto de `PlayerView, TeamKey`), `PulseGauge` e `ZoneStrip`; acrescentar `rhythm: RhythmView;` a `Props`; desestruturar `rhythm` e, entre o `</div>` de `hud-board` e `<div className="hud-segments">`, inserir:

```tsx
      <PulseGauge rhythm={rhythm} you={view.you} names={names} />
      <ZoneStrip rhythm={rhythm} />
```

Em `src/screens/match/MatchScreen.tsx`, depois de `const animating = mode === 'ANIMATING';` não há `view` ainda garantido; depois do `if (!view) return ...` e de `const levels = ...`, acrescentar:

```tsx
  // A view final já chegou no começo da animação; o ritmo mostrado só muda quando ela acaba.
  const rhythm = animating && state.animation?.rhythmBefore ? state.animation.rhythmBefore : view.rhythm;
```

e passar `rhythm={rhythm}` ao `<Hud ... />`.

- [ ] **Step 6: CSS**

Em `src/screens/match/match.css`, antes do bloco `/* ================= aviso, campo e banner ================= */`, acrescentar:

```css
/* ================= ritmo: medidor e fichas dos capitães ================= */
.hud-pulse {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2) var(--space-2);
  border-top: 3px solid var(--gbc-paper);
}

.pulse-end {
  min-width: 2ch;
  font-family: var(--font-display);
  font-size: var(--fs-sm);
  line-height: 1;
  color: var(--gbc-paper);
}
.pulse-end-A { text-align: right; }

/* 40 células de 5 pontos; o zero fica no centro. Os cortes entre células são tinta, sem blur. */
.pulse-track {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  height: 14px;
  background: var(--gbc-border);
  border: 2px solid var(--gbc-paper);
}

.pulse-track::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    90deg,
    transparent 0,
    transparent calc(2.5% - 2px),
    var(--gbc-ink) calc(2.5% - 2px),
    var(--gbc-ink) 2.5%
  );
}

.pulse-half {
  background: var(--pulse);
  transform: scaleX(var(--r, 0));
}
.pulse-half-A { transform-origin: right center; }
.pulse-half-B { transform-origin: left center; }

/* limiares 50 e 80 (marcas mais altas) de cada lado */
.pulse-notch {
  position: absolute;
  top: -4px;
  bottom: -4px;
  width: 2px;
  background: var(--gbc-paper);
}
.pulse-notch.is-tier-2-mark { top: -6px; bottom: -6px; width: 3px; }

/* nível 2: padrão listrado e trilha tracejada (o nível não depende só de cor) */
.hud-pulse.is-tier-2 .pulse-track { border-style: dashed; }
.hud-pulse.is-tier-2 .pulse-half {
  background: repeating-linear-gradient(45deg, var(--pulse) 0 4px, var(--gbc-ink) 4px 6px);
}
.hud-pulse.is-pressed-you .pulse-status { color: var(--pulse); }

.pulse-status {
  grid-column: 1 / -1;
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--fs-body-sm);
  line-height: 1.4;
  color: var(--gbc-paper);
}

@media (prefers-reduced-motion: no-preference) {
  .pulse-half { transition: transform 300ms steps(6); }
}

.zone-strip {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
  list-style: none;
  margin: 0;
  padding: 0 var(--space-2) var(--space-2);
}

.zone-item { position: relative; min-width: 0; }
.zone-item-B { margin-left: auto; }

.zone-chip {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--hit-min);
  padding: 2px var(--space-2);
  background: var(--gbc-ink);
  color: var(--gbc-paper);
  border: 3px solid var(--gbc-paper);
  font-family: var(--font-body);
  font-size: var(--fs-body-sm);
  cursor: pointer;
}

.zone-chip.is-in-zone { background: var(--pulse); color: var(--pulse-ink); border-color: var(--pulse-ink); }
.zone-role { font-family: var(--font-display); font-size: var(--fs-xs); }
.zone-pips { letter-spacing: 2px; }
.zone-perk { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.zone-tip {
  position: absolute;
  z-index: 5;
  top: 100%;
  left: 0;
  width: min(280px, 86vw);
  margin-top: var(--space-1);
  padding: var(--space-2) var(--space-3);
  background: var(--gbc-ink);
  color: var(--gbc-paper);
  border: var(--border);
  box-shadow: var(--shadow);
  font-family: var(--font-body);
  font-size: var(--fs-body-sm);
  line-height: 1.45;
}
.zone-item-B .zone-tip { left: auto; right: 0; }
.zone-tip p { margin: 0 0 var(--space-1); }
.zone-tip-title { margin: 0 0 var(--space-1); font-family: var(--font-display); font-size: var(--fs-xs); color: var(--gbc-yellow); }

/* celular estreito: só sprite, papel e pontos; o nome do perk fica na descrição */
@media (max-width: 599px) {
  .zone-perk { display: none; }
}

/* tremor curto no início do PLAYCALL de quem está no nível 2 do pulse (uma rajada, nunca contínuo) */
@media (prefers-reduced-motion: no-preference) {
  .match-field.hostile-shake { animation: hostile-shake 240ms steps(4, end) 1; }
}

@keyframes hostile-shake {
  0% { transform: translateX(0); }
  25% { transform: translateX(-2px); }
  50% { transform: translateX(2px); }
  75% { transform: translateX(-1px); }
  100% { transform: translateX(0); }
}
```

- [ ] **Step 7: Rodar**

Run: `npx vitest run apps/client && npm run typecheck`
Expected: PASS. `form-font-size`, `contrast` e `mobile-first` continuam verdes; se `mobile-first.test.ts` reclamar de alguma regra nova (ex.: alvo de toque), ajuste o CSS à regra, não o teste.

- [ ] **Step 8: Commit**

```bash
git add apps/client
git commit -m "feat(client/rhythm): medidor de ritmo e fichas dos capitães no HUD" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Pressão sobre o jogador e botão de timeout

**Files:**
- Create: `src/app/useBurst.ts`, `src/screens/match/TimeoutButton.tsx`
- Modify: `src/components/CardTile.tsx`, `src/components/ui.css`, `src/screens/match/CardHand.tsx`, `src/screens/match/MatchScreen.tsx`, `src/screens/match/match.css`, `src/App.tsx`
- Test: `test/use-burst.test.tsx`, `test/timeout-button.test.tsx`, `test/card-fog.test.tsx`

**Interfaces:**
- Consumes: `shakeActive`, `foggedCardKey`, `timeoutState` (Task 2); `play:timeout` (Parte 1).
- Produces: `useBurst(key: string | null, ms: number): boolean`; `<TimeoutButton view animating onTimeout />`; `CardTile` prop `fogged?: boolean`; `CardHand` prop `fogKey?: string | null`; `MatchScreen` prop `onTimeout: () => void`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `test/use-burst.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useBurst } from '../src/app/useBurst';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useBurst', () => {
  it('liga por N ms quando a chave aparece e desliga sozinho', () => {
    const { result, rerender } = renderHook(({ k }: { k: string | null }) => useBurst(k, 240), { initialProps: { k: null as string | null } });
    expect(result.current).toBe(false);
    rerender({ k: '7' });
    expect(result.current).toBe(true);
    act(() => void vi.advanceTimersByTime(239));
    expect(result.current).toBe(true);
    act(() => void vi.advanceTimersByTime(2));
    expect(result.current).toBe(false);
  });

  it('a mesma chave não repete; outra chave dispara de novo; null desliga na hora', () => {
    const { result, rerender } = renderHook(({ k }: { k: string | null }) => useBurst(k, 240), { initialProps: { k: '7' as string | null } });
    act(() => void vi.advanceTimersByTime(300));
    rerender({ k: '7' });
    expect(result.current).toBe(false);
    rerender({ k: '8' });
    expect(result.current).toBe(true);
    rerender({ k: null });
    expect(result.current).toBe(false);
  });
});
```

Criar `test/timeout-button.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TimeoutButton } from '../src/screens/match/TimeoutButton';
import { makeRhythm, makeView } from './fixtures';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const view = (over = {}) => makeView({ phase: 'FORMATION', you: 'A', ...over });

describe('<TimeoutButton>', () => {
  it('mostra a contagem e exige dois cliques', () => {
    const onTimeout = vi.fn();
    render(<TimeoutButton view={view()} animating={false} onTimeout={onTimeout} />);
    const button = screen.getByRole('button');
    expect(button.textContent).toBe('Timeout (2)');
    fireEvent.click(button);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(button.textContent).toBe('Confirmar timeout?');
    expect(screen.getByText('Sem efeito agora. Guarde o timeout.')).toBeTruthy();
    fireEvent.click(button);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(button.textContent).toBe('Timeout (2)');
  });

  it('desarma sozinho depois de 3 s', () => {
    const onTimeout = vi.fn();
    render(<TimeoutButton view={view()} animating={false} onTimeout={onTimeout} />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    act(() => void vi.advanceTimersByTime(3100));
    expect(button.textContent).toBe('Timeout (2)');
    fireEvent.click(button);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('explica o efeito quando o adversário lidera', () => {
    render(<TimeoutButton view={view({ rhythm: makeRhythm({ momentum: -70, dominant: 'B', tier: 1 }) })} animating={false} onTimeout={() => {}} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Corta o momentum dele pela metade.')).toBeTruthy();
  });

  it.each([
    ['em PLAYCALL', { phase: 'PLAYCALL' }, false, 'Disponível entre as jogadas'],
    ['durante a animação', {}, true, 'Disponível entre as jogadas'],
    ['sem timeouts', { rhythm: makeRhythm({ timeouts: { A: 0, B: 2 } }) }, false, 'Sem timeouts'],
    ['já usado no snap', { rhythm: makeRhythm({ calledThisSnap: { A: true, B: false } }) }, false, 'Você já chamou timeout neste snap'],
  ] as const)('desabilitado %s: não envia e diz o motivo', (_name, over, animating, reason) => {
    const onTimeout = vi.fn();
    render(<TimeoutButton view={view(over)} animating={animating} onTimeout={onTimeout} />);
    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText(reason)).toBeTruthy();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
```

Criar `test/card-fog.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { getCard } from '@pfl/engine';
import { CardTile } from '../src/components/CardTile';
import { CardHand } from '../src/screens/match/CardHand';
import { makeRhythm, makeView } from './fixtures';

afterEach(cleanup);

describe('névoa tática', () => {
  it('a carta sob névoa troca os detalhes do tooltip por um aviso, mas continua jogável', () => {
    const card = getCard('electric_thunder_screen');
    const { container } = render(<CardTile card={card} fogged onClick={() => {}} />);
    const tip = container.querySelector('[role="tooltip"]')!;
    expect(tip.textContent).toContain('Névoa tática: detalhes ocultos nesta jogada.');
    expect(tip.textContent).not.toContain('Requisitos');
    expect(container.querySelector('.card-fog')!.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.card-face')!.getAttribute('aria-disabled')).toBeNull();
  });

  it('sem névoa o tooltip é o de sempre', () => {
    const { container } = render(<CardTile card={getCard('electric_thunder_screen')} onClick={() => {}} />);
    expect(container.querySelector('[role="tooltip"]')!.textContent).toContain('Requisitos');
    expect(container.querySelector('.card-fog')).toBeNull();
  });

  it('CardHand aplica a névoa só na carta indicada por fogKey', () => {
    const view = makeView({
      phase: 'PLAYCALL', hand: ['electric_thunder_screen', 'normal_tackle'], playable: ['electric_thunder_screen', 'normal_tackle', 'basic_run'],
      rhythm: makeRhythm({ momentum: -60, dominant: 'B', tier: 1 }),
    });
    const { container } = render(<CardHand view={view} canPick={() => true} onPick={() => {}} fogKey="hand-1-normal_tackle" />);
    const fogged = container.querySelectorAll('.card-fog');
    expect(fogged).toHaveLength(1);
    expect(fogged[0].closest('.card-tile')!.textContent).toContain(getCard('normal_tackle').name);
    expect(screen.getAllByRole('tooltip').filter((t) => t.textContent?.includes('Névoa tática'))).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/use-burst.test.tsx apps/client/test/timeout-button.test.tsx apps/client/test/card-fog.test.tsx`
Expected: FAIL (módulos e props não existem).

- [ ] **Step 3: `useBurst.ts`**

```ts
import { useEffect, useState } from 'react';

/** Liga por `ms` quando `key` aparece ou muda; `null` desliga na hora. A mesma chave não dispara de novo. */
export function useBurst(key: string | null, ms: number): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (key === null) {
      setOn(false);
      return;
    }
    setOn(true);
    const id = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(id);
  }, [key, ms]);
  return on;
}
```

- [ ] **Step 4: `TimeoutButton.tsx`**

```tsx
import { useEffect, useState } from 'react';
import type { PlayerView } from '@pfl/engine';
import { timeoutState } from '../../rhythm/viewModel';
import './match.css';

/** Tempo que o botão fica armado esperando a confirmação. */
export const ARM_MS = 3000;

interface Props {
  view: PlayerView;
  animating: boolean;
  onTimeout: () => void;
}

/** Timeout do técnico: dois passos (armar e confirmar), só entre as jogadas. */
export function TimeoutButton({ view, animating, onTimeout }: Props) {
  const state = timeoutState(view, animating);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), ARM_MS);
    return () => clearTimeout(id);
  }, [armed]);
  useEffect(() => {
    if (!state.enabled) setArmed(false);
  }, [state.enabled]);

  const click = () => {
    if (!state.enabled) return;
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    onTimeout();
  };

  const left = view.rhythm.timeouts[view.you];
  return (
    <div className="timeout">
      <button type="button" className={`btn btn-small${armed ? ' is-armed' : ''}`} aria-disabled={!state.enabled || undefined} onClick={click}>
        {armed ? 'Confirmar timeout?' : `Timeout (${left})`}
      </button>
      {!state.enabled && <span className="muted timeout-note">{state.reason}</span>}
      {state.enabled && armed && <span className="timeout-note">{state.effect}</span>}
    </div>
  );
}
```

- [ ] **Step 5: Névoa no `CardTile` e na mão**

Em `src/components/CardTile.tsx`: acrescentar a prop `fogged?: boolean;` em `Props` com o comentário `/** névoa tática (ritmo): os detalhes do tooltip ficam ocultos nesta jogada */`, desestruturá-la (`fogged = false`) e trocar o conteúdo do tooltip. Substituir o bloco de `<div className="card-tooltip" ...>` até o `<div className="card-sheet-actions">` (o título, os `<p>`/`<ul>`) por:

```tsx
      <div className="card-tooltip" role="tooltip" id={tipId}>
        <h4 className="card-tooltip-title">{info.name}</h4>
        {fogged ? (
          <>
            <p className="card-fog" aria-hidden="true">
              ░▒▓░▒▓░▒▓░▒▓
            </p>
            <p>Névoa tática: detalhes ocultos nesta jogada.</p>
          </>
        ) : (
          <>
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
          </>
        )}
```

mantendo o `<div className="card-sheet-actions">…</div></div>` seguinte como está.

Em `src/components/ui.css`, acrescentar:

```css
/* névoa tática: estática no lugar dos detalhes; só texto, sem animação */
.card-fog {
  margin: 0;
  letter-spacing: 2px;
  color: var(--gbc-muted);
  word-break: break-all;
}
```

Em `src/screens/match/CardHand.tsx`: acrescentar `fogKey?: string | null;` a `Props`, desestruturar `fogKey = null` e passar `fogged={entry.key === fogKey}` ao `<CardTile ... />`.

- [ ] **Step 6: Integração na tela e no `App`**

Em `src/screens/match/MatchScreen.tsx`:

- imports: `import { useBurst } from '../../app/useBurst';`, `import { TimeoutButton } from './TimeoutButton';`, `import { foggedCardKey, shakeActive } from '../../rhythm/viewModel';`
- `Props`: acrescentar `onTimeout: () => void;` e desestruturar no componente.
- Hooks devem ficar antes do `if (!view) return`. Logo depois dos outros `useMemo`/`useEffect` (antes do `if (!view)`), acrescentar:

```tsx
  const shaking = useBurst(view && !animating && shakeActive(view) ? String(view.turnId) : null, 240);
```

- Trocar `<section className="match-field">` por `<section className={`match-field${shaking ? ' hostile-shake' : ''}`}>`.
- No `case 'PICK_CARD'`, passar `fogKey={foggedCardKey(view)}` ao `<CardHand ... />`.
- Em `.match-tools`, depois do botão "Depth chart" e antes do `{view.canEditDepth && ...}`, inserir `<TimeoutButton view={view} animating={animating} onTimeout={onTimeout} />`.

Em `src/App.tsx`, junto de `sendConversion`, acrescentar:

```tsx
  const sendTimeout = () => {
    const m = matchRef.current;
    if (!m.view) return;
    emitIfConnected(socket, 'play:timeout', { turnId: m.view.turnId });
  };
```

e passar `onTimeout={sendTimeout}` ao `<MatchScreen ... />` (linha ~292, junto de `onConversion`).

Em `src/screens/match/match.css`, acrescentar ao fim do bloco do painel de decisão (depois de `.match-panel {...}`):

```css
.timeout { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.timeout .btn.is-armed { background: var(--pulse); color: var(--pulse-ink); }
.timeout-note { font-family: var(--font-body); font-size: var(--fs-body-sm); }
```

- [ ] **Step 7: Rodar**

Run: `npx vitest run apps/client && npm run typecheck`
Expected: PASS. O `.btn` com `aria-disabled` deve ficar com aparência de desabilitado: se o estilo atual só cobre `:disabled`, acrescente `.btn[aria-disabled='true'] { opacity: 0.5; cursor: not-allowed; }` em `ui.css` (confira primeiro se já existe).

- [ ] **Step 8: Commit**

```bash
git add apps/client
git commit -m "feat(client/rhythm): tremor, névoa tática e botão de timeout de dois passos" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Campo: aura e faixas de zona, clash e pulse

**Files:**
- Create: `src/phaser/zoneFx.ts`
- Modify: `src/phaser/FieldScene.ts`
- Test: `test/zone-fx.test.ts`, `test/field-scene.test.ts`

**Interfaces:**
- Consumes: `Stage.auras` (Task 3); passos `ZONE`, `ZONE_CLASH`, `PULSE` (Task 4).
- Produces (`zoneFx.ts`, puro): `AURA_KEYS`, `AURA_FRAME_MS`, `hasAura(stage, side, id): boolean`, `zoneBannerText(name): string`, `pulseBannerText(tier): string`, `CLASH_BANNER`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `test/zone-fx.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Stage } from '../src/match/matchState';
import { AURA_FRAME_MS, AURA_KEYS, CLASH_BANNER, hasAura, pulseBannerText, zoneBannerText } from '../src/phaser/zoneFx';

const stage = (over: Partial<Stage> = {}): Stage => ({
  turnId: 1, offenseTeam: 'A', ballOn: 50, yardsToGo: 10, lineups: { offense: {}, defense: {} }, fatigue: { A: {}, B: {} }, ...over,
});

describe('hasAura', () => {
  const auras = [
    { team: 'A', side: 'offense', id: 63 },
    { team: 'B', side: 'defense', id: 66 },
  ] as const;

  it('vale para o time que está de fato naquele lado', () => {
    expect(hasAura(stage({ auras: [...auras] }), 'offense', 63)).toBe(true);
    expect(hasAura(stage({ auras: [...auras] }), 'defense', 66)).toBe(true);
  });

  it('a mesma espécie do outro time não ganha aura', () => {
    // B ataca: o lado "offense" é do B, então a aura do A (offense, 63) não vale
    expect(hasAura(stage({ offenseTeam: 'B', auras: [...auras] }), 'offense', 63)).toBe(false);
    expect(hasAura(stage({ offenseTeam: 'B', auras: [...auras] }), 'defense', 66)).toBe(false);
    expect(hasAura(stage({ offenseTeam: 'B', auras: [{ team: 'B', side: 'offense', id: 63 }] }), 'offense', 63)).toBe(true);
  });

  it('sem auras, nada', () => {
    expect(hasAura(stage(), 'offense', 63)).toBe(false);
  });
});

describe('textos e constantes', () => {
  it('faixas sem travessão', () => {
    expect(zoneBannerText('Dragonite')).toBe('NA ZONA: DRAGONITE');
    expect(pulseBannerText(1)).toBe('PRESSÃO TÁTICA');
    expect(pulseBannerText(2)).toBe('CALDEIRÃO HOSTIL');
    expect(CLASH_BANNER).toBe('CHOQUE DE CAPITÃES');
    for (const t of [zoneBannerText('x'), pulseBannerText(1), pulseBannerText(2), CLASH_BANNER]) expect(t).not.toMatch(/[—–]/);
  });

  it('a aura tem dois quadros de 360 ms', () => {
    expect(AURA_KEYS).toHaveLength(2);
    expect(AURA_FRAME_MS).toBe(360);
  });
});
```

Em `test/field-scene.test.ts`:

1. Em `fakeScene()`, trocar `scene.time = { removeAllEvents: () => {}, delayedCall: () => {} };` por:

```ts
  const delayed: { ms: number; fn: () => void }[] = [];
  const loops: { delay: number; callback: () => void }[] = [];
  scene.time = {
    removeAllEvents: () => {},
    delayedCall: (ms: number, fn: () => void) => delayed.push({ ms, fn }),
    addEvent: (cfg: { delay: number; callback: () => void }) => loops.push(cfg),
  };
```

e acrescentar `delayed, loops` ao objeto devolvido no fim de `fakeScene()` (`return { scene, created, of, texts, loadImages, loaded, delayed, loops };`).

2. O teste existente "gera as texturas de grama e de zona de gol no código" passa a ver as duas texturas novas. Trocar a asserção por:

```ts
    expect(generated).toEqual([['grass-noise', 32, 32], ['endzone-stripes', 16, 16], ['zone-aura-0', 32, 32], ['zone-aura-1', 32, 32]]);
```

3. Ao fim do arquivo, acrescentar (usa o `t` e o `stage()` do arquivo):

```ts
describe('FieldScene: zona e ritmo', () => {
  const withAura = (over: Partial<Stage> = {}): Stage => stage({ auras: [{ team: 'A', side: 'offense', id: 63 }], ...over });
  const auraImages = () => t.of('image').filter((c) => String(c.args[2]).startsWith('zone-aura'));
  const banner = () => t.created.find((c) => c.kind === 'text' && c.args[2] === '')!;
  const bannerTexts = () => banner().calls.filter((c) => c.method === 'setText').map((c) => c.args[0]);

  it('liga o loop de 2 quadros da aura (360 ms) quando há movimento', () => {
    t.scene.create();
    t.scene.sync(withAura(), null);
    expect(t.loops.some((l) => l.delay === 360)).toBe(true);
  });

  it('cria a aura só no capitão indicado, atrás do sprite', () => {
    t.scene.create();
    t.scene.sync(withAura(), null);
    expect(auraImages()).toHaveLength(1);
    const container = t.of('container')[0];
    expect(container.calls.some((c) => c.method === 'addAt')).toBe(true);
  });

  it('a mesma espécie do time que não está naquele lado não ganha aura', () => {
    t.scene.create();
    t.scene.sync(withAura({ offenseTeam: 'B' }), null);
    expect(auraImages()).toHaveLength(0);
  });

  it('sem auras no estágio, nenhuma imagem de aura', () => {
    t.scene.create();
    t.scene.sync(stage(), null);
    expect(auraImages()).toHaveLength(0);
  });

  it('os passos ZONE, ZONE_CLASH e PULSE mostram a faixa com o texto certo', () => {
    t.scene.create();
    const steps = [
      { kind: 'ZONE', team: 'A', side: 'offense', species: 63, xFactor: 'TELEPATHIC_POCKET', enter: true, at: 0, duration: 600 },
      { kind: 'ZONE_CLASH', offense: 63, defense: 95, at: 600, duration: 600 },
      { kind: 'PULSE', dominant: 'A', tier: 2, at: 1200, duration: 500 },
    ] as AnimStep[];
    t.scene.sync(withAura(), { seq: 1, stage: stage(), steps });
    for (const d of t.delayed.splice(0)) d.fn();
    expect(bannerTexts()).toEqual(['NA ZONA: ABRA', 'CHOQUE DE CAPITÃES', 'CALDEIRÃO HOSTIL']);
    // a entrada na zona acende a aura do capitão que ainda não tinha
    expect(auraImages()).toHaveLength(1);
  });

  it('o passo ZONE de saída apaga a aura', () => {
    t.scene.create();
    const steps = [{ kind: 'ZONE', team: 'A', side: 'offense', species: 63, xFactor: null, enter: false, at: 0, duration: 200 }] as AnimStep[];
    t.scene.sync(withAura(), { seq: 1, stage: withAura(), steps });
    const aura = auraImages()[0];
    for (const d of t.delayed.splice(0)) d.fn();
    expect(aura.calls.map((c) => c.method)).toContain('destroy');
  });
});
```

Acrescentar no topo do arquivo `import type { AnimStep } from '../src/match/timeline';` (junto do `import type { Stage }`). Os nomes `t.created`, `t.delayed` e `t.loops` vêm do retorno de `fakeScene()` ajustado no item 1. No teste da faixa, `speciesName(63)` deve render "Abra"; se for diferente, ajuste o texto esperado ao nome real.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/zone-fx.test.ts apps/client/test/field-scene.test.ts`
Expected: FAIL.

- [ ] **Step 3: `zoneFx.ts`**

```ts
import type { PulseTier } from '@pfl/engine';
import type { Stage } from '../match/matchState';

export const AURA_KEYS = ['zone-aura-0', 'zone-aura-1'] as const;
/** cada quadro da aura dura 360 ms */
export const AURA_FRAME_MS = 360;
export const CLASH_BANNER = 'CHOQUE DE CAPITÃES';

type Side = 'offense' | 'defense';
const other = (k: 'A' | 'B'): 'A' | 'B' => (k === 'A' ? 'B' : 'A');

/** O jogador (lado + espécie) tem aura? Confere o time: o lado "offense" é do time que ataca no estágio. */
export function hasAura(stage: Stage, side: Side, id: number): boolean {
  const team = side === 'offense' ? stage.offenseTeam : other(stage.offenseTeam);
  return (stage.auras ?? []).some((a) => a.team === team && a.side === side && a.id === id);
}

export const zoneBannerText = (name: string): string => `NA ZONA: ${name.toUpperCase()}`;
export const pulseBannerText = (tier: PulseTier): string => (tier === 2 ? 'CALDEIRÃO HOSTIL' : 'PRESSÃO TÁTICA');
```

- [ ] **Step 4: `FieldScene.ts`**

Importar: `import { AURA_FRAME_MS, AURA_KEYS, CLASH_BANNER, hasAura, pulseBannerText, zoneBannerText } from './zoneFx';`

1. `interface PlayerSprite`: acrescentar `aura?: Phaser.GameObjects.Image;`.
2. Campos: `private auraFrame = 0;`
3. Em `create()`, depois de `this.makeTextures();`: `this.makeAuraTextures();`
4. Novo método (junto de `makeTextures`):

```ts
  /** Duas imagens da aura da zona (anéis de pixels em elipse, deslocados entre os quadros), sem asset. */
  private makeAuraTextures(): void {
    AURA_KEYS.forEach((key, frame) => {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      const rings: [number, number, number][] = [
        [15, 6, 0xf8d030],
        [11, 4.5, 0xf8f8f0],
        [7, 3, 0xf8d030],
      ];
      for (const [rx, ry, color] of rings) {
        for (let a = 0; a < 360; a += 12) {
          const rad = ((a + frame * 6) * Math.PI) / 180;
          const x = Math.round((16 + Math.cos(rad) * rx) / 2) * 2;
          const y = Math.round((16 + Math.sin(rad) * ry) / 2) * 2;
          g.fillStyle(color, 1).fillRect(x, y, 2, 2);
        }
      }
      g.generateTexture(key, 32, 32);
      g.destroy();
    });
  }

  /** Alterna os dois quadros de todas as auras. Com movimento reduzido o loop nem começa. */
  private startAuraLoop(): void {
    if (this.reduced) return;
    this.time.addEvent({
      delay: AURA_FRAME_MS,
      loop: true,
      callback: () => {
        this.auraFrame = (this.auraFrame + 1) % AURA_KEYS.length;
        for (const p of this.players.values()) p.aura?.setTexture(AURA_KEYS[this.auraFrame]);
      },
    });
  }

  private addAura(p: PlayerSprite): void {
    if (p.aura) return;
    const aura = this.add.image(0, SPRITE_SIZE / 2 - 5, AURA_KEYS[this.auraFrame]).setDisplaySize(60, 24);
    p.container.addAt(aura, 0);
    p.aura = aura;
  }
```

5. Em `layout()`: depois de `this.time.removeAllEvents();` acrescentar `this.startAuraLoop();`.
6. No `layout()`, trocar `this.addPlayer(w, stage.fatigue[team]?.[w.id] ?? 0);` por `this.addPlayer(w, stage.fatigue[team]?.[w.id] ?? 0, stage);`
7. `addPlayer(w: Wanted, level: number, stage: Stage)`: no fim, trocar `this.players.set(...)` por:

```ts
    const sprite: PlayerSprite = { container, body, slot: w.slot, id: w.id, side: w.side };
    this.players.set(`${w.side}:${w.id}`, sprite);
    if (hasAura(stage, w.side, w.id)) this.addAura(sprite);
```

8. Extrair a faixa. Substituir o `case 'BANNER':` por:

```ts
      case 'BANNER': {
        const color = step.tone === 'good' ? '#f8d030' : step.tone === 'bad' ? '#f86858' : '#f8f8f0';
        this.showBanner(step.text, color, step.duration, d);
        break;
      }
      case 'ZONE': {
        const p = this.player(step.side, step.species);
        if (step.enter) {
          if (p) this.addAura(p);
          this.showBanner(zoneBannerText(speciesName(step.species)), '#f8d030', step.duration, d, '12px');
        } else if (p?.aura) {
          p.aura.destroy();
          p.aura = undefined;
        }
        break;
      }
      case 'ZONE_CLASH':
        this.showBanner(CLASH_BANNER, '#f8d030', step.duration, d, '12px');
        break;
      case 'PULSE':
        this.showBanner(pulseBannerText(step.tier), '#f8f8f0', step.duration, d, '12px');
        break;
```

e criar o método (junto de `floatText`):

```ts
  /** Faixa de texto no centro do campo. `d` é a duração já zerada com movimento reduzido. */
  private showBanner(text: string, color: string, duration: number, d: number, fontSize = '18px'): void {
    this.banner.setText(text).setColor(color).setFontSize(fontSize).setScale(0.6).setAlpha(1).setVisible(true);
    this.tweens.add({ targets: this.banner, scale: 1, duration: this.reduced ? 0 : Math.min(250, d / 2), ease: 'Back.easeOut' });
    this.time.delayedCall(duration, () => this.banner.setVisible(false));
  }
```

- [ ] **Step 5: Rodar**

Run: `npx vitest run apps/client/test/zone-fx.test.ts apps/client/test/field-scene.test.ts && npm run typecheck`
Expected: PASS. Se o `switch` de `runStep` acusar tipo, confira que `AnimStep` já tem os 3 passos (Task 4).

- [ ] **Step 6: Commit**

```bash
git add apps/client
git commit -m "feat(client/rhythm): aura de 2 quadros e faixas de zona, clash e pulse no campo" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Builder: aba "Capitães"

**Files:**
- Create: `src/builder/captains.ts`, `src/screens/builder/CaptainsEditor.tsx`
- Modify: `src/builder/draft.ts`, `src/builder/builderState.ts`, `src/builder/derived.ts`, `src/screens/builder/BuilderScreen.tsx`, `src/screens/builder/builder.css`
- Test: `test/captains-builder.test.ts`, `test/captains-editor.test.tsx`

**Interfaces:**
- Consumes: `PERKS`, `XFACTOR_IDS`, `slotPosition`, `Captains` (engine); `perkInfo` (Task 1).
- Produces:
  - `candidatesFor(depth, xFactor): number[]`, `pruneCaptains(d: TeamDraft): TeamDraft`, `OFFENSE_PERKS`, `DEFENSE_PERKS`
  - `TeamDraft.captains?: Captains`; `BuilderAction` `{ type: 'SET_CAPTAIN'; side: ZoneSide; captain: Captain | null }`
  - `<CaptainsEditor draft dispatch />`; aba `CAPTAINS` no `BuilderScreen`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `test/captains-builder.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { decodeTeam, encodeTeam } from '@pfl/protocol';
import { validateTeam } from '@pfl/engine';
import { builderReducer } from '../src/builder/builderState';
import { candidatesFor, pruneCaptains } from '../src/builder/captains';
import { draftFromTeam, draftToTeam } from '../src/builder/draft';
import { draftErrors, teamErrorMessage } from '../src/builder/derived';
import { testTeam } from './fixtures';

const base = () => draftFromTeam(testTeam());

describe('candidatesFor', () => {
  it('lista, sem repetir, os Pokémon do depth chart na posição do perk', () => {
    const d = base();
    expect(candidatesFor(d.depth, 'TELEPATHIC_POCKET')).toEqual([63, 54]); // QB
    expect(candidatesFor(d.depth, 'INTIMIDATE_RUSH')[0]).toBe(95); // DL1
    expect(new Set(candidatesFor(d.depth, 'IMMOVABLE_WALL')).size).toBe(candidatesFor(d.depth, 'IMMOVABLE_WALL').length);
  });
  it('depth vazio: ninguém', () => {
    expect(candidatesFor({}, 'TELEPATHIC_POCKET')).toEqual([]);
  });
});

describe('SET_CAPTAIN', () => {
  it('define e remove o capitão de um lado', () => {
    let d = builderReducer(base(), { type: 'SET_CAPTAIN', side: 'offense', captain: { species: 63, xFactor: 'TELEPATHIC_POCKET' } });
    expect(d.captains?.offense).toEqual({ species: 63, xFactor: 'TELEPATHIC_POCKET' });
    expect(draftErrors(d)).toEqual([]);
    d = builderReducer(d, { type: 'SET_CAPTAIN', side: 'offense', captain: null });
    expect(d.captains?.offense).toBeUndefined();
  });

  it('ignora capitão inválido: lado errado, espécie fora da posição', () => {
    const d = base();
    expect(builderReducer(d, { type: 'SET_CAPTAIN', side: 'offense', captain: { species: 95, xFactor: 'INTIMIDATE_RUSH' } })).toBe(d);
    expect(builderReducer(d, { type: 'SET_CAPTAIN', side: 'offense', captain: { species: 25, xFactor: 'TELEPATHIC_POCKET' } })).toBe(d);
  });

  it('cada lado é independente', () => {
    let d = builderReducer(base(), { type: 'SET_CAPTAIN', side: 'offense', captain: { species: 63, xFactor: 'TELEPATHIC_POCKET' } });
    d = builderReducer(d, { type: 'SET_CAPTAIN', side: 'defense', captain: { species: 95, xFactor: 'INTIMIDATE_RUSH' } });
    expect(d.captains).toEqual({ offense: { species: 63, xFactor: 'TELEPATHIC_POCKET' }, defense: { species: 95, xFactor: 'INTIMIDATE_RUSH' } });
  });
});

describe('pruneCaptains', () => {
  const withCaptains = () =>
    builderReducer(
      builderReducer(base(), { type: 'SET_CAPTAIN', side: 'offense', captain: { species: 63, xFactor: 'TELEPATHIC_POCKET' } }),
      { type: 'SET_CAPTAIN', side: 'defense', captain: { species: 95, xFactor: 'INTIMIDATE_RUSH' } },
    );

  it('remover o Pokémon do elenco remove o capitão', () => {
    const d = builderReducer(withCaptains(), { type: 'REMOVE_SPECIES', id: 63 });
    expect(d.captains?.offense).toBeUndefined();
    expect(d.captains?.defense).toEqual({ species: 95, xFactor: 'INTIMIDATE_RUSH' });
  });

  it('sair da posição no depth chart remove o capitão, e o time continua válido', () => {
    const d = pruneCaptains({ ...withCaptains(), depth: { ...base().depth, QB: [54] } });
    expect(d.captains?.offense).toBeUndefined();
    expect(draftErrors(d).map((e) => e.code)).not.toContain('XFACTOR_POSITION_MISMATCH');
  });

  it('sem capitães, devolve o mesmo rascunho', () => {
    const d = base();
    expect(pruneCaptains(d)).toBe(d);
  });
});

describe('persistência e erros', () => {
  it('draftFromTeam e draftToTeam preservam os capitães e o código do time os leva', () => {
    const team = { ...testTeam(), captains: { offense: { species: 63, xFactor: 'TELEPATHIC_POCKET' as const } } };
    const draft = draftFromTeam(team);
    expect(draft.captains).toEqual(team.captains);
    const back = draftToTeam(draft)!;
    expect(back.captains).toEqual(team.captains);
    expect(validateTeam(decodeTeam(encodeTeam(back)))).toEqual([]);
    expect((decodeTeam(encodeTeam(back)) as { captains: unknown }).captains).toEqual(team.captains);
  });

  it('mensagens em português para os erros novos', () => {
    expect(teamErrorMessage({ code: 'CAPTAIN_NOT_IN_ROSTER', detail: 'offense:63' })).toBe('Abra está como capitão, mas não está no elenco.');
    expect(teamErrorMessage({ code: 'XFACTOR_POSITION_MISMATCH', detail: 'defense:63' })).toBe('Abra não joga na posição do X-Factor escolhido.');
  });
});
```

Criar `test/captains-editor.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CaptainsEditor } from '../src/screens/builder/CaptainsEditor';
import { draftFromTeam } from '../src/builder/draft';
import { emptyDraft } from '../src/builder/draft';
import { testTeam } from './fixtures';

afterEach(cleanup);

describe('<CaptainsEditor>', () => {
  it('lista os 4 perks de cada lado e "Sem capitão" marcado por padrão', () => {
    render(<CaptainsEditor draft={draftFromTeam(testTeam())} dispatch={() => {}} />);
    const off = screen.getByRole('radiogroup', { name: 'Capitão do ataque' });
    const def = screen.getByRole('radiogroup', { name: 'Capitão da defesa' });
    expect(within(off).getAllByRole('radio')).toHaveLength(5);
    expect(within(def).getAllByRole('radio')).toHaveLength(5);
    expect((within(off).getByRole('radio', { name: /Sem capitão/ }) as HTMLInputElement).checked).toBe(true);
  });

  it('escolher um perk define o titular da posição como capitão', () => {
    const dispatch = vi.fn();
    render(<CaptainsEditor draft={draftFromTeam(testTeam())} dispatch={dispatch} />);
    fireEvent.click(screen.getByRole('radio', { name: /Telepathic Pocket/ }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CAPTAIN', side: 'offense', captain: { species: 63, xFactor: 'TELEPATHIC_POCKET' } });
  });

  it('"Sem capitão" remove o capitão do lado', () => {
    const dispatch = vi.fn();
    const draft = { ...draftFromTeam(testTeam()), captains: { offense: { species: 63, xFactor: 'TELEPATHIC_POCKET' as const } } };
    render(<CaptainsEditor draft={draft} dispatch={dispatch} />);
    const off = screen.getByRole('radiogroup', { name: 'Capitão do ataque' });
    expect((within(off).getByRole('radio', { name: /Telepathic Pocket/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(off).getByRole('radio', { name: /Sem capitão/ }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CAPTAIN', side: 'offense', captain: null });
  });

  it('com um perk escolhido, lista os candidatos e troca de capitão', () => {
    const dispatch = vi.fn();
    const draft = { ...draftFromTeam(testTeam()), captains: { offense: { species: 63, xFactor: 'TELEPATHIC_POCKET' as const } } };
    render(<CaptainsEditor draft={draft} dispatch={dispatch} />);
    const who = screen.getByRole('radiogroup', { name: 'Quem lidera o ataque?' });
    expect(within(who).getAllByRole('radio')).toHaveLength(2); // QB: Abra e Psyduck
    fireEvent.click(within(who).getAllByRole('radio')[1]);
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CAPTAIN', side: 'offense', captain: { species: 54, xFactor: 'TELEPATHIC_POCKET' } });
  });

  it('perk sem ninguém na posição fica desabilitado e explica', () => {
    render(<CaptainsEditor draft={emptyDraft()} dispatch={() => {}} />);
    expect((screen.getByRole('radio', { name: /Telepathic Pocket/ }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getAllByText(/Ninguém no depth chart joga de/).length).toBeGreaterThan(0);
  });
});
```

(`Psyduck` é o id 54; confira em `speciesName(54)` ao ler o nome do segundo candidato; o teste só usa o id.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/captains-builder.test.ts apps/client/test/captains-editor.test.tsx`
Expected: FAIL.

- [ ] **Step 3: `builder/captains.ts`**

```ts
import { PERKS, XFACTOR_IDS, slotPosition, type Captains, type SlotId, type Team, type XFactorId } from '@pfl/engine';
import type { TeamDraft } from './draft';

export const OFFENSE_PERKS: readonly XFactorId[] = XFACTOR_IDS.filter((id) => PERKS[id].side === 'offense');
export const DEFENSE_PERKS: readonly XFactorId[] = XFACTOR_IDS.filter((id) => PERKS[id].side === 'defense');

/** Pokémon do depth chart (sem repetir, na ordem) em alguma vaga da posição do perk. */
export function candidatesFor(depth: Team['depth'], xFactor: XFactorId): number[] {
  const position = PERKS[xFactor].position;
  const ids: number[] = [];
  for (const [slot, list] of Object.entries(depth) as [SlotId, number[] | undefined][]) {
    if (slotPosition(slot) !== position) continue;
    for (const id of list ?? []) if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Remove os capitães que saíram do elenco ou da posição do perk. Devolve o mesmo rascunho se nada mudou. */
export function pruneCaptains(d: TeamDraft): TeamDraft {
  if (!d.captains) return d;
  const kept: Captains = {};
  for (const side of ['offense', 'defense'] as const) {
    const c = d.captains[side];
    if (c && d.roster.includes(c.species) && candidatesFor(d.depth, c.xFactor).includes(c.species)) kept[side] = c;
  }
  const same = kept.offense === d.captains.offense && kept.defense === d.captains.defense;
  if (same) return d;
  return { ...d, captains: kept.offense || kept.defense ? kept : undefined };
}
```

- [ ] **Step 4: Rascunho, reducer e erros**

Em `src/builder/draft.ts`: importar `Captains` (`import type { Captains, Team } from '@pfl/engine';`); em `TeamDraft` acrescentar `captains?: Captains;`; em `draftFromTeam` acrescentar `captains: copy.captains,`; em `draftToTeam` acrescentar `captains: copy.captains,`.

Em `src/builder/builderState.ts`:

- imports: `import type { CardSide, Captain, ZoneSide } from '@pfl/engine';` (junto do import existente de `CardSide`), `import { PERKS } from '@pfl/engine';` (junto de `DECK_SIZE, ...`), `import { candidatesFor, pruneCaptains } from './captains';`
- `BuilderAction`: acrescentar `| { type: 'SET_CAPTAIN'; side: ZoneSide; captain: Captain | null }` antes de `| DepthAction`.
- `withRoster`: trocar `return {` por `return pruneCaptains({` e o `};` final por `});`.
- novo `case` antes de `default:`:

```ts
    case 'SET_CAPTAIN': {
      if (a.captain === null) {
        if (!d.captains?.[a.side]) return d;
        const rest = { ...d.captains, [a.side]: undefined };
        return { ...d, captains: rest.offense || rest.defense ? rest : undefined };
      }
      const perk = PERKS[a.captain.xFactor];
      if (!perk || perk.side !== a.side) return d;
      if (!d.roster.includes(a.captain.species) || !candidatesFor(d.depth, a.captain.xFactor).includes(a.captain.species)) return d;
      return { ...d, captains: { ...d.captains, [a.side]: a.captain } };
    }
```

- `default:` : trocar o retorno por `return pruneCaptains({ ...d, depth: next.depth, keepOnField: next.keepOnField });`

Em `src/builder/derived.ts`: acrescentar `speciesName` ao import de `'../lib/names'` e, antes do `switch` de `teamErrorMessage`, a função e os casos:

```ts
const captainName = (detail: string): string => {
  const id = Number(detail.split(':')[1]);
  return Number.isInteger(id) ? speciesName(id) : '?';
};
```

```ts
    case 'CAPTAIN_NOT_IN_ROSTER': return `${captainName(d)} está como capitão, mas não está no elenco.`;
    case 'XFACTOR_POSITION_MISMATCH': return `${captainName(d)} não joga na posição do X-Factor escolhido.`;
```

- [ ] **Step 5: `CaptainsEditor.tsx`**

```tsx
import type { Dispatch } from 'react';
import type { Captain, XFactorId, ZoneSide } from '@pfl/engine';
import { Sprite } from '../../components/Sprite';
import { DEFENSE_PERKS, OFFENSE_PERKS, candidatesFor } from '../../builder/captains';
import type { BuilderAction } from '../../builder/builderState';
import type { TeamDraft } from '../../builder/draft';
import { perkInfo } from '../../lib/perks';
import { POSITION_LABELS, speciesName } from '../../lib/names';
import { useArrowNav } from '../../app/useArrowNav';
import './builder.css';

interface Props {
  draft: TeamDraft;
  dispatch: Dispatch<BuilderAction>;
}

const TITLES: Record<ZoneSide, string> = { offense: 'Capitão do ataque', defense: 'Capitão da defesa' };
const WHO: Record<ZoneSide, string> = { offense: 'Quem lidera o ataque?', defense: 'Quem lidera a defesa?' };

function Side({ side, draft, dispatch }: Props & { side: ZoneSide }) {
  const perks = side === 'offense' ? OFFENSE_PERKS : DEFENSE_PERKS;
  const current = draft.captains?.[side] ?? null;
  const nav = useArrowNav<HTMLDivElement>();
  const who = useArrowNav<HTMLDivElement>();
  const choose = (captain: Captain | null) => dispatch({ type: 'SET_CAPTAIN', side, captain });
  const candidates = current ? candidatesFor(draft.depth, current.xFactor) : [];

  return (
    <section className="panel captains-side">
      <h3 id={`captains-${side}`}>{TITLES[side]}</h3>
      <div role="radiogroup" aria-label={TITLES[side]} className="captains-list" ref={nav.ref} onKeyDown={nav.onKeyDown}>
        <label className="perk-option">
          <input type="radio" name={`captain-${side}`} checked={current === null} onChange={() => choose(null)} />
          <span className="perk-name">Sem capitão</span>
        </label>
        {perks.map((id: XFactorId) => {
          const info = perkInfo(id);
          const options = candidatesFor(draft.depth, id);
          const disabled = options.length === 0;
          return (
            <label key={id} className={`perk-option${disabled ? ' is-disabled' : ''}`}>
              <input
                type="radio"
                name={`captain-${side}`}
                checked={current?.xFactor === id}
                disabled={disabled}
                onChange={() => choose({ species: options[0], xFactor: id })}
              />
              <span className="perk-name">
                {info.name} <span className="perk-pos">{info.position}</span>
              </span>
              <span className="perk-text">Entra na zona: {info.trigger}.</span>
              <span className="perk-text">{info.effect}</span>
              {disabled && <span className="perk-text muted">Ninguém no depth chart joga de {POSITION_LABELS[info.position]}. Monte a posição primeiro.</span>}
            </label>
          );
        })}
      </div>
      {current && candidates.length > 0 && (
        <div role="radiogroup" aria-label={WHO[side]} className="captains-who" ref={who.ref} onKeyDown={who.onKeyDown}>
          <p className="muted">{WHO[side]}</p>
          {candidates.map((id) => (
            <label key={id} className="who-option">
              <input type="radio" name={`who-${side}`} checked={current.species === id} onChange={() => choose({ species: id, xFactor: current.xFactor })} />
              <Sprite id={id} size={32} />
              <span>{speciesName(id)}</span>
            </label>
          ))}
        </div>
      )}
    </section>
  );
}

/** Aba "Capitães": um perk de ataque e um de defesa, cada um com o Pokémon que o lidera. Os dois lados são opcionais. */
export function CaptainsEditor({ draft, dispatch }: Props) {
  return (
    <div className="captains-editor">
      <p className="muted">
        Um capitão entra na zona depois de uma sequência de jogadas e ganha o perk até sofrer uma jogada ruim ou o adversário pedir timeout.
        Sem capitão, o time joga normalmente.
      </p>
      <div className="captains-grid">
        <Side side="offense" draft={draft} dispatch={dispatch} />
        <Side side="defense" draft={draft} dispatch={dispatch} />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Aba e CSS**

Em `src/screens/builder/BuilderScreen.tsx`: importar `CaptainsEditor`; `type Tab = 'ROSTER' | 'DEPTH' | 'CAPTAINS' | 'DECK' | 'CODE';`; no array `TABS`, depois de `{ id: 'DEPTH', ... }`, acrescentar `{ id: 'CAPTAINS', label: 'Capitães' },`; e depois do bloco `{tab === 'DEPTH' && (...)}`:

```tsx
      {tab === 'CAPTAINS' && <CaptainsEditor draft={draft} dispatch={dispatch} />}
```

Em `src/screens/builder/builder.css`, acrescentar:

```css
/* ================= capitães ================= */
.captains-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-3); }
@media (min-width: 721px) {
  .captains-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

.captains-side h3 { margin-top: 0; }
.captains-list { display: flex; flex-direction: column; gap: var(--space-2); }

.perk-option {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: var(--space-2);
  row-gap: 2px;
  align-items: start;
  min-height: var(--hit-min);
  padding: var(--space-2);
  border: 3px solid var(--gbc-border);
  background: var(--gbc-paper);
  cursor: pointer;
}
.perk-option input { grid-row: 1 / span 3; margin-top: 4px; }
.perk-option:has(input:checked) { background: var(--pulse); color: var(--pulse-ink); border-color: var(--pulse-ink); }
.perk-option.is-disabled { opacity: 0.6; cursor: not-allowed; }
.perk-name { font-family: var(--font-display); font-size: var(--fs-xs); line-height: 1.6; }
.perk-pos { margin-left: var(--space-1); padding: 0 var(--space-1); background: var(--gbc-ink); color: var(--gbc-paper); }
.perk-text { grid-column: 2; font-family: var(--font-body); font-size: var(--fs-body-sm); line-height: 1.4; }

.captains-who { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); margin-top: var(--space-3); }
.captains-who > p { flex-basis: 100%; margin: 0; }
.who-option { display: inline-flex; align-items: center; gap: var(--space-1); min-height: var(--hit-min); padding: var(--space-1) var(--space-2); border: 3px solid var(--gbc-border); background: var(--gbc-paper); cursor: pointer; }
.who-option:has(input:checked) { background: var(--pulse); color: var(--pulse-ink); border-color: var(--pulse-ink); }
```

(Se `:has()` não passar em `css-platform`, troque por uma classe `is-selected` aplicada no JSX e ajuste o seletor.)

- [ ] **Step 7: Rodar**

Run: `npx vitest run apps/client && npm run typecheck`
Expected: PASS (inclui `builder.test.ts`, `derived.test.ts`, `form-font-size`, `contrast`). O contraste de `--pulse-ink` sobre `--pulse` já é medido na Task 1.

- [ ] **Step 8: Commit**

```bash
git add apps/client
git commit -m "feat(client/rhythm): aba Capitães no builder, com poda quando o capitão sai da posição" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Verificação final, baseline de layout e PR

**Files:**
- Modify: `docs/superpowers/specs/desktop-baseline/` (regravar os arquivos da partida)
- Modify: `docs/superpowers/specs/2026-10-14-ritmo-pulse-xfactor-apresentacao-design.md` (texto do timeout, se o plano divergiu)

**Interfaces:** nenhuma nova; esta task só verifica e entrega.

- [ ] **Step 1: Suíte e tipos**

Run: `npm run typecheck && npm test`
Expected: tudo verde.

- [ ] **Step 2: Detector do Impeccable**

Run: `"/home/asaas/.claude/plugins/cache/impeccable/impeccable/4.5.2/skills/impeccable/scripts/impeccable" detect --json apps/client/src/screens/match apps/client/src/screens/builder/CaptainsEditor.tsx apps/client/src/screens/builder/builder.css`
Expected: sem achados de severidade alta. Corrija o que for real (contraste, alvo de toque, `transition: all`); registre no commit o que for falso positivo e por quê.

- [ ] **Step 3: Rodar o app e conferir à mão**

Run: `npm run dev:server` e, em outro terminal, `npm run dev:client`. Abrir duas abas, montar dois times (um deles com capitães, o outro sem), entrar na mesma sala e jogar. Conferir, anotando o resultado de cada item (marque "ok" ou descreva o defeito):

1. O medidor aparece abaixo do placar, vazio e com o texto "Equilíbrio.".
2. Forçar momentum alto: no console do servidor de desenvolvimento, ou jogando até acumular sequências, ou temporariamente iniciando a `MatchSession` com `rhythm.momentum = 85` num `npm run dev:server` local (não commite essa mudança). O texto muda, o nível 2 fica listrado e o jogador pressionado vê o relógio de 6 s.
3. Um capitão entra na zona: faixa "NA ZONA: ...", aura de 2 quadros sob ele, ficha amarela, som metálico.
4. O tremor curto no início do `PLAYCALL` do pressionado no nível 2; o batimento toca; a música fica mais baixa.
5. Névoa tática numa carta da mão do pressionado, e ela continua jogável.
6. Timeout: dois cliques; o outro lado vê a linha do log e o medidor cai; o botão fica desabilitado no snap.
7. Aba "Capitães" no builder: escolher, trocar, tirar um Pokémon do depth chart e ver o capitão sumir.
8. Com `prefers-reduced-motion: reduce` (DevTools, Rendering): sem tremor, aura parada, faixas sem movimento, medidor sem transição.
9. Viewport de celular (390×844 retrato e 844×390 paisagem): sem rolagem horizontal, fichas só com sprite e pontos, alvos de 44 px.

- [ ] **Step 4: Baseline de layout do desktop**

O HUD ganhou uma linha, então o baseline numérico muda. Com o app aberto na tela da partida em 1041, 1280 e 1920 de largura: carregar `apps/client/scripts/layout-snapshot.js` no console, rodar `window.__pflSnapshot()` e salvar o JSON; comparar com `docs/superpowers/specs/desktop-baseline/match-*.json` usando `node apps/client/scripts/diff-snapshots.mjs <antigo> <novo>`. Conferir que **só** o HUD e o que está abaixo dele mudaram de posição (o `y` dos elementos abaixo desloca pela altura da linha nova; larguras e fontes não mudam). Se algo acima do HUD ou larguras mudaram, é regressão: corrija o CSS. Quando só o esperado mudou, regravar os `match-*.json` e `scripts/layout-audit.js` em retrato, paisagem e desktop.

- [ ] **Step 5: Atualizar o spec se necessário e commitar**

Se algum texto do plano divergiu do spec (por exemplo as quatro combinações do efeito do timeout), alinhar o spec. Depois:

```bash
git add docs apps/client
git commit -m "chore(client/rhythm): baseline de layout da partida com o medidor de ritmo" -m "<o que mudou e a justificativa do diff>" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Pull request**

Seguir `superpowers:finishing-a-development-branch`. A descrição resume a apresentação do ritmo (medidor, fichas, aura, timeout, builder, áudio), cita o spec e o plano, lista a verificação manual com os resultados do Step 3 e o diff do baseline, e termina com:

`🤖 Generated with [Claude Code](https://claude.com/claude-code)`

---

## Auto-revisão

**Cobertura do spec:**

| Seção do spec | Task |
| --- | --- |
| 6 Medidor | 2, 3, 6 |
| 7 Fichas | 2, 6 |
| 8 Campo (aura, passos, faixas) | 3, 4, 8 |
| 9 Quem é pressionado (tremor, névoa, relógio) | 2, 6, 7 |
| 10 Botão de timeout | 2, 7 |
| 11 Áudio | 5 |
| 12 Textos (perks, narração) | 1, 4 |
| 13 Builder | 9 |
| 14 Organização e tokens | 1 a 9 |
| 15 Testes e verificação | em cada task + 10 |
| Critério 8 (reduced motion) | 6 (CSS e teste), 7 (tremor), 8 (loop da aura) |
| Critério 10 (baseline) | 10 |

**Pontos que o spec tratou de forma mais curta e o plano fechou:** o efeito do timeout tem quatro combinações (momentum, zona, as duas, nenhuma); o `buildTimeline` recebe `tierBefore` para que `PULSE` só apareça quando o nível sobe (a Parte 1 não manda o nível anterior no evento); o `rhythmBefore` também vale para as fichas e para a aura (via `Animation.stage`, que já é o estágio pré-jogada).

**Tipos consistentes:** `RhythmView` (engine, Parte 1) alimenta `gaugeModel`, `zoneChips`, `aurasFrom`, `heartbeatActive`, `duckFor`; `Aura` (Task 3) é consumida por `hasAura` (Task 8); `AnimStep` com `ZONE`, `ZONE_CLASH` e `PULSE` (Task 4) é consumida por `cueForStep` (Task 5) e por `FieldScene.runStep` (Task 8); `SET_CAPTAIN` e `pruneCaptains` (Task 9) usam `candidatesFor`, a mesma função que o `CaptainsEditor` usa para listar quem lidera.
