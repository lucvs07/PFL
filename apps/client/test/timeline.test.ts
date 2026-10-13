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
    // os atores padrão são Gyarados (4x) e Machop (1x): média 2x; só o Gyarados dá 4x
    expect(buildTimeline(play('electric_thunder_screen')).find((s) => s.kind === 'CLASH')).toMatchObject({ mult: 2 });
    expect(buildTimeline(play('electric_thunder_screen', { defActors: [130] })).find((s) => s.kind === 'CLASH')).toMatchObject({ mult: 4 });
    expect(buildTimeline(play('basic_run')).find((s) => s.kind === 'CLASH')).toMatchObject({ mult: null });
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
