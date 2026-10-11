// npm run sprites -w @pfl/client — baixa os 151 sprites (front e back) para public/sprites.
// Com --allow-missing, falhas viram aviso (útil no dev offline; o <Sprite> tem fallback).
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadAll, GEN1_COUNT } from './sprites-lib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../public/sprites');
const allowMissing = process.argv.includes('--allow-missing');
const ids = Array.from({ length: GEN1_COUNT }, (_, i) => i + 1);

const report = await downloadAll((url) => fetch(url), root, ids);
console.log(`sprites: ${report.downloaded} baixados, ${report.skipped} já existiam, ${report.failed.length} falharam`);
if (report.failed.length > 0) {
  for (const line of report.failed.slice(0, 10)) console.error(`  ${line}`);
  if (!allowMissing) process.exit(1);
  console.warn('Continuando sem esses sprites (--allow-missing).');
}
