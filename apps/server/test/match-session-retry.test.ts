import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Team, TeamKey } from '@pfl/engine';
import { MatchSession } from '../src/match-session';
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
