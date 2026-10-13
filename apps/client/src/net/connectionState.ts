import { RECONNECT_GRACE_MS, type RoomState } from '@pfl/protocol';

/** Sem a primeira conexão por tanto tempo, o servidor provavelmente está dormindo (Render gratuito). */
export const WAKING_AFTER_MS = 4000;
/** Com o /health sem resposta, o aviso vem antes. */
export const WAKING_AFTER_HEALTH_DOWN_MS = 1500;
/** Tempo típico para o Render acordar; só orienta o texto. */
export const WAKING_ESTIMATE_MS = 60_000;

export type ConnectionState =
  | { kind: 'ok' }
  | { kind: 'waking'; elapsedMs: number }
  | { kind: 'reconnecting' }
  | { kind: 'paused' };

export interface ConnectionInput {
  connected: boolean;
  /** já houve ao menos uma conexão nesta aba */
  everConnected: boolean;
  /** quando a primeira tentativa começou (ms) */
  startedAt: number;
  now: number;
  /** o ping em /health falhou */
  healthDown: boolean;
  room: Pick<RoomState, 'status' | 'you' | 'players'> | null;
}

/** O meu lado desconectado (acordando/reconectando) vem antes da pausa por causa do adversário. */
export function connectionState(i: ConnectionInput): ConnectionState {
  if (!i.connected) {
    if (i.everConnected) return { kind: 'reconnecting' };
    const elapsedMs = Math.max(0, i.now - i.startedAt);
    const after = i.healthDown ? WAKING_AFTER_HEALTH_DOWN_MS : WAKING_AFTER_MS;
    return elapsedMs >= after ? { kind: 'waking', elapsedMs } : { kind: 'ok' };
  }
  const room = i.room;
  if (room) {
    if (room.status === 'PAUSED') return { kind: 'paused' };
    if (room.status === 'IN_MATCH' && room.players.some((p) => p.key !== room.you && !p.connected)) return { kind: 'paused' };
  }
  return { kind: 'ok' };
}

export interface ConnectionMessage {
  title: string;
  /** anunciado pelo leitor de tela; não muda a cada segundo */
  text: string;
  /** contador visual, escondido do leitor de tela */
  detail?: string;
}

export function connectionMessage(state: ConnectionState): ConnectionMessage | null {
  switch (state.kind) {
    case 'ok':
      return null;
    case 'waking':
      return {
        title: 'Servidor acordando',
        text: `O servidor gratuito dorme quando ninguém joga. Pode levar até ${WAKING_ESTIMATE_MS / 60_000} min.`,
        detail: `${Math.round(state.elapsedMs / 1000)} s`,
      };
    case 'reconnecting':
      return { title: 'Reconectando', text: 'Sem conexão com o servidor. Suas jogadas voltam quando a conexão voltar.' };
    case 'paused':
      return {
        title: 'Partida pausada',
        text: `Adversário desconectado. Aguardando a reconexão (até ${RECONNECT_GRACE_MS / 1000} s).`,
      };
  }
}
