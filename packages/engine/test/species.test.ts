import { describe, it, expect } from 'vitest';
import { ALL_SPECIES, getSpecies, hasSpecies, TYPE_CHART, LEGENDARY_IDS } from '../src/species';
import { POKEMON_TYPES } from '../src/model';

describe('dados da Gen 1', () => {
  it('tem os 151 Pokémon com ids 1..151', () => {
    expect(ALL_SPECIES).toHaveLength(151);
    expect(ALL_SPECIES.map((s) => s.id)).toEqual(Array.from({ length: 151 }, (_, i) => i + 1));
  });

  it('usa a tipagem original de Kanto', () => {
    expect(getSpecies(81).types).toEqual(['electric']); // Magnemite
    expect(getSpecies(35).types).toEqual(['normal']); // Clefairy
    for (const s of ALL_SPECIES) for (const t of s.types) expect(POKEMON_TYPES).toContain(t);
  });

  it('tem stats completos', () => {
    const snorlax = getSpecies(143).stats;
    const bst = snorlax.hp + snorlax.attack + snorlax.defense + snorlax.spAttack + snorlax.spDefense + snorlax.speed;
    expect(bst).toBe(540);
  });

  it('usa a tabela de tipos da Gen 1 com o bug Fantasma/Psíquico corrigido', () => {
    expect(TYPE_CHART.ghost.psychic).toBe(2);
    expect(TYPE_CHART.normal.ghost).toBe(0);
    expect(TYPE_CHART.bug.poison).toBe(2);
    expect(TYPE_CHART.poison.bug).toBe(2);
    expect(TYPE_CHART.ice.fire).toBe(1);
    expect(TYPE_CHART.electric.ground).toBe(0);
    expect(TYPE_CHART.water.fire).toBe(2);
  });

  it('identifica espécies e lendários', () => {
    expect(hasSpecies(151)).toBe(true);
    expect(hasSpecies(152)).toBe(false);
    expect(() => getSpecies(0)).toThrow(/desconhecida/);
    expect(LEGENDARY_IDS).toEqual([144, 145, 146, 150, 151]);
  });
});
