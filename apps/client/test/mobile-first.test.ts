import { describe, expect, it } from 'vitest';
import { cssFiles, stripComments } from './css-helpers';

describe('CSS mobile-first', () => {
  it.each(cssFiles().map((f) => [f.file, f.css] as const))('%s: nenhuma @media (max-width)', (_file, css) => {
    expect(stripComments(css)).not.toMatch(/@media[^{]*\(max-width/);
  });

  it('só usa os pontos de quebra combinados', () => {
    const allowed = new Set([600, 601, 721, 901, 961, 1041]);
    const found = new Set<number>();
    for (const { css } of cssFiles()) {
      for (const m of stripComments(css).matchAll(/@media[^{]*\(min-width:\s*(\d+)px\)/g)) found.add(Number(m[1]));
    }
    expect([...found].filter((w) => !allowed.has(w))).toEqual([]);
  });

  it('a query de celular deitado só vale com toque: janela de desktop baixa não pode mudar de layout', () => {
    const found: string[] = [];
    for (const { file, css } of cssFiles()) {
      for (const m of stripComments(css).matchAll(/@media[^{]*orientation:\s*landscape[^{]*/g)) {
        if (!/\(pointer:\s*coarse\)/.test(m[0])) found.push(`${file}: ${m[0].trim()}`);
      }
    }
    expect(found).toEqual([]);
  });
});
