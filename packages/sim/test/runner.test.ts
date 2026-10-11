import { describe, it, expect } from 'vitest';
import { SUGGESTED_TEAMS } from '@pfl/engine';
import { playMatch, runSim } from '../src/runner';

describe('playMatch', () => {
  it('joga até o fim e o vencedor tem mais pontos', () => {
    const rec = playMatch(SUGGESTED_TEAMS[0], SUGGESTED_TEAMS[1], 11, 12);
    expect(rec.events.at(-1)?.t).toBe('MATCH_END');
    expect(rec.score[rec.winner]).toBeGreaterThan(rec.score[rec.winner === 'A' ? 'B' : 'A']);
    expect(rec.teams).toEqual({ A: SUGGESTED_TEAMS[0].name, B: SUGGESTED_TEAMS[1].name });
  });

  it('é determinístico', () => {
    expect(playMatch(SUGGESTED_TEAMS[2], SUGGESTED_TEAMS[3], 5, 6)).toEqual(playMatch(SUGGESTED_TEAMS[2], SUGGESTED_TEAMS[3], 5, 6));
  });

  it('lança erro em vez de travar se a partida não terminar no limite de ações', () => {
    expect(() => playMatch(SUGGESTED_TEAMS[0], SUGGESTED_TEAMS[1], 11, 12, 10)).toThrow(/não terminou em 10 ações \(seed 11\)/);
  });
});

describe('runSim', () => {
  it('joga exatamente N partidas, em pares com os lados trocados', () => {
    const recs = runSim({ games: 9, seed: 3 });
    expect(recs).toHaveLength(9);
    for (let i = 0; i + 1 < recs.length; i += 2) {
      expect(recs[i + 1].teams).toEqual({ A: recs[i].teams.B, B: recs[i].teams.A });
      expect(recs[i].teams.A).not.toBe(recs[i].teams.B);
    }
  });

  it('usa times sugeridos e aleatórios', () => {
    const names = runSim({ games: 16, seed: 4 }).flatMap((r) => [r.teams.A, r.teams.B]);
    expect(names.some((n) => SUGGESTED_TEAMS.some((t) => t.name === n))).toBe(true);
    expect(names.some((n) => n.startsWith('Aleatório'))).toBe(true);
  });

  it('rejeita número de partidas inválido', () => {
    expect(() => runSim({ games: 0, seed: 1 })).toThrow(/games inválido/);
    expect(() => runSim({ games: -3, seed: 1 })).toThrow(/games inválido/);
    expect(() => runSim({ games: 2.5, seed: 1 })).toThrow(/games inválido/);
  });
});
