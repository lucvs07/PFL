import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Team, TeamKey } from '@pfl/engine';
import { MAX_TIMEOUT_RETRIES, MatchSession } from '../src/match-session';
import { realScheduler, resolveTimings } from '../src/timings';
import { electricTeam } from './fixtures';
import { recorder } from './helpers';

const failures = vi.hoisted(() => ({ timeoutLeft: 0 }));
vi.mock('@pfl/engine', async () => {
  const actual = await vi.importActual<typeof import('@pfl/engine')>('@pfl/engine');
  return {
    ...actual,
    step: ((state, action) => {
      if (action.type === 'TIMEOUT' && failures.timeoutLeft > 0) {
        failures.timeoutLeft -= 1;
        throw new Error('falha forçada');
      }
      return actual.step(state, action);
    }) as typeof actual.step,
  };
});

const T0 = 1_000_000;
const teams = (): Record<TeamKey, Team> => ({ A: electricTeam('A'), B: electricTeam('B') });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('rearme do TIMEOUT que falhou', () => {
  it('tenta de novo depois de 1 s, sem laço apertado', () => {
    failures.timeoutLeft = 1;
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const rec = recorder();
      const session = new MatchSession(teams(), 42, {
        scheduler: realScheduler,
        timings: resolveTimings(),
        send: rec.send,
        isAbsent: () => false,
        onEnd: () => {},
      });
      session.start();
      vi.advanceTimersByTime(5000); // deadline: o TIMEOUT falha
      expect(errors).toHaveBeenCalledTimes(2); // erro do motor + aviso de nova tentativa
      expect(session.actions).toEqual([]);
      expect(vi.getTimerCount()).toBe(1);
      vi.advanceTimersByTime(999);
      expect(session.actions).toEqual([]);
      expect(errors).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(1);
      expect(session.actions).toEqual([{ type: 'TIMEOUT' }]);
      expect(rec.last('B', 'match:reveal')!.events[0]).toMatchObject({ t: 'FORMATION' });
      expect(vi.getTimerCount()).toBe(1);
      session.dispose();
    } finally {
      errors.mockRestore();
    }
  });
});

describe('teto de novas tentativas do TIMEOUT', () => {
  it('cada nova tentativa avisa o deadline novo; passado o teto, encerra a partida e avisa os dois', () => {
    failures.timeoutLeft = 100;
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const rec = recorder();
      let ended = 0;
      const session = new MatchSession(teams(), 42, {
        scheduler: realScheduler,
        timings: resolveTimings(),
        send: rec.send,
        isAbsent: () => false,
        onEnd: () => {
          ended += 1;
        },
      });
      session.start();
      vi.advanceTimersByTime(5000); // 1ª falha
      expect(rec.last('A', 'match:phase')!.deadline).toBe(T0 + 6000);
      vi.advanceTimersByTime(1000 * (MAX_TIMEOUT_RETRIES - 1));
      expect(session.finished).toBe(false);
      vi.advanceTimersByTime(1000); // passou do teto
      expect(session.finished).toBe(true);
      expect(ended).toBe(1);
      for (const k of ['A', 'B'] as const) {
        expect(rec.last(k, 'error')).toMatchObject({ code: 'ENGINE_ERROR' });
        expect(rec.last(k, 'match:end')).toBeDefined();
      }
      expect(vi.getTimerCount()).toBe(0);
      session.dispose();
    } finally {
      failures.timeoutLeft = 0;
      errors.mockRestore();
    }
  });
});
