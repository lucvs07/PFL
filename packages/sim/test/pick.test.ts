import { describe, it, expect } from 'vitest';
import { weightedPick } from '../src/pick';

describe('weightedPick', () => {
  it('é determinístico e devolve o novo estado do RNG', () => {
    const a = weightedPick(['x', 'y', 'z'], [1, 2, 3], 42);
    expect(weightedPick(['x', 'y', 'z'], [1, 2, 3], 42)).toEqual(a);
    expect(a.rng).not.toBe(42);
  });

  it('nunca escolhe opção com peso zero e respeita as proporções', () => {
    const counts = { x: 0, y: 0, z: 0 };
    let rng = 1;
    for (let i = 0; i < 3000; i++) {
      const r = weightedPick(['x', 'y', 'z'] as const, [0, 1, 3], rng);
      counts[r.item]++;
      rng = r.rng;
    }
    expect(counts.x).toBe(0);
    expect(counts.z / counts.y).toBeGreaterThan(2.4);
    expect(counts.z / counts.y).toBeLessThan(3.6);
  });

  it('lança erro sem opção válida', () => {
    expect(() => weightedPick([], [], 1)).toThrow(/peso positivo/);
    expect(() => weightedPick(['a'], [0], 1)).toThrow(/peso positivo/);
  });
});
