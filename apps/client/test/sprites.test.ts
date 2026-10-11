import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  downloadAll, ensureSprite, SPRITE_ROOT_DIR, fetchPng, isPng, spriteFile, spriteUrl,
  type FetchLike, type FetchResponseLike, type RetryOptions,
} from '../scripts/sprites-lib';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const HTML = new TextEncoder().encode('<html>404</html>');
const noSleep: RetryOptions = { attempts: 3, delayMs: 1, sleep: async () => {} };
const ok = (bytes: Uint8Array): FetchResponseLike => ({ ok: true, status: 200, arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer });
const fail = (status: number): FetchResponseLike => ({ ok: false, status, arrayBuffer: async () => new ArrayBuffer(0) });

/** fetch falso que devolve as respostas na ordem e conta as chamadas */
function scripted(...responses: (FetchResponseLike | Error)[]): FetchLike & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (url: string) => {
    calls.push(url);
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (next instanceof Error) throw next;
    return next;
  }) as FetchLike & { calls: string[] };
  fn.calls = calls;
  return fn;
}

describe('URLs e caminhos', () => {
  it('usa os sprites Black/White (Gen 5) verificados', () => {
    expect(spriteUrl('front', 25)).toBe(
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/25.png',
    );
    expect(spriteUrl('back', 25)).toBe(
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/back/25.png',
    );
  });

  it('a raiz dos sprites B/W é public/sprites/bw (não reaproveita os PNGs do Yellow)', () => {
    expect(SPRITE_ROOT_DIR).toBe(join('public', 'sprites', 'bw'));
  });

  it('grava em {root}/{view}/{id}.png', () => {
    expect(spriteFile('/x/sprites', 'back', 7)).toBe(join('/x/sprites', 'back', '7.png'));
  });

  it('reconhece PNG pela assinatura', () => {
    expect(isPng(PNG)).toBe(true);
    expect(isPng(HTML)).toBe(false);
    expect(isPng(new Uint8Array())).toBe(false);
  });
});

describe('fetchPng', () => {
  it('tenta de novo após falhas e devolve os bytes', async () => {
    const f = scripted(fail(503), new Error('ECONNRESET'), ok(PNG));
    expect(await fetchPng(f, 'u', noSleep)).toEqual(PNG);
    expect(f.calls).toHaveLength(3);
  });

  it('desiste após as tentativas e cita a URL', async () => {
    const f = scripted(fail(404));
    await expect(fetchPng(f, 'https://exemplo/1.png', noSleep)).rejects.toThrow(/https:\/\/exemplo\/1.png.*HTTP 404/);
    expect(f.calls).toHaveLength(3);
  });

  it('rejeita resposta 200 que não é PNG (página de erro)', async () => {
    await expect(fetchPng(scripted(ok(HTML)), 'u', noSleep)).rejects.toThrow(/não é PNG/);
  });
});

describe('ensureSprite e downloadAll', () => {
  it('é idempotente: a segunda execução não baixa de novo', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pfl-sprites-'));
    const f = scripted(ok(PNG));
    expect(await ensureSprite(f, root, 'front', 1, noSleep)).toBe('downloaded');
    expect(await ensureSprite(f, root, 'front', 1, noSleep)).toBe('skipped');
    expect(f.calls).toHaveLength(1);
    expect(new Uint8Array(await readFile(spriteFile(root, 'front', 1)))).toEqual(PNG);
  });

  it('baixa de novo um arquivo corrompido', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pfl-sprites-'));
    await mkdir(join(root, 'back'), { recursive: true });
    await writeFile(spriteFile(root, 'back', 4), HTML);
    expect(await ensureSprite(scripted(ok(PNG)), root, 'back', 4, noSleep)).toBe('downloaded');
  });

  it('relata falhas sem abortar os demais downloads', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pfl-sprites-'));
    const f: FetchLike = async (url) => (url.endsWith('/2.png') ? fail(404) : ok(PNG));
    const report = await downloadAll(f, root, [1, 2, 3], noSleep, 2);
    expect(report.downloaded).toBe(4);
    expect(report.skipped).toBe(0);
    expect(report.failed).toHaveLength(2);
    expect(report.failed[0]).toMatch(/^back\/2:/);
    const again = await downloadAll(f, root, [1, 3], noSleep, 2);
    expect(again).toEqual({ downloaded: 0, skipped: 4, failed: [] });
  });
});
