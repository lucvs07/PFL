// Baixa os dados da Gen 1 da PokéAPI uma única vez e grava JSON estático no engine.
// O jogo nunca chama a PokéAPI em runtime (spec, seção 4.1).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://pokeapi.co/api/v2';
const GEN1_TYPES = [
  'normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison',
  'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon',
];
const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../engine/src/data');
const STAT_KEYS: Record<string, string> = {
  hp: 'hp',
  attack: 'attack',
  defense: 'defense',
  'special-attack': 'spAttack',
  'special-defense': 'spDefense',
  speed: 'speed',
};

const generationNumber = (url: string): number => Number(url.split('/').filter(Boolean).pop());

async function getJson(url: string): Promise<any> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    if (attempt === 3) throw new Error(`${res.status} ao buscar ${url}`);
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

/** Uma entrada past_* da geração X vale até a geração X; a de menor X é a que vale na Gen 1. */
function earliest<T extends { generation: { url: string } }>(entries: T[]): T | undefined {
  return [...entries].sort((a, b) => generationNumber(a.generation.url) - generationNumber(b.generation.url))[0];
}

async function buildPokemon() {
  const list = [];
  for (let id = 1; id <= 151; id++) {
    const p = await getJson(`${API}/pokemon/${id}`);
    const past: any = earliest(p.past_types ?? []);
    const slots = (past ? past.types : p.types) as { slot: number; type: { name: string } }[];
    const types = [...slots].sort((a, b) => a.slot - b.slot).map((t) => t.type.name);
    const stats: Record<string, number> = {};
    for (const s of p.stats) stats[STAT_KEYS[s.stat.name]] = s.base_stat;
    list.push({ id, name: p.name, types, stats });
  }
  return list;
}

async function buildTypeChart() {
  const chart: Record<string, Record<string, number>> = {};
  for (const attacker of GEN1_TYPES) {
    const t = await getJson(`${API}/type/${attacker}`);
    const past: any = earliest(t.past_damage_relations ?? []);
    const rel = past ? past.damage_relations : t.damage_relations;
    const row: Record<string, number> = Object.fromEntries(GEN1_TYPES.map((d) => [d, 1]));
    for (const d of rel.double_damage_to) if (d.name in row) row[d.name] = 2;
    for (const d of rel.half_damage_to) if (d.name in row) row[d.name] = 0.5;
    for (const d of rel.no_damage_to) if (d.name in row) row[d.name] = 0;
    chart[attacker] = row;
  }
  chart.ghost.psychic = 2; // corrige o bug da Gen 1 (spec, seção 4.1)
  return chart;
}

const pokemon = await buildPokemon();
if (pokemon.length !== 151) throw new Error(`Esperava 151 Pokémon, veio ${pokemon.length}`);
for (const p of pokemon) {
  for (const t of p.types) {
    if (!GEN1_TYPES.includes(t)) throw new Error(`Tipo fora da Gen 1 em ${p.name}: ${t}`);
  }
}
const typechart = await buildTypeChart();

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, 'pokemon.json'), JSON.stringify(pokemon, null, 2) + '\n');
writeFileSync(resolve(OUT_DIR, 'typechart.json'), JSON.stringify(typechart, null, 2) + '\n');
console.log(`${pokemon.length} Pokémon, ${Object.keys(typechart).length} tipos`);
