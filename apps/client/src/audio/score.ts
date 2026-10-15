// Partitura em dados: cada canal é uma lista de compassos, e cada compasso tem 16 posições (semicolcheias)
// separadas por espaço. Token: nota ("C4", "F#3", "Bb2"), "." pausa, "-" sustenta a nota anterior.
// No canal de ruído: "k" bumbo, "s" caixa, "h" chimbal.

export type VoiceName = 'pulse1' | 'pulse2' | 'tri' | 'noise';
export type DrumKind = 'k' | 's' | 'h';

export const STEPS_PER_BAR = 16;
export const MAX_CHANNELS = 4;

export interface ChannelSource {
  voice: VoiceName;
  /** ciclo de trabalho da onda quadrada (pulse1 e pulse2), de 0 a 1 */
  duty?: number;
  /** multiplicador de volume do canal */
  gain?: number;
  /** um compasso por item */
  bars: string[];
}

export interface ScoreSource {
  bpm: number;
  channels: ChannelSource[];
}

export interface ScoreEvent {
  /** posição inicial em semicolcheias desde o começo da faixa */
  step: number;
  /** duração em semicolcheias */
  length: number;
  /** Hz (notas) */
  freq?: number;
  /** percussão (canal de ruído) */
  drum?: DrumKind;
}

export interface ScoreChannel {
  voice: VoiceName;
  duty: number;
  gain: number;
  events: ScoreEvent[];
}

export interface ParsedScore {
  bpm: number;
  steps: number;
  stepSeconds: number;
  channels: ScoreChannel[];
}

export class ScoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScoreError';
  }
}

const SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE = /^([A-G])(#|b)?(-?\d)$/;
const isDrum = (token: string): token is DrumKind => token === 'k' || token === 's' || token === 'h';

export function noteFrequency(token: string): number | null {
  const m = NOTE.exec(token);
  if (!m) return null;
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const midi = 12 * (Number(m[3]) + 1) + SEMITONE[m[1]] + accidental;
  return 440 * 2 ** ((midi - 69) / 12);
}

export function parseScore(src: ScoreSource): ParsedScore {
  if (!(src.bpm > 0)) throw new ScoreError(`bpm inválido: ${src.bpm}`);
  if (src.channels.length === 0 || src.channels.length > MAX_CHANNELS) {
    throw new ScoreError(`a partitura precisa de 1 a ${MAX_CHANNELS} canais; recebeu ${src.channels.length}`);
  }
  const bars = src.channels[0].bars.length;
  if (bars === 0) throw new ScoreError('a partitura precisa de pelo menos 1 compasso');

  const channels = src.channels.map((ch, ci): ScoreChannel => {
    const where = `canal ${ci} (${ch.voice})`;
    if (ch.bars.length !== bars) throw new ScoreError(`${where} tem ${ch.bars.length} compassos; esperado ${bars}`);
    const events: ScoreEvent[] = [];
    ch.bars.forEach((bar, bi) => {
      const tokens = bar.trim().split(/\s+/);
      if (tokens.length !== STEPS_PER_BAR) {
        throw new ScoreError(`${where}, compasso ${bi + 1}: ${tokens.length} posições; esperado ${STEPS_PER_BAR}`);
      }
      tokens.forEach((token, ti) => {
        const step = bi * STEPS_PER_BAR + ti;
        if (token === '.') return;
        if (token === '-') {
          const last = events.at(-1);
          if (ch.voice === 'noise') throw new ScoreError(`${where}, compasso ${bi + 1}: "-" não vale no canal de ruído`);
          if (!last || last.step + last.length !== step) {
            throw new ScoreError(`${where}, compasso ${bi + 1}: "-" sem nota para sustentar`);
          }
          last.length += 1;
          return;
        }
        if (ch.voice === 'noise') {
          if (!isDrum(token)) throw new ScoreError(`${where}, compasso ${bi + 1}: token "${token}" inválido no canal de ruído (use k, s ou h)`);
          events.push({ step, length: 1, drum: token });
          return;
        }
        const freq = noteFrequency(token);
        if (freq === null) throw new ScoreError(`${where}, compasso ${bi + 1}: nota "${token}" inválida`);
        events.push({ step, length: 1, freq });
      });
    });
    return { voice: ch.voice, duty: ch.duty ?? 0.5, gain: ch.gain ?? 1, events };
  });

  return { bpm: src.bpm, steps: bars * STEPS_PER_BAR, stepSeconds: 60 / src.bpm / 4, channels };
}
