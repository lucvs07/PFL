import type { Position, SlotId, StatKey, Team } from '@pfl/engine';
import { DEFENSE_SLOTS, OFFENSE_SLOTS, POSITION_WEIGHTS, getSpecies, slotPosition } from '@pfl/engine';

export const ALL_SLOTS: readonly SlotId[] = [...OFFENSE_SLOTS, ...DEFENSE_SLOTS];

/**
 * Candidatos por vaga no depth automático. Uma formação/pacote tem 7 vagas, então, ao preencher a k-ésima,
 * no máximo 6 Pokémon já foram usados: com 7 candidatos distintos sempre sobra um (fillSlots nunca falha).
 */
export const AUTO_DEPTH_SIZE = 7;

export interface DepthState {
  depth: Team['depth'];
  keepOnField: number[];
}

export type DepthAction =
  | { type: 'DEPTH_ADD'; slot: SlotId; id: number }
  | { type: 'DEPTH_REMOVE'; slot: SlotId; id: number }
  | { type: 'DEPTH_MOVE'; slot: SlotId; id: number; dir: -1 | 1 }
  | { type: 'TOGGLE_KEEP'; id: number }
  | { type: 'AUTO_DEPTH' };

/** Mesma soma ponderada da aptidão do engine, sem arredondar em estrelas (desempata melhor). */
export function positionScore(id: number, position: Position): number {
  const stats = getSpecies(id).stats;
  return Object.entries(POSITION_WEIGHTS[position]).reduce(
    (sum, [key, weight]) => sum + stats[key as StatKey] * (weight as number),
    0,
  );
}

export function rankForPosition(roster: readonly number[], position: Position): number[] {
  return [...roster].sort((a, b) => positionScore(b, position) - positionScore(a, position) || a - b);
}

export function autoDepth(roster: readonly number[]): Team['depth'] {
  const depth: Team['depth'] = {};
  for (const slot of ALL_SLOTS) depth[slot] = rankForPosition(roster, slotPosition(slot)).slice(0, AUTO_DEPTH_SIZE);
  return depth;
}

function setSlot(depth: Team['depth'], slot: SlotId, ids: number[]): Team['depth'] {
  const next: Team['depth'] = { ...depth };
  next[slot] = ids;
  return next;
}

export function applyDepthAction(state: DepthState, roster: readonly number[], action: DepthAction): DepthState {
  switch (action.type) {
    case 'DEPTH_ADD': {
      const list = state.depth[action.slot] ?? [];
      if (!roster.includes(action.id) || list.includes(action.id)) return state;
      return { ...state, depth: setSlot(state.depth, action.slot, [...list, action.id]) };
    }
    case 'DEPTH_REMOVE': {
      const list = state.depth[action.slot] ?? [];
      if (!list.includes(action.id)) return state;
      return { ...state, depth: setSlot(state.depth, action.slot, list.filter((id) => id !== action.id)) };
    }
    case 'DEPTH_MOVE': {
      const list = [...(state.depth[action.slot] ?? [])];
      const from = list.indexOf(action.id);
      const to = from + action.dir;
      if (from < 0 || to < 0 || to >= list.length) return state;
      [list[from], list[to]] = [list[to], list[from]];
      return { ...state, depth: setSlot(state.depth, action.slot, list) };
    }
    case 'TOGGLE_KEEP': {
      if (!roster.includes(action.id)) return state;
      const keep = state.keepOnField.includes(action.id)
        ? state.keepOnField.filter((id) => id !== action.id)
        : [...state.keepOnField, action.id];
      return { ...state, keepOnField: keep };
    }
    case 'AUTO_DEPTH':
      return { ...state, depth: autoDepth(roster) };
  }
}

/** Remove do depth chart e do "manter em campo" quem não está mais no elenco. */
export function pruneDepth(state: DepthState, roster: readonly number[]): DepthState {
  const depth: Team['depth'] = {};
  for (const [slot, ids] of Object.entries(state.depth) as [SlotId, number[] | undefined][]) {
    depth[slot] = (ids ?? []).filter((id) => roster.includes(id));
  }
  return { depth, keepOnField: state.keepOnField.filter((id) => roster.includes(id)) };
}
