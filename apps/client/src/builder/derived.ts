import type { Card, CardSide, FormationId, PackageId, PokemonType, Position, Species, TeamError } from '@pfl/engine';
import {
  ALL_SPECIES, CARDS, SALARY_CAP, aptitude, canIncludeInDeck, findCard, speciesCost, validateTeam,
} from '@pfl/engine';
import { draftToTeam, type TeamDraft } from './draft';
import { FORMATION_LABELS, PACKAGE_LABELS, displayName } from '../lib/names';

export function draftCost(d: TeamDraft): number {
  const ids = d.specialist === null ? d.roster : [...d.roster, d.specialist];
  return ids.reduce((sum, id) => sum + speciesCost(id), 0);
}

export interface CapInfo {
  cost: number;
  cap: number;
  remaining: number;
  over: boolean;
  /** 0..1 para a barra */
  ratio: number;
}

export function capInfo(d: TeamDraft): CapInfo {
  const cost = draftCost(d);
  return { cost, cap: SALARY_CAP, remaining: SALARY_CAP - cost, over: cost > SALARY_CAP, ratio: Math.min(1, cost / SALARY_CAP) };
}

const ORIGIN_ORDER: Record<Card['origin'], number> = { SIGNATURE: 0, TYPE: 1, BASIC: 2, SPECIAL: 3 };
const isDeckOrigin = (c: Card) => c.origin === 'TYPE' || c.origin === 'SIGNATURE';

/** Cartas que o elenco libera para o deck (spec 3.4); assinaturas primeiro. */
export function eligibleCards(roster: readonly number[], side: CardSide): Card[] {
  if (roster.length === 0) return [];
  return CARDS.filter((c) => c.side === side && isDeckOrigin(c) && canIncludeInDeck(c, roster)).sort(
    (a, b) => ORIGIN_ORDER[a.origin] - ORIGIN_ORDER[b.origin] || a.name.localeCompare(b.name, 'pt-BR'),
  );
}

/** Quantas cartas de deck existem no catálogo para o lado (para mostrar "X bloqueadas"). */
export function deckCardTotal(side: CardSide): number {
  return CARDS.filter((c) => c.side === side && isDeckOrigin(c)).length;
}

export function copiesIn(deck: readonly string[], cardId: string): number {
  return deck.filter((id) => id === cardId).length;
}

export interface PokedexFilter {
  search: string;
  type: PokemonType | 'ALL';
  maxCost: number | null;
  position: Position | 'ALL';
  minAptitude: number;
}

export const DEFAULT_FILTER: PokedexFilter = { search: '', type: 'ALL', maxCost: null, position: 'ALL', minAptitude: 1 };

export function filterPokedex(f: PokedexFilter): Species[] {
  const q = f.search.trim().toLowerCase();
  return ALL_SPECIES.filter(
    (s) =>
      (!q || String(s.id) === q || s.name.includes(q) || displayName(s.name).toLowerCase().includes(q)) &&
      (f.type === 'ALL' || s.types.includes(f.type)) &&
      (f.maxCost === null || speciesCost(s.id) <= f.maxCost) &&
      (f.position === 'ALL' || aptitude(s.id, f.position) >= f.minAptitude),
  );
}

/** Erros locais (os mesmos do servidor, que revalida). Lista vazia = válido. */
export function draftErrors(d: TeamDraft): TeamError[] {
  const team = draftToTeam(d);
  if (!team) return [{ code: 'NO_SPECIALIST' }];
  return validateTeam(team);
}

const cardName = (id: string | undefined): string => (id ? findCard(id)?.name ?? id : '?');

export function teamErrorMessage(e: TeamError): string {
  const d = e.detail ?? '';
  switch (e.code) {
    case 'NO_SPECIALIST': return 'Escolha um especialista (kicker/punter).';
    case 'MALFORMED_TEAM': return 'O time está malformado.';
    case 'UNKNOWN_SPECIES': return `Pokémon desconhecido: ${d}.`;
    case 'ROSTER_SIZE': return `O elenco precisa de 16 Pokémon de linha (tem ${d}).`;
    case 'DUPLICATE_SPECIES': return 'Cada espécie só pode aparecer uma vez no time.';
    case 'TOO_MANY_LEGENDARIES': return 'No máximo 1 lendário por time.';
    case 'OVER_CAP': return `Custo ${d} acima do teto de ${SALARY_CAP}.`;
    case 'DECK_SIZE_OFFENSE': return `O deck de ataque precisa de 12 cartas (tem ${d}).`;
    case 'DECK_SIZE_DEFENSE': return `O deck de defesa precisa de 12 cartas (tem ${d}).`;
    case 'DECK_COPIES': return `No máximo 2 cópias de ${cardName(e.detail)}.`;
    case 'UNKNOWN_CARD': return `Carta desconhecida: ${d}.`;
    case 'CARD_NOT_ALLOWED': return `${cardName(e.detail)} não pode entrar neste deck.`;
    case 'CARD_NOT_ELIGIBLE': return `O elenco não libera a carta ${cardName(e.detail)}.`;
    case 'DEPTH_NOT_IN_ROSTER': return `Depth chart com Pokémon fora do elenco (${d}).`;
    case 'KEEP_NOT_IN_ROSTER': return `"Manter em campo" com Pokémon fora do elenco (${d}).`;
    case 'FORMATION_UNFILLABLE':
      return `O depth chart não preenche a formação ${FORMATION_LABELS[d as FormationId] ?? d}.`;
    case 'PACKAGE_UNFILLABLE':
      return `O depth chart não preenche o pacote ${PACKAGE_LABELS[d as PackageId] ?? d}.`;
    default:
      return e.detail ? `${e.code}: ${e.detail}` : e.code;
  }
}
