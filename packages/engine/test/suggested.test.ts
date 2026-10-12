import { describe, it, expect } from 'vitest';
import { SUGGESTED_TEAMS } from '../src/index';
import { validateTeam, teamCost, SALARY_CAP } from '../src/team';
import { LEGENDARY_IDS } from '../src/species';
import { FORMATIONS, PACKAGES, OFFENSE_SLOTS, DEFENSE_SLOTS } from '../src/formations';
import { pickLineup, initialFatigue } from '../src/fatigue';
import { canPlay } from '../src/cards/eligibility';
import { getCard } from '../src/cards/catalog';

const EXPECTED_COST: Record<string, number> = {
  'Relâmpagos de Vermilion': 116,
  'Chamas de Cinnabar': 120,
  'Marés de Cerulean': 117,
  'Muralha de Pewter': 120,
  'Mentes de Saffron': 120,
  'Selva de Celadon': 117,
};

describe('SUGGESTED_TEAMS', () => {
  it('são 6 times com nomes únicos', () => {
    expect(SUGGESTED_TEAMS).toHaveLength(6);
    expect(new Set(SUGGESTED_TEAMS.map((t) => t.name)).size).toBe(6);
  });

  it.each(SUGGESTED_TEAMS.map((t) => [t.name, t] as const))('%s é válido', (_name, team) => {
    expect(validateTeam(team)).toEqual([]);
  });

  it('respeitam o teto com o custo documentado e no máximo 1 lendário', () => {
    for (const team of SUGGESTED_TEAMS) {
      expect(teamCost(team)).toBe(EXPECTED_COST[team.name]);
      expect(teamCost(team)).toBeLessThanOrEqual(SALARY_CAP);
      expect([...team.roster, team.specialist].filter((id) => LEGENDARY_IDS.includes(id)).length).toBeLessThanOrEqual(1);
    }
  });

  it('têm depth chart com titular e 2 reservas em todas as 20 vagas', () => {
    for (const team of SUGGESTED_TEAMS) {
      for (const slot of [...OFFENSE_SLOTS, ...DEFENSE_SLOTS]) {
        const ids = team.depth[slot] ?? [];
        expect(ids, `${team.name} ${slot}`).toHaveLength(3);
        expect(new Set(ids).size).toBe(3);
      }
    }
  });

  it('toda carta do deck é jogável com os titulares em ao menos uma formação/pacote', () => {
    for (const team of SUGGESTED_TEAMS) {
      const off = Object.values(FORMATIONS).map((f) => pickLineup(f, team, initialFatigue()));
      const def = Object.values(PACKAGES).map((p) => pickLineup(p, team, initialFatigue()));
      for (const id of team.offenseDeck) expect(off.some((l) => canPlay(getCard(id), l)), `${team.name}: ${id}`).toBe(true);
      for (const id of team.defenseDeck) expect(def.some((l) => canPlay(getCard(id), l)), `${team.name}: ${id}`).toBe(true);
    }
  });
});
