import { findCard } from '@pfl/engine';
import type { CardReveal } from '../../match/matchState';
import { READ_LABELS, READ_SYMBOL } from '../../lib/names';
import './match.css';

/** Revelação simultânea das cartas com destaque da leitura ✔/·/✖ (spec 6.2). */
export function RevealBanner({ reveal }: { reveal: CardReveal | null }) {
  if (!reveal) return null;
  const off = findCard(reveal.offense)?.name ?? reveal.offense;
  const def = findCard(reveal.defense)?.name ?? reveal.defense;
  const tone = reveal.read ? reveal.read.toLowerCase() : 'kick';
  return (
    <div className={`reveal reveal-${tone}`} role="status">
      <span className="reveal-card reveal-offense">
        <span className="reveal-side">Ataque</span>
        <span className="reveal-name">{off}</span>
      </span>
      <span className="reveal-vs" aria-hidden="true">
        ×
      </span>
      <span className="reveal-card reveal-defense">
        <span className="reveal-side">Defesa</span>
        <span className="reveal-name">{def}</span>
      </span>
      {reveal.read && (
        <span className="reveal-read">
          <span className="reveal-symbol" aria-hidden="true">
            {READ_SYMBOL[reveal.read]}
          </span>{' '}
          {READ_LABELS[reveal.read]}
        </span>
      )}
    </div>
  );
}
