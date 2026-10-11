import type { CardSide } from '@pfl/engine';
import { DECK_SIZE, MAX_COPIES, ROSTER_SIZE, canIncludeInDeck, findCard, hasSpecies } from '@pfl/engine';
import type { TeamDraft } from './draft';
import { applyDepthAction, pruneDepth, type DepthAction } from './depth';

export const MAX_NAME_LENGTH = 24;

export type BuilderAction =
  | { type: 'LOAD'; draft: TeamDraft }
  | { type: 'RENAME'; name: string }
  | { type: 'ADD_SPECIES'; id: number }
  | { type: 'REMOVE_SPECIES'; id: number }
  | { type: 'SET_SPECIALIST'; id: number | null }
  | { type: 'DECK_ADD'; side: CardSide; cardId: string }
  | { type: 'DECK_REMOVE'; side: CardSide; cardId: string }
  | DepthAction;

/** Só cartas de tipo/assinatura do lado certo, liberadas pelo elenco (spec 3.4). */
export function isDeckCard(cardId: string, side: CardSide, roster: readonly number[]): boolean {
  const card = findCard(cardId);
  return (
    !!card &&
    card.side === side &&
    (card.origin === 'TYPE' || card.origin === 'SIGNATURE') &&
    canIncludeInDeck(card, roster)
  );
}

const deckOf = (d: TeamDraft, side: CardSide): string[] => (side === 'OFFENSE' ? d.offenseDeck : d.defenseDeck);
const withDeck = (d: TeamDraft, side: CardSide, deck: string[]): TeamDraft =>
  side === 'OFFENSE' ? { ...d, offenseDeck: deck } : { ...d, defenseDeck: deck };

/** Troca o elenco e remove do depth chart e dos decks o que deixou de ser válido. */
function withRoster(d: TeamDraft, roster: number[]): TeamDraft {
  const pruned = pruneDepth({ depth: d.depth, keepOnField: d.keepOnField }, roster);
  return {
    ...d,
    roster,
    depth: pruned.depth,
    keepOnField: pruned.keepOnField,
    offenseDeck: d.offenseDeck.filter((id) => isDeckCard(id, 'OFFENSE', roster)),
    defenseDeck: d.defenseDeck.filter((id) => isDeckCard(id, 'DEFENSE', roster)),
  };
}

export function builderReducer(d: TeamDraft, a: BuilderAction): TeamDraft {
  switch (a.type) {
    case 'LOAD':
      return a.draft;
    case 'RENAME':
      return { ...d, name: a.name.slice(0, MAX_NAME_LENGTH) };
    case 'ADD_SPECIES':
      if (!hasSpecies(a.id) || d.roster.includes(a.id) || d.specialist === a.id || d.roster.length >= ROSTER_SIZE) return d;
      return { ...d, roster: [...d.roster, a.id] };
    case 'REMOVE_SPECIES':
      if (d.specialist === a.id) return { ...d, specialist: null };
      if (!d.roster.includes(a.id)) return d;
      return withRoster(d, d.roster.filter((id) => id !== a.id));
    case 'SET_SPECIALIST':
      if (a.id === null) return { ...d, specialist: null };
      if (!hasSpecies(a.id)) return d;
      return { ...withRoster(d, d.roster.filter((id) => id !== a.id)), specialist: a.id };
    case 'DECK_ADD': {
      const deck = deckOf(d, a.side);
      const copies = deck.filter((id) => id === a.cardId).length;
      if (deck.length >= DECK_SIZE || copies >= MAX_COPIES || !isDeckCard(a.cardId, a.side, d.roster)) return d;
      return withDeck(d, a.side, [...deck, a.cardId]);
    }
    case 'DECK_REMOVE': {
      const deck = deckOf(d, a.side);
      const index = deck.lastIndexOf(a.cardId);
      if (index < 0) return d;
      return withDeck(d, a.side, [...deck.slice(0, index), ...deck.slice(index + 1)]);
    }
    default: {
      const next = applyDepthAction({ depth: d.depth, keepOnField: d.keepOnField }, d.roster, a);
      return { ...d, depth: next.depth, keepOnField: next.keepOnField };
    }
  }
}
