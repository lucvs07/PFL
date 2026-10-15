/** Sprites baixados pela Task 2 e servidos de public/sprites/bw — Gen 5 Black/White (ataque = back, defesa = front). */
export function spriteSrc(view: 'front' | 'back', id: number): string {
  return `${import.meta.env.BASE_URL}sprites/bw/${view}/${id}.png`;
}

/** GIF animado de frente (Gen 5 B/W), baixado junto dos PNGs. Só existe para a Pokédex. */
export function animatedSpriteSrc(id: number): string {
  return `${import.meta.env.BASE_URL}sprites/bw/animated/${id}.gif`;
}
