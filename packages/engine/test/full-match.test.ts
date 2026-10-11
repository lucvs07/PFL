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
