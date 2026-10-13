// Decisões puras do que tocar a partir do estado do jogo. O hook useGameAudio só as aplica.
import type { GameEvent, TeamKey } from '@pfl/engine';
import type { Screen } from '../app/screen';
import { revealFrom, type PanelMode } from '../match/matchState';
import type { AnimStep } from '../match/timeline';
import { cuesFor, readCue, type Cue, type TimedCue } from './cues';
import type { JingleName, MusicName } from './engine';

/** Folga depois do fim da animação em que um resultado ainda pode tocar. */
export const STALE_GRACE_MS = 1000;
/** Atraso do som da leitura em relação à revelação. */
export const READ_DELAY_MS = 250;

export function musicForScreen(screen: Screen): MusicName {
  return screen === 'MATCH' ? 'match' : 'menu';
}

export function jingleFor(score: Record<TeamKey, number>, you: TeamKey): JingleName | null {
  const other: TeamKey = you === 'A' ? 'B' : 'A';
  if (score[you] === score[other]) return null;
  return score[you] > score[other] ? 'win' : 'lose';
}

export interface AnimationAudioInput {
  events: readonly GameEvent[];
  steps: readonly AnimStep[];
  endsAt: number;
}

/**
 * Sons de uma jogada: revelação em t=0, leitura em +250 ms (se houver lado) e os passos da timeline.
 * `youAreOffense` é null quando não há lado (replay). Resultado velho demais devolve lista vazia.
 */
export function animationCues(a: AnimationAudioInput, youAreOffense: boolean | null, now: number): TimedCue[] {
  if (now > a.endsAt + STALE_GRACE_MS) return [];
  const cues: TimedCue[] = [];
  const reveal = revealFrom(a.events);
  if (reveal) {
    cues.push({ at: 0, cue: 'reveal' });
    if (reveal.read && youAreOffense !== null) cues.push({ at: READ_DELAY_MS, cue: readCue(reveal.read, youAreOffense) });
  }
  return [...cues, ...cuesFor(a.steps)];
}

export function replayCues(events: readonly GameEvent[], steps: readonly AnimStep[]): TimedCue[] {
  return animationCues({ events, steps, endsAt: Number.POSITIVE_INFINITY }, null, 0);
}

/** Toca ao entrar numa etapa em que o jogador precisa escolher. */
export function turnStartCue(prev: PanelMode | null, next: PanelMode): Cue | null {
  return next.startsWith('PICK_') && prev !== next ? 'turn-start' : null;
}
