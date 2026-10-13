import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

export function cssFiles(dir: string = SRC): { file: string; css: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return cssFiles(p);
    return e.name.endsWith('.css') ? [{ file: p.replace(SRC, 'src'), css: readFileSync(p, 'utf8') }] : [];
  });
}

export const indexHtml = (): string => readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');

export const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Seletores com :hover que não estão dentro de uma @media (hover: hover). */
export function ungatedHover(css: string): string[] {
  const stack: string[] = [];
  const found: string[] = [];
  let header = '';
  for (const ch of stripComments(css)) {
    if (ch === '{') {
      const h = header.trim();
      stack.push(h);
      if (!h.startsWith('@') && h.includes(':hover') && !stack.some((s) => /\(hover:\s*hover\)/.test(s))) found.push(h);
      header = '';
    } else if (ch === '}') {
      stack.pop();
      header = '';
    } else if (ch === ';') {
      header = '';
    } else {
      header += ch;
    }
  }
  return found;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}
