import { describe, it, expect } from 'vitest';
import type { GameEvent, PlayOutcome } from '@pfl/engine';
import { buildReport, balanceGate, formatReport, wilsonInterval, type Report } from '../src/report';
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

describe('win rate por categoria', () => {
  const ev = (a: string, b: string): GameEvent[] => [
    { t: 'DRIVE_START', offense: 'A', ballOn: 25, possession: 1, overtimeRound: 0 },
    { t: 'CARDS', offense: a, defense: 'basic_defense', read: 'NEUTRAL' },
    { t: 'PLAY', outcome: outcome({}) },
    { t: 'DRIVE_START', offense: 'B', ballOn: 25, possession: 1, overtimeRound: 0 },
    { t: 'CARDS', offense: b, defense: 'basic_defense', read: 'NEUTRAL' },
    { t: 'PLAY', outcome: outcome({}) },
  ];
  const rec = (events: GameEvent[], winner: 'A' | 'B'): MatchRecord => ({
    teams: { A: 'x', B: 'y' }, score: { A: 7, B: 0 }, winner, events,
  });

  it('ignora cartas básicas/especiais e categorias jogadas pelos dois lados na mesma partida', () => {
    // A joga RUN_INSIDE de tipo; B joga SHORT_PASS básica → só RUN_INSIDE conta, só para A
    const solo = buildReport([rec(ev('normal_tackle', 'basic_pass'), 'A')]);
    expect(solo.categories.RUN_INSIDE).toEqual({ games: 1, wins: 1, winRate: 1 });
    expect(solo.categories.SHORT_PASS).toBeUndefined();
    expect(solo.categories.BASE_D).toBeUndefined();
    // os dois jogam RUN_INSIDE de tipo → espelhado, não entra
    const mirror = buildReport([rec(ev('normal_tackle', 'fighting_submission'), 'A')]);
    expect(mirror.categories.RUN_INSIDE).toBeUndefined();
  });
});

describe('win rate por carta', () => {
  it('carta jogada pelos dois lados na mesma partida não entra (seria 1 vitória + 1 derrota)', () => {
    const events: GameEvent[] = [
      { t: 'DRIVE_START', offense: 'A', ballOn: 25, possession: 1, overtimeRound: 0 },
      { t: 'CARDS', offense: 'normal_tackle', defense: 'electric_paralysis', read: 'NEUTRAL' },
      { t: 'DRIVE_START', offense: 'B', ballOn: 25, possession: 1, overtimeRound: 0 },
      { t: 'CARDS', offense: 'normal_tackle', defense: 'normal_wall', read: 'NEUTRAL' },
    ];
    const report = buildReport([{ teams: { A: 'x', B: 'y' }, score: { A: 7, B: 0 }, winner: 'A', events }]);
    expect(report.cards.normal_tackle).toBeUndefined();
    expect(report.cards.normal_wall).toEqual({ games: 1, wins: 1, winRate: 1 }); // só A
    expect(report.cards.electric_paralysis).toEqual({ games: 1, wins: 0, winRate: 0 }); // só B
  });
});

describe('balanceGate', () => {
  const report = buildReport([record('A'), record('A'), record('B')]);

  it('ignora básicas e cartas sem amostra suficiente', () => {
    expect(balanceGate(report, { minSample: 4, low: 0.45, high: 0.55 }).sampled).toEqual([]);
    const gate = balanceGate(report, { minSample: 3, low: 0.45, high: 0.55 });
    expect(gate.sampled).toEqual(['electric_paralysis', 'normal_tackle', 'normal_wall']);
    // com 3 jogos o intervalo de confiança cruza a faixa: fora só no ponto, não reprova
    expect(gate.failures).toEqual([]);
    expect(gate.borderline.map((f) => f.id)).toEqual(['electric_paralysis', 'normal_tackle', 'normal_wall']);
  });

  it('reprova só quando o intervalo de confiança de 95% fica inteiro fora da faixa', () => {
    const big = (wins: number, games: number) => ({ games, wins, winRate: wins / games });
    const gate = balanceGate(
      { ...report, cards: { normal_tackle: big(560, 1000), normal_wall: big(430, 1000), electric_paralysis: big(500, 1000) } },
      { minSample: 1000, low: 0.45, high: 0.55 },
    );
    // 56,0% em 1000 jogos: IC ≈ 52,9–59,0% cruza a faixa; 43,0%: IC ≈ 40,0–46,1% também
    expect(gate.failures).toEqual([]);
    expect(gate.borderline.map((f) => f.id)).toEqual(['normal_tackle', 'normal_wall']);
    const strong = balanceGate(
      { ...report, cards: { normal_tackle: big(600, 1000), normal_wall: big(400, 1000) } },
      { minSample: 1000, low: 0.45, high: 0.55 },
    );
    expect(strong.failures.map((f) => f.id)).toEqual(['normal_tackle', 'normal_wall']);
    expect(strong.failures[0].ci[0]).toBeGreaterThan(0.55);
    expect(strong.failures[1].ci[1]).toBeLessThan(0.45);
  });

  it('wilsonInterval: contém a proporção, encolhe com a amostra e fica em [0, 1]', () => {
    const [lo, hi] = wilsonInterval(500, 1000);
    expect(lo).toBeLessThan(0.5);
    expect(hi).toBeGreaterThan(0.5);
    expect(hi - lo).toBeCloseTo(0.062, 2);
    const [lo2, hi2] = wilsonInterval(5000, 10000);
    expect(hi2 - lo2).toBeLessThan(hi - lo);
    expect(wilsonInterval(0, 10)[0]).toBe(0);
    expect(wilsonInterval(10, 10)[1]).toBe(1);
    expect(wilsonInterval(0, 0)).toEqual([0, 1]);
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
    expect(text).toMatch(/normal_tackle .*~ fora, mas o IC .* cruza a faixa/);
    expect(text).toContain('Portão: 3 cartas com amostra suficiente, 0 fora de 45–55% com IC 95% (3 fora só no ponto)');
  });

  it('marca as cartas reprovadas com o intervalo de confiança', () => {
    const base = buildReport([record('A'), record('A'), record('B')]);
    const report = { ...base, cards: { ...base.cards, normal_tackle: { games: 1000, wins: 600, winRate: 0.6 } } };
    const text = formatReport(report, balanceGate(report, { minSample: 1000, low: 0.45, high: 0.55 }));
    expect(text).toMatch(/normal_tackle .*<-- FORA \(IC 56\.\d%–63\.\d%\)/);
    expect(text).toContain('1 fora de 45–55% com IC 95% (0 fora só no ponto)');
  });
});

describe('portão ponta a ponta (smoke; o portão completo roda com npm run test:gate)', () => {
  it('runSim → buildReport → balanceGate numa amostra pequena', () => {
    const report = buildReport(runSim({ games: 12, seed: 2026 }));
    const gate = balanceGate(report, { minSample: 1, low: 0, high: 1 });
    expect(report.matches).toBe(12);
    expect(gate.sampled.length).toBeGreaterThan(0);
    expect(gate.failures).toEqual([]);
  });
});

describe('determinismo do relatório', () => {
  it('a mesma seed gera o mesmo relatório', () => {
    expect(buildReport(runSim({ games: 6, seed: 21 }))).toEqual(buildReport(runSim({ games: 6, seed: 21 })));
  });
});
