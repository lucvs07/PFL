import { describe, it, expect, vi } from 'vitest';
import { runSim } from '../src/runner';

vi.mock('../src/random-team', () => ({
  randomTeam: () => {
    throw new Error('randomTeam: nenhum elenco válido em 50 tentativas');
  },
}));

describe('runSim: erro na geração de times', () => {
  it('também informa a seed do runSim e o índice do par', () => {
    // par 0 usa times sugeridos; o par 1 gera times aleatórios e falha
    expect(() => runSim({ games: 4, seed: 9, suggestedEvery: 2 })).toThrow(/nenhum elenco válido.*--seed 9, par 1/);
  });
});
