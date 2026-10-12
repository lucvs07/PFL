import { describe, it, expect } from 'vitest';
import type { MatchStats, PokemonMatchStats } from '@pfl/protocol';
import { STAT_MAX, barRatio, gymTheme, mvpOf, statRatio, statTier } from '../src/lib/design';

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

const mk = (speciesId: number, yards: number, touchdowns = 0, plays = 0): PokemonMatchStats => ({
  speciesId,
  team: 'A',
  plays,
  yards,
  touchdowns,
});
const stats = (pokemon: PokemonMatchStats[]): MatchStats => ({
  pokemon,
  yards: { A: 0, B: 0 },
  turnovers: { A: 0, B: 0 },
  sacks: { A: 0, B: 0 },
});

describe('mvpOf', () => {
  it('escolhe o Pokémon com mais jardas', () => {
    expect(mvpOf(stats([mk(1, 10), mk(2, 30), mk(3, 20)]))?.speciesId).toBe(2);
  });
  it('desempata por touchdowns', () => {
    expect(mvpOf(stats([mk(1, 30, 1), mk(2, 30, 2)]))?.speciesId).toBe(2);
  });
  it('desempata por jogadas e depois pela menor espécie', () => {
    expect(mvpOf(stats([mk(1, 30, 1, 3), mk(2, 30, 1, 5)]))?.speciesId).toBe(2);
    expect(mvpOf(stats([mk(9, 30, 1, 3), mk(4, 30, 1, 3)]))?.speciesId).toBe(4);
  });
  it('sem entradas devolve null', () => {
    expect(mvpOf(stats([]))).toBeNull();
  });
});

describe('barRatio', () => {
  it('é relativo ao máximo e limitado a 0..1', () => {
    expect(barRatio(20, 40)).toBe(0.5);
    expect(barRatio(-5, 40)).toBe(0);
    expect(barRatio(10, 0)).toBe(0);
    expect(barRatio(50, 40)).toBe(1);
  });
});
