import type { PokemonType } from '@pfl/engine';
import { TYPE_LABELS } from '../lib/names';
import './ui.css';

/** Pílula de tipo: a cor vem do tipo, o rótulo em português. */
export function TypeBadge({ type }: { type: PokemonType }) {
  return (
    <span className="type-badge" data-type={type} style={{ background: `var(--type-${type})` }}>
      {TYPE_LABELS[type]}
    </span>
  );
}
