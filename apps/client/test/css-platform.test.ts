import { describe, expect, it } from 'vitest';
import { cssFiles, indexHtml, stripComments, topLevelCss, ungatedHover } from './css-helpers';

describe('ungatedHover (o próprio detector)', () => {
  it('aceita :hover dentro de @media (hover: hover)', () => {
    expect(ungatedHover('@media (hover: hover) and (pointer: fine) { .a:hover { color: red; } }')).toEqual([]);
  });
  it('acusa :hover solto', () => {
    expect(ungatedHover('.a { color: blue; } .b:hover:not(:disabled) { color: red; }')).toEqual(['.b:hover:not(:disabled)']);
  });
  it('acusa :hover dentro de outra media query', () => {
    expect(ungatedHover('@media (min-width: 720px) { .c:hover { color: red; } }')).toEqual(['.c:hover']);
  });
});

describe('camada de plataforma', () => {
  const app = stripComments(cssFiles().find((f) => f.file.endsWith('styles/app.css'))!.css);

  it('viewport cobre o notch e nunca desliga o zoom', () => {
    const html = indexHtml();
    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('interactive-widget=resizes-content');
    expect(html).not.toMatch(/user-scalable|maximum-scale/);
  });

  it.each(cssFiles().map((f) => [f.file, f.css] as const))('%s: todo :hover está atrás de (hover: hover)', (_file, css) => {
    expect(ungatedHover(css)).toEqual([]);
  });

  it.each(cssFiles().map((f) => [f.file, f.css] as const))('%s: sem 100vh', (_file, css) => {
    expect(stripComments(css)).not.toMatch(/100vh/);
  });

  it('app.css tem as correções de toque e de scroll', () => {
    expect(app).toMatch(/-webkit-tap-highlight-color:\s*transparent/);
    expect(app).toMatch(/touch-action:\s*manipulation/);
    expect(app).toMatch(/overscroll-behavior:\s*none/);
  });

  it('campos de texto têm 16px para o iOS não dar zoom no foco', () => {
    expect(app).toMatch(/input,\s*textarea,\s*select\s*\{[^}]*font-size:\s*16px/);
    // a base (antes de qualquer @media) não rebaixa o textarea; o desktop volta aos 14px em min-width: 721px
    expect(app.split('@media')[0]).not.toMatch(/textarea\.input\s*\{[^}]*font-size/);
  });

  it('o feedback de pressão novo da carta existe só em dispositivos sem hover (o desktop não ganha estado novo)', () => {
    const ui = cssFiles().find((f) => f.file.endsWith('components/ui.css'))!.css;
    expect(topLevelCss(ui)).not.toContain('.card-face:active');
    expect(stripComments(ui)).toMatch(/@media \(hover: none\)[^{]*\{[^@]*\.card-face:active/);
  });
});
