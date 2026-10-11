import { describe, it, expect } from 'vitest';
import { effectiveness, typeModifier, TYPE_SCALE } from '../src/typechart';

describe('efetividade', () => {
  it('multiplica pelos dois tipos do defensor', () => {
    expect(effectiveness('electric', ['water', 'flying'])).toBe(4);
    expect(effectiveness('grass', ['fire', 'flying'])).toBe(0.25);
    expect(effectiveness('ground', ['flying'])).toBe(0);
    expect(effectiveness('normal', ['normal'])).toBe(1);
  });
});

describe('escala de modificadores', () => {
  it('segue os valores da spec', () => {
    expect(typeModifier(4)).toBe(0.6);
    expect(typeModifier(2)).toBe(0.3);
    expect(typeModifier(1)).toBe(0);
    expect(typeModifier(0.5)).toBe(-0.3);
    expect(typeModifier(0.25)).toBe(-0.45);
    expect(typeModifier(0)).toBe(-0.6);
  });

  it('é monotônica: maior efetividade nunca dá modificador menor', () => {
    const sorted = [...TYPE_SCALE].sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i][1]).toBeGreaterThan(sorted[i - 1][1]);
  });

  it('rejeita efetividade fora da escala', () => {
    expect(() => typeModifier(3)).toThrow(/inesperada/);
  });
});
