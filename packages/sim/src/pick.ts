import { rngNext } from '@pfl/engine';

/** Sorteio ponderado determinístico. Pesos ≤ 0 nunca são escolhidos; lança erro se nenhum peso for positivo. */
export function weightedPick<T>(items: readonly T[], weights: readonly number[], rng: number): { item: T; rng: number } {
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (items.length === 0 || total <= 0) throw new Error('weightedPick: nenhuma opção com peso positivo');
  const r = rngNext(rng);
  let target = r.value * total;
  for (let i = 0; i < items.length; i++) {
    const w = Math.max(0, weights[i]);
    if (w <= 0) continue;
    if (target < w) return { item: items[i], rng: r.state };
    target -= w;
  }
  const last = weights.map((w, i) => (w > 0 ? i : -1)).filter((i) => i >= 0).pop() as number;
  return { item: items[last], rng: r.state };
}
