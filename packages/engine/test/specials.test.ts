import { describe, it, expect } from 'vitest';
import { resolvePunt, fieldGoalDistance, fieldGoalProbability, resolveFieldGoal, resolvePat, MAX_FG_DISTANCE } from '../src/specials';

describe('chutes', () => {
  it('distância do FG = jardas até a end zone + 17', () => {
    expect(fieldGoalDistance(75)).toBe(42);
  });

  it('probabilidade de FG cai com a distância e sobe com o Sp. Atk do kicker', () => {
    expect(fieldGoalProbability(20, 65)).toBeGreaterThan(fieldGoalProbability(50, 65)); // Alakazam
    expect(fieldGoalProbability(30, 65)).toBeGreaterThan(fieldGoalProbability(30, 129)); // vs Magikarp
    expect(fieldGoalProbability(70, 129)).toBe(0.05);
    expect(fieldGoalProbability(1, 65)).toBe(0.98);
  });

  it('acima do alcance máximo o FG não tem chance, nem com o melhor kicker', () => {
    expect(fieldGoalProbability(MAX_FG_DISTANCE, 65)).toBeGreaterThan(0);
    expect(fieldGoalProbability(MAX_FG_DISTANCE + 1, 65)).toBe(0);
    expect(fieldGoalProbability(116, 150)).toBe(0); // da própria 1, com Mewtwo
  });

  it('punt fica na faixa esperada e é determinístico', () => {
    for (let seed = 1; seed < 200; seed++) {
      const { distance } = resolvePunt(129, seed); // Magikarp: 30 + 1,25 ± 5
      expect(distance).toBeGreaterThanOrEqual(26);
      expect(distance).toBeLessThanOrEqual(37);
    }
    expect(resolvePunt(65, 9)).toEqual(resolvePunt(65, 9));
  });

  it('FG e PAT consomem RNG de forma determinística', () => {
    expect(resolveFieldGoal(70, 65, 5)).toEqual(resolveFieldGoal(70, 65, 5));
    const pat = resolvePat(129, 5);
    expect(pat.rng).not.toBe(5);
  });
});
