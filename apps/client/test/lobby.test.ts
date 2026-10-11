import { describe, it, expect } from 'vitest';
import { leadSpecies } from '../src/lib/lobby';
import { testTeam } from './fixtures';

describe('leadSpecies', () => {
  it('usa o QB titular do depth chart', () => {
    expect(leadSpecies(testTeam())).toBe(63);
  });

  it('cai para o primeiro do elenco sem QB no depth', () => {
    const team = testTeam();
    expect(leadSpecies({ ...team, depth: {} })).toBe(25);
    expect(leadSpecies({ ...team, depth: { ...team.depth, QB: [] } })).toBe(25);
  });

  it('devolve null sem time ou com elenco vazio', () => {
    expect(leadSpecies(null)).toBeNull();
    expect(leadSpecies({ ...testTeam(), depth: {}, roster: [] })).toBeNull();
  });
});
