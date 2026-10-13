// npm run sprites -w @pfl/client — baixa os 151 sprites (front e back) para public/sprites/bw.
// Com --allow-missing, falhas viram aviso (útil no dev offline; o <Sprite> tem fallback).
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadAll, downloadAnimated, GEN1_COUNT, SPRITE_ROOT_DIR } from './sprites-lib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', SPRITE_ROOT_DIR);
const allowMissing = process.argv.includes('--allow-missing');
const ids = Array.from({ length: GEN1_COUNT }, (_, i) => i + 1);

const report = await downloadAll((url) => fetch(url), root, ids);
console.log(`sprites: ${report.downloaded} baixados, ${report.skipped} já existiam, ${report.failed.length} falharam`);
if (report.failed.length > 0) {
  for (const line of report.failed.slice(0, 10)) console.error(`  ${line}`);
  if (!allowMissing) process.exit(1);
  console.warn('Continuando sem esses sprites (--allow-missing).');
}

// Os GIFs animados são um extra da Pokédex: falhar aqui só avisa (o <Sprite> cai no PNG estático).
const animated = await downloadAnimated((url) => fetch(url), root, ids);
console.log(`animados: ${animated.downloaded} baixados, ${animated.skipped} já existiam, ${animated.failed.length} falharam`);
for (const line of animated.failed.slice(0, 10)) console.warn(`  ${line}`);
