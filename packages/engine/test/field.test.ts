import { describe, it, expect } from 'vitest';
import { advanceField, nextDriveStart } from '../src/field';
import type { PlayKind, PlayOutcome } from '../src/model';

const o = (kind: PlayKind, yards: number): PlayOutcome => ({
  kind, yards, bigPlay: false, read: 'NEUTRAL', offActors: [], defActors: [], offTypeMult: 1, defTypeMult: 1,
});
const first = (ballOn: number, yardsToGo = 10, down = 1) => ({ down, yardsToGo, ballOn });

describe('advanceField', () => {
  it('avança o down', () => {
    expect(advanceField(first(25), o('GAIN', 4))).toEqual({ field: { down: 2, yardsToGo: 6, ballOn: 29 }, firstDown: false, end: null });
  });

  it('dá first down', () => {
    expect(advanceField(first(25), o('GAIN', 12))).toEqual({ field: { down: 1, yardsToGo: 10, ballOn: 37 }, firstDown: true, end: null });
  });

  it('usa goal-to-go perto da end zone', () => {
    expect(advanceField(first(85), o('GAIN', 10)).field).toEqual({ down: 1, yardsToGo: 5, ballOn: 95 });
  });

  it('passe incompleto gasta o down sem mexer na bola', () => {
    expect(advanceField(first(40, 10, 2), o('INCOMPLETE', 0)).field).toEqual({ down: 3, yardsToGo: 10, ballOn: 40 });
  });

  it('sack aumenta a distância', () => {
    expect(advanceField(first(40), o('SACK', -6)).field).toEqual({ down: 2, yardsToGo: 16, ballOn: 34 });
  });

  it('touchdown e safety', () => {
    expect(advanceField(first(95, 5), o('GAIN', 5)).end).toEqual({ kind: 'TOUCHDOWN' });
    expect(advanceField(first(1), o('SACK', -6)).end).toEqual({ kind: 'SAFETY' });
  });

  it('turnover on downs no 4º down', () => {
    expect(advanceField(first(60, 5, 4), o('GAIN', 2)).end).toEqual({ kind: 'DOWNS', spot: 62 });
  });

  it('interceptação e fumble marcam o ponto do turnover', () => {
    expect(advanceField(first(40), o('INTERCEPTION', 18)).end).toEqual({ kind: 'TURNOVER', spot: 58 });
    expect(advanceField(first(98), o('FUMBLE', 5)).end).toEqual({ kind: 'TURNOVER', spot: 99 });
  });
});

describe('nextDriveStart', () => {
  it('após pontuar: touchback na 25', () => {
    expect(nextDriveStart({ kind: 'TOUCHDOWN' })).toBe(25);
    expect(nextDriveStart({ kind: 'SAFETY' })).toBe(25);
    expect(nextDriveStart({ kind: 'CONVERSION' })).toBe(25);
    expect(nextDriveStart({ kind: 'FIELD_GOAL', good: true, ballOn: 70 })).toBe(25);
  });

  it('FG errado: ponto do chute invertido, no mínimo na 20', () => {
    expect(nextDriveStart({ kind: 'FIELD_GOAL', good: false, ballOn: 70 })).toBe(37);
    expect(nextDriveStart({ kind: 'FIELD_GOAL', good: false, ballOn: 90 })).toBe(20);
  });

  it('punt: onde a bola parou, ou touchback se entrar na end zone', () => {
    expect(nextDriveStart({ kind: 'PUNT', landing: 80 })).toBe(20);
    expect(nextDriveStart({ kind: 'PUNT', landing: 105 })).toBe(25);
  });

  it('turnover e downs: campo invertido no ponto', () => {
    expect(nextDriveStart({ kind: 'TURNOVER', spot: 58 })).toBe(42);
    expect(nextDriveStart({ kind: 'DOWNS', spot: 62 })).toBe(38);
  });
});
