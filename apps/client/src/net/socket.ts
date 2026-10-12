// Camada fina sobre o socket.io-client, tipada pelo @pfl/protocol. Sem lógica de jogo.
import { io, type Socket } from 'socket.io-client';
import type { TeamKey } from '@pfl/engine';
import type { ClientToServerEvents, ErrorMessage, ServerToClientEvents } from '@pfl/protocol';
import { AckError } from './session';

export type PflSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface Joined {
  code: string;
  you: TeamKey;
  token: string;
}

export const ACK_TIMEOUT_MS = 8000;

export function serverUrl(): string {
  return import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
}

/** Só WebSocket: evita depender de CORS no long-polling entre :5173 e :3001. */
export function createSocket(url: string = serverUrl()): PflSocket {
  return io(url, { transports: ['websocket'], reconnection: true, reconnectionDelay: 500, reconnectionDelayMax: 3000 });
}

/**
 * Emite só com o socket conectado e informa se emitiu. Offline o socket.io-client põe o emit em
 * buffer e o descarrega antes do 'connect', ou seja, antes do room:join de retomada.
 */
export function emitIfConnected<E extends keyof ClientToServerEvents>(
  socket: PflSocket,
  event: E,
  ...args: Parameters<ClientToServerEvents[E]>
): boolean {
  if (!socket.connected) return false;
  socket.emit(event, ...args);
  return true;
}

type AckResult<T> = { ok: true; data: T } | { ok: false; error: ErrorMessage };

function awaitAck<T>(send: (ack: (res: AckResult<T>) => void) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('O servidor não respondeu. Tente de novo.')), ACK_TIMEOUT_MS);
    send((res) => {
      clearTimeout(timer);
      if (res.ok) resolve(res.data);
      else reject(new AckError(res.error));
    });
  });
}

export function createRoom(socket: PflSocket): Promise<Joined> {
  return awaitAck<Joined>((ack) => socket.emit('room:create', ack));
}

export function joinRoom(socket: PflSocket, code: string, token?: string): Promise<Joined> {
  return awaitAck<Joined>((ack) => socket.emit('room:join', token ? { code, token } : { code }, ack));
}
