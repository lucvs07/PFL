import type { DeckState } from '../model';
import { rngShuffle } from '../rng';

export function drawCards(deck: DeckState, n: number, rng: number): { deck: DeckState; rng: number } {
  let draw = [...deck.draw];
  let discard = [...deck.discard];
  const hand = [...deck.hand];
  let state = rng;
  for (let i = 0; i < n; i++) {
    if (draw.length === 0) {
      if (discard.length === 0) break;
      const shuffled = rngShuffle(discard, state);
      draw = shuffled.items;
      state = shuffled.state;
      discard = [];
    }
    hand.push(draw.shift() as string);
  }
  return { deck: { draw, hand, discard }, rng: state };
}

/** Início de drive (spec 2.3): a mão anterior vai para o descarte e compra-se uma nova. */
export function newHand(deck: DeckState, n: number, rng: number): { deck: DeckState; rng: number } {
  return drawCards({ draw: deck.draw, hand: [], discard: [...deck.discard, ...deck.hand] }, n, rng);
}

export function playFromHand(deck: DeckState, cardId: string): DeckState {
  const index = deck.hand.indexOf(cardId);
  if (index < 0) return deck;
  return {
    draw: deck.draw,
    hand: [...deck.hand.slice(0, index), ...deck.hand.slice(index + 1)],
    discard: [...deck.discard, cardId],
  };
}
