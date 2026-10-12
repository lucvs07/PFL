import { describe, it, expect } from 'vitest';
import { CARDS, getCard } from '../src/cards/catalog';
import { ALL_SPECIES } from '../src/species';
import { matchesRequirement } from '../src/cards/eligibility';
import { POKEMON_TYPES, type Card } from '../src/model';

/** As 40 cartas do Plano 1 (35 de tipo/assinatura + 5 básicas/especiais). O significado não pode mudar. */
const PLAN1_CARDS: Omit<Card, 'name' | 'baseYards'>[] = [
  { id: 'basic_run', side: 'OFFENSE', category: 'RUN_INSIDE', origin: 'BASIC', element: null, requirements: [] },
  { id: 'basic_pass', side: 'OFFENSE', category: 'SHORT_PASS', origin: 'BASIC', element: null, requirements: [] },
  { id: 'basic_defense', side: 'DEFENSE', category: 'BASE_D', origin: 'BASIC', element: null, requirements: [] },
  { id: 'punt', side: 'OFFENSE', category: 'PUNT', origin: 'SPECIAL', element: null, requirements: [] },
  { id: 'field_goal', side: 'OFFENSE', category: 'FIELD_GOAL', origin: 'SPECIAL', element: null, requirements: [] },
  { id: 'normal_tackle', side: 'OFFENSE', category: 'RUN_INSIDE', origin: 'TYPE', element: 'normal', requirements: [{ position: 'RB', types: ['normal'], count: 1 }] },
  { id: 'fire_deep', side: 'OFFENSE', category: 'DEEP_PASS', origin: 'TYPE', element: 'fire', requirements: [{ position: 'WR', types: ['fire'], count: 1 }] },
  { id: 'water_surf_route', side: 'OFFENSE', category: 'DEEP_PASS', origin: 'TYPE', element: 'water', requirements: [{ position: 'QB', types: ['water'], count: 1 }, { position: 'WR', types: ['water'], count: 1 }] },
  { id: 'grass_vine_screen', side: 'OFFENSE', category: 'SCREEN', origin: 'TYPE', element: 'grass', requirements: [{ position: 'RB', types: ['grass'], count: 1 }] },
  { id: 'electric_thunder_screen', side: 'OFFENSE', category: 'SCREEN', origin: 'TYPE', element: 'electric', requirements: [{ position: 'RB', types: ['electric'], count: 1 }, { position: 'WR', types: ['electric'], count: 1 }] },
  { id: 'ice_beam_slant', side: 'OFFENSE', category: 'SHORT_PASS', origin: 'TYPE', element: 'ice', requirements: [{ position: 'WR', types: ['ice'], count: 1 }] },
  { id: 'fighting_submission', side: 'OFFENSE', category: 'RUN_INSIDE', origin: 'TYPE', element: 'fighting', requirements: [{ position: 'RB', types: ['fighting'], count: 1 }] },
  { id: 'poison_powder_fake', side: 'OFFENSE', category: 'PLAY_ACTION', origin: 'TYPE', element: 'poison', requirements: [{ position: 'RB', types: ['poison'], count: 1 }] },
  { id: 'ground_earthquake', side: 'OFFENSE', category: 'RUN_OUTSIDE', origin: 'TYPE', element: 'ground', requirements: [{ position: 'RB', types: ['ground'], count: 1 }] },
  { id: 'flying_air_raid', side: 'OFFENSE', category: 'DEEP_PASS', origin: 'TYPE', element: 'flying', requirements: [{ position: 'WR', types: ['flying'], count: 1 }] },
  { id: 'psychic_confusion', side: 'OFFENSE', category: 'PLAY_ACTION', origin: 'TYPE', element: 'psychic', requirements: [{ position: 'QB', types: ['psychic'], count: 1 }] },
  { id: 'bug_quick_bite', side: 'OFFENSE', category: 'SHORT_PASS', origin: 'TYPE', element: 'bug', requirements: [{ position: 'WR', types: ['bug'], count: 1 }] },
  { id: 'rock_avalanche', side: 'OFFENSE', category: 'RUN_INSIDE', origin: 'TYPE', element: 'rock', requirements: [{ position: 'OL', types: ['rock'], count: 2 }] },
  { id: 'ghost_night_shade', side: 'OFFENSE', category: 'PLAY_ACTION', origin: 'TYPE', element: 'ghost', requirements: [{ position: 'WR', types: ['ghost'], count: 1 }] },
  { id: 'dragon_rage_sweep', side: 'OFFENSE', category: 'RUN_OUTSIDE', origin: 'TYPE', element: 'dragon', requirements: [{ position: 'RB', types: ['dragon'], count: 1 }] },
  { id: 'normal_wall', side: 'DEFENSE', category: 'RUN_STUFF', origin: 'TYPE', element: 'normal', requirements: [{ position: 'DL', types: ['normal'], count: 1 }] },
  { id: 'fire_crossfire', side: 'DEFENSE', category: 'BLITZ', origin: 'TYPE', element: 'fire', requirements: [{ position: 'LB', types: ['fire'], count: 1 }] },
  { id: 'water_high_tide', side: 'DEFENSE', category: 'ZONE_DEEP', origin: 'TYPE', element: 'water', requirements: [{ position: 'S', types: ['water'], count: 1 }] },
  { id: 'grass_sleep_powder', side: 'DEFENSE', category: 'ZONE_SHORT', origin: 'TYPE', element: 'grass', requirements: [{ position: 'LB', types: ['grass'], count: 1 }] },
  { id: 'electric_paralysis', side: 'DEFENSE', category: 'MAN', origin: 'TYPE', element: 'electric', requirements: [{ position: 'CB', types: ['electric'], count: 1 }] },
  { id: 'ice_blizzard', side: 'DEFENSE', category: 'ZONE_DEEP', origin: 'TYPE', element: 'ice', requirements: [{ position: 'S', types: ['ice'], count: 1 }] },
  { id: 'fighting_low_kick', side: 'DEFENSE', category: 'BLITZ', origin: 'TYPE', element: 'fighting', requirements: [{ position: 'LB', types: ['fighting'], count: 1 }] },
  { id: 'poison_toxic', side: 'DEFENSE', category: 'RUN_STUFF', origin: 'TYPE', element: 'poison', requirements: [{ position: 'DL', types: ['poison'], count: 1 }] },
  { id: 'ground_dig', side: 'DEFENSE', category: 'BLITZ', origin: 'TYPE', element: 'ground', requirements: [{ position: 'DL', types: ['ground'], count: 1 }] },
  { id: 'flying_gust', side: 'DEFENSE', category: 'MAN', origin: 'TYPE', element: 'flying', requirements: [{ position: 'CB', types: ['flying'], count: 1 }] },
  { id: 'psychic_foresight', side: 'DEFENSE', category: 'ZONE_SHORT', origin: 'TYPE', element: 'psychic', requirements: [{ position: 'S', types: ['psychic'], count: 1 }] },
  { id: 'bug_string_shot', side: 'DEFENSE', category: 'ZONE_SHORT', origin: 'TYPE', element: 'bug', requirements: [{ position: 'CB', types: ['bug'], count: 1 }] },
  { id: 'rock_slide_wall', side: 'DEFENSE', category: 'RUN_STUFF', origin: 'TYPE', element: 'rock', requirements: [{ position: 'DL', types: ['rock','ground'], count: 3 }] },
  { id: 'ghost_lick', side: 'DEFENSE', category: 'MAN', origin: 'TYPE', element: 'ghost', requirements: [{ position: 'CB', types: ['ghost'], count: 1 }] },
  { id: 'dragon_wrath', side: 'DEFENSE', category: 'BLITZ', origin: 'TYPE', element: 'dragon', requirements: [{ position: 'DL', types: ['dragon'], count: 1 }] },
];

describe('catálogo completo (Plano 2)', () => {
  it('preserva as cartas do Plano 1 com o mesmo significado', () => {
    for (const expected of PLAN1_CARDS) {
      const card = getCard(expected.id);
      expect({
        id: card.id, side: card.side, category: card.category, origin: card.origin,
        element: card.element, requirements: card.requirements,
      }).toEqual(expected);
    }
  });

  it('tem exatamente 2 cartas de ataque e 2 de defesa por tipo', () => {
    for (const t of POKEMON_TYPES) {
      expect(CARDS.filter((c) => c.origin === 'TYPE' && c.side === 'OFFENSE' && c.element === t)).toHaveLength(2);
      expect(CARDS.filter((c) => c.origin === 'TYPE' && c.side === 'DEFENSE' && c.element === t)).toHaveLength(2);
    }
    expect(CARDS.filter((c) => c.origin === 'TYPE')).toHaveLength(60);
  });

  it('tem 20 cartas de assinatura, 10 de cada lado', () => {
    const sig = CARDS.filter((c) => c.origin === 'SIGNATURE');
    expect(sig).toHaveLength(20);
    expect(sig.filter((c) => c.side === 'OFFENSE')).toHaveLength(10);
  });

  it('tem 85 cartas, ids e nomes únicos', () => {
    expect(CARDS).toHaveLength(85);
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
    expect(new Set(CARDS.map((c) => c.name)).size).toBe(CARDS.length);
  });

  it('distribui as categorias: 5 cartas de tipo por categoria de ataque e 6 por categoria de defesa', () => {
    const count = (cat: string) => CARDS.filter((c) => c.origin === 'TYPE' && c.category === cat).length;
    for (const cat of ['RUN_INSIDE', 'RUN_OUTSIDE', 'SHORT_PASS', 'DEEP_PASS', 'SCREEN', 'PLAY_ACTION']) expect(count(cat)).toBe(5);
    for (const cat of ['RUN_STUFF', 'BLITZ', 'MAN', 'ZONE_SHORT', 'ZONE_DEEP']) expect(count(cat)).toBe(6);
  });

  it('todo requisito pode ser cumprido por Pokémon reais da Gen 1 (tipagem de Kanto)', () => {
    for (const card of CARDS) {
      for (const req of card.requirements) {
        const able = ALL_SPECIES.filter((s) => matchesRequirement(s, req));
        expect(able.length, `${card.id} / ${req.position}`).toBeGreaterThanOrEqual(req.count ?? 1);
      }
    }
  });

  it('cartas de assinatura citam espécies existentes e só elas', () => {
    for (const card of CARDS.filter((c) => c.origin === 'SIGNATURE')) {
      expect(card.requirements.length).toBeGreaterThan(0);
      for (const req of card.requirements) {
        expect(req.species, card.id).toBeDefined();
        for (const id of req.species!) expect(ALL_SPECIES.some((s) => s.id === id), `${card.id}: ${id}`).toBe(true);
      }
    }
  });

  it('cartas de tipo exigem o próprio tipo da carta', () => {
    for (const card of CARDS.filter((c) => c.origin === 'TYPE')) {
      expect(card.requirements.some((r) => r.types?.includes(card.element!)), card.id).toBe(true);
    }
  });
});
