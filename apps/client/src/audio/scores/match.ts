// Partida: 132 bpm, lá menor, 8 compassos (Am | F | C | G | Am | F | G | E). Obra original do projeto.
import type { ScoreSource } from '../score';
import { arp8, bars, bass8 } from './helpers';

export const MATCH: ScoreSource = {
  bpm: 132,
  channels: [
    {
      voice: 'pulse1',
      duty: 0.25,
      bars: [
        'A4 . A4 C5 . E5 . C5 A4 . A4 C5 E5 . D5 .',
        'A4 . A4 C5 . F5 . C5 A4 . A4 C5 F5 . E5 .',
        'G4 . G4 C5 . E5 . C5 G4 . G4 C5 E5 . D5 .',
        'G4 . G4 B4 . D5 . B4 G4 . G4 B4 D5 . C5 .',
        'E5 . E5 . D5 . C5 . A4 . C5 . E5 - - .',
        'F5 . F5 . E5 . C5 . A4 . C5 . F5 - - .',
        'D5 . D5 . B4 . G4 . B4 . D5 . G5 - - .',
        'E5 . D5 . B4 . G#4 . B4 . D5 . E5 - - -',
      ],
    },
    {
      voice: 'pulse2',
      duty: 0.5,
      gain: 0.6,
      bars: [
        arp8('A3', 'C4', 'E4'), arp8('F3', 'A3', 'C4'), arp8('C4', 'E4', 'G4'), arp8('G3', 'B3', 'D4'),
        arp8('A3', 'C4', 'E4'), arp8('F3', 'A3', 'C4'), arp8('G3', 'B3', 'D4'), arp8('E3', 'G#3', 'B3'),
      ],
    },
    {
      voice: 'tri',
      bars: [bass8('A2'), bass8('F2'), bass8('C3'), bass8('G2'), bass8('A2'), bass8('F2'), bass8('G2'), bass8('E2')],
    },
    { voice: 'noise', gain: 0.55, bars: bars('k . h . s . h . k . h . s . h h', 8) },
  ],
};
