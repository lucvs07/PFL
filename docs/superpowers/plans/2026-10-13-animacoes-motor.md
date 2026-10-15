# Animações dirigidas pelos eventos do motor — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao campo animações distintas por categoria de carta, um efeito visual de efetividade de tipo no CLASH e um destaque para a revelação das cartas e da leitura (issue #11, épico D2).

**Architecture:** A timeline (`buildTimeline`) passa a carregar, em campos opcionais, a categoria da carta ofensiva, o multiplicador de tipo e a marca de blitz. Um módulo novo de funções puras, `choreography.ts`, transforma esses dados em planos de movimento; o `FieldScene` só aplica os planos com tweens, câmera e tint. O banner de revelação ganha um carimbo da leitura em CSS. Engine, protocolo, servidor e áudio não mudam.

**Tech Stack:** TypeScript, Phaser 3.90 (`^3.90.0`, não o 4), React 18, vitest (jsdom nos testes de DOM), CSS puro.

**Spec:** `docs/superpowers/specs/2026-10-13-animacoes-motor-design.md`. O spec do épico (`2026-10-12-pfl-proximos-passos-issues.md`, seção D2) está só na `main`.

## Global Constraints

- Branch de trabalho: `feat/animacoes-motor` (a partir de `feat/som-e-musica-8bit`). Não incluir o `.gitignore` modificado em nenhum commit.
- Usar só API que exista no **Phaser 3.90**. Proibido: `setTintMode`, `Filters`, `tintMode`, `tweens.stagger` e qualquer coisa exclusiva do v4.
- A animação cabe em `TIMELINE_BUDGET_MS` (`RESULT_ANIMATION_MS - 500`, 4000 ms). Não mudar o objeto de durações `D` nem `fitToBudget`.
- O áudio não muda: `apps/client/src/audio/**` e `apps/client/test/audio-*.test.ts` ficam intocados. `typeEffect` e `EFFECT_TEXT` mantêm assinatura e valores (narração e áudio dependem deles).
- Campos novos de `AnimStep` são **opcionais**.
- Só `transform`/`opacity` no CSS. Nada de `scale(0)`, `ease-in`, `transition: all`, blur. Identidade GBC pixel: `steps()` no DOM, paleta `--gbc-*`.
- Reduced motion = menos movimento, não menos informação: sem `shake` e sem `flash`, mas texto de efetividade, tint e carimbo da leitura continuam.
- Textos da interface em português, como o resto do cliente.
- Rodar testes da raiz do repo: `npx vitest run apps/client/test/<arquivo>`. Typecheck: `npm run typecheck`.
- Commits em português, no estilo do repositório (`feat(client/anim): ...`), terminando com a linha `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- Carta sem elemento (básica): `mult` é `null`, o CLASH treme pouco (0.002), sem texto e sem erro.
- Passo sem `category`/`mult` (timeline antiga, testes de áudio): a cena usa a coreografia padrão e não lança exceção.
- Sprite que não carregou (círculo de reserva, sem `setTint`): o CLASH com ½x/0x não lança exceção.
- Reduced motion: nenhum `shake`/`flash`, mas o texto de efetividade e o tint continuam.
- Troca de estágio no meio de um arco de passe: a sombra da bola é destruída (`transient`) e nada continua escrevendo na bola.

---

## File Structure

| Arquivo | Responsabilidade |
| --- | --- |
| `apps/client/src/match/effect.ts` (modificar) | Ganha `Mult` e `typeMultiplier`. `typeEffect`/`EFFECT_TEXT` intocados |
| `apps/client/src/match/timeline.ts` (modificar) | Passos ganham `category`, `mult`, `blitz` (opcionais) |
| `apps/client/src/phaser/choreography.ts` (criar) | Funções puras: `clashFx`, `throwPlan`, `runPlan`, `blockPlan`, `arcPoint`, `clampX`, `applyTint`. Sem importar Phaser |
| `apps/client/src/phaser/FieldScene.ts` (modificar) | Guarda `body` no `PlayerSprite`; aplica os planos em `CLASH`, `THROW`, `RUN`, `BLOCK` |
| `apps/client/src/screens/match/RevealBanner.tsx` (modificar) | Classe `reveal-stamp` na leitura |
| `apps/client/src/screens/match/match.css` (modificar) | Animação `reveal-stamp` |
| `apps/client/test/effect.test.ts` (criar) | `typeMultiplier` |
| `apps/client/test/timeline.test.ts` (modificar) | Campos novos |
| `apps/client/test/choreography.test.ts` (criar) | Funções puras |
| `apps/client/test/field-scene.test.ts` (modificar) | Aplicação das coreografias na cena falsa |
| `apps/client/test/reveal-banner.test.tsx` (criar) | Classes do banner (jsdom) |

---

### Task 1: `typeMultiplier` (4x, 2x, ½x, ¼x, 0x)

**Files:**
- Modify: `apps/client/src/match/effect.ts`
- Test: `apps/client/test/effect.test.ts` (criar)

**Interfaces:**
- Consumes: `effectiveness`, `getSpecies`, `typeModifier` de `@pfl/engine` (já importados em `effect.ts`).
- Produces: `export type Mult = 4 | 2 | 1 | 0.5 | 0.25 | 0` e `export function typeMultiplier(element: PokemonType | null, targets: readonly number[]): Mult | null`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/client/test/effect.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { typeMultiplier } from '../src/match/effect';

describe('typeMultiplier', () => {
  it('um alvo: devolve a efetividade exata da escala do motor', () => {
    expect(typeMultiplier('electric', [130])).toBe(4); // Gyarados água/voador
    expect(typeMultiplier('electric', [69])).toBe(0.5); // Bellsprout planta/veneno
    expect(typeMultiplier('electric', [50])).toBe(0); // Diglett terra
    expect(typeMultiplier('electric', [19])).toBe(1); // Rattata
  });

  it('vários alvos: escolhe o degrau da escala mais próximo da média', () => {
    expect(typeMultiplier('electric', [130, 19])).toBe(2); // (4x + 1x) → média = 2x
    expect(typeMultiplier('electric', [69, 50])).toBe(0.25); // (½x + 0x) → média = ¼x
  });

  it('sem elemento ou sem alvos: null', () => {
    expect(typeMultiplier(null, [130])).toBeNull();
    expect(typeMultiplier('electric', [])).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/effect.test.ts`
Expected: FAIL — `typeMultiplier is not a function` (ou não exportada).

- [ ] **Step 3: Implementar**

Em `apps/client/src/match/effect.ts`, depois de `typeEffect` e antes de `EFFECT_TEXT`, acrescentar:

```ts
export type Mult = 4 | 2 | 1 | 0.5 | 0.25 | 0;
const MULTS: readonly Mult[] = [4, 2, 1, 0.5, 0.25, 0];

/**
 * Multiplicador de tipo da carta contra os atores adversários, no degrau da escala do motor mais próximo
 * da média dos modificadores. Com um alvo é exato; com vários, a média cai no degrau mais perto.
 */
export function typeMultiplier(element: PokemonType | null, targets: readonly number[]): Mult | null {
  if (!element || targets.length === 0) return null;
  const mods = targets.map((id) => typeModifier(effectiveness(element, getSpecies(id).types)));
  const mean = mods.reduce((sum, m) => sum + m, 0) / mods.length;
  return MULTS.reduce((best, m) => (Math.abs(typeModifier(m) - mean) < Math.abs(typeModifier(best) - mean) ? m : best));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run apps/client/test/effect.test.ts apps/client/test/narration.test.ts`
Expected: PASS (o `narration.test.ts` prova que `typeEffect` não mudou).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/match/effect.ts apps/client/test/effect.test.ts docs/superpowers/specs/2026-10-13-animacoes-motor-design.md docs/superpowers/plans/2026-10-13-animacoes-motor.md
git commit -m "feat(client/anim): multiplicador de tipo (4x a 0x) e spec/plano da issue #11

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Campos novos na timeline

**Files:**
- Modify: `apps/client/src/match/timeline.ts` (tipo `AnimStep` linhas 12–26; `buildTimeline` linhas 60–100)
- Test: `apps/client/test/timeline.test.ts`

**Interfaces:**
- Consumes: `typeMultiplier`, `Mult` (Task 1); `OffenseCategory`, `findCard` de `@pfl/engine`.
- Produces: em `AnimStep`, `BLOCK` ganha `category?: OffenseCategory; blitz?: boolean`; `CLASH` ganha `category?: OffenseCategory; mult?: Mult | null`; `RUN` e `THROW` ganham `category?: OffenseCategory`.

- [ ] **Step 1: Escrever os testes que falham**

Em `apps/client/test/timeline.test.ts`, dentro do `describe('buildTimeline', ...)`, antes do teste `'nenhuma sequência passa do orçamento da animação'`:

```ts
  it('os passos carregam a categoria da carta ofensiva', () => {
    const run = buildTimeline(play('ground_earthquake'));
    expect(run.find((s) => s.kind === 'CLASH')).toMatchObject({ category: 'RUN_OUTSIDE' });
    expect(run.find((s) => s.kind === 'RUN')).toMatchObject({ category: 'RUN_OUTSIDE' });
    const deep = buildTimeline(play('fire_deep', { offActors: [63, 26, 95] }));
    expect(deep.find((s) => s.kind === 'THROW')).toMatchObject({ category: 'DEEP_PASS' });
    expect(deep.find((s) => s.kind === 'BLOCK')).toMatchObject({ category: 'DEEP_PASS', blitz: false });
  });

  it('carta de defesa de blitz marca o bloqueio', () => {
    const events: GameEvent[] = [
      { t: 'CARDS', offense: 'basic_pass', defense: 'dragon_wrath', read: 'NEUTRAL' },
      { t: 'PLAY', outcome: outcome({ offActors: [63, 26, 95] }) },
    ];
    expect(buildTimeline(events).find((s) => s.kind === 'BLOCK')).toMatchObject({ blitz: true });
  });

  it('o confronto carrega o multiplicador de tipo', () => {
    expect(buildTimeline(play('electric_thunder_screen')).find((s) => s.kind === 'CLASH')).toMatchObject({ mult: 4 });
    expect(buildTimeline(play('basic_run')).find((s) => s.kind === 'CLASH')).toMatchObject({ mult: null });
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/timeline.test.ts`
Expected: FAIL nos três testes novos (`category`/`blitz`/`mult` ausentes). Os testes antigos continuam passando.

- [ ] **Step 3: Implementar**

Em `apps/client/src/match/timeline.ts`:

1. Trocar a importação do efeito:

```ts
import { typeEffect, typeMultiplier, type Mult } from './effect';
```

(`TypeEffect` deixa de ser usado aqui? Continua: `CLASH` mantém `effect: TypeEffect | null`. Então use `import { typeEffect, typeMultiplier, type Mult, type TypeEffect } from './effect';`.)

2. No tipo `AnimStep`, substituir as linhas de `BLOCK`, `CLASH`, `THROW` e `RUN`:

```ts
    | { kind: 'BLOCK'; category?: OffenseCategory; blitz?: boolean }
    | { kind: 'CLASH'; off: number; def: number; effect: TypeEffect | null; category?: OffenseCategory; mult?: Mult | null }
    | { kind: 'THROW'; from: number | null; to: number; category?: OffenseCategory }
    | { kind: 'RUN'; carrier: number; yards: number; big?: boolean; category?: OffenseCategory }
```

3. Em `buildTimeline`, junto de `let offenseCard`, acrescentar:

```ts
  let blitz = false;
```

e no `case 'CARDS':` do laço final:

```ts
      case 'CARDS':
        offenseCard = e.offense;
        blitz = findCard(e.defense)?.category === 'BLITZ';
        break;
```

4. Em `playSteps`, trocar os `push` afetados:

```ts
    if (isProtected) push({ kind: 'BLOCK', category, blitz }, D.block);
```

```ts
      push(
        { kind: 'CLASH', off: carrier, def: defender, effect: typeEffect(card?.element ?? null, o.defActors), category, mult: typeMultiplier(card?.element ?? null, o.defActors) },
        D.clash,
      );
```

```ts
    if (isPass && carrier !== undefined) push({ kind: 'THROW', from: qb ?? null, to: carrier, category }, D.throw);
```

```ts
          push({ kind: 'RUN', carrier, yards: o.yards, big: o.bigPlay, category }, o.bigPlay ? D.runBig : D.run);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run apps/client/test/timeline.test.ts apps/client/test/audio-cues.test.ts && npm run typecheck`
Expected: PASS e typecheck sem erros (o `audio-cues.test.ts` prova que o áudio não foi tocado).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/match/timeline.ts apps/client/test/timeline.test.ts
git commit -m "feat(client/anim): timeline carrega categoria, blitz e multiplicador

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `choreography.ts` (funções puras)

**Files:**
- Create: `apps/client/src/phaser/choreography.ts`
- Test: `apps/client/test/choreography.test.ts` (criar)

**Interfaces:**
- Consumes: `Mult`, `TypeEffect`, `EFFECT_TEXT` de `../match/effect`; `OffenseCategory` de `@pfl/engine`; `FIELD_WIDTH` de `./layout`.
- Produces (usado nas Tasks 4 e 5):

```ts
export interface ClashFx {
  shake: number;                        // intensidade para cameras.main.shake(120, shake); 0 = sem tremor
  flash: boolean;                       // cameras.main.flash(150, 248, 208, 48)
  weaken: 'none' | 'gray' | 'ghost';    // o que acontece com o atacante
  text: string | null;
  color: string;                        // cor do texto
  fontSize: number;                     // px
}
export function clashFx(mult: Mult | null | undefined, effect: TypeEffect | null | undefined): ClashFx;
export interface ThrowPlan { lift: number; shadow: boolean; fake: boolean; qbDrop: number }
export function throwPlan(category: OffenseCategory | undefined): ThrowPlan;
export interface RunPlan { drift: number; jitter: number }
export function runPlan(category: OffenseCategory | undefined): RunPlan;
export interface BlockPlan { rush: number; stagger: number }
export function blockPlan(blitz: boolean | undefined): BlockPlan;
export interface Point { x: number; y: number }
export function arcPoint(from: Point, to: Point, lift: number, t: number): Point;
export function clampX(x: number): number;
export function applyTint(body: unknown, color: number | null): void;
```

- [ ] **Step 1: Escrever os testes que falham**

Criar `apps/client/test/choreography.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { applyTint, arcPoint, blockPlan, clampX, clashFx, runPlan, throwPlan } from '../src/phaser/choreography';
import { FIELD_WIDTH } from '../src/phaser/layout';

describe('clashFx', () => {
  it('4x: o mais forte, com o multiplicador no texto', () => {
    expect(clashFx(4, 'SUPER')).toMatchObject({ shake: 0.008, flash: true, weaken: 'none', text: 'É super efetivo! (×4)', fontSize: 14 });
  });

  it('2x: forte, sem o multiplicador no texto', () => {
    expect(clashFx(2, 'SUPER')).toMatchObject({ shake: 0.004, flash: true, weaken: 'none', text: 'É super efetivo!', fontSize: 10 });
  });

  it('neutro e sem elemento: tremor pequeno, sem texto, sem flash', () => {
    for (const fx of [clashFx(1, 'NEUTRAL'), clashFx(null, null), clashFx(undefined, undefined)]) {
      expect(fx).toMatchObject({ shake: 0.002, flash: false, weaken: 'none', text: null });
    }
  });

  it('½x e ¼x: atacante cinza, sem tremor', () => {
    for (const mult of [0.5, 0.25] as const) {
      expect(clashFx(mult, 'WEAK')).toMatchObject({ shake: 0, flash: false, weaken: 'gray', text: 'Não é muito efetivo...' });
    }
  });

  it('0x: o golpe atravessa, sem tremor', () => {
    expect(clashFx(0, 'IMMUNE')).toMatchObject({ shake: 0, flash: false, weaken: 'ghost', text: 'Não teve efeito...' });
  });
});

describe('throwPlan', () => {
  it('cada categoria de passe tem o seu desenho', () => {
    expect(throwPlan('SHORT_PASS')).toEqual({ lift: 0, shadow: false, fake: false, qbDrop: 0 });
    expect(throwPlan('DEEP_PASS')).toEqual({ lift: 60, shadow: true, fake: false, qbDrop: 0 });
    expect(throwPlan('PLAY_ACTION')).toEqual({ lift: 20, shadow: false, fake: true, qbDrop: 0 });
    expect(throwPlan('SCREEN')).toEqual({ lift: 8, shadow: false, fake: false, qbDrop: 12 });
  });

  it('sem categoria cai no passe reto', () => {
    expect(throwPlan(undefined)).toEqual(throwPlan('SHORT_PASS'));
  });
});

describe('runPlan', () => {
  it('por dentro treme as linhas; por fora deriva para a lateral', () => {
    expect(runPlan('RUN_INSIDE')).toEqual({ drift: 0, jitter: 2 });
    expect(runPlan('RUN_OUTSIDE')).toEqual({ drift: 36, jitter: 0 });
  });

  it('screen e sem categoria correm retos', () => {
    expect(runPlan('SCREEN')).toEqual({ drift: 0, jitter: 0 });
    expect(runPlan(undefined)).toEqual({ drift: 0, jitter: 0 });
  });
});

describe('blockPlan', () => {
  it('blitz manda a defesa cruzar a linha, escalonada', () => {
    expect(blockPlan(true)).toEqual({ rush: 14, stagger: 40 });
    expect(blockPlan(false)).toEqual({ rush: 0, stagger: 0 });
    expect(blockPlan(undefined)).toEqual({ rush: 0, stagger: 0 });
  });
});

describe('arcPoint', () => {
  const a = { x: 100, y: 300 };
  const b = { x: 200, y: 100 };

  it('começa em a e termina em b', () => {
    expect(arcPoint(a, b, 60, 0)).toEqual(a);
    expect(arcPoint(a, b, 60, 1)).toEqual(b);
  });

  it('no meio do caminho a bola está `lift` px acima da reta', () => {
    const mid = arcPoint(a, b, 60, 0.5);
    expect(mid.x).toBeCloseTo(150);
    expect(mid.y).toBeCloseTo(200 - 60);
  });

  it('lift 0 é a reta', () => {
    expect(arcPoint(a, b, 0, 0.5)).toEqual({ x: 150, y: 200 });
  });
});

describe('clampX', () => {
  it('mantém o jogador dentro das linhas laterais', () => {
    expect(clampX(-50)).toBe(40);
    expect(clampX(FIELD_WIDTH + 50)).toBe(FIELD_WIDTH - 40);
    expect(clampX(200)).toBe(200);
  });
});

describe('applyTint', () => {
  it('aplica e limpa a cor quando o corpo suporta', () => {
    const body = { setTint: vi.fn(), clearTint: vi.fn() };
    applyTint(body, 0x888888);
    applyTint(body, null);
    expect(body.setTint).toHaveBeenCalledWith(0x888888);
    expect(body.clearTint).toHaveBeenCalledTimes(1);
  });

  it('ignora corpos sem tint (o círculo de reserva) sem lançar', () => {
    expect(() => applyTint({}, 0x888888)).not.toThrow();
    expect(() => applyTint({}, null)).not.toThrow();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/choreography.test.ts`
Expected: FAIL — módulo `../src/phaser/choreography` não existe.

- [ ] **Step 3: Implementar**

Criar `apps/client/src/phaser/choreography.ts`:

```ts
import type { OffenseCategory } from '@pfl/engine';
import { EFFECT_TEXT, type Mult, type TypeEffect } from '../match/effect';
import { FIELD_WIDTH } from './layout';

/**
 * Regras de movimento do campo, sem Phaser: cada função devolve um plano em dados e o FieldScene o aplica.
 * Assim dá para testar o que cada carta faz sem montar uma cena.
 */

export interface ClashFx {
  /** intensidade para `cameras.main.shake(120, shake)`; 0 = sem tremor */
  shake: number;
  /** `cameras.main.flash(150, 248, 208, 48)` (amarelo da paleta) */
  flash: boolean;
  /** o que acontece com o atacante: cinza por um instante, ou o golpe "atravessa" */
  weaken: 'none' | 'gray' | 'ghost';
  text: string | null;
  color: string;
  fontSize: number;
}

export function clashFx(mult: Mult | null | undefined, effect: TypeEffect | null | undefined): ClashFx {
  const text = effect ? EFFECT_TEXT[effect] : null;
  if (mult === 4) return { shake: 0.008, flash: true, weaken: 'none', text: text && `${text} (×4)`, color: '#f8d030', fontSize: 14 };
  if (mult === 2) return { shake: 0.004, flash: true, weaken: 'none', text, color: '#f8d030', fontSize: 10 };
  if (mult === 0.5 || mult === 0.25) return { shake: 0, flash: false, weaken: 'gray', text, color: '#c8c8c8', fontSize: 10 };
  if (mult === 0) return { shake: 0, flash: false, weaken: 'ghost', text, color: '#c8c8c8', fontSize: 10 };
  return { shake: 0.002, flash: false, weaken: 'none', text: null, color: '#f8f8f0', fontSize: 10 };
}

export interface ThrowPlan {
  /** altura do arco no ponto médio, em px; 0 = bola reta */
  lift: number;
  /** sombra da bola no chão durante o arco */
  shadow: boolean;
  /** finta de handoff para o RB antes do passe */
  fake: boolean;
  /** quanto o QB recua, em px */
  qbDrop: number;
}

const THROWS: Partial<Record<OffenseCategory, ThrowPlan>> = {
  SHORT_PASS: { lift: 0, shadow: false, fake: false, qbDrop: 0 },
  DEEP_PASS: { lift: 60, shadow: true, fake: false, qbDrop: 0 },
  PLAY_ACTION: { lift: 20, shadow: false, fake: true, qbDrop: 0 },
  SCREEN: { lift: 8, shadow: false, fake: false, qbDrop: 12 },
};

export function throwPlan(category: OffenseCategory | undefined): ThrowPlan {
  return (category && THROWS[category]) || (THROWS.SHORT_PASS as ThrowPlan);
}

export interface RunPlan {
  /** deslocamento lateral até o fim da corrida, em px; 0 = reto */
  drift: number;
  /** tremor das linhas durante a corrida, em px; 0 = nenhum */
  jitter: number;
}

export function runPlan(category: OffenseCategory | undefined): RunPlan {
  if (category === 'RUN_INSIDE') return { drift: 0, jitter: 2 };
  if (category === 'RUN_OUTSIDE') return { drift: 36, jitter: 0 };
  return { drift: 0, jitter: 0 };
}

export interface BlockPlan {
  /** quanto os defensores avançam além da linha, em px */
  rush: number;
  /** atraso entre um defensor e o seguinte, em ms */
  stagger: number;
}

export function blockPlan(blitz: boolean | undefined): BlockPlan {
  return blitz ? { rush: 14, stagger: 40 } : { rush: 0, stagger: 0 };
}

export interface Point {
  x: number;
  y: number;
}

/** Bézier quadrática de `from` a `to`; no meio do caminho a bola está `lift` px acima da reta (y menor = mais alto). */
export function arcPoint(from: Point, to: Point, lift: number, t: number): Point {
  const cx = (from.x + to.x) / 2;
  const cy = (from.y + to.y) / 2 - 2 * lift;
  const u = 1 - t;
  return {
    x: u * u * from.x + 2 * u * t * cx + t * t * to.x,
    y: u * u * from.y + 2 * u * t * cy + t * t * to.y,
  };
}

const X_EDGE = 40;
export function clampX(x: number): number {
  return Math.min(FIELD_WIDTH - X_EDGE, Math.max(X_EDGE, x));
}

/** Tint no corpo do jogador. O `Container` não tem tint, e o círculo de reserva (sem sprite) também não: ignora. */
export function applyTint(body: unknown, color: number | null): void {
  const b = body as { setTint?: (c: number) => unknown; clearTint?: () => unknown };
  if (color === null) b.clearTint?.();
  else b.setTint?.(color);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run apps/client/test/choreography.test.ts && npm run typecheck`
Expected: PASS e typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/phaser/choreography.ts apps/client/test/choreography.test.ts
git commit -m "feat(client/anim): planos de movimento puros por categoria e efetividade

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `FieldScene` — CLASH com efetividade e `body` no jogador

**Files:**
- Modify: `apps/client/src/phaser/FieldScene.ts` (interface `PlayerSprite` linha 17; `addPlayer` ~linhas 169–195; `floatText` ~linha 296; `case 'CLASH'` ~linhas 328–352)
- Test: `apps/client/test/field-scene.test.ts`

**Interfaces:**
- Consumes: `clashFx`, `applyTint` (Task 3); `step.mult`, `step.effect` (Task 2).
- Produces: `PlayerSprite.body: Phaser.GameObjects.GameObject`; `floatText(x, y, text, color, fontSize?)`.

- [ ] **Step 1: Preparar a cena falsa e escrever os testes que falham**

Em `apps/client/test/field-scene.test.ts`:

1. Na função `fakeScene`, trocar a linha `scene.tweens = { killAll: () => {}, add: () => {} };` por:

```ts
  scene.tweens = { killAll: () => {}, add: () => {}, addCounter: () => {} };
  scene.cameras = { main: { shake: () => {}, flash: () => {} } };
```

2. No fim do arquivo, acrescentar um helper e o novo `describe`:

```ts
/** Roda os passos na hora (delayedCall síncrono) e grava tweens, contadores e efeitos de câmera. */
function playSteps(t2: typeof t, steps: any[], opts: { reduced?: boolean } = {}) {
  const tweens: any[] = [];
  const counters: any[] = [];
  const camera = { shake: vi.fn(), flash: vi.fn() };
  t2.scene.create();
  t2.scene.reduced = !!opts.reduced;
  t2.scene.tweens = { killAll: () => {}, add: (c: any) => tweens.push(c), addCounter: (c: any) => counters.push(c) };
  t2.scene.cameras = { main: camera };
  t2.scene.time = { removeAllEvents: () => {}, delayedCall: (_ms: number, cb: () => void) => cb() };
  const s = stage();
  t2.scene.sync(s, { seq: 1, stage: s, steps });
  return { tweens, counters, camera };
}
const at = { at: 0, duration: 550 };
const clash = (extra: object) => ({ kind: 'CLASH', off: 25, def: 95, effect: null, ...at, ...extra });

describe('FieldScene: efetividade no CLASH', () => {
  it('4x: flash, tremor forte e texto com o multiplicador', () => {
    const { camera } = playSteps(t, [clash({ effect: 'SUPER', mult: 4 })]);
    expect(camera.shake).toHaveBeenCalledWith(120, 0.008);
    expect(camera.flash).toHaveBeenCalledWith(150, 248, 208, 48);
    expect(t.texts()).toContain('É super efetivo! (×4)');
  });

  it('2x: flash e tremor médio', () => {
    const { camera } = playSteps(t, [clash({ effect: 'SUPER', mult: 2 })]);
    expect(camera.shake).toHaveBeenCalledWith(120, 0.004);
    expect(camera.flash).toHaveBeenCalled();
  });

  it('½x: o atacante fica cinza e depois volta; sem tremor', () => {
    const { camera } = playSteps(t, [clash({ effect: 'WEAK', mult: 0.5 })]);
    const body = t.of('image').find((c) => c.args[2] === 'back-25')!;
    expect(body.calls).toContainEqual({ method: 'setTint', args: [0x888888] });
    expect(body.calls).toContainEqual({ method: 'clearTint', args: [] });
    expect(camera.shake).not.toHaveBeenCalled();
    expect(t.texts()).toContain('Não é muito efetivo...');
  });

  it('0x: o atacante pisca (alpha) e o texto aparece', () => {
    const { tweens } = playSteps(t, [clash({ effect: 'IMMUNE', mult: 0 })]);
    const body = t.of('image').find((c) => c.args[2] === 'back-25')!;
    expect(tweens.some((c) => c.targets === body.proxy && c.alpha === 0.25 && c.yoyo)).toBe(true);
    expect(t.texts()).toContain('Não teve efeito...');
  });

  it('sem elemento (carta básica): tremor pequeno e nenhum texto', () => {
    const { camera } = playSteps(t, [clash({ effect: null, mult: null })]);
    expect(camera.shake).toHaveBeenCalledWith(120, 0.002);
    expect(camera.flash).not.toHaveBeenCalled();
  });

  it('passo antigo, sem mult nem category, não quebra', () => {
    expect(() => playSteps(t, [clash({})])).not.toThrow();
  });

  it('reduced motion: sem tremor nem flash, mas o texto e o tint continuam', () => {
    const { camera } = playSteps(t, [clash({ effect: 'SUPER', mult: 4 })], { reduced: true });
    expect(camera.shake).not.toHaveBeenCalled();
    expect(camera.flash).not.toHaveBeenCalled();
    expect(t.texts()).toContain('É super efetivo! (×4)');
  });

  it('reduced motion: 0x vira cinza em vez de piscar', () => {
    const { tweens } = playSteps(t, [clash({ effect: 'IMMUNE', mult: 0 })], { reduced: true });
    const body = t.of('image').find((c) => c.args[2] === 'back-25')!;
    expect(body.calls).toContainEqual({ method: 'setTint', args: [0x888888] });
    expect(tweens.some((c) => c.targets === body.proxy && c.alpha === 0.25)).toBe(false);
  });
});
```

(`vi` já está importado no arquivo.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/field-scene.test.ts`
Expected: FAIL nos novos testes de CLASH (sem `setTint`, `shake` com 0.004 fixo, texto sem `(×4)`). Os testes antigos de campo continuam passando.

- [ ] **Step 3: Implementar**

Em `apps/client/src/phaser/FieldScene.ts`:

1. Importar:

```ts
import { applyTint, clashFx } from './choreography';
```

2. Em `interface PlayerSprite`, acrescentar `body: Phaser.GameObjects.GameObject;`:

```ts
interface PlayerSprite {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.GameObject;
  slot: SlotId;
  id: number;
  side: Side;
}
```

3. Em `addPlayer`, na última linha, guardar o corpo:

```ts
    this.players.set(`${w.side}:${w.id}`, { container, body, slot: w.slot, id: w.id, side: w.side });
```

4. `floatText` ganha o tamanho:

```ts
  private floatText(x: number, y: number, text: string, color: string, fontSize = 10): void {
    const t = this.add.text(x, y, text, { ...TEXT_STYLE, color, fontSize: `${fontSize}px` }).setOrigin(0.5).setDepth(30);
```

(o resto do método não muda).

5. Substituir o `case 'CLASH'` inteiro:

```ts
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
        const fx = clashFx(step.mult, step.effect);
        if (fx.text) this.floatText(mx, my - 24, fx.text, fx.color, fx.fontSize);
        // Com movimento reduzido o "atravessa" vira cinza: a informação fica, o piscar sai.
        const weaken = this.reduced && fx.weaken === 'ghost' ? 'gray' : fx.weaken;
        if (weaken === 'gray') {
          applyTint(off.body, 0x888888);
          this.time.delayedCall(step.duration, () => applyTint(off.body, null));
        } else if (weaken === 'ghost') {
          this.tweens.add({ targets: off.body, alpha: 0.25, duration: d * 0.25, yoyo: true });
        }
        if (!this.reduced) {
          if (fx.shake > 0) this.cameras.main.shake(120, fx.shake);
          if (fx.flash) this.cameras.main.flash(150, 248, 208, 48);
        }
        break;
      }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run apps/client/test/field-scene.test.ts && npm run typecheck`
Expected: PASS e typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/phaser/FieldScene.ts apps/client/test/field-scene.test.ts
git commit -m "feat(client/anim): CLASH com efeito visual por efetividade de tipo

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `FieldScene` — passes, corridas e blitz por categoria

**Files:**
- Modify: `apps/client/src/phaser/FieldScene.ts` (`case 'BLOCK'`, `case 'THROW'`, `case 'RUN'`; novo método `flyBall`)
- Test: `apps/client/test/field-scene.test.ts`

**Interfaces:**
- Consumes: `throwPlan`, `runPlan`, `blockPlan`, `arcPoint`, `clampX` (Task 3); `step.category`, `step.blitz` (Task 2); `playSteps`, `at` (helper da Task 4).
- Produces: `private flyBall(start: Point, end: Point, lift: number, shadow: boolean, duration: number, delay?: number): void`.

- [ ] **Step 1: Escrever os testes que falham**

Em `apps/client/test/field-scene.test.ts`, acrescentar no fim:

```ts
const throwStep = (category?: string) => ({ kind: 'THROW', from: 63, to: 25, at: 0, duration: 450, category });
const runStep = (category?: string) => ({ kind: 'RUN', carrier: 25, yards: 6, at: 0, duration: 700, category });

describe('FieldScene: passes por categoria', () => {
  it('passe curto: a bola voa reta (um tween, sem contador)', () => {
    const { tweens, counters } = playSteps(t, [throwStep('SHORT_PASS')]);
    const ball = t.of('image')[0].proxy;
    expect(tweens.some((c) => c.targets === ball && c.ease === 'Sine.easeOut')).toBe(true);
    expect(counters).toHaveLength(0);
  });

  it('passe longo: arco dirigido por contador, com sombra no chão', () => {
    const { counters } = playSteps(t, [throwStep('DEEP_PASS')]);
    expect(counters).toHaveLength(1);
    expect(counters[0]).toMatchObject({ from: 0, to: 1, duration: 450 });
    expect(t.of('ellipse').some((c) => c.args[2] === 10 && c.args[3] === 4)).toBe(true);
  });

  it('o contador do arco move a bola e a sombra', () => {
    const { counters } = playSteps(t, [throwStep('DEEP_PASS')]);
    counters[0].onUpdate({ getValue: () => 0.5 });
    const ball = t.of('image')[0];
    expect(ball.calls.filter((c) => c.method === 'setPosition').length).toBeGreaterThan(1);
  });

  it('troca de estágio no meio do arco destrói a sombra', () => {
    playSteps(t, [throwStep('DEEP_PASS')]);
    const shadow = t.of('ellipse').find((c) => c.args[2] === 10 && c.args[3] === 4)!;
    t.scene.sync(stage({ turnId: 9 }), null);
    expect(shadow.calls.map((c) => c.method)).toContain('destroy');
  });

  it('play-action: a bola passa pelo RB antes do passe (dois movimentos, o segundo atrasado)', () => {
    const { tweens, counters } = playSteps(t, [throwStep('PLAY_ACTION')]);
    const ball = t.of('image')[0].proxy;
    expect(tweens.filter((c) => c.targets === ball)).toHaveLength(1); // handoff
    expect(counters[0].delay).toBeGreaterThan(0); // passe em arco, depois do handoff
  });

  it('screen: o QB recua', () => {
    const { tweens } = playSteps(t, [throwStep('SCREEN')]);
    const qb = t.of('container')[0].proxy;
    expect(tweens.some((c) => c.targets === qb && c.y === 12)).toBe(true);
  });

  it('passo sem categoria: passe reto, sem erro', () => {
    const { counters } = playSteps(t, [throwStep(undefined)]);
    expect(counters).toHaveLength(0);
  });
});

describe('FieldScene: corridas por categoria', () => {
  it('por dentro: o RB sobe reto e as linhas tremem', () => {
    const { tweens, counters } = playSteps(t, [runStep('RUN_INSIDE')]);
    expect(counters).toHaveLength(0);
    expect(tweens.filter((c) => c.yoyo && c.repeat === 3).length).toBeGreaterThan(0);
  });

  it('por fora: arco lateral por contador, sem tremor', () => {
    const { tweens, counters } = playSteps(t, [runStep('RUN_OUTSIDE')]);
    expect(counters).toHaveLength(1);
    expect(counters[0]).toMatchObject({ from: 0, to: 1, duration: 700 });
    expect(tweens.filter((c) => c.yoyo && c.repeat === 3)).toHaveLength(0);
  });

  it('reduced motion: sem tremor e sem arco, só o deslocamento', () => {
    const { tweens, counters } = playSteps(t, [runStep('RUN_INSIDE')], { reduced: true });
    expect(counters).toHaveLength(0);
    expect(tweens.filter((c) => c.yoyo && c.repeat === 3)).toHaveLength(0);
  });
});

describe('FieldScene: blitz', () => {
  const block = (blitz: boolean) => ({ kind: 'BLOCK', category: 'SHORT_PASS', blitz, at: 0, duration: 350 });

  it('com blitz a defesa cruza a linha, escalonada', () => {
    const lineup = stage({ lineups: { offense: { QB: 63, OL1: 80 }, defense: { DL1: 95, DL2: 96, LB1: 97 } } });
    const tweens: any[] = [];
    t.scene.create();
    t.scene.reduced = false;
    t.scene.tweens = { killAll: () => {}, add: (c: any) => tweens.push(c), addCounter: () => {} };
    t.scene.time = { removeAllEvents: () => {}, delayedCall: (_ms: number, cb: () => void) => cb() };
    t.scene.sync(lineup, { seq: 1, stage: lineup, steps: [block(true)] });
    const rushes = tweens.filter((c) => c.y === 14);
    expect(rushes).toHaveLength(3);
    expect(rushes.map((c) => c.delay)).toEqual([0, 40, 80]);
  });

  it('sem blitz ninguém avança', () => {
    const { tweens } = playSteps(t, [block(false)]);
    expect(tweens.filter((c) => c.y === 14)).toHaveLength(0);
  });
});
```

Nota para quem implementar: nos testes de passe, `from: 63` é o QB e `to: 25` o RB da `stage()` padrão (`offense: { QB: 63, RB: 25 }`). Como o `x`/`y` dos containers falsos é sempre 0, os testes conferem só a forma dos tweens (alvos, `delay`, `repeat`, `yoyo`), não coordenadas.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/field-scene.test.ts`
Expected: FAIL nos testes novos de passe, corrida e blitz.

- [ ] **Step 3: Implementar**

Em `apps/client/src/phaser/FieldScene.ts`:

1. Ampliar a importação:

```ts
import { applyTint, arcPoint, blockPlan, clampX, clashFx, runPlan, throwPlan, type Point } from './choreography';
```

2. Novo método, ao lado de `floatText`:

```ts
  /** Bola de `start` a `end`. Reta quando `lift` é 0; senão em arco, dirigida por um contador de 0 a 1. */
  private flyBall(start: Point, end: Point, lift: number, shadow: boolean, duration: number, delay = 0): void {
    if (lift === 0 || duration === 0) {
      this.tweens.add({ targets: this.ball, x: end.x, y: end.y, duration, delay, ease: 'Sine.easeOut' });
      return;
    }
    const ground = shadow ? this.add.ellipse(start.x, start.y + 6, 10, 4, 0x0f380f, 0.4).setDepth(19) : null;
    if (ground) this.transient.push(ground);
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration,
      delay,
      ease: 'Sine.easeOut',
      onUpdate: (tween: Phaser.Tweens.Tween) => {
        const t = Number(tween.getValue());
        const p = arcPoint(start, end, lift, t);
        this.ball.setPosition(p.x, p.y);
        ground?.setPosition(start.x + (end.x - start.x) * t, start.y + (end.y - start.y) * t + 6);
      },
      onComplete: () => ground?.destroy(),
    });
  }
```

3. Substituir `case 'BLOCK'`:

```ts
      case 'BLOCK': {
        for (const p of [...this.bySlot('offense', 'OL'), ...this.bySlot('defense', 'DL')]) {
          this.tweens.add({ targets: p.container, y: p.container.y + (p.side === 'offense' ? -4 : 4), duration: d / 4, yoyo: true, repeat: 1 });
        }
        const plan = blockPlan(step.blitz);
        if (plan.rush > 0) {
          const rushers = [...this.bySlot('defense', 'DL'), ...this.bySlot('defense', 'LB')];
          rushers.forEach((p, i) => {
            this.tweens.add({ targets: p.container, y: p.container.y + plan.rush, duration: d * 0.6, delay: this.reduced ? 0 : i * plan.stagger, ease: 'Cubic.easeOut' });
          });
        }
        break;
      }
```

4. Substituir `case 'THROW'`:

```ts
      case 'THROW': {
        const from = this.player('offense', step.from) ?? this.bySlot('offense', 'QB')[0];
        const to = this.player('offense', step.to);
        if (!to) break;
        const plan = throwPlan(step.category);
        const start: Point = from ? { x: from.container.x, y: from.container.y - 4 } : { x: this.ball.x, y: this.ball.y };
        const end: Point = { x: to.container.x, y: to.container.y - 4 };
        // Com movimento reduzido o passe é sempre reto: o arco e a finta são só movimento.
        const lift = this.reduced ? 0 : plan.lift;
        this.ball.setPosition(start.x, start.y);
        if (plan.qbDrop > 0 && from && !this.reduced) {
          this.tweens.add({ targets: from.container, y: from.container.y + plan.qbDrop, duration: d * 0.4, ease: 'Cubic.easeOut' });
        }
        const rb = plan.fake && !this.reduced ? this.bySlot('offense', 'RB')[0] : undefined;
        if (rb) {
          // finta: a bola vai ao RB, volta ao QB e só então sai o passe
          this.ball.setPosition(rb.container.x, rb.container.y - 4);
          this.tweens.add({ targets: this.ball, x: start.x, y: start.y, duration: d * 0.4, ease: 'Cubic.easeOut' });
          this.flyBall(start, end, lift, plan.shadow, d * 0.6, d * 0.4);
        } else {
          this.flyBall(start, end, lift, plan.shadow, d);
        }
        break;
      }
```

5. Substituir `case 'RUN'`:

```ts
      case 'RUN': {
        const carrier = this.player('offense', step.carrier);
        if (!carrier) break;
        const plan = runPlan(step.category);
        const x0 = carrier.container.x;
        const y0 = carrier.container.y;
        const y = clampY(y0 - step.yards * PX_PER_YARD);
        if (plan.drift > 0 && d > 0) {
          // por fora: deriva para a lateral mais próxima ao longo da corrida
          const sign = x0 < FIELD_WIDTH / 2 ? -1 : 1;
          this.tweens.addCounter({
            from: 0,
            to: 1,
            duration: d,
            ease: 'Quad.easeOut',
            onUpdate: (tween: Phaser.Tweens.Tween) => {
              const t = Number(tween.getValue());
              const x = clampX(x0 + sign * plan.drift * Math.sin((t * Math.PI) / 2));
              const cy = y0 + (y - y0) * t;
              carrier.container.setPosition(x, cy);
              this.ball.setPosition(x, cy - 4);
            },
          });
        } else {
          this.tweens.add({ targets: carrier.container, y, duration: d, ease: 'Quad.easeOut' });
          this.tweens.add({ targets: this.ball, x: carrier.container.x, y: y - 4, duration: d, ease: 'Quad.easeOut' });
        }
        if (plan.jitter > 0 && !this.reduced) {
          // por dentro: as linhas tremem enquanto o RB entra no bolo
          for (const p of [...this.bySlot('offense', 'OL'), ...this.bySlot('defense', 'DL')]) {
            this.tweens.add({ targets: p.container, x: p.container.x + plan.jitter, duration: 40, yoyo: true, repeat: 3 });
          }
        }
        break;
      }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run apps/client/test/field-scene.test.ts apps/client/test/timeline.test.ts apps/client/test/audio-cues.test.ts && npm run typecheck`
Expected: PASS e typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/phaser/FieldScene.ts apps/client/test/field-scene.test.ts
git commit -m "feat(client/anim): passes, corridas e blitz com coreografia por categoria

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Carimbo da leitura no banner de revelação

**Files:**
- Modify: `apps/client/src/screens/match/RevealBanner.tsx`
- Modify: `apps/client/src/screens/match/match.css` (depois do bloco `@keyframes reveal-drop`, ~linha 199)
- Test: `apps/client/test/reveal-banner.test.tsx` (criar)

**Interfaces:**
- Consumes: `CardReveal` de `../../match/matchState`; `READ_SYMBOL`, `READ_LABELS` de `lib/names`.
- Produces: `<span className="reveal-read reveal-stamp">` quando há leitura.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/client/test/reveal-banner.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { RevealBanner } from '../src/screens/match/RevealBanner';
import { READ_SYMBOL } from '../src/lib/names';

afterEach(cleanup);

describe('<RevealBanner>', () => {
  it('não mostra nada sem revelação', () => {
    const { container } = render(<RevealBanner reveal={null} />);
    expect(container.firstChild).toBeNull();
  });

  it.each([
    ['RIGHT', 'reveal-right'],
    ['NEUTRAL', 'reveal-neutral'],
    ['WRONG', 'reveal-wrong'],
  ] as const)('leitura %s: classe de cor e carimbo com o símbolo', (read, cls) => {
    const { container } = render(<RevealBanner reveal={{ offense: 'basic_run', defense: 'basic_defense', read }} />);
    expect(container.querySelector('.reveal')!.classList.contains(cls)).toBe(true);
    const stamp = container.querySelector('.reveal-read.reveal-stamp')!;
    expect(stamp).not.toBeNull();
    expect(stamp.textContent).toContain(READ_SYMBOL[read]);
  });

  it('chute (sem leitura): sem carimbo', () => {
    const { container } = render(<RevealBanner reveal={{ offense: 'punt', defense: 'basic_defense', read: null }} />);
    expect(container.querySelector('.reveal-stamp')).toBeNull();
    expect(container.querySelector('.reveal')!.classList.contains('reveal-kick')).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/reveal-banner.test.tsx`
Expected: FAIL — `.reveal-read.reveal-stamp` não existe (o teste do `null` e do chute podem passar).

- [ ] **Step 3: Implementar**

Em `RevealBanner.tsx`, trocar a abertura do `<span className="reveal-read">`:

```tsx
        <span className="reveal-read reveal-stamp">
```

Em `match.css`, logo depois do bloco `@keyframes reveal-drop { ... }`:

```css
/* A leitura entra depois das cartas (240 ms do reveal-drop): carimbo curto, sem bounce. */
@media (prefers-reduced-motion: no-preference) {
  .reveal-stamp { animation: reveal-stamp 150ms steps(2, end) 240ms both; }
}

@keyframes reveal-stamp {
  from { transform: scale(1.25); opacity: 0; }
  to { transform: none; opacity: 1; }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run apps/client/test/reveal-banner.test.tsx && npm run typecheck`
Expected: PASS e typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/screens/match/RevealBanner.tsx apps/client/src/screens/match/match.css apps/client/test/reveal-banner.test.tsx
git commit -m "feat(client/anim): carimbo da leitura no banner de revelação

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Verificação final

**Files:** nenhum novo; só execução e, se algo falhar, correção na tarefa que o causou.

- [ ] **Step 1: Suíte completa e typecheck**

Run: `npm test && npm run typecheck`
Expected: tudo verde. Se o `npm test` tiver testes lentos, ao menos `npx vitest run apps/client` e o typecheck.

- [ ] **Step 2: Conferir que o áudio e o motor não mudaram**

Run: `git diff --stat feat/som-e-musica-8bit -- apps/client/src/audio apps/client/test/audio-cues.test.ts packages apps/server`
Expected: nenhuma linha (diff vazio).

- [ ] **Step 3: Checagem manual no navegador (a sensação não se julga pelo código)**

Subir o servidor e o cliente como no README, jogar uma partida de dois jogadores (as duas abas) e conferir, atacando e defendendo:
- Corrida por dentro (`basic_run`) e por fora (`ground_earthquake`) se distinguem.
- Passe longo (`fire_deep`) faz arco com sombra; `poison_powder_fake` mostra a finta; `electric_thunder_screen` recua o QB.
- Blitz da defesa (`dragon_wrath`) faz os defensores cruzarem a linha.
- CLASH: super efetivo treme e brilha; "não muito efetivo" deixa o atacante cinza; imune pisca.
- A leitura aparece como carimbo logo depois das cartas.
- Com `prefers-reduced-motion: reduce` ligado (DevTools → Rendering): nada treme nem brilha, o texto e o cinza continuam, o carimbo aparece direto.
- A próxima fase começa no horário de sempre (a animação não atrasa o timer).
- Repetir com a animação a 25% no inspetor de animações para checar os tempos do carimbo.

Registrar na descrição do PR o que foi e o que não foi verificado.

- [ ] **Step 4: Commit de ajustes (se houve) e preparar o PR**

```bash
git status --short
git log --oneline feat/som-e-musica-8bit..HEAD
```

Expected: só commits desta issue; `.gitignore` continua fora. O PR vai contra `feat/som-e-musica-8bit` (empilhado) e fecha a #11; abrir só quando o usuário pedir.

---

## Self-review

**Cobertura do spec**
- §5 (campos novos): Task 2 (+ `typeMultiplier` na Task 1).
- §6 (coreografias, efetividade, reduced, não bloqueia, `body`, funções puras): Tasks 3, 4 e 5; reduced motion testado nas Tasks 4 e 5; "não bloqueia" por construção (tweens e contadores sem callback de fase) e conferido no passo manual.
- §7 (carimbo): Task 6.
- §8 (testes): um arquivo de teste por unidade, mais a prova de que `audio-cues.test.ts` e `narration.test.ts` não mudaram (Tasks 1, 2 e 7).
- Critério 1 da issue (passes/corridas/blitz distintos): Task 5. Critério 2: Task 4. Critério 3: Task 6. Critério 4: reduced em 4, 5 e 6.
- Screen e play-action cobertos em `throwPlan`/`flyBall`; blitz em `blockPlan`.

**Placeholders:** nenhum.

**Consistência de tipos:** `ClashFx`, `ThrowPlan`, `RunPlan`, `BlockPlan`, `Point` definidos na Task 3 e usados com os mesmos nomes na 4 e na 5; `playSteps`/`at`/`clash` definidos na Task 4 e reaproveitados na 5; `Mult`/`typeMultiplier` da Task 1 usados na 2 e na 3.

**Pontos de atenção para o executor**
- Se o `typecheck` reclamar de `tween.getValue()` retornando `number | null`, o `Number(...)` já cobre.
- O mock de Phaser dos testes só tem `Scene` e os eventos do loader: `choreography.ts` não importa Phaser de propósito, e `FieldScene.ts` só usa tipos de `Phaser.Tweens.Tween` (apagados na compilação).
