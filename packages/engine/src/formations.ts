import type { DefenseSlot, FormationId, Lineup, OffenseSlot, PackageId, Position, SlotId, Team } from './model';

// Spec, seção 5.4: QB + 3 OL fixos e 3 vagas variáveis no ataque.
export const FORMATIONS: Record<FormationId, OffenseSlot[]> = {
  PISTOL: ['QB', 'OL1', 'OL2', 'OL3', 'RB', 'WR1', 'WR2'],
  HEAVY: ['QB', 'OL1', 'OL2', 'OL3', 'RB', 'TE', 'WR1'],
  SPREAD: ['QB', 'OL1', 'OL2', 'OL3', 'WR1', 'WR2', 'WR3'],
  DOUBLE: ['QB', 'OL1', 'OL2', 'OL3', 'RB', 'FB', 'WR1'],
};

export const PACKAGES: Record<PackageId, DefenseSlot[]> = {
  BASE: ['DL1', 'DL2', 'DL3', 'LB1', 'CB1', 'CB2', 'S1'],
  HEAVY_D: ['DL1', 'DL2', 'DL3', 'LB1', 'LB2', 'CB1', 'S1'],
  NICKEL: ['DL1', 'DL2', 'LB1', 'CB1', 'CB2', 'CB3', 'S1'],
  DIME: ['DL1', 'DL2', 'CB1', 'CB2', 'CB3', 'S1', 'S2'],
};

export const OFFENSE_SLOTS: OffenseSlot[] = ['QB', 'OL1', 'OL2', 'OL3', 'RB', 'WR1', 'WR2', 'WR3', 'TE', 'FB'];
export const DEFENSE_SLOTS: DefenseSlot[] = ['DL1', 'DL2', 'DL3', 'LB1', 'LB2', 'CB1', 'CB2', 'CB3', 'S1', 'S2'];

export function slotPosition(slot: SlotId): Position {
  return slot.replace(/\d+$/, '') as Position;
}

export function slotsOf(lineup: Lineup, position: Position): SlotId[] {
  return (Object.keys(lineup) as SlotId[]).filter((s) => lineup[s] !== undefined && slotPosition(s) === position);
}

/**
 * Preenche as vagas em ordem, sem repetir Pokémon. Em cada vaga pega o primeiro candidato livre que
 * satisfaz `preferred`; se nenhum satisfizer, o primeiro livre. Devolve null se uma vaga ficar vazia.
 */
export function fillSlots(
  slots: readonly SlotId[],
  depth: Team['depth'],
  preferred: (id: number) => boolean = () => true,
): Lineup | null {
  const used = new Set<number>();
  const lineup: Lineup = {};
  for (const slot of slots) {
    const candidates = (depth[slot] ?? []).filter((id) => !used.has(id));
    const pick = candidates.find(preferred) ?? candidates[0];
    if (pick === undefined) return null;
    lineup[slot] = pick;
    used.add(pick);
  }
  return lineup;
}
