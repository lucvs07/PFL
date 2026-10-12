import { afterEach, describe, expect, it } from 'vitest';
import { createPflServer, type PflServer } from '../src/server';

let server: PflServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

describe('HTTP simples do servidor', () => {
  it('GET /health responde 200 ok (também com query string)', async () => {
    server = await createPflServer();
    for (const path of ['/health', '/health?x=1']) {
      const res = await fetch(`http://localhost:${server.port}${path}`);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('ok');
    }
  });
  it('HEAD /health responde 200', async () => {
    server = await createPflServer();
    const res = await fetch(`http://localhost:${server.port}/health`, { method: 'HEAD' });
    expect(res.status).toBe(200);
  });
  it('outros caminhos respondem 404 sem pendurar', async () => {
    server = await createPflServer();
    const res = await fetch(`http://localhost:${server.port}/nada`, { signal: AbortSignal.timeout(3000) });
    expect(res.status).toBe(404);
  });
});
