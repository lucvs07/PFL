# Som e música em 8 bits (D1) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a issue D1 (#10): efeitos e música em 8 bits sintetizados com Web Audio, com controle global de volume (Música e Efeitos) e mudo, ligados aos eventos da partida e do replay.

**Architecture:** Um núcleo puro (`score`, `cues`, `recipes`, `mixer`) alimenta um motor fino (`sequencer`, `engine`) que fala com o navegador só pela interface `AudioBackend`; nos testes entra um `FakeBackend`. A ligação nas telas é um único hook (`useGameAudio`) chamado em `App.tsx`, que reage ao `animation` do reducer. `MatchScreen` e `FieldScene` não mudam.

**Tech Stack:** TypeScript estrito, React 19, Vitest (ambiente Node, testes `*.test.ts`), Web Audio API. Nenhuma dependência nova.

**Spec:** [`docs/superpowers/specs/2026-10-13-som-e-musica-8bit-design.md`](../specs/2026-10-13-som-e-musica-8bit-design.md). Spec-mãe da issue: [`2026-10-12-pfl-proximos-passos-issues.md`](../specs/2026-10-12-pfl-proximos-passos-issues.md), item D1.

## Global Constraints

- Só o cliente muda (`apps/client`). Nada em servidor, protocolo ou motor. **Nenhuma dependência nova** em `package.json`.
- Ambiente de teste da `main`: Vitest em Node, sem jsdom e sem Testing Library, include `apps/**/test/**/*.test.ts`. Testes de componente usam `renderToStaticMarkup` de `react-dom/server` com `createElement`, em arquivo `.test.ts`. Não altere `vitest.config.ts` nem `package.json` (o PR #8 mexe neles).
- Persistência: chave única `pfl.audio.v1` em localStorage, pelos helpers de `apps/client/src/lib/storage.ts`. Padrão **música 0,4, efeitos 0,7, não mudo**; volumes de 0 a 1 em passos de 0,1.
- Máximo de **4 canais** por partitura (`pulse1`, `pulse2`, `tri`, `noise`), 16 posições (semicolcheias) por compasso.
- Sequenciador: tick de **25 ms**, antecedência de **100 ms**, fade-out de troca de faixa de **300 ms**.
- Cooldown do mesmo cue: **40 ms**. No máximo **3** instâncias simultâneas do mesmo cue.
- Sem `AudioContext` no carregamento: o contexto só é criado dentro de um gesto do usuário. Sem áudio, o jogo funciona igual.
- Interface: alvos de toque de **44×44 px**, `z-index` do controle **40** (abaixo do `.notice-top`, que é 50), largura do popover `min(260px, 100vw - 32px)`, texto em português, frase com inicial maiúscula, sem travessão (`—`) em texto novo de interface.
- Tipos: `strict`, ES2022, imports relativos sem extensão (como em `apps/client/test/timeline.test.ts`).
- Todo commit termina com a linha `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Os comandos abaixo usam `-m` duas vezes para isso.
- Comandos: testes `npx vitest run apps/client/test/<arquivo>`; suíte `npm test`; tipos `npm run typecheck`; build `npm run build:client`.
- Branch: `feat/som-e-musica-8bit` (já criada a partir da `main`, com a spec). Não toque em `.gitignore` nem em arquivos que o PR #8 altera.

## Desvios da spec (decididos ao planejar, já refletidos na spec)

1. `cuesFor(steps)` não recebe contexto; o motor expõe `playCues(cues)` e `playTimeline(steps)`.
2. O jingle **pausa** a música (a faixa antiga faz fade-out e a nova só volta no fim do jingle), em vez de *ducking*.
3. O passo `RUN` da timeline ganha `big?: boolean` e `timeline.ts` exporta `TOUCHDOWN_BANNER`; `matchState.ts` passa a exportar `revealFrom`. Isso altera `timeline.ts` e `matchState.ts`, que o PR #8 não toca.
4. O botão de mudo tem `aria-label` estável ("Silenciar o som") e `aria-pressed`, para não inverter o sentido.
5. Subir um volume acima de 0 desmuta.
6. Efeitos chamados antes do desbloqueio são **descartados**; só a música guarda a intenção. Com a aba oculta, efeitos também são descartados.
7. O listener de desbloqueio fica instalado (não se remove): `engine.unlock()` é idempotente e chama `resume()` de novo se o contexto foi suspenso.
8. Replay: a revelação toca (os eventos do quadro trazem `CARDS`); a leitura não, porque o espectador não tem lado.
9. A ordem de entrega põe as partituras (Task 8) antes da ligação (Task 10), porque o singleton `audio` precisa delas.

## Review Focus

1. **Valor corrompido no localStorage** (`{"music":7,"muted":"sim"}`, JSON quebrado, storage indisponível). Esperado: volta ao padrão por campo, sem lançar. Testado na Task 3 e na Task 7.
2. **Rajada do mesmo cue** (muitos `td` ou `tackle` no mesmo instante). Esperado: no máximo 3 instâncias e cooldown de 40 ms. Task 7.
3. **Navegador sem `AudioContext`, ou nenhum gesto ainda.** Esperado: tudo vira no-op, `available` falso, nada lança, a música só começa depois do desbloqueio. Task 7.
4. **Aba oculta e retorno depois de muito tempo.** Esperado: nada soa enquanto oculta, e ao voltar não há rajada de notas atrasadas. Tasks 6 e 7.
5. **Fim empatado e replay sem lado.** Esperado: empate não toca jingle; replay toca a revelação mas não a leitura (não há perspectiva). Task 10.

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `apps/client/src/audio/score.ts` | Tipos e parser da notação de partitura |
| `apps/client/src/audio/cues.ts` | Lista de cues, `cuesFor(steps)`, `readCue` |
| `apps/client/src/audio/mixer.ts` | Configurações, validação, persistência e ganhos |
| `apps/client/src/audio/backend.ts` | Interface `AudioBackend` e tipo `Tone` |
| `apps/client/src/audio/webBackend.ts` | Implementação com `AudioContext` (e a versão indisponível) |
| `apps/client/src/audio/recipes.ts` | Receita de cada cue (dados) |
| `apps/client/src/audio/synth.ts` | Receita → tons no backend |
| `apps/client/src/audio/sequencer.ts` | Toca partituras em loop ou uma vez, com agendamento à frente |
| `apps/client/src/audio/engine.ts` | `createAudio`: junta mixer, sequenciador, cues e desbloqueio |
| `apps/client/src/audio/scores/*.ts` | Faixas `menu` e `match` e jingles `win` e `lose` |
| `apps/client/src/audio/index.ts` | Singleton `audio` |
| `apps/client/src/audio/speaker.ts` | Bitmap do ícone e `speakerCells` |
| `apps/client/src/audio/AudioControlView.tsx` | Controle (apresentação), com `SpeakerIcon` |
| `apps/client/src/audio/AudioControl.tsx` | Controle (estado, Esc, clique fora) |
| `apps/client/src/audio/useAudioState.ts` | `useSyncExternalStore` sobre o motor |
| `apps/client/src/audio/audio.css` | Estilos do controle |
| `apps/client/src/audio/gameAudio.ts` | Funções puras que decidem o que tocar |
| `apps/client/src/audio/browser.ts` | Listeners do navegador (desbloqueio, aba oculta, clique) |
| `apps/client/src/audio/useGameAudio.ts` | Hook que liga o jogo ao áudio |
| `apps/client/test/audio-fakes.ts` | `FakeBackend` |
| `apps/client/test/audio-*.test.ts` | Testes de cada módulo |
| `docs/AUDIO.md` | Créditos e como ajustar sons |
| Alterados: `match/timeline.ts`, `match/matchState.ts`, `App.tsx`, `screens/end/ReplayViewer.tsx` | Ver Tasks 2 e 10 |

---

### Task 1: Parser de partitura

**Files:**
- Create: `apps/client/src/audio/score.ts`
- Test: `apps/client/test/audio-score.test.ts`

**Interfaces:**
- Produces: `VoiceName`, `DrumKind`, `STEPS_PER_BAR`, `ScoreSource`, `ChannelSource`, `ScoreEvent`, `ScoreChannel`, `ParsedScore`, `ScoreError`, `noteFrequency(token): number | null`, `parseScore(src): ParsedScore`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/client/test/audio-score.test.ts
import { describe, expect, it } from 'vitest';
import { STEPS_PER_BAR, ScoreError, noteFrequency, parseScore, type ScoreSource } from '../src/audio/score';

const rests = Array(16).fill('.').join(' ');
const one = (bars: string[], voice: ScoreSource['channels'][number]['voice'] = 'pulse1'): ScoreSource => ({
  bpm: 120,
  channels: [{ voice, bars }],
});

describe('noteFrequency', () => {
  it('converte nomes de nota em Hz', () => {
    expect(noteFrequency('A4')).toBeCloseTo(440, 5);
    expect(noteFrequency('C4')).toBeCloseTo(261.6256, 3);
    expect(noteFrequency('A#3')).toBeCloseTo(233.0819, 3);
    expect(noteFrequency('Bb3')).toBeCloseTo(233.0819, 3);
  });

  it('devolve null para token inválido', () => {
    expect(noteFrequency('H4')).toBeNull();
    expect(noteFrequency('C')).toBeNull();
    expect(noteFrequency('.')).toBeNull();
    expect(noteFrequency('-')).toBeNull();
  });
});

describe('parseScore', () => {
  it('calcula passos e duração do passo', () => {
    const p = parseScore(one([rests, rests]));
    expect(STEPS_PER_BAR).toBe(16);
    expect(p.steps).toBe(32);
    expect(p.stepSeconds).toBeCloseTo(0.125, 9); // 120 bpm: semicolcheia = 60/120/4
    expect(p.channels[0].events).toEqual([]);
  });

  it('"-" sustenta a nota anterior, inclusive entre compassos', () => {
    const bar1 = 'C4 - - - . . . . . . . . . . E4 -';
    const bar2 = '- - G4 . . . . . . . . . . . . .';
    const { events } = parseScore(one([bar1, bar2])).channels[0];
    expect(events.map((e) => [e.step, e.length])).toEqual([
      [0, 4],
      [14, 4],
      [18, 1],
    ]);
    expect(events[0].freq).toBeCloseTo(261.6256, 3);
  });

  it('canal de ruído usa k, s e h', () => {
    const { events } = parseScore(one(['k . . . s . . . h . . . . . . .'], 'noise')).channels[0];
    expect(events.map((e) => e.drum)).toEqual(['k', 's', 'h']);
    expect(events[0].freq).toBeUndefined();
  });

  it('padrões de duty e gain', () => {
    const c = parseScore(one([rests])).channels[0];
    expect(c.duty).toBe(0.5);
    expect(c.gain).toBe(1);
    const d = parseScore({ bpm: 120, channels: [{ voice: 'pulse2', duty: 0.25, gain: 0.6, bars: [rests] }] }).channels[0];
    expect(d.duty).toBe(0.25);
    expect(d.gain).toBe(0.6);
  });

  it('erros de formato lançam ScoreError com mensagem útil', () => {
    expect(() => parseScore(one(['C4 . .']))).toThrow(ScoreError);
    expect(() => parseScore(one(['C4 . .']))).toThrow(/3 posições/);
    expect(() => parseScore(one(['X9 . . . . . . . . . . . . . . .']))).toThrow(/X9/);
    expect(() => parseScore(one(['- . . . . . . . . . . . . . . .']))).toThrow(/sustentar/);
    expect(() => parseScore(one(['C4 . . . . . . . . . . . . . . .', 'C4 . . . . . . . . . . . . . . .'], 'noise'))).toThrow(ScoreError);
    expect(() => parseScore(one(['k - . . . . . . . . . . . . . .'], 'noise'))).toThrow(/ruído/);
    expect(() => parseScore({ bpm: 0, channels: [{ voice: 'tri', bars: [rests] }] })).toThrow(/bpm/);
    expect(() => parseScore({ bpm: 120, channels: [] })).toThrow(/canais/);
  });

  it('todos os canais têm o mesmo número de compassos, e no máximo 4 canais', () => {
    const ch = (bars: string[]) => ({ voice: 'pulse1' as const, bars });
    expect(() => parseScore({ bpm: 120, channels: [ch([rests]), ch([rests, rests])] })).toThrow(/compassos/);
    expect(() => parseScore({ bpm: 120, channels: Array.from({ length: 5 }, () => ch([rests])) })).toThrow(/canais/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/client/test/audio-score.test.ts`
Expected: FAIL (módulo `../src/audio/score` não existe).

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/client/src/audio/score.ts
// Partitura em dados: cada canal é uma lista de compassos, e cada compasso tem 16 posições (semicolcheias)
// separadas por espaço. Token: nota ("C4", "F#3", "Bb2"), "." pausa, "-" sustenta a nota anterior.
// No canal de ruído: "k" bumbo, "s" caixa, "h" chimbal.

export type VoiceName = 'pulse1' | 'pulse2' | 'tri' | 'noise';
export type DrumKind = 'k' | 's' | 'h';

export const STEPS_PER_BAR = 16;
export const MAX_CHANNELS = 4;

export interface ChannelSource {
  voice: VoiceName;
  /** ciclo de trabalho da onda quadrada (pulse1 e pulse2), de 0 a 1 */
  duty?: number;
  /** multiplicador de volume do canal */
  gain?: number;
  /** um compasso por item */
  bars: string[];
}

export interface ScoreSource {
  bpm: number;
  channels: ChannelSource[];
}

export interface ScoreEvent {
  /** posição inicial em semicolcheias desde o começo da faixa */
  step: number;
  /** duração em semicolcheias */
  length: number;
  /** Hz (notas) */
  freq?: number;
  /** percussão (canal de ruído) */
  drum?: DrumKind;
}

export interface ScoreChannel {
  voice: VoiceName;
  duty: number;
  gain: number;
  events: ScoreEvent[];
}

export interface ParsedScore {
  bpm: number;
  steps: number;
  stepSeconds: number;
  channels: ScoreChannel[];
}

export class ScoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScoreError';
  }
}

const SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE = /^([A-G])(#|b)?(-?\d)$/;
const isDrum = (token: string): token is DrumKind => token === 'k' || token === 's' || token === 'h';

export function noteFrequency(token: string): number | null {
  const m = NOTE.exec(token);
  if (!m) return null;
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const midi = 12 * (Number(m[3]) + 1) + SEMITONE[m[1]] + accidental;
  return 440 * 2 ** ((midi - 69) / 12);
}

export function parseScore(src: ScoreSource): ParsedScore {
  if (!(src.bpm > 0)) throw new ScoreError(`bpm inválido: ${src.bpm}`);
  if (src.channels.length === 0 || src.channels.length > MAX_CHANNELS) {
    throw new ScoreError(`a partitura precisa de 1 a ${MAX_CHANNELS} canais; recebeu ${src.channels.length}`);
  }
  const bars = src.channels[0].bars.length;
  if (bars === 0) throw new ScoreError('a partitura precisa de pelo menos 1 compasso');

  const channels = src.channels.map((ch, ci): ScoreChannel => {
    const where = `canal ${ci} (${ch.voice})`;
    if (ch.bars.length !== bars) throw new ScoreError(`${where} tem ${ch.bars.length} compassos; esperado ${bars}`);
    const events: ScoreEvent[] = [];
    ch.bars.forEach((bar, bi) => {
      const tokens = bar.trim().split(/\s+/);
      if (tokens.length !== STEPS_PER_BAR) {
        throw new ScoreError(`${where}, compasso ${bi + 1}: ${tokens.length} posições; esperado ${STEPS_PER_BAR}`);
      }
      tokens.forEach((token, ti) => {
        const step = bi * STEPS_PER_BAR + ti;
        if (token === '.') return;
        if (token === '-') {
          const last = events.at(-1);
          if (ch.voice === 'noise') throw new ScoreError(`${where}, compasso ${bi + 1}: "-" não vale no canal de ruído`);
          if (!last || last.step + last.length !== step) {
            throw new ScoreError(`${where}, compasso ${bi + 1}: "-" sem nota para sustentar`);
          }
          last.length += 1;
          return;
        }
        if (ch.voice === 'noise') {
          if (!isDrum(token)) throw new ScoreError(`${where}, compasso ${bi + 1}: token "${token}" inválido no canal de ruído (use k, s ou h)`);
          events.push({ step, length: 1, drum: token });
          return;
        }
        const freq = noteFrequency(token);
        if (freq === null) throw new ScoreError(`${where}, compasso ${bi + 1}: nota "${token}" inválida`);
        events.push({ step, length: 1, freq });
      });
    });
    return { voice: ch.voice, duty: ch.duty ?? 0.5, gain: ch.gain ?? 1, events };
  });

  return { bpm: src.bpm, steps: bars * STEPS_PER_BAR, stepSeconds: 60 / src.bpm / 4, channels };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/client/test/audio-score.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/audio/score.ts apps/client/test/audio-score.test.ts
git commit -m "feat(client/audio): parser de partitura em notação compacta" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Cues (mapeamento passo → som)

**Files:**
- Create: `apps/client/src/audio/cues.ts`
- Modify: `apps/client/src/match/timeline.ts` (linhas 18, 31, ~97 e ~131)
- Test: `apps/client/test/audio-cues.test.ts`

**Interfaces:**
- Consumes: `AnimStep`, `buildTimeline` de `../match/timeline`; `ReadResult` de `@pfl/engine`.
- Produces: `CUES` (lista `as const`), `Cue`, `TimedCue = { at: number; cue: Cue }` (`at` em ms), `cuesFor(steps): TimedCue[]`, `readCue(read, youAreOffense): Cue`. De `timeline.ts`: `TOUCHDOWN_BANNER` e `big?: boolean` no passo `RUN`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/client/test/audio-cues.test.ts
import { describe, expect, it } from 'vitest';
import type { GameEvent, PlayOutcome } from '@pfl/engine';
import { CUES, cuesFor, readCue, type Cue } from '../src/audio/cues';
import { buildTimeline, type AnimStep } from '../src/match/timeline';

const T = { at: 0, duration: 300 };
const cases: [AnimStep, Cue][] = [
  [{ kind: 'SNAP', ...T }, 'snap'],
  [{ kind: 'BLOCK', ...T }, 'block'],
  [{ kind: 'CLASH', off: 1, def: 2, effect: 'SUPER', ...T }, 'clash-super'],
  [{ kind: 'CLASH', off: 1, def: 2, effect: 'WEAK', ...T }, 'clash-weak'],
  [{ kind: 'CLASH', off: 1, def: 2, effect: 'IMMUNE', ...T }, 'clash-immune'],
  [{ kind: 'CLASH', off: 1, def: 2, effect: 'NEUTRAL', ...T }, 'clash'],
  [{ kind: 'CLASH', off: 1, def: 2, effect: null, ...T }, 'clash'],
  [{ kind: 'THROW', from: 1, to: 2, ...T }, 'throw'],
  [{ kind: 'RUN', carrier: 1, yards: 4, ...T }, 'run'],
  [{ kind: 'RUN', carrier: 1, yards: 4, big: false, ...T }, 'run'],
  [{ kind: 'RUN', carrier: 1, yards: 30, big: true, ...T }, 'run-big'],
  [{ kind: 'TACKLE', by: 2, carrier: 1, ...T }, 'tackle'],
  [{ kind: 'INCOMPLETE', ...T }, 'incomplete'],
  [{ kind: 'SACK', qb: 1, by: 2, yards: -6, ...T }, 'sack'],
  [{ kind: 'TURNOVER', by: 2, ...T }, 'turnover'],
  [{ kind: 'KICK', distance: 40, good: null, ...T }, 'kick'],
  [{ kind: 'KICK', distance: 35, good: true, ...T }, 'kick-good'],
  [{ kind: 'KICK', distance: 55, good: false, ...T }, 'kick-miss'],
  [{ kind: 'BANNER', text: 'É BOM!', tone: 'good', ...T }, 'banner-good'],
  [{ kind: 'BANNER', text: 'ERROU!', tone: 'bad', ...T }, 'banner-bad'],
  [{ kind: 'BANNER', text: 'FIRST DOWN!', tone: 'info', ...T }, 'banner-info'],
  [{ kind: 'BANNER', text: 'TOUCHDOWN!', tone: 'good', ...T }, 'td'],
];

describe('cuesFor', () => {
  for (const [step, cue] of cases) {
    it(`${step.kind} → ${cue}`, () => {
      expect(cuesFor([step])).toEqual([{ at: 0, cue }]);
    });
  }

  it('preserva o `at` de cada passo e lista vazia dá lista vazia', () => {
    const steps: AnimStep[] = [
      { kind: 'SNAP', at: 0, duration: 350 },
      { kind: 'TACKLE', by: 2, carrier: 1, at: 912, duration: 300 },
    ];
    expect(cuesFor(steps)).toEqual([
      { at: 0, cue: 'snap' },
      { at: 912, cue: 'tackle' },
    ]);
    expect(cuesFor([])).toEqual([]);
  });

  it('todo cue produzido existe em CUES', () => {
    for (const [step] of cases) for (const c of cuesFor([step])) expect(CUES).toContain(c.cue);
  });
});

describe('cues a partir de uma timeline real (guarda contra mudança nos textos dos banners)', () => {
  const outcome = (o: Partial<PlayOutcome> = {}): PlayOutcome => ({
    kind: 'GAIN', yards: 6, bigPlay: false, read: 'NEUTRAL', offActors: [25, 95], defActors: [130, 66],
    offTypeMult: 1, defTypeMult: 1, readFactor: 1, statFactor: 1, varianceFactor: 1, ...o,
  });
  const cards: GameEvent = { t: 'CARDS', offense: 'basic_run', defense: 'basic_defense', read: 'NEUTRAL' };
  const names = (events: GameEvent[]) => cuesFor(buildTimeline(events)).map((c) => c.cue);

  it('touchdown em jogada grande: snap, clash, run-big, td (sem tackle)', () => {
    const events: GameEvent[] = [cards, { t: 'PLAY', outcome: outcome({ yards: 30, bigPlay: true }) }, { t: 'TOUCHDOWN', team: 'A' }];
    expect(names(events)).toEqual(['snap', 'clash', 'run-big', 'td']);
  });

  it('corrida normal termina em tackle; first down e field goal usam os banners por tom', () => {
    expect(names([cards, { t: 'PLAY', outcome: outcome() }])).toEqual(['snap', 'clash', 'run', 'tackle']);
    expect(names([{ t: 'FIRST_DOWN' }])).toEqual(['banner-info']);
    expect(names([{ t: 'FIELD_GOAL', distance: 35, good: true }])).toEqual(['snap', 'kick-good', 'banner-good']);
    expect(names([{ t: 'FIELD_GOAL', distance: 55, good: false }])).toEqual(['snap', 'kick-miss', 'banner-bad']);
  });
});

describe('readCue (leitura do ponto de vista de quem joga)', () => {
  it('neutra é sempre neutra', () => {
    expect(readCue('NEUTRAL', true)).toBe('read-neutral');
    expect(readCue('NEUTRAL', false)).toBe('read-neutral');
  });
  it('defesa que acerta é boa para a defesa e ruim para o ataque', () => {
    expect(readCue('RIGHT', false)).toBe('read-good');
    expect(readCue('RIGHT', true)).toBe('read-bad');
  });
  it('defesa que erra é boa para o ataque e ruim para a defesa', () => {
    expect(readCue('WRONG', true)).toBe('read-good');
    expect(readCue('WRONG', false)).toBe('read-bad');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/client/test/audio-cues.test.ts`
Expected: FAIL (módulo `../src/audio/cues` não existe).

- [ ] **Step 3: Write minimal implementation**

Em `apps/client/src/match/timeline.ts`, faça quatro edições:

1. No tipo `AnimStep`, troque a linha do `RUN`:

```ts
    | { kind: 'RUN'; carrier: number; yards: number; big?: boolean }
```

2. Logo depois de `export const TIMELINE_BUDGET_MS = RESULT_ANIMATION_MS - 500;`, acrescente:

```ts
/** Texto do banner de touchdown; o áudio usa este valor para escolher o cue `td`. */
export const TOUCHDOWN_BANNER = 'TOUCHDOWN!';
```

3. Na corrida, troque a linha do `push` do `RUN`:

```ts
          push({ kind: 'RUN', carrier, yards: o.yards, big: o.bigPlay }, o.bigPlay ? D.runBig : D.run);
```

4. No `case 'TOUCHDOWN'`, troque o texto literal:

```ts
        push({ kind: 'BANNER', text: TOUCHDOWN_BANNER, tone: 'good' }, D.banner);
```

Depois crie o módulo:

```ts
// apps/client/src/audio/cues.ts
import type { ReadResult } from '@pfl/engine';
import { TOUCHDOWN_BANNER, type AnimStep } from '../match/timeline';

export const CUES = [
  'snap', 'block', 'clash', 'clash-super', 'clash-weak', 'clash-immune',
  'throw', 'run', 'run-big', 'tackle', 'incomplete', 'sack', 'turnover',
  'kick', 'kick-good', 'kick-miss',
  'banner-good', 'banner-bad', 'banner-info', 'td',
  'reveal', 'read-good', 'read-neutral', 'read-bad', 'turn-start',
  'ui-click', 'ui-select', 'ui-back', 'ui-error',
] as const;

export type Cue = (typeof CUES)[number];

/** `at` em ms desde o início da animação (o mesmo `at` do AnimStep). */
export interface TimedCue {
  at: number;
  cue: Cue;
}

function cueForStep(step: AnimStep): Cue | null {
  switch (step.kind) {
    case 'SNAP':
      return 'snap';
    case 'BLOCK':
      return 'block';
    case 'CLASH':
      if (step.effect === 'SUPER') return 'clash-super';
      if (step.effect === 'WEAK') return 'clash-weak';
      if (step.effect === 'IMMUNE') return 'clash-immune';
      return 'clash';
    case 'THROW':
      return 'throw';
    case 'RUN':
      return step.big ? 'run-big' : 'run';
    case 'TACKLE':
      return 'tackle';
    case 'INCOMPLETE':
      return 'incomplete';
    case 'SACK':
      return 'sack';
    case 'TURNOVER':
      return 'turnover';
    case 'KICK':
      return step.good === null ? 'kick' : step.good ? 'kick-good' : 'kick-miss';
    case 'BANNER':
      if (step.text === TOUCHDOWN_BANNER) return 'td';
      return step.tone === 'good' ? 'banner-good' : step.tone === 'bad' ? 'banner-bad' : 'banner-info';
  }
}

export function cuesFor(steps: readonly AnimStep[]): TimedCue[] {
  return steps.flatMap((s) => {
    const cue = cueForStep(s);
    return cue ? [{ at: s.at, cue }] : [];
  });
}

/**
 * A leitura (✔/·/✖) é do ponto de vista da defesa: RIGHT = a defesa acertou. O som é do ponto de vista de
 * quem joga: defesa certa é boa para a defesa e ruim para o ataque.
 */
export function readCue(read: ReadResult, youAreOffense: boolean): Cue {
  if (read === 'NEUTRAL') return 'read-neutral';
  const goodForDefense = read === 'RIGHT';
  return goodForDefense === youAreOffense ? 'read-bad' : 'read-good';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/client/test/audio-cues.test.ts apps/client/test/timeline.test.ts`
Expected: PASS (os testes antigos da timeline continuam verdes).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/audio/cues.ts apps/client/src/match/timeline.ts apps/client/test/audio-cues.test.ts
git commit -m "feat(client/audio): cues a partir dos passos da timeline" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Mixer (configurações, validação, persistência)

**Files:**
- Create: `apps/client/src/audio/mixer.ts`
- Test: `apps/client/test/audio-mixer.test.ts`

**Interfaces:**
- Consumes: `StorageLike`, `readJson`, `writeJson` de `../lib/storage`.
- Produces: `STORAGE_KEY`, `AudioSettings`, `DEFAULT_SETTINGS`, `MUSIC_BASE`, `SFX_BASE`, `roundVolume(v)`, `parseSettings(raw)`, `loadSettings(storage)`, `saveSettings(storage, s)`, `gainsFor(s)`, `VolumeLevel`, `volumeLevel(s)`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/client/test/audio-mixer.test.ts
import { describe, expect, it } from 'vitest';
import { memoryStorage } from '../src/lib/storage';
import {
  DEFAULT_SETTINGS, MUSIC_BASE, SFX_BASE, STORAGE_KEY,
  gainsFor, loadSettings, parseSettings, roundVolume, saveSettings, volumeLevel,
} from '../src/audio/mixer';

describe('roundVolume', () => {
  it('limita a 0..1 e arredonda em passos de 0,1', () => {
    expect(roundVolume(0.34)).toBe(0.3);
    expect(roundVolume(0.35)).toBe(0.4);
    expect(roundVolume(-2)).toBe(0);
    expect(roundVolume(7)).toBe(1);
  });
});

describe('parseSettings', () => {
  it('padrão: música 0,4, efeitos 0,7, sem mudo', () => {
    expect(DEFAULT_SETTINGS).toEqual({ muted: false, music: 0.4, sfx: 0.7 });
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('valor corrompido volta ao padrão por campo', () => {
    expect(parseSettings({ muted: 'sim', music: 7, sfx: 'alto' })).toEqual({ muted: false, music: 1, sfx: 0.7 });
    expect(parseSettings({ music: Number.NaN, sfx: null })).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('texto')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings([1, 2])).toEqual(DEFAULT_SETTINGS);
  });

  it('aceita um valor válido', () => {
    expect(parseSettings({ muted: true, music: 0.2, sfx: 0 })).toEqual({ muted: true, music: 0.2, sfx: 0 });
  });
});

describe('loadSettings / saveSettings', () => {
  it('ida e volta pelo storage', () => {
    const storage = memoryStorage();
    expect(saveSettings(storage, { muted: true, music: 0.3, sfx: 0.9 })).toBe(true);
    expect(loadSettings(storage)).toEqual({ muted: true, music: 0.3, sfx: 0.9 });
  });

  it('storage nulo, JSON quebrado ou escrita que falha não lançam', () => {
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
    const broken = memoryStorage();
    broken.setItem(STORAGE_KEY, '{nao e json');
    expect(loadSettings(broken)).toEqual(DEFAULT_SETTINGS);
    const full = { getItem: () => null, removeItem: () => {}, setItem: () => { throw new Error('cota'); } };
    expect(saveSettings(full, DEFAULT_SETTINGS)).toBe(false);
    expect(saveSettings(null, DEFAULT_SETTINGS)).toBe(false);
  });
});

describe('gainsFor', () => {
  it('mestre vale 0 no mudo e 1 fora dele; música fica abaixo dos efeitos', () => {
    expect(gainsFor({ muted: true, music: 1, sfx: 1 }).master).toBe(0);
    const g = gainsFor({ muted: false, music: 1, sfx: 1 });
    expect(g.master).toBe(1);
    expect(g.music).toBeCloseTo(MUSIC_BASE, 9);
    expect(g.sfx).toBeCloseTo(SFX_BASE, 9);
    expect(g.music).toBeLessThan(g.sfx);
  });
});

describe('volumeLevel (ondas do ícone)', () => {
  it('0 quando os dois volumes são 0; 1 a 3 pelo maior volume', () => {
    expect(volumeLevel({ muted: false, music: 0, sfx: 0 })).toBe(0);
    expect(volumeLevel({ muted: false, music: 0.2, sfx: 0 })).toBe(1);
    expect(volumeLevel({ muted: false, music: 0.4, sfx: 0.5 })).toBe(2);
    expect(volumeLevel({ muted: false, music: 0.4, sfx: 0.9 })).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/client/test/audio-mixer.test.ts`
Expected: FAIL (módulo `../src/audio/mixer` não existe).

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/client/src/audio/mixer.ts
import { readJson, writeJson, type StorageLike } from '../lib/storage';

export const STORAGE_KEY = 'pfl.audio.v1';

export interface AudioSettings {
  muted: boolean;
  /** 0 a 1, em passos de 0,1 */
  music: number;
  sfx: number;
}

export const DEFAULT_SETTINGS: AudioSettings = { muted: false, music: 0.4, sfx: 0.7 };

/** Ganhos-base: a música fica abaixo dos efeitos para o feedback da jogada sempre passar por cima. */
export const MUSIC_BASE = 0.22;
export const SFX_BASE = 0.5;

export function roundVolume(v: number): number {
  const clamped = Math.min(1, Math.max(0, v));
  return Math.round(clamped * 10) / 10;
}

export function parseSettings(raw: unknown): AudioSettings {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ...DEFAULT_SETTINGS };
  const o = raw as Record<string, unknown>;
  const volume = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? roundVolume(value) : fallback;
  return {
    muted: typeof o.muted === 'boolean' ? o.muted : DEFAULT_SETTINGS.muted,
    music: volume(o.music, DEFAULT_SETTINGS.music),
    sfx: volume(o.sfx, DEFAULT_SETTINGS.sfx),
  };
}

export function loadSettings(storage: StorageLike | null): AudioSettings {
  return parseSettings(readJson(storage, STORAGE_KEY));
}

export function saveSettings(storage: StorageLike | null, settings: AudioSettings): boolean {
  return writeJson(storage, STORAGE_KEY, settings);
}

export function gainsFor(s: AudioSettings): { master: number; music: number; sfx: number } {
  return { master: s.muted ? 0 : 1, music: s.music * MUSIC_BASE, sfx: s.sfx * SFX_BASE };
}

export type VolumeLevel = 0 | 1 | 2 | 3;

/** Quantas ondas o ícone mostra: pelo maior dos dois volumes. */
export function volumeLevel(s: AudioSettings): VolumeLevel {
  const top = Math.max(s.music, s.sfx);
  if (top <= 0) return 0;
  if (top <= 0.3) return 1;
  if (top <= 0.7) return 2;
  return 3;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/client/test/audio-mixer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/audio/mixer.ts apps/client/test/audio-mixer.test.ts
git commit -m "feat(client/audio): mixer com persistência e validação" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Backend (interface, falso para testes e Web Audio)

**Files:**
- Create: `apps/client/src/audio/backend.ts`, `apps/client/src/audio/webBackend.ts`, `apps/client/test/audio-fakes.ts`
- Test: coberto pelos testes das Tasks 5 a 7 (o `webBackend` só é verificável no navegador, na Task 11)

**Interfaces:**
- Produces: `Wave`, `Channel = 'music' | 'sfx'`, `Tone`, `AudioBackend`; `createWebBackend()`; `FakeBackend` (campos `tones`, `gains`, `fades`, `resumed`, `currentTime`, `available`, `running`).

- [ ] **Step 1: Write the implementation**

```ts
// apps/client/src/audio/backend.ts
export type Wave = 'square' | 'triangle' | 'noise';
export type Channel = 'music' | 'sfx';

export interface Tone {
  wave: Wave;
  /** onda quadrada: ciclo de trabalho de 0 a 1 */
  duty?: number;
  /** Hz; no ruído, a frequência central do filtro passa-faixa */
  freq: number;
  /** Hz final do glissando (exponencial) */
  freqEnd?: number;
  /** instante absoluto no relógio do backend, em segundos */
  start: number;
  duration: number;
  /** 0 a 1, antes dos ganhos do mixer */
  gain: number;
}

export interface AudioBackend {
  /** falso quando o navegador não oferece Web Audio */
  readonly available: boolean;
  /** relógio do contexto, em segundos (0 enquanto não houver contexto) */
  readonly currentTime: number;
  /** o contexto existe e está tocando */
  readonly running: boolean;
  /** cria o contexto, se preciso, e o retoma. Só pode ser chamado dentro de um gesto do usuário */
  resume(): void;
  setGain(node: 'master' | Channel, value: number, rampSeconds: number): void;
  /** fade do trecho de música atual, separado do volume do jogador */
  fadeMusic(value: number, seconds: number): void;
  playTone(channel: Channel, tone: Tone): void;
}
```

```ts
// apps/client/src/audio/webBackend.ts
import type { AudioBackend, Channel, Tone } from './backend';

const ATTACK_S = 0.004;
const SILENCE = 0.0001;
const PULSE_HARMONICS = 32;

type AudioContextCtor = typeof AudioContext;

function contextCtor(): AudioContextCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext;
}

const unavailable: AudioBackend = {
  available: false,
  currentTime: 0,
  running: false,
  resume: () => {},
  setGain: () => {},
  fadeMusic: () => {},
  playTone: () => {},
};

/** Série de Fourier de uma onda de pulso com o ciclo de trabalho `duty`. */
function pulseWave(ctx: AudioContext, duty: number): PeriodicWave {
  const real = new Float32Array(PULSE_HARMONICS + 1);
  const imag = new Float32Array(PULSE_HARMONICS + 1);
  for (let n = 1; n <= PULSE_HARMONICS; n++) {
    const k = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
    real[n] = k * Math.cos(n * Math.PI * duty);
    imag[n] = k * Math.sin(n * Math.PI * duty);
  }
  return ctx.createPeriodicWave(real, imag);
}

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

interface Graph {
  ctx: AudioContext;
  master: GainNode;
  music: GainNode;
  fade: GainNode;
  sfx: GainNode;
  noise: AudioBuffer;
}

export function createWebBackend(): AudioBackend {
  const Ctor = contextCtor();
  if (!Ctor) return unavailable;

  let graph: Graph | null = null;
  const pulses = new Map<number, PeriodicWave>();

  const ensure = (): Graph => {
    if (graph) return graph;
    const ctx = new Ctor();
    const master = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();
    const music = ctx.createGain();
    const fade = ctx.createGain();
    const sfx = ctx.createGain();
    fade.connect(music);
    music.connect(master);
    sfx.connect(master);
    master.connect(compressor);
    compressor.connect(ctx.destination);
    graph = { ctx, master, music, fade, sfx, noise: noiseBuffer(ctx) };
    return graph;
  };

  const ramp = (param: AudioParam, ctx: AudioContext, value: number, seconds: number) => {
    const t = ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(value, t + Math.max(seconds, 0.001));
  };

  return {
    available: true,
    get currentTime() {
      return graph?.ctx.currentTime ?? 0;
    },
    get running() {
      return graph?.ctx.state === 'running';
    },
    resume() {
      const { ctx } = ensure();
      if (ctx.state === 'suspended') void ctx.resume();
    },
    setGain(node, value, seconds) {
      if (!graph) return;
      ramp(graph[node].gain, graph.ctx, value, seconds);
    },
    fadeMusic(value, seconds) {
      if (!graph) return;
      ramp(graph.fade.gain, graph.ctx, value, seconds);
    },
    playTone(channel: Channel, tone: Tone) {
      if (!graph) return;
      const { ctx, noise } = graph;
      const start = Math.max(tone.start, ctx.currentTime);
      const end = start + tone.duration;
      const release = Math.min(0.04, tone.duration / 2);

      const env = ctx.createGain();
      env.gain.setValueAtTime(SILENCE, start);
      env.gain.linearRampToValueAtTime(tone.gain, start + ATTACK_S);
      env.gain.setValueAtTime(tone.gain, Math.max(start + ATTACK_S, end - release));
      env.gain.exponentialRampToValueAtTime(SILENCE, end);
      env.connect(channel === 'music' ? graph.fade : graph.sfx);

      let source: OscillatorNode | AudioBufferSourceNode;
      if (tone.wave === 'noise') {
        const src = ctx.createBufferSource();
        src.buffer = noise;
        src.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.value = 0.8;
        filter.frequency.setValueAtTime(tone.freq, start);
        if (tone.freqEnd) filter.frequency.exponentialRampToValueAtTime(tone.freqEnd, end);
        src.connect(filter);
        filter.connect(env);
        source = src;
      } else {
        const osc = ctx.createOscillator();
        if (tone.wave === 'square') {
          const duty = tone.duty ?? 0.5;
          let wave = pulses.get(duty);
          if (!wave) {
            wave = pulseWave(ctx, duty);
            pulses.set(duty, wave);
          }
          osc.setPeriodicWave(wave);
        } else {
          osc.type = 'triangle';
        }
        osc.frequency.setValueAtTime(tone.freq, start);
        if (tone.freqEnd) osc.frequency.exponentialRampToValueAtTime(tone.freqEnd, end);
        osc.connect(env);
        source = osc;
      }
      source.start(start);
      source.stop(end + 0.02);
      source.onended = () => env.disconnect();
    },
  };
}
```

```ts
// apps/client/test/audio-fakes.ts
import type { AudioBackend, Channel, Tone } from '../src/audio/backend';

/** Backend que só registra as chamadas; o relógio é movido à mão pelo teste. */
export class FakeBackend implements AudioBackend {
  available = true;
  running = false;
  currentTime = 0;
  resumed = 0;
  tones: { channel: Channel; tone: Tone }[] = [];
  gains: { node: 'master' | Channel; value: number; seconds: number }[] = [];
  fades: { value: number; seconds: number }[] = [];

  resume(): void {
    this.resumed += 1;
    this.running = true;
  }
  setGain(node: 'master' | Channel, value: number, seconds: number): void {
    this.gains.push({ node, value, seconds });
  }
  fadeMusic(value: number, seconds: number): void {
    this.fades.push({ value, seconds });
  }
  playTone(channel: Channel, tone: Tone): void {
    this.tones.push({ channel, tone });
  }
  /** tons de um canal */
  on(channel: Channel): Tone[] {
    return this.tones.filter((t) => t.channel === channel).map((t) => t.tone);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/audio/backend.ts apps/client/src/audio/webBackend.ts apps/client/test/audio-fakes.ts
git commit -m "feat(client/audio): interface AudioBackend, backend Web Audio e FakeBackend" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Receitas dos efeitos e síntese

**Files:**
- Create: `apps/client/src/audio/recipes.ts`, `apps/client/src/audio/synth.ts`
- Test: `apps/client/test/audio-recipes.test.ts`

**Interfaces:**
- Consumes: `Cue`, `CUES` de `./cues`; `AudioBackend`, `Wave` de `./backend`.
- Produces: `VoiceSpec`, `Recipe = readonly VoiceSpec[]`, `RECIPES: Record<Cue, Recipe>`, `recipeDuration(recipe): number`, `scheduleRecipe(backend, recipe, when): void`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/client/test/audio-recipes.test.ts
import { describe, expect, it } from 'vitest';
import { CUES } from '../src/audio/cues';
import { RECIPES } from '../src/audio/recipes';
import { recipeDuration, scheduleRecipe } from '../src/audio/synth';
import { FakeBackend } from './audio-fakes';

describe('RECIPES', () => {
  it('todo cue tem receita válida', () => {
    for (const cue of CUES) {
      const recipe = RECIPES[cue];
      expect(recipe, cue).toBeDefined();
      expect(recipe.length, cue).toBeGreaterThan(0);
      expect(recipe.length, cue).toBeLessThanOrEqual(8);
      for (const v of recipe) {
        expect(v.freq, cue).toBeGreaterThan(0);
        if (v.freqEnd !== undefined) expect(v.freqEnd, cue).toBeGreaterThan(0);
        expect(v.duration, cue).toBeGreaterThan(0);
        expect(v.delay, cue).toBeGreaterThanOrEqual(0);
        expect(v.gain, cue).toBeGreaterThan(0);
        expect(v.gain, cue).toBeLessThanOrEqual(1);
      }
      expect(recipeDuration(recipe), cue).toBeLessThanOrEqual(1.5);
    }
  });

  it('a fanfarra do touchdown é o som mais longo da jogada', () => {
    expect(recipeDuration(RECIPES.td)).toBeGreaterThan(recipeDuration(RECIPES['banner-good']));
    expect(recipeDuration(RECIPES.td)).toBeGreaterThan(0.8);
  });
});

describe('scheduleRecipe', () => {
  it('agenda cada voz no canal sfx a partir de `when`', () => {
    const backend = new FakeBackend();
    scheduleRecipe(backend, RECIPES.turnover, 2);
    expect(backend.tones).toHaveLength(RECIPES.turnover.length);
    expect(backend.tones.every((t) => t.channel === 'sfx')).toBe(true);
    RECIPES.turnover.forEach((v, i) => {
      expect(backend.tones[i].tone.start).toBeCloseTo(2 + v.delay, 9);
      expect(backend.tones[i].tone.freq).toBe(v.freq);
    });
  });

  it('recipeDuration é o maior atraso + duração', () => {
    expect(recipeDuration([{ wave: 'square', freq: 440, delay: 0, duration: 0.1, gain: 0.5 }, { wave: 'square', freq: 440, delay: 0.3, duration: 0.2, gain: 0.5 }])).toBeCloseTo(0.5, 9);
    expect(recipeDuration([])).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/client/test/audio-recipes.test.ts`
Expected: FAIL (módulos não existem).

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/client/src/audio/synth.ts
import type { AudioBackend, Wave } from './backend';

export interface VoiceSpec {
  wave: Wave;
  duty?: number;
  freq: number;
  freqEnd?: number;
  /** atraso em segundos desde o início do cue */
  delay: number;
  duration: number;
  gain: number;
}

export type Recipe = readonly VoiceSpec[];

export function recipeDuration(recipe: Recipe): number {
  return recipe.reduce((max, v) => Math.max(max, v.delay + v.duration), 0);
}

export function scheduleRecipe(backend: AudioBackend, recipe: Recipe, when: number): void {
  for (const v of recipe) {
    backend.playTone('sfx', {
      wave: v.wave,
      duty: v.duty,
      freq: v.freq,
      freqEnd: v.freqEnd,
      start: when + v.delay,
      duration: v.duration,
      gain: v.gain,
    });
  }
}
```

```ts
// apps/client/src/audio/recipes.ts
// Cada cue é uma lista de vozes: onda quadrada, triangular ou ruído filtrado. Para ajustar um som, edite os números.
import type { Cue } from './cues';
import type { Recipe, VoiceSpec } from './synth';

const sq = (freq: number, delay: number, duration: number, gain: number, freqEnd?: number, duty = 0.5): VoiceSpec => ({
  wave: 'square', duty, freq, freqEnd, delay, duration, gain,
});
const tri = (freq: number, delay: number, duration: number, gain: number, freqEnd?: number): VoiceSpec => ({
  wave: 'triangle', freq, freqEnd, delay, duration, gain,
});
const nz = (freq: number, delay: number, duration: number, gain: number, freqEnd?: number): VoiceSpec => ({
  wave: 'noise', freq, freqEnd, delay, duration, gain,
});

const KICK_SOUND: Recipe = [nz(2000, 0, 0.06, 0.5, 800), tri(180, 0, 0.12, 0.7, 70)];

export const RECIPES: Record<Cue, Recipe> = {
  // jogada
  snap: [nz(2500, 0, 0.05, 0.5, 1200)],
  block: [tri(110, 0, 0.12, 0.8, 60), nz(500, 0, 0.08, 0.4, 200)],
  clash: [sq(220, 0, 0.14, 0.5, 110), nz(900, 0, 0.1, 0.4, 300)],
  'clash-super': [sq(330, 0, 0.18, 0.5, 880), sq(660, 0.1, 0.22, 0.4, 1320), nz(1200, 0, 0.08, 0.3)],
  'clash-weak': [sq(330, 0, 0.2, 0.5, 110), nz(400, 0, 0.12, 0.3, 150)],
  'clash-immune': [tri(160, 0, 0.25, 0.5, 90)],
  throw: [sq(300, 0, 0.18, 0.3, 1200)],
  run: [nz(700, 0, 0.04, 0.35), nz(700, 0.09, 0.04, 0.35), nz(700, 0.18, 0.04, 0.35)],
  'run-big': [sq(523.25, 0, 0.08, 0.4), sq(659.25, 0.07, 0.08, 0.4), sq(783.99, 0.14, 0.08, 0.4), sq(1046.5, 0.21, 0.12, 0.4)],
  tackle: [nz(1500, 0, 0.12, 0.6, 200), tri(120, 0, 0.1, 0.7, 60)],
  incomplete: [sq(392, 0, 0.12, 0.4), sq(311, 0.14, 0.2, 0.4)],
  sack: [tri(140, 0, 0.3, 0.9, 40), nz(800, 0, 0.25, 0.6, 150)],
  turnover: [sq(523, 0, 0.12, 0.45), sq(415, 0.13, 0.12, 0.45), sq(311, 0.26, 0.25, 0.45)],
  kick: KICK_SOUND,
  'kick-good': [...KICK_SOUND, sq(784, 0.25, 0.1, 0.45), sq(1046, 0.35, 0.2, 0.45)],
  'kick-miss': [...KICK_SOUND, sq(300, 0.25, 0.3, 0.45, 150)],
  'banner-good': [sq(523, 0, 0.09, 0.4), sq(659, 0.09, 0.09, 0.4), sq(784, 0.18, 0.2, 0.4)],
  'banner-bad': [sq(311, 0, 0.12, 0.4), sq(233, 0.12, 0.25, 0.4)],
  'banner-info': [sq(880, 0, 0.07, 0.35), sq(1175, 0.07, 0.1, 0.35)],
  td: [
    sq(523, 0, 0.1, 0.45), sq(659, 0.1, 0.1, 0.45), sq(784, 0.2, 0.1, 0.45), sq(1046, 0.3, 0.25, 0.45),
    sq(784, 0.55, 0.1, 0.45), sq(1046, 0.65, 0.35, 0.45),
    tri(131, 0, 0.5, 0.6), tri(196, 0.55, 0.45, 0.6),
  ],
  // revelação, leitura e vez
  reveal: [nz(3000, 0, 0.04, 0.4, 1000), sq(660, 0.03, 0.08, 0.35, 990)],
  'read-good': [sq(880, 0, 0.08, 0.4), sq(1318, 0.08, 0.14, 0.4)],
  'read-neutral': [sq(660, 0, 0.1, 0.3)],
  'read-bad': [sq(262, 0, 0.12, 0.45, 196), sq(196, 0.12, 0.2, 0.45, 147)],
  'turn-start': [sq(988, 0, 0.06, 0.3), sq(1318, 0.07, 0.08, 0.3)],
  // interface
  'ui-click': [sq(1200, 0, 0.03, 0.3)],
  'ui-select': [sq(900, 0, 0.04, 0.3), sq(1350, 0.04, 0.05, 0.3)],
  'ui-back': [sq(700, 0, 0.04, 0.3, 450)],
  'ui-error': [sq(180, 0, 0.1, 0.5), sq(150, 0.11, 0.15, 0.5)],
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/client/test/audio-recipes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/audio/recipes.ts apps/client/src/audio/synth.ts apps/client/test/audio-recipes.test.ts
git commit -m "feat(client/audio): receitas dos efeitos e síntese em tons" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Sequenciador

**Files:**
- Create: `apps/client/src/audio/sequencer.ts`
- Test: `apps/client/test/audio-sequencer.test.ts`

**Interfaces:**
- Consumes: `AudioBackend`, `Tone` de `./backend`; `ParsedScore`, `ScoreChannel`, `ScoreEvent`, `DrumKind`, `VoiceName` de `./score`.
- Produces: `LOOKAHEAD_S`, `TICK_MS`, `FADE_S`, `Sequencer = { play(score | null); playOnce(score, onEnd); pause(); resume(); tick() }`, `createSequencer(backend): Sequencer`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/client/test/audio-sequencer.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FADE_S, createSequencer } from '../src/audio/sequencer';
import { noteFrequency, parseScore, type ParsedScore } from '../src/audio/score';
import { FakeBackend } from './audio-fakes';

// 120 bpm: semicolcheia = 0,125 s; um compasso = 2 s. Notas nos passos 0, 4, 8 e 12.
const bar = (note: string) => `${note} - - - ${note} - - - ${note} - - - ${note} - - -`;
const score = (note: string): ParsedScore => parseScore({ bpm: 120, channels: [{ voice: 'pulse1', bars: [bar(note)] }] });

/** avança o relógio do backend em passos de 25 ms, chamando tick() a cada passo */
function run(seq: { tick(): void }, backend: FakeBackend, from: number, to: number) {
  for (let t = from; t <= to + 1e-9; t += 0.025) {
    backend.currentTime = t;
    seq.tick();
  }
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createSequencer', () => {
  it('agenda à frente, no ritmo da partitura, repetindo o loop sem buracos', () => {
    const backend = new FakeBackend();
    const seq = createSequencer(backend);
    seq.play(score('C4'));
    run(seq, backend, 0, 4.2);
    const starts = backend.on('music').map((t) => t.start);
    expect(starts.slice(0, 8)).toEqual(starts.slice(0, 8).map((_, i) => expect.closeTo(0.05 + 0.5 * i, 6)));
    expect(backend.on('music')[0].freq).toBeCloseTo(noteFrequency('C4')!, 6);
    expect(backend.on('music')[0].duration).toBeCloseTo(4 * 0.125 * 0.92, 6);
    seq.play(null);
  });

  it('não agenda além da antecedência de 100 ms', () => {
    const backend = new FakeBackend();
    const seq = createSequencer(backend);
    seq.play(score('C4'));
    expect(backend.on('music').every((t) => t.start < 0.1 + 1e-9)).toBe(true);
    seq.play(null);
  });

  it('pedir a mesma faixa de novo não reinicia', () => {
    const backend = new FakeBackend();
    const seq = createSequencer(backend);
    const s = score('C4');
    seq.play(s);
    const before = backend.tones.length;
    seq.play(s);
    expect(backend.tones.length).toBe(before);
    seq.play(null);
  });

  it('troca de faixa: fade-out de 300 ms e só então a nova começa', () => {
    const backend = new FakeBackend();
    const seq = createSequencer(backend);
    seq.play(score('C4'));
    run(seq, backend, 0, 0.2);
    seq.play(score('G4'));
    expect(backend.fades.at(-1)).toEqual({ value: 0, seconds: FADE_S });
    const countBefore = backend.tones.length;
    run(seq, backend, 0.225, 0.4);
    expect(backend.tones.length).toBe(countBefore); // nada novo durante o fade
    vi.advanceTimersByTime(300);
    expect(backend.fades.at(-1)).toEqual({ value: 1, seconds: 0 });
    expect(backend.on('music').at(-1)?.freq).toBeCloseTo(noteFrequency('G4')!, 6);
    seq.play(null);
  });

  it('play(null) faz fade-out e para de agendar', () => {
    const backend = new FakeBackend();
    const seq = createSequencer(backend);
    seq.play(score('C4'));
    run(seq, backend, 0, 0.5);
    seq.play(null);
    expect(backend.fades.at(-1)).toEqual({ value: 0, seconds: FADE_S });
    const n = backend.tones.length;
    run(seq, backend, 0.55, 2);
    expect(backend.tones.length).toBe(n);
  });

  it('pausa não agenda; ao retomar depois de muito tempo não há rajada atrasada', () => {
    const backend = new FakeBackend();
    const seq = createSequencer(backend);
    seq.play(score('C4'));
    run(seq, backend, 0, 0.5);
    seq.pause();
    const n = backend.tones.length;
    run(seq, backend, 0.55, 3);
    expect(backend.tones.length).toBe(n);
    backend.currentTime = 60;
    seq.resume();
    seq.tick();
    const fresh = backend.tones.slice(n);
    expect(fresh.length).toBeLessThanOrEqual(2);
    expect(fresh.every((t) => t.tone.start >= 60)).toBe(true);
    seq.play(null);
  });

  it('playOnce chama onEnd uma única vez depois do último passo', () => {
    const backend = new FakeBackend();
    const seq = createSequencer(backend);
    const onEnd = vi.fn();
    seq.playOnce(score('C4'), onEnd);
    run(seq, backend, 0, 2.1);
    expect(onEnd).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(onEnd).toHaveBeenCalledTimes(1);
    const n = backend.tones.length;
    run(seq, backend, 2.2, 4);
    expect(backend.tones.length).toBe(n); // não repete
    vi.advanceTimersByTime(2000);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('percussão do canal de ruído vira tons de ruído e bumbo triangular', () => {
    const backend = new FakeBackend();
    const seq = createSequencer(backend);
    const drums = parseScore({ bpm: 120, channels: [{ voice: 'noise', bars: ['k . . . s . . . h . . . . . . .'] }] });
    seq.play(drums);
    run(seq, backend, 0, 1.2);
    const waves = backend.on('music').map((t) => t.wave);
    expect(waves.slice(0, 3)).toEqual(['triangle', 'noise', 'noise']);
    seq.play(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/client/test/audio-sequencer.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/client/src/audio/sequencer.ts
import type { AudioBackend, Tone } from './backend';
import type { DrumKind, ParsedScore, ScoreChannel, ScoreEvent, VoiceName } from './score';

export const LOOKAHEAD_S = 0.1;
export const TICK_MS = 25;
export const FADE_S = 0.3;

const START_DELAY_S = 0.05;
/** atraso máximo tolerado antes de recomeçar o relógio da faixa (evita rajada de notas velhas) */
const LATE_S = 0.25;
const NOTE_GAP = 0.92;

const VOICE_GAIN: Record<VoiceName, number> = { pulse1: 0.5, pulse2: 0.35, tri: 0.7, noise: 0.5 };

const DRUMS: Record<DrumKind, (start: number) => Tone> = {
  k: (start) => ({ wave: 'triangle', freq: 150, freqEnd: 45, start, duration: 0.12, gain: 0.9 }),
  s: (start) => ({ wave: 'noise', freq: 1800, freqEnd: 900, start, duration: 0.1, gain: 0.55 }),
  h: (start) => ({ wave: 'noise', freq: 7000, start, duration: 0.035, gain: 0.35 }),
};

interface Slot {
  channel: ScoreChannel;
  event: ScoreEvent;
}

interface Track {
  score: ParsedScore;
  byStep: Slot[][];
  loop: boolean;
  onEnd: (() => void) | null;
}

function makeTrack(score: ParsedScore, loop: boolean, onEnd: (() => void) | null): Track {
  const byStep: Slot[][] = Array.from({ length: score.steps }, () => []);
  for (const channel of score.channels) {
    for (const event of channel.events) byStep[event.step].push({ channel, event });
  }
  return { score, byStep, loop, onEnd };
}

export interface Sequencer {
  /** toca a faixa em loop; `null` para (com fade-out). A mesma faixa de novo não reinicia */
  play(score: ParsedScore | null): void;
  /** toca uma vez; `onEnd` roda quando o som termina */
  playOnce(score: ParsedScore, onEnd: () => void): void;
  pause(): void;
  resume(): void;
  /** um passo do agendador (chamado a cada TICK_MS; público para os testes) */
  tick(): void;
}

export function createSequencer(backend: AudioBackend): Sequencer {
  let track: Track | null = null;
  let pending: Track | null = null;
  let step = 0;
  let nextTime = 0;
  let paused = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let switchTimer: ReturnType<typeof setTimeout> | null = null;
  let endTimer: ReturnType<typeof setTimeout> | null = null;

  const clearTimers = () => {
    if (switchTimer !== null) clearTimeout(switchTimer);
    if (endTimer !== null) clearTimeout(endTimer);
    switchTimer = null;
    endTimer = null;
  };
  const stopTicking = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };

  function schedule(t: Track, i: number, start: number) {
    for (const { channel, event } of t.byStep[i]) {
      if (event.drum) {
        backend.playTone('music', DRUMS[event.drum](start));
      } else if (event.freq !== undefined) {
        backend.playTone('music', {
          wave: channel.voice === 'tri' ? 'triangle' : 'square',
          duty: channel.duty,
          freq: event.freq,
          start,
          duration: event.length * t.score.stepSeconds * NOTE_GAP,
          gain: VOICE_GAIN[channel.voice] * channel.gain,
        });
      }
    }
  }

  function finish(t: Track, remaining: number) {
    track = null;
    stopTicking();
    const onEnd = t.onEnd;
    if (onEnd) {
      endTimer = setTimeout(() => {
        endTimer = null;
        onEnd();
      }, Math.max(0, remaining) * 1000 + 100);
    }
  }

  function tick() {
    const t = track;
    if (t === null || paused) return;
    const now = backend.currentTime;
    if (nextTime < now - LATE_S) nextTime = now + 0.02;
    while (nextTime < now + LOOKAHEAD_S) {
      schedule(t, step, nextTime);
      step += 1;
      nextTime += t.score.stepSeconds;
      if (step >= t.score.steps) {
        if (t.loop) {
          step = 0;
          continue;
        }
        finish(t, nextTime - now);
        return;
      }
    }
  }

  function begin(next: Track) {
    pending = null;
    track = next;
    step = 0;
    nextTime = backend.currentTime + START_DELAY_S;
    backend.fadeMusic(1, 0);
    if (timer === null) timer = setInterval(tick, TICK_MS);
    tick();
  }

  function replaceWith(next: Track) {
    const wasPlaying = track !== null;
    clearTimers();
    track = null;
    if (!wasPlaying) {
      begin(next);
      return;
    }
    pending = next;
    backend.fadeMusic(0, FADE_S);
    switchTimer = setTimeout(() => {
      switchTimer = null;
      if (pending) begin(pending);
    }, FADE_S * 1000);
  }

  function stop() {
    const wasPlaying = track !== null;
    clearTimers();
    track = null;
    pending = null;
    stopTicking();
    if (wasPlaying) backend.fadeMusic(0, FADE_S);
  }

  return {
    play(score) {
      if (score === null) return stop();
      const current = track ?? pending;
      if (current && current.loop && current.score === score) return;
      replaceWith(makeTrack(score, true, null));
    },
    playOnce(score, onEnd) {
      replaceWith(makeTrack(score, false, onEnd));
    },
    pause() {
      paused = true;
    },
    resume() {
      if (!paused) return;
      paused = false;
      nextTime = Math.max(nextTime, backend.currentTime + 0.02);
      tick();
    },
    tick,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/client/test/audio-sequencer.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/audio/sequencer.ts apps/client/test/audio-sequencer.test.ts
git commit -m "feat(client/audio): sequenciador com agendamento à frente e troca com fade" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Motor (`createAudio`)

**Files:**
- Create: `apps/client/src/audio/engine.ts`
- Test: `apps/client/test/audio-engine.test.ts`

**Interfaces:**
- Consumes: `AudioBackend`, `Channel` (backend); `createSequencer` (sequencer); `loadSettings`, `saveSettings`, `gainsFor`, `roundVolume`, `AudioSettings` (mixer); `RECIPES`; `recipeDuration`, `scheduleRecipe` (synth); `cuesFor`, `Cue`, `TimedCue` (cues); `ParsedScore`; `AnimStep`; `StorageLike`.
- Produces: `MusicName = 'menu' | 'match'`, `JingleName = 'win' | 'lose'`, `AudioScores`, `AudioState`, `AudioDeps`, `Audio`, `COOLDOWN_S`, `MAX_CONCURRENT`, `createAudio(deps): Audio`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/client/test/audio-engine.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_CONCURRENT, createAudio, type AudioScores } from '../src/audio/engine';
import { MUSIC_BASE, SFX_BASE, STORAGE_KEY } from '../src/audio/mixer';
import { RECIPES } from '../src/audio/recipes';
import { noteFrequency, parseScore } from '../src/audio/score';
import { memoryStorage, type StorageLike } from '../src/lib/storage';
import type { AnimStep } from '../src/match/timeline';
import { FakeBackend } from './audio-fakes';

const tiny = (note: string) =>
  parseScore({ bpm: 120, channels: [{ voice: 'pulse1', bars: [`${note} - - - . . . . . . . . . . . .`] }] });
const scores: AudioScores = { menu: tiny('C4'), match: tiny('E4'), win: tiny('G4'), lose: tiny('A4') };

function setup(opts: { storage?: StorageLike | null; available?: boolean } = {}) {
  const backend = new FakeBackend();
  backend.available = opts.available ?? true;
  const storage = opts.storage === undefined ? memoryStorage() : opts.storage;
  const audio = createAudio({ backend, storage, scores });
  return { backend, storage, audio };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('desbloqueio', () => {
  it('efeitos antes do primeiro gesto são descartados; depois do unlock tocam', () => {
    const { backend, audio } = setup();
    audio.play('tackle');
    expect(backend.tones).toHaveLength(0);
    expect(audio.getState().unlocked).toBe(false);
    audio.unlock();
    audio.unlock();
    expect(backend.resumed).toBe(1);
    expect(audio.getState().unlocked).toBe(true);
    audio.play('tackle');
    expect(backend.tones).toHaveLength(RECIPES.tackle.length);
  });

  it('a música pedida antes do gesto começa quando o áudio é desbloqueado', () => {
    const { backend, audio } = setup();
    audio.setMusic('menu');
    expect(backend.tones).toHaveLength(0);
    audio.unlock();
    expect(backend.on('music')[0].freq).toBeCloseTo(noteFrequency('C4')!, 6);
  });

  it('se o contexto for suspenso de novo, o próximo gesto o retoma', () => {
    const { backend, audio } = setup();
    audio.unlock();
    backend.running = false;
    audio.unlock();
    expect(backend.resumed).toBe(2);
  });

  it('aplica os ganhos do mixer ao desbloquear', () => {
    const { backend, audio } = setup();
    audio.unlock();
    const last = (node: string) => backend.gains.filter((g) => g.node === node).at(-1)?.value;
    expect(last('master')).toBe(1);
    expect(last('music')).toBeCloseTo(0.4 * MUSIC_BASE, 9);
    expect(last('sfx')).toBeCloseTo(0.7 * SFX_BASE, 9);
  });
});

describe('sem Web Audio', () => {
  it('tudo vira no-op e available é falso', () => {
    const { backend, audio } = setup({ available: false });
    expect(audio.getState().available).toBe(false);
    audio.unlock();
    audio.setMusic('menu');
    audio.play('td');
    audio.playJingle('win');
    audio.playTimeline([{ kind: 'SNAP', at: 0, duration: 300 }]);
    expect(backend.resumed).toBe(0);
    expect(backend.tones).toHaveLength(0);
  });
});

describe('volume, mudo e persistência', () => {
  it('guarda no storage e a próxima instância lê de volta', () => {
    const { storage, audio } = setup();
    audio.setMuted(true);
    audio.setVolume('music', 0.34);
    const again = createAudio({ backend: new FakeBackend(), storage, scores });
    expect(again.getState()).toMatchObject({ muted: true, music: 0.3, sfx: 0.7 });
  });

  it('subir um volume acima de 0 desmuta; zerar não mexe no mudo', () => {
    const { audio } = setup();
    audio.setMuted(true);
    audio.setVolume('sfx', 0.5);
    expect(audio.getState().muted).toBe(false);
    audio.setMuted(true);
    audio.setVolume('sfx', 0);
    expect(audio.getState().muted).toBe(true);
  });

  it('mudo zera o mestre; efeitos não são agendados no mudo', () => {
    const { backend, audio } = setup();
    audio.unlock();
    audio.setMuted(true);
    expect(backend.gains.filter((g) => g.node === 'master').at(-1)?.value).toBe(0);
    audio.play('tackle');
    expect(backend.tones).toHaveLength(0);
  });

  it('valor corrompido no storage volta ao padrão, e storage nulo funciona', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, '{"music":7,"muted":"sim"}');
    expect(setup({ storage }).audio.getState()).toMatchObject({ muted: false, music: 1, sfx: 0.7 });
    expect(setup({ storage: null }).audio.getState()).toMatchObject({ muted: false, music: 0.4, sfx: 0.7 });
  });

  it('subscribe avisa quando o estado muda e getState é estável entre mudanças', () => {
    const { audio } = setup();
    const listener = vi.fn();
    const off = audio.subscribe(listener);
    const a = audio.getState();
    expect(audio.getState()).toBe(a);
    audio.setVolume('sfx', 0.2);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(audio.getState()).not.toBe(a);
    off();
    audio.setVolume('sfx', 0.3);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('proteção contra rajada', () => {
  it('o mesmo cue repetido em menos de 40 ms é descartado', () => {
    const { backend, audio } = setup();
    audio.unlock();
    audio.play('tackle');
    audio.play('tackle');
    expect(backend.tones).toHaveLength(RECIPES.tackle.length);
  });

  it('no máximo 3 instâncias simultâneas do mesmo cue', () => {
    const { backend, audio } = setup();
    audio.unlock();
    audio.playCues(Array.from({ length: 10 }, (_, i) => ({ at: i * 50, cue: 'td' as const })));
    expect(MAX_CONCURRENT).toBe(3);
    expect(backend.tones).toHaveLength(3 * RECIPES.td.length);
  });
});

describe('playTimeline', () => {
  it('agenda cada cue pelo `at` do passo, a partir do relógio atual', () => {
    const { backend, audio } = setup();
    audio.unlock();
    backend.currentTime = 10;
    const steps: AnimStep[] = [
      { kind: 'SNAP', at: 0, duration: 350 },
      { kind: 'TACKLE', by: 2, carrier: 1, at: 500, duration: 300 },
    ];
    audio.playTimeline(steps);
    const starts = backend.on('sfx').map((t) => t.start);
    expect(starts[0]).toBeCloseTo(10, 6);
    expect(starts.at(-1)).toBeGreaterThanOrEqual(10.5);
    expect(backend.on('sfx')).toHaveLength(RECIPES.snap.length + RECIPES.tackle.length);
  });
});

describe('aba oculta', () => {
  it('não toca efeitos enquanto oculta e a música pausa e volta', () => {
    const { backend, audio } = setup();
    audio.unlock();
    audio.setMusic('menu');
    audio.setHidden(true);
    const before = backend.tones.length;
    audio.play('tackle');
    backend.currentTime = 30;
    vi.advanceTimersByTime(500);
    expect(backend.tones.length).toBe(before);
    audio.setHidden(false);
    audio.play('tackle');
    expect(backend.tones.length).toBeGreaterThan(before);
  });
});

describe('música e jingle', () => {
  it('setMusic troca de faixa com fade; a mesma faixa não reinicia', () => {
    const { backend, audio } = setup();
    audio.unlock();
    audio.setMusic('menu');
    const n = backend.tones.length;
    audio.setMusic('menu');
    expect(backend.tones.length).toBe(n);
    audio.setMusic('match');
    expect(backend.fades.at(-1)).toEqual({ value: 0, seconds: 0.3 });
    vi.advanceTimersByTime(300);
    expect(backend.on('music').at(-1)?.freq).toBeCloseTo(noteFrequency('E4')!, 6);
  });

  it('o jingle substitui a música e setMusic durante o jingle só guarda a intenção', () => {
    const { backend, audio } = setup();
    audio.unlock();
    audio.setMusic('menu');
    audio.playJingle('win');
    expect(backend.fades.at(-1)).toEqual({ value: 0, seconds: 0.3 });
    audio.setMusic('match');
    vi.advanceTimersByTime(300);
    expect(backend.on('music').at(-1)?.freq).toBeCloseTo(noteFrequency('G4')!, 6);
  });

  it('jingle antes do desbloqueio é ignorado', () => {
    const { backend, audio } = setup();
    audio.playJingle('lose');
    expect(backend.tones).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/client/test/audio-engine.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/client/src/audio/engine.ts
import type { StorageLike } from '../lib/storage';
import type { AnimStep } from '../match/timeline';
import type { AudioBackend, Channel } from './backend';
import { cuesFor, type Cue, type TimedCue } from './cues';
import { gainsFor, loadSettings, roundVolume, saveSettings, type AudioSettings } from './mixer';
import { RECIPES } from './recipes';
import type { ParsedScore } from './score';
import { createSequencer } from './sequencer';
import { recipeDuration, scheduleRecipe } from './synth';

export type MusicName = 'menu' | 'match';
export type JingleName = 'win' | 'lose';

export interface AudioScores {
  menu: ParsedScore;
  match: ParsedScore;
  win: ParsedScore;
  lose: ParsedScore;
}

export interface AudioState extends AudioSettings {
  /** o navegador oferece Web Audio */
  available: boolean;
  /** já houve um gesto do usuário e o contexto foi criado */
  unlocked: boolean;
}

export interface AudioDeps {
  backend: AudioBackend;
  storage: StorageLike | null;
  scores: AudioScores;
}

export interface Audio {
  /** idempotente; chame dentro de um gesto do usuário */
  unlock(): void;
  play(cue: Cue): void;
  /** `at` em ms a partir de agora */
  playCues(cues: readonly TimedCue[]): void;
  playTimeline(steps: readonly AnimStep[]): void;
  setMusic(name: MusicName | null): void;
  playJingle(name: JingleName): void;
  setVolume(channel: Channel, value: number): void;
  setMuted(muted: boolean): void;
  setHidden(hidden: boolean): void;
  getState(): AudioState;
  subscribe(listener: () => void): () => void;
}

export const COOLDOWN_S = 0.04;
export const MAX_CONCURRENT = 3;

export function createAudio({ backend, storage, scores }: AudioDeps): Audio {
  let settings = loadSettings(storage);
  let unlocked = false;
  let hidden = false;
  let jingling = false;
  let wanted: MusicName | null = null;
  const listeners = new Set<() => void>();
  const sequencer = createSequencer(backend);
  const lastScheduled = new Map<Cue, number>();
  const endTimes = new Map<Cue, number[]>();

  const snapshot = (): AudioState => ({ available: backend.available, unlocked, ...settings });
  let state = snapshot();
  const emit = () => {
    state = snapshot();
    listeners.forEach((l) => l());
  };

  const applyGains = (rampSeconds: number) => {
    const g = gainsFor(settings);
    backend.setGain('master', g.master, rampSeconds);
    backend.setGain('music', g.music, rampSeconds);
    backend.setGain('sfx', g.sfx, rampSeconds);
  };

  const applyMusic = () => sequencer.play(wanted ? scores[wanted] : null);

  const scheduleCue = (cue: Cue, delaySeconds: number) => {
    if (!unlocked || !backend.available || hidden) return;
    if (settings.muted || settings.sfx === 0) return;
    const when = backend.currentTime + delaySeconds;
    const last = lastScheduled.get(cue);
    if (last !== undefined && Math.abs(when - last) < COOLDOWN_S) return;
    const live = (endTimes.get(cue) ?? []).filter((end) => end > when);
    if (live.length >= MAX_CONCURRENT) {
      endTimes.set(cue, live);
      return;
    }
    const recipe = RECIPES[cue];
    scheduleRecipe(backend, recipe, when);
    live.push(when + recipeDuration(recipe));
    endTimes.set(cue, live);
    lastScheduled.set(cue, when);
  };

  const update = (next: AudioSettings) => {
    settings = next;
    saveSettings(storage, settings);
    if (unlocked) applyGains(0.03);
    emit();
  };

  return {
    unlock() {
      if (!backend.available) return;
      if (!backend.running) backend.resume();
      if (unlocked) return;
      unlocked = true;
      applyGains(0);
      if (wanted !== null) applyMusic();
      emit();
    },
    play: (cue) => scheduleCue(cue, 0),
    playCues(cues) {
      for (const { at, cue } of cues) scheduleCue(cue, at / 1000);
    },
    playTimeline(steps) {
      for (const { at, cue } of cuesFor(steps)) scheduleCue(cue, at / 1000);
    },
    setMusic(name) {
      wanted = name;
      if (unlocked && !jingling) applyMusic();
    },
    playJingle(name) {
      if (!unlocked || !backend.available) return;
      jingling = true;
      sequencer.playOnce(scores[name], () => {
        jingling = false;
        applyMusic();
      });
    },
    setVolume(channel, value) {
      const v = roundVolume(value);
      const muted = settings.muted && v === 0; // subir um volume desmuta
      update(channel === 'music' ? { ...settings, music: v, muted } : { ...settings, sfx: v, muted });
    },
    setMuted(muted) {
      update({ ...settings, muted });
    },
    setHidden(value) {
      hidden = value;
      if (value) sequencer.pause();
      else sequencer.resume();
    },
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/client/test/audio-engine.test.ts`
Expected: PASS. Se algum teste de relógio falhar por diferença de arredondamento, ajuste só o teste (tolerância), não o motor.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/audio/engine.ts apps/client/test/audio-engine.test.ts
git commit -m "feat(client/audio): motor de áudio com desbloqueio, mixer e proteção contra rajada" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Partituras (faixas e jingles) e singleton `audio`

**Files:**
- Create: `apps/client/src/audio/scores/helpers.ts`, `scores/menu.ts`, `scores/match.ts`, `scores/jingles.ts`, `scores/index.ts`, `apps/client/src/audio/index.ts`
- Test: `apps/client/test/audio-scores.test.ts`

**Interfaces:**
- Consumes: `ScoreSource`, `parseScore` (score); `AudioScores` (engine); `createAudio`, `createWebBackend`, `getLocalStorage`.
- Produces: `SCORES: AudioScores`; `audio` (singleton) e re-exports de `Audio`, `AudioState`.

Esta task é o commit "para ouvir": as melodias são originais e ficam em dados, para você ajustar notas sem mexer em lógica.

- [ ] **Step 1: Write the failing test**

```ts
// apps/client/test/audio-scores.test.ts
import { describe, expect, it } from 'vitest';
import { SCORES } from '../src/audio/scores';

const seconds = (s: { steps: number; stepSeconds: number }) => s.steps * s.stepSeconds;

describe('SCORES', () => {
  it('as quatro partituras são válidas, com 1 a 4 canais', () => {
    for (const [name, score] of Object.entries(SCORES)) {
      expect(score.channels.length, name).toBeGreaterThanOrEqual(1);
      expect(score.channels.length, name).toBeLessThanOrEqual(4);
      for (const ch of score.channels) expect(ch.events.length, `${name}/${ch.voice}`).toBeGreaterThan(0);
    }
  });

  it('durações: faixas de 8 compassos e jingles de cerca de 2 s', () => {
    expect(SCORES.menu.steps).toBe(8 * 16);
    expect(SCORES.match.steps).toBe(8 * 16);
    expect(seconds(SCORES.menu)).toBeCloseTo(20, 1);
    expect(seconds(SCORES.match)).toBeCloseTo(14.55, 1);
    expect(seconds(SCORES.win)).toBeGreaterThan(1.5);
    expect(seconds(SCORES.win)).toBeLessThan(3);
    expect(seconds(SCORES.lose)).toBeGreaterThan(1.5);
    expect(seconds(SCORES.lose)).toBeLessThan(3);
  });

  it('as faixas diferem em andamento e as notas ficam em uma faixa audível', () => {
    expect(SCORES.match.bpm).toBeGreaterThan(SCORES.menu.bpm);
    for (const score of Object.values(SCORES)) {
      for (const ch of score.channels) {
        for (const e of ch.events) {
          if (e.freq !== undefined) {
            expect(e.freq).toBeGreaterThan(50);
            expect(e.freq).toBeLessThan(2300);
          }
        }
      }
    }
  });

  it('o canal de ruído só existe como percussão', () => {
    for (const score of Object.values(SCORES)) {
      for (const ch of score.channels.filter((c) => c.voice === 'noise')) {
        expect(ch.events.every((e) => e.drum !== undefined && e.freq === undefined)).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/client/test/audio-scores.test.ts`
Expected: FAIL (módulo `../src/audio/scores` não existe).

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/client/src/audio/scores/helpers.ts
// Montadores de compassos de 16 posições (semicolcheias).
const repeat = (tokens: readonly string[], times: number): string[] => Array.from({ length: times }, () => tokens).flat();

/** arpejo em semicolcheias: a b c b, quatro vezes */
export const arp16 = (a: string, b: string, c: string): string => repeat([a, b, c, b], 4).join(' ');
/** arpejo em colcheias: a . b . c . b ., duas vezes */
export const arp8 = (a: string, b: string, c: string): string => repeat([a, '.', b, '.', c, '.', b, '.'], 2).join(' ');
/** baixo de duas notas, cada uma sustentada por meio compasso */
export const bass2 = (a: string, b: string): string => [a, ...repeat(['-'], 7), b, ...repeat(['-'], 7)].join(' ');
/** baixo pulsante em colcheias */
export const bass8 = (root: string): string => repeat([root, '-'], 8).join(' ');
/** uma nota sustentada pelo compasso inteiro */
export const hold = (note: string): string => [note, ...repeat(['-'], 15)].join(' ');
/** o mesmo compasso repetido */
export const bars = (bar: string, times: number): string[] => repeat([bar], times);
```

```ts
// apps/client/src/audio/scores/menu.ts
// Menu e lobby: 96 bpm, dó maior, 8 compassos (C | Am | F | G | C | Am | F | G). Obra original do projeto.
import type { ScoreSource } from '../score';
import { arp16, bars, bass2 } from './helpers';

export const MENU: ScoreSource = {
  bpm: 96,
  channels: [
    {
      voice: 'pulse1',
      duty: 0.5,
      bars: [
        'E5 - - . G5 - - . E5 - D5 - C5 - - .',
        'A4 - - . C5 - - . E5 - D5 - C5 - - .',
        'A4 - - . C5 - - . F5 - E5 - C5 - - .',
        'B4 - - . D5 - - . G5 - F5 - D5 - - .',
        'E5 - - . G5 - - . C6 - B5 - G5 - - .',
        'A5 - - . G5 - - . E5 - D5 - E5 - - .',
        'F5 - - . E5 - - . C5 - D5 - E5 - F5 -',
        'D5 - - - B4 - - - G4 - - - . . . .',
      ],
    },
    {
      voice: 'pulse2',
      duty: 0.25,
      gain: 0.6,
      bars: [
        arp16('C4', 'E4', 'G4'), arp16('A3', 'C4', 'E4'), arp16('F3', 'A3', 'C4'), arp16('G3', 'B3', 'D4'),
        arp16('C4', 'E4', 'G4'), arp16('A3', 'C4', 'E4'), arp16('F3', 'A3', 'C4'), arp16('G3', 'B3', 'D4'),
      ],
    },
    {
      voice: 'tri',
      bars: [
        bass2('C3', 'G2'), bass2('A2', 'E2'), bass2('F2', 'C3'), bass2('G2', 'D3'),
        bass2('C3', 'G2'), bass2('A2', 'E2'), bass2('F2', 'C3'), bass2('G2', 'D3'),
      ],
    },
    { voice: 'noise', gain: 0.5, bars: bars('k . . . h . . . h . . . h . . .', 8) },
  ],
};
```

```ts
// apps/client/src/audio/scores/match.ts
// Partida: 132 bpm, lá menor, 8 compassos (Am | F | C | G | Am | F | G | E). Obra original do projeto.
import type { ScoreSource } from '../score';
import { arp8, bars, bass8 } from './helpers';

export const MATCH: ScoreSource = {
  bpm: 132,
  channels: [
    {
      voice: 'pulse1',
      duty: 0.25,
      bars: [
        'A4 . A4 C5 . E5 . C5 A4 . A4 C5 E5 . D5 .',
        'A4 . A4 C5 . F5 . C5 A4 . A4 C5 F5 . E5 .',
        'G4 . G4 C5 . E5 . C5 G4 . G4 C5 E5 . D5 .',
        'G4 . G4 B4 . D5 . B4 G4 . G4 B4 D5 . C5 .',
        'E5 . E5 . D5 . C5 . A4 . C5 . E5 - - .',
        'F5 . F5 . E5 . C5 . A4 . C5 . F5 - - .',
        'D5 . D5 . B4 . G4 . B4 . D5 . G5 - - .',
        'E5 . D5 . B4 . G#4 . B4 . D5 . E5 - - -',
      ],
    },
    {
      voice: 'pulse2',
      duty: 0.5,
      gain: 0.6,
      bars: [
        arp8('A3', 'C4', 'E4'), arp8('F3', 'A3', 'C4'), arp8('C4', 'E4', 'G4'), arp8('G3', 'B3', 'D4'),
        arp8('A3', 'C4', 'E4'), arp8('F3', 'A3', 'C4'), arp8('G3', 'B3', 'D4'), arp8('E3', 'G#3', 'B3'),
      ],
    },
    {
      voice: 'tri',
      bars: [bass8('A2'), bass8('F2'), bass8('C3'), bass8('G2'), bass8('A2'), bass8('F2'), bass8('G2'), bass8('E2')],
    },
    { voice: 'noise', gain: 0.55, bars: bars('k . h . s . h . k . h . s . h h', 8) },
  ],
};
```

```ts
// apps/client/src/audio/scores/jingles.ts
// Jingles de fim de jogo, tocados uma vez. Obras originais do projeto.
import type { ScoreSource } from '../score';
import { bass2, hold } from './helpers';

/** Vitória: 200 bpm, 2 compassos (~2,4 s), escala ascendente em dó maior. */
export const WIN: ScoreSource = {
  bpm: 200,
  channels: [
    {
      voice: 'pulse1',
      duty: 0.5,
      bars: ['C5 . E5 . G5 . C6 . G5 . E5 . G5 . C6 .', 'C6 - - - E6 - - - G6 - - - C7 - - -'],
    },
    {
      voice: 'pulse2',
      duty: 0.25,
      gain: 0.6,
      bars: ['E4 . G4 . C5 . E5 . C5 . G4 . C5 . E5 .', 'G5 - - - C6 - - - E6 - - - G6 - - -'],
    },
    { voice: 'tri', bars: [bass2('C3', 'G2'), hold('C3')] },
    { voice: 'noise', gain: 0.5, bars: ['k . . . s . . . k . . . s . s s', 'k . . . . . . . . . . . . . . .'] },
  ],
};

/** Derrota: 110 bpm, 1 compasso (~2,2 s), descendo para lá menor. */
export const LOSE: ScoreSource = {
  bpm: 110,
  channels: [
    { voice: 'pulse1', duty: 0.5, bars: ['E5 - - - C5 - - - B4 - - - A4 - - -'] },
    { voice: 'pulse2', duty: 0.25, gain: 0.6, bars: ['C5 - - - A4 - - - G#4 - - - E4 - - -'] },
    { voice: 'tri', bars: [hold('A2')] },
  ],
};
```

```ts
// apps/client/src/audio/scores/index.ts
import type { AudioScores } from '../engine';
import { parseScore } from '../score';
import { LOSE, WIN } from './jingles';
import { MATCH } from './match';
import { MENU } from './menu';

export const SCORES: AudioScores = {
  menu: parseScore(MENU),
  match: parseScore(MATCH),
  win: parseScore(WIN),
  lose: parseScore(LOSE),
};
```

```ts
// apps/client/src/audio/index.ts
import { getLocalStorage } from '../lib/storage';
import { createAudio } from './engine';
import { SCORES } from './scores';
import { createWebBackend } from './webBackend';

export type { Audio, AudioState, JingleName, MusicName } from './engine';

/** Instância única do app. Em Node (testes) o backend é o "indisponível" e o storage é nulo. */
export const audio = createAudio({ backend: createWebBackend(), storage: getLocalStorage(), scores: SCORES });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/client/test/audio-scores.test.ts && npm run typecheck`
Expected: PASS e sem erros de tipo. Se um compasso estiver com número errado de posições, o `parseScore` aponta canal e compasso na mensagem: corrija a string.

- [ ] **Step 5: Commit (para audição)**

```bash
git add apps/client/src/audio/scores apps/client/src/audio/index.ts apps/client/test/audio-scores.test.ts
git commit -m "feat(client/audio): faixas de menu e partida, jingles e singleton audio" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Pausa para audição**

Antes da Task 10, avise a pessoa responsável: as faixas só podem ser julgadas de ouvido. Depois da Task 10 (quando tudo estiver ligado) ela ouve no navegador; ajustes de nota entram como commits pequenos só em `scores/*.ts`.

---

### Task 9: Controle de áudio (`AudioControl`)

**Files:**
- Create: `apps/client/src/audio/speaker.ts`, `AudioControlView.tsx`, `AudioControl.tsx`, `useAudioState.ts`, `audio.css`
- Test: `apps/client/test/audio-control.test.ts`

**Interfaces:**
- Consumes: `AudioState` (engine); `Channel` (backend); `volumeLevel`, `VolumeLevel` (mixer); `audio` (index).
- Produces: `ICON_COLS`, `ICON_ROWS`, `speakerCells(level, muted)`; `AudioControlView` (props `AudioControlViewProps`); `AudioControl`; `useAudioState()`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/client/test/audio-control.test.ts
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AudioControlView, type AudioControlViewProps } from '../src/audio/AudioControlView';
import type { AudioState } from '../src/audio/engine';
import { ICON_COLS, ICON_ROWS, speakerCells } from '../src/audio/speaker';

const state = (over: Partial<AudioState> = {}): AudioState => ({
  available: true, unlocked: true, muted: false, music: 0.4, sfx: 0.7, ...over,
});
const props = (over: Partial<AudioControlViewProps> = {}): AudioControlViewProps => ({
  state: state(),
  open: false,
  onToggleMute: vi.fn(),
  onToggleOpen: vi.fn(),
  onVolume: vi.fn(),
  onVolumeCommit: vi.fn(),
  ...over,
});
const html = (over: Partial<AudioControlViewProps> = {}) => renderToStaticMarkup(createElement(AudioControlView, props(over)));

describe('speakerCells', () => {
  const body = speakerCells(0, false).length;

  it('o corpo do alto-falante é fixo e as ondas crescem com o nível', () => {
    expect(body).toBe(26);
    expect(speakerCells(1, false)).toHaveLength(body + 2);
    expect(speakerCells(2, false)).toHaveLength(body + 2 + 4);
    expect(speakerCells(3, false)).toHaveLength(body + 2 + 4 + 6);
  });

  it('mudo troca as ondas por um X, qualquer que seja o nível', () => {
    expect(speakerCells(3, true)).toHaveLength(body + 12);
    expect(speakerCells(0, true)).toHaveLength(body + 12);
  });

  it('todas as células cabem na grade do ícone, sem repetição', () => {
    for (const level of [0, 1, 2, 3] as const) {
      for (const muted of [false, true]) {
        const cells = speakerCells(level, muted);
        expect(new Set(cells.map(([x, y]) => `${x},${y}`)).size).toBe(cells.length);
        for (const [x, y] of cells) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThan(ICON_COLS);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThan(ICON_ROWS);
        }
      }
    }
  });
});

describe('AudioControlView', () => {
  it('some quando o navegador não tem Web Audio', () => {
    expect(html({ state: state({ available: false }) })).toBe('');
  });

  it('botão de mudo: rótulo estável e aria-pressed reflete o estado', () => {
    const on = html();
    expect(on).toContain('aria-label="Silenciar o som"');
    expect(on).toContain('aria-pressed="false"');
    const muted = html({ state: state({ muted: true }) });
    expect(muted).toContain('aria-label="Silenciar o som"');
    expect(muted).toContain('aria-pressed="true"');
    expect(muted).toContain('audio-btn-muted');
  });

  it('o grupo se chama Som e o gatilho dos volumes informa aria-expanded', () => {
    const closed = html();
    expect(closed).toContain('role="group"');
    expect(closed).toContain('aria-label="Som"');
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).not.toContain('audio-popover');
    const open = html({ open: true });
    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain('audio-popover');
  });

  it('o popover tem Música e Efeitos como controles de 0 a 10 com o valor atual', () => {
    const open = html({ open: true, state: state({ music: 0.4, sfx: 0.7 }) });
    expect(open).toContain('Música');
    expect(open).toContain('Efeitos');
    expect(open).toContain('type="range"');
    expect(open).toContain('min="0"');
    expect(open).toContain('max="10"');
    expect(open).toContain('value="4"');
    expect(open).toContain('value="7"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/client/test/audio-control.test.ts`
Expected: FAIL (módulos não existem).

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/client/src/audio/speaker.ts
import type { VolumeLevel } from './mixer';

export const ICON_COLS = 12;
export const ICON_ROWS = 8;

// Alto-falante em pixel art, 5×8. Cada '#' é um pixel.
const BODY = ['....#', '...##', '#####', '#####', '#####', '#####', '...##', '....#'];

/** Células [x, y] do ícone: corpo, mais as ondas (nível 1 a 3) ou um X (mudo). */
export function speakerCells(level: VolumeLevel, muted: boolean): [number, number][] {
  const cells: [number, number][] = [];
  BODY.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === '#') cells.push([x, y]);
  });
  if (muted) {
    for (let i = 0; i < 6; i++) {
      cells.push([6 + i, 1 + i]);
      cells.push([11 - i, 1 + i]);
    }
    return cells;
  }
  const waves: [number, number, number][] = [
    [6, 3, 4], // coluna, linha inicial, linha final
    [8, 2, 5],
    [10, 1, 6],
  ];
  waves.slice(0, level).forEach(([x, from, to]) => {
    for (let y = from; y <= to; y++) cells.push([x, y]);
  });
  return cells;
}
```

```tsx
// apps/client/src/audio/AudioControlView.tsx
import type { ReactElement, Ref } from 'react';
import type { Channel } from './backend';
import type { AudioState } from './engine';
import { volumeLevel, type VolumeLevel } from './mixer';
import { ICON_COLS, ICON_ROWS, speakerCells } from './speaker';
import './audio.css';

export interface AudioControlViewProps {
  state: AudioState;
  open: boolean;
  rootRef?: Ref<HTMLDivElement>;
  onToggleMute(): void;
  onToggleOpen(): void;
  /** `value` de 0 a 10 */
  onVolume(channel: Channel, value: number): void;
  /** o jogador soltou o controle (tecla ou ponteiro) */
  onVolumeCommit(channel: Channel): void;
}

export function SpeakerIcon({ level, muted }: { level: VolumeLevel; muted: boolean }): ReactElement {
  return (
    <svg className="audio-icon" viewBox={`0 0 ${ICON_COLS} ${ICON_ROWS}`} aria-hidden="true" focusable="false">
      {speakerCells(level, muted).map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />
      ))}
    </svg>
  );
}

const ROWS: { channel: Channel; label: string }[] = [
  { channel: 'music', label: 'Música' },
  { channel: 'sfx', label: 'Efeitos' },
];

export function AudioControlView({ state, open, rootRef, onToggleMute, onToggleOpen, onVolume, onVolumeCommit }: AudioControlViewProps): ReactElement | null {
  if (!state.available) return null;
  return (
    <div ref={rootRef} className="audio-control" role="group" aria-label="Som">
      {open && (
        <div className="audio-popover" id="audio-popover">
          <p className="audio-popover-title">Som</p>
          {ROWS.map(({ channel, label }) => {
            const n = Math.round(state[channel] * 10);
            return (
              <label key={channel} className="audio-row">
                <span className="audio-row-head">
                  <span>{label}</span>
                  <span className="audio-value">{n}</span>
                </span>
                <input
                  className="audio-range"
                  type="range"
                  min={0}
                  max={10}
                  step={1}
                  value={n}
                  onChange={(e) => onVolume(channel, Number(e.currentTarget.value))}
                  onPointerUp={() => onVolumeCommit(channel)}
                  onKeyUp={() => onVolumeCommit(channel)}
                />
              </label>
            );
          })}
        </div>
      )}
      <button
        type="button"
        className={`btn audio-btn${state.muted ? ' audio-btn-muted' : ''}`}
        aria-label="Silenciar o som"
        aria-pressed={state.muted}
        title="Silenciar o som"
        onClick={onToggleMute}
      >
        <SpeakerIcon level={volumeLevel(state)} muted={state.muted} />
      </button>
      <button
        type="button"
        className="btn audio-btn audio-btn-volume"
        aria-label="Ajustar volumes"
        aria-expanded={open}
        aria-controls={open ? 'audio-popover' : undefined}
        title="Ajustar volumes"
        onClick={onToggleOpen}
      >
        <span className="audio-arrow" aria-hidden="true">
          {open ? '▼' : '▲'}
        </span>
      </button>
    </div>
  );
}
```

```ts
// apps/client/src/audio/useAudioState.ts
import { useSyncExternalStore } from 'react';
import { audio } from './index';
import type { AudioState } from './engine';

export function useAudioState(): AudioState {
  return useSyncExternalStore(audio.subscribe, audio.getState, audio.getState);
}
```

```tsx
// apps/client/src/audio/AudioControl.tsx
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import type { Channel } from './backend';
import { AudioControlView } from './AudioControlView';
import { audio } from './index';
import { useAudioState } from './useAudioState';

/** Controle global de som: montado uma vez em App.tsx. Esc fecha o popover e devolve o foco. */
export function AudioControl(): ReactElement | null {
  const state = useAudioState();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) rootRef.current?.querySelector<HTMLButtonElement>('.audio-btn-volume')?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(true);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, close]);

  return (
    <AudioControlView
      state={state}
      open={open}
      rootRef={rootRef}
      onToggleMute={() => audio.setMuted(!state.muted)}
      onToggleOpen={() => setOpen((o) => !o)}
      onVolume={(channel: Channel, value: number) => audio.setVolume(channel, value / 10)}
      onVolumeCommit={(channel: Channel) => {
        if (channel === 'sfx') audio.play('ui-select'); // o jogador ouve o nível dos efeitos
      }}
    />
  );
}
```

```css
/* apps/client/src/audio/audio.css */
.audio-control {
  position: fixed;
  right: max(var(--space-4), env(safe-area-inset-right));
  bottom: max(var(--space-4), env(safe-area-inset-bottom));
  z-index: 40; /* abaixo do .notice-top (50) */
  display: flex;
  align-items: flex-end;
  gap: var(--space-2);
}

.audio-btn {
  width: 44px;
  height: 44px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.audio-btn-muted { background: var(--gbc-panel-dark); }

.audio-icon {
  width: 24px;
  height: 16px;
  fill: var(--gbc-ink);
  shape-rendering: crispEdges;
}

.audio-arrow {
  font-family: var(--font-display);
  font-size: var(--fs-sm);
}

.audio-popover {
  position: absolute;
  right: 0;
  bottom: calc(100% + var(--space-2));
  width: min(260px, calc(100vw - 32px));
  background: var(--gbc-paper);
  border: var(--border);
  box-shadow: var(--shadow);
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.audio-popover-title {
  font-family: var(--font-display);
  font-size: var(--fs-md);
  margin: 0;
}

.audio-row {
  display: grid;
  gap: var(--space-1);
  font-size: var(--fs-body);
}

.audio-row-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.audio-value {
  font-family: var(--font-display);
  font-size: var(--fs-sm);
}

.audio-range {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 44px; /* alvo de toque */
  margin: 0;
  background: transparent;
  cursor: pointer;
}

.audio-range::-webkit-slider-runnable-track {
  box-sizing: border-box;
  height: 18px;
  background: var(--gbc-panel);
  border: 3px solid var(--gbc-border);
}

.audio-range::-moz-range-track {
  box-sizing: border-box;
  height: 18px;
  background: var(--gbc-panel);
  border: 3px solid var(--gbc-border);
}

.audio-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  box-sizing: border-box;
  width: 16px;
  height: 28px;
  margin-top: -5px;
  background: var(--gbc-red);
  border: 3px solid var(--gbc-border);
  border-radius: 0;
}

.audio-range::-moz-range-thumb {
  box-sizing: border-box;
  width: 16px;
  height: 28px;
  background: var(--gbc-red);
  border: 3px solid var(--gbc-border);
  border-radius: 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/client/test/audio-control.test.ts && npm run typecheck`
Expected: PASS e sem erros de tipo.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/audio/speaker.ts apps/client/src/audio/AudioControlView.tsx apps/client/src/audio/AudioControl.tsx apps/client/src/audio/useAudioState.ts apps/client/src/audio/audio.css apps/client/test/audio-control.test.ts
git commit -m "feat(client/audio): controle global de som com volumes de música e efeitos" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Ligação ao jogo (`useGameAudio`, `App.tsx`, `ReplayViewer.tsx`)

**Files:**
- Create: `apps/client/src/audio/gameAudio.ts`, `apps/client/src/audio/browser.ts`, `apps/client/src/audio/useGameAudio.ts`
- Modify: `apps/client/src/match/matchState.ts` (exportar `revealFrom`), `apps/client/src/App.tsx`, `apps/client/src/screens/end/ReplayViewer.tsx`
- Test: `apps/client/test/audio-game.test.ts`

**Interfaces:**
- Consumes: `revealFrom`, `PanelMode`, `panelMode`, `MatchClientState` (matchState); `Screen` (app/screen); `readCue`, `cuesFor`, `Cue`, `TimedCue` (cues); `JingleName`, `MusicName` (engine); `audio` (index); `EndMessage`, `RoomState` (@pfl/protocol).
- Produces: `STALE_GRACE_MS`, `READ_DELAY_MS`, `musicForScreen`, `jingleFor`, `animationCues`, `replayCues`, `turnStartCue`; `shouldClickSound`, `installBrowserHooks`; `useGameAudio`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/client/test/audio-game.test.ts
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@pfl/engine';
import { shouldClickSound } from '../src/audio/browser';
import {
  READ_DELAY_MS, STALE_GRACE_MS, animationCues, jingleFor, musicForScreen, replayCues, turnStartCue,
} from '../src/audio/gameAudio';
import type { AnimStep } from '../src/match/timeline';

describe('musicForScreen', () => {
  it('partida usa a faixa da partida; as demais telas usam a do menu', () => {
    expect(musicForScreen('MATCH')).toBe('match');
    for (const s of ['HOME', 'BUILDER', 'LOBBY', 'END'] as const) expect(musicForScreen(s)).toBe('menu');
  });
});

describe('jingleFor', () => {
  it('vitória, derrota e empate (sem jingle)', () => {
    expect(jingleFor({ A: 21, B: 14 }, 'A')).toBe('win');
    expect(jingleFor({ A: 21, B: 14 }, 'B')).toBe('lose');
    expect(jingleFor({ A: 7, B: 7 }, 'A')).toBeNull();
  });
});

describe('animationCues', () => {
  const steps: AnimStep[] = [
    { kind: 'SNAP', at: 0, duration: 350 },
    { kind: 'TACKLE', by: 2, carrier: 1, at: 700, duration: 300 },
  ];
  const cards = (read: 'RIGHT' | 'NEUTRAL' | 'WRONG', offense = 'basic_run'): GameEvent => ({
    t: 'CARDS', offense, defense: 'basic_defense', read,
  });
  const anim = (events: GameEvent[], endsAt = 10_000) => ({ events, steps, endsAt });
  const names = (cues: { cue: string }[]) => cues.map((c) => c.cue);

  it('revelação em t=0, leitura em +250 ms e depois os passos da timeline', () => {
    const cues = animationCues(anim([cards('RIGHT')]), true, 0);
    expect(cues[0]).toEqual({ at: 0, cue: 'reveal' });
    expect(cues[1]).toEqual({ at: READ_DELAY_MS, cue: 'read-bad' }); // defesa acertou, e eu ataco
    expect(names(cues.slice(2))).toEqual(['snap', 'tackle']);
  });

  it('a leitura depende do lado de quem joga', () => {
    expect(animationCues(anim([cards('RIGHT')]), false, 0)[1].cue).toBe('read-good');
    expect(animationCues(anim([cards('WRONG')]), true, 0)[1].cue).toBe('read-good');
    expect(animationCues(anim([cards('NEUTRAL')]), true, 0)[1].cue).toBe('read-neutral');
  });

  it('sem lado (replay) toca a revelação e não a leitura', () => {
    const cues = animationCues(anim([cards('RIGHT')]), null, 0);
    expect(names(cues)).toEqual(['reveal', 'snap', 'tackle']);
  });

  it('punt não tem leitura a destacar', () => {
    const cues = animationCues(anim([cards('NEUTRAL', 'punt')]), true, 0);
    expect(names(cues)).toEqual(['reveal', 'snap', 'tackle']);
  });

  it('sem evento de cartas só há os passos', () => {
    expect(names(animationCues(anim([{ t: 'FIRST_DOWN' }]), true, 0))).toEqual(['snap', 'tackle']);
  });

  it('resultado velho demais não toca', () => {
    expect(animationCues(anim([cards('RIGHT')], 5000), true, 5000 + STALE_GRACE_MS + 1)).toEqual([]);
    expect(animationCues(anim([cards('RIGHT')], 5000), true, 5000 + STALE_GRACE_MS)).not.toEqual([]);
  });

  it('replayCues usa os eventos do quadro, sem lado e sem prazo', () => {
    expect(names(replayCues([cards('RIGHT')], steps))).toEqual(['reveal', 'snap', 'tackle']);
  });
});

describe('turnStartCue', () => {
  it('toca ao entrar numa etapa em que o jogador escolhe; não repete na mesma etapa', () => {
    expect(turnStartCue(null, 'PICK_FORMATION')).toBe('turn-start');
    expect(turnStartCue('ANIMATING', 'PICK_CARD')).toBe('turn-start');
    expect(turnStartCue('PICK_FORMATION', 'PICK_FORMATION')).toBeNull();
    expect(turnStartCue('PICK_CARD', 'WAIT_OPPONENT')).toBeNull();
    expect(turnStartCue(null, 'ANIMATING')).toBeNull();
  });
});

describe('shouldClickSound', () => {
  function el(over: { found?: boolean; disabled?: boolean; ariaDisabled?: string; inAudio?: boolean } = {}) {
    const button = {
      disabled: over.disabled ?? false,
      getAttribute: (n: string) => (n === 'aria-disabled' ? (over.ariaDisabled ?? null) : null),
      closest: (sel: string) => (sel === '.audio-control' && over.inAudio ? {} : null),
    };
    return { closest: (sel: string) => (sel.includes('button') && over.found !== false ? button : null) } as unknown as Element;
  }

  it('toca em botões ativos e ignora desabilitados, aria-disabled, o próprio controle e alvos que não são botão', () => {
    expect(shouldClickSound(el())).toBe(true);
    expect(shouldClickSound(el({ disabled: true }))).toBe(false);
    expect(shouldClickSound(el({ ariaDisabled: 'true' }))).toBe(false);
    expect(shouldClickSound(el({ inAudio: true }))).toBe(false);
    expect(shouldClickSound(el({ found: false }))).toBe(false);
    expect(shouldClickSound(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/client/test/audio-game.test.ts`
Expected: FAIL (módulos não existem).

- [ ] **Step 3: Write minimal implementation**

Em `apps/client/src/match/matchState.ts`, troque a declaração (linha ~120):

```ts
export function revealFrom(events: readonly GameEvent[]): CardReveal | null {
```

Depois crie os módulos:

```ts
// apps/client/src/audio/gameAudio.ts
// Decisões puras do que tocar a partir do estado do jogo. O hook useGameAudio só as aplica.
import type { GameEvent, TeamKey } from '@pfl/engine';
import type { Screen } from '../app/screen';
import { revealFrom, type PanelMode } from '../match/matchState';
import type { AnimStep } from '../match/timeline';
import { cuesFor, readCue, type Cue, type TimedCue } from './cues';
import type { JingleName, MusicName } from './engine';

/** Folga depois do fim da animação em que um resultado ainda pode tocar. */
export const STALE_GRACE_MS = 1000;
/** Atraso do som da leitura em relação à revelação. */
export const READ_DELAY_MS = 250;

export function musicForScreen(screen: Screen): MusicName {
  return screen === 'MATCH' ? 'match' : 'menu';
}

export function jingleFor(score: Record<TeamKey, number>, you: TeamKey): JingleName | null {
  const other: TeamKey = you === 'A' ? 'B' : 'A';
  if (score[you] === score[other]) return null;
  return score[you] > score[other] ? 'win' : 'lose';
}

export interface AnimationAudioInput {
  events: readonly GameEvent[];
  steps: readonly AnimStep[];
  endsAt: number;
}

/**
 * Sons de uma jogada: revelação em t=0, leitura em +250 ms (se houver lado) e os passos da timeline.
 * `youAreOffense` é null quando não há lado (replay). Resultado velho demais devolve lista vazia.
 */
export function animationCues(a: AnimationAudioInput, youAreOffense: boolean | null, now: number): TimedCue[] {
  if (now > a.endsAt + STALE_GRACE_MS) return [];
  const cues: TimedCue[] = [];
  const reveal = revealFrom(a.events);
  if (reveal) {
    cues.push({ at: 0, cue: 'reveal' });
    if (reveal.read && youAreOffense !== null) cues.push({ at: READ_DELAY_MS, cue: readCue(reveal.read, youAreOffense) });
  }
  return [...cues, ...cuesFor(a.steps)];
}

export function replayCues(events: readonly GameEvent[], steps: readonly AnimStep[]): TimedCue[] {
  return animationCues({ events, steps, endsAt: Number.POSITIVE_INFINITY }, null, 0);
}

/** Toca ao entrar numa etapa em que o jogador precisa escolher. */
export function turnStartCue(prev: PanelMode | null, next: PanelMode): Cue | null {
  return next.startsWith('PICK_') && prev !== next ? 'turn-start' : null;
}
```

```ts
// apps/client/src/audio/browser.ts
// Ligações com o navegador: desbloqueio por gesto, aba oculta e som de clique nos botões.
import type { Audio } from './engine';

const UNLOCK_EVENTS = ['pointerdown', 'touchend', 'click', 'keydown'] as const;

/** Botão ativo fora do próprio controle de som. */
export function shouldClickSound(target: Element | null): boolean {
  const button = target?.closest?.('button, [role="button"]');
  if (!button) return false;
  if (button.closest('.audio-control')) return false;
  if ((button as HTMLButtonElement).disabled === true) return false;
  return button.getAttribute('aria-disabled') !== 'true';
}

export function installBrowserHooks(audio: Audio): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  const unlock = () => audio.unlock(); // idempotente e barato: retoma o contexto se o navegador o suspendeu
  const onClick = (e: MouseEvent) => {
    if (shouldClickSound(e.target as Element | null)) audio.play('ui-click');
  };
  const onVisibility = () => audio.setHidden(document.hidden);

  for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlock, { capture: true, passive: true });
  document.addEventListener('click', onClick, true);
  document.addEventListener('visibilitychange', onVisibility);
  onVisibility();
  return () => {
    for (const type of UNLOCK_EVENTS) window.removeEventListener(type, unlock, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
```

```ts
// apps/client/src/audio/useGameAudio.ts
import { useEffect, useRef } from 'react';
import type { RoomState } from '@pfl/protocol';
import type { Screen } from '../app/screen';
import { panelMode, type MatchClientState, type PanelMode } from '../match/matchState';
import { installBrowserHooks } from './browser';
import { animationCues, jingleFor, musicForScreen, turnStartCue } from './gameAudio';
import { audio } from './index';

interface Input {
  screen: Screen;
  match: MatchClientState;
  room: RoomState | null;
  notice: string | null;
  now: number;
}

/** Liga o estado do jogo ao áudio. Chamado uma vez, em App.tsx. */
export function useGameAudio({ screen, match, room, notice, now }: Input): void {
  useEffect(() => installBrowserHooks(audio), []);

  // Música pela tela.
  useEffect(() => {
    audio.setMusic(musicForScreen(screen));
  }, [screen]);

  // Jingle ao entrar na tela de fim.
  useEffect(() => {
    if (screen !== 'END' || !match.end) return;
    const jingle = jingleFor(match.end.score, room?.you ?? 'A');
    if (jingle) audio.playJingle(jingle);
  }, [screen, match.end, room?.you]);

  // Sons da jogada: uma vez por animação nova.
  const lastSeq = useRef(0);
  useEffect(() => {
    const a = match.animation;
    if (!a) {
      lastSeq.current = 0;
      return;
    }
    if (a.seq === lastSeq.current) return;
    lastSeq.current = a.seq;
    const youAreOffense = room ? a.stage.offenseTeam === room.you : null;
    audio.playCues(animationCues(a, youAreOffense, Date.now()));
  }, [match.animation, room]);

  // Aviso de vez.
  const prevMode = useRef<PanelMode | null>(null);
  const mode = room ? panelMode(match, now) : null;
  useEffect(() => {
    if (mode === null) {
      prevMode.current = null;
      return;
    }
    const cue = turnStartCue(prevMode.current, mode);
    prevMode.current = mode;
    if (cue && screen === 'MATCH') audio.play(cue);
  }, [mode, screen]);

  // Erros.
  useEffect(() => {
    if (match.lastError) audio.play('ui-error');
  }, [match.lastError]);
  useEffect(() => {
    if (notice) audio.play('ui-error');
  }, [notice]);
}
```

Em `apps/client/src/App.tsx`:

1. Adicione os imports junto dos demais imports de tela:

```ts
import { AudioControl } from './audio/AudioControl';
import { useGameAudio } from './audio/useGameAudio';
```

2. Logo depois da linha `const screen = screenFor({ local, room, match, now: room ? now : Date.now() });`, acrescente:

```ts
  useGameAudio({ screen, match, room, notice, now: room ? now : Date.now() });
```

3. No JSX, como primeiro filho do fragmento (antes do bloco `{notice && (`), acrescente:

```tsx
      <AudioControl />
```

Em `apps/client/src/screens/end/ReplayViewer.tsx`:

1. Adicione os imports:

```ts
import { audio } from '../../audio';
import { replayCues } from '../../audio/gameAudio';
```

2. Logo depois da linha `const partial = useMemo(...)` e **antes** do primeiro `if (!build.ok)`, acrescente (os hooks precisam ficar antes dos retornos antecipados):

```ts
  useEffect(() => {
    if (frame && play) audio.playCues(replayCues(frame.events, frame.steps));
  }, [frame, play]);
```

(`useEffect` já está importado no arquivo.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/client/test/audio-game.test.ts && npm run typecheck && npm test`
Expected: PASS em tudo, incluindo a suíte inteira (`match-state.test.ts` e `replay.test.ts` continuam verdes).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/audio/gameAudio.ts apps/client/src/audio/browser.ts apps/client/src/audio/useGameAudio.ts apps/client/src/match/matchState.ts apps/client/src/App.tsx apps/client/src/screens/end/ReplayViewer.tsx apps/client/test/audio-game.test.ts
git commit -m "feat(client/audio): liga o áudio ao jogo, ao replay e aos botões" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Documentação e verificação final

**Files:**
- Create: `docs/AUDIO.md`

- [ ] **Step 1: Escrever `docs/AUDIO.md`**

```markdown
# Áudio do PFL

Todo o áudio é **sintetizado em código** com Web Audio. Não há arquivos de áudio, nem de terceiros, no repositório.

## Créditos e licença

Os efeitos (`apps/client/src/audio/recipes.ts`) e as músicas (`apps/client/src/audio/scores/`) são obras originais deste projeto. Valem sob a licença que o repositório adotar. O repositório ainda não tem arquivo `LICENSE`; definir a licença é uma decisão do responsável e independe do áudio.

## Como funciona

- `cues.ts` traduz os passos da animação da jogada em nomes de som (`tackle`, `td`, `clash-super`...).
- `recipes.ts` descreve cada som como uma lista de vozes (onda quadrada, triangular ou ruído). Para ajustar um efeito, edite frequências, durações e volumes.
- `scores/*.ts` guardam as duas faixas (menu e partida) e os jingles de vitória e derrota. Cada compasso tem 16 posições (semicolcheias): nota (`C4`, `F#3`, `Bb2`), `.` pausa, `-` sustenta; no canal `noise`, `k` bumbo, `s` caixa e `h` chimbal. Um compasso com número errado de posições faz o parser apontar o canal e o compasso.
- `engine.ts` junta tudo e só inicia o áudio depois do primeiro gesto do usuário (política dos navegadores).
- Volume de música, volume de efeitos e mudo ficam em `localStorage` (`pfl.audio.v1`).

## Como testar

- `npm test` cobre cues, receitas, partituras, mixer, sequenciador, motor e controle.
- Se os sons e melodias soam bem só se descobre ouvindo: `npm run dev:client`, abrir o jogo, clicar em qualquer lugar e usar o botão de som no canto inferior direito.
```

- [ ] **Step 2: Verificação automática**

Run: `npm test && npm run typecheck && npm run build:client`
Expected: tudo verde e build sem erros. Se `npm run build:client` falhar só por causa de sprites (`prebuild` baixa sprites com `--allow-missing`), registre a saída e siga: não é regressão do áudio.

- [ ] **Step 3: Verificação manual no navegador (desktop e 390 px)**

Rodar `npm run dev:server` e `npm run dev:client`, abrir duas abas e conferir, com o controle de som visível:
1. Antes de qualquer clique não há som; ao primeiro clique, o clique soa e a música do menu começa.
2. Mudo: o botão mostra o X, o som some; clicar de novo restaura. Mover um volume enquanto mudo desmuta.
3. Volumes: Música e Efeitos persistem após F5. Soltar o volume de Efeitos toca o blip de amostra.
4. Teclado: Tab alcança o mudo e o gatilho (▲); Enter abre o popover; setas mudam o volume; Esc fecha e devolve o foco ao gatilho.
5. Partida de ponta a ponta com dois jogadores: troca para a faixa da partida; revelação e leitura soam diferente para ataque e defesa; super efetivo, tackle, first down, TD, FG e turnover soam; no fim, o jingle certo (vitória/derrota) e depois a música do menu.
6. Replay na tela de fim: os sons acompanham os quadros.
7. Aba em segundo plano e volta: nada soa oculto, sem rajada ao voltar.
8. Em 390 px: o controle não cobre a mão de cartas nem o painel de escolha (se cobrir, mover para o canto superior direito, abaixo do `.notice-top`) e o popover não gera rolagem horizontal.
9. Capture telas do controle (fechado, aberto, mudo) em desktop e 390 px.

- [ ] **Step 4: Detector do impeccable (uma vez, com a interface pronta)**

Run (a partir de `apps/client`): `"/home/asaas/.claude/plugins/cache/impeccable/impeccable/4.5.2/skills/impeccable/scripts/impeccable" detect --json src/audio/AudioControlView.tsx src/audio/audio.css`
Expected: sem achados de contraste, alvo de toque ou movimento. Corrija tudo de uma vez e rode no máximo mais uma vez.

- [ ] **Step 5: Commit**

```bash
git add docs/AUDIO.md
git commit -m "docs(client/audio): créditos, licença e como ajustar os sons" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Depois da verificação, use `superpowers:finishing-a-development-branch`. Se o PR #8 já tiver entrado na `main`, faça `git rebase origin/main` antes de abrir o PR; os únicos arquivos que podem conflitar são `App.tsx` e `ReplayViewer.tsx`, e só se o #8 passar a tocá-los.
