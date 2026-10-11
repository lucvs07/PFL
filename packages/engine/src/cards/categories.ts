import type { DefenseCategory, OffenseCategory, ReadResult } from '../model';

export interface CategoryProfile {
  baseYards: number;
  /** amplitude relativa da variância (±) */
  variance: number;
  risk: { sack: number; interception: number; fumble: number; incompletion: number; bigPlay: number };
}

// Valores iniciais; o Plano 2 calibra com o simulador.
export const OFFENSE_PROFILES: Record<OffenseCategory, CategoryProfile> = {
  RUN_INSIDE: { baseYards: 4, variance: 0.15, risk: { sack: 0, interception: 0, fumble: 0.02, incompletion: 0, bigPlay: 0.04 } },
  RUN_OUTSIDE: { baseYards: 5, variance: 0.15, risk: { sack: 0, interception: 0, fumble: 0.02, incompletion: 0, bigPlay: 0.07 } },
  SHORT_PASS: { baseYards: 7, variance: 0.15, risk: { sack: 0.05, interception: 0.02, fumble: 0, incompletion: 0.25, bigPlay: 0.05 } },
  DEEP_PASS: { baseYards: 18, variance: 0.15, risk: { sack: 0.08, interception: 0.05, fumble: 0, incompletion: 0.5, bigPlay: 0.08 } },
  SCREEN: { baseYards: 6, variance: 0.15, risk: { sack: 0, interception: 0.01, fumble: 0, incompletion: 0.1, bigPlay: 0.06 } },
  PLAY_ACTION: { baseYards: 12, variance: 0.15, risk: { sack: 0.1, interception: 0.03, fumble: 0, incompletion: 0.35, bigPlay: 0.08 } },
};

const R: ReadResult = 'RIGHT';
const N: ReadResult = 'NEUTRAL';
const W: ReadResult = 'WRONG';

// Spec 3.5 — saldo zero por linha e por coluna.
export const READ_MATRIX: Record<Exclude<DefenseCategory, 'BASE_D'>, Record<OffenseCategory, ReadResult>> = {
  RUN_STUFF: { RUN_INSIDE: R, RUN_OUTSIDE: R, SHORT_PASS: N, DEEP_PASS: W, SCREEN: N, PLAY_ACTION: W },
  BLITZ: { RUN_INSIDE: R, RUN_OUTSIDE: N, SHORT_PASS: W, DEEP_PASS: R, SCREEN: W, PLAY_ACTION: N },
  MAN: { RUN_INSIDE: W, RUN_OUTSIDE: W, SHORT_PASS: R, DEEP_PASS: N, SCREEN: R, PLAY_ACTION: N },
  ZONE_SHORT: { RUN_INSIDE: N, RUN_OUTSIDE: N, SHORT_PASS: R, DEEP_PASS: W, SCREEN: N, PLAY_ACTION: N },
  ZONE_DEEP: { RUN_INSIDE: W, RUN_OUTSIDE: N, SHORT_PASS: W, DEEP_PASS: R, SCREEN: N, PLAY_ACTION: R },
};

export function readResult(def: DefenseCategory, off: OffenseCategory): ReadResult {
  return def === 'BASE_D' ? 'NEUTRAL' : READ_MATRIX[def][off];
}
