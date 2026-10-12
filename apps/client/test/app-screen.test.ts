import { describe, it, expect } from 'vitest';
import type { EndMessage, RoomPlayer, RoomState, RoomStatus } from '@pfl/protocol';
import { namesFromRoom, screenFor } from '../src/app/screen';
import { initialMatchState, matchReducer, type MatchClientState } from '../src/match/matchState';
import { makeView, testTeam } from './fixtures';

const player = (key: 'A' | 'B', teamName: string | null): RoomPlayer => ({ key, connected: true, ready: false, teamName, teamErrors: [] });
const room = (status: RoomStatus, players: RoomPlayer[] = []): RoomState => ({ code: 'ABCDEF', you: 'A', status, players });
const end: EndMessage = {
  score: { A: 3, B: 0 },
  stats: { pokemon: [], yards: { A: 0, B: 0 }, turnovers: { A: 0, B: 0 }, sacks: { A: 0, B: 0 } },
  replay: { seed: 1, teams: { A: testTeam(), B: testTeam() }, actions: [] },
};
const T0 = 5_000;
const withView: MatchClientState = matchReducer(initialMatchState(), {
  type: 'PHASE', msg: { turnId: 1, phase: 'FORMATION', deadline: T0, view: makeView() },
});
const animatingEnd: MatchClientState = matchReducer(
  matchReducer(withView, {
    type: 'RESULT', now: T0,
    msg: { turnId: 1, view: makeView({ turnId: 2 }), events: [{ t: 'FIELD_GOAL', distance: 30, good: true }] },
  }),
  { type: 'END', msg: end },
);

describe('screenFor', () => {
  const base = { local: 'HOME' as const, room: null, match: initialMatchState(), now: T0 };

  it('sem sala, mostra a tela local', () => {
    expect(screenFor(base)).toBe('HOME');
    expect(screenFor({ ...base, local: 'BUILDER' })).toBe('BUILDER');
  });

  it('sala esperando é lobby; em partida ou pausada é partida', () => {
    expect(screenFor({ ...base, room: room('WAITING') })).toBe('LOBBY');
    expect(screenFor({ ...base, room: room('IN_MATCH') })).toBe('MATCH');
    expect(screenFor({ ...base, room: room('PAUSED') })).toBe('MATCH');
  });

  it('a primeira fase pode chegar antes do room:state com IN_MATCH', () => {
    expect(screenFor({ ...base, room: room('WAITING'), match: withView })).toBe('MATCH');
  });

  it('o fim só aparece depois da animação final', () => {
    expect(screenFor({ ...base, room: room('FINISHED'), match: animatingEnd, now: T0 + 1 })).toBe('MATCH');
    expect(screenFor({ ...base, room: room('FINISHED'), match: animatingEnd, now: animatingEnd.animation!.endsAt })).toBe('END');
    expect(screenFor({ ...base, room: null, match: animatingEnd, now: animatingEnd.animation!.endsAt })).toBe('END');
  });
});

describe('namesFromRoom', () => {
  it('usa o nome do time ou um padrão', () => {
    expect(namesFromRoom(room('WAITING', [player('A', 'Trovões')]))).toEqual({ A: 'Trovões', B: 'Time B' });
  });
});
