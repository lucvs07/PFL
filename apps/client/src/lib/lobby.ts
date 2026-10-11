import type { Team } from '@pfl/engine';

/** Espécie que representa o time no card do lobby: o QB titular ou, sem ele, o primeiro do elenco. */
export function leadSpecies(team: Team | null): number | null {
  if (!team) return null;
  return team.depth.QB?.[0] ?? team.roster[0] ?? null;
}
