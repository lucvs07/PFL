import { describe, it, expect } from 'vitest';
import { SUGGESTED_TEAMS, createMatch, step, playerView, type Action, type MatchState, type TeamKey } from '@pfl/engine';
import { actingTeams, botAction, botDecide, distanceOf, fourthDownDecision, predictOffense } from '../src/bot';

const [VERMILION, CINNABAR] = SUGGESTED_TEAMS;
const start = (seed = 1): MatchState => createMatch(VERMILION, CINNABAR, seed).state;
const other = (k: TeamKey): TeamKey => (k === 'A' ? 'B' : 'A');

function advance(s: MatchState, ...actions: Action[]): MatchState {
  return actions.reduce((state, a) => step(state, a).state, s);
}
const toPlaycall = (s: MatchState): MatchState =>
  advance(s, { type: 'FORMATION', team: s.offense, formation: 'PISTOL' }, { type: 'PACKAGE', team: other(s.offense), package: 'BASE' });

describe('actingTeams', () => {
  it('segue a fase', () => {
    const s = start();
    expect(actingTeams(s)).toEqual(['A']);
    const pkg = advance(s, { type: 'FORMATION', team: 'A', formation: 'PISTOL' });
    expect(actingTeams(pkg)).toEqual(['B']);
    const call = toPlaycall(s);
    expect(actingTeams(call)).toEqual(['A', 'B']);
    expect(actingTeams(advance(call, { type: 'CARD', team: 'A', cardId: 'basic_run' }))).toEqual(['B']);
  });
});

describe('botAction', () => {
  it('recusa agir por um time que não precisa agir', () => {
    expect(() => botAction(start(), 'B', 1)).toThrow(/não age/);
  });

  it('sempre produz ações aceitas pelo motor (20 partidas completas)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let s = createMatch(SUGGESTED_TEAMS[seed % 6], SUGGESTED_TEAMS[(seed + 1) % 6], seed).state;
      let rng = seed * 13;
      for (let i = 0; i < 5000 && s.phase !== 'MATCH_END'; i++) {
        const d = botAction(s, actingTeams(s)[0], rng);
        rng = d.rng;
        s = step(s, d.action).state;
      }
      expect(s.phase).toBe('MATCH_END');
    }
  });

  it('não usa informação escondida: a carta da defesa não depende da carta já escolhida pelo ataque', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const call = toPlaycall(start(seed));
      const before = botAction(call, 'B', seed * 101);
      for (const cardId of ['basic_run', 'basic_pass']) {
        const after = botAction(advance(call, { type: 'CARD', team: 'A', cardId }), 'B', seed * 101);
        expect(after).toEqual(before);
      }
    }
  });

  it('é determinístico para o mesmo estado e rng', () => {
    const s = toPlaycall(start(5));
    expect(botAction(s, 'A', 77)).toEqual(botAction(s, 'A', 77));
  });
});

describe('heurística de down & distance', () => {
  it('classifica a distância', () => {
    expect(distanceOf(1)).toBe('SHORT');
    expect(distanceOf(3)).toBe('SHORT');
    expect(distanceOf(5)).toBe('MEDIUM');
    expect(distanceOf(10)).toBe('LONG');
  });

  it('prevê mais passes contra Spread e mais corridas contra Pesada', () => {
    const view = playerView(toPlaycall(start()), 'B');
    const spread = predictOffense({ ...view, formation: 'SPREAD' });
    const heavy = predictOffense({ ...view, formation: 'HEAVY' });
    expect(spread.RUN_INSIDE).toBeLessThan(heavy.RUN_INSIDE);
    expect(spread.DEEP_PASS).toBeGreaterThan(heavy.DEEP_PASS);
    expect(Object.values(spread).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it('decide o 4º down', () => {
    const view = playerView(start(), 'A');
    const at = (ballOn: number, yardsToGo: number, extra: Partial<typeof view> = {}) =>
      fourthDownDecision({ ...view, field: { down: 4, yardsToGo, ballOn }, ...extra }, 81);
    expect(at(25, 8)).toBe('PUNT');
    expect(at(50, 1)).toBe('GO');
    expect(at(80, 9)).toBe('FIELD_GOAL');
    const lastPossession = { possessions: { A: 6, B: 6 }, score: { A: 0, B: 7 } };
    expect(at(25, 8, lastPossession)).toBe('GO');
  });

  it('no 4º down escolhe a carta especial que decidiu', () => {
    const s = toPlaycall(start());
    s.field = { down: 4, yardsToGo: 9, ballOn: 20 };
    expect(botAction(s, 'A', 3).action).toEqual({ type: 'CARD', team: 'A', cardId: 'punt' });
  });

  it('a defesa escolhe pela leitura esperada: Zona Profunda mais que Contenção em 3ª e longa contra Spread', () => {
    const s = toPlaycall(start());
    s.field = { down: 3, yardsToGo: 12, ballOn: 40 };
    s.formation = 'SPREAD';
    const view = { ...playerView(s, 'B'), playable: ['basic_defense', 'water_high_tide', 'normal_wall'] };
    const k = { view, own: { team: s.teams.B.team, fatigue: s.teams.B.fatigue } };
    const counts: Record<string, number> = { basic_defense: 0, water_high_tide: 0, normal_wall: 0 };
    let rng = 9;
    for (let i = 0; i < 600; i++) {
      const d = botDecide(k, rng);
      rng = d.rng;
      if (d.action.type === 'CARD') counts[d.action.cardId]++;
    }
    expect(counts.water_high_tide).toBeGreaterThan(counts.normal_wall * 2);
    expect(counts.normal_wall).toBeGreaterThan(0); // continua imprevisível
  });

  it('vai para 2 pontos com mais frequência quando perde por 2', () => {
    const s = start();
    s.phase = 'CONVERSION';
    const rate = (score: Record<TeamKey, number>): number => {
      const k = { view: { ...playerView(s, 'A'), score }, own: { team: s.teams.A.team, fatigue: s.teams.A.fatigue } };
      let rng = 5;
      let two = 0;
      for (let i = 0; i < 400; i++) {
        const d = botDecide(k, rng);
        rng = d.rng;
        if (d.action.type === 'CONVERSION' && d.action.choice === 'TWO') two++;
      }
      return two / 400;
    };
    expect(rate({ A: 12, B: 14 })).toBeGreaterThan(0.5);
    expect(rate({ A: 13, B: 6 })).toBeLessThan(0.25);
  });
});
