// Tipos de domínio do PFL. Todas as outras partes do motor importam daqui.

export const POKEMON_TYPES = [
  'normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison',
  'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon',
] as const;
export type PokemonType = (typeof POKEMON_TYPES)[number];

export interface Stats {
  hp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
}
export type StatKey = keyof Stats;

export interface Species {
  id: number;
  name: string;
  types: PokemonType[];
  stats: Stats;
}

export type Position = 'QB' | 'OL' | 'RB' | 'WR' | 'TE' | 'FB' | 'DL' | 'LB' | 'CB' | 'S';
export type OffenseSlot = 'QB' | 'OL1' | 'OL2' | 'OL3' | 'RB' | 'WR1' | 'WR2' | 'WR3' | 'TE' | 'FB';
export type DefenseSlot = 'DL1' | 'DL2' | 'DL3' | 'LB1' | 'LB2' | 'CB1' | 'CB2' | 'CB3' | 'S1' | 'S2';
export type SlotId = OffenseSlot | DefenseSlot;
export type FormationId = 'PISTOL' | 'HEAVY' | 'SPREAD' | 'DOUBLE';
export type PackageId = 'BASE' | 'HEAVY_D' | 'NICKEL' | 'DIME';
/** vaga → id da espécie em campo */
export type Lineup = Partial<Record<SlotId, number>>;

export type OffenseCategory = 'RUN_INSIDE' | 'RUN_OUTSIDE' | 'SHORT_PASS' | 'DEEP_PASS' | 'SCREEN' | 'PLAY_ACTION';
export type DefenseCategory = 'RUN_STUFF' | 'BLITZ' | 'MAN' | 'ZONE_SHORT' | 'ZONE_DEEP' | 'BASE_D';
export type SpecialCategory = 'PUNT' | 'FIELD_GOAL';
export type CardSide = 'OFFENSE' | 'DEFENSE';
export type CardOrigin = 'BASIC' | 'TYPE' | 'SIGNATURE' | 'SPECIAL';

/** Exige `count` (padrão 1) Pokémon na posição que tenham um dos tipos e/ou sejam uma das espécies. */
export interface Requirement {
  position: Position;
  types?: PokemonType[];
  species?: number[];
  count?: number;
}

export interface Card {
  id: string;
  name: string;
  side: CardSide;
  category: OffenseCategory | DefenseCategory | SpecialCategory;
  origin: CardOrigin;
  element: PokemonType | null;
  requirements: Requirement[];
  /** Sobrescreve as jardas base da categoria. */
  baseYards?: number;
}

export interface Team {
  name: string;
  roster: number[];
  specialist: number;
  depth: Partial<Record<SlotId, number[]>>;
  keepOnField: number[];
  offenseDeck: string[];
  defenseDeck: string[];
}

export interface TeamError {
  code: string;
  detail?: string;
}

export type TeamKey = 'A' | 'B';
/** Resultado da leitura do ponto de vista da defesa. */
export type ReadResult = 'RIGHT' | 'NEUTRAL' | 'WRONG';

export interface FieldState {
  down: number;
  yardsToGo: number;
  /** 0 = própria end zone do ataque, 100 = end zone adversária */
  ballOn: number;
}

export interface FatigueState {
  levels: Record<number, number>;
  resting: number[];
}

export interface DeckState {
  draw: string[];
  hand: string[];
  discard: string[];
}

export type Phase = 'FORMATION' | 'PACKAGE' | 'PLAYCALL' | 'CONVERSION' | 'MATCH_END';

export type Action =
  | { type: 'FORMATION'; team: TeamKey; formation: FormationId }
  | { type: 'PACKAGE'; team: TeamKey; package: PackageId }
  | { type: 'CARD'; team: TeamKey; cardId: string }
  | { type: 'CONVERSION'; team: TeamKey; choice: 'PAT' | 'TWO' }
  | { type: 'TIMEOUT' };

export type PlayKind = 'GAIN' | 'SACK' | 'INCOMPLETE' | 'INTERCEPTION' | 'FUMBLE';

export interface PlayOutcome {
  kind: PlayKind;
  /** GAIN/SACK: jardas; INTERCEPTION/FUMBLE: distância da linha até o ponto do turnover */
  yards: number;
  bigPlay: boolean;
  read: ReadResult;
  offActors: number[];
  defActors: number[];
  offTypeMult: number;
  defTypeMult: number;
}

export type GameEvent =
  | { t: 'DRIVE_START'; offense: TeamKey; ballOn: number; possession: number; overtimeRound: number }
  | { t: 'FORMATION'; team: TeamKey; formation: FormationId; lineup: Lineup }
  | { t: 'PACKAGE'; team: TeamKey; package: PackageId; lineup: Lineup }
  | { t: 'CARDS'; offense: string; defense: string; read: ReadResult }
  | { t: 'PLAY'; outcome: PlayOutcome }
  | { t: 'PUNT'; distance: number }
  | { t: 'FIELD_GOAL'; distance: number; good: boolean }
  | { t: 'FIRST_DOWN' }
  | { t: 'TOUCHDOWN'; team: TeamKey }
  | { t: 'SAFETY'; team: TeamKey }
  | { t: 'CONVERSION'; team: TeamKey; choice: 'PAT' | 'TWO'; good: boolean }
  | { t: 'TURNOVER_ON_DOWNS' }
  | { t: 'TURNOVER'; kind: 'INTERCEPTION' | 'FUMBLE' }
  | { t: 'OVERTIME'; round: number }
  | { t: 'MATCH_END'; score: Record<TeamKey, number> };
