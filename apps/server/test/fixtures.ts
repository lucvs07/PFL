import type { Team } from '@pfl/engine';

/**
 * Time válido de teste (custo 72, abaixo do teto de 120).
 * 25 Pikachu, 26 Raichu, 100 Voltorb, 81 Magnemite, 125 Electabuzz, 74 Geodude, 95 Onix, 66 Machop,
 * 19 Rattata, 16 Pidgey, 21 Spearow, 50 Diglett, 54 Psyduck, 63 Abra, 10 Caterpie, 13 Weedle; especialista 129 Magikarp.
 */
export function electricTeam(name = 'Kanto Thunder'): Team {
  return {
    name,
    roster: [25, 26, 100, 81, 125, 74, 95, 66, 19, 16, 21, 50, 54, 63, 10, 13],
    specialist: 129,
    depth: {
      QB: [63, 54],
      OL1: [95, 66, 19],
      OL2: [74, 19, 66],
      OL3: [66, 50, 74],
      RB: [25, 50, 19],
      WR1: [26, 100, 13],
      WR2: [125, 10, 16],
      WR3: [100, 13, 21],
      TE: [81, 54],
      FB: [19, 66],
      DL1: [95, 74, 19],
      DL2: [74, 66, 50],
      DL3: [50, 19, 95],
      LB1: [66, 21, 16],
      LB2: [21, 16],
      CB1: [26, 10, 100],
      CB2: [100, 13, 125],
      CB3: [13, 10],
      S1: [63, 16, 54],
      S2: [16, 54],
    },
    keepOnField: [],
    offenseDeck: [
      'electric_thunder_screen', 'electric_thunder_screen',
      'normal_tackle', 'normal_tackle',
      'fighting_submission', 'fighting_submission',
      'ground_earthquake', 'ground_earthquake',
      'rock_avalanche', 'rock_avalanche',
      'bug_quick_bite', 'bug_quick_bite',
    ],
    defenseDeck: [
      'electric_paralysis', 'electric_paralysis',
      'normal_wall', 'normal_wall',
      'fighting_low_kick', 'fighting_low_kick',
      'ground_dig', 'ground_dig',
      'bug_string_shot', 'bug_string_shot',
      'psychic_foresight', 'psychic_foresight',
    ],
  };
}
