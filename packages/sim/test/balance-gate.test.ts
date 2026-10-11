import { describe, it, expect } from 'vitest';
import { runSim } from '../src/runner';
import { buildReport, balanceGate } from '../src/report';

// Portão de balanceamento (spec 7.3), com N reduzido para rodar na suíte.
// N e seed fixos → resultado determinístico. Amostra mínima 600: 2σ ≈ ±4,1 pontos em torno de 50%.
const GATE_GAMES = 2000;
const GATE_SEED = 2026;
const GATE_MIN_SAMPLE = 600;
/** o portão só vale se cobrir uma parte relevante do catálogo */
const GATE_MIN_SAMPLED_CARDS = 30;
/** Exceções documentadas (spec 7.3). Vazio: psychic_foresight entrou na faixa (51–52%) depois do rebalanceamento dos times sugeridos. */
const GATE_EXCEPTIONS: string[] = [];

describe('portão de balanceamento', () => {
  it(
    `nenhuma carta com ≥ ${GATE_MIN_SAMPLE} jogos fica fora de 45–55% (${GATE_GAMES} partidas, seed ${GATE_SEED})`,
    () => {
      const report = buildReport(runSim({ games: GATE_GAMES, seed: GATE_SEED }));
      const gate = balanceGate(report, { minSample: GATE_MIN_SAMPLE, low: 0.45, high: 0.55 });
      expect(gate.sampled.length).toBeGreaterThanOrEqual(GATE_MIN_SAMPLED_CARDS);
      expect(gate.failures.filter((f) => !GATE_EXCEPTIONS.includes(f.id))).toEqual([]);
    },
    300_000,
  );
});
