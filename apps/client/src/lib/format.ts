import type { FieldState, Phase, PlayerView } from '@pfl/engine';
import { PHASE_SECONDS, RESULT_ANIMATION_MS } from '@pfl/protocol';

const ORDINALS = ['1st', '2nd', '3rd', '4th'];

/** "2nd & 6", "3rd & Goal" ou "Conversão de 2" (HUD da spec 6.2). */
export function formatDown(field: FieldState, conversionAttempt: boolean): string {
  if (conversionAttempt) return 'Conversão de 2';
  const ordinal = ORDINALS[field.down - 1] ?? `${field.down}th`;
  const goal = field.ballOn + field.yardsToGo >= 100;
  return `${ordinal} & ${goal ? 'Goal' : field.yardsToGo}`;
}

/** ballOn é do ponto de vista do ataque: 0 = própria end zone, 100 = end zone adversária. */
export function formatBallOn(ballOn: number): string {
  if (ballOn === 50) return '50';
  return ballOn < 50 ? `OWN ${ballOn}` : `OPP ${100 - ballOn}`;
}

export function formatPossession(
  view: Pick<PlayerView, 'possessions' | 'offense' | 'possessionsPerTeam' | 'overtimeRound'>,
): string {
  if (view.overtimeRound > 0) return `Prorrogação ${view.overtimeRound}`;
  return `Posse ${view.possessions[view.offense]}/${view.possessionsPerTeam}`;
}

/**
 * Segundos restantes até o deadline (epoch ms do servidor). O teto é a duração da etapa mais a folga da
 * animação, porque o relógio do cliente pode estar adiantado ou atrasado em relação ao servidor.
 */
export function secondsLeft(phase: Phase, deadline: number, now: number): number {
  if (phase === 'MATCH_END') return 0;
  const max = PHASE_SECONDS[phase] + Math.ceil(RESULT_ANIMATION_MS / 1000);
  return Math.min(max, Math.max(0, Math.ceil((deadline - now) / 1000)));
}

export const PHASE_LABELS: Record<Phase, string> = {
  FORMATION: 'Formação',
  PACKAGE: 'Pacote',
  PLAYCALL: 'Carta',
  CONVERSION: 'Conversão',
  MATCH_END: 'Fim de jogo',
};
