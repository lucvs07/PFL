import { describe, it, expect } from 'vitest';
import { rngNext, rngShuffle } from '../src/rng';

const sequence = (seed: number, n = 5): number[] => {
  let state = seed;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = rngNext(state);
    out.push(r.value);
    state = r.state;
  }
  return out;
};

describe('rng', () => {
  it('é determinístico para a mesma seed', () => {
    expect(sequence(42)).toEqual(sequence(42));
    expect(sequence(42)).not.toEqual(sequence(43));
  });

  it('gera valores em [0, 1)', () => {
    for (const v of sequence(7, 1000)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('embaralha de forma determinística sem perder itens', () => {
    const a = rngShuffle([1, 2, 3, 4, 5, 6, 7, 8], 99);
    const b = rngShuffle([1, 2, 3, 4, 5, 6, 7, 8], 99);
    expect(a.items).toEqual(b.items);
    expect([...a.items].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(a.state).not.toBe(99);
  });
});
