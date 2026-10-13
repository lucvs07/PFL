import { readFileSync } from 'node:fs';

const [, , beforePath, afterPath] = process.argv;
const before = JSON.parse(readFileSync(beforePath, 'utf8'));
const after = JSON.parse(readFileSync(afterPath, 'utf8'));
const TOL = 2;
// dados da partida (barras de jardas e nomes na tabela de estatísticas) e o wrapper .top-stack (altura 0, avisos do topo)
const IGNORE = /yards-fill|stats-name|top-stack/;
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
