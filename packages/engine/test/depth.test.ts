import { describe, it, expect } from 'vitest';
import { createMatch, step, playerView, type MatchState } from '../src/match';
import { replay } from '../src/replay';
import { EngineError } from '../src/errors';
import type { Action, FormationId, GameEvent, PackageId, Team, TeamKey } from '../src/model';
import { electricTeam } from './fixtures';

const A = electricTeam('A');
const B = electricTeam('B');
const start = (): MatchState => createMatch(A, B, 1).state;

function run(s: MatchState, ...actions: Action[]): { state: MatchState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let state = s;
  for (const a of actions) {
    const r = step(state, a);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

const setDepth = (team: TeamKey, depth: Team['depth'], keepOnField: number[] = []): Action => ({
  type: 'SET_DEPTH',
  team,
  depth,
  keepOnField,
});
/** Psyduck (54) passa a titular de QB no lugar de Abra (63). */
const qbSwap = (): Team['depth'] => ({ ...A.depth, QB: [54, 63] });

const snapActions = (offense: TeamKey): Action[] => {
  const defense: TeamKey = offense === 'A' ? 'B' : 'A';
  return [
    { type: 'FORMATION', team: offense, formation: 'PISTOL' },
    { type: 'PACKAGE', team: defense, package: 'BASE' },
    { type: 'CARD', team: offense, cardId: 'basic_run' },
    { type: 'CARD', team: defense, cardId: 'basic_defense' },
  ];
};

describe('snapInDrive', () => {
  it('vale 1 no primeiro snap da partida', () => {
    expect(start().snapInDrive).toBe(1);
  });

  it('incrementa a cada snap e volta a 1 num drive novo', () => {
    const { state } = run(start(), ...snapActions('A'));
    // seed fixa: se o snap terminou o drive (fumble), o novo drive recomeça em 1
    expect(state.snapInDrive).toBe(state.offense === 'A' ? 2 : 1);
  });

  it('um punt abre o drive do adversário com snapInDrive = 1', () => {
    const s = start();
    s.field = { down: 4, yardsToGo: 8, ballOn: 40 };
    s.snapInDrive = 4;
    const { state } = run(
      s,
      { type: 'FORMATION', team: 'A', formation: 'PISTOL' },
      { type: 'PACKAGE', team: 'B', package: 'BASE' },
      { type: 'CARD', team: 'A', cardId: 'punt' },
      { type: 'CARD', team: 'B', cardId: 'basic_defense' },
    );
    expect(state.offense).toBe('B');
    expect(state.snapInDrive).toBe(1);
  });
});

describe('SET_DEPTH', () => {
  it('o ataque troca o titular no primeiro snap; não muda fase, turno nem gera eventos', () => {
    const s = start();
    const r = step(s, setDepth('A', qbSwap()));
    expect(r.events).toEqual([]);
    expect(r.state.phase).toBe('FORMATION');
    expect(r.state.turnId).toBe(s.turnId);
    expect(r.state.teams.A.team.depth.QB).toEqual([54, 63]);
    const { events } = run(r.state, { type: 'FORMATION', team: 'A', formation: 'PISTOL' });
    expect(events[0]).toMatchObject({ t: 'FORMATION', lineup: { QB: 54 } });
  });

  it('a defesa do drive também pode editar, e o pacote usa a nova ordem', () => {
    const depth = { ...B.depth, DL1: [19, 95, 74] };
    const r = step(start(), setDepth('B', depth));
    const { events } = run(
      r.state,
      { type: 'FORMATION', team: 'A', formation: 'PISTOL' },
      { type: 'PACKAGE', team: 'B', package: 'BASE' },
    );
    expect(events.find((e) => e.t === 'PACKAGE')).toMatchObject({ lineup: { DL1: 19 } });
  });

  it('atualiza o "manter em campo" e aceita reenvio na mesma janela', () => {
    const first = step(start(), setDepth('A', qbSwap(), [25])).state;
    const second = step(first, setDepth('A', A.depth, [25, 26])).state;
    expect(second.teams.A.team.keepOnField).toEqual([25, 26]);
    expect(second.teams.A.team.depth.QB).toEqual([63, 54]);
  });

  it('o elenco, o especialista e os decks não mudam', () => {
    const r = step(start(), setDepth('A', qbSwap()));
    expect(r.state.teams.A.team.roster).toEqual(A.roster);
    expect(r.state.teams.A.team.specialist).toBe(A.specialist);
    expect(r.state.teams.A.team.offenseDeck).toEqual(A.offenseDeck);
  });

  it('DEPTH_LOCKED depois da formação, inclusive para a defesa', () => {
    const { state } = run(start(), { type: 'FORMATION', team: 'A', formation: 'PISTOL' });
    expect(() => step(state, setDepth('A', qbSwap()))).toThrow(/DEPTH_LOCKED/);
    expect(() => step(state, setDepth('B', B.depth))).toThrow(/DEPTH_LOCKED/);
  });

  it('DEPTH_LOCKED a partir do segundo snap do drive', () => {
    const s = start();
    s.snapInDrive = 2;
    expect(() => step(s, setDepth('A', qbSwap()))).toThrow(/DEPTH_LOCKED/);
  });

  it('INVALID_DEPTH quando o time revalidado é inválido', () => {
    const s = start();
    expect(() => step(s, setDepth('A', { ...A.depth, QB: [150] }))).toThrow(/INVALID_DEPTH/); // fora do elenco
    expect(() => step(s, setDepth('A', { ...A.depth, TE: [] }))).toThrow(/INVALID_DEPTH/); // HEAVY sem TE
    expect(() => step(s, setDepth('A', A.depth, [999]))).toThrow(/INVALID_DEPTH/); // keepOnField fora do elenco
    const malformed = { ...A.depth, QB: ['63'] } as unknown as Team['depth'];
    expect(() => step(s, setDepth('A', malformed))).toThrow(/INVALID_DEPTH/);
    expect(() => step(s, setDepth('A', A.depth, 'x' as unknown as number[]))).toThrow(/INVALID_DEPTH/);
  });

  it('erros são EngineError e não alteram o estado de entrada', () => {
    const s = start();
    const before = structuredClone(s);
    expect(() => step(s, setDepth('A', { ...A.depth, QB: [150] }))).toThrow(EngineError);
    step(s, setDepth('A', qbSwap()));
    expect(s).toEqual(before);
  });

  it('é reproduzido pelo replay', () => {
    const actions: Action[] = [setDepth('A', qbSwap(), [25]), ...snapActions('A')];
    const direct = run(start(), ...actions);
    expect(replay(A, B, 1, actions).state).toEqual(direct.state);
  });

  it('o time editado fica congelado no estado e isolado da ação original', () => {
    const depth = qbSwap();
    const { state } = run(start(), setDepth('A', depth));
    expect(Object.isFrozen(state.teams.A.team)).toBe(true);
    expect(Object.isFrozen(state.teams.A.team.depth)).toBe(true);
    expect(Object.isFrozen(state.teams.A.team.depth.QB)).toBe(true);
    depth.QB!.push(99);
    expect(state.teams.A.team.depth.QB).toEqual([54, 63]);
  });

  it('time desconhecido: WRONG_TEAM', () => {
    expect(() =>
      step(start(), { type: 'SET_DEPTH', team: 'C' as TeamKey, depth: A.depth, keepOnField: [] }),
    ).toThrow(/WRONG_TEAM/);
  });
});

describe('playerView.canEditDepth', () => {
  it('true para os dois times na FORMATION do primeiro snap', () => {
    const s = start();
    expect(playerView(s, 'A').canEditDepth).toBe(true);
    expect(playerView(s, 'B').canEditDepth).toBe(true);
  });

  it('false depois da formação e a partir do segundo snap', () => {
    const { state } = run(start(), { type: 'FORMATION', team: 'A', formation: 'PISTOL' });
    expect(playerView(state, 'A').canEditDepth).toBe(false);
    expect(playerView(state, 'B').canEditDepth).toBe(false);
    const s = start();
    s.snapInDrive = 2;
    expect(playerView(s, 'A').canEditDepth).toBe(false);
  });
});

describe('formação e pacote desconhecidos (cliente malicioso)', () => {
  it('nomes herdados de Object viram UNKNOWN_FORMATION / UNKNOWN_PACKAGE, não TypeError', () => {
    const s = start();
    for (const bad of ['constructor', '__proto__', 'toString']) {
      expect(() => step(s, { type: 'FORMATION', team: 'A', formation: bad as FormationId })).toThrow(EngineError);
      expect(() => step(s, { type: 'FORMATION', team: 'A', formation: bad as FormationId })).toThrow(/UNKNOWN_FORMATION/);
    }
    const { state } = run(s, { type: 'FORMATION', team: 'A', formation: 'PISTOL' });
    expect(() => step(state, { type: 'PACKAGE', team: 'B', package: 'toString' as PackageId })).toThrow(/UNKNOWN_PACKAGE/);
  });
});
