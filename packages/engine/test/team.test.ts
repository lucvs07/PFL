import { describe, it, expect } from 'vitest';
import { speciesCost, teamCost, aptitude, validateTeam, SALARY_CAP } from '../src/team';
import { electricTeam } from './fixtures';

const codes = (team: unknown) => validateTeam(team).map((e) => e.code);

describe('custo', () => {
  it('segue os exemplos da spec', () => {
    expect(speciesCost(129)).toBe(1); // Magikarp
    expect(speciesCost(25)).toBe(5); // Pikachu
    expect(speciesCost(143)).toBe(12); // Snorlax
    expect(speciesCost(149)).toBe(14); // Dragonite
    expect(speciesCost(150)).toBe(17); // Mewtwo
  });

  it('soma o elenco e o especialista', () => {
    const team = electricTeam();
    const manual = [...team.roster, team.specialist].reduce((s, id) => s + speciesCost(id), 0);
    expect(teamCost(team)).toBe(manual);
    expect(teamCost(team)).toBeLessThanOrEqual(SALARY_CAP);
  });
});

describe('aptidão', () => {
  it('fica entre 1 e 5 e reflete os stats', () => {
    expect(aptitude(143, 'OL')).toBeGreaterThan(aptitude(143, 'WR')); // Snorlax
    expect(aptitude(135, 'WR')).toBe(5); // Jolteon
    expect(aptitude(143, 'WR')).toBe(1);
  });
});

describe('validateTeam', () => {
  it('aceita a fixture', () => {
    expect(validateTeam(electricTeam())).toEqual([]);
  });

  it('rejeita time malformado sem lançar exceção', () => {
    expect(codes({})).toEqual(['MALFORMED_TEAM']);
    expect(codes(null)).toEqual(['MALFORMED_TEAM']);
    expect(codes({ ...electricTeam(), roster: ['25'] })).toEqual(['MALFORMED_TEAM']);
  });

  it('rejeita espécie inexistente', () => {
    expect(codes({ ...electricTeam(), specialist: 999 })).toEqual(['UNKNOWN_SPECIES']);
  });

  it('rejeita tamanho de elenco errado e espécie repetida', () => {
    const t = electricTeam();
    expect(codes({ ...t, roster: t.roster.slice(1) })).toContain('ROSTER_SIZE');
    expect(codes({ ...t, roster: [26, ...t.roster.slice(1)] })).toContain('DUPLICATE_SPECIES'); // Raichu duas vezes
  });

  it('rejeita mais de um lendário', () => {
    const t = electricTeam();
    expect(codes({ ...t, roster: [144, 145, ...t.roster.slice(2)] })).toContain('TOO_MANY_LEGENDARIES');
  });

  it('rejeita time acima do teto', () => {
    const expensive = [3, 6, 9, 149, 143, 130, 131, 59, 65, 68, 76, 94, 112, 134, 135, 136];
    expect(codes({ ...electricTeam(), roster: expensive })).toContain('OVER_CAP');
  });

  it('valida os decks', () => {
    const t = electricTeam();
    expect(codes({ ...t, offenseDeck: t.offenseDeck.slice(1) })).toContain('DECK_SIZE_OFFENSE');
    expect(codes({ ...t, offenseDeck: [...t.offenseDeck.slice(0, 9), 'normal_tackle', 'normal_tackle', 'normal_tackle'] })).toContain('DECK_COPIES');
    expect(codes({ ...t, offenseDeck: [...t.offenseDeck.slice(1), 'fire_deep'] })).toContain('CARD_NOT_ELIGIBLE');
    expect(codes({ ...t, offenseDeck: [...t.offenseDeck.slice(1), 'basic_run'] })).toContain('CARD_NOT_ALLOWED');
    expect(codes({ ...t, offenseDeck: [...t.offenseDeck.slice(1), 'normal_wall'] })).toContain('CARD_NOT_ALLOWED');
    expect(codes({ ...t, defenseDeck: [...t.defenseDeck.slice(1), 'xyz'] })).toContain('UNKNOWN_CARD');
  });

  it('valida o depth chart', () => {
    const t = electricTeam();
    expect(codes({ ...t, depth: { ...t.depth, QB: [150] } })).toContain('DEPTH_NOT_IN_ROSTER');
    expect(codes({ ...t, depth: { ...t.depth, TE: [] } })).toContain('FORMATION_UNFILLABLE');
    expect(codes({ ...t, depth: { ...t.depth, S2: [] } })).toContain('PACKAGE_UNFILLABLE');
    expect(codes({ ...t, keepOnField: [150] })).toContain('KEEP_NOT_IN_ROSTER');
  });

  it('aceita depth chart que só fecha trocando quem a ordem gulosa escolheria', () => {
    const t = electricTeam();
    // WR1 pega o 125 primeiro, mas o 125 é o único WR2: ainda há escalação válida (WR1 = 26).
    expect(codes({ ...t, depth: { ...t.depth, WR1: [125, 26], WR2: [125] } })).toEqual([]);
  });
});
