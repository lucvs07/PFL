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

  it('CUES não guarda cue sem uso (ui-back foi removido)', () => {
    expect(CUES).not.toContain('ui-back');
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
