// Cada cue é uma lista de vozes: onda quadrada, triangular ou ruído filtrado. Para ajustar um som, edite os números.
import type { Cue } from './cues';
import type { Recipe, VoiceSpec } from './synth';

const sq = (freq: number, delay: number, duration: number, gain: number, freqEnd?: number, duty = 0.5): VoiceSpec => ({
  wave: 'square', duty, freq, freqEnd, delay, duration, gain,
});
const tri = (freq: number, delay: number, duration: number, gain: number, freqEnd?: number): VoiceSpec => ({
  wave: 'triangle', freq, freqEnd, delay, duration, gain,
});
const nz = (freq: number, delay: number, duration: number, gain: number, freqEnd?: number): VoiceSpec => ({
  wave: 'noise', freq, freqEnd, delay, duration, gain,
});

const KICK_SOUND: Recipe = [nz(2000, 0, 0.06, 0.5, 800), tri(180, 0, 0.12, 0.7, 70)];

export const RECIPES: Record<Cue, Recipe> = {
  // jogada
  snap: [nz(2500, 0, 0.05, 0.5, 1200)],
  block: [tri(110, 0, 0.12, 0.8, 60), nz(500, 0, 0.08, 0.4, 200)],
  clash: [sq(220, 0, 0.14, 0.5, 110), nz(900, 0, 0.1, 0.4, 300)],
  'clash-super': [sq(330, 0, 0.18, 0.5, 880), sq(660, 0.1, 0.22, 0.4, 1320), nz(1200, 0, 0.08, 0.3)],
  'clash-weak': [sq(330, 0, 0.2, 0.5, 110), nz(400, 0, 0.12, 0.3, 150)],
  'clash-immune': [tri(160, 0, 0.25, 0.5, 90)],
  throw: [sq(300, 0, 0.18, 0.3, 1200)],
  run: [nz(700, 0, 0.04, 0.35), nz(700, 0.09, 0.04, 0.35), nz(700, 0.18, 0.04, 0.35)],
  'run-big': [sq(523.25, 0, 0.08, 0.4), sq(659.25, 0.07, 0.08, 0.4), sq(783.99, 0.14, 0.08, 0.4), sq(1046.5, 0.21, 0.12, 0.4)],
  tackle: [nz(1500, 0, 0.12, 0.6, 200), tri(120, 0, 0.1, 0.7, 60)],
  incomplete: [sq(392, 0, 0.12, 0.4), sq(311, 0.14, 0.2, 0.4)],
  sack: [tri(140, 0, 0.3, 0.9, 40), nz(800, 0, 0.25, 0.6, 150)],
  turnover: [sq(523, 0, 0.12, 0.45), sq(415, 0.13, 0.12, 0.45), sq(311, 0.26, 0.25, 0.45)],
  kick: KICK_SOUND,
  'kick-good': [...KICK_SOUND, sq(784, 0.25, 0.1, 0.45), sq(1046, 0.35, 0.2, 0.45)],
  'kick-miss': [...KICK_SOUND, sq(300, 0.25, 0.3, 0.45, 150)],
  'banner-good': [sq(523, 0, 0.09, 0.4), sq(659, 0.09, 0.09, 0.4), sq(784, 0.18, 0.2, 0.4)],
  'banner-bad': [sq(311, 0, 0.12, 0.4), sq(233, 0.12, 0.25, 0.4)],
  'banner-info': [sq(880, 0, 0.07, 0.35), sq(1175, 0.07, 0.1, 0.35)],
  td: [
    sq(523, 0, 0.1, 0.45), sq(659, 0.1, 0.1, 0.45), sq(784, 0.2, 0.1, 0.45), sq(1046, 0.3, 0.25, 0.45),
    sq(784, 0.55, 0.1, 0.45), sq(1046, 0.65, 0.35, 0.45),
    tri(131, 0, 0.5, 0.6), tri(196, 0.55, 0.45, 0.6),
  ],
  // revelação, leitura e vez
  reveal: [nz(3000, 0, 0.04, 0.4, 1000), sq(660, 0.03, 0.08, 0.35, 990)],
  'read-good': [sq(880, 0, 0.08, 0.4), sq(1318, 0.08, 0.14, 0.4)],
  'read-neutral': [sq(660, 0, 0.1, 0.3)],
  'read-bad': [sq(262, 0, 0.12, 0.45, 196), sq(196, 0.12, 0.2, 0.45, 147)],
  'turn-start': [sq(988, 0, 0.06, 0.3), sq(1318, 0.07, 0.08, 0.3)],
  // interface
  'ui-click': [sq(1200, 0, 0.03, 0.3)],
  'ui-select': [sq(900, 0, 0.04, 0.3), sq(1350, 0.04, 0.05, 0.3)],
  'ui-error': [sq(180, 0, 0.1, 0.5), sq(150, 0.11, 0.15, 0.5)],
};
