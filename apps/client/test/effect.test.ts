import { describe, expect, it } from 'vitest';
import { typeMultiplier } from '../src/match/effect';

describe('typeMultiplier', () => {
  it('um alvo: devolve a efetividade exata da escala do motor', () => {
    expect(typeMultiplier('electric', [130])).toBe(4); // Gyarados água/voador
    expect(typeMultiplier('electric', [69])).toBe(0.5); // Bellsprout planta/veneno
    expect(typeMultiplier('electric', [50])).toBe(0); // Diglett terra
    expect(typeMultiplier('electric', [19])).toBe(1); // Rattata
  });

  it('vários alvos: escolhe o degrau da escala mais próximo da média', () => {
    expect(typeMultiplier('electric', [130, 19])).toBe(2); // (4x + 1x) → média = 2x
    expect(typeMultiplier('electric', [69, 50])).toBe(0.25); // (½x + 0x) → média = ¼x
  });

  it('sem elemento ou sem alvos: null', () => {
    expect(typeMultiplier(null, [130])).toBeNull();
    expect(typeMultiplier('electric', [])).toBeNull();
  });
});
