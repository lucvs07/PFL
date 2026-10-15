import { describe, expect, it } from 'vitest';
import type { ParsedScore } from '../src/audio/score';
import { SCORES } from '../src/audio/scores';

const all = Object.values(SCORES) as ParsedScore[]; // AudioScores é uma interface: Object.values devolve any[]

const seconds = (s: { steps: number; stepSeconds: number }) => s.steps * s.stepSeconds;

describe('SCORES', () => {
  it('as quatro partituras são válidas, com 1 a 4 canais', () => {
    for (const [name, score] of Object.entries(SCORES)) {
      expect(score.channels.length, name).toBeGreaterThanOrEqual(1);
      expect(score.channels.length, name).toBeLessThanOrEqual(4);
      for (const ch of score.channels) expect(ch.events.length, `${name}/${ch.voice}`).toBeGreaterThan(0);
    }
  });

  it('durações: faixas de 8 compassos e jingles de cerca de 2 s', () => {
    expect(SCORES.menu.steps).toBe(8 * 16);
    expect(SCORES.match.steps).toBe(8 * 16);
    expect(seconds(SCORES.menu)).toBeCloseTo(20, 1);
    expect(seconds(SCORES.match)).toBeCloseTo(14.55, 1);
    expect(seconds(SCORES.win)).toBeGreaterThan(1.5);
    expect(seconds(SCORES.win)).toBeLessThan(3);
    expect(seconds(SCORES.lose)).toBeGreaterThan(1.5);
    expect(seconds(SCORES.lose)).toBeLessThan(3);
  });

  it('as faixas diferem em andamento e as notas ficam em uma faixa audível', () => {
    expect(SCORES.match.bpm).toBeGreaterThan(SCORES.menu.bpm);
    for (const score of all) {
      for (const ch of score.channels) {
        for (const e of ch.events) {
          if (e.freq !== undefined) {
            expect(e.freq).toBeGreaterThan(50);
            expect(e.freq).toBeLessThan(2300);
          }
        }
      }
    }
  });

  it('o canal de ruído só existe como percussão', () => {
    for (const score of all) {
      for (const ch of score.channels.filter((c) => c.voice === 'noise')) {
        expect(ch.events.every((e) => e.drum !== undefined && e.freq === undefined)).toBe(true);
      }
    }
  });
});
