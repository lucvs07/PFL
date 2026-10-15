// Download dos sprites Gen 5 Black/White (front/back, PNG transparente) no setup/build. O jogo nunca chama a PokéAPI em runtime.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const GEN1_COUNT = 151;
export type SpriteView = 'front' | 'back';
export const SPRITE_VIEWS: readonly SpriteView[] = ['front', 'back'];

const BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white';

/** Pasta (relativa a apps/client) dos sprites B/W. Raiz nova para não pular os PNGs antigos do Yellow já baixados. */
export const SPRITE_ROOT_DIR = join('public', 'sprites', 'bw');

export function spriteUrl(view: SpriteView, id: number): string {
  return view === 'front' ? `${BASE}/${id}.png` : `${BASE}/back/${id}.png`;
}

export function spriteFile(root: string, view: SpriteView, id: number): string {
  return join(root, view, `${id}.png`);
}

/** Pasta dos sprites animados (só front), dentro da raiz B/W. */
export const ANIMATED_DIR = 'animated';

export function animatedUrl(id: number): string {
  return `${BASE}/animated/${id}.gif`;
}

export function animatedFile(root: string, id: number): string {
  return join(root, ANIMATED_DIR, `${id}.gif`);
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const GIF_MAGIC = [0x47, 0x49, 0x46, 0x38]; // "GIF8"

export function isGif(bytes: Uint8Array): boolean {
  return bytes.length > GIF_MAGIC.length && GIF_MAGIC.every((b, i) => bytes[i] === b);
}

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

async function fetchChecked(
  fetchFn: FetchLike,
  url: string,
  opts: RetryOptions,
  check: (bytes: Uint8Array) => boolean,
  kind: string,
): Promise<Uint8Array> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    try {
      const res = await fetchFn(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (!check(bytes)) throw new Error(`resposta não é ${kind}`);
      return bytes;
    } catch (err) {
      lastError = err;
      if (attempt < opts.attempts) await opts.sleep(opts.delayMs * attempt);
    }
  }
  throw new Error(`Falha ao baixar ${url}: ${describe(lastError)}`);
}

export const fetchPng = (fetchFn: FetchLike, url: string, opts: RetryOptions = DEFAULT_RETRY): Promise<Uint8Array> =>
  fetchChecked(fetchFn, url, opts, isPng, 'PNG');

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

async function hasValidGif(path: string): Promise<boolean> {
  try {
    return isGif(new Uint8Array(await readFile(path)));
  } catch {
    return false;
  }
}

/** Como `ensureSprite`, para o GIF animado de frente. */
export async function ensureAnimated(
  fetchFn: FetchLike,
  root: string,
  id: number,
  opts: RetryOptions = DEFAULT_RETRY,
): Promise<'skipped' | 'downloaded'> {
  const path = animatedFile(root, id);
  if (await hasValidGif(path)) return 'skipped';
  const bytes = await fetchChecked(fetchFn, animatedUrl(id), opts, isGif, 'GIF');
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, bytes);
  await rename(tmp, path);
  return 'downloaded';
}

/** Baixa os GIFs animados. Opcional: sem eles a Pokédex cai no PNG estático. */
export async function downloadAnimated(
  fetchFn: FetchLike,
  root: string,
  ids: readonly number[],
  opts: RetryOptions = DEFAULT_RETRY,
  concurrency = 8,
): Promise<DownloadReport> {
  const report: DownloadReport = { downloaded: 0, skipped: 0, failed: [] };
  let next = 0;
  async function worker(): Promise<void> {
    while (next < ids.length) {
      const id = ids[next++];
      try {
        const result = await ensureAnimated(fetchFn, root, id, opts);
        report[result] += 1;
      } catch (err) {
        report.failed.push(`animated/${id}: ${describe(err)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, () => worker()));
  report.failed.sort();
  return report;
}
