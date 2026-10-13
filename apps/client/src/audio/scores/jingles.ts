// Jingles de fim de jogo, tocados uma vez. Obras originais do projeto.
import type { ScoreSource } from '../score';
import { bass2, hold } from './helpers';

/** Vitória: 200 bpm, 2 compassos (~2,4 s), escala ascendente em dó maior. */
export const WIN: ScoreSource = {
  bpm: 200,
  channels: [
    {
      voice: 'pulse1',
      duty: 0.5,
      bars: ['C5 . E5 . G5 . C6 . G5 . E5 . G5 . C6 .', 'C6 - - - E6 - - - G6 - - - C7 - - -'],
    },
    {
      voice: 'pulse2',
      duty: 0.25,
      gain: 0.6,
      bars: ['E4 . G4 . C5 . E5 . C5 . G4 . C5 . E5 .', 'G5 - - - C6 - - - E6 - - - G6 - - -'],
    },
    { voice: 'tri', bars: [bass2('C3', 'G2'), hold('C3')] },
    { voice: 'noise', gain: 0.5, bars: ['k . . . s . . . k . . . s . s s', 'k . . . . . . . . . . . . . . .'] },
  ],
};

/** Derrota: 110 bpm, 1 compasso (~2,2 s), descendo para lá menor. */
export const LOSE: ScoreSource = {
  bpm: 110,
  channels: [
    { voice: 'pulse1', duty: 0.5, bars: ['E5 - - - C5 - - - B4 - - - A4 - - -'] },
    { voice: 'pulse2', duty: 0.25, gain: 0.6, bars: ['C5 - - - A4 - - - G#4 - - - E4 - - -'] },
    { voice: 'tri', bars: [hold('A2')] },
  ],
};
