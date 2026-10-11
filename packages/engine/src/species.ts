import pokemonData from './data/pokemon.json';
import typechartData from './data/typechart.json';
import type { PokemonType, Species } from './model';

export const ALL_SPECIES: readonly Species[] = pokemonData as Species[];
const BY_ID = new Map(ALL_SPECIES.map((s) => [s.id, s]));

/** Articuno, Zapdos, Moltres, Mewtwo, Mew */
export const LEGENDARY_IDS: readonly number[] = [144, 145, 146, 150, 151];

export const TYPE_CHART = typechartData as Record<PokemonType, Record<PokemonType, number>>;

export function hasSpecies(id: number): boolean {
  return BY_ID.has(id);
}

export function getSpecies(id: number): Species {
  const species = BY_ID.get(id);
  if (!species) throw new Error(`Espécie desconhecida: ${id}`);
  return species;
}
