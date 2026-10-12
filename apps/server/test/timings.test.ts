import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TIMINGS, realScheduler, resolveTimings } from '../src/timings';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('timings', () => {
  it('os padrões vêm das constantes do protocolo', () => {
    expect(DEFAULT_TIMINGS).toEqual({
      phaseMs: { FORMATION: 5000, PACKAGE: 4000, PLAYCALL: 8000, CONVERSION: 8000 },
      resultAnimationMs: 4500,
      reconnectGraceMs: 60_000,
      bothDisconnectedCloseMs: 300_000,
    });
  });

  it('resolveTimings mescla valores parciais', () => {
    const t = resolveTimings({ phaseMs: { PACKAGE: 150 }, resultAnimationMs: 0 });
    expect(t.phaseMs).toEqual({ FORMATION: 5000, PACKAGE: 150, PLAYCALL: 8000, CONVERSION: 8000 });
    expect(t.resultAnimationMs).toBe(0);
    expect(t.reconnectGraceMs).toBe(60_000);
    expect(resolveTimings()).toEqual(DEFAULT_TIMINGS);
  });
});

describe('realScheduler', () => {
  it('usa o relógio e os timers globais (falsificáveis nos testes)', () => {
    expect(realScheduler.now()).toBe(1_000_000);
    const fn = vi.fn();
    realScheduler.schedule(100, fn);
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('a função devolvida cancela o timer', () => {
    const fn = vi.fn();
    const cancel = realScheduler.schedule(100, fn);
    cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });

  it('uma exceção no callback é logada e não propaga', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      realScheduler.schedule(10, () => {
        throw new Error('boom');
      });
      expect(() => vi.advanceTimersByTime(10)).not.toThrow();
      expect(spy).toHaveBeenCalledOnce();
      expect(spy.mock.calls[0][0]).toBe('[pfl] erro em timer');
    } finally {
      spy.mockRestore();
    }
  });
});
