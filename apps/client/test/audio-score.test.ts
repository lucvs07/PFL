import { describe, expect, it } from 'vitest';
import { STEPS_PER_BAR, ScoreError, noteFrequency, parseScore, type ScoreSource } from '../src/audio/score';

const rests = Array(16).fill('.').join(' ');
const one = (bars: string[], voice: ScoreSource['channels'][number]['voice'] = 'pulse1'): ScoreSource => ({
  bpm: 120,
  channels: [{ voice, bars }],
});

describe('noteFrequency', () => {
  it('converte nomes de nota em Hz', () => {
    expect(noteFrequency('A4')).toBeCloseTo(440, 5);
    expect(noteFrequency('C4')).toBeCloseTo(261.6256, 3);
    expect(noteFrequency('A#3')).toBeCloseTo(233.0819, 3);
    expect(noteFrequency('Bb3')).toBeCloseTo(233.0819, 3);
  });

  it('devolve null para token inválido', () => {
    expect(noteFrequency('H4')).toBeNull();
    expect(noteFrequency('C')).toBeNull();
    expect(noteFrequency('.')).toBeNull();
    expect(noteFrequency('-')).toBeNull();
  });
});

describe('parseScore', () => {
  it('calcula passos e duração do passo', () => {
    const p = parseScore(one([rests, rests]));
    expect(STEPS_PER_BAR).toBe(16);
    expect(p.steps).toBe(32);
    expect(p.stepSeconds).toBeCloseTo(0.125, 9); // 120 bpm: semicolcheia = 60/120/4
    expect(p.channels[0].events).toEqual([]);
  });

  it('"-" sustenta a nota anterior, inclusive entre compassos', () => {
    const bar1 = 'C4 - - - . . . . . . . . . . E4 -';
    const bar2 = '- - G4 . . . . . . . . . . . . .';
    const { events } = parseScore(one([bar1, bar2])).channels[0];
    expect(events.map((e) => [e.step, e.length])).toEqual([
      [0, 4],
      [14, 4],
      [18, 1],
    ]);
    expect(events[0].freq).toBeCloseTo(261.6256, 3);
  });

  it('canal de ruído usa k, s e h', () => {
    const { events } = parseScore(one(['k . . . s . . . h . . . . . . .'], 'noise')).channels[0];
    expect(events.map((e) => e.drum)).toEqual(['k', 's', 'h']);
    expect(events[0].freq).toBeUndefined();
  });

  it('padrões de duty e gain', () => {
    const c = parseScore(one([rests])).channels[0];
    expect(c.duty).toBe(0.5);
    expect(c.gain).toBe(1);
    const d = parseScore({ bpm: 120, channels: [{ voice: 'pulse2', duty: 0.25, gain: 0.6, bars: [rests] }] }).channels[0];
    expect(d.duty).toBe(0.25);
    expect(d.gain).toBe(0.6);
  });

  it('erros de formato lançam ScoreError com mensagem útil', () => {
    expect(() => parseScore(one(['C4 . .']))).toThrow(ScoreError);
    expect(() => parseScore(one(['C4 . .']))).toThrow(/3 posições/);
    expect(() => parseScore(one(['X9 . . . . . . . . . . . . . . .']))).toThrow(/X9/);
    expect(() => parseScore(one(['- . . . . . . . . . . . . . . .']))).toThrow(/sustentar/);
    expect(() => parseScore(one(['C4 . . . . . . . . . . . . . . .', 'C4 . . . . . . . . . . . . . . .'], 'noise'))).toThrow(ScoreError);
    expect(() => parseScore(one(['k - . . . . . . . . . . . . . .'], 'noise'))).toThrow(/ruído/);
    expect(() => parseScore({ bpm: 0, channels: [{ voice: 'tri', bars: [rests] }] })).toThrow(/bpm/);
    expect(() => parseScore({ bpm: 120, channels: [] })).toThrow(/canais/);
  });

  it('todos os canais têm o mesmo número de compassos, e no máximo 4 canais', () => {
    const ch = (bars: string[]) => ({ voice: 'pulse1' as const, bars });
    expect(() => parseScore({ bpm: 120, channels: [ch([rests]), ch([rests, rests])] })).toThrow(/compassos/);
    expect(() => parseScore({ bpm: 120, channels: Array.from({ length: 5 }, () => ch([rests])) })).toThrow(/canais/);
  });
});
