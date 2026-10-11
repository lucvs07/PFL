import type { Lineup, SlotId, Team } from '@pfl/engine';
import { fillSlots, threshold } from '@pfl/engine';

/**
 * Prévia de quem entra em campo (spec 6.2: "lista de quem entra"). O cliente não conhece a lista de
 * descanso do servidor; aproxima pelo limiar de fadiga. Quem decide a escalação real é o servidor.
 */
export function previewLineup(slots: readonly SlotId[], team: Team, levels: Record<number, number>): Lineup | null {
  return fillSlots(slots, team.depth, (id) => team.keepOnField.includes(id) || (levels[id] ?? 0) < threshold(id));
}
