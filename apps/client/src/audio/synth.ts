import type { AudioBackend, Wave } from './backend';

export interface VoiceSpec {
  wave: Wave;
  duty?: number;
  freq: number;
  freqEnd?: number;
  /** atraso em segundos desde o início do cue */
  delay: number;
  duration: number;
  gain: number;
}

export type Recipe = readonly VoiceSpec[];

export function recipeDuration(recipe: Recipe): number {
  return recipe.reduce((max, v) => Math.max(max, v.delay + v.duration), 0);
}

export function scheduleRecipe(backend: AudioBackend, recipe: Recipe, when: number): void {
  for (const v of recipe) {
    backend.playTone('sfx', {
      wave: v.wave,
      duty: v.duty,
      freq: v.freq,
      freqEnd: v.freqEnd,
      start: when + v.delay,
      duration: v.duration,
      gain: v.gain,
    });
  }
}
