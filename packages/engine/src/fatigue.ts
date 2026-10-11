import type { FatigueState, Lineup, SlotId, Team } from './model';
import { getSpecies } from './species';
import { fillSlots, slotPosition } from './formations';

// Spec 3.6. Parâmetros calibráveis pelo simulador (Plano 2).
export const FATIGUE = {
  gain: 1,
  gainQbOl: 0.5,
  baseThreshold: 2,
  highHpThreshold: 3,
  highHp: 100,
  recoverPerPlayOff: 1,
  recoverBetweenDrives: 2,
  penaltyPerLevel: 0.1,
  minMultiplier: 0.5,
};

export function threshold(id: number): number {
  return getSpecies(id).stats.hp >= FATIGUE.highHp ? FATIGUE.highHpThreshold : FATIGUE.baseThreshold;
}

export function fatigueMultiplier(id: number, level: number): number {
  const over = Math.max(0, Math.floor(level) - threshold(id));
  return Math.max(FATIGUE.minMultiplier, 1 - over * FATIGUE.penaltyPerLevel);
}

export function initialFatigue(): FatigueState {
  return { levels: {}, resting: [] };
}

/** Prefere quem não está descansando; se a vaga não tiver alternativa, escala um cansado. */
export function pickLineup(slots: readonly SlotId[], team: Team, fatigue: FatigueState): Lineup {
  const resting = new Set(fatigue.resting);
  const lineup = fillSlots(slots, team.depth, (id) => !resting.has(id)) ?? fillSlots(slots, team.depth);
  if (!lineup) throw new Error(`Depth chart não preenche ${slots.join(',')}`);
  return lineup;
}

function updateResting(team: Team, levels: Record<number, number>, resting: readonly number[]): number[] {
  const set = new Set(resting);
  for (const id of team.roster) {
    const level = levels[id] ?? 0;
    if (level <= 0) set.delete(id);
    else if (level >= threshold(id) && !team.keepOnField.includes(id)) set.add(id);
  }
  return team.roster.filter((id) => set.has(id));
}

export function applyPlayFatigue(
  state: FatigueState,
  team: Team,
  lineup: Lineup,
  actors: readonly number[],
): FatigueState {
  const levels = { ...state.levels };
  const slotOf = new Map<number, SlotId>();
  for (const [slot, id] of Object.entries(lineup) as [SlotId, number][]) slotOf.set(id, slot);

  for (const id of team.roster) {
    if (!slotOf.has(id)) levels[id] = Math.max(0, (levels[id] ?? 0) - FATIGUE.recoverPerPlayOff);
  }
  for (const id of actors) {
    const slot = slotOf.get(id);
    if (!slot) continue;
    const position = slotPosition(slot);
    levels[id] = (levels[id] ?? 0) + (position === 'QB' || position === 'OL' ? FATIGUE.gainQbOl : FATIGUE.gain);
  }
  return { levels, resting: updateResting(team, levels, state.resting) };
}

export function recoverBetweenDrives(state: FatigueState, team: Team): FatigueState {
  const levels: Record<number, number> = {};
  for (const [id, level] of Object.entries(state.levels)) {
    levels[Number(id)] = Math.max(0, level - FATIGUE.recoverBetweenDrives);
  }
  return { levels, resting: updateResting(team, levels, state.resting) };
}
