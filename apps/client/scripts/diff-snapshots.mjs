import { readFileSync } from 'node:fs';

const [, , beforePath, afterPath] = process.argv;
const before = JSON.parse(readFileSync(beforePath, 'utf8'));
const after = JSON.parse(readFileSync(afterPath, 'utf8'));
const TOL = 2;
// largura das barras de jardas depende do resultado da partida, não do layout
const IGNORE = /yards-fill/;
const changes = [];
for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
  if (IGNORE.test(key)) continue;
  const a = before[key];
  const b = after[key];
  if (!a || !b) {
    changes.push(`${!a ? '+' : '-'} ${key}`);
    continue;
  }
  const moved = ['x', 'y', 'w', 'h'].some((k) => Math.abs(a[k] - b[k]) > TOL) || a.fs !== b.fs;
  if (moved) changes.push(`~ ${key}  ${a.x},${a.y} ${a.w}x${a.h} ${a.fs}  ->  ${b.x},${b.y} ${b.w}x${b.h} ${b.fs}`);
}
console.log(changes.length ? changes.join('\n') : 'sem diferenças');
process.exit(changes.length ? 1 : 0);
