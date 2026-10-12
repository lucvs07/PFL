import type { CardSide, SlotId, Team } from '@pfl/engine';
import { DECK_SIZE, MAX_COPIES, ROSTER_SIZE, canIncludeInDeck, findCard, hasSpecies } from '@pfl/engine';
import { decodeTeam, encodeTeam } from '@pfl/protocol';
import { draftToTeam, type TeamDraft } from './draft';
import { ALL_SLOTS } from './depth';
import { MAX_NAME_LENGTH } from './builderState';
import { readJson, writeJson, type StorageLike } from '../lib/storage';

export const TEAMS_KEY = 'pfl:teams:v1';
export const MAX_CODE_LENGTH = 20000;
const IMPORTED_NAME = 'Time importado';

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isSpeciesId = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && hasSpecies(v);

/**
 * Converte qualquer valor (código importado, localStorage) num rascunho seguro. Descarta espécies,
 * cartas e vagas desconhecidas ANTES de qualquer getSpecies/getCard, que lançam erro. Nunca lança.
 * Devolve null se o valor nem parece um time (não é objeto ou não tem lista de elenco).
 */
export function sanitizeTeam(value: unknown): { draft: TeamDraft; dropped: number } | null {
  if (!isRecord(value) || !Array.isArray(value.roster)) return null;
  let dropped = 0;

  const roster: number[] = [];
  for (const v of value.roster) {
    if (isSpeciesId(v) && !roster.includes(v) && roster.length < ROSTER_SIZE) roster.push(v);
    else dropped++;
  }

  let specialist: number | null = null;
  if (value.specialist !== undefined && value.specialist !== null) {
    if (isSpeciesId(value.specialist) && !roster.includes(value.specialist)) specialist = value.specialist;
    else dropped++;
  }

  const depth: Team['depth'] = {};
  if (isRecord(value.depth)) {
    for (const [key, list] of Object.entries(value.depth)) {
      if (!(ALL_SLOTS as readonly string[]).includes(key) || !Array.isArray(list)) {
        dropped++;
        continue;
      }
      const ids: number[] = [];
      for (const v of list) {
        if (typeof v === 'number' && roster.includes(v) && !ids.includes(v)) ids.push(v);
        else dropped++;
      }
      depth[key as SlotId] = ids;
    }
  }

  const keepOnField: number[] = [];
  if (Array.isArray(value.keepOnField)) {
    for (const v of value.keepOnField) {
      if (typeof v === 'number' && roster.includes(v) && !keepOnField.includes(v)) keepOnField.push(v);
      else dropped++;
    }
  }

  const deck = (raw: unknown, side: CardSide): string[] => {
    const out: string[] = [];
    if (!Array.isArray(raw)) return out;
    for (const v of raw) {
      const card = typeof v === 'string' ? findCard(v) : undefined;
      const ok =
        !!card &&
        card.side === side &&
        (card.origin === 'TYPE' || card.origin === 'SIGNATURE') &&
        canIncludeInDeck(card, roster) &&
        out.length < DECK_SIZE &&
        out.filter((id) => id === card.id).length < MAX_COPIES;
      if (ok) out.push(card.id);
      else dropped++;
    }
    return out;
  };

  const name =
    typeof value.name === 'string' && value.name.trim() ? value.name.trim().slice(0, MAX_NAME_LENGTH) : IMPORTED_NAME;

  return {
    draft: {
      name,
      roster,
      specialist,
      depth,
      keepOnField,
      offenseDeck: deck(value.offenseDeck, 'OFFENSE'),
      defenseDeck: deck(value.defenseDeck, 'DEFENSE'),
    },
    dropped,
  };
}

export function loadTeams(storage: StorageLike | null): TeamDraft[] {
  const raw = readJson(storage, TEAMS_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const s = sanitizeTeam(entry);
    return s ? [s.draft] : [];
  });
}

/** false = não salvou (storage indisponível ou cheio); a interface avisa para exportar o código. */
export function saveTeams(storage: StorageLike | null, teams: readonly TeamDraft[]): boolean {
  return writeJson(storage, TEAMS_KEY, teams);
}

export type ImportResult = { ok: true; draft: TeamDraft; dropped: number } | { ok: false; message: string };

export function importTeamCode(code: string): ImportResult {
  const trimmed = code.trim();
  if (!trimmed) return { ok: false, message: 'Cole um código de time.' };
  if (trimmed.length > MAX_CODE_LENGTH) return { ok: false, message: 'Código grande demais para ser um time.' };
  let decoded: unknown = null;
  try {
    decoded = decodeTeam(trimmed);
  } catch {
    decoded = null; // o contrato diz que nunca lança; a proteção é barata
  }
  if (decoded === null || decoded === undefined) return { ok: false, message: 'Código inválido: não foi possível lê-lo.' };
  const sanitized = sanitizeTeam(decoded);
  if (!sanitized) return { ok: false, message: 'O código não contém um time.' };
  if (sanitized.draft.roster.length === 0 && sanitized.draft.specialist === null) {
    return { ok: false, message: 'O código não contém nenhum Pokémon válido.' };
  }
  return { ok: true, draft: sanitized.draft, dropped: sanitized.dropped };
}

export function exportTeamCode(d: TeamDraft): string | null {
  const team = draftToTeam(d);
  return team ? encodeTeam(team) : null;
}
