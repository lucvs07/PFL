import { describe, it, expect } from 'vitest';
import type { GameEvent, PlayOutcome } from '@pfl/engine';
import { buildReport, balanceGate, formatReport, type Report } from '../src/report';
import { runSim, type MatchRecord } from '../src/runner';

const outcome = (o: Partial<PlayOutcome>): PlayOutcome => ({
  kind: 'GAIN', yards: 5, bigPlay: false, read: 'NEUTRAL', offActors: [], defActors: [], offTypeMult: 1, defTypeMult: 1,
  readFactor: 1, statFactor: 1, varianceFactor: 1, ...o,
});

/** Partida sintética: A ataca 1 drive e joga normal_tackle; B defende com normal_wall; depois B ataca com basic_pass. */
function record(winner: 'A' | 'B'): MatchRecord {
  const events: GameEvent[] = [
    { t: 'DRIVE_START', offense: 'A', ballOn: 25, possession: 1, overtimeRound: 0 },
    { t: 'CARDS', offense: 'normal_tackle', defense: 'normal_wall', read: 'RIGHT' },
    { t: 'PLAY', outcome: outcome({ read: 'RIGHT', yards: -1, readFactor: 0.4, statFactor: 0.9, varianceFactor: 0.95 }) },
    { t: 'CARDS', offense: 'normal_tackle', defense: 'basic_defense', read: 'NEUTRAL' },
    { t: 'PLAY', outcome: outcome({ yards: 12, statFactor: 1.2, varianceFactor: 1.1, offTypeMult: 1.15 }) },
    { t: 'DRIVE_START', offense: 'B', ballOn: 25, possession: 1, overtimeRound: 0 },
    { t: 'CARDS', offense: 'basic_pass', defense: 'electric_paralysis', read: 'WRONG' },
    { t: 'PLAY', outcome: outcome({ kind: 'INTERCEPTION', read: 'WRONG', yards: 7, readFactor: 1.6 }) },
    { t: 'MATCH_END', score: winner === 'A' ? { A: 7, B: 0 } : { A: 0, B: 3 } },
  ];
  return { teams: { A: 'x', B: 'y' }, score: winner === 'A' ? { A: 7, B: 0 } : { A: 0, B: 3 }, winner, events };
}

describe('buildReport', () => {
  const report: Report = buildReport([record('A'), record('A'), record('B')]);

  it('conta win rate por carta uma vez por partida, do time que jogou', () => {
    expect(report.cards.normal_tackle).toEqual({ games: 3, wins: 2, winRate: 2 / 3 });
    expect(report.cards.normal_wall).toEqual({ games: 3, wins: 1, winRate: 1 / 3 }); // jogada por B
    expect(report.cards.electric_paralysis).toEqual({ games: 3, wins: 2, winRate: 2 / 3 }); // jogada por A
    expect(report.categories.RUN_INSIDE.games).toBe(3);
  });

  it('agrega jardas por leitura, acerto de leitura, pontos por posse e jogadas por partida', () => {
    expect(report.reads.RIGHT).toMatchObject({ plays: 3, meanYards: -1, turnovers: 0, buckets: [3, 0, 0, 0, 0] });
    expect(report.reads.NEUTRAL).toMatchObject({ plays: 3, meanYards: 12, buckets: [0, 0, 0, 3, 0] });
    expect(report.reads.WRONG).toMatchObject({ plays: 3, turnovers: 3 });
    expect(report.readHitRate).toBeCloseTo(1 / 3);
    expect(report.pointsPerPossession).toBeCloseTo((7 + 7 + 3) / 6);
    expect(report.playsPerMatch).toBe(3);
    expect(report.winRateA).toBeCloseTo(2 / 3);
  });

  it('a contribuição dos fatores soma 1', () => {
    const c = report.contribution;
    expect(c.read + c.type + c.stats + c.variance).toBeCloseTo(1);
    expect(c.read).toBeGreaterThan(0);
  });
});

describe('balanceGate', () => {
  const report = buildReport([record('A'), record('A'), record('B')]);

  it('ignora básicas e cartas sem amostra suficiente', () => {
    expect(balanceGate(report, { minSample: 4, low: 0.45, high: 0.55 }).sampled).toEqual([]);
    const gate = balanceGate(report, { minSample: 3, low: 0.45, high: 0.55 });
    expect(gate.sampled).toEqual(['electric_paralysis', 'normal_tackle', 'normal_wall']);
    expect(gate.failures.map((f) => f.id)).toEqual(['electric_paralysis', 'normal_tackle', 'normal_wall']);
  });

  it('lista, só como aviso, cartas abaixo da amostra mínima com win rate fora da faixa', () => {
    const gate = balanceGate(report, { minSample: 4, low: 0.45, high: 0.55, underSampleFloor: 1 });
    expect(gate.sampled).toEqual([]);
    expect(gate.failures).toEqual([]); // não reprova: é só visibilidade
    expect(gate.underSampled.map((f) => f.id)).toEqual(['electric_paralysis', 'normal_tackle', 'normal_wall']);
    expect(formatReport(report, gate)).toContain('abaixo da amostra mínima');
  });

  it('aprova carta dentro da faixa', () => {
    const gate = balanceGate(report, { minSample: 3, low: 0.3, high: 0.7 });
    expect(gate.failures).toEqual([]);
  });
});

describe('formatReport', () => {
  it('mostra as seções do relatório e marca as cartas reprovadas', () => {
    const report = buildReport([record('A'), record('A'), record('B')]);
    const text = formatReport(report, balanceGate(report, { minSample: 3, low: 0.45, high: 0.55 }));
    for (const s of ['Acerto de leitura', 'Pontos por posse', 'Jogadas por partida', 'Contribuição observada', 'Win rate por categoria', 'Win rate por carta']) {
      expect(text).toContain(s);
    }
    expect(text).toMatch(/normal_tackle .*<-- FORA/);
    expect(text).toContain('Portão: 3 cartas com amostra suficiente, 3 fora de 45–55%');
  });
});

describe('determinismo do relatório', () => {
  it('a mesma seed gera o mesmo relatório', () => {
    expect(buildReport(runSim({ games: 6, seed: 21 }))).toEqual(buildReport(runSim({ games: 6, seed: 21 })));
  });
});
