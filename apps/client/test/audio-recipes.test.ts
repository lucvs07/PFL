import { describe, expect, it } from 'vitest';
import { CUES } from '../src/audio/cues';
import { RECIPES } from '../src/audio/recipes';
import { recipeDuration, scheduleRecipe } from '../src/audio/synth';
import { FakeBackend } from './audio-fakes';

describe('RECIPES', () => {
  it('todo cue tem receita válida', () => {
    for (const cue of CUES) {
      const recipe = RECIPES[cue];
      expect(recipe, cue).toBeDefined();
      expect(recipe.length, cue).toBeGreaterThan(0);
      expect(recipe.length, cue).toBeLessThanOrEqual(8);
      for (const v of recipe) {
        expect(v.freq, cue).toBeGreaterThan(0);
        if (v.freqEnd !== undefined) expect(v.freqEnd, cue).toBeGreaterThan(0);
        expect(v.duration, cue).toBeGreaterThan(0);
        expect(v.delay, cue).toBeGreaterThanOrEqual(0);
        expect(v.gain, cue).toBeGreaterThan(0);
        expect(v.gain, cue).toBeLessThanOrEqual(1);
      }
      expect(recipeDuration(recipe), cue).toBeLessThanOrEqual(1.5);
    }
  });

  it('a fanfarra do touchdown é o som mais longo da jogada', () => {
    expect(recipeDuration(RECIPES.td)).toBeGreaterThan(recipeDuration(RECIPES['banner-good']));
    expect(recipeDuration(RECIPES.td)).toBeGreaterThan(0.8);
  });
});

describe('scheduleRecipe', () => {
  it('agenda cada voz no canal sfx a partir de `when`', () => {
    const backend = new FakeBackend();
    scheduleRecipe(backend, RECIPES.turnover, 2);
    expect(backend.tones).toHaveLength(RECIPES.turnover.length);
    expect(backend.tones.every((t) => t.channel === 'sfx')).toBe(true);
    RECIPES.turnover.forEach((v, i) => {
      expect(backend.tones[i].tone.start).toBeCloseTo(2 + v.delay, 9);
      expect(backend.tones[i].tone.freq).toBe(v.freq);
    });
  });

  it('recipeDuration é o maior atraso + duração', () => {
    expect(recipeDuration([{ wave: 'square', freq: 440, delay: 0, duration: 0.1, gain: 0.5 }, { wave: 'square', freq: 440, delay: 0.3, duration: 0.2, gain: 0.5 }])).toBeCloseTo(0.5, 9);
    expect(recipeDuration([])).toBe(0);
  });
});
