import { describe, it, expect } from 'vitest';
import { SUGGESTED_TEAMS, createMatch, step } from '@pfl/engine';
import { actingTeams, botAction } from '../src/bot';
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

describe('playMatch: limite de ações', () => {
  it('uma partida que termina em exatamente maxSteps ações não é erro (sem off-by-one)', () => {
    const [a, b] = [SUGGESTED_TEAMS[0], SUGGESTED_TEAMS[1]];
    let state = createMatch(a, b, 11).state;
    let rng = 12;
    let actions = 0;
    while (state.phase !== 'MATCH_END') {
      const d = botAction(state, actingTeams(state)[0], rng);
      rng = d.rng;
      state = step(state, d.action).state;
      actions++;
    }
    expect(() => playMatch(a, b, 11, 12, actions)).not.toThrow();
    expect(() => playMatch(a, b, 11, 12, actions - 1)).toThrow(/não terminou/);
  });

  it('a mensagem de erro traz botSeed e os dois times para reproduzir a partida', () => {
    expect(() => playMatch(SUGGESTED_TEAMS[0], SUGGESTED_TEAMS[1], 11, 12, 10)).toThrow(
      /\(seed 11\).*botSeed 12.*Relâmpagos de Vermilion.*Chamas de Cinnabar/,
    );
  });
});

describe('runSim: contexto e validação', () => {
  it('erro de partida informa a seed do runSim e o índice do par', () => {
    expect(() => runSim({ games: 2, seed: 5, maxSteps: 5 })).toThrow(/--seed 5.*par 0/);
  });

  it.each([-1, 1.5, 2 ** 32, Number.NaN])('rejeita seed inválida %s', (seed) => {
    expect(() => runSim({ games: 2, seed })).toThrow(/seed inválida/);
  });

  it.each([0, -1, 1.5, Number.NaN])('rejeita suggestedEvery inválido %s', (suggestedEvery) => {
    expect(() => runSim({ games: 2, seed: 1, suggestedEvery })).toThrow(/suggestedEvery inválido/);
  });
});
