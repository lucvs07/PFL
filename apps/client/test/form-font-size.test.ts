import { describe, expect, it } from 'vitest';
import { cssFiles, stripComments, topLevelCss } from './css-helpers';

/** Classes de <input>/<select>/<textarea> do cliente que definem font-size próprio (o iOS dá zoom abaixo de 16px). */
const FORM_RULES = ['.depth-add', '.home-code', '.builder-controls .input', '.builder-controls .builder-name', '.pokedex-filters .input'];

const all = cssFiles();
const rule = (css: string, selector: string) => css.match(new RegExp(`(?:^|\\})\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`));

describe('campos de formulário no celular', () => {
  it('textarea.input segue a mesma regra', () => {
    const app = all.find((f) => f.file.endsWith('styles/app.css'))!.css;
    const media = stripComments(app).match(/@media \(min-width: 721px\) and \(pointer: fine\)\s*\{([\s\S]*?)\n\}/g)?.join('\n') ?? '';
    expect(media).toContain('textarea.input');
  });

  it.each(FORM_RULES)('%s: 16px na base (celular), tamanho original restaurado só com mouse (min-width: 721px e pointer: fine)', (selector) => {
    const file = all.find((f) => rule(topLevelCss(f.css), selector));
    expect(file, `regra ${selector} não encontrada`).toBeDefined();
    const base = rule(topLevelCss(file!.css), selector)![1];
    expect(base).toMatch(/font-size:\s*16px/);

    // celular deitado (>= 721px, mas com toque) também precisa de 16px: o restore é só para mouse
    const media = stripComments(file!.css).match(/@media \(min-width: 721px\) and \(pointer: fine\)\s*\{([\s\S]*?)\n\}/g)?.join('\n') ?? '';
    expect(media, `${selector} precisa voltar ao tamanho de hoje no desktop com mouse`).toContain(selector);
  });
});
