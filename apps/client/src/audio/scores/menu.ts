// Menu e lobby: 96 bpm, dó maior, 8 compassos (C | Am | F | G | C | Am | F | G). Obra original do projeto.
import type { ScoreSource } from '../score';
import { arp16, bars, bass2 } from './helpers';

export const MENU: ScoreSource = {
  bpm: 96,
  channels: [
    {
      voice: 'pulse1',
      duty: 0.5,
      bars: [
        'E5 - - . G5 - - . E5 - D5 - C5 - - .',
        'A4 - - . C5 - - . E5 - D5 - C5 - - .',
        'A4 - - . C5 - - . F5 - E5 - C5 - - .',
        'B4 - - . D5 - - . G5 - F5 - D5 - - .',
        'E5 - - . G5 - - . C6 - B5 - G5 - - .',
        'A5 - - . G5 - - . E5 - D5 - E5 - - .',
        'F5 - - . E5 - - . C5 - D5 - E5 - F5 -',
        'D5 - - - B4 - - - G4 - - - . . . .',
      ],
    },
    {
      voice: 'pulse2',
      duty: 0.25,
      gain: 0.6,
      bars: [
        arp16('C4', 'E4', 'G4'), arp16('A3', 'C4', 'E4'), arp16('F3', 'A3', 'C4'), arp16('G3', 'B3', 'D4'),
        arp16('C4', 'E4', 'G4'), arp16('A3', 'C4', 'E4'), arp16('F3', 'A3', 'C4'), arp16('G3', 'B3', 'D4'),
      ],
    },
    {
      voice: 'tri',
      bars: [
        bass2('C3', 'G2'), bass2('A2', 'E2'), bass2('F2', 'C3'), bass2('G2', 'D3'),
        bass2('C3', 'G2'), bass2('A2', 'E2'), bass2('F2', 'C3'), bass2('G2', 'D3'),
      ],
    },
    { voice: 'noise', gain: 0.5, bars: bars('k . . . h . . . h . . . h . . .', 8) },
  ],
};
