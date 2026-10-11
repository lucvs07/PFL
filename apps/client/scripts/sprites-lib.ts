// Download dos sprites Gen 1 Yellow (GBC) no setup/build. O jogo nunca chama a PokéAPI em runtime.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const GEN1_COUNT = 151;
export type SpriteView = 'front' | 'back';
export const SPRITE_VIEWS: readonly SpriteView[] = ['front', 'back'];

const BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-i/yellow';

export function spriteUrl(view: SpriteView, id: number): string {
  return view === 'front' ? `${BASE}/gbc/${id}.png` : `${BASE}/back/gbc/${id}.png`;
}

export function spriteFile(root: string, view: SpriteView, id: number): string {
  return join(root, view, `${id}.png`);
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length > PNG_MAGIC.length && PNG_MAGIC.every((b, i) => bytes[i] === b);
}

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}
export type FetchLike = (url: string) => Promise<FetchResponseLike>;

export interface RetryOptions {
  attempts: number;
  delayMs: number;
  sleep: (ms: number) => Promise<void>;
}

export const DEFAULT_RETRY: RetryOptions = {
  attempts: 3,
  delayMs: 500,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

const describe = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export async function fetchPng(fetchFn: FetchLike, url: string, opts: RetryOptions = DEFAULT_RETRY): Promise<Uint8Array> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    try {
      const res = await fetchFn(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (!isPng(bytes)) throw new Error('resposta não é PNG');
      return bytes;
    } catch (err) {
      lastError = err;
      if (attempt < opts.attempts) await opts.sleep(opts.delayMs * attempt);
    }
  }
  throw new Error(`Falha ao baixar ${url}: ${describe(lastError)}`);
}

async function hasValidFile(path: string): Promise<boolean> {
  try {
    return isPng(new Uint8Array(await readFile(path)));
  } catch {
    return false;
  }
}

/** Baixa um sprite se ainda não existir um PNG válido. Grava num .tmp e renomeia, para nunca deixar arquivo pela metade. */
export async function ensureSprite(
  fetchFn: FetchLike,
  root: string,
  view: SpriteView,
  id: number,
  opts: RetryOptions = DEFAULT_RETRY,
): Promise<'skipped' | 'downloaded'> {
  const path = spriteFile(root, view, id);
  if (await hasValidFile(path)) return 'skipped';
  const bytes = await fetchPng(fetchFn, spriteUrl(view, id), opts);
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, bytes);
  await rename(tmp, path);
  return 'downloaded';
}

export interface DownloadReport {
  downloaded: number;
  skipped: number;
  failed: string[];
}

export async function downloadAll(
  fetchFn: FetchLike,
  root: string,
  ids: readonly number[],
  opts: RetryOptions = DEFAULT_RETRY,
  concurrency = 8,
): Promise<DownloadReport> {
  const jobs = ids.flatMap((id) => SPRITE_VIEWS.map((view) => ({ id, view })));
  const report: DownloadReport = { downloaded: 0, skipped: 0, failed: [] };
  let next = 0;
  async function worker(): Promise<void> {
    while (next < jobs.length) {
      const job = jobs[next++];
      try {
        const result = await ensureSprite(fetchFn, root, job.view, job.id, opts);
        report[result] += 1;
      } catch (err) {
        report.failed.push(`${job.view}/${job.id}: ${describe(err)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()));
  report.failed.sort();
  return report;
}
