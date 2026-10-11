import {
  ALL_SPECIES, FORMATIONS, LEGENDARY_IDS, PACKAGES, SUGGESTED_TEAMS, canPlay, getCard, initialFatigue, pickLineup,
  teamCost, validateTeam, type Team,
} from '@pfl/engine';
import { playMatch } from '../src/runner';
import { writeFileSync } from 'node:fs';

// Ferramenta de uso manual (não roda nos testes): rebalanceia os 6 times sugeridos por busca local.
// uso: npx tsx packages/sim/scripts/rebalance-teams.ts <jogos por par> <iterações> <saída.json>
// Parte de SUGGESTED_TEAMS, propõe trocas de espécie/papéis no time mais distante de 50% e mantém
// a troca que aproxima os 6 de 50% (validateTeam === [] e todas as cartas do deck jogáveis).
// Depois: gerar suggested.ts a partir do JSON e atualizar EXPECTED_COST em suggested.test.ts.
const R = Number(process.argv[2] ?? 60), ITERS = Number(process.argv[3] ?? 60), OUT = process.argv[4] ?? 'rebalance-teams.json';
const THEMES: string[][] = [['electric','normal','flying'],['fire','rock','fighting'],['water','ice'],['rock','ground','fighting'],['psychic','ghost'],['grass','poison','bug']];
let teams: Team[] = SUGGESTED_TEAMS.map((t: Team) => structuredClone(t));
let seed = 12345; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
const N = 6;
const W: number[][] = Array.from({ length: N }, () => Array(N).fill(0));
function pair(ts: Team[], i: number, j: number) {
  let w = 0; for (let s = 1; s <= R; s++) { const r = playMatch(ts[i], ts[j], s * 31 + i * 7 + j, s * 17 + 3); if (r.winner === 'A') w++; } return w;
}
function rates(M: number[][]) { return teams.map((_, i) => { let w = 0; for (let j = 0; j < N; j++) if (j !== i) w += M[i][j] + (R - M[j][i]); return w / (10 * R); }); }
const obj = (r: number[]) => r.reduce((s, x) => s + (x - 0.5) ** 2, 0);
function deckOk(t: Team): boolean {
  const off = Object.values(FORMATIONS).map((f: any) => pickLineup(f, t, initialFatigue()));
  const def = Object.values(PACKAGES).map((p: any) => pickLineup(p, t, initialFatigue()));
  return t.offenseDeck.every((id) => off.some((l: any) => canPlay(getCard(id), l))) && t.defenseDeck.every((id) => def.some((l: any) => canPlay(getCard(id), l)));
}
const replaceEverywhere = (t: Team, a: number, b: number) => {
  t.roster = t.roster.map((x) => (x === a ? b : x)); if (t.specialist === a) t.specialist = b;
  for (const k of Object.keys(t.depth)) t.depth[k as keyof Team['depth']] = t.depth[k as keyof Team['depth']]!.map((x) => (x === a ? b : x));
};
const swapRoles = (t: Team, a: number, b: number) => {
  const sw = (x: number) => (x === a ? b : x === b ? a : x);
  for (const k of Object.keys(t.depth)) t.depth[k as keyof Team['depth']] = t.depth[k as keyof Team['depth']]!.map(sw);
};
function propose(idx: number): Team | null {
  const t = structuredClone(teams[idx]);
  if (rnd() < 0.4) { // troca de papéis entre dois do elenco
    const [a, b] = [pick(t.roster), pick(t.roster)]; if (a === b) return null; swapRoles(t, a, b);
  } else { // troca de espécie
    const out = pick(t.roster);
    const all = [...t.roster, t.specialist];
    const pool = ALL_SPECIES.filter((s: any) => !all.includes(s.id) && !LEGENDARY_IDS.includes(s.id) && s.types.some((ty: string) => THEMES[idx].includes(ty)));
    if (!pool.length) return null;
    const inn = pick(pool as any[]).id;
    replaceEverywhere(t, out, inn);
  }
  if (teamCost(t) > 120 || validateTeam(t).length || !deckOk(t)) return null;
  return t;
}
// estado inicial
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (i !== j) W[i][j] = pair(teams, i, j);
let cur = rates(W); let f = obj(cur);
console.log('início', cur.map((x) => (x * 100).toFixed(1)).join(' '), 'f=', f.toFixed(4));
for (let it = 0; it < ITERS; it++) {
  // time mais distante de 50%, com sorteio entre os dois piores
  const order = cur.map((x, i) => [Math.abs(x - 0.5), i] as const).sort((a, b) => b[0] - a[0]);
  const idx = order[rnd() < 0.7 ? 0 : 1][1];
  let cand: Team | null = null; for (let k = 0; k < 30 && !cand; k++) cand = propose(idx);
  if (!cand) continue;
  const ts = teams.map((t, i) => (i === idx ? cand! : t));
  const M = W.map((row) => row.slice());
  for (let j = 0; j < N; j++) if (j !== idx) { M[idx][j] = pair(ts, idx, j); M[j][idx] = pair(ts, j, idx); }
  const r = rates(M); const nf = obj(r);
  const ok = nf < f;
  console.log(`it${it} ${teams[idx].name.slice(0, 12)} f ${f.toFixed(4)} -> ${nf.toFixed(4)} ${ok ? 'ACEITO' : '-'}  ${r.map((x) => (x * 100).toFixed(0)).join(' ')}`);
  if (ok) { teams = ts; for (let a = 0; a < N; a++) W[a] = M[a]; cur = r; f = nf; writeFileSync(OUT, JSON.stringify(teams, null, 1)); }
}
console.log('fim', cur.map((x) => (x * 100).toFixed(1)).join(' '), 'f=', f.toFixed(4));
writeFileSync(OUT, JSON.stringify(teams, null, 1));
