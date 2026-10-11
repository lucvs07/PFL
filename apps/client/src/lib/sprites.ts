/** Sprites baixados pela Task 2 e servidos de public/sprites (ataque = back, defesa = front). */
export function spriteSrc(view: 'front' | 'back', id: number): string {
  return `${import.meta.env.BASE_URL}sprites/${view}/${id}.png`;
}
