# Animações dinâmicas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Espetáculo (partículas, zoom) só nos momentos raros da partida e polimento curto nas jogadas comuns e na UI, num único PR só de cliente.

**Architecture:** Um módulo puro `phaser/fx.ts` decide o efeito de cada `AnimStep` (como `choreography.ts`); o `FieldScene` só aplica (partículas, câmera, hit-stop, inclinação). A UI usa CSS com `steps()` e um helper pequeno `lib/motion.ts` (WAAPI, memória da carta escolhida, `useChangeFlash`). Transições de tela: `app/transition.ts` (View Transition só em HOME ↔ BUILDER) e classe `screen-enter` nas telas derivadas do servidor.

**Tech Stack:** TypeScript, React 19, Phaser 3.90, Vitest 5 (jsdom nos testes de DOM), CSS. Sem dependência nova.

**Spec:** [docs/superpowers/specs/2026-10-14-animacoes-dinamicas-design.md](../specs/2026-10-14-animacoes-dinamicas-design.md)

## Global Constraints

- Só cliente: nenhuma mudança em `packages/engine`, `packages/protocol`, servidor nem em `apps/client/src/audio/` (o `audio-cues.test.ts` tem de passar **sem edição**).
- Campos novos nos passos (`moment`) são aditivos e opcionais.
- `TIMELINE_BUDGET_MS` (`RESULT_ANIMATION_MS - 500` = 4000 ms) continua sendo o teto; `fitToBudget` passa a usar `TIMELINE_BUDGET_MS - HIT_STOP_MS`, com `HIT_STOP_MS = 70`.
- Partículas só nos momentos raros, teto `MAX_PARTICLES = 24` (12 com `(pointer: coarse)`). Sem idle contínuo, sem efeito no `FIRST_DOWN`, sem GSAP.
- `prefers-reduced-motion: reduce`: nada se move (partículas, câmera, hit-stop, inclinação, WAAPI, View Transition, entradas); texto, cor e símbolo permanecem.
- Toda animação CSS nova fica dentro de `@media (prefers-reduced-motion: no-preference)`; só `transform` e `opacity` (nunca `width`); `steps()`; identidade GBC (paleta `--gbc-*`, sem blur).
- Phaser: só API que exista no **3.90** (`add.particles(x, y, key, config)`, `Camera.resetFX`, `tweens.timeScale`, `time.timeScale`). As skills locais em `.agents/skills` descrevem o Phaser 4 e não valem como referência literal.
- Comentários em português, no tom do código vizinho.
- Rodar a partir da raiz do repositório: `npx vitest run <arquivo>`, `npm run typecheck`, `npm test`.

## Review Focus

- **Hit-stop travado:** `layout()` (nova jogada ou `sync` com outro estágio) no meio do hit-stop deve devolver `tweens.timeScale` e `time.timeScale` a 1; teste na Tarefa 3.
- **Dois CLASH na mesma timeline:** o segundo hit-stop não pode vazar o temporizador do primeiro; teste na Tarefa 3.
- **Toque (`pointer: coarse`):** o confete do TD cai de 24 para 12 partículas; testes nas Tarefas 2 e 3.
- **Retângulo da carta ausente, expirado ou `Element.animate` indisponível (jsdom, navegadores antigos):** a carta só aparece, sem erro; testes nas Tarefas 4 e 6.
- **Placar muda durante a animação:** o `RESULT` já grava o `view` final no começo da jogada, então o piscar só pode disparar quando `animating` termina; testes nas Tarefas 4 e 7.

---

### Task 1: `moment` nos banners e folga do hit-stop na timeline

**Files:**
- Modify: `apps/client/src/match/timeline.ts`
- Test: `apps/client/test/timeline.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `export type Moment = 'TD' | 'END'`; `export const HIT_STOP_MS = 70`; o passo `BANNER` ganha `moment?: Moment`. As Tarefas 2 e 3 dependem destes nomes.

- [ ] **Step 1: Escrever os testes que falham**

Em `apps/client/test/timeline.test.ts`, troque a linha de import por:

```ts
import { buildTimeline, timelineDuration, HIT_STOP_MS, TIMELINE_BUDGET_MS, type AnimStep } from '../src/match/timeline';
```

e acrescente ao final do arquivo:

```ts
describe('buildTimeline: momentos e hit-stop', () => {
  it('touchdown marca o banner com moment TD', () => {
    const steps = buildTimeline([...play('basic_run'), { t: 'TOUCHDOWN', team: 'A' }]);
    expect(steps.at(-1)).toMatchObject({ kind: 'BANNER', moment: 'TD' });
  });

  it('fim de jogo e prorrogação marcam moment END', () => {
    const end = buildTimeline([{ t: 'MATCH_END', score: { A: 21, B: 14 } }]);
    expect(end.at(-1)).toMatchObject({ kind: 'BANNER', moment: 'END' });
    const overtime = buildTimeline([{ t: 'OVERTIME', round: 1 }]);
    expect(overtime.at(-1)).toMatchObject({ kind: 'BANNER', moment: 'END' });
  });

  it('banners comuns não têm moment', () => {
    const steps = buildTimeline([{ t: 'FIRST_DOWN' }]);
    expect(steps.at(-1)).toMatchObject({ kind: 'BANNER' });
    expect((steps.at(-1) as { moment?: string }).moment).toBeUndefined();
  });

  it('deixa folga para o hit-stop quando a timeline é comprimida', () => {
    const many = [0, 1, 2, 3].flatMap(() => play('basic_pass', { offActors: [63, 26, 95] }));
    const steps = buildTimeline(many);
    expect(timelineDuration(steps)).toBeLessThanOrEqual(TIMELINE_BUDGET_MS - HIT_STOP_MS);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/timeline.test.ts`
Expected: FAIL (`HIT_STOP_MS` não exportado e `moment` ausente).

- [ ] **Step 3: Implementar**

Em `apps/client/src/match/timeline.ts`:

1. Logo antes de `export type AnimStep`, acrescente:

```ts
/** Momento raro que o campo comemora com partículas e câmera (ver phaser/fx.ts). */
export type Moment = 'TD' | 'END';
```

2. Troque a linha do `BANNER` na união por:

```ts
    | { kind: 'BANNER'; text: string; tone: 'good' | 'bad' | 'info'; moment?: Moment }
```

3. Logo abaixo de `export const TIMELINE_BUDGET_MS = RESULT_ANIMATION_MS - 500;`, acrescente:

```ts

/** Pausa do CLASH (tempo real, somado ao passo). Há no máximo um CLASH por jogada, então a folga é fixa. */
export const HIT_STOP_MS = 70;
```

4. Troque as três linhas dos banners:

```ts
      case 'TOUCHDOWN':
        push({ kind: 'BANNER', text: TOUCHDOWN_BANNER, tone: 'good', moment: 'TD' }, D.banner);
        break;
```

```ts
      case 'OVERTIME':
        push({ kind: 'BANNER', text: `PRORROGAÇÃO ${e.round}`, tone: 'info', moment: 'END' }, D.banner);
        break;
      case 'MATCH_END':
        push({ kind: 'BANNER', text: 'FIM DE JOGO', tone: 'info', moment: 'END' }, D.banner);
        break;
```

5. Troque a última linha de `buildTimeline`:

```ts
  return fitToBudget(steps, TIMELINE_BUDGET_MS - HIT_STOP_MS);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run apps/client/test/timeline.test.ts apps/client/test/audio-cues.test.ts`
Expected: PASS (o `audio-cues.test.ts` sem edição prova que o áudio não foi tocado).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/match/timeline.ts apps/client/test/timeline.test.ts
git commit -m "feat(client): moment nos banners e folga de hit-stop na timeline" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: módulo puro `phaser/fx.ts`

**Files:**
- Create: `apps/client/src/phaser/fx.ts`
- Test: `apps/client/test/fx.test.ts`

**Interfaces:**
- Consumes: `HIT_STOP_MS`, `AnimStep` de `../match/timeline`; `Point` de `./choreography`; `FIELD_WIDTH`, `FIELD_HEIGHT` de `./layout`.
- Produces (a Tarefa 3 usa exatamente isto):

```ts
export type BurstKind = 'confetti' | 'shards' | 'sparks' | 'dust';
export type FxAnchor = 'ball' | 'clash' | 'qb';
export interface BurstPlan { kind: BurstKind; anchor: FxAnchor; count: number; colors: number[]; speedMin: number; speedMax: number; angleMin: number; angleMax: number; gravityY: number; lifespan: number }
export interface ZoomPlan { scale: number; ms: number; anchor: FxAnchor }
export interface FxPlan { hitStop: number; tilt: number | null; zoom: ZoomPlan | null; burst: BurstPlan | null }
export interface FxContext { reduced: boolean; coarse: boolean }
export const MAX_PARTICLES = 24;
export const MAX_PARTICLES_COARSE = 12;
export function fxFor(step: AnimStep, ctx: FxContext): FxPlan;
export function panTarget(p: Point): Point;
```

- [ ] **Step 1: Escrever o teste que falha**

Crie `apps/client/test/fx.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { HIT_STOP_MS, type AnimStep } from '../src/match/timeline';
import { MAX_PARTICLES, MAX_PARTICLES_COARSE, fxFor, panTarget } from '../src/phaser/fx';
import { FIELD_HEIGHT, FIELD_WIDTH } from '../src/phaser/layout';

const step = (s: object) => ({ at: 0, duration: 400, ...s }) as AnimStep;
const live = { reduced: false, coarse: false };
const NONE = { hitStop: 0, tilt: null, zoom: null, burst: null };

const clash = (mult?: number) => step({ kind: 'CLASH', off: 25, def: 95, effect: null, mult });
const td = step({ kind: 'BANNER', text: 'TOUCHDOWN!', tone: 'good', moment: 'TD' });
const end = step({ kind: 'BANNER', text: 'FIM DE JOGO', tone: 'info', moment: 'END' });
const turnover = step({ kind: 'TURNOVER', by: 95 });
const sack = step({ kind: 'SACK', qb: 63, by: 95, yards: 7 });
const fgGood = step({ kind: 'KICK', distance: 35, good: true });
const RARE = [clash(4), td, end, turnover, sack, fgGood];

describe('fxFor: momentos raros', () => {
  it('TD: confete cheio e zoom na bola', () => {
    const fx = fxFor(td, live);
    expect(fx.burst).toMatchObject({ kind: 'confetti', anchor: 'ball', count: MAX_PARTICLES });
    expect(fx.zoom).toEqual({ scale: 1.12, ms: 300, anchor: 'ball' });
  });

  it('fim de jogo e prorrogação: confete leve, sem zoom', () => {
    const fx = fxFor(end, live);
    expect(fx.burst).toMatchObject({ kind: 'confetti', count: 12 });
    expect(fx.zoom).toBeNull();
  });

  it('troca de posse: estilhaços vermelhos e zoom curto', () => {
    const fx = fxFor(turnover, live);
    expect(fx.burst).toMatchObject({ kind: 'shards', anchor: 'ball', count: 16 });
    expect(fx.zoom).toEqual({ scale: 1.1, ms: 200, anchor: 'ball' });
  });

  it('chute bom: faíscas; chute errado ou punt: nada', () => {
    expect(fxFor(fgGood, live).burst).toMatchObject({ kind: 'sparks', anchor: 'ball', count: 10 });
    expect(fxFor(step({ kind: 'KICK', distance: 35, good: false }), live)).toEqual(NONE);
    expect(fxFor(step({ kind: 'KICK', distance: 40, good: null }), live)).toEqual(NONE);
  });

  it('SACK: poeira no QB', () => {
    expect(fxFor(sack, live).burst).toMatchObject({ kind: 'dust', anchor: 'qb', count: 12 });
  });

  it('CLASH ×4: estilhaços no ponto do choque; ×2 não tem partículas', () => {
    expect(fxFor(clash(4), live).burst).toMatchObject({ kind: 'shards', anchor: 'clash', count: 16 });
    expect(fxFor(clash(2), live).burst).toBeNull();
  });
});

describe('fxFor: jogadas comuns', () => {
  it('todo CLASH tem hit-stop; TACKLE inclina o portador', () => {
    expect(fxFor(clash(1), live)).toEqual({ ...NONE, hitStop: HIT_STOP_MS });
    expect(fxFor(step({ kind: 'TACKLE', by: 95, carrier: 25 }), live)).toEqual({ ...NONE, tilt: 12 });
  });

  it('SNAP, BLOCK, RUN, THROW e INCOMPLETE não geram efeito nenhum', () => {
    const common = [
      step({ kind: 'SNAP' }),
      step({ kind: 'BLOCK', blitz: false }),
      step({ kind: 'RUN', carrier: 25, yards: 40, big: true }),
      step({ kind: 'THROW', from: 63, to: 25 }),
      step({ kind: 'INCOMPLETE' }),
      step({ kind: 'BANNER', text: 'FIRST DOWN!', tone: 'info' }),
    ];
    for (const s of common) expect(fxFor(s, live)).toEqual(NONE);
  });
});

describe('fxFor: movimento reduzido e toque', () => {
  it('reduced devolve sempre o plano vazio, até no CLASH e no TACKLE', () => {
    for (const s of [...RARE, clash(1), step({ kind: 'TACKLE', by: 95, carrier: 25 })]) {
      expect(fxFor(s, { reduced: true, coarse: false })).toEqual(NONE);
    }
  });

  it('em toque nenhuma rajada passa de 12 partículas; no desktop, nenhuma passa de 24', () => {
    for (const s of RARE) {
      const coarse = fxFor(s, { reduced: false, coarse: true }).burst;
      const desktop = fxFor(s, live).burst;
      if (coarse) expect(coarse.count).toBeLessThanOrEqual(MAX_PARTICLES_COARSE);
      if (desktop) expect(desktop.count).toBeLessThanOrEqual(MAX_PARTICLES);
    }
    expect(fxFor(td, { reduced: false, coarse: true }).burst?.count).toBe(MAX_PARTICLES_COARSE);
  });
});

describe('panTarget', () => {
  it('deixa o centro onde está e prende pontos distantes à faixa central', () => {
    const cx = FIELD_WIDTH / 2;
    const cy = FIELD_HEIGHT / 2;
    expect(panTarget({ x: cx, y: cy })).toEqual({ x: cx, y: cy });
    expect(panTarget({ x: 0, y: 0 })).toEqual({ x: cx - 40, y: cy - 80 });
    expect(panTarget({ x: FIELD_WIDTH, y: FIELD_HEIGHT })).toEqual({ x: cx + 40, y: cy + 80 });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/fx.test.ts`
Expected: FAIL (`Cannot find module '../src/phaser/fx'`).

- [ ] **Step 3: Implementar**

Crie `apps/client/src/phaser/fx.ts`:

```ts
import { HIT_STOP_MS, type AnimStep } from '../match/timeline';
import type { Point } from './choreography';
import { FIELD_HEIGHT, FIELD_WIDTH } from './layout';

/**
 * Efeitos do campo, sem Phaser: cada passo vira um plano em dados e o FieldScene o aplica.
 * Espetáculo (partículas e zoom) só nos momentos raros; nas jogadas comuns há só hit-stop e inclinação.
 */

export type BurstKind = 'confetti' | 'shards' | 'sparks' | 'dust';
/** Onde a rajada ou o zoom acontece: a bola, o ponto do choque ou o QB. */
export type FxAnchor = 'ball' | 'clash' | 'qb';

export interface BurstPlan {
  kind: BurstKind;
  anchor: FxAnchor;
  count: number;
  /** cores da paleta (hex); o Phaser sorteia uma por partícula */
  colors: number[];
  speedMin: number;
  speedMax: number;
  /** graus; 270 = para cima */
  angleMin: number;
  angleMax: number;
  gravityY: number;
  /** ms */
  lifespan: number;
}

export interface ZoomPlan {
  scale: number;
  ms: number;
  anchor: FxAnchor;
}

export interface FxPlan {
  /** ms de pausa dos relógios do Phaser; 0 = nenhuma */
  hitStop: number;
  /** graus que o corpo do portador inclina no tackle (e volta); null = nenhum */
  tilt: number | null;
  zoom: ZoomPlan | null;
  burst: BurstPlan | null;
}

export interface FxContext {
  reduced: boolean;
  /** `(pointer: coarse)`: celular, com menos GPU de sobra */
  coarse: boolean;
}

export const MAX_PARTICLES = 24;
export const MAX_PARTICLES_COARSE = 12;

const YELLOW = 0xf8d030;
const RED = 0xf86858;
const PAPER = 0xf8f8f0;
const BLUE = 0x3058c0;
const GRAY = 0xc8c8c8;

const NONE: FxPlan = { hitStop: 0, tilt: null, zoom: null, burst: null };

type Burst = Omit<BurstPlan, 'count'>;
const CONFETTI: Burst = { kind: 'confetti', anchor: 'ball', colors: [YELLOW, PAPER, RED, BLUE], speedMin: 80, speedMax: 200, angleMin: 220, angleMax: 320, gravityY: 260, lifespan: 900 };
const SHARDS_RED: Burst = { kind: 'shards', anchor: 'ball', colors: [RED, PAPER], speedMin: 60, speedMax: 140, angleMin: 0, angleMax: 360, gravityY: 0, lifespan: 450 };
const SHARDS_YELLOW: Burst = { kind: 'shards', anchor: 'clash', colors: [YELLOW, PAPER], speedMin: 60, speedMax: 140, angleMin: 0, angleMax: 360, gravityY: 0, lifespan: 450 };
const SPARKS: Burst = { kind: 'sparks', anchor: 'ball', colors: [YELLOW, PAPER], speedMin: 40, speedMax: 100, angleMin: 0, angleMax: 360, gravityY: 0, lifespan: 350 };
const DUST: Burst = { kind: 'dust', anchor: 'qb', colors: [PAPER, GRAY], speedMin: 20, speedMax: 70, angleMin: 200, angleMax: 340, gravityY: 40, lifespan: 500 };

export function fxFor(step: AnimStep, ctx: FxContext): FxPlan {
  if (ctx.reduced) return NONE;
  const cap = ctx.coarse ? MAX_PARTICLES_COARSE : MAX_PARTICLES;
  const burst = (b: Burst, count: number): BurstPlan => ({ ...b, count: Math.min(count, cap) });
  switch (step.kind) {
    case 'CLASH':
      return { ...NONE, hitStop: HIT_STOP_MS, burst: step.mult === 4 ? burst(SHARDS_YELLOW, 16) : null };
    case 'TACKLE':
      return { ...NONE, tilt: 12 };
    case 'SACK':
      return { ...NONE, burst: burst(DUST, 12) };
    case 'TURNOVER':
      return { ...NONE, zoom: { scale: 1.1, ms: 200, anchor: 'ball' }, burst: burst(SHARDS_RED, 16) };
    case 'KICK':
      return step.good === true ? { ...NONE, burst: burst(SPARKS, 10) } : NONE;
    case 'BANNER':
      if (step.moment === 'TD') return { ...NONE, zoom: { scale: 1.12, ms: 300, anchor: 'ball' }, burst: burst(CONFETTI, 24) };
      if (step.moment === 'END') return { ...NONE, burst: burst(CONFETTI, 12) };
      return NONE;
    default:
      return NONE;
  }
}

const PAN_X = 40;
const PAN_Y = 80;

/** O pan da câmera fica numa faixa central: o banner, que fica no meio do campo, não sai de quadro. */
export function panTarget(p: Point): Point {
  const cx = FIELD_WIDTH / 2;
  const cy = FIELD_HEIGHT / 2;
  return {
    x: Math.min(cx + PAN_X, Math.max(cx - PAN_X, p.x)),
    y: Math.min(cy + PAN_Y, Math.max(cy - PAN_Y, p.y)),
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run apps/client/test/fx.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/phaser/fx.ts apps/client/test/fx.test.ts
git commit -m "feat(client): planos de efeito do campo em módulo puro (fx.ts)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: aplicar os efeitos no `FieldScene`

**Files:**
- Modify: `apps/client/src/phaser/FieldScene.ts`
- Test: `apps/client/test/field-scene.test.ts`

**Interfaces:**
- Consumes: `fxFor`, `panTarget`, `BurstPlan`, `FxAnchor`, `ZoomPlan` de `./fx` (Tarefa 2); `Point` de `./choreography` (já importado).
- Produces: nada que outra tarefa use.

- [ ] **Step 1: Ajustar o harness do teste e escrever os testes que falham**

Em `apps/client/test/field-scene.test.ts`:

1. Logo antes de `function fakeScene()`, acrescente:

```ts
/** Câmera falsa: tudo é espião; setZoom e centerOn devolvem a própria câmera (encadeiam). */
const fakeCamera = () => ({
  shake: vi.fn(), flash: vi.fn(), zoomTo: vi.fn(), pan: vi.fn(), resetFX: vi.fn(),
  setZoom: vi.fn().mockReturnThis(), centerOn: vi.fn().mockReturnThis(),
});
```

2. Em `fakeScene`, troque a linha de `scene.add = {...}` para incluir `particles`:

```ts
  scene.add = {
    graphics: factory('graphics'), tileSprite: factory('tileSprite'), image: factory('image'), text: factory('text'),
    rectangle: factory('rectangle'), ellipse: factory('ellipse'), circle: factory('circle'), container: factory('container'),
    particles: factory('particles'),
  };
```

3. Troque `scene.cameras = { main: { shake: () => {}, flash: () => {} } };` (dentro de `fakeScene`) por:

```ts
  scene.cameras = { main: fakeCamera() };
```

4. Em `playSteps`, troque a assinatura e a câmera:

```ts
function playSteps(t2: typeof t, steps: any[], opts: { reduced?: boolean; coarse?: boolean } = {}) {
  const tweens: any[] = [];
  const counters: any[] = [];
  const camera = fakeCamera();
  t2.scene.create();
  t2.scene.reduced = !!opts.reduced;
  t2.scene.coarse = !!opts.coarse;
```

(o resto de `playSteps` fica como está).

5. No teste `'blitz contra corrida'`, troque `t.scene.cameras = { main: { shake: () => {}, flash: () => {} } };` por `t.scene.cameras = { main: fakeCamera() };`.

6. No teste `'gera as texturas de grama e de zona de gol no código'`, troque o `toEqual` por:

```ts
    expect(generated).toEqual([['grass-noise', 32, 32], ['endzone-stripes', 16, 16], ['fx-spark', 2, 2]]);
```

7. Acrescente ao final do arquivo:

```ts
describe('FieldScene: efeitos dos momentos raros', () => {
  const banner = (moment?: string) => ({ kind: 'BANNER', text: 'TOUCHDOWN!', tone: 'good', moment, at: 0, duration: 800 });
  const tackle = { kind: 'TACKLE', by: 95, carrier: 25, at: 0, duration: 300 };
  afterEach(() => vi.useRealTimers());

  it('TD: confete na textura fx-spark, zoom e pan na bola', () => {
    const { camera } = playSteps(t, [banner('TD')]);
    const burst = t.of('particles')[0];
    expect(burst.args[2]).toBe('fx-spark');
    expect(burst.calls).toContainEqual({ method: 'explode', args: [24] });
    expect(camera.zoomTo).toHaveBeenCalledWith(1.12, 300, 'Sine.easeOut', true);
    expect(camera.pan).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 300, 'Sine.easeOut', true);
  });

  it('em toque o confete cai para 12 partículas', () => {
    playSteps(t, [banner('TD')], { coarse: true });
    expect(t.of('particles')[0].calls).toContainEqual({ method: 'explode', args: [12] });
  });

  it('jogadas comuns não geram partículas nem zoom', () => {
    const { camera } = playSteps(t, [runStep('RUN_INSIDE'), throwStep('DEEP_PASS'), banner(undefined)]);
    expect(t.of('particles')).toHaveLength(0);
    expect(camera.zoomTo).not.toHaveBeenCalled();
  });

  it('reduced motion: sem partículas, zoom nem hit-stop', () => {
    vi.useFakeTimers();
    const { camera } = playSteps(t, [banner('TD'), clash({ mult: 4 })], { reduced: true });
    expect(t.of('particles')).toHaveLength(0);
    expect(camera.zoomTo).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(t.scene.tweens.timeScale).toBe(1);
  });

  it('CLASH ×4 solta estilhaços e SACK solta poeira', () => {
    playSteps(t, [clash({ mult: 4 }), { kind: 'SACK', qb: 63, by: 95, yards: 7, at: 0, duration: 650 }]);
    expect(t.of('particles').map((p) => p.calls.find((c) => c.method === 'explode')!.args[0])).toEqual([16, 12]);
  });

  it('TACKLE inclina o corpo do portador e volta', () => {
    const { tweens } = playSteps(t, [tackle]);
    const body = t.of('image').find((c) => c.args[2] === 'back-25')!;
    expect(tweens.some((c) => c.targets === body.proxy && c.angle === 12 && c.yoyo)).toBe(true);
  });

  it('o layout() reseta a câmera', () => {
    const { camera } = playSteps(t, []);
    expect(camera.resetFX).toHaveBeenCalled();
    expect(camera.setZoom).toHaveBeenCalledWith(1);
    expect(camera.centerOn).toHaveBeenCalledWith(FIELD_WIDTH / 2, FIELD_HEIGHT / 2);
  });
});

describe('FieldScene: hit-stop', () => {
  afterEach(() => vi.useRealTimers());

  it('CLASH congela os relógios do Phaser e os devolve após 70 ms', () => {
    vi.useFakeTimers();
    playSteps(t, [clash({ mult: 1 })]);
    expect(t.scene.tweens.timeScale).toBe(0);
    expect(t.scene.time.timeScale).toBe(0);
    vi.advanceTimersByTime(70);
    expect(t.scene.tweens.timeScale).toBe(1);
    expect(t.scene.time.timeScale).toBe(1);
  });

  it('um layout() no meio do hit-stop devolve os relógios na hora', () => {
    vi.useFakeTimers();
    playSteps(t, [clash({ mult: 1 })]);
    expect(t.scene.tweens.timeScale).toBe(0);
    t.scene.sync(stage({ turnId: 2 }), null);
    expect(t.scene.tweens.timeScale).toBe(1);
    expect(t.scene.time.timeScale).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('dois CLASH seguidos não vazam o temporizador do primeiro', () => {
    vi.useFakeTimers();
    playSteps(t, [clash({ mult: 1 }), clash({ mult: 1 })]);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(70);
    expect(t.scene.tweens.timeScale).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
```

8. No topo do arquivo, inclua `afterEach` no import do vitest:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/field-scene.test.ts`
Expected: FAIL (`fx-spark` não gerada, `explode`/`zoomTo` nunca chamados, `timeScale` indefinido).

- [ ] **Step 3: Implementar em `FieldScene.ts`**

1. Imports. Depois da linha de `./choreography`, acrescente:

```ts
import { fxFor, panTarget, type BurstPlan, type FxAnchor, type ZoomPlan } from './fx';
```

2. Constantes. Logo após `const ENDZONE_KEY = 'endzone-stripes';`:

```ts
const SPARK_KEY = 'fx-spark';
```

e logo após a linha de `reducedMotion`:

```ts
const coarsePointer = (): boolean => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
```

3. Campos. Depois de `private reduced = false;`:

```ts
  private coarse = false;
  private hitStopTimer: ReturnType<typeof setTimeout> | null = null;
```

4. Em `create()`, logo após `this.reduced = reducedMotion();`:

```ts
    this.coarse = coarsePointer();
```

5. Em `makeTextures()`, antes do `}` final do método (depois do `stripes.destroy();`):

```ts
    // faísca 2x2 branca: as partículas a tingem com a paleta
    const spark = this.make.graphics({ x: 0, y: 0 }, false);
    spark.fillStyle(0xffffff, 1).fillRect(0, 0, 2, 2);
    spark.generateTexture(SPARK_KEY, 2, 2);
    spark.destroy();
```

6. Em `layout()`, logo após `this.tweens.killAll();`:

```ts
    this.releaseHitStop();
    this.cameras.main.resetFX();
    this.cameras.main.setZoom(1).centerOn(FIELD_WIDTH / 2, FIELD_HEIGHT / 2);
```

7. Métodos novos, antes de `private runStep(...)`:

```ts
  /** Devolve o relógio normal ao Phaser (fim do hit-stop ou nova jogada). */
  private releaseHitStop(): void {
    if (this.hitStopTimer !== null) {
      clearTimeout(this.hitStopTimer);
      this.hitStopTimer = null;
    }
    this.tweens.timeScale = 1;
    this.time.timeScale = 1;
  }

  /** Congela tweens e agendamentos por `ms`. O relógio do Phaser fica parado, então a retomada usa o do navegador. */
  private hitStop(ms: number): void {
    if (ms <= 0) return;
    if (this.hitStopTimer !== null) clearTimeout(this.hitStopTimer);
    const gen = this.generation;
    this.tweens.timeScale = 0;
    this.time.timeScale = 0;
    this.hitStopTimer = setTimeout(() => {
      if (gen === this.generation) this.releaseHitStop();
    }, ms);
  }

  private anchorPoint(anchor: FxAnchor, focus: Point | null): Point {
    if (focus) return focus;
    if (anchor === 'qb') {
      const qb = this.bySlot('offense', 'QB')[0];
      if (qb) return { x: qb.container.x, y: qb.container.y };
    }
    return { x: this.ball.x, y: this.ball.y };
  }

  private zoomOn(plan: ZoomPlan, focus: Point | null): void {
    const p = panTarget(this.anchorPoint(plan.anchor, focus));
    const cam = this.cameras.main;
    cam.zoomTo(plan.scale, plan.ms, 'Sine.easeOut', true);
    cam.pan(p.x, p.y, plan.ms, 'Sine.easeOut', true);
  }

  /** Rajada única de partículas; o emissor morre sozinho e o layout() também o destrói. */
  private burst(plan: BurstPlan, at: Point): void {
    const emitter = this.add
      .particles(at.x, at.y, SPARK_KEY, {
        emitting: false,
        lifespan: plan.lifespan,
        speed: { min: plan.speedMin, max: plan.speedMax },
        angle: { min: plan.angleMin, max: plan.angleMax },
        gravityY: plan.gravityY,
        tint: plan.colors,
        scale: { start: 2, end: 1 },
        alpha: { start: 1, end: 0 },
      })
      .setDepth(35);
    this.transient.push(emitter);
    emitter.explode(plan.count);
    this.time.delayedCall(plan.lifespan + 100, () => emitter.destroy());
  }

  /** Aplica o plano de efeitos do passo (fx.ts). `focus` é o ponto do passo, quando ele tem um. */
  private applyFx(step: AnimStep, focus: Point | null = null, carrier?: PlayerSprite): void {
    const plan = fxFor(step, { reduced: this.reduced, coarse: this.coarse });
    this.hitStop(plan.hitStop);
    if (plan.tilt !== null && carrier) {
      this.tweens.add({ targets: carrier.body, angle: plan.tilt, duration: step.duration / 2, yoyo: true });
    }
    if (plan.zoom) this.zoomOn(plan.zoom, focus);
    if (plan.burst) this.burst(plan.burst, this.anchorPoint(plan.burst.anchor, focus));
  }
```

8. Chamadas em `runStep` (cada uma é uma linha nova):

- `case 'CLASH'`: logo antes de `// Blitz contra corrida ou screen não tem bloqueio...`, acrescente `this.applyFx(step, { x: mx, y: my });`
- `case 'TACKLE'`: depois do `this.tweens.add({ targets: by.container, ... });`, acrescente `this.applyFx(step, null, carrier);`
- `case 'SACK'`: depois do `this.floatText(qb.container.x, y - 30, 'SACK!', '#f86858');`, acrescente `this.applyFx(step, { x: qb.container.x, y });`
- `case 'TURNOVER'`: depois da linha do tween da bola, acrescente `this.applyFx(step);`
- `case 'KICK'`: depois do tween, acrescente `this.applyFx(step, { x: this.ball.x + drift, y });`
- `case 'BANNER'`: depois do `this.time.delayedCall(step.duration, () => this.banner.setVisible(false));`, acrescente `this.applyFx(step);`

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run apps/client/test/field-scene.test.ts apps/client/test/choreography.test.ts`
Expected: PASS. Se algum teste antigo falhar por `cameras.main.resetFX is not a function`, é um `scene.cameras = { main: {...} }` que sobrou: troque-o por `{ main: fakeCamera() }`.

Run: `npm run typecheck`
Expected: sem erros (o typecheck valida `particles`, `zoomTo`, `pan`, `resetFX`, `timeScale` contra os tipos do Phaser 3.90).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/phaser/FieldScene.ts apps/client/test/field-scene.test.ts
git commit -m "feat(client): partículas, zoom, hit-stop e inclinação no campo" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: helper `lib/motion.ts`

**Files:**
- Create: `apps/client/src/lib/motion.ts`
- Test: `apps/client/test/motion.test.tsx`

**Interfaces:**
- Consumes: nada.
- Produces (Tarefas 6, 7 e 8):

```ts
export const reducedMotion: () => boolean;
export function flyFrom(el: Element, from: DOMRect, opts?: { duration?: number; steps?: number }): Animation | null;
export function rememberPick(rect: DOMRect, now?: number): void;
export function takePick(now?: number): DOMRect | null;
export function useChangeFlash(value: unknown, active?: boolean, ms?: number): boolean;
```

- [ ] **Step 1: Escrever o teste que falha**

Crie `apps/client/test/motion.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { flyFrom, rememberPick, reducedMotion, takePick, useChangeFlash } from '../src/lib/motion';

const rect = (left: number, top: number) => ({ left, top }) as DOMRect;

function stubMatchMedia(reduce: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: reduce }) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  vi.useRealTimers();
  delete (window as { matchMedia?: unknown }).matchMedia;
  delete (Element.prototype as { animate?: unknown }).animate;
});

describe('reducedMotion', () => {
  it('lê prefers-reduced-motion', () => {
    stubMatchMedia(true);
    expect(reducedMotion()).toBe(true);
    stubMatchMedia(false);
    expect(reducedMotion()).toBe(false);
  });
});

describe('flyFrom', () => {
  it('anima do retângulo de origem até onde o elemento está (translate → none, em steps)', () => {
    const animate = vi.fn().mockReturnValue({});
    (Element.prototype as { animate?: unknown }).animate = animate;
    const el = document.createElement('div');
    expect(flyFrom(el, rect(200, 300))).not.toBeNull();
    const [frames, options] = animate.mock.calls[0];
    expect(frames).toEqual([{ transform: 'translate(200px, 300px)' }, { transform: 'none' }]);
    expect(options).toMatchObject({ duration: 240, easing: 'steps(4, end)' });
  });

  it('sem Element.animate (jsdom, navegador antigo) não faz nada e não quebra', () => {
    expect(flyFrom(document.createElement('div'), rect(200, 300))).toBeNull();
  });

  it('com movimento reduzido não anima', () => {
    const animate = vi.fn();
    (Element.prototype as { animate?: unknown }).animate = animate;
    stubMatchMedia(true);
    expect(flyFrom(document.createElement('div'), rect(200, 300))).toBeNull();
    expect(animate).not.toHaveBeenCalled();
  });

  it('se o elemento já está no lugar, não anima', () => {
    const animate = vi.fn();
    (Element.prototype as { animate?: unknown }).animate = animate;
    expect(flyFrom(document.createElement('div'), rect(0, 0))).toBeNull();
    expect(animate).not.toHaveBeenCalled();
  });
});

describe('carta escolhida (rememberPick / takePick)', () => {
  beforeEach(() => void takePick());

  it('é consumida uma vez', () => {
    rememberPick(rect(1, 2), 1000);
    expect(takePick(1500)).toEqual(rect(1, 2));
    expect(takePick(1500)).toBeNull();
  });

  it('expira depois de 60 s e some mesmo assim', () => {
    rememberPick(rect(1, 2), 1000);
    expect(takePick(1000 + 60_001)).toBeNull();
    expect(takePick(1000)).toBeNull();
  });

  it('sem retângulo guardado devolve null', () => {
    expect(takePick()).toBeNull();
  });
});

describe('useChangeFlash', () => {
  it('não pisca na montagem; pisca ao mudar e apaga depois de ms', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useChangeFlash(v, true, 600), { initialProps: { v: 0 } });
    expect(result.current).toBe(false);
    rerender({ v: 1 });
    expect(result.current).toBe(true);
    act(() => void vi.advanceTimersByTime(600));
    expect(result.current).toBe(false);
  });

  it('só pisca quando active fica verdadeiro (não adianta o resultado)', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v, a }) => useChangeFlash(v, a, 600), { initialProps: { v: 0, a: false } });
    rerender({ v: 7, a: false });
    expect(result.current).toBe(false);
    rerender({ v: 7, a: true });
    expect(result.current).toBe(true);
  });

  it('desativar no meio do piscar não deixa a classe presa', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v, a }) => useChangeFlash(v, a, 600), { initialProps: { v: 0, a: true } });
    rerender({ v: 1, a: true });
    rerender({ v: 1, a: false });
    act(() => void vi.advanceTimersByTime(600));
    expect(result.current).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/motion.test.tsx`
Expected: FAIL (`Cannot find module '../src/lib/motion'`).

- [ ] **Step 3: Implementar**

Crie `apps/client/src/lib/motion.ts`:

```ts
import { useEffect, useRef, useState } from 'react';

/** O reset global de app.css zera animation/transition em reduced, mas não a WAAPI nem as view transitions: quem as usa pergunta aqui. */
export const reducedMotion = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

interface FlyOptions {
  duration?: number;
  steps?: number;
}

/** Anima `el` da posição `from` até onde ele está agora (FLIP via WAAPI). Sem suporte, em reduced ou já no lugar: nada. */
export function flyFrom(el: Element, from: DOMRect, { duration = 240, steps = 4 }: FlyOptions = {}): Animation | null {
  if (reducedMotion() || typeof el.animate !== 'function') return null;
  const to = el.getBoundingClientRect();
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  if (dx === 0 && dy === 0) return null;
  return el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
    duration,
    easing: `steps(${steps}, end)`,
    fill: 'backwards',
  });
}

const PICK_TTL_MS = 60_000;
let pick: { rect: DOMRect; at: number } | null = null;

/** Guarda onde estava a carta escolhida; a revelação, que chega depois, a consome para a carta "voar" da mão. */
export function rememberPick(rect: DOMRect, now = Date.now()): void {
  pick = { rect, at: now };
}

/** Devolve o retângulo guardado (uma vez só) ou null se não há ou se já expirou. */
export function takePick(now = Date.now()): DOMRect | null {
  const p = pick;
  pick = null;
  return p && now - p.at <= PICK_TTL_MS ? p.rect : null;
}

/**
 * `true` por `ms` depois que `value` muda. Não pisca na montagem. Com `active` falso a mudança espera:
 * o RESULT já grava o placar final no começo da jogada, e o piscar não pode adiantar o resultado.
 */
export function useChangeFlash(value: unknown, active = true, ms = 600): boolean {
  const seen = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [on, setOn] = useState(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!active || Object.is(seen.current, value)) return;
    seen.current = value;
    setOn(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOn(false), ms);
  }, [value, active, ms]);
  return on;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run apps/client/test/motion.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/lib/motion.ts apps/client/test/motion.test.tsx
git commit -m "feat(client): helper de movimento (WAAPI, carta escolhida, piscar em mudança)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: barras de stat com `scaleX`

**Files:**
- Modify: `apps/client/src/components/StatBars.tsx`, `apps/client/src/components/ui.css`
- Test: `apps/client/test/stat-bars.test.tsx`

**Interfaces:**
- Consumes: `statRatio`, `statTier` de `../lib/design` (já usados).
- Produces: nada que outra tarefa use.

- [ ] **Step 1: Escrever o teste que falha**

Crie `apps/client/test/stat-bars.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { StatBars } from '../src/components/StatBars';
import { statRatio } from '../src/lib/design';

afterEach(cleanup);

const stats = { hp: 45, attack: 49, defense: 49, spAttack: 65, spDefense: 65, speed: 45 };

describe('<StatBars>', () => {
  it('cada barra tem largura cheia e a razão em --r (transform, nunca width)', () => {
    const { container } = render(<StatBars stats={stats} />);
    const fills = [...container.querySelectorAll<HTMLElement>('.stat-fill')];
    expect(fills).toHaveLength(6);
    expect(fills[0].style.getPropertyValue('--r')).toBe(String(statRatio(45)));
    expect(fills[3].style.getPropertyValue('--r')).toBe(String(statRatio(65)));
    for (const f of fills) expect(f.style.width).toBe('');
  });

  it('cada linha traz o índice em --i para o escalonamento', () => {
    const { container } = render(<StatBars stats={stats} />);
    const rows = [...container.querySelectorAll<HTMLElement>('.stat-row')];
    expect(rows.map((r) => r.style.getPropertyValue('--i'))).toEqual(['0', '1', '2', '3', '4', '5']);
  });

  it('mantém o medidor acessível com o valor real', () => {
    const { container } = render(<StatBars stats={stats} />);
    const meter = container.querySelectorAll('[role="meter"]')[1];
    expect(meter.getAttribute('aria-valuenow')).toBe('49');
  });

  it('trocar o valor remonta a linha (a animação repete ao trocar de espécie)', () => {
    const { container, rerender } = render(<StatBars stats={stats} />);
    const before = container.querySelector('.stat-fill');
    rerender(<StatBars stats={{ ...stats, hp: 100 }} />);
    expect(container.querySelector('.stat-fill')).not.toBe(before);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/stat-bars.test.tsx`
Expected: FAIL (`--r` vazio, `style.width` preenchido).

- [ ] **Step 3: Implementar**

Em `apps/client/src/components/StatBars.tsx`, troque a primeira linha de import por:

```tsx
import type { CSSProperties } from 'react';
import type { Species } from '@pfl/engine';
```

e o `map` (de `{ROWS.map(...` até o `})}`) por:

```tsx
      {ROWS.map(({ key, label }, i) => {
        const value = stats[key];
        return (
          // stat:valor no key: ao trocar de espécie o valor muda, a linha remonta e a animação repete
          <li key={`${key}:${value}`} className="stat-row" style={{ '--i': i } as CSSProperties}>
            <span className="stat-label">{label}</span>
            <span className="stat-value">{value}</span>
            <span
              className="stat-track"
              role="meter"
              aria-label={label}
              aria-valuemin={0}
              aria-valuemax={STAT_MAX}
              aria-valuenow={value}
            >
              <span
                className="stat-fill"
                style={{ '--r': statRatio(value), background: `var(--stat-${statTier(value)})` } as CSSProperties}
              />
            </span>
          </li>
        );
      })}
```

Em `apps/client/src/components/ui.css`, troque o bloco `.stat-fill` por:

```css
/* a barra tem largura cheia e encolhe com scaleX (transform, não width) */
.stat-fill {
  display: block;
  height: 100%;
  width: 100%;
  transform-origin: left;
  transform: scaleX(var(--r, 1));
}

@media (prefers-reduced-motion: no-preference) {
  .stat-fill { animation: stat-grow 300ms steps(6, end) calc(var(--i, 0) * 50ms) backwards; }
}

@keyframes stat-grow {
  from { transform: scaleX(0); }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run apps/client/test/stat-bars.test.tsx apps/client/test/css-platform.test.ts apps/client/test/contrast.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/components/StatBars.tsx apps/client/src/components/ui.css apps/client/test/stat-bars.test.tsx
git commit -m "feat(client): barras de stat crescem com scaleX em steps" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: mão de cartas, carta jogada e banner de leitura

**Files:**
- Modify: `apps/client/src/components/CardTile.tsx`, `apps/client/src/screens/match/CardHand.tsx`, `apps/client/src/screens/match/RevealBanner.tsx`, `apps/client/src/screens/match/MatchScreen.tsx`, `apps/client/src/screens/match/match.css`
- Test: `apps/client/test/card-hand.test.tsx` (novo), `apps/client/test/reveal-banner.test.tsx` (acrescentar)

**Interfaces:**
- Consumes: `rememberPick`, `takePick`, `flyFrom` de `../lib/motion` (Tarefa 4).
- Produces: `CardTile` aceita `enterIndex?: number` e `onClick?: (rect: DOMRect | null) => void`; `RevealBanner` aceita `side?: 'offense' | 'defense'`.

- [ ] **Step 1: Escrever os testes que falham**

Crie `apps/client/test/card-hand.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { CardHand } from '../src/screens/match/CardHand';
import { takePick } from '../src/lib/motion';
import { makeView } from './fixtures';

beforeEach(() => void takePick());
afterEach(cleanup);

describe('<CardHand>', () => {
  it('cada carta traz o índice em --i para a entrada escalonada', () => {
    const { container } = render(<CardHand view={makeView()} canPick={() => true} onPick={() => {}} />);
    const tiles = [...container.querySelectorAll<HTMLElement>('.card-tile')];
    expect(tiles.length).toBeGreaterThan(1);
    expect(tiles.map((t) => t.style.getPropertyValue('--i'))).toEqual(tiles.map((_, i) => String(i)));
  });

  it('ao escolher, guarda o retângulo da carta e chama onPick', () => {
    const onPick = vi.fn();
    const { container } = render(<CardHand view={makeView()} canPick={() => true} onPick={onPick} />);
    fireEvent.click(container.querySelector('.card-tile .card-face')!);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(takePick()).not.toBeNull();
  });
});
```

Em `apps/client/test/reveal-banner.test.tsx`, troque o import do vitest e o de `@testing-library/react`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
```

adicione `import { rememberPick, takePick } from '../src/lib/motion';` junto dos imports, e acrescente ao final do arquivo:

```tsx
describe('<RevealBanner> carta jogada', () => {
  const reveal = { offense: 'basic_run', defense: 'basic_defense', read: 'RIGHT' as const };
  const rect = { left: 200, top: 300 } as DOMRect;
  let animate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    takePick();
    animate = vi.fn().mockReturnValue({});
    (Element.prototype as { animate?: unknown }).animate = animate;
  });
  afterEach(() => {
    delete (Element.prototype as { animate?: unknown }).animate;
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('a carta do próprio jogador voa da mão (ataque)', () => {
    rememberPick(rect);
    const { container } = render(<RevealBanner reveal={reveal} side="offense" />);
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.instances[0]).toBe(container.querySelector('.reveal-offense'));
  });

  it('a carta do próprio jogador voa da mão (defesa)', () => {
    rememberPick(rect);
    const { container } = render(<RevealBanner reveal={reveal} side="defense" />);
    expect(animate.mock.instances[0]).toBe(container.querySelector('.reveal-defense'));
  });

  it('sem retângulo guardado, ou sem side, ou em reduced: a carta só aparece', () => {
    render(<RevealBanner reveal={reveal} side="offense" />);
    cleanup();
    rememberPick(rect);
    render(<RevealBanner reveal={reveal} />);
    cleanup();
    rememberPick(rect);
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    render(<RevealBanner reveal={reveal} side="offense" />);
    expect(animate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/card-hand.test.tsx apps/client/test/reveal-banner.test.tsx`
Expected: FAIL (`--i` vazio, `takePick()` nulo, `animate` nunca chamado).

- [ ] **Step 3: Implementar**

**`CardTile.tsx`:**

1. Import: troque a primeira linha por `import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';`
2. Em `interface Props`, troque a linha do `onClick` e acrescente `enterIndex`:

```tsx
  /** posição na mão: escalona a entrada (`--i` no CSS) */
  enterIndex?: number;
  /** recebe onde o tile estava na tela, para a carta "voar" da mão na revelação */
  onClick?: (rect: DOMRect | null) => void;
```

3. Na assinatura: `export function CardTile({ card, disabled = false, selected = false, badge, enterIndex, onClick }: Props) {`
4. Em `const act = () => {...}`, troque `onClick?.();` por:

```tsx
    onClick?.(tileRef.current?.getBoundingClientRect() ?? null);
```

5. No `<div ref={tileRef} className=...>` raiz, acrescente depois do `className`:

```tsx
      style={enterIndex === undefined ? undefined : ({ '--i': enterIndex } as CSSProperties)}
```

**`CardHand.tsx`:** acrescente `import { rememberPick } from '../../lib/motion';` e troque o `map` por:

```tsx
      {handEntries(view).map((entry, i) => {
        const card = findCard(entry.cardId);
        if (!card) return null;
        const badge = entry.source === 'BASIC' ? 'básica' : entry.source === 'SPECIAL' ? '4º down' : undefined;
        return (
          <CardTile
            key={entry.key}
            card={card}
            badge={badge}
            enterIndex={i}
            disabled={!canPick(entry.cardId)}
            onClick={(rect) => {
              if (rect) rememberPick(rect);
              onPick(entry.cardId);
            }}
          />
        );
      })}
```

**`RevealBanner.tsx`:** troque o arquivo inteiro por:

```tsx
import { useEffect, useRef } from 'react';
import { findCard } from '@pfl/engine';
import type { CardReveal } from '../../match/matchState';
import { READ_LABELS, READ_SYMBOL } from '../../lib/names';
import { flyFrom, takePick } from '../../lib/motion';
import './match.css';

interface Props {
  reveal: CardReveal | null;
  /** lado do jogador: a carta dele "voa" da mão até aqui */
  side?: 'offense' | 'defense';
}

/** Revelação simultânea das cartas com destaque da leitura ✔/·/✖ (spec 6.2). */
export function RevealBanner({ reveal, side }: Props) {
  const mine = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!reveal || !side || !mine.current) return;
    const from = takePick();
    if (from) flyFrom(mine.current, from);
  }, [reveal, side]);
  if (!reveal) return null;
  const off = findCard(reveal.offense)?.name ?? reveal.offense;
  const def = findCard(reveal.defense)?.name ?? reveal.defense;
  const tone = reveal.read ? reveal.read.toLowerCase() : 'kick';
  return (
    <div className={`reveal reveal-${tone}`} role="status">
      <span className="reveal-card reveal-offense" ref={side === 'offense' ? mine : undefined}>
        <span className="reveal-side">Ataque</span>
        <span className="reveal-name">{off}</span>
      </span>
      <span className="reveal-vs" aria-hidden="true">
        ×
      </span>
      <span className="reveal-card reveal-defense" ref={side === 'defense' ? mine : undefined}>
        <span className="reveal-side">Defesa</span>
        <span className="reveal-name">{def}</span>
      </span>
      {reveal.read && (
        <span className="reveal-read reveal-stamp">
          <span className="reveal-symbol" aria-hidden="true">
            {READ_SYMBOL[reveal.read]}
          </span>{' '}
          {READ_LABELS[reveal.read]}
        </span>
      )}
    </div>
  );
}
```

**`MatchScreen.tsx`:** troque a linha do banner por:

```tsx
        {animating && <RevealBanner reveal={state.reveal} side={view.side === 'offense' ? 'offense' : 'defense'} />}
```

**`match.css`:** logo depois do bloco `@keyframes reveal-stamp {...}`, acrescente:

```css
/* A leitura dá um aceno depois do carimbo (240 ms + 150 ms): acerto pulsa o símbolo, erro desbota a carta de ataque. */
@media (prefers-reduced-motion: no-preference) {
  .reveal-right .reveal-symbol { display: inline-block; animation: reveal-pulse 150ms steps(3, end) 390ms both; }
  .reveal-wrong .reveal-offense { animation: reveal-fade 240ms steps(3, end) 390ms both; }
}

@keyframes reveal-pulse {
  50% { transform: scale(1.35); }
}

@keyframes reveal-fade {
  to { opacity: 0.45; }
}
```

e logo depois do bloco `.hand .card-tile { display: flex; }`, acrescente:

```css
/* entrada da mão: o painel remonta a cada turno, então toda carta anima; curto (≈ 300 ms no total) e nunca bloqueia o clique */
@media (prefers-reduced-motion: no-preference) {
  .hand .card-tile { animation: hand-in 120ms steps(3, end) calc(var(--i, 0) * 40ms) backwards; }
}

@keyframes hand-in {
  from { transform: translateY(8px); opacity: 0; }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run apps/client/test/card-hand.test.tsx apps/client/test/reveal-banner.test.tsx apps/client/test/card-tile-touch.test.tsx apps/client/test/arrow-nav.test.tsx apps/client/test/css-platform.test.ts`
Expected: PASS. Rode também `npm run typecheck` (o novo tipo de `onClick` precisa aceitar os outros usos de `CardTile`, que passam `() => void`).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/components/CardTile.tsx apps/client/src/screens/match apps/client/test/card-hand.test.tsx apps/client/test/reveal-banner.test.tsx
git commit -m "feat(client): entrada da mão, carta jogada voa até a revelação e leitura com aceno" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: placar e down & distância piscam ao assentar

**Files:**
- Modify: `apps/client/src/screens/match/Hud.tsx`, `apps/client/src/screens/match/MatchScreen.tsx`, `apps/client/src/screens/match/match.css`
- Test: `apps/client/test/hud.test.tsx`

**Interfaces:**
- Consumes: `useChangeFlash` (Tarefa 4); `makeView` de `./fixtures`.
- Produces: `Hud` aceita `settled?: boolean` (padrão `true`).

- [ ] **Step 1: Escrever o teste que falha**

Crie `apps/client/test/hud.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { Hud } from '../src/screens/match/Hud';
import { makeView } from './fixtures';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const names = { A: 'Time A', B: 'Time B' };
const hud = (a: number, settled: boolean) => (
  <Hud view={makeView({ score: { A: a, B: 0 } })} names={names} seconds={null} settled={settled} />
);

describe('<Hud> piscar ao mudar', () => {
  it('não pisca na montagem', () => {
    const { container } = render(hud(0, true));
    expect(container.querySelector('.is-changed')).toBeNull();
  });

  it('o placar não pisca enquanto a jogada anima e pisca quando ela assenta', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(hud(0, true));
    rerender(hud(7, false));
    expect(container.querySelector('.hud-scores.is-changed')).toBeNull();
    rerender(hud(7, true));
    expect(container.querySelector('.hud-scores.is-changed')).not.toBeNull();
    act(() => void vi.advanceTimersByTime(600));
    expect(container.querySelector('.hud-scores.is-changed')).toBeNull();
  });

  it('sem a prop settled, pisca na hora (padrão true)', () => {
    const { container, rerender } = render(<Hud view={makeView({ score: { A: 0, B: 0 } })} names={names} seconds={null} />);
    rerender(<Hud view={makeView({ score: { A: 3, B: 0 } })} names={names} seconds={null} />);
    expect(container.querySelector('.hud-scores.is-changed')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/hud.test.tsx`
Expected: FAIL (nenhum `.is-changed`).

- [ ] **Step 3: Implementar**

**`Hud.tsx`:** acrescente `import { useChangeFlash } from '../../lib/motion';` depois do import de `format`. Em `Props`, acrescente:

```tsx
  /** `false` enquanto a jogada anima: o placar já é o final, e o piscar só vale quando ela termina */
  settled?: boolean;
```

Troque a assinatura e as primeiras linhas do corpo:

```tsx
export function Hud({ view, names, seconds, settled = true }: Props) {
  const downText = formatDown(view.field, view.conversionAttempt);
  const scoreFlash = useChangeFlash(`${view.score.A}-${view.score.B}`, settled);
  const downFlash = useChangeFlash(downText, settled);
```

Troque `<span className="hud-scores">` por:

```tsx
        <span className={`hud-scores${scoreFlash ? ' is-changed' : ''}`}>
```

e a linha do down por:

```tsx
        <span className={`hud-seg hud-down${downFlash ? ' is-changed' : ''}`}>{downText}</span>
```

**`MatchScreen.tsx`:** troque a linha do `<Hud ...>` por:

```tsx
      <Hud view={view} names={state.names} seconds={animating ? null : timerSeconds(state, now)} settled={!animating} />
```

**`match.css`:** logo depois de `@keyframes hud-blink {...}`, acrescente:

```css
/* placar e down & distância piscam duas vezes (≈ 600 ms) quando mudam, já com a jogada assentada */
@media (prefers-reduced-motion: no-preference) {
  .hud-scores.is-changed,
  .hud-down.is-changed { animation: hud-blink 0.3s steps(2, jump-none) 2; }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run apps/client/test/hud.test.tsx apps/client/test/css-platform.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/screens/match apps/client/test/hud.test.tsx
git commit -m "feat(client): placar e down & distância piscam quando a jogada assenta" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: transição de telas

**Files:**
- Create: `apps/client/src/app/transition.ts`
- Modify: `apps/client/src/App.tsx`, `apps/client/src/styles/app.css`, `apps/client/src/screens/LobbyScreen.tsx`, `apps/client/src/screens/match/MatchScreen.tsx`, `apps/client/src/screens/end/EndScreen.tsx`, `apps/client/test/css-helpers.ts`
- Test: `apps/client/test/transition.test.ts`, `apps/client/test/motion-css.test.ts`

**Interfaces:**
- Consumes: `reducedMotion` (Tarefa 4).
- Produces: `withTransition(update: () => void, doc?: Document): void`; `ungatedAnimations(css, names)` em `css-helpers.ts`.

- [ ] **Step 1: Escrever os testes que falham**

Crie `apps/client/test/transition.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withTransition } from '../src/app/transition';

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
});

type Doc = Document & { startViewTransition?: unknown };

describe('withTransition', () => {
  it('sem suporte a startViewTransition aplica a atualização direto', () => {
    const update = vi.fn();
    withTransition(update, {} as Doc);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('com suporte, a atualização roda dentro da transição', () => {
    const update = vi.fn();
    const start = vi.fn((cb: () => void) => cb());
    withTransition(update, { startViewTransition: start } as unknown as Doc);
    expect(start).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('em reduced não abre transição, mas aplica a atualização', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    const update = vi.fn();
    const start = vi.fn();
    withTransition(update, { startViewTransition: start } as unknown as Doc);
    expect(start).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });
});
```

Crie `apps/client/test/motion-css.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { cssFiles, stripComments, ungatedAnimations } from './css-helpers';

/** Keyframes desta entrega: todos só podem ser usados dentro de prefers-reduced-motion: no-preference. */
const NEW_KEYFRAMES = ['stat-grow', 'hand-in', 'reveal-pulse', 'reveal-fade', 'screen-enter', 'vt-in', 'vt-out'];

describe('ungatedAnimations (o próprio detector)', () => {
  it('aceita animation dentro de no-preference', () => {
    expect(ungatedAnimations('@media (prefers-reduced-motion: no-preference) { .a { animation: foo 1s; } }', ['foo'])).toEqual([]);
  });
  it('acusa animation solta', () => {
    expect(ungatedAnimations('.a { color: red; animation: foo 1s steps(3) }', ['foo'])).toEqual(['animation: foo 1s steps(3)']);
  });
  it('ignora animation de outros nomes', () => {
    expect(ungatedAnimations('.a { animation: bar 1s; }', ['foo'])).toEqual([]);
  });
});

describe('animações novas', () => {
  const css = cssFiles().map((f) => stripComments(f.css)).join('\n');

  it.each(NEW_KEYFRAMES)('@keyframes %s existe', (name) => {
    expect(css).toContain(`@keyframes ${name}`);
  });

  it.each(cssFiles().map((f) => [f.file, f.css] as const))('%s: nenhuma animação nova fora de no-preference', (_file, source) => {
    expect(ungatedAnimations(source, NEW_KEYFRAMES)).toEqual([]);
  });

  it('nunca anima width nem height nas animações novas', () => {
    for (const name of NEW_KEYFRAMES) {
      const m = css.match(new RegExp(`@keyframes ${name}\\s*\\{([^@]*?)\\n\\}`));
      expect(m?.[1] ?? '', name).not.toMatch(/\b(width|height|top|left)\s*:/);
    }
  });
});
```

Em `apps/client/test/css-helpers.ts`, acrescente ao final:

```ts
/** Declarações `animation` que citam um dos `names` e não estão dentro de @media (prefers-reduced-motion: no-preference). */
export function ungatedAnimations(css: string, names: readonly string[]): string[] {
  const stack: string[] = [];
  const found: string[] = [];
  let buf = '';
  const flush = () => {
    const decl = buf.trim();
    buf = '';
    const gated = stack.some((s) => /prefers-reduced-motion:\s*no-preference/.test(s));
    if (!gated && /^animation(-name)?\s*:/.test(decl) && names.some((n) => decl.includes(n))) found.push(decl);
  };
  for (const ch of stripComments(css)) {
    if (ch === '{') {
      stack.push(buf.trim());
      buf = '';
    } else if (ch === '}') {
      flush();
      stack.pop();
    } else if (ch === ';') flush();
    else buf += ch;
  }
  return found;
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/transition.test.ts apps/client/test/motion-css.test.ts`
Expected: FAIL (`app/transition` não existe; `@keyframes screen-enter`, `vt-in`, `vt-out` não existem).

- [ ] **Step 3: Implementar**

Crie `apps/client/src/app/transition.ts`:

```ts
import { flushSync } from 'react-dom';
import { reducedMotion } from '../lib/motion';

type TransitionDoc = Document & { startViewTransition?: (update: () => void) => unknown };

/**
 * Troca de tela local (HOME ↔ BUILDER) com View Transition. As telas derivadas do servidor (LOBBY, MATCH, END)
 * não passam por aqui: a tela vem de `screenFor` e não de um setState que dê para envolver.
 * Sem suporte, ou em reduced (o reset global de app.css não alcança os pseudo-elementos), aplica na hora.
 */
export function withTransition(update: () => void, doc: TransitionDoc = document): void {
  if (reducedMotion() || typeof doc.startViewTransition !== 'function') {
    update();
    return;
  }
  doc.startViewTransition(() => flushSync(update));
}
```

Em `apps/client/src/App.tsx`:

1. Acrescente `import { withTransition } from './app/transition';` junto do import de `./app/screen`.
2. Troque `onBuilder={() => setLocal('BUILDER')}` por `onBuilder={() => withTransition(() => setLocal('BUILDER'))}`.
3. Troque `<BuilderScreen onBack={() => setLocal('HOME')} />` por `<BuilderScreen onBack={() => withTransition(() => setLocal('HOME'))} />`.

(O `setLocal('HOME')` dentro de `leave` não muda: é a saída de uma sala, sem transição.)

Em `apps/client/src/styles/app.css`, logo antes do bloco `@media (prefers-reduced-motion: reduce)` final, acrescente:

```css
/* View Transition de HOME ↔ BUILDER: crossfade em passos, no tom do resto do app */
@media (prefers-reduced-motion: no-preference) {
  ::view-transition-old(root) { animation: vt-out 200ms steps(4, end) both; }
  ::view-transition-new(root) { animation: vt-in 200ms steps(4, end) both; }

  /* LOBBY, MATCH e END entram com um passo curto; HOME e BUILDER já têm a view transition */
  .screen-enter { animation: screen-enter 180ms steps(3, end); }
}

@keyframes vt-out {
  to { opacity: 0; }
}

@keyframes vt-in {
  from { opacity: 0; }
}

@keyframes screen-enter {
  from { opacity: 0; transform: translateY(6px); }
}
```

Nas telas (uma classe a mais em cada `<main>`):

- `LobbyScreen.tsx`: `<main className="screen lobby">` → `<main className="screen lobby screen-enter">`
- `MatchScreen.tsx`: `<main className="match">` → `<main className="match screen-enter">` (o `<main className="screen screen-center">` do "Sincronizando..." não muda)
- `EndScreen.tsx`: `<main className="screen end">` → `<main className="screen end screen-enter">`

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run apps/client/test/transition.test.ts apps/client/test/motion-css.test.ts apps/client/test/css-platform.test.ts apps/client/test/mobile-first.test.ts apps/client/test/home-screen.test.tsx apps/client/test/lobby-screen.test.tsx`
Expected: PASS. Se `mobile-first.test.ts` ou outro teste de CSS acusar o `.screen-enter`, ajuste o teste para tolerar o seletor novo (ele só anima `opacity` e `transform`).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src apps/client/test
git commit -m "feat(client): view transition HOME↔BUILDER e entrada das telas derivadas" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: verificação final

**Files:**
- Nenhum arquivo novo; só a verificação.

**Interfaces:**
- Consumes: tudo acima.
- Produces: o PR pronto para revisão.

- [ ] **Step 1: Suíte completa e tipos**

Run: `npm run typecheck && npm test`
Expected: tudo verde. `audio-cues.test.ts` passa sem ter sido editado (`git diff main --stat -- apps/client/src/audio apps/client/test/audio-cues.test.ts` deve sair vazio).

- [ ] **Step 2: Provar que o escopo ficou só no cliente**

Run: `git diff main --stat -- packages apps/server`
Expected: saída vazia.

- [ ] **Step 3: Build do cliente**

Run: `npm run build:client`
Expected: build conclui sem erro.

- [ ] **Step 4: Verificação manual (a sensação de movimento só se julga rodando)**

Run: `npm run dev:server` e, em outro terminal, `npm run dev:client`. Abra duas abas e jogue uma partida completa. Confira:

- [ ] TD: confete e zoom curto; fim de jogo: confete leve; troca de posse: estilhaços vermelhos; SACK: poeira; field goal bom: faíscas; CLASH ×4: estilhaços.
- [ ] Jogada comum (corrida, passe curto): só hit-stop curto no choque e a inclinação no tackle; **nenhuma** partícula nem zoom.
- [ ] O hit-stop não trava: jogadas seguidas rodam normalmente, inclusive ao pular para a próxima jogada.
- [ ] Mão de cartas entra escalonada e a carta escolhida voa até a revelação; placar e down & distância piscam só quando a jogada termina.
- [ ] Barras de stat no Pokédex crescem e repetem ao trocar de espécie.
- [ ] HOME → BUILDER com crossfade (Chromium); LOBBY/MATCH/END entram com `screen-enter`.
- [ ] Emular `prefers-reduced-motion: reduce` (DevTools → Rendering): nada se move, mas os textos, as cores e os símbolos da revelação continuam.
- [ ] Emular toque (viewport de celular): confete com metade das partículas.
- [ ] Animações a 0,25× no inspetor de animações: sem salto de layout.
- [ ] Rodar `apps/client/scripts/layout-audit.js` e `layout-snapshot.js` (instruções no cabeçalho de cada script) e comparar com `diff-snapshots.mjs`: nenhuma diferença de layout.

- [ ] **Step 5: Abrir o PR**

```bash
git push -u origin feat/animacoes-dinamicas
gh pr create --title "feat(client): animações dinâmicas nos momentos raros e polimento da UI" --body "Implementa docs/superpowers/specs/2026-10-14-animacoes-dinamicas-design.md (issue vinculada na descrição)."
```

Termine a descrição do PR com a linha `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
