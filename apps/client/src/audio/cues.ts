import type { ReadResult } from '@pfl/engine';
import { TOUCHDOWN_BANNER, type AnimStep } from '../match/timeline';

export const CUES = [
  'snap', 'block', 'clash', 'clash-super', 'clash-weak', 'clash-immune',
  'throw', 'run', 'run-big', 'tackle', 'incomplete', 'sack', 'turnover',
  'kick', 'kick-good', 'kick-miss',
  'banner-good', 'banner-bad', 'banner-info', 'td',
  'reveal', 'read-good', 'read-neutral', 'read-bad', 'turn-start',
  'ui-click', 'ui-select', 'ui-back', 'ui-error',
] as const;

export type Cue = (typeof CUES)[number];

/** `at` em ms desde o início da animação (o mesmo `at` do AnimStep). */
export interface TimedCue {
  at: number;
  cue: Cue;
}

function cueForStep(step: AnimStep): Cue | null {
  switch (step.kind) {
    case 'SNAP':
      return 'snap';
    case 'BLOCK':
      return 'block';
    case 'CLASH':
      if (step.effect === 'SUPER') return 'clash-super';
      if (step.effect === 'WEAK') return 'clash-weak';
      if (step.effect === 'IMMUNE') return 'clash-immune';
      return 'clash';
    case 'THROW':
      return 'throw';
    case 'RUN':
      return step.big ? 'run-big' : 'run';
    case 'TACKLE':
      return 'tackle';
    case 'INCOMPLETE':
      return 'incomplete';
    case 'SACK':
      return 'sack';
    case 'TURNOVER':
      return 'turnover';
    case 'KICK':
      return step.good === null ? 'kick' : step.good ? 'kick-good' : 'kick-miss';
    case 'BANNER':
      if (step.text === TOUCHDOWN_BANNER) return 'td';
      return step.tone === 'good' ? 'banner-good' : step.tone === 'bad' ? 'banner-bad' : 'banner-info';
  }
}

export function cuesFor(steps: readonly AnimStep[]): TimedCue[] {
  return steps.flatMap((s) => {
    const cue = cueForStep(s);
    return cue ? [{ at: s.at, cue }] : [];
  });
}

/**
 * A leitura (✔/·/✖) é do ponto de vista da defesa: RIGHT = a defesa acertou. O som é do ponto de vista de
 * quem joga: defesa certa é boa para a defesa e ruim para o ataque.
 */
export function readCue(read: ReadResult, youAreOffense: boolean): Cue {
  if (read === 'NEUTRAL') return 'read-neutral';
  const goodForDefense = read === 'RIGHT';
  return goodForDefense === youAreOffense ? 'read-bad' : 'read-good';
}
