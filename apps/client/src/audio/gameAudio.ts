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

/**
 * Decide os sons de uma animação, uma única vez por `seq`: o efeito do React pode rodar de novo (StrictMode,
 * mudança de `room`) com a mesma animação. Devolve o novo contador a guardar. Sem animação, zera o contador.
 */
export function planAnimationSound(
  lastSeq: number,
  a: (AnimationAudioInput & { seq: number; stage: { offenseTeam: TeamKey } }) | null,
  you: TeamKey | null,
  now: number,
): { seq: number; cues: TimedCue[] } {
  if (!a) return { seq: 0, cues: [] };
  if (a.seq === lastSeq) return { seq: lastSeq, cues: [] };
  return { seq: a.seq, cues: animationCues(a, you === null ? null : a.stage.offenseTeam === you, now) };
}

/** O replay mostra o 1º quadro ao montar a tela de fim (seq 1); esse quadro não soa por cima do jingle. */
export function shouldSoundReplay(seq: number): boolean {
  return seq > 1;
}

/** Toca ao entrar numa etapa em que o jogador precisa escolher. */
export function turnStartCue(prev: PanelMode | null, next: PanelMode): Cue | null {
  return next.startsWith('PICK_') && prev !== next ? 'turn-start' : null;
}
