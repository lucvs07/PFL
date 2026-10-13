import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FADE_S, createSequencer } from '../src/audio/sequencer';
import { noteFrequency, parseScore, type ParsedScore } from '../src/audio/score';
import { FakeBackend } from './audio-fakes';

// 120 bpm: semicolcheia = 0,125 s; um compasso = 2 s. Notas nos passos 0, 4, 8 e 12.
const bar = (note: string) => `${note} - - - ${note} - - - ${note} - - - ${note} - - -`;
const score = (note: string): ParsedScore => parseScore({ bpm: 120, channels: [{ voice: 'pulse1', bars: [bar(note)] }] });

/** avança o relógio do backend em passos de 25 ms, chamando tick() a cada passo */
function run(seq: { tick(): void }, backend: FakeBackend, from: number, to: number) {
  for (let t = from; t <= to + 1e-9; t += 0.025) {
    backend.currentTime = t;
    seq.tick();
  }
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createSequencer', () => {
  it('agenda à frente, no ritmo da partitura, repetindo o loop sem buracos', () => {
    const backend = new FakeBackend();
    const seq = createSequencer(backend);
    seq.play(score('C4'));
    run(seq, backend, 0, 4.2);
    const starts = backend.on('music').map((t) => t.start);
    expect(starts.slice(0, 8)).toEqual(starts.slice(0, 8).map((_, i) => expect.closeTo(0.05 + 0.5 * i, 6)));
    expect(backend.on('music')[0].freq).toBeCloseTo(noteFrequency('C4')!, 6);
    expect(backend.on('music')[0].duration).toBeCloseTo(4 * 0.125 * 0.92, 6);
    seq.play(null);
  });

  it('não agenda além da antecedência de 100 ms', () => {
    const backend = new FakeBackend();
    const seq = createSequencer(backend);
    seq.play(score('C4'));
    expect(backend.on('music').every((t) => t.start < 0.1 + 1e-9)).toBe(true);
    seq.play(null);
  });

  it('pedir a mesma faixa de novo não reinicia', () => {
    const backend = new FakeBackend();
    const seq = createSequencer(backend);
    const s = score('C4');
    seq.play(s);
    const before = backend.tones.length;
    seq.play(s);
    expect(backend.tones.length).toBe(before);
    seq.play(null);
  });

  it('troca de faixa: fade-out de 300 ms e só então a nova começa', () => {
    const backend = new FakeBackend();
    const seq = createSequencer(backend);
    seq.play(score('C4'));
    run(seq, backend, 0, 0.2);
    seq.play(score('G4'));
    expect(backend.fades.at(-1)).toEqual({ value: 0, seconds: FADE_S });
    const countBefore = backend.tones.length;
    run(seq, backend, 0.225, 0.4);
    expect(backend.tones.length).toBe(countBefore); // nada novo durante o fade
    vi.advanceTimersByTime(300);
    expect(backend.fades.at(-1)).toEqual({ value: 1, seconds: 0 });
    expect(backend.on('music').at(-1)?.freq).toBeCloseTo(noteFrequency('G4')!, 6);
    seq.play(null);
  });

  it('play(null) faz fade-out e para de agendar', () => {
    const backend = new FakeBackend();
    const seq = createSequencer(backend);
    seq.play(score('C4'));
    run(seq, backend, 0, 0.5);
    seq.play(null);
    expect(backend.fades.at(-1)).toEqual({ value: 0, seconds: FADE_S });
    const n = backend.tones.length;
    run(seq, backend, 0.55, 2);
    expect(backend.tones.length).toBe(n);
  });

  it('pausa não agenda; ao retomar depois de muito tempo não há rajada atrasada', () => {
    const backend = new FakeBackend();
    const seq = createSequencer(backend);
    seq.play(score('C4'));
    run(seq, backend, 0, 0.5);
    seq.pause();
    const n = backend.tones.length;
    run(seq, backend, 0.55, 3);
    expect(backend.tones.length).toBe(n);
    backend.currentTime = 60;
    seq.resume();
    seq.tick();
    const fresh = backend.tones.slice(n);
    expect(fresh.length).toBeLessThanOrEqual(2);
    expect(fresh.every((t) => t.tone.start >= 60)).toBe(true);
    seq.play(null);
  });

  it('playOnce chama onEnd uma única vez depois do último passo', () => {
    const backend = new FakeBackend();
    const seq = createSequencer(backend);
    const onEnd = vi.fn();
    seq.playOnce(score('C4'), onEnd);
    run(seq, backend, 0, 2.1);
    expect(onEnd).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(onEnd).toHaveBeenCalledTimes(1);
    const n = backend.tones.length;
    run(seq, backend, 2.2, 4);
    expect(backend.tones.length).toBe(n); // não repete
    vi.advanceTimersByTime(2000);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('percussão do canal de ruído vira tons de ruído e bumbo triangular', () => {
    const backend = new FakeBackend();
    const seq = createSequencer(backend);
    const drums = parseScore({ bpm: 120, channels: [{ voice: 'noise', bars: ['k . . . s . . . h . . . . . . .'] }] });
    seq.play(drums);
    run(seq, backend, 0, 1.2);
    const waves = backend.on('music').map((t) => t.wave);
    expect(waves.slice(0, 3)).toEqual(['triangle', 'noise', 'noise']);
    seq.play(null);
  });
});
