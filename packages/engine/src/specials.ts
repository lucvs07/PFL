import { getSpecies } from './species';
import { rngNext } from './rng';

export const PAT_PROBABILITY = 0.97;

/** Spec 2.2: distância depende de Sp. Atk e Attack do especialista. */
export function resolvePunt(specialist: number, rng: number): { distance: number; rng: number } {
  const s = getSpecies(specialist).stats;
  const r = rngNext(rng);
  return { distance: Math.round(30 + (s.spAttack + s.attack) / 20 + (r.value * 10 - 5)), rng: r.state };
}

export function fieldGoalDistance(ballOn: number): number {
  return 100 - ballOn + 17;
}

/** Acima desta distância o FG não tem chance; o piso de 5% vale só dentro do alcance. Calibrável (Plano 2). */
export const MAX_FG_DISTANCE = 70;

export function fieldGoalProbability(distance: number, specialist: number): number {
  if (distance > MAX_FG_DISTANCE) return 0;
  const spAttack = getSpecies(specialist).stats.spAttack;
  return Math.min(0.98, Math.max(0.05, 1.05 - distance * 0.012 + (spAttack - 80) / 400));
}

export function resolveFieldGoal(ballOn: number, specialist: number, rng: number): { distance: number; good: boolean; rng: number } {
  const distance = fieldGoalDistance(ballOn);
  const r = rngNext(rng);
  return { distance, good: r.value < fieldGoalProbability(distance, specialist), rng: r.state };
}

export function resolvePat(specialist: number, rng: number): { good: boolean; rng: number } {
  getSpecies(specialist); // garante que o especialista existe
  const r = rngNext(rng);
  return { good: r.value < PAT_PROBABILITY, rng: r.state };
}
