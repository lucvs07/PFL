import type { Card, CardOrigin, DefenseCategory, OffenseCategory, PokemonType, Position, Requirement } from '../model';

const offense = (
  id: string,
  name: string,
  category: OffenseCategory,
  element: PokemonType | null,
  requirements: Requirement[],
  origin: CardOrigin = 'TYPE',
  baseYards?: number,
): Card => ({ id, name, side: 'OFFENSE', category, origin, element, requirements, ...(baseYards !== undefined ? { baseYards } : {}) });

const defense = (
  id: string,
  name: string,
  category: DefenseCategory,
  element: PokemonType | null,
  requirements: Requirement[],
  origin: CardOrigin = 'TYPE',
): Card => ({ id, name, side: 'DEFENSE', category, origin, element, requirements });

const byType = (position: Position, types: PokemonType[], count = 1): Requirement => ({ position, types, count });
const bySpecies = (position: Position, species: number[]): Requirement => ({ position, species });

export const BASIC_OFFENSE_IDS = ['basic_run', 'basic_pass'] as const;
export const BASIC_DEFENSE_IDS = ['basic_defense'] as const;
export const SPECIAL_IDS = ['punt', 'field_goal'] as const;

export const CARDS: readonly Card[] = [
  // Básicas — sempre disponíveis, fora do deck (spec 2.3)
  offense('basic_run', 'Corrida Básica', 'RUN_INSIDE', null, [], 'BASIC'),
  offense('basic_pass', 'Passe Básico', 'SHORT_PASS', null, [], 'BASIC'),
  defense('basic_defense', 'Defesa Base', 'BASE_D', null, [], 'BASIC'),
  // Especiais de 4º down
  { id: 'punt', name: 'Punt', side: 'OFFENSE', category: 'PUNT', origin: 'SPECIAL', element: null, requirements: [] },
  { id: 'field_goal', name: 'Field Goal', side: 'OFFENSE', category: 'FIELD_GOAL', origin: 'SPECIAL', element: null, requirements: [] },

  // Ataque por tipo
  offense('normal_tackle', 'Investida', 'RUN_INSIDE', 'normal', [byType('RB', ['normal'])]),
  offense('fire_deep', 'Lança-Chamas Longo', 'DEEP_PASS', 'fire', [byType('WR', ['fire'])]),
  offense('water_surf_route', 'Surf Route', 'DEEP_PASS', 'water', [byType('QB', ['water']), byType('WR', ['water'])], 'TYPE', 20),
  offense('grass_vine_screen', 'Chicote de Vinha', 'SCREEN', 'grass', [byType('RB', ['grass'])]),
  offense('electric_thunder_screen', 'Thunder Screen', 'SCREEN', 'electric', [byType('RB', ['electric']), byType('WR', ['electric'])], 'TYPE', 7),
  offense('ice_beam_slant', 'Raio de Gelo', 'SHORT_PASS', 'ice', [byType('WR', ['ice'])]),
  offense('fighting_submission', 'Submissão', 'RUN_INSIDE', 'fighting', [byType('RB', ['fighting'])]),
  offense('poison_powder_fake', 'Pó Venenoso', 'PLAY_ACTION', 'poison', [byType('RB', ['poison'])]),
  offense('ground_earthquake', 'Terremoto', 'RUN_OUTSIDE', 'ground', [byType('RB', ['ground'])]),
  offense('flying_air_raid', 'Ataque Aéreo', 'DEEP_PASS', 'flying', [byType('WR', ['flying'])]),
  offense('psychic_confusion', 'Confusão', 'PLAY_ACTION', 'psychic', [byType('QB', ['psychic'])]),
  offense('bug_quick_bite', 'Picada Rápida', 'SHORT_PASS', 'bug', [byType('WR', ['bug'])]),
  offense('rock_avalanche', 'Avalanche', 'RUN_INSIDE', 'rock', [byType('OL', ['rock'], 2)]),
  offense('ghost_night_shade', 'Sombra Noturna', 'PLAY_ACTION', 'ghost', [byType('WR', ['ghost'])]),
  offense('dragon_rage_sweep', 'Fúria do Dragão', 'RUN_OUTSIDE', 'dragon', [byType('RB', ['dragon'])]),

  // Defesa por tipo
  defense('normal_wall', 'Muralha Normal', 'RUN_STUFF', 'normal', [byType('DL', ['normal'])]),
  defense('fire_crossfire', 'Fogo Cruzado', 'BLITZ', 'fire', [byType('LB', ['fire'])]),
  defense('water_high_tide', 'Maré Alta', 'ZONE_DEEP', 'water', [byType('S', ['water'])]),
  defense('grass_sleep_powder', 'Pó do Sono', 'ZONE_SHORT', 'grass', [byType('LB', ['grass'])]),
  defense('electric_paralysis', 'Paralisia', 'MAN', 'electric', [byType('CB', ['electric'])]),
  defense('ice_blizzard', 'Nevasca', 'ZONE_DEEP', 'ice', [byType('S', ['ice'])]),
  defense('fighting_low_kick', 'Golpe Baixo', 'BLITZ', 'fighting', [byType('LB', ['fighting'])]),
  defense('poison_toxic', 'Tóxico', 'RUN_STUFF', 'poison', [byType('DL', ['poison'])]),
  defense('ground_dig', 'Cova', 'BLITZ', 'ground', [byType('DL', ['ground'])]),
  defense('flying_gust', 'Rajada', 'MAN', 'flying', [byType('CB', ['flying'])]),
  defense('psychic_foresight', 'Previsão', 'ZONE_SHORT', 'psychic', [byType('S', ['psychic'])]),
  defense('bug_string_shot', 'Teia', 'ZONE_SHORT', 'bug', [byType('CB', ['bug'])]),
  defense('rock_slide_wall', 'Rock Slide Wall', 'RUN_STUFF', 'rock', [byType('DL', ['rock', 'ground'], 3)]),
  defense('ghost_lick', 'Lambida', 'MAN', 'ghost', [byType('CB', ['ghost'])]),
  defense('dragon_wrath', 'Ira Dracônica', 'BLITZ', 'dragon', [byType('DL', ['dragon'])]),

  // Assinatura
  offense('sig_snorlax_wall', 'Muralha Snorlax', 'RUN_INSIDE', 'normal', [bySpecies('OL', [143])], 'SIGNATURE', 5),
  offense('sig_fly_route', 'Fly Route', 'DEEP_PASS', 'flying', [bySpecies('WR', [17, 18])], 'SIGNATURE', 22),
  offense('sig_mewtwo_mind', 'Mente Mewtwo', 'PLAY_ACTION', 'psychic', [bySpecies('QB', [150])], 'SIGNATURE', 15),
  defense('sig_scyther_blade', 'Lâmina Scyther', 'MAN', 'bug', [bySpecies('CB', [123])], 'SIGNATURE'),
  defense('sig_gyarados_hyper_beam', 'Hiper Raio Gyarados', 'BLITZ', 'water', [bySpecies('DL', [130])], 'SIGNATURE'),
];

const BY_ID = new Map(CARDS.map((c) => [c.id, c]));

export function findCard(id: string): Card | undefined {
  return BY_ID.get(id);
}

export function getCard(id: string): Card {
  const card = BY_ID.get(id);
  if (!card) throw new Error(`Carta desconhecida: ${id}`);
  return card;
}
