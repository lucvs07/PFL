import { getCard, type PlayOutcome, type ReadResult, type TeamKey } from '@pfl/engine';
import type { MatchRecord } from './runner';

export interface WinStat {
  games: number;
  wins: number;
  winRate: number;
}

export interface ReadStat {
  plays: number;
  /** média de jardas (GAIN/SACK; INCOMPLETE conta 0; turnovers ficam de fora) */
  meanYards: number;
  turnovers: number;
  /** distribuição: ≤0, 1–4, 5–9, 10–19, 20+ jardas */
  buckets: [number, number, number, number, number];
}

export type Factor = 'read' | 'type' | 'stats' | 'variance';

export interface Report {
  matches: number;
  winRateA: number;
  /** por carta, nas partidas em que só um dos lados a jogou */
  cards: Record<string, WinStat>;
  categories: Record<string, WinStat>;
  reads: Record<ReadResult, ReadStat>;
  /** fração das jogadas em que a defesa acertou a leitura (✔) */
  readHitRate: number;
  pointsPerPossession: number;
  playsPerMatch: number;
  /** participação de cada fator na variação de log(jardas) das jogadas GAIN sem big play */
  contribution: Record<Factor, number>;
}

/** Pesos-alvo da spec 4.3. */
export const TARGET_CONTRIBUTION: Record<Factor, number> = { read: 0.5, type: 0.2, stats: 0.2, variance: 0.1 };

const READS: ReadResult[] = ['RIGHT', 'NEUTRAL', 'WRONG'];

function bucketOf(yards: number): number {
  if (yards <= 0) return 0;
  if (yards <= 4) return 1;
  if (yards <= 9) return 2;
  if (yards <= 19) return 3;
  return 4;
}

function variance(xs: number[]): number {
  if (xs.length === 0) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
}

function addWin(map: Record<string, WinStat>, key: string, won: boolean): void {
  const s = (map[key] ??= { games: 0, wins: 0, winRate: 0 });
  s.games += 1;
  if (won) s.wins += 1;
}

function deckCategories(ids: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const id of ids) {
    const card = getCard(id);
    if (card.origin === 'TYPE' || card.origin === 'SIGNATURE') out.add(card.category);
  }
  return out;
}

export function buildReport(records: readonly MatchRecord[]): Report {
  const cards: Record<string, WinStat> = {};
  const categories: Record<string, WinStat> = {};
  const reads = Object.fromEntries(
    READS.map((r) => [r, { plays: 0, meanYards: 0, turnovers: 0, buckets: [0, 0, 0, 0, 0] }]),
  ) as Record<ReadResult, ReadStat>;
  const yardSums: Record<ReadResult, number> = { RIGHT: 0, NEUTRAL: 0, WRONG: 0 };
  const logs: Record<Factor, number[]> = { read: [], type: [], stats: [], variance: [] };
  let plays = 0;
  let drives = 0;
  let points = 0;
  let winsA = 0;

  for (const rec of records) {
    if (rec.winner === 'A') winsA += 1;
    points += rec.score.A + rec.score.B;
    const played: Record<TeamKey, Set<string>> = { A: new Set(), B: new Set() };
    let offense: TeamKey = 'A';
    for (const e of rec.events) {
      if (e.t === 'DRIVE_START') {
        offense = e.offense;
        drives += 1;
      } else if (e.t === 'CARDS') {
        plays += 1;
        played[offense].add(e.offense);
        played[offense === 'A' ? 'B' : 'A'].add(e.defense);
      } else if (e.t === 'PLAY') {
        const o: PlayOutcome = e.outcome;
        const stat = reads[o.read];
        stat.plays += 1;
        if (o.kind === 'INTERCEPTION' || o.kind === 'FUMBLE') {
          stat.turnovers += 1;
        } else {
          const yards = o.kind === 'INCOMPLETE' ? 0 : o.yards;
          yardSums[o.read] += yards;
          stat.buckets[bucketOf(yards)] += 1;
        }
        if (o.kind === 'GAIN' && !o.bigPlay) {
          logs.read.push(Math.log(o.readFactor));
          logs.type.push(Math.log(o.offTypeMult / o.defTypeMult));
          logs.stats.push(Math.log(o.statFactor));
          logs.variance.push(Math.log(o.varianceFactor));
        }
      }
    }
    for (const key of ['A', 'B'] as const) {
      const won = rec.winner === key;
      const opponent = played[key === 'A' ? 'B' : 'A'];
      // Só cartas e categorias que apenas este lado jogou na partida: senão as espelhadas (inclusive as
      // básicas) contam uma vitória e uma derrota e o win rate converge para 50% por construção.
      for (const id of played[key]) if (!opponent.has(id)) addWin(cards, id, won);
      const own = deckCategories(played[key]);
      const other = deckCategories(opponent);
      for (const cat of own) if (!other.has(cat)) addWin(categories, cat, won);
    }
  }

  for (const s of [...Object.values(cards), ...Object.values(categories)]) s.winRate = s.games ? s.wins / s.games : 0;
  for (const r of READS) {
    const counted = reads[r].plays - reads[r].turnovers;
    reads[r].meanYards = counted ? yardSums[r] / counted : 0;
  }
  const vars = { read: variance(logs.read), type: variance(logs.type), stats: variance(logs.stats), variance: variance(logs.variance) };
  const totalVar = vars.read + vars.type + vars.stats + vars.variance || 1;
  const totalPlays = READS.reduce((s, r) => s + reads[r].plays, 0);

  return {
    matches: records.length,
    winRateA: records.length ? winsA / records.length : 0,
    cards,
    categories,
    reads,
    readHitRate: totalPlays ? reads.RIGHT.plays / totalPlays : 0,
    pointsPerPossession: drives ? points / drives : 0,
    playsPerMatch: records.length ? plays / records.length : 0,
    contribution: {
      read: vars.read / totalVar,
      type: vars.type / totalVar,
      stats: vars.stats / totalVar,
      variance: vars.variance / totalVar,
    },
  };
}

export interface GateOptions {
  minSample: number;
  low: number;
  high: number;
  /** amostra mínima para entrar no aviso de subamostra (padrão UNDER_SAMPLE_FLOOR) */
  underSampleFloor?: number;
  /** z do intervalo de confiança (padrão Z_95) */
  z?: number;
}
/** Spec 7.3: win rate por carta (partidas em que foi jogada) entre 45% e 55%. */
export const DEFAULT_GATE: GateOptions = { minSample: 1000, low: 0.45, high: 0.55 };
/** Intervalo de confiança de 95%. */
export const Z_95 = 1.96;

export interface GateCard {
  id: string;
  games: number;
  winRate: number;
  /** intervalo de confiança de Wilson do win rate */
  ci: [number, number];
}

export interface GateResult {
  /** cartas de deck (TYPE/SIGNATURE) com amostra ≥ minSample */
  sampled: string[];
  /** reprovam: o intervalo de confiança inteiro fica fora da faixa */
  failures: GateCard[];
  /** aviso (não reprova): win rate fora da faixa, mas o intervalo de confiança ainda cruza a faixa (pode ser ruído) */
  borderline: GateCard[];
  /** aviso (não reprova): cartas de deck abaixo da amostra mínima, com amostra ≥ UNDER_SAMPLE_FLOOR e win rate fora da faixa */
  underSampled: { id: string; games: number; winRate: number }[];
}

/** Intervalo de Wilson para a proporção wins/games. */
export function wilsonInterval(wins: number, games: number, z = Z_95): [number, number] {
  if (games === 0) return [0, 1];
  const p = wins / games;
  const z2 = z * z;
  const center = (p + z2 / (2 * games)) / (1 + z2 / games);
  const half = (z * Math.sqrt((p * (1 - p)) / games + z2 / (4 * games * games))) / (1 + z2 / games);
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

/** Abaixo disso o win rate é ruído demais até para um aviso. */
export const UNDER_SAMPLE_FLOOR = 200;
/** Cobertura mínima para o portão valer: menos cartas avaliadas que isso é "amostra insuficiente", não aprovação. */
export const MIN_SAMPLED_CARDS = 30;

export function balanceGate(report: Report, options: GateOptions = DEFAULT_GATE): GateResult {
  const sampled = Object.entries(report.cards)
    .filter(([id, s]) => {
      const origin = getCard(id).origin;
      return (origin === 'TYPE' || origin === 'SIGNATURE') && s.games >= options.minSample;
    })
    .map(([id]) => id)
    .sort();
  // Reprova só o que está fora da faixa com significância: o intervalo inteiro abaixo de `low` ou acima
  // de `high`. Uma carta fica concentrada em poucos times, e o ponto sozinho reprovaria ruído.
  const outside = sampled
    .map((id): GateCard => {
      const s = report.cards[id];
      return { id, games: s.games, winRate: s.winRate, ci: wilsonInterval(s.wins, s.games, options.z) };
    })
    .filter((c) => c.winRate < options.low || c.winRate > options.high);
  const significant = (c: GateCard): boolean => c.ci[1] < options.low || c.ci[0] > options.high;
  const failures = outside.filter(significant);
  const borderline = outside.filter((c) => !significant(c));
  const underSampled = Object.entries(report.cards)
    .filter(([id, c]) => {
      const origin = getCard(id).origin;
      return (origin === 'TYPE' || origin === 'SIGNATURE') && c.games < options.minSample && c.games >= (options.underSampleFloor ?? UNDER_SAMPLE_FLOOR);
    })
    .map(([id, c]) => ({ id, games: c.games, winRate: c.winRate }))
    .filter((f) => f.winRate < options.low || f.winRate > options.high)
    .sort((a, b) => a.id.localeCompare(b.id));
  return { sampled, failures, borderline, underSampled };
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

export function formatReport(report: Report, gate: GateResult): string {
  const lines: string[] = [];
  lines.push(`PFL — relatório de balanceamento (${report.matches} partidas)`);
  lines.push(`Win rate do time A (primeira posse): ${pct(report.winRateA)}`);
  lines.push(`Jogadas por partida: ${report.playsPerMatch.toFixed(1)}   Pontos por posse: ${report.pointsPerPossession.toFixed(2)}`);
  lines.push(`Acerto de leitura (✔): ${pct(report.readHitRate)}`);
  lines.push('');
  lines.push('Jardas por resultado de leitura (média | ≤0 / 1–4 / 5–9 / 10–19 / 20+ | turnovers)');
  for (const r of READS) {
    const s = report.reads[r];
    lines.push(`  ${r.padEnd(8)} n=${String(s.plays).padStart(6)}  média ${s.meanYards.toFixed(2).padStart(6)} | ${s.buckets.join(' / ')} | ${s.turnovers}`);
  }
  lines.push('');
  lines.push('Contribuição observada (alvo da spec 4.3)');
  for (const f of ['read', 'type', 'stats', 'variance'] as Factor[]) {
    lines.push(`  ${f.padEnd(9)} ${pct(report.contribution[f]).padStart(6)}  (alvo ${pct(TARGET_CONTRIBUTION[f])})`);
  }
  lines.push('');
  lines.push('Win rate por categoria');
  for (const [cat, s] of Object.entries(report.categories).sort()) {
    lines.push(`  ${cat.padEnd(12)} ${pct(s.winRate).padStart(6)}  (${s.games} jogos)`);
  }
  lines.push('');
  lines.push('Win rate por carta (jogos em que foi jogada)');
  for (const [id, s] of Object.entries(report.cards).sort((a, b) => b[1].winRate - a[1].winRate)) {
    const failed = gate.failures.find((f) => f.id === id);
    const borderline = gate.borderline.find((f) => f.id === id);
    const flag = failed
      ? `  <-- FORA (IC ${pct(failed.ci[0])}–${pct(failed.ci[1])})`
      : borderline
        ? `  ~ fora, mas o IC ${pct(borderline.ci[0])}–${pct(borderline.ci[1])} cruza a faixa`
        : '';
    lines.push(`  ${id.padEnd(28)} ${pct(s.winRate).padStart(6)}  (${s.games} jogos)${flag}`);
  }
  lines.push('');
  if (gate.underSampled.length > 0) {
    lines.push('Atenção (informativo): cartas abaixo da amostra mínima com win rate fora da faixa');
    for (const f of gate.underSampled) lines.push(`  ${f.id.padEnd(28)} ${pct(f.winRate).padStart(6)}  (${f.games} jogos)`);
    lines.push('');
  }
  lines.push(
    `Portão: ${gate.sampled.length} cartas com amostra suficiente, ${gate.failures.length} fora de 45–55% ` +
      `com IC 95% (${gate.borderline.length} fora só no ponto)`,
  );
  return lines.join('\n');
}
