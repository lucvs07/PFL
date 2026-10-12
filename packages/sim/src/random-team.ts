import {
  ALL_SPECIES, CARDS, DECK_SIZE, DEFENSE_SLOTS, FORMATIONS, LEGENDARY_IDS, MAX_COPIES, OFFENSE_SLOTS, PACKAGES,
  POSITION_WEIGHTS, ROSTER_SIZE, SALARY_CAP, canIncludeInDeck, canPlay, getSpecies, initialFatigue, pickLineup,
  slotPosition, speciesCost, type Card, type CardSide, type Lineup, type SlotId, type StatKey, type Team,
} from '@pfl/engine';
import { weightedPick } from './pick';

export const RANDOM_TEAM_MAX_ATTEMPTS = 50;
const BACKUPS_PER_SLOT = 2;
const SPECIALIST_MAX_COST = 5;
/** penalidade na nota (pontos de stat) por vaga em que o Pokémon já é reserva, para espalhar a rotação */
const BACKUP_SPREAD = 15;

function positionScore(id: number, slot: SlotId): number {
  const stats = getSpecies(id).stats;
  return Object.entries(POSITION_WEIGHTS[slotPosition(slot)]).reduce((s, [k, w]) => s + stats[k as StatKey] * (w as number), 0);
}

/** 17 espécies distintas, no máximo 1 lendário, custo total ≤ teto, gastando perto do teto. */
function pickSpecies(rng: number): { ids: number[]; rng: number } {
  const ids: number[] = [];
  let budget = SALARY_CAP;
  let legendary = false;
  const total = ROSTER_SIZE + 1;
  while (ids.length < total) {
    const remainingAfter = total - ids.length - 1;
    const unused = ALL_SPECIES.filter((s) => !ids.includes(s.id) && !(legendary && LEGENDARY_IDS.includes(s.id)));
    const cheapest = unused.map((s) => speciesCost(s.id)).sort((a, b) => a - b);
    const target = budget / (total - ids.length);
    const prefix = cheapest.slice(0, remainingAfter + 1);
    const prefixSum = prefix.reduce((a, b) => a + b, 0);
    // custo mínimo para completar as vagas restantes sem contar a própria espécie
    const reserve = (cost: number): number =>
      remainingAfter === 0 ? 0 : cost <= prefix[remainingAfter - 1] ? prefixSum - cost : prefixSum - prefix[remainingAfter];
    const feasible = unused.filter((s) => speciesCost(s.id) + reserve(speciesCost(s.id)) <= budget);
    const r = weightedPick(feasible, feasible.map((s) => 1 / (1 + Math.abs(speciesCost(s.id) - target))), rng);
    rng = r.rng;
    ids.push(r.item.id);
    budget -= speciesCost(r.item.id);
    if (LEGENDARY_IDS.includes(r.item.id)) legendary = true;
  }
  return { ids, rng };
}

/** Titulares distintos por lado (pela nota da posição) e 2 reservas por vaga, priorizando quem não é titular. */
export function buildDepth(roster: readonly number[]): Team['depth'] {
  const depth: Team['depth'] = {};
  for (const side of [OFFENSE_SLOTS, DEFENSE_SLOTS] as SlotId[][]) {
    const starters = new Map<SlotId, number>();
    const used = new Set<number>();
    for (const slot of side) {
      const best = roster.filter((id) => !used.has(id)).sort((a, b) => positionScore(b, slot) - positionScore(a, slot))[0];
      starters.set(slot, best);
      used.add(best);
    }
    const backupUses = new Map<number, number>();
    for (const slot of side) {
      const starter = starters.get(slot) as number;
      // reservas: primeiro quem não é titular deste lado; quem já é reserva de outra vaga perde prioridade
      const key = (id: number): number => positionScore(id, slot) - BACKUP_SPREAD * (backupUses.get(id) ?? 0);
      const backups = roster
        .filter((id) => id !== starter)
        .sort((a, b) => Number(used.has(a)) - Number(used.has(b)) || key(b) - key(a))
        .slice(0, BACKUPS_PER_SLOT);
      for (const id of backups) backupUses.set(id, (backupUses.get(id) ?? 0) + 1);
      depth[slot] = [starter, ...backups];
    }
  }
  return depth;
}

/** Cartas elegíveis para o elenco e jogáveis com os titulares em ao menos uma formação/pacote. */
export function usableCards(team: Pick<Team, 'roster' | 'depth' | 'keepOnField'> & Partial<Team>, side: CardSide): Card[] {
  const shell = { name: '', specialist: 0, offenseDeck: [], defenseDeck: [], ...team } as Team;
  const lineups: Lineup[] = Object.values(side === 'OFFENSE' ? FORMATIONS : PACKAGES).map((slots) =>
    pickLineup(slots, shell, initialFatigue()),
  );
  return CARDS.filter(
    (c) =>
      c.side === side &&
      (c.origin === 'TYPE' || c.origin === 'SIGNATURE') &&
      canIncludeInDeck(c, team.roster) &&
      lineups.some((l) => canPlay(c, l)),
  );
}

function pickDeck(cards: Card[], rng: number): { deck: string[]; rng: number } | null {
  const distinct = DECK_SIZE / MAX_COPIES;
  if (cards.length < distinct) return null;
  const pool = [...cards];
  const chosen: string[] = [];
  for (let i = 0; i < distinct; i++) {
    const r = weightedPick(pool, pool.map(() => 1), rng);
    rng = r.rng;
    chosen.push(r.item.id, r.item.id);
    pool.splice(pool.indexOf(r.item), 1);
  }
  return { deck: chosen, rng };
}

/**
 * Time aleatório válido (validateTeam === []). Tenta até `maxAttempts` elencos;
 * se nenhum liberar 6 cartas distintas jogáveis de cada lado, lança erro (nunca entra em loop infinito).
 */
export function randomTeam(
  rng: number,
  name = 'Aleatório',
  maxAttempts = RANDOM_TEAM_MAX_ATTEMPTS,
): { team: Team; rng: number } {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const picked = pickSpecies(rng);
    rng = picked.rng;
    const all = picked.ids;
    // especialista: o melhor Sp. Atk entre os baratos (custo ≤ 5); sem nenhum barato, o mais barato
    const cheap = all.filter((id) => speciesCost(id) <= SPECIALIST_MAX_COST);
    const specialist = cheap.length
      ? [...cheap].sort((a, b) => getSpecies(b).stats.spAttack - getSpecies(a).stats.spAttack)[0]
      : [...all].sort((a, b) => speciesCost(a) - speciesCost(b))[0];
    const roster = all.filter((id) => id !== specialist);
    const depth = buildDepth(roster);
    const off = pickDeck(usableCards({ roster, depth, keepOnField: [] }, 'OFFENSE'), rng);
    if (!off) continue;
    rng = off.rng;
    const def = pickDeck(usableCards({ roster, depth, keepOnField: [] }, 'DEFENSE'), rng);
    if (!def) continue;
    rng = def.rng;
    return { team: { name, roster, specialist, depth, keepOnField: [], offenseDeck: off.deck, defenseDeck: def.deck }, rng };
  }
  throw new Error(`randomTeam: nenhum elenco válido em ${maxAttempts} tentativas`);
}
