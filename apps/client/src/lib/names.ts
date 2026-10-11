import type {
  CardOrigin, DefenseCategory, FormationId, OffenseCategory, PackageId, PokemonType, Position, ReadResult, SpecialCategory,
} from '@pfl/engine';
import { getSpecies } from '@pfl/engine';

export const TYPE_LABELS: Record<PokemonType, string> = {
  normal: 'Normal', fire: 'Fogo', water: 'Água', grass: 'Planta', electric: 'Elétrico', ice: 'Gelo',
  fighting: 'Lutador', poison: 'Venenoso', ground: 'Terra', flying: 'Voador', psychic: 'Psíquico',
  bug: 'Inseto', rock: 'Pedra', ghost: 'Fantasma', dragon: 'Dragão',
};

export const POSITION_LABELS: Record<Position, string> = {
  QB: 'Quarterback', OL: 'Linha ofensiva', RB: 'Running back', WR: 'Wide receiver', TE: 'Tight end',
  FB: 'Fullback', DL: 'Linha defensiva', LB: 'Linebacker', CB: 'Cornerback', S: 'Safety',
};

export const FORMATION_LABELS: Record<FormationId, string> = {
  PISTOL: 'Pistol', HEAVY: 'Pesada', SPREAD: 'Spread', DOUBLE: 'Dupla',
};

export const PACKAGE_LABELS: Record<PackageId, string> = {
  BASE: 'Base', HEAVY_D: 'Pesado', NICKEL: 'Nickel', DIME: 'Dime',
};

export const CATEGORY_LABELS: Record<OffenseCategory | DefenseCategory | SpecialCategory, string> = {
  RUN_INSIDE: 'Corrida por Dentro', RUN_OUTSIDE: 'Corrida por Fora', SHORT_PASS: 'Passe Curto',
  DEEP_PASS: 'Passe Longo', SCREEN: 'Screen', PLAY_ACTION: 'Play-Action',
  RUN_STUFF: 'Contenção de Corrida', BLITZ: 'Blitz', MAN: 'Homem a Homem', ZONE_SHORT: 'Zona Curta',
  ZONE_DEEP: 'Zona Profunda', BASE_D: 'Defesa Base', PUNT: 'Punt', FIELD_GOAL: 'Field Goal',
};

export const ORIGIN_LABELS: Record<CardOrigin, string> = {
  BASIC: 'Básica', TYPE: 'De tipo', SIGNATURE: 'Assinatura', SPECIAL: 'Especial',
};

/** Leitura do ponto de vista da defesa (spec 3.5). */
export const READ_SYMBOL: Record<ReadResult, string> = { RIGHT: '✔', NEUTRAL: '·', WRONG: '✖' };
export const READ_LABELS: Record<ReadResult, string> = {
  RIGHT: 'Leitura certa da defesa',
  NEUTRAL: 'Leitura neutra',
  WRONG: 'Leitura errada da defesa',
};

const SPECIAL_NAMES: Record<string, string> = {
  'nidoran-f': 'Nidoran♀',
  'nidoran-m': 'Nidoran♂',
  'mr-mime': 'Mr. Mime',
  farfetchd: "Farfetch'd",
};

/** Os nomes da PokéAPI são slugs ("mr-mime"); aqui viram nomes de exibição. */
export function displayName(slug: string): string {
  const special = SPECIAL_NAMES[slug];
  if (special) return special;
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('-');
}

export function speciesName(id: number): string {
  return displayName(getSpecies(id).name);
}
