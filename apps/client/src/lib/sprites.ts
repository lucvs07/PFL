/** Sprites baixados pela Task 2 e servidos de public/sprites/bw — Gen 5 Black/White (ataque = back, defesa = front). */
export function spriteSrc(view: 'front' | 'back', id: number): string {
  return `${import.meta.env.BASE_URL}sprites/bw/${view}/${id}.png`;
}
