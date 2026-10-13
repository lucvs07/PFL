import type { PokemonType } from '@pfl/engine';
import { effectiveness, getSpecies, typeModifier } from '@pfl/engine';

export type TypeEffect = 'SUPER' | 'WEAK' | 'IMMUNE' | 'NEUTRAL';

/**
 * Efetividade do tipo da carta contra os atores adversários: média dos modificadores da escala do engine.
 * Não usa offTypeMult/defTypeMult, porque eles somam a afinidade dos próprios atores (+10%).
 */
export function typeEffect(element: PokemonType | null, targets: readonly number[]): TypeEffect | null {
  if (!element || targets.length === 0) return null;
  const effs = targets.map((id) => effectiveness(element, getSpecies(id).types));
  if (effs.every((e) => e === 0)) return 'IMMUNE';
  const mean = effs.reduce((sum, e) => sum + typeModifier(e), 0) / effs.length;
  if (mean > 0) return 'SUPER';
  if (mean < 0) return 'WEAK';
  return 'NEUTRAL';
}

export type Mult = 4 | 2 | 1 | 0.5 | 0.25 | 0;
const MULTS: readonly Mult[] = [4, 2, 1, 0.5, 0.25, 0];

/**
 * Multiplicador de tipo da carta contra os atores adversários, no degrau da escala do motor mais próximo
 * da média dos modificadores. Com um alvo é exato; com vários, a média cai no degrau mais perto.
 */
export function typeMultiplier(element: PokemonType | null, targets: readonly number[]): Mult | null {
  if (!element || targets.length === 0) return null;
  const mods = targets.map((id) => typeModifier(effectiveness(element, getSpecies(id).types)));
  const mean = mods.reduce((sum, m) => sum + m, 0) / mods.length;
  const nearest = MULTS.reduce((best, m) => (Math.abs(typeModifier(m) - mean) < Math.abs(typeModifier(best) - mean) ? m : best));
  // 0x é imunidade: só quando todos os alvos são imunes, como em `typeEffect` (IMMUNE).
  if (nearest === 0 && targets.some((id) => effectiveness(element, getSpecies(id).types) !== 0)) return 0.25;
  return nearest;
}

export const EFFECT_TEXT: Record<TypeEffect, string | null> = {
  SUPER: 'É super efetivo!',
  WEAK: 'Não é muito efetivo...',
  IMMUNE: 'Não teve efeito...',
  NEUTRAL: null,
};
