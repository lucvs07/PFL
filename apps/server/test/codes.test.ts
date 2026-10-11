import { describe, expect, it } from 'vitest';
import { generateRoomCode, normalizeRoomCode } from '../src/codes';

const sequence = (values: number[]): (() => number) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('generateRoomCode', () => {
  it('gera 6 letras do alfabeto sem I/O', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateRoomCode(Math.random, () => false)).toMatch(/^[A-HJ-NP-Z]{6}$/);
    }
  });

  it('é determinístico para o mesmo random', () => {
    expect(generateRoomCode(sequence([0]), () => false)).toBe('AAAAAA');
    expect(generateRoomCode(sequence([0.999999]), () => false)).toBe('ZZZZZZ');
  });

  it('tenta de novo quando o código já existe', () => {
    const taken = new Set(['AAAAAA']);
    expect(generateRoomCode(sequence([0, 0, 0, 0, 0, 0, 0.999999, 0.999999, 0.999999, 0.999999, 0.999999, 0.999999]), (c) => taken.has(c))).toBe('ZZZZZZ');
  });

  it('não quebra se random devolver 1', () => {
    expect(generateRoomCode(() => 1, () => false)).toMatch(/^[A-HJ-NP-Z]{6}$/);
  });
});

describe('normalizeRoomCode', () => {
  it('aceita minúsculas e espaços nas pontas', () => {
    expect(normalizeRoomCode('  abcdef ')).toBe('ABCDEF');
  });

  it('rejeita tamanho errado, letras I/O, dígitos e não-strings', () => {
    for (const bad of ['ABCDE', 'ABCDEFG', 'ABCDEI', 'ABCDEO', 'ABC123', '', 123, null, undefined, {}]) {
      expect(normalizeRoomCode(bad)).toBeNull();
    }
  });
});
