import type { PlayerView } from '@pfl/engine';
import { findCard } from '@pfl/engine';
import { handEntries } from '../../match/matchState';
import { CardTile } from '../../components/CardTile';
import './match.css';

interface Props {
  view: PlayerView;
  canPick: (cardId: string) => boolean;
  onPick: (cardId: string) => void;
}

/** Mão de 5 + básicas (+ Punt/FG no 4º down). Não jogáveis ficam acinzentadas (view.playable). */
export function CardHand({ view, canPick, onPick }: Props) {
  return (
    <div className="hand">
      {handEntries(view).map((entry) => {
        const card = findCard(entry.cardId);
        if (!card) return null;
        const badge = entry.source === 'BASIC' ? 'básica' : entry.source === 'SPECIAL' ? '4º down' : undefined;
        return (
          <CardTile key={entry.key} card={card} badge={badge} disabled={!canPick(entry.cardId)} onClick={() => onPick(entry.cardId)} />
        );
      })}
    </div>
  );
}
