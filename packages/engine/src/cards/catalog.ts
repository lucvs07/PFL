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
  // ---- Plano 2: catálogo completo ----
  // Ataque por tipo (2ª carta de cada tipo)
  offense('normal_quick_attack', 'Ataque Rápido', 'RUN_OUTSIDE', 'normal', [byType('RB', ['normal'])]),
  offense('fire_blast_fake', 'Explosão de Fogo', 'PLAY_ACTION', 'fire', [byType('QB', ['fire'])]),
  offense('water_gun_slant', "Jato d'Água", 'SHORT_PASS', 'water', [byType('WR', ['water'])]),
  offense('grass_petal_dance', 'Dança das Pétalas', 'RUN_INSIDE', 'grass', [byType('OL', ['grass'], 2)]),
  offense('electric_thunder_bomb', 'Trovão', 'DEEP_PASS', 'electric', [byType('QB', ['electric'])]),
  offense('ice_aurora_screen', 'Raio Aurora', 'SCREEN', 'ice', [byType('RB', ['ice'])]),
  offense('fighting_rolling_kick', 'Chute Giratório', 'RUN_OUTSIDE', 'fighting', [byType('WR', ['fighting'])]),
  offense('poison_acid_screen', 'Ácido', 'SCREEN', 'poison', [byType('RB', ['poison'])]),
  offense('ground_bonemerang', 'Bumerangue de Osso', 'SHORT_PASS', 'ground', [byType('WR', ['ground'])]),
  offense('flying_sky_attack', 'Ataque do Céu', 'PLAY_ACTION', 'flying', [byType('QB', ['flying'])]),
  offense('psychic_psybeam', 'Psicorraio', 'SHORT_PASS', 'psychic', [byType('WR', ['psychic'])]),
  offense('bug_pin_missile', 'Míssil de Agulhas', 'RUN_OUTSIDE', 'bug', [byType('RB', ['bug'])]),
  offense('rock_throw_deep', 'Arremesso de Rocha', 'DEEP_PASS', 'rock', [byType('WR', ['rock'])]),
  offense('ghost_confuse_screen', 'Raio Confuso', 'SCREEN', 'ghost', [byType('RB', ['ghost'])]),
  offense('dragon_slam', 'Pancada do Dragão', 'RUN_INSIDE', 'dragon', [byType('RB', ['dragon'])]),

  // Defesa por tipo (2ª carta de cada tipo)
  defense('normal_body_slam', 'Pancada Corporal', 'BLITZ', 'normal', [byType('LB', ['normal'])]),
  defense('fire_ember', 'Brasas', 'MAN', 'fire', [byType('CB', ['fire'])]),
  defense('water_bubble', 'Bolhas', 'MAN', 'water', [byType('CB', ['water'])]),
  defense('grass_stun_spore', 'Pó Paralisante', 'ZONE_DEEP', 'grass', [byType('S', ['grass'])]),
  defense('electric_thundershock', 'Choque do Trovão', 'BLITZ', 'electric', [byType('DL', ['electric'])]),
  defense('ice_punch', 'Soco de Gelo', 'RUN_STUFF', 'ice', [byType('LB', ['ice'])]),
  defense('fighting_seismic_toss', 'Arremesso Sísmico', 'RUN_STUFF', 'fighting', [byType('DL', ['fighting'])]),
  defense('poison_gas', 'Gás Venenoso', 'ZONE_SHORT', 'poison', [byType('LB', ['poison'])]),
  defense('ground_fissure', 'Fissura', 'RUN_STUFF', 'ground', [byType('DL', ['ground'], 2)]),
  defense('flying_whirlwind', 'Remoinho', 'ZONE_DEEP', 'flying', [byType('S', ['flying'])]),
  defense('psychic_reflect', 'Reflexo', 'ZONE_DEEP', 'psychic', [byType('S', ['psychic'])]),
  defense('bug_twineedle', 'Agulha Dupla', 'ZONE_SHORT', 'bug', [byType('LB', ['bug'])]),
  defense('rock_barrier', 'Barreira de Pedras', 'ZONE_SHORT', 'rock', [byType('LB', ['rock'])]),
  defense('ghost_hypnosis', 'Hipnose', 'ZONE_DEEP', 'ghost', [byType('S', ['ghost'])]),
  defense('dragon_wrap', 'Enrolar', 'MAN', 'dragon', [byType('CB', ['dragon'])]),

  // Assinatura (15 novas; total 20)
  offense('sig_pikachu_volt', 'Choque de Pikachu', 'SCREEN', 'electric', [bySpecies('RB', [25, 26])], 'SIGNATURE', 7),
  offense('sig_machamp_karate', 'Golpe de Karatê', 'RUN_OUTSIDE', 'fighting', [bySpecies('WR', [66, 67, 68])], 'SIGNATURE', 6),
  offense('sig_dugtrio_dig', 'Cavar de Dugtrio', 'RUN_OUTSIDE', 'ground', [bySpecies('RB', [50, 51])], 'SIGNATURE', 6),
  offense('sig_alakazam_teleport', 'Teleporte', 'PLAY_ACTION', 'psychic', [bySpecies('QB', [63, 64, 65])], 'SIGNATURE', 13),
  offense('sig_onix_bind', 'Constrição de Onix', 'RUN_INSIDE', 'rock', [bySpecies('OL', [95])], 'SIGNATURE', 5),
  offense('sig_starmie_swift', 'Meteoro Estelar', 'SHORT_PASS', 'water', [bySpecies('WR', [120, 121])], 'SIGNATURE', 8),
  offense('sig_dragonite_hyper_beam', 'Hiper Raio Dragonite', 'DEEP_PASS', 'dragon', [bySpecies('WR', [147, 148, 149])], 'SIGNATURE', 20),
  defense('sig_snorlax_body_slam', 'Pancada de Snorlax', 'RUN_STUFF', 'normal', [bySpecies('DL', [143])], 'SIGNATURE'),
  defense('sig_cloyster_clamp', 'Concha Cloyster', 'RUN_STUFF', 'water', [bySpecies('DL', [90, 91])], 'SIGNATURE'),
  defense('sig_hitmonlee_kick', 'Chute Alto', 'BLITZ', 'fighting', [bySpecies('LB', [106])], 'SIGNATURE'),
  defense('sig_hitmonchan_counter', 'Contra-Ataque', 'MAN', 'fighting', [bySpecies('CB', [107])], 'SIGNATURE'),
  defense('sig_mrmime_barrier', 'Barreira Mímica', 'ZONE_SHORT', 'psychic', [bySpecies('S', [122])], 'SIGNATURE'),
  defense('sig_jynx_lovely_kiss', 'Beijo Encantado', 'ZONE_SHORT', 'ice', [bySpecies('CB', [124])], 'SIGNATURE'),
  defense('sig_gengar_dream_eater', 'Devorador de Sonhos', 'ZONE_DEEP', 'ghost', [bySpecies('S', [92, 93, 94])], 'SIGNATURE'),
  defense('sig_lapras_mist', 'Névoa de Lapras', 'ZONE_DEEP', 'ice', [bySpecies('S', [131])], 'SIGNATURE'),
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
