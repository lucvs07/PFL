import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWebBackend } from '../src/audio/webBackend';

const param = () => ({
  value: 1,
  setValueAtTime() {},
  cancelScheduledValues() {},
  linearRampToValueAtTime() {},
  exponentialRampToValueAtTime() {},
});

/** AudioContext mínimo: só o que `resume()` e a criação do grafo tocam. */
function fakeContext(state: string, resume: () => Promise<void>) {
  return class {
    state = state;
    currentTime = 0;
    sampleRate = 8000;
    destination = {};
    createGain() {
      return { gain: param(), connect() {}, disconnect() {} };
    }
    createDynamicsCompressor() {
      return { connect() {} };
    }
    createBuffer() {
      return { getChannelData: () => new Float32Array(8) };
    }
    resume = resume;
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('createWebBackend.resume', () => {
  it('retoma o contexto em qualquer estado que não seja running (Safari usa "interrupted") e engole a rejeição', async () => {
    for (const state of ['suspended', 'interrupted']) {
      const resume = vi.fn(() => Promise.reject(new Error('negado')));
      vi.stubGlobal('window', { AudioContext: fakeContext(state, resume) });
      createWebBackend().resume();
      expect(resume, state).toHaveBeenCalledTimes(1);
      await new Promise((r) => setTimeout(r, 0)); // dá chance de a rejeição solta aparecer
    }
  });

  it('não retoma um contexto que já está tocando', () => {
    const resume = vi.fn(() => Promise.resolve());
    vi.stubGlobal('window', { AudioContext: fakeContext('running', resume) });
    createWebBackend().resume();
    expect(resume).not.toHaveBeenCalled();
  });

  it('sem AudioContext o backend é indisponível e nada lança', () => {
    vi.stubGlobal('window', {});
    const b = createWebBackend();
    expect(b.available).toBe(false);
    expect(() => {
      b.resume();
      b.newMusicBus();
    }).not.toThrow();
  });
});
