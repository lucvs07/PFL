import { afterEach, describe, expect, it } from 'vitest';
import { io as connectClient, type Socket } from 'socket.io-client';
import { createPflServer, type PflServer } from '../src/server';

let server: PflServer | null = null;
const clients: Socket[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.disconnect();
  await server?.close();
  server = null;
});

/** Mesmo transporte do cliente real: só WebSocket (o `cors` do Socket.IO não vale aqui). */
function connectWithOrigin(origin: string | undefined): Promise<'connected' | 'refused'> {
  const socket = connectClient(`http://localhost:${server!.port}`, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    extraHeaders: origin ? { Origin: origin } : {},
  });
  clients.push(socket);
  return new Promise((resolve) => {
    socket.on('connect', () => resolve('connected'));
    socket.on('connect_error', () => resolve('refused'));
  });
}

describe('CORS_ORIGIN vale também para o handshake WebSocket', () => {
  it('origem fora da lista é recusada', async () => {
    server = await createPflServer({ corsOrigin: ['https://lucvs07.github.io'] });
    expect(await connectWithOrigin('https://evil.example')).toBe('refused');
  });
  it('origem da lista conecta', async () => {
    server = await createPflServer({ corsOrigin: ['https://lucvs07.github.io'] });
    expect(await connectWithOrigin('https://lucvs07.github.io')).toBe('connected');
  });
  it('aceita string única e clientes sem header Origin (não-navegador)', async () => {
    server = await createPflServer({ corsOrigin: 'https://lucvs07.github.io' });
    expect(await connectWithOrigin('https://lucvs07.github.io')).toBe('connected');
    expect(await connectWithOrigin(undefined)).toBe('connected');
  });
  it('sem corsOrigin (dev local) qualquer origem conecta', async () => {
    server = await createPflServer();
    expect(await connectWithOrigin('http://localhost:5173')).toBe('connected');
  });
});
