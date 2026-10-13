import { useId } from 'react';
import type { Card } from '@pfl/engine';
import { cardInfo } from '../builder/cardInfo';
import { TypeBadge } from './TypeBadge';
import './ui.css';

interface Props {
  card: Card;
  disabled?: boolean;
  selected?: boolean;
  /** texto curto no canto (ex.: "1/2", "básica", "4º down") */
  badge?: string;
  onClick?: () => void;
}

/** Carta clicável com tooltip de requisitos, perfil e leitura. Desabilitada = acinzentada (spec 3.4). */
export function CardTile({ card, disabled = false, selected = false, badge, onClick }: Props) {
  const tipId = useId();
  const info = cardInfo(card);
  return (
    <div className={`card-tile${disabled ? ' is-disabled' : ''}${selected ? ' is-selected' : ''}`}>
      <button
        type="button"
        className="card-face"
        aria-disabled={disabled || undefined}
        onClick={() => {
          if (!disabled) onClick?.();
        }}
        aria-describedby={tipId}
      >
        <span className="card-name">{card.name}</span>
        <span className="card-category">{info.category}</span>
        <span className="card-meta">
          {card.element ? <TypeBadge type={card.element} /> : <span className="muted">sem tipo</span>}
          {badge && <span className="card-badge">{badge}</span>}
        </span>
      </button>
      <div className="card-tooltip" role="tooltip" id={tipId}>
        <h4 className="card-tooltip-title">{info.name}</h4>
        <p>
          {info.category} · {info.origin}
          {info.element ? ` · ${info.element}` : ''}
        </p>
        <p>Requisitos: {info.requirements.length ? info.requirements.join(' + ') : 'nenhum'}</p>
        {info.profile.length > 0 && (
          <ul>
            {info.profile.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        {info.reads.length > 0 && (
          <ul>
            {info.reads.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
