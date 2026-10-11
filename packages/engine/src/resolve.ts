import type { Card, DefenseCategory, Lineup, OffenseCategory, PlayKind, PlayOutcome, PokemonType, Position, ReadResult, StatKey } from './model';
import { getSpecies } from './species';
import { slotsOf } from './formations';
import { effectiveness, typeModifier } from './typechart';
import { fatigueMultiplier } from './fatigue';
import { rngNext } from './rng';
import { OFFENSE_PROFILES, readResult } from './cards/categories';
import { matchesRequirement } from './cards/eligibility';

type Weights = Partial<Record<StatKey, number>>;
interface ActorSpec {
  position: Position;
  weights: Weights;
}
interface Matchup {
  protection: boolean;
  off: ActorSpec[];
  def: ActorSpec[];
}

/** Se a posição não está em campo, tenta a próxima da lista. */
export const FALLBACK: Record<Position, Position[]> = {
  QB: ['QB'],
  OL: ['OL'],
  RB: ['RB', 'FB', 'WR', 'QB'],
  WR: ['WR', 'TE', 'RB', 'FB'],
  TE: ['TE', 'WR', 'FB', 'RB'],
  FB: ['FB', 'RB', 'TE', 'WR'],
  DL: ['DL', 'LB'],
  LB: ['LB', 'S', 'CB'],
  CB: ['CB', 'S', 'LB'],
  S: ['S', 'CB', 'LB'],
};

/** Linhas (OL/DL) entram como grupo: a média de todas as vagas da posição. */
const GROUP_POSITIONS: Position[] = ['OL', 'DL'];

const PROTECTION_OFF: ActorSpec = { position: 'OL', weights: { defense: 1 } };
const PROTECTION_DEF: ActorSpec = { position: 'DL', weights: { attack: 1 } };

// Spec 4.2: quais atributos se enfrentam em cada categoria.
export const MATCHUPS: Record<OffenseCategory, Matchup> = {
  RUN_INSIDE: {
    protection: false,
    off: [{ position: 'RB', weights: { attack: 0.5, speed: 0.5 } }, { position: 'OL', weights: { attack: 1 } }],
    def: [{ position: 'DL', weights: { defense: 1 } }, { position: 'LB', weights: { attack: 1 } }],
  },
  RUN_OUTSIDE: {
    protection: false,
    off: [{ position: 'RB', weights: { speed: 1 } }, { position: 'WR', weights: { attack: 1 } }],
    def: [{ position: 'CB', weights: { speed: 1 } }, { position: 'LB', weights: { speed: 1 } }],
  },
  SHORT_PASS: {
    protection: true,
    off: [{ position: 'QB', weights: { spAttack: 1 } }, { position: 'WR', weights: { speed: 0.6, attack: 0.4 } }],
    def: [{ position: 'CB', weights: { speed: 0.6, spDefense: 0.4 } }, { position: 'LB', weights: { spDefense: 1 } }],
  },
  DEEP_PASS: {
    protection: true,
    off: [{ position: 'QB', weights: { spAttack: 1 } }, { position: 'WR', weights: { speed: 1 } }],
    def: [{ position: 'CB', weights: { speed: 1 } }, { position: 'S', weights: { spDefense: 1 } }],
  },
  SCREEN: {
    protection: false,
    off: [{ position: 'RB', weights: { speed: 0.5, attack: 0.5 } }, { position: 'OL', weights: { attack: 1 } }],
    def: [{ position: 'LB', weights: { speed: 1 } }, { position: 'CB', weights: { attack: 1 } }],
  },
  PLAY_ACTION: {
    protection: true,
    off: [{ position: 'QB', weights: { spAttack: 1 } }, { position: 'WR', weights: { speed: 1 } }],
    def: [{ position: 'S', weights: { spDefense: 1 } }, { position: 'LB', weights: { spDefense: 1 } }],
  },
};

// Spec 4.3
const READ_YARDS: Record<ReadResult, number> = { WRONG: 1.6, NEUTRAL: 1, RIGHT: 0.4 };
const READ_INCOMPLETION: Record<ReadResult, number> = { WRONG: 0.5, NEUTRAL: 1, RIGHT: 1.5 };
const READ_BIG_PLAY: Record<ReadResult, number> = { WRONG: 2, NEUTRAL: 1, RIGHT: 0.25 };
const STUFF_PENALTY = 2;
const AFFINITY_BONUS = 0.1;

export interface PlayInput {
  offCard: Card;
  defCard: Card;
  offLineup: Lineup;
  defLineup: Lineup;
  offFatigue: Record<number, number>;
  defFatigue: Record<number, number>;
  rng: number;
}

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const unique = (xs: number[]): number[] => [...new Set(xs)];

function pickActors(lineup: Lineup, position: Position, taken: Set<number>, prefer: (id: number) => boolean): number[] {
  for (const pos of FALLBACK[position]) {
    const ids = slotsOf(lineup, pos)
      .map((slot) => lineup[slot] as number)
      .filter((id) => !taken.has(id));
    if (ids.length === 0) continue;
    if (GROUP_POSITIONS.includes(pos)) return ids;
    return [ids.find(prefer) ?? ids[0]];
  }
  return [];
}

function weighted(id: number, weights: Weights, level: number): number {
  const stats = getSpecies(id).stats;
  let sum = 0;
  for (const [key, w] of Object.entries(weights) as [StatKey, number][]) sum += stats[key] * w;
  return sum * fatigueMultiplier(id, level);
}

function scoreSide(
  lineup: Lineup,
  specs: ActorSpec[],
  fatigue: Record<number, number>,
  prefer: (id: number) => boolean,
): { score: number; actors: number[] } {
  const taken = new Set<number>();
  const parts: number[] = [];
  for (const spec of specs) {
    const ids = pickActors(lineup, spec.position, taken, prefer);
    if (ids.length === 0) continue;
    ids.forEach((id) => taken.add(id));
    parts.push(mean(ids.map((id) => weighted(id, spec.weights, fatigue[id] ?? 0))));
  }
  return { score: parts.length ? mean(parts) : 1, actors: [...taken] };
}

/** 1 + média dos modificadores de tipo contra os atores adversários + afinidade dos próprios atores. */
function typeMult(element: PokemonType | null, opposing: number[], own: number[]): number {
  if (!element || opposing.length === 0) return 1;
  const mods = opposing.map((id) => typeModifier(effectiveness(element, getSpecies(id).types)));
  const affinity = own.filter((id) => getSpecies(id).types.includes(element)).length * AFFINITY_BONUS;
  return 1 + mean(mods) + affinity;
}

export function resolvePlay(input: PlayInput): { outcome: PlayOutcome; rng: number } {
  const category = input.offCard.category as OffenseCategory;
  const matchup = MATCHUPS[category];
  const profile = OFFENSE_PROFILES[category];
  const read = readResult(input.defCard.category as DefenseCategory, category);

  // Sempre 5 sorteios, na mesma ordem, para manter o determinismo: sack, turnover, incompleto, big play, variância.
  let rng = input.rng;
  const u: number[] = [];
  for (let i = 0; i < 5; i++) {
    const r = rngNext(rng);
    u.push(r.value);
    rng = r.state;
  }

  const preferOff = (id: number) => input.offCard.requirements.some((r) => matchesRequirement(getSpecies(id), r));
  const preferDef = (id: number) => input.defCard.requirements.some((r) => matchesRequirement(getSpecies(id), r));
  const off = scoreSide(input.offLineup, matchup.off, input.offFatigue, preferOff);
  const def = scoreSide(input.defLineup, matchup.def, input.defFatigue, preferDef);

  const statFactor = clamp(off.score / def.score, 0.6, 1.4);
  const offTypeMult = typeMult(input.offCard.element, def.actors, off.actors);
  const defTypeMult = typeMult(input.defCard.element, off.actors, def.actors);
  const edge = (statFactor * offTypeMult) / defTypeMult;
  const riskMult = read === 'RIGHT' ? 2 : 1;
  const base = input.offCard.baseYards ?? profile.baseYards;
  const variance = 1 + profile.variance * (u[4] * 2 - 1);

  let offActors = off.actors;
  let defActors = def.actors;
  const make = (kind: PlayKind, yards: number, bigPlay = false): PlayOutcome =>
    ({ kind, yards, bigPlay, read, offActors, defActors, offTypeMult, defTypeMult });

  if (matchup.protection) {
    const ol = scoreSide(input.offLineup, [PROTECTION_OFF], input.offFatigue, preferOff);
    const dl = scoreSide(input.defLineup, [PROTECTION_DEF], input.defFatigue, preferDef);
    offActors = unique([...offActors, ...ol.actors]);
    defActors = unique([...defActors, ...dl.actors]);
    const pressure = clamp(dl.score / ol.score, 0.5, 2);
    if (u[0] < profile.risk.sack * riskMult * pressure) {
      return { outcome: make('SACK', -(4 + Math.floor(u[4] * 5))), rng };
    }
  }

  const isPass = matchup.protection || category === 'SCREEN';
  const rawYards = Math.round(base * READ_YARDS[read] * edge * variance) - (read === 'RIGHT' ? STUFF_PENALTY : 0);

  const turnoverRisk = ((isPass ? profile.risk.interception : profile.risk.fumble) * riskMult) / edge;
  if (u[1] < turnoverRisk) {
    return { outcome: isPass ? make('INTERCEPTION', base) : make('FUMBLE', Math.max(0, rawYards)), rng };
  }
  if (isPass && u[2] < clamp((profile.risk.incompletion * READ_INCOMPLETION[read]) / edge, 0, 0.9)) {
    return { outcome: make('INCOMPLETE', 0), rng };
  }
  if (u[3] < profile.risk.bigPlay * READ_BIG_PLAY[read] * edge) {
    return { outcome: make('GAIN', rawYards * 2 + 10, true), rng };
  }
  return { outcome: make('GAIN', rawYards), rng };
}
