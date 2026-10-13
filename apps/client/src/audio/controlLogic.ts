// Regras do controle de som que não dependem do DOM, para poderem ser testadas.

const VOLUME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

/** Só as teclas que mudam o controle deslizante soltam o blip de amostra (Tab, por exemplo, não). */
export function isVolumeKey(key: string): boolean {
  return VOLUME_KEYS.has(key);
}

export type PopoverEvent = { type: 'key'; key: string } | { type: 'pointer'; inside: boolean };

/** Esc fecha e devolve o foco ao gatilho; clique fora fecha sem mexer no foco. */
export function popoverCloseAction(open: boolean, e: PopoverEvent): 'close-refocus' | 'close' | null {
  if (!open) return null;
  if (e.type === 'key') return e.key === 'Escape' ? 'close-refocus' : null;
  return e.inside ? null : 'close';
}
