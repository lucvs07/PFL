import type { PokemonType } from './model';
import { TYPE_CHART } from './species';

export function effectiveness(attack: PokemonType, defender: readonly PokemonType[]): number {
  return defender.reduce((mult, d) => mult * TYPE_CHART[attack][d], 1);
}

/** [efetividade, modificador] — spec, seção 4.3. Imunidade é o melhor resultado defensivo. */
export const TYPE_SCALE: ReadonlyArray<readonly [number, number]> = [
  [4, 0.6],
  [2, 0.3],
  [1, 0],
  [0.5, -0.3],
  [0.25, -0.45],
  [0, -0.6],
];

export function typeModifier(eff: number): number {
  const hit = TYPE_SCALE.find(([e]) => e === eff);
  if (!hit) throw new Error(`Efetividade inesperada: ${eff}`);
  return hit[1];
}
