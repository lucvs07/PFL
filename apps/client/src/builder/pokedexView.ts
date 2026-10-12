import type { Species } from '@pfl/engine';
import { ROSTER_SIZE } from '@pfl/engine';
import type { TeamDraft } from './draft';

/** Onde a espécie já está no rascunho: elenco, especialista (kicker) ou em lugar nenhum. */
export type PickState = 'ROSTER' | 'SPECIALIST' | null;

/** Número da Pokédex com três dígitos ("#025"). */
export function dexNumber(id: number): string {
  return `#${String(id).padStart(3, '0')}`;
}

/** As vagas do elenco em ordem, completadas com null até ROSTER_SIZE (vagas vazias da fileira). */
export function rosterSlots(roster: readonly number[]): (number | null)[] {
  const slots: (number | null)[] = [...roster];
  while (slots.length < ROSTER_SIZE) slots.push(null);
  return slots;
}

/**
 * Espécie do painel de detalhe: a selecionada, se ainda está na lista filtrada;
 * senão a primeira da lista; lista vazia → null.
 */
export function detailSpecies(list: readonly Species[], selectedId: number | null): Species | null {
  return list.find((s) => s.id === selectedId) ?? list[0] ?? null;
}

export function pickState(draft: TeamDraft, id: number): PickState {
  if (draft.specialist === id) return 'SPECIALIST';
  if (draft.roster.includes(id)) return 'ROSTER';
  return null;
}

/** Mesmas regras dos botões da Pokédex: "+ Elenco" e "Kicker". */
export function speciesActions(draft: TeamDraft, id: number): { canAdd: boolean; canSpecialist: boolean } {
  const state = pickState(draft, id);
  const full = draft.roster.length >= ROSTER_SIZE;
  return { canAdd: state === null && !full, canSpecialist: state !== 'SPECIALIST' };
}
