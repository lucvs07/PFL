import { describe, expect, it } from 'vitest';
import { parsePlay, toAction } from '../src/parse';

describe('parsePlay', () => {
  it('aceita payloads válidos', () => {
    expect(parsePlay('play:formation', { turnId: 3, formation: 'SPREAD' })).toEqual({ kind: 'formation', turnId: 3, formation: 'SPREAD' });
    expect(parsePlay('play:package', { turnId: 3, package: 'DIME' })).toEqual({ kind: 'package', turnId: 3, package: 'DIME' });
    expect(parsePlay('play:card', { turnId: 3, cardId: 'basic_run' })).toEqual({ kind: 'card', turnId: 3, cardId: 'basic_run' });
    expect(parsePlay('play:conversion', { turnId: 3, choice: 'TWO' })).toEqual({ kind: 'conversion', turnId: 3, choice: 'TWO' });
    expect(parsePlay('team:depth', { turnId: 3, depth: { QB: [1] }, keepOnField: [] })).toEqual({
      kind: 'depth', turnId: 3, depth: { QB: [1] }, keepOnField: [],
    });
  });

  it('rejeita payloads malformados ou maliciosos', () => {
    const cases: [Parameters<typeof parsePlay>[0], unknown][] = [
      ['play:formation', null],
      ['play:formation', 'PISTOL'],
      ['play:formation', [1, 'PISTOL']],
      ['play:formation', { formation: 'PISTOL' }],
      ['play:formation', { turnId: '3', formation: 'PISTOL' }],
      ['play:formation', { turnId: 1.5, formation: 'PISTOL' }],
      ['play:formation', { turnId: 3, formation: 'constructor' }],
      ['play:formation', { turnId: 3, formation: '__proto__' }],
      ['play:formation', { turnId: 3, formation: 'pistol' }],
      ['play:package', { turnId: 3, package: 'toString' }],
      ['play:card', { turnId: 3, cardId: 42 }],
      ['play:card', { turnId: 3, cardId: 'x'.repeat(65) }],
      ['play:conversion', { turnId: 3, choice: 'THREE' }],
      ['team:depth', { turnId: 3, depth: [], keepOnField: [] }],
      ['team:depth', { turnId: 3, depth: { QB: [1] } }],
      ['team:depth', { turnId: 3, depth: null, keepOnField: [] }],
    ];
    for (const [event, payload] of cases) expect(parsePlay(event, payload)).toBeNull();
  });

  it('limita o tamanho e as chaves do payload de team:depth', () => {
    const big = Array.from({ length: 17 }, (_, i) => i);
    const cases: unknown[] = [
      { turnId: 3, depth: { QB: [1], junk: [] }, keepOnField: [] },
      { turnId: 3, depth: { QB: big }, keepOnField: [] },
      { turnId: 3, depth: { QB: ['63'] }, keepOnField: [] },
      { turnId: 3, depth: { QB: [1] }, keepOnField: big },
      { turnId: 3, depth: { QB: [1] }, keepOnField: ['25'] },
      { turnId: 3, depth: { QB: [1.5] }, keepOnField: [] },
      { turnId: 3, depth: { QB: 1 }, keepOnField: [] },
    ];
    for (const payload of cases) expect(parsePlay('team:depth', payload)).toBeNull();
    const full = Array.from({ length: 16 }, (_, i) => i);
    expect(parsePlay('team:depth', { turnId: 3, depth: { QB: full }, keepOnField: full })).not.toBeNull();
  });
});

describe('toAction', () => {
  it('o time vem sempre da vaga do socket, nunca do payload', () => {
    expect(toAction('B', { kind: 'formation', turnId: 1, formation: 'PISTOL' })).toEqual({ type: 'FORMATION', team: 'B', formation: 'PISTOL' });
    expect(toAction('A', { kind: 'package', turnId: 1, package: 'BASE' })).toEqual({ type: 'PACKAGE', team: 'A', package: 'BASE' });
    expect(toAction('A', { kind: 'card', turnId: 1, cardId: 'punt' })).toEqual({ type: 'CARD', team: 'A', cardId: 'punt' });
    expect(toAction('A', { kind: 'conversion', turnId: 1, choice: 'PAT' })).toEqual({ type: 'CONVERSION', team: 'A', choice: 'PAT' });
    expect(toAction('B', { kind: 'depth', turnId: 1, depth: { QB: [1] }, keepOnField: [2] })).toEqual({
      type: 'SET_DEPTH', team: 'B', depth: { QB: [1] }, keepOnField: [2],
    });
  });
});
