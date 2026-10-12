import type { Card, DefenseCategory, OffenseCategory, ReadResult, Requirement } from '@pfl/engine';
import { OFFENSE_PROFILES, READ_MATRIX, getSpecies } from '@pfl/engine';
import { CATEGORY_LABELS, ORIGIN_LABELS, TYPE_LABELS, displayName } from '../lib/names';

export interface CardInfo {
  name: string;
  category: string;
  element: string | null;
  origin: string;
  requirements: string[];
  profile: string[];
  reads: string[];
}

export function requirementText(req: Requirement): string {
  const count = (req.count ?? 1) > 1 ? `${req.count} ` : '';
  const types = req.types?.length ? ` ${req.types.map((t) => TYPE_LABELS[t]).join('/')}` : '';
  const species = req.species?.length ? `: ${req.species.map((id) => displayName(getSpecies(id).name)).join('/')}` : '';
  return `${count}${req.position}${types}${species}`;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
type ReadableDefense = keyof typeof READ_MATRIX;
const DEFENSES = Object.keys(READ_MATRIX) as ReadableDefense[];
const OFFENSES = Object.keys(OFFENSE_PROFILES) as OffenseCategory[];
const labels = (cats: string[]) => (cats.length ? cats.map((c) => CATEGORY_LABELS[c as OffenseCategory]).join(', ') : 'nenhuma');

function offenseReads(category: OffenseCategory): string[] {
  const by = (r: ReadResult) => DEFENSES.filter((d) => READ_MATRIX[d][category] === r);
  return [`Defesas que acertam (✔): ${labels(by('RIGHT'))}`, `Defesas que erram (✖): ${labels(by('WRONG'))}`];
}

function defenseReads(category: DefenseCategory): string[] {
  if (category === 'BASE_D') return ['Leitura sempre neutra'];
  const row = READ_MATRIX[category];
  const by = (r: ReadResult) => OFFENSES.filter((o) => row[o] === r);
  return [`Acerta (✔): ${labels(by('RIGHT'))}`, `Erra (✖): ${labels(by('WRONG'))}`];
}

function offenseProfile(card: Card, category: OffenseCategory): string[] {
  const p = OFFENSE_PROFILES[category];
  const risks: [string, number][] = [
    ['Sack', p.risk.sack],
    ['Interceptação', p.risk.interception],
    ['Fumble', p.risk.fumble],
    ['Incompleto', p.risk.incompletion],
    ['Big play', p.risk.bigPlay],
  ];
  return [
    `Jardas base: ${card.baseYards ?? p.baseYards}`,
    ...risks.filter(([, v]) => v > 0).map(([name, v]) => `${name} ${pct(v)}`),
  ];
}

/** Texto do tooltip: requisitos, perfil da categoria e leitura (spec 6.2). */
export function cardInfo(card: Card): CardInfo {
  let profile: string[] = [];
  let reads: string[] = [];
  if (card.category === 'PUNT') {
    profile = ['Chute do especialista (Sp. Atk + Attack)'];
  } else if (card.category === 'FIELD_GOAL') {
    profile = ['Chute do especialista (Sp. Atk); cai com a distância'];
  } else if (card.side === 'OFFENSE') {
    const category = card.category as OffenseCategory;
    profile = offenseProfile(card, category);
    reads = offenseReads(category);
  } else {
    reads = defenseReads(card.category as DefenseCategory);
  }
  return {
    name: card.name,
    category: CATEGORY_LABELS[card.category],
    element: card.element ? TYPE_LABELS[card.element] : null,
    origin: ORIGIN_LABELS[card.origin],
    requirements: card.requirements.map(requirementText),
    profile,
    reads,
  };
}
