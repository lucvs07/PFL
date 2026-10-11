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

export const EFFECT_TEXT: Record<TypeEffect, string | null> = {
  SUPER: 'É super efetivo!',
  WEAK: 'Não é muito efetivo...',
  IMMUNE: 'Não teve efeito...',
  NEUTRAL: null,
};
