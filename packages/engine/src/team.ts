import type { CardSide, Position, Species, StatKey, Team, TeamError } from './model';
import { getSpecies, hasSpecies, LEGENDARY_IDS } from './species';
import { FORMATIONS, PACKAGES, fillSlots } from './formations';
import { findCard } from './cards/catalog';
import { canIncludeInDeck } from './cards/eligibility';

export const SALARY_CAP = 120;
export const ROSTER_SIZE = 16;
export const DECK_SIZE = 12;
export const MAX_COPIES = 2;
export const MAX_LEGENDARIES = 1;

export function bst(species: Species): number {
  const s = species.stats;
  return s.hp + s.attack + s.defense + s.spAttack + s.spDefense + s.speed;
}

export function speciesCost(id: number): number {
  return Math.max(1, Math.round((bst(getSpecies(id)) - 180) / 30));
}

export function teamCost(team: Team): number {
  return [...team.roster, team.specialist].reduce((sum, id) => sum + speciesCost(id), 0);
}

/** Pesos por posição (spec 4.2), usados na nota de aptidão. */
export const POSITION_WEIGHTS: Record<Position, Partial<Record<StatKey, number>>> = {
  QB: { spAttack: 0.7, spDefense: 0.2, speed: 0.1 },
  OL: { defense: 0.5, attack: 0.3, hp: 0.2 },
  RB: { speed: 0.5, attack: 0.4, hp: 0.1 },
  WR: { speed: 0.7, attack: 0.2, spDefense: 0.1 },
  TE: { attack: 0.4, defense: 0.3, speed: 0.3 },
  FB: { attack: 0.5, defense: 0.3, hp: 0.2 },
  DL: { attack: 0.5, defense: 0.3, hp: 0.2 },
  LB: { attack: 0.4, speed: 0.3, spDefense: 0.3 },
  CB: { speed: 0.7, spDefense: 0.3 },
  S: { spDefense: 0.5, speed: 0.5 },
};
const APTITUDE_THRESHOLDS = [55, 70, 85, 100];

export function aptitude(id: number, position: Position): number {
  const stats = getSpecies(id).stats;
  const score = Object.entries(POSITION_WEIGHTS[position]).reduce(
    (sum, [key, w]) => sum + stats[key as StatKey] * (w as number),
    0,
  );
  return 1 + APTITUDE_THRESHOLDS.filter((t) => score >= t).length;
}

const isIntArray = (v: unknown): v is number[] => Array.isArray(v) && v.every((n) => Number.isInteger(n));
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');

function isTeamShape(value: unknown): value is Team {
  if (!value || typeof value !== 'object') return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.name === 'string' &&
    isIntArray(t.roster) &&
    Number.isInteger(t.specialist) &&
    isIntArray(t.keepOnField) &&
    isStringArray(t.offenseDeck) &&
    isStringArray(t.defenseDeck) &&
    !!t.depth &&
    typeof t.depth === 'object' &&
    Object.values(t.depth as object).every(isIntArray)
  );
}

function validateDeck(deck: string[], side: CardSide, roster: number[]): TeamError[] {
  const errors: TeamError[] = [];
  if (deck.length !== DECK_SIZE) errors.push({ code: `DECK_SIZE_${side}`, detail: String(deck.length) });
  const copies = new Map<string, number>();
  for (const id of deck) {
    copies.set(id, (copies.get(id) ?? 0) + 1);
    const card = findCard(id);
    if (!card) {
      errors.push({ code: 'UNKNOWN_CARD', detail: id });
    } else if (card.side !== side || card.origin === 'BASIC' || card.origin === 'SPECIAL') {
      errors.push({ code: 'CARD_NOT_ALLOWED', detail: id });
    } else if (!canIncludeInDeck(card, roster)) {
      errors.push({ code: 'CARD_NOT_ELIGIBLE', detail: id });
    }
  }
  for (const [id, n] of copies) if (n > MAX_COPIES) errors.push({ code: 'DECK_COPIES', detail: id });
  return errors;
}

function validateDepth(team: Team): TeamError[] {
  const errors: TeamError[] = [];
  const roster = new Set(team.roster);
  for (const [slot, ids] of Object.entries(team.depth)) {
    for (const id of ids ?? []) if (!roster.has(id)) errors.push({ code: 'DEPTH_NOT_IN_ROSTER', detail: `${slot}:${id}` });
  }
  for (const id of team.keepOnField) if (!roster.has(id)) errors.push({ code: 'KEEP_NOT_IN_ROSTER', detail: String(id) });
  for (const [id, slots] of Object.entries(FORMATIONS)) {
    if (!fillSlots(slots, team.depth)) errors.push({ code: 'FORMATION_UNFILLABLE', detail: id });
  }
  for (const [id, slots] of Object.entries(PACKAGES)) {
    if (!fillSlots(slots, team.depth)) errors.push({ code: 'PACKAGE_UNFILLABLE', detail: id });
  }
  return errors;
}

/** Lista vazia = time válido (spec 5.5). Nunca lança exceção: o time pode vir de um código importado. */
export function validateTeam(value: unknown): TeamError[] {
  if (!isTeamShape(value)) return [{ code: 'MALFORMED_TEAM' }];
  const team = value;
  const all = [...team.roster, team.specialist];
  const unknown = all.filter((id) => !hasSpecies(id));
  if (unknown.length) return unknown.map((id) => ({ code: 'UNKNOWN_SPECIES', detail: String(id) }));

  const errors: TeamError[] = [];
  if (team.roster.length !== ROSTER_SIZE) errors.push({ code: 'ROSTER_SIZE', detail: String(team.roster.length) });
  if (new Set(all).size !== all.length) errors.push({ code: 'DUPLICATE_SPECIES' });
  if (all.filter((id) => LEGENDARY_IDS.includes(id)).length > MAX_LEGENDARIES) errors.push({ code: 'TOO_MANY_LEGENDARIES' });
  const cost = teamCost(team);
  if (cost > SALARY_CAP) errors.push({ code: 'OVER_CAP', detail: String(cost) });
  errors.push(...validateDeck(team.offenseDeck, 'OFFENSE', team.roster));
  errors.push(...validateDeck(team.defenseDeck, 'DEFENSE', team.roster));
  errors.push(...validateDepth(team));
  return errors;
}
