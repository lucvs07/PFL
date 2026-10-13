import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio, stripComments } from './css-helpers';

const tokens = stripComments(readFileSync(fileURLToPath(new URL('../src/styles/tokens.css', import.meta.url)), 'utf8'));
const vars = new Map<string, string>();
for (const m of tokens.matchAll(/--([\w-]+):\s*([^;]+);/g)) if (!vars.has(m[1])) vars.set(m[1], m[2].trim());

function color(name: string): string {
  let v = vars.get(name);
  const ref = v?.match(/^var\(--([\w-]+)\)$/);
  if (ref) v = vars.get(ref[1]);
  if (!v || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`token --${name} não é uma cor hexadecimal`);
  return v;
}

/** [texto, fundo, mínimo, onde aparece] */
const PAIRS: [string, string, number, string][] = [
  ['gbc-ink', 'gbc-paper', 4.5, 'texto de painel'],
  ['gbc-ink', 'gbc-panel', 4.5, 'texto em linha selecionável'],
  ['gbc-ink', 'gbc-green-3', 4.5, 'texto direto no fundo da página'],
  ['gbc-muted', 'gbc-paper', 4.5, '.muted em painel'],
  ['gbc-muted', 'gbc-panel', 4.5, '.muted em opção de lista'],
  ['gbc-red-text', 'gbc-paper', 4.5, 'erros em painel'],
  ['gbc-red-text', 'gbc-panel', 4.5, 'erros em opção de lista'],
  ['gbc-blue', 'gbc-paper', 4.5, 'texto azul'],
  ['gbc-blue', 'gbc-panel', 4.5, 'texto azul em lista'],
  ['gbc-paper', 'gbc-red', 4.5, 'rótulo de .btn-primary'],
  ['gbc-paper', 'gbc-ink', 4.5, 'tooltip e HUD'],
  ['gbc-yellow', 'gbc-ink', 4.5, 'título do tooltip'],
  ['gbc-ink', 'gbc-yellow', 4.5, 'aviso e banner de conexão'],
  ['gbc-ink', 'gbc-orange', 4.5, 'botão em hover/pressão'],
  ['gbc-green-1', 'gbc-paper', 4.5, '.ok-text'],
  ['gbc-green-3', 'gbc-green-0', 4.5, 'subtítulo da tela inicial'],
  ['gbc-paper', 'gbc-blue', 4.5, 'cartas do lado da defesa'],
  ['read-wrong', 'gbc-paper', 4.5, 'leitura errada'],
  ['read-neutral', 'gbc-paper', 4.5, 'leitura neutra'],
];

describe('contraste AA dos tokens', () => {
  it.each(PAIRS)('%s sobre %s >= %s:1 (%s)', (fg, bg, min) => {
    expect(contrastRatio(color(fg), color(bg))).toBeGreaterThanOrEqual(min);
  });

  it('o alvo de toque mínimo é 44px no celular', () => {
    expect(vars.get('hit-min')).toBe('44px');
  });
});
