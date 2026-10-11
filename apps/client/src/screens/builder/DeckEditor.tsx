import { useMemo } from 'react';
import type { CardSide } from '@pfl/engine';
import { DECK_SIZE, MAX_COPIES, findCard } from '@pfl/engine';
import type { TeamDraft } from '../../builder/draft';
import { copiesIn, deckCardTotal, eligibleCards } from '../../builder/derived';
import { CardTile } from '../../components/CardTile';
import './builder.css';

interface Props {
  draft: TeamDraft;
  onAdd: (side: CardSide, cardId: string) => void;
  onRemove: (side: CardSide, cardId: string) => void;
}

/** Editor de deck: só aparecem as cartas liberadas pelo elenco (spec 3.4 e 6.1). */
export function DeckEditor({ draft, onAdd, onRemove }: Props) {
  return (
    <div className="deck-editor">
      <DeckColumn side="OFFENSE" draft={draft} onAdd={onAdd} onRemove={onRemove} />
      <DeckColumn side="DEFENSE" draft={draft} onAdd={onAdd} onRemove={onRemove} />
    </div>
  );
}

function DeckColumn({ side, draft, onAdd, onRemove }: Props & { side: CardSide }) {
  const deck = side === 'OFFENSE' ? draft.offenseDeck : draft.defenseDeck;
  const eligible = useMemo(() => eligibleCards(draft.roster, side), [draft.roster, side]);
  const locked = deckCardTotal(side) - eligible.length;
  const full = deck.length >= DECK_SIZE;
  const unique = [...new Set(deck)];
  return (
    <section className={`panel deck-column ${side === 'OFFENSE' ? 'is-offense' : 'is-defense'}`}>
      <h2 className="panel-title deck-title">
        <span>{side === 'OFFENSE' ? 'Deck de ataque' : 'Deck de defesa'}</span>
        <span className="deck-count">
          {deck.length}/{DECK_SIZE}
        </span>
      </h2>
      <h3>No deck</h3>
      {unique.length === 0 ? (
        <p className="muted">Vazio. Clique nas cartas abaixo para adicionar.</p>
      ) : (
        <ul className="deck-list">
          {unique.map((id) => (
            <li key={id}>
              <span>{findCard(id)?.name ?? id}</span>
              <span className="deck-copies">×{copiesIn(deck, id)}</span>
              <button type="button" className="btn btn-small" aria-label={`Remover uma cópia de ${findCard(id)?.name ?? id}`} onClick={() => onRemove(side, id)}>
                −
              </button>
            </li>
          ))}
        </ul>
      )}
      <h3>Liberadas pelo elenco ({eligible.length})</h3>
      <p className="muted">{locked} carta(s) ainda bloqueada(s): escale Pokémon dos tipos/espécies exigidos.</p>
      <div className="card-grid">
        {eligible.map((card) => {
          const n = copiesIn(deck, card.id);
          return (
            <CardTile
              key={card.id}
              card={card}
              badge={`${n}/${MAX_COPIES}`}
              selected={n > 0}
              disabled={full || n >= MAX_COPIES}
              onClick={() => onAdd(side, card.id)}
            />
          );
        })}
      </div>
    </section>
  );
}
