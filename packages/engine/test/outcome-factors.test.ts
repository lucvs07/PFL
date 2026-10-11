import { describe, it, expect } from 'vitest';
import { resolvePlay, READ_YARDS } from '../src/resolve';
import { OFFENSE_PROFILES } from '../src/cards/categories';
import { pickLineup, initialFatigue } from '../src/fatigue';
import { FORMATIONS, PACKAGES } from '../src/formations';
import { getCard } from '../src/cards/catalog';
import { electricTeam } from './fixtures';

const team = electricTeam();
const offLineup = pickLineup(FORMATIONS.PISTOL, team, initialFatigue());
const defLineup = pickLineup(PACKAGES.BASE, team, initialFatigue());
const PAIRS: [string, string][] = [
  ['basic_run', 'basic_defense'],
  ['electric_thunder_screen', 'electric_paralysis'],
  ['bug_quick_bite', 'normal_wall'],
  ['ground_earthquake', 'ground_dig'],
  ['basic_pass', 'psychic_foresight'],
];

describe('PlayOutcome expõe os fatores da resolução', () => {
  it('readFactor segue a leitura e os fatores ficam nas faixas da spec', () => {
    for (const [o, d] of PAIRS) {
      for (let seed = 1; seed <= 300; seed++) {
        const { outcome } = resolvePlay({
          offCard: getCard(o), defCard: getCard(d), offLineup, defLineup, offFatigue: {}, defFatigue: {}, rng: seed * 7919,
        });
        expect(outcome.readFactor).toBe(READ_YARDS[outcome.read]);
        expect(outcome.statFactor).toBeGreaterThanOrEqual(0.6);
        expect(outcome.statFactor).toBeLessThanOrEqual(1.4);
        const v = OFFENSE_PROFILES[getCard(o).category as keyof typeof OFFENSE_PROFILES].variance;
        expect(outcome.varianceFactor).toBeGreaterThanOrEqual(1 - v);
        expect(outcome.varianceFactor).toBeLessThanOrEqual(1 + v);
      }
    }
  });

  it('as jardas de um GAIN comum são o produto dos fatores', () => {
    let checked = 0;
    for (const [o, d] of PAIRS) {
      for (let seed = 1; seed <= 300; seed++) {
        const offCard = getCard(o);
        const { outcome } = resolvePlay({
          offCard, defCard: getCard(d), offLineup, defLineup, offFatigue: {}, defFatigue: {}, rng: seed * 104729,
        });
        if (outcome.kind !== 'GAIN' || outcome.bigPlay) continue;
        const base = offCard.baseYards ?? OFFENSE_PROFILES[offCard.category as keyof typeof OFFENSE_PROFILES].baseYards;
        const edge = (outcome.statFactor * outcome.offTypeMult) / outcome.defTypeMult;
        const expected = Math.round(base * outcome.readFactor * edge * outcome.varianceFactor) - (outcome.read === 'RIGHT' ? 2 : 0);
        expect(outcome.yards).toBe(expected);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(500);
  });
});
