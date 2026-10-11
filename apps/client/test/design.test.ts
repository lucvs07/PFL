import { describe, it, expect } from 'vitest';
import { STAT_MAX, gymTheme, statRatio, statTier } from '../src/lib/design';

describe('statTier', () => {
  it('respeita os limites 49/50/79/80/99/100', () => {
    expect(statTier(49)).toBe('low');
    expect(statTier(50)).toBe('mid');
    expect(statTier(79)).toBe('mid');
    expect(statTier(80)).toBe('good');
    expect(statTier(99)).toBe('good');
    expect(statTier(100)).toBe('high');
    expect(statTier(255)).toBe('high');
  });
});

describe('statRatio', () => {
  it('fica entre 0 e 1', () => {
    expect(STAT_MAX).toBe(255);
    expect(statRatio(0)).toBe(0);
    expect(statRatio(-5)).toBe(0);
    expect(statRatio(255)).toBe(1);
    expect(statRatio(999)).toBe(1);
    expect(statRatio(127.5)).toBeCloseTo(0.5);
  });
});

describe('gymTheme', () => {
  it('reconhece cidades de ginásio sem diferenciar maiúsculas', () => {
    expect(gymTheme('Pewter')).toEqual({ city: 'Pewter', type: 'rock' });
    expect(gymTheme('Os de cerulean')).toEqual({ city: 'Cerulean', type: 'water' });
    expect(gymTheme('VERMILION Sparks')?.type).toBe('electric');
    expect(gymTheme('Celadon')?.type).toBe('grass');
    expect(gymTheme('Saffron')?.type).toBe('psychic');
    expect(gymTheme('Cinnabar')?.type).toBe('fire');
    expect(gymTheme('Fuchsia')?.type).toBe('poison');
    expect(gymTheme('Viridian')?.type).toBe('ground');
  });
  it('devolve null quando não há cidade', () => {
    expect(gymTheme('Meu time')).toBeNull();
  });
});
