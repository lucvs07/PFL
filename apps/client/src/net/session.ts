import type { TeamKey } from '@pfl/engine';
import { ROOM_CODE_LENGTH, type ErrorCode, type ErrorMessage } from '@pfl/protocol';
import { readJson, removeKey, writeJson, type StorageLike } from '../lib/storage';

export const SESSION_KEY = 'pfl:session:v1';

/** Fica no sessionStorage (por aba): duas abas do mesmo navegador são dois jogadores. */
export interface Session {
  code: string;
  token: string;
  you: TeamKey;
  /** time enviado ao lobby, para a aba recarregada reconstruir prévias e o depth chart */
  teamCode: string | null;
}

const ROOM_LETTERS = /^[A-HJ-NP-Z]+$/; // A–Z sem I e O

export function normalizeRoomCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  return code.length === ROOM_CODE_LENGTH && ROOM_LETTERS.test(code) ? code : null;
}

export function loadSession(storage: StorageLike | null): Session | null {
  const raw = readJson(storage, SESSION_KEY);
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const code = r.code;
  const token = r.token;
  const you = r.you;
  if (typeof code !== 'string' || normalizeRoomCode(code) !== code) return null;
  if (typeof token !== 'string' || token.length === 0) return null;
  if (you !== 'A' && you !== 'B') return null;
  return { code, token, you, teamCode: typeof r.teamCode === 'string' ? r.teamCode : null };
}

export function saveSession(storage: StorageLike | null, session: Session): boolean {
  return writeJson(storage, SESSION_KEY, session);
}

export function clearSession(storage: StorageLike | null): void {
  removeKey(storage, SESSION_KEY);
}

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  ROOM_NOT_FOUND: 'Sala não encontrada. Confira o código.',
  ROOM_FULL: 'Essa sala já tem dois jogadores.',
  NOT_IN_ROOM: 'Você não está nessa sala.',
  INVALID_TEAM_CODE: 'O servidor não conseguiu ler o código do time.',
  TEAM_INVALID: 'O servidor recusou o time. Veja os motivos no lobby.',
  NOT_READY: 'A partida não está aceitando essa ação agora (pausada, encerrada ou ainda não começou).',
  STALE_TURN: 'Essa ação chegou atrasada.',
  ENGINE_ERROR: 'Ação recusada pelo servidor.',
  SERVER_BUSY: 'O servidor está cheio agora. Tente de novo em alguns minutos.',
};

/** Códigos do engine que chegam em ENGINE_ERROR.message e merecem texto próprio. */
const ENGINE_NOTICES: Record<string, string> = {
  INVALID_DEPTH: 'O servidor recusou o depth chart: ele deixaria o time inválido.',
  DEPTH_LOCKED: 'O depth chart só pode ser ajustado no primeiro snap do seu drive; ele será reenviado no próximo.',
};

export interface ErrorReaction {
  notice: string | null;
  resync: boolean;
  leaveRoom: boolean;
  /** reenviar room:join com o token (o socket novo ainda não está na sala) */
  rejoin: boolean;
}

/** Spec 8: ação inválida → o client faz match:resync. STALE_TURN: o servidor já reenvia a fase. */
export function errorReaction(e: ErrorMessage): ErrorReaction {
  switch (e.code) {
    case 'STALE_TURN':
      return { notice: null, resync: false, leaveRoom: false, rejoin: false };
    case 'ENGINE_ERROR': {
      const known = Object.keys(ENGINE_NOTICES).find((code) => e.message.includes(code));
      return { notice: known ? ENGINE_NOTICES[known] : `Ação recusada: ${e.message}`, resync: true, leaveRoom: false, rejoin: false };
    }
    case 'ROOM_NOT_FOUND':
    case 'ROOM_FULL':
      return { notice: ERROR_MESSAGES[e.code], resync: false, leaveRoom: true, rejoin: false };
    case 'NOT_IN_ROOM':
      // O socket.io-client descarrega emits em buffer antes do 'connect'; o servidor responde
      // NOT_IN_ROOM no socket novo, antes do room:join de retomada. Não é motivo para sair.
      return { notice: null, resync: false, leaveRoom: false, rejoin: true };
    default:
      return { notice: ERROR_MESSAGES[e.code] ?? e.message, resync: false, leaveRoom: false, rejoin: false };
  }
}

/** Falha devolvida pelo ack de room:create/room:join. */
export class AckError extends Error {
  readonly error: ErrorMessage;

  constructor(error: ErrorMessage) {
    super(error.message);
    this.name = 'AckError';
    this.error = error;
  }
}

export function describeFailure(err: unknown): string {
  if (err instanceof AckError) {
    // No ack, ENGINE_ERROR significa que o handler de room:create/room:join quebrou.
    if (err.error.code === 'ENGINE_ERROR') return 'O servidor falhou ao abrir a sala. Tente de novo.';
    return ERROR_MESSAGES[err.error.code] ?? err.error.message;
  }
  if (err instanceof Error) return err.message;
  return 'Erro inesperado.';
}

/** Destino de um room:join de retomada que falhou: join antigo é ignorado; só recusa do servidor apaga a sessão. */
export function rejoinFailure(err: unknown, current: boolean): 'ignore' | 'clear' | 'keep' {
  if (!current) return 'ignore';
  return err instanceof AckError ? 'clear' : 'keep';
}
