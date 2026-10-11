import { describe, it, expect } from 'vitest';
import { drawCards, newHand, playFromHand } from '../src/cards/deck';

describe('deck', () => {
  it('compra do topo', () => {
    const { deck } = drawCards({ draw: ['a', 'b', 'c'], hand: [], discard: [] }, 2, 1);
    expect(deck).toEqual({ draw: ['c'], hand: ['a', 'b'], discard: [] });
  });

  it('reembaralha o descarte quando o monte acaba', () => {
    const { deck } = drawCards({ draw: ['a'], hand: [], discard: ['b', 'c', 'd'] }, 3, 7);
    expect(deck.hand).toHaveLength(3);
    expect(deck.hand[0]).toBe('a');
    expect(deck.discard).toEqual([]);
    expect([...deck.hand, ...deck.draw].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('para de comprar se não houver mais cartas', () => {
    const { deck } = drawCards({ draw: ['a'], hand: [], discard: [] }, 5, 1);
    expect(deck.hand).toEqual(['a']);
  });

  it('nova mão descarta a anterior', () => {
    const { deck } = newHand({ draw: ['c', 'd'], hand: ['a', 'b'], discard: [] }, 2, 1);
    expect(deck.hand).toEqual(['c', 'd']);
    expect(deck.discard).toEqual(['a', 'b']);
  });

  it('jogar move uma única cópia para o descarte', () => {
    expect(playFromHand({ draw: [], hand: ['a', 'b', 'a'], discard: [] }, 'a')).toEqual({ draw: [], hand: ['b', 'a'], discard: ['a'] });
  });
});
