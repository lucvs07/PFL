import type { Card, Lineup, Requirement, Species } from '../model';
import { getSpecies } from '../species';
import { slotsOf } from '../formations';

export function matchesRequirement(species: Species, req: Requirement): boolean {
  if (req.species && !req.species.includes(species.id)) return false;
  if (req.types && !species.types.some((t) => req.types!.includes(t))) return false;
  return true;
}

/** Montagem do deck: qualquer Pokémon pode jogar em qualquer posição, então só o elenco importa. */
export function canIncludeInDeck(card: Card, roster: readonly number[]): boolean {
  return card.requirements.every(
    (req) => roster.filter((id) => matchesRequirement(getSpecies(id), req)).length >= (req.count ?? 1),
  );
}

/** Em campo: os requisitos precisam ser cumpridos pelas vagas da posição exigida. */
export function canPlay(card: Card, lineup: Lineup): boolean {
  return card.requirements.every(
    (req) =>
      slotsOf(lineup, req.position).filter((slot) => matchesRequirement(getSpecies(lineup[slot] as number), req))
        .length >= (req.count ?? 1),
  );
}
