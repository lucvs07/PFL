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

type Chooser = (candidates: number[]) => number | undefined;
const first: Chooser = (candidates) => candidates[0];

/**
 * Preenche as vagas em ordem, sem repetir Pokémon. Em cada vaga pega o primeiro candidato livre que
 * satisfaz `preferred`; se nenhum satisfizer, usa `fallback` (padrão: o primeiro livre). Se essa escolha
 * gulosa deixar uma vaga vazia, tenta a ordem simples do depth chart e, por fim, um emparelhamento
 * completo. Devolve null só se nenhuma escalação for possível.
 */
export function fillSlots(
  slots: readonly SlotId[],
  depth: Team['depth'],
  preferred: (id: number) => boolean = () => true,
  fallback: Chooser = first,
): Lineup | null {
  return greedyFill(slots, depth, preferred, fallback) ?? greedyFill(slots, depth, () => true, first) ?? matchSlots(slots, depth);
}

function greedyFill(slots: readonly SlotId[], depth: Team['depth'], preferred: (id: number) => boolean, fallback: Chooser): Lineup | null {
  const used = new Set<number>();
  const lineup: Lineup = {};
  for (const slot of slots) {
    const candidates = (depth[slot] ?? []).filter((id) => !used.has(id));
    const pick = candidates.find(preferred) ?? fallback(candidates);
    if (pick === undefined) return null;
    lineup[slot] = pick;
    used.add(pick);
  }
  return lineup;
}

/** Emparelhamento vagas × Pokémon por caminhos aumentantes (Kuhn): acha uma escalação sempre que existir. */
function matchSlots(slots: readonly SlotId[], depth: Team['depth']): Lineup | null {
  const owner = new Map<number, SlotId>();
  const assign = (slot: SlotId, seen: Set<number>): boolean => {
    for (const id of depth[slot] ?? []) {
      if (seen.has(id)) continue;
      seen.add(id);
      const current = owner.get(id);
      if (current === undefined || assign(current, seen)) {
        owner.set(id, slot);
        return true;
      }
    }
    return false;
  };
  for (const slot of slots) if (!assign(slot, new Set())) return null;
  const bySlot = new Map([...owner].map(([id, slot]) => [slot, id]));
  const lineup: Lineup = {};
  for (const slot of slots) lineup[slot] = bySlot.get(slot);
  return lineup;
}
