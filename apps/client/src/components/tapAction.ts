export type TapAction = 'open' | 'act' | 'close' | 'ignore';

/** O que um toque/clique numa carta faz. `touch` = o aparelho não tem hover; no toque o 1º toque só mostra o tooltip. */
export function tapAction(touch: boolean, open: boolean, disabled: boolean): TapAction {
  if (!touch) return disabled ? 'ignore' : 'act';
  if (!open) return 'open';
  return disabled ? 'close' : 'act';
}
