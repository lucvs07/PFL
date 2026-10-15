// Contrato entre servidor (Plano 3) e cliente (Plano 4). Ver docs/superpowers/plans/2026-10-10-pfl-contracts.md, seção 3.
import type { Action, FormationId, GameEvent, PackageId, Phase, PlayerView, Team, TeamError, TeamKey } from '@pfl/engine';

export const ROOM_CODE_LENGTH = 6; // letras A–Z sem I/O
/** Alfabeto do código de sala: A–Z sem I e O (evita confusão com 1 e 0). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const PHASE_SECONDS: Record<Exclude<Phase, 'MATCH_END'>, number> = {
  FORMATION: 5,
  PACKAGE: 4,
  PLAYCALL: 8,
  CONVERSION: 8,
};
export const RESULT_ANIMATION_MS = 4500; // folga antes do próximo timer após match:result
export const RECONNECT_GRACE_MS = 60_000;
export const BOTH_DISCONNECTED_CLOSE_MS = 5 * 60_000;

export type RoomStatus = 'WAITING' | 'IN_MATCH' | 'PAUSED' | 'FINISHED';
export interface RoomPlayer {
  key: TeamKey;
  connected: boolean;
  ready: boolean;
  teamName: string | null;
  teamErrors: TeamError[];
  /** Elenco do time válido enviado (os dois jogadores veem o do adversário no lobby); vazio sem time válido. */
  roster: number[];
  /** Espécie de destaque do time (QB titular) ou null sem time válido. */
  lead: number | null;
  /** Custo total do time válido ou null. */
  cost: number | null;
}
export interface RoomState {
  code: string;
  you: TeamKey;
  status: RoomStatus;
  players: RoomPlayer[];
}

export interface PhaseMessage {
  turnId: number;
  phase: Phase;
  deadline: number /* epoch ms */;
  view: PlayerView;
}
/** Após FORMATION/PACKAGE. */
export interface RevealMessage {
  turnId: number;
  events: GameEvent[];
}
/** Após resolução/conversão. */
export interface ResultMessage {
  turnId: number;
  events: GameEvent[];
  view: PlayerView;
}
export interface PokemonMatchStats {
  speciesId: number;
  team: TeamKey;
  plays: number;
  yards: number;
  touchdowns: number;
}
export interface MatchStats {
  pokemon: PokemonMatchStats[];
  yards: Record<TeamKey, number>;
  turnovers: Record<TeamKey, number>;
  sacks: Record<TeamKey, number>;
}
export interface ReplayData {
  seed: number;
  teams: Record<TeamKey, Team>;
  actions: Action[];
}
export interface EndMessage {
  score: Record<TeamKey, number>;
  stats: MatchStats;
  replay: ReplayData;
}

export type ErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'NOT_IN_ROOM'
  | 'INVALID_TEAM_CODE'
  | 'TEAM_INVALID'
  | 'NOT_READY'
  | 'STALE_TURN'
  | 'ENGINE_ERROR'
  /** teto de salas abertas atingido; tente de novo mais tarde */
  | 'SERVER_BUSY';
export interface ErrorMessage {
  code: ErrorCode;
  message: string;
}

export type Ack<T> = (res: { ok: true; data: T } | { ok: false; error: ErrorMessage }) => void;

export interface ClientToServerEvents {
  'room:create': (ack: Ack<{ code: string; you: TeamKey; token: string }>) => void;
  'room:join': (p: { code: string; token?: string }, ack: Ack<{ code: string; you: TeamKey; token: string }>) => void;
  'team:submit': (p: { teamCode: string }) => void;
  'room:ready': (p: { ready: boolean }) => void;
  'play:formation': (p: { turnId: number; formation: FormationId }) => void;
  'play:package': (p: { turnId: number; package: PackageId }) => void;
  'play:card': (p: { turnId: number; cardId: string }) => void;
  'play:conversion': (p: { turnId: number; choice: 'PAT' | 'TWO' }) => void;
  'team:depth': (p: { turnId: number; depth: Team['depth']; keepOnField: number[] }) => void;
  'match:resync': () => void;
}

export interface ServerToClientEvents {
  'room:state': (s: RoomState) => void;
  'match:phase': (m: PhaseMessage) => void;
  'match:reveal': (m: RevealMessage) => void;
  'match:result': (m: ResultMessage) => void;
  'match:end': (m: EndMessage) => void;
  'error': (e: ErrorMessage) => void;
}
