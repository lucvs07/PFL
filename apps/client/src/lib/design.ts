import type { PokemonType } from '@pfl/engine';

export type StatTier = 'low' | 'mid' | 'good' | 'high';

/** Faixa de cor de um stat (rampa vermelho, laranja, amarelo, verde). */
export function statTier(value: number): StatTier {
  if (value < 50) return 'low';
  if (value < 80) return 'mid';
  if (value < 100) return 'good';
  return 'high';
}

export const STAT_MAX = 255;

/** Largura relativa da barra de stat, limitada a 0..1. */
export function statRatio(value: number): number {
  return Math.max(0, Math.min(1, value / STAT_MAX));
}

export interface GymTheme {
  city: string;
  type: PokemonType;
}

const GYMS: readonly GymTheme[] = [
  { city: 'Pewter', type: 'rock' },
  { city: 'Cerulean', type: 'water' },
  { city: 'Vermilion', type: 'electric' },
  { city: 'Celadon', type: 'grass' },
  { city: 'Saffron', type: 'psychic' },
  { city: 'Cinnabar', type: 'fire' },
  { city: 'Fuchsia', type: 'poison' },
  { city: 'Viridian', type: 'ground' },
];

/** Tema visual (só cor) quando o nome do time contém uma cidade de ginásio de Kanto. */
export function gymTheme(teamName: string): GymTheme | null {
  const lower = teamName.toLowerCase();
  return GYMS.find((g) => lower.includes(g.city.toLowerCase())) ?? null;
}
