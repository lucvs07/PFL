import type { Phase } from '@pfl/engine';
import { BOTH_DISCONNECTED_CLOSE_MS, PHASE_SECONDS, RECONNECT_GRACE_MS, RESULT_ANIMATION_MS } from '@pfl/protocol';

export type TimedPhase = Exclude<Phase, 'MATCH_END'>;

export interface Timings {
  phaseMs: Record<TimedPhase, number>;
  resultAnimationMs: number;
  reconnectGraceMs: number;
  bothDisconnectedCloseMs: number;
}

export interface TimingsInput {
  phaseMs?: Partial<Record<TimedPhase, number>>;
  resultAnimationMs?: number;
  reconnectGraceMs?: number;
  bothDisconnectedCloseMs?: number;
}

export const DEFAULT_TIMINGS: Timings = {
  phaseMs: {
    FORMATION: PHASE_SECONDS.FORMATION * 1000,
    PACKAGE: PHASE_SECONDS.PACKAGE * 1000,
    PLAYCALL: PHASE_SECONDS.PLAYCALL * 1000,
    CONVERSION: PHASE_SECONDS.CONVERSION * 1000,
  },
  resultAnimationMs: RESULT_ANIMATION_MS,
  reconnectGraceMs: RECONNECT_GRACE_MS,
  bothDisconnectedCloseMs: BOTH_DISCONNECTED_CLOSE_MS,
};

export function resolveTimings(input: TimingsInput = {}): Timings {
  return {
    phaseMs: { ...DEFAULT_TIMINGS.phaseMs, ...input.phaseMs },
    resultAnimationMs: input.resultAnimationMs ?? DEFAULT_TIMINGS.resultAnimationMs,
    reconnectGraceMs: input.reconnectGraceMs ?? DEFAULT_TIMINGS.reconnectGraceMs,
    bothDisconnectedCloseMs: input.bothDisconnectedCloseMs ?? DEFAULT_TIMINGS.bothDisconnectedCloseMs,
  };
}

/** Relógio + timers injetáveis. `schedule` devolve a função que cancela o timer. */
export interface Scheduler {
  now(): number;
  schedule(ms: number, fn: () => void): () => void;
}

/** Usa Date.now/setTimeout globais no momento da chamada, então funciona com vi.useFakeTimers(). */
export const realScheduler: Scheduler = {
  now: () => Date.now(),
  schedule: (ms, fn) => {
    // um callback que lança não pode derrubar o processo
    const handle = setTimeout(() => {
      try {
        fn();
      } catch (err) {
        console.error('[pfl] erro em timer', err);
      }
    }, ms);
    return () => clearTimeout(handle);
  },
};
