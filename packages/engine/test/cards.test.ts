import { describe, it, expect } from 'vitest';
import { READ_MATRIX, readResult } from '../src/cards/categories';
import { CARDS, getCard, findCard } from '../src/cards/catalog';
import { canIncludeInDeck, canPlay } from '../src/cards/eligibility';
import { POKEMON_TYPES, type OffenseCategory, type DefenseCategory } from '../src/model';

const OFF: OffenseCategory[] = ['RUN_INSIDE', 'RUN_OUTSIDE', 'SHORT_PASS', 'DEEP_PASS', 'SCREEN', 'PLAY_ACTION'];
const DEF = Object.keys(READ_MATRIX) as Exclude<DefenseCategory, 'BASE_D'>[];
const score = (r: string) => (r === 'RIGHT' ? 1 : r === 'WRONG' ? -1 : 0);

describe('matriz de leitura', () => {
  it('cada linha (defesa) tem saldo zero', () => {
    for (const d of DEF) expect(OFF.reduce((sum, o) => sum + score(READ_MATRIX[d][o]), 0)).toBe(0);
  });

  it('cada coluna (ataque) tem saldo zero', () => {
    for (const o of OFF) expect(DEF.reduce((sum, d) => sum + score(READ_MATRIX[d][o]), 0)).toBe(0);
  });

  it('a defesa base é sempre neutra', () => {
    for (const o of OFF) expect(readResult('BASE_D', o)).toBe('NEUTRAL');
  });

  it('bate com a spec em casos-chave', () => {
    expect(readResult('BLITZ', 'SCREEN')).toBe('WRONG');
    expect(readResult('ZONE_DEEP', 'DEEP_PASS')).toBe('RIGHT');
    expect(readResult('RUN_STUFF', 'PLAY_ACTION')).toBe('WRONG');
  });
});

describe('catálogo', () => {
  it('tem ids únicos', () => {
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
  });

  it('tem ao menos uma carta de ataque e uma de defesa por tipo', () => {
    for (const t of POKEMON_TYPES) {
      expect(CARDS.some((c) => c.origin === 'TYPE' && c.side === 'OFFENSE' && c.element === t)).toBe(true);
      expect(CARDS.some((c) => c.origin === 'TYPE' && c.side === 'DEFENSE' && c.element === t)).toBe(true);
    }
  });

  it('cobre todas as categorias de ataque e defesa', () => {
    for (const o of OFF) expect(CARDS.some((c) => c.category === o && c.origin !== 'BASIC')).toBe(true);
    for (const d of DEF) expect(CARDS.some((c) => c.category === d)).toBe(true);
  });

  it('busca por id', () => {
    expect(getCard('basic_run').category).toBe('RUN_INSIDE');
    expect(findCard('nao_existe')).toBeUndefined();
    expect(() => getCard('nao_existe')).toThrow(/desconhecida/);
  });
});

describe('elegibilidade', () => {
  const thunder = getCard('electric_thunder_screen'); // RB elétrico + WR elétrico
  const avalanche = getCard('rock_avalanche'); // 2 OL pedra

  it('no deck: o elenco precisa ter Pokémon que cumpram cada requisito', () => {
    expect(canIncludeInDeck(thunder, [25, 74])).toBe(true); // Pikachu
    expect(canIncludeInDeck(thunder, [74, 95])).toBe(false);
    expect(canIncludeInDeck(avalanche, [74])).toBe(false); // só 1 pedra
    expect(canIncludeInDeck(avalanche, [74, 95])).toBe(true); // Geodude + Onix
  });

  it('em campo: os requisitos valem para as vagas da escalação', () => {
    expect(canPlay(thunder, { QB: 63, RB: 25, WR1: 26 })).toBe(true); // Pikachu RB, Raichu WR
    expect(canPlay(thunder, { QB: 63, RB: 25, WR1: 16 })).toBe(false); // WR é Pidgey
    expect(canPlay(avalanche, { OL1: 95, OL2: 74, OL3: 66 })).toBe(true);
    expect(canPlay(avalanche, { OL1: 95, OL2: 66, OL3: 19 })).toBe(false);
  });

  it('cartas básicas são sempre jogáveis', () => {
    expect(canPlay(getCard('basic_pass'), {})).toBe(true);
  });
});
