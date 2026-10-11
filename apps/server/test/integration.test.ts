import { afterEach, describe, expect, it } from 'vitest';
import { io as connectClient, type Socket } from 'socket.io-client';
import { replay } from '@pfl/engine';
import {
  computeStats, encodeTeam,
  type ClientToServerEvents, type EndMessage, type PhaseMessage, type RoomState, type ServerToClientEvents,
} from '@pfl/protocol';
import { createPflServer, type PflServer } from '../src/server';
import type { TimingsInput } from '../src/timings';
import { electricTeam } from './fixtures';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
interface Received {
  event: string;
  payload: any;
}

let server: PflServer | null = null;
const clients: ClientSocket[] = [];

afterEach(async () => {
  for (const c of clients.splice(0)) c.disconnect();
  await server?.close();
  server = null;
});

function client(): ClientSocket {
  const socket: ClientSocket = connectClient(`http://localhost:${server!.port}`, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
  clients.push(socket);
  return socket;
}

function record(socket: ClientSocket): Received[] {
  const log: Received[] = [];
  socket.onAny((event: string, payload: unknown) => {
    log.push({ event, payload });
  });
  return log;
}

async function waitFor<T>(fn: () => T | undefined, timeoutMs = 5000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = fn();
    if (value !== undefined) return value;
    if (Date.now() - started > timeoutMs) throw new Error('waitFor: tempo esgotado');
    await new Promise((r) => setTimeout(r, 5));
  }
}

const lastOf = (log: Received[], event: string): Received | undefined => [...log].reverse().find((m) => m.event === event);

/**
 * Bot que joga sozinho. Trata match:phase como estado idempotente por (turnId, phase):
 * age no máximo uma vez por etapa, mesmo que o servidor reenvie a mesma etapa.
 */
function autoPlay(socket: ClientSocket, opts: { skipFirstPackage?: boolean } = {}): void {
  const done = new Set<string>();
  let skippedPackage = false;
  socket.on('match:phase', (m: PhaseMessage) => {
    const key = `${m.turnId}:${m.phase}`;
    if (done.has(key)) return;
    const v = m.view;
    if (m.phase === 'FORMATION' && v.side === 'offense') {
      done.add(key);
      socket.emit('play:formation', { turnId: m.turnId, formation: 'PISTOL' });
    } else if (m.phase === 'PACKAGE' && v.side === 'defense') {
      done.add(key);
      if (opts.skipFirstPackage && !skippedPackage) {
        skippedPackage = true; // deixa o servidor aplicar o padrão (Base)
        return;
      }
      socket.emit('play:package', { turnId: m.turnId, package: 'BASE' });
    } else if (m.phase === 'PLAYCALL' && v.yourCard === null && v.playable.length > 0) {
      done.add(key);
      socket.emit('play:card', { turnId: m.turnId, cardId: v.playable[m.turnId % v.playable.length] });
    } else if (m.phase === 'CONVERSION' && v.side === 'offense') {
      done.add(key);
      socket.emit('play:conversion', { turnId: m.turnId, choice: 'PAT' });
    }
  });
}

interface Lobby {
  a: ClientSocket;
  b: ClientSocket;
  logA: Received[];
  logB: Received[];
  code: string;
  tokenA: string;
  tokenB: string;
}

/** Sobe o servidor, cria a sala com A, entra com B, envia os times e marca pronto. Volta com a partida começada. */
async function lobby(timings: TimingsInput, setup: (a: ClientSocket, b: ClientSocket) => void = () => {}): Promise<Lobby> {
  server = await createPflServer({ port: 0, timings });
  const a = client();
  const b = client();
  const logA = record(a);
  const logB = record(b);
  setup(a, b);
  const created = await a.emitWithAck('room:create');
  if (!created.ok) throw new Error(created.error.message);
  const joined = await b.emitWithAck('room:join', { code: created.data.code });
  if (!joined.ok) throw new Error(joined.error.message);
  a.emit('team:submit', { teamCode: encodeTeam(electricTeam('Raio')) });
  b.emit('team:submit', { teamCode: encodeTeam(electricTeam('Trovão')) });
  a.emit('room:ready', { ready: true });
  b.emit('room:ready', { ready: true });
  await waitFor(() => logA.find((m) => m.event === 'match:phase'));
  await waitFor(() => logB.find((m) => m.event === 'match:phase'));
  return { a, b, logA, logB, code: created.data.code, tokenA: created.data.token, tokenB: joined.data.token };
}

describe('servidor Socket.io (integração)', () => {
  it('cria a sala com código de 6 letras e devolve vaga e token', async () => {
    server = await createPflServer({ port: 0 });
    const a = client();
    const res = await a.emitWithAck('room:create');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.code).toMatch(/^[A-HJ-NP-Z]{6}$/);
    expect(res.data.you).toBe('A');
    expect(res.data.token.length).toBeGreaterThan(10);
  });

  it('partida completa com 2 clientes, incluindo timeout aplicado pelo servidor e reconexão com token', async () => {
    // B deixa o primeiro pacote expirar (500 ms); os bots respondem em milissegundos no resto da partida
    const { a, logA, logB, code, tokenA } = await lobby({ resultAnimationMs: 0, phaseMs: { PACKAGE: 500 } }, (a, b) => {
      autoPlay(a);
      autoPlay(b, { skipFirstPackage: true });
    });
    await waitFor(() => logA.find((m) => m.event === 'match:result'));
    // ordem do contrato no primeiro snap (o pacote saiu por timeout)
    const firstSnap = logA.filter((m) => m.event.startsWith('match:')).slice(0, 5);
    expect(firstSnap.map((m) => m.event)).toEqual(['match:phase', 'match:reveal', 'match:phase', 'match:reveal', 'match:phase']);
    expect(firstSnap.map((m) => m.payload.phase).filter(Boolean)).toEqual(['FORMATION', 'PACKAGE', 'PLAYCALL']);
    expect(firstSnap[3].payload.events[0]).toMatchObject({ t: 'PACKAGE', package: 'BASE' });

    // A cai no meio da partida e volta com o token num socket novo
    a.disconnect();
    const a2 = client();
    const logA2 = record(a2);
    autoPlay(a2);
    const res = await a2.emitWithAck('room:join', { code, token: tokenA });
    expect(res).toEqual({ ok: true, data: { code, you: 'A', token: tokenA } });

    const endA = await waitFor(() => logA2.find((m) => m.event === 'match:end'), 25_000);
    const endB = await waitFor(() => logB.find((m) => m.event === 'match:end'), 25_000);
    const end = endA.payload as EndMessage;
    expect(endB.payload).toEqual(end);
    expect(end.score.A).not.toBe(end.score.B);
    expect(end.replay.actions[1]).toEqual({ type: 'TIMEOUT' }); // FORMATION de A, depois o pacote expirado de B
    const replayed = replay(end.replay.teams.A, end.replay.teams.B, end.replay.seed, end.replay.actions);
    expect(replayed.state.phase).toBe('MATCH_END');
    expect(replayed.state.score).toEqual(end.score);
    expect(end.stats).toEqual(computeStats(replayed.events));
    expect(logA2.filter((m) => m.event === 'error')).toEqual([]);
    expect(logB.filter((m) => m.event === 'error')).toEqual([]);
    // match:end substitui o último match:phase
    const lastMatchEvents = logA2.filter((m) => m.event.startsWith('match:')).slice(-2).map((m) => m.event);
    expect(lastMatchEvents).toEqual(['match:result', 'match:end']);
    // a visão enviada nunca carrega o estado interno do motor
    for (const m of [...logA, ...logA2, ...logB].filter((x) => x.event === 'match:phase')) {
      expect(m.payload.view).not.toHaveProperty('teams');
      expect(m.payload.view).not.toHaveProperty('rng');
    }
  }, 30_000);

  it('o servidor aplica o padrão quando o timer da etapa expira (pacote → Base)', async () => {
    const { logB } = await lobby(
      { resultAnimationMs: 0, phaseMs: { FORMATION: 5000, PACKAGE: 150, PLAYCALL: 5000, CONVERSION: 5000 } },
      (a) => {
        a.on('match:phase', (m: PhaseMessage) => {
          if (m.phase === 'FORMATION' && m.view.side === 'offense') a.emit('play:formation', { turnId: m.turnId, formation: 'SPREAD' });
        });
      },
    );
    const reveal = await waitFor(() =>
      logB.find((m) => m.event === 'match:reveal' && m.payload.events[0]?.t === 'PACKAGE'),
    );
    expect(reveal.payload.events[0]).toMatchObject({ t: 'PACKAGE', team: 'B', package: 'BASE' });
    expect(logB.find((m) => m.event === 'match:reveal')!.payload.events[0]).toMatchObject({ formation: 'SPREAD' });
  });

  it('reconexão com token: mesma vaga, visão atual e partida continua', async () => {
    const { a, logB, code, tokenA } = await lobby({ resultAnimationMs: 0, phaseMs: { FORMATION: 10_000 } });
    a.disconnect();
    await waitFor(() => {
      const state = lastOf(logB, 'room:state')?.payload as RoomState | undefined;
      return state?.players.some((p) => p.key === 'A' && !p.connected) ? state : undefined;
    });
    const a2 = client();
    const logA2 = record(a2);
    const res = await a2.emitWithAck('room:join', { code: code.toLowerCase(), token: tokenA });
    expect(res).toEqual({ ok: true, data: { code, you: 'A', token: tokenA } });
    const phase = await waitFor(() => logA2.find((m) => m.event === 'match:phase'));
    expect(phase.payload.view.you).toBe('A');
    expect(phase.payload.phase).toBe('FORMATION');
    await waitFor(() => {
      const state = lastOf(logB, 'room:state')?.payload as RoomState | undefined;
      return state?.players.every((p) => p.connected) ? state : undefined;
    });
    a2.emit('play:formation', { turnId: phase.payload.turnId, formation: 'HEAVY' });
    const reveal = await waitFor(() => logB.find((m) => m.event === 'match:reveal'));
    expect(reveal.payload.events[0]).toMatchObject({ t: 'FORMATION', formation: 'HEAVY' });
  });

  it('segunda conexão com o mesmo token derruba a primeira', async () => {
    const { a, code, tokenA, logB } = await lobby({ phaseMs: { FORMATION: 10_000 } });
    let kicked = false;
    a.on('disconnect', () => {
      kicked = true;
    });
    const a2 = client();
    const res = await a2.emitWithAck('room:join', { code, token: tokenA });
    expect(res.ok).toBe(true);
    await waitFor(() => (kicked ? true : undefined));
    await new Promise((r) => setTimeout(r, 50));
    const state = lastOf(logB, 'room:state')!.payload as RoomState;
    expect(state.status).toBe('IN_MATCH');
    expect(state.players.every((p) => p.connected)).toBe(true);
  });

  it('terceiro cliente, código inexistente e token de outra sala', async () => {
    const { code } = await lobby({});
    const c = client();
    expect(await c.emitWithAck('room:join', { code })).toEqual({ ok: false, error: { code: 'ROOM_FULL', message: 'Sala cheia' } });
    expect(await c.emitWithAck('room:join', { code: '!!' })).toMatchObject({ ok: false, error: { code: 'ROOM_NOT_FOUND' } });
    const other = await c.emitWithAck('room:create');
    if (!other.ok) throw new Error(other.error.message);
    const d = client();
    expect(await d.emitWithAck('room:join', { code, token: other.data.token })).toMatchObject({
      ok: false,
      error: { code: 'ROOM_FULL' },
    });
  });

  it('payloads maliciosos e eventos fora de hora geram error sem derrubar o servidor', async () => {
    const { a, logA } = await lobby({ phaseMs: { FORMATION: 10_000 } });
    const lone = client();
    const logLone = record(lone);
    lone.emit('play:card', { turnId: 1, cardId: 'basic_run' });
    await waitFor(() => logLone.find((m) => m.event === 'error' && m.payload.code === 'NOT_IN_ROOM'));

    const phase = logA.find((m) => m.event === 'match:phase')!.payload as PhaseMessage;
    a.emit('play:formation', { turnId: phase.turnId, formation: 'constructor' } as never);
    a.emit('play:formation', { turnId: 'x' } as never);
    a.emit('play:package', { turnId: phase.turnId, package: 'BASE' }); // A está no ataque: fora de vez
    a.emit('play:formation', { turnId: phase.turnId + 5, formation: 'PISTOL' });
    await waitFor(() => (logA.filter((m) => m.event === 'error').length >= 4 ? true : undefined));
    expect(logA.filter((m) => m.event === 'error').map((m) => m.payload.code)).toEqual([
      'ENGINE_ERROR',
      'ENGINE_ERROR',
      'ENGINE_ERROR',
      'STALE_TURN',
    ]);

    a.emit('play:formation', { turnId: phase.turnId, formation: 'DOUBLE' });
    const reveal = await waitFor(() => logA.find((m) => m.event === 'match:reveal'));
    expect(reveal.payload.events[0]).toMatchObject({ formation: 'DOUBLE' });
  });

  it('match:resync reenvia room:state e a etapa atual', async () => {
    const { a, logA } = await lobby({ phaseMs: { FORMATION: 10_000 } });
    const before = logA.length;
    a.emit('match:resync');
    await waitFor(() => (logA.slice(before).some((m) => m.event === 'match:phase') ? true : undefined));
    expect(logA.slice(before).map((m) => m.event)).toEqual(['room:state', 'match:phase']);
  });
});
