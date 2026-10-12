import type { TeamKey } from '@pfl/engine';
import type { RoomState } from '@pfl/protocol';
import { isAnimating, type MatchClientState } from '../match/matchState';

export type LocalScreen = 'HOME' | 'BUILDER';
export type Screen = LocalScreen | 'LOBBY' | 'MATCH' | 'END';

interface ScreenInput {
  local: LocalScreen;
  room: RoomState | null;
  match: MatchClientState;
  now: number;
}

/** Decide a tela a partir do estado do servidor; a animação final termina antes da tela de fim. */
export function screenFor({ local, room, match, now }: ScreenInput): Screen {
  if (match.end) return isAnimating(match, now) ? 'MATCH' : 'END';
  if (room && (room.status === 'IN_MATCH' || room.status === 'PAUSED' || match.view !== null)) return 'MATCH';
  if (room) return 'LOBBY';
  return local;
}

export function namesFromRoom(room: RoomState): Record<TeamKey, string> {
  const name = (key: TeamKey) => room.players.find((p) => p.key === key)?.teamName ?? `Time ${key}`;
  return { A: name('A'), B: name('B') };
}
