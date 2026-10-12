import { describe, it, expect } from 'vitest';
import { createMatch, step, type Action, type MatchState } from '@pfl/engine';
import type { ReplayData } from '@pfl/protocol';
import { buildReplay } from '../src/match/replayFrames';
import { testTeam } from './fixtures';

const teams = { A: testTeam('Trovões'), B: testTeam('Pedreiras') };

/** Partida inteira só com timeouts (padrões da spec 2.5): determinística e sempre termina. */
function timeoutMatch(seed: number): { state: MatchState; actions: Action[] } {
  let state = createMatch(teams.A, teams.B, seed).state;
  const actions: Action[] = [];
  for (let i = 0; i < 20000 && state.phase !== 'MATCH_END'; i++) {
    const action: Action = { type: 'TIMEOUT' };
    actions.push(action);
    state = step(state, action).state;
  }
  return { state, actions };
}

describe('buildReplay', () => {
  const { state, actions } = timeoutMatch(2026);
  const data: ReplayData = { seed: 2026, teams, actions };

  it('a partida de referência termina', () => {
    expect(state.phase).toBe('MATCH_END');
  });

  it('gera um frame por jogada, com o estado pré-jogada e a animação', () => {
    const build = buildReplay(data, state.score);
    expect(build.ok).toBe(true);
    if (!build.ok) return;
    expect(build.finalScore).toEqual(state.score);
    expect(build.frames.length).toBeGreaterThanOrEqual(12);
    expect(build.frames[0].events[0].t).toBe('DRIVE_START');
    expect(build.frames.at(-1)!.events.at(-1)!.t).toBe('MATCH_END');
    const plays = build.frames.filter((f) => f.events.some((e) => e.t === 'PLAY'));
    expect(plays.length).toBeGreaterThan(0);
    for (const f of plays) {
      expect(Object.keys(f.stage.lineups.offense)).toHaveLength(7);
      expect(Object.keys(f.stage.lineups.defense)).toHaveLength(7);
      expect(f.steps.length).toBeGreaterThan(0);
      expect(f.lines.length).toBeGreaterThan(0);
    }
    expect(build.allEvents.filter((e) => e.t === 'MATCH_END')).toHaveLength(1);
    expect(build.frames.map((f) => f.index)).toEqual(build.frames.map((_, i) => i));
  });

  it('acusa replay que não bate com o placar final', () => {
    const build = buildReplay(data, { A: state.score.A + 1, B: state.score.B });
    expect(build).toMatchObject({ ok: false });
  });

  it('nunca lança com dados corrompidos', () => {
    const badAction = { seed: 1, teams, actions: [{ type: 'CARD', team: 'A', cardId: 'nao_existe' } as Action] };
    expect(buildReplay(badAction)).toEqual({ ok: false, message: 'Não foi possível reproduzir o replay.' });
    const badTeam = { seed: 1, teams: { A: { ...teams.A, roster: [] }, B: teams.B }, actions: [] };
    expect(buildReplay(badTeam).ok).toBe(false);
  });

  it('replay sem ações vira um único frame com o início da partida', () => {
    const build = buildReplay({ seed: 5, teams, actions: [] });
    expect(build.ok && build.frames.length).toBe(1);
  });
});
