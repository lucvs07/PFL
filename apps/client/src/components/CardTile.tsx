import { useEffect, useId, useRef, useState } from 'react';
import type { Card } from '@pfl/engine';
import { cardInfo } from '../builder/cardInfo';
import { TypeBadge } from './TypeBadge';
import { tapAction } from './tapAction';
import './ui.css';

interface Props {
  card: Card;
  disabled?: boolean;
  selected?: boolean;
  /** texto curto no canto (ex.: "1/2", "básica", "4º down") */
  badge?: string;
  onClick?: () => void;
}

const isTouch = (): boolean => typeof window !== 'undefined' && !!window.matchMedia?.('(hover: none)').matches;

/** Carta clicável com tooltip de requisitos, perfil e leitura. Desabilitada = acinzentada (spec 3.4). */
export function CardTile({ card, disabled = false, selected = false, badge, onClick }: Props) {
  const tipId = useId();
  const info = cardInfo(card);
  const tileRef = useRef<HTMLDivElement>(null);
  const [tipOpen, setTipOpen] = useState(false);

  // Toque fora do tile fecha o tooltip (abrir outra carta cai aqui, então só um fica aberto).
  useEffect(() => {
    if (!tipOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!tileRef.current?.contains(e.target as Node)) setTipOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [tipOpen]);

  const handleClick = () => {
    switch (tapAction(isTouch(), tipOpen, disabled)) {
      case 'open':
        setTipOpen(true);
        break;
      case 'close':
        setTipOpen(false);
        break;
      case 'act':
        setTipOpen(false);
        onClick?.();
        break;
      case 'ignore':
        break;
    }
  };

  return (
    <div
      ref={tileRef}
      className={`card-tile${disabled ? ' is-disabled' : ''}${selected ? ' is-selected' : ''}${tipOpen ? ' is-tip-open' : ''}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setTipOpen(false);
      }}
    >
      <button type="button" className="card-face" aria-disabled={disabled || undefined} onClick={handleClick} aria-describedby={tipId}>
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
