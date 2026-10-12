import { describe, it, expect } from 'vitest';
import { createMatch, step, type GameEvent, type Lineup, type PlayKind, type TeamKey } from '@pfl/engine';
import { computeStats } from '../src/index';
import { electricTeam } from '../../engine/test/fixtures';

const PISTOL_LINEUP: Lineup = { QB: 63, OL1: 95, OL2: 74, OL3: 66, RB: 25, WR1: 26, WR2: 125 };
const BASE_LINEUP: Lineup = { DL1: 95, DL2: 74, DL3: 50, LB1: 66, CB1: 26, CB2: 100, S1: 63 };

const formation = (team: TeamKey, lineup: Lineup = PISTOL_LINEUP): GameEvent =>
  ({ t: 'FORMATION', team, formation: 'PISTOL', lineup });
const pkg = (team: TeamKey): GameEvent => ({ t: 'PACKAGE', team, package: 'BASE', lineup: BASE_LINEUP });
const play = (kind: PlayKind, yards: number, offActors: number[], defActors: number[] = [95, 74, 50, 66]): GameEvent => ({
  t: 'PLAY',
  outcome: { kind, yards, bigPlay: false, read: 'NEUTRAL', offActors, defActors, offTypeMult: 1, defTypeMult: 1, readFactor: 1, statFactor: 1, varianceFactor: 1 },
});
const find = (stats: ReturnType<typeof computeStats>, team: TeamKey, speciesId: number) =>
  stats.pokemon.find((p) => p.team === team && p.speciesId === speciesId);

describe('computeStats', () => {
  it('sem eventos, tudo zerado', () => {
    expect(computeStats([])).toEqual({
      pokemon: [],
      yards: { A: 0, B: 0 },
      turnovers: { A: 0, B: 0 },
      sacks: { A: 0, B: 0 },
    });
  });

  it('corrida: jardas para o RB, jogada para todos os atores dos dois lados', () => {
    const stats = computeStats([formation('A'), pkg('B'), play('GAIN', 8, [25, 95, 74, 66])]);
    expect(find(stats, 'A', 25)).toEqual({ speciesId: 25, team: 'A', plays: 1, yards: 8, touchdowns: 0 });
    expect(find(stats, 'A', 95)).toMatchObject({ plays: 1, yards: 0 });
    expect(find(stats, 'B', 95)).toMatchObject({ plays: 1, yards: 0 });
    expect(stats.yards).toEqual({ A: 8, B: 0 });
  });

  it('passe: jardas para o recebedor, não para o QB', () => {
    const stats = computeStats([formation('A'), pkg('B'), play('GAIN', 12, [63, 26, 95, 74, 66])]);
    expect(find(stats, 'A', 26)).toMatchObject({ yards: 12 });
    expect(find(stats, 'A', 63)).toMatchObject({ yards: 0, plays: 1 });
  });

  it('sem ator de habilidade, o QB recebe o crédito', () => {
    const stats = computeStats([formation('A'), pkg('B'), play('GAIN', 3, [63, 95])]);
    expect(find(stats, 'A', 63)).toMatchObject({ yards: 3 });
  });

  it('sack: jardas negativas para o time, sack para a defesa, nada para os Pokémon', () => {
    const stats = computeStats([formation('A'), pkg('B'), play('SACK', -6, [63, 95, 74, 66])]);
    expect(stats.yards.A).toBe(-6);
    expect(stats.sacks).toEqual({ A: 0, B: 1 });
    expect(stats.pokemon.every((p) => p.yards === 0)).toBe(true);
  });

  it('interceptação e fumble contam turnover para quem perdeu a bola e não somam jardas', () => {
    const stats = computeStats([
      formation('A'), pkg('B'), play('INTERCEPTION', 18, [63, 26, 95, 74, 66]), { t: 'TURNOVER', kind: 'INTERCEPTION' },
      formation('B'), pkg('A'), play('FUMBLE', 3, [25, 95, 74, 66]), { t: 'TURNOVER', kind: 'FUMBLE' },
    ]);
    expect(stats.turnovers).toEqual({ A: 1, B: 1 });
    expect(stats.yards).toEqual({ A: 0, B: 0 });
  });

  it('touchdown vai para o ator de habilidade da jogada', () => {
    const stats = computeStats([
      formation('A'), pkg('B'), play('GAIN', 20, [25, 95, 74, 66]), { t: 'TOUCHDOWN', team: 'A' },
    ]);
    expect(find(stats, 'A', 25)).toMatchObject({ yards: 20, touchdowns: 1 });
  });

  it('a mesma espécie nos dois times fica separada; a ordem é por time e espécie', () => {
    const stats = computeStats([
      formation('A'), pkg('B'), play('GAIN', 5, [25, 95, 74, 66]),
      formation('B'), pkg('A'), play('GAIN', 7, [25, 95, 74, 66]),
    ]);
    expect(find(stats, 'A', 25)).toMatchObject({ yards: 5 });
    expect(find(stats, 'B', 25)).toMatchObject({ yards: 7 });
    const order = stats.pokemon.map((p) => `${p.team}:${p.speciesId}`);
    expect(order).toEqual([...order].sort((x, y) => {
      const [tx, sx] = x.split(':');
      const [ty, sy] = y.split(':');
      return tx === ty ? Number(sx) - Number(sy) : tx < ty ? -1 : 1;
    }));
  });

  it('numa partida real, os TDs creditados batem com os eventos TOUCHDOWN', () => {
    const created = createMatch(electricTeam('A'), electricTeam('B'), 7);
    let state = created.state;
    const all: GameEvent[] = [...created.events];
    for (let i = 0; i < 5000 && state.phase !== 'MATCH_END'; i++) {
      const r = step(state, { type: 'TIMEOUT' });
      state = r.state;
      all.push(...r.events);
    }
    expect(state.phase).toBe('MATCH_END');
    const stats = computeStats(all);
    for (const team of ['A', 'B'] as const) {
      const tds = all.filter((e) => e.t === 'TOUCHDOWN' && e.team === team).length;
      expect(stats.pokemon.filter((p) => p.team === team).reduce((s, p) => s + p.touchdowns, 0)).toBe(tds);
    }
    expect(stats.pokemon.every((p) => p.plays > 0)).toBe(true);
  });
});
