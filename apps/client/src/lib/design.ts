import type { PokemonType } from '@pfl/engine';
import type { MatchStats, PokemonMatchStats } from '@pfl/protocol';

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

/** MVP: mais jardas; empate por touchdowns, depois jogadas, depois menor espécie. */
export function mvpOf(stats: MatchStats): PokemonMatchStats | null {
  let best: PokemonMatchStats | null = null;
  for (const p of stats.pokemon) {
    if (
      !best ||
      p.yards > best.yards ||
      (p.yards === best.yards &&
        (p.touchdowns > best.touchdowns ||
          (p.touchdowns === best.touchdowns &&
            (p.plays > best.plays || (p.plays === best.plays && p.speciesId < best.speciesId)))))
    ) {
      best = p;
    }
  }
  return best;
}

/** Largura relativa (0..1) de uma barra de jardas frente ao máximo do time. */
export function barRatio(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(1, value / max));
}
