import { describe, it, expect } from 'vitest';
import { resolvePlay, type PlayInput } from '../src/resolve';
import { pickLineup, initialFatigue } from '../src/fatigue';
import { FORMATIONS, PACKAGES } from '../src/formations';
import type { Card, OffenseCategory, DefenseCategory, PokemonType } from '../src/model';
import { electricTeam } from './fixtures';

const team = electricTeam();
const offLineup = pickLineup(FORMATIONS.PISTOL, team, initialFatigue());
const defLineup = pickLineup(PACKAGES.BASE, team, initialFatigue());

const offCard = (category: OffenseCategory, element: PokemonType | null = null): Card =>
  ({ id: `t_${category}`, name: 't', side: 'OFFENSE', category, origin: 'TYPE', element, requirements: [] });
const defCard = (category: DefenseCategory, element: PokemonType | null = null): Card =>
  ({ id: `t_${category}`, name: 't', side: 'DEFENSE', category, origin: 'TYPE', element, requirements: [] });

const input = (o: Card, d: Card, rng: number, offFatigue: Record<number, number> = {}): PlayInput =>
  ({ offCard: o, defCard: d, offLineup, defLineup, offFatigue, defFatigue: {}, rng });

const N = 3000;
const avgYards = (o: Card, d: Card, offFatigue: Record<number, number> = {}): number => {
  let total = 0;
  for (let i = 0; i < N; i++) {
    const { outcome } = resolvePlay(input(o, d, i * 7919 + 1, offFatigue));
    if (outcome.kind === 'GAIN' || outcome.kind === 'SACK') total += outcome.yards;
  }
  return total / N;
};
const kinds = (o: Card, d: Card): Set<string> => {
  const set = new Set<string>();
  for (let i = 0; i < 2000; i++) set.add(resolvePlay(input(o, d, i * 104729 + 3)).outcome.kind);
  return set;
};

describe('resolvePlay', () => {
  it('é determinístico', () => {
    const a = resolvePlay(input(offCard('DEEP_PASS'), defCard('MAN'), 12345));
    const b = resolvePlay(input(offCard('DEEP_PASS'), defCard('MAN'), 12345));
    expect(a).toEqual(b);
  });

  it('leitura domina: ✔ < · < ✖ em jardas médias', () => {
    const run = offCard('RUN_INSIDE');
    const right = avgYards(run, defCard('RUN_STUFF'));
    const neutral = avgYards(run, defCard('ZONE_SHORT'));
    const wrong = avgYards(run, defCard('MAN'));
    expect(right).toBeLessThan(neutral);
    expect(neutral).toBeLessThan(wrong);
  });

  it('confronto de tipo pesa: água contra linha de pedra/terra rende mais; elétrico contra terra rende menos', () => {
    const d = defCard('ZONE_SHORT');
    const plain = avgYards(offCard('RUN_INSIDE'), d);
    expect(avgYards(offCard('RUN_INSIDE', 'water'), d)).toBeGreaterThan(plain);
    expect(avgYards(offCard('RUN_INSIDE', 'electric'), d)).toBeLessThan(plain);
  });

  it('fadiga do ator reduz o rendimento', () => {
    const o = offCard('RUN_INSIDE');
    const d = defCard('ZONE_SHORT');
    expect(avgYards(o, d, { 25: 6 })).toBeLessThan(avgYards(o, d));
  });

  it('corrida nunca gera sack, passe incompleto ou interceptação', () => {
    const set = kinds(offCard('RUN_INSIDE'), defCard('RUN_STUFF'));
    expect([...set].every((k) => k === 'GAIN' || k === 'FUMBLE')).toBe(true);
  });

  it('passe longo contra blitz gera sacks', () => {
    expect(kinds(offCard('DEEP_PASS'), defCard('BLITZ')).has('SACK')).toBe(true);
  });

  it('passe inclui QB e linha ofensiva entre os atores', () => {
    const { outcome } = resolvePlay(input(offCard('SHORT_PASS'), defCard('ZONE_SHORT'), 1));
    expect(outcome.offActors).toEqual(expect.arrayContaining([63, 95, 74, 66]));
    expect(outcome.defActors.length).toBeGreaterThan(0);
  });
});
