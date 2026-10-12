import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server, type Socket } from 'socket.io';
import type { TeamKey } from '@pfl/engine';
import type { Ack, ClientToServerEvents, ErrorCode, ServerToClientEvents } from '@pfl/protocol';
import { normalizeRoomCode } from './codes';
import { originAllowed } from './config';
import type { Outgoing } from './outgoing';
import { parsePlay, type PlayEvent } from './parse';
import type { Room } from './room';
import { RoomManager } from './rooms';
import { realScheduler, resolveTimings, type Scheduler, type TimingsInput } from './timings';

interface SocketData {
  code: string | null;
  key: TeamKey | null;
}
export type PflIo = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type PflSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type SeatAck = Ack<{ code: string; you: TeamKey; token: string }>;

export interface PflServerOptions {
  /** padrão 0 (porta livre); main.ts usa 3001 */
  port?: number;
  host?: string;
  /** timers curtos nos testes */
  timings?: TimingsInput;
  /** relógio e timers injetáveis */
  scheduler?: Scheduler;
  /** códigos de sala e seed da partida */
  random?: () => number;
  newToken?: () => string;
  /** padrão true: reflete a origem (o cliente Vite roda em outra porta) */
  corsOrigin?: string | string[] | boolean;
}

export interface PflServer {
  port: number;
  io: PflIo;
  rooms: RoomManager;
  close(): Promise<void>;
}

function deliver(socket: PflSocket, msg: Outgoing): void {
  (socket.emit as unknown as (event: string, payload: unknown) => boolean).call(socket, msg.event, msg.payload);
}

const field = (payload: unknown, name: string): unknown =>
  typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>)[name] : undefined;

export async function createPflServer(options: PflServerOptions = {}): Promise<PflServer> {
  // O Socket.IO assume só /socket.io; o resto cai neste handler (healthcheck do Render/compose).
  const httpServer = createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0];
    if (path === '/health' && (req.method === 'GET' || req.method === 'HEAD')) {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(req.method === 'HEAD' ? undefined : 'ok');
      return;
    }
    res.writeHead(404);
    res.end();
  });
  const io: PflIo = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
    cors: { origin: options.corsOrigin ?? true },
    allowRequest: (req, callback) => callback(null, originAllowed(options.corsOrigin ?? true, req.headers.origin)),
    // um código de time tem ~2 KB; o padrão de 1 MB deixaria um jogador sobrecarregar o processo
    maxHttpBufferSize: 64 * 1024,
  });

  const rooms: RoomManager = new RoomManager({
    scheduler: options.scheduler ?? realScheduler,
    timings: resolveTimings(options.timings),
    random: options.random ?? Math.random,
    newToken: options.newToken ?? randomUUID,
    send: (code, to, msg) => {
      const connId = rooms.get(code)?.connectionOf(to);
      const socket = connId ? io.sockets.sockets.get(connId) : undefined;
      if (socket) deliver(socket, msg);
    },
    onRoomClosed: (code) => {
      for (const socket of io.sockets.sockets.values()) {
        if (socket.data.code === code) {
          socket.data.code = null;
          socket.data.key = null;
        }
      }
    },
  });

  io.on('connection', (socket: PflSocket) => {
    socket.data.code = null;
    socket.data.key = null;

    const fail = (code: ErrorCode, message: string): void => {
      socket.emit('error', { code, message });
    };
    /** Nenhum handler pode derrubar o processo. */
    const guard =
      <A extends unknown[]>(fn: (...args: A) => void) =>
      (...args: A): void => {
        try {
          fn(...args);
        } catch (err) {
          console.error('[pfl] erro no handler', err);
          fail('ENGINE_ERROR', 'Erro interno');
        }
      };
    /** Como guard, mas o ack sempre é respondido: se o handler lançar antes de responder, devolve ENGINE_ERROR. */
    const guardAck =
      <A extends unknown[]>(fn: (answered: { done: boolean }, ...args: A) => void, ackOf: (args: A) => unknown) =>
      (...args: A): void => {
        const answered = { done: false };
        try {
          fn(answered, ...args);
        } catch (err) {
          console.error('[pfl] erro no handler', err);
          fail('ENGINE_ERROR', 'Erro interno');
          const ack = ackOf(args);
          if (typeof ack === 'function' && !answered.done) {
            answered.done = true;
            (ack as SeatAck)({ ok: false, error: { code: 'ENGINE_ERROR', message: 'Erro interno' } });
          }
        }
      };
    const current = (): { room: Room; key: TeamKey } | null => {
      const room = socket.data.code ? rooms.get(socket.data.code) : undefined;
      return room && socket.data.key ? { room, key: socket.data.key } : null;
    };
    const bound = (): { room: Room; key: TeamKey } | null => {
      const b = current();
      if (!b) fail('NOT_IN_ROOM', 'Entre numa sala primeiro');
      return b;
    };
    /** `voluntary`: o socket foi para outra sala (uma sala de lobby que fica vazia fecha na hora). */
    const leave = (voluntary = false): void => {
      const b = current();
      if (b && voluntary) b.room.leave(b.key, socket.id);
      else if (b) b.room.disconnect(b.key, socket.id);
      socket.data.code = null;
      socket.data.key = null;
    };
    const bind = (room: Room, key: TeamKey): void => {
      if (room.isClosed) return;
      socket.data.code = room.code;
      socket.data.key = key;
      const previous = room.connect(key, socket.id);
      if (previous && previous !== socket.id) io.sockets.sockets.get(previous)?.disconnect(true);
    };
    const play = (event: PlayEvent, payload: unknown): void => {
      const b = bound();
      if (!b) return;
      const req = parsePlay(event, payload);
      if (!req) return fail('ENGINE_ERROR', `Payload inválido em ${event}`);
      b.room.play(b.key, req);
    };

    socket.on(
      'room:create',
      guardAck((answered, ack: unknown) => {
        if (typeof ack !== 'function') return;
        leave(true);
        const created = rooms.create();
        answered.done = true;
        if (!created) {
          (ack as SeatAck)({ ok: false, error: { code: 'SERVER_BUSY', message: 'Servidor cheio, tente mais tarde' } });
          return;
        }
        const { room, key, token } = created;
        (ack as SeatAck)({ ok: true, data: { code: room.code, you: key, token } });
        bind(room, key);
      }, ([ack]) => ack),
    );

    socket.on(
      'room:join',
      guardAck((answered, payload: unknown, ack: unknown) => {
        if (typeof ack !== 'function') return;
        const reply = ((res) => {
          answered.done = true;
          (ack as SeatAck)(res);
        }) as SeatAck;
        const here = current();
        if (here && normalizeRoomCode(field(payload, 'code')) === here.room.code) {
          // já está nesta sala: devolve a própria vaga em vez de ocupar a outra
          reply({ ok: true, data: { code: here.room.code, you: here.key, token: here.room.tokenOf(here.key) ?? '' } });
          here.room.resync(here.key);
          return;
        }
        const result = rooms.join(field(payload, 'code'), field(payload, 'token'));
        if (!result.ok) {
          const message = result.code === 'ROOM_FULL' ? 'Sala cheia' : 'Sala não encontrada';
          reply({ ok: false, error: { code: result.code, message } });
          return;
        }
        leave(true);
        reply({ ok: true, data: { code: result.room.code, you: result.key, token: result.token } });
        bind(result.room, result.key);
      }, ([, ack]) => ack),
    );

    socket.on(
      'team:submit',
      guard((payload: unknown) => {
        const b = bound();
        if (b) b.room.submitTeam(b.key, field(payload, 'teamCode'));
      }),
    );
    socket.on(
      'room:ready',
      guard((payload: unknown) => {
        const b = bound();
        if (b) b.room.setReady(b.key, field(payload, 'ready'));
      }),
    );
    socket.on('play:formation', guard((payload: unknown) => play('play:formation', payload)));
    socket.on('play:package', guard((payload: unknown) => play('play:package', payload)));
    socket.on('play:card', guard((payload: unknown) => play('play:card', payload)));
    socket.on('play:conversion', guard((payload: unknown) => play('play:conversion', payload)));
    socket.on('team:depth', guard((payload: unknown) => play('team:depth', payload)));
    socket.on(
      'match:resync',
      guard(() => {
        const b = bound();
        if (b) b.room.resync(b.key);
      }),
    );
    socket.on('disconnect', () => {
      try {
        leave();
      } catch (err) {
        console.error('[pfl] erro ao desconectar', err);
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    if (options.host) httpServer.listen(options.port ?? 0, options.host, () => resolve());
    else httpServer.listen(options.port ?? 0, () => resolve());
  });
  const port = (httpServer.address() as AddressInfo).port;

  return {
    port,
    io,
    rooms,
    close: async () => {
      rooms.closeAll();
      await new Promise<void>((resolve) => {
        io.close(() => resolve());
      });
    },
  };
}
