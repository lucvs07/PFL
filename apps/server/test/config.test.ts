import { describe, expect, it } from 'vitest';
import { parseCorsOrigin } from '../src/config';

describe('parseCorsOrigin', () => {
  it('sem valor (ou vazio/espaços) libera qualquer origem, como no dev local', () => {
    expect(parseCorsOrigin(undefined)).toBe(true);
    expect(parseCorsOrigin('')).toBe(true);
    expect(parseCorsOrigin('  , ')).toBe(true);
  });
  it('uma origem vira string', () => {
    expect(parseCorsOrigin('https://lucvs07.github.io')).toBe('https://lucvs07.github.io');
  });
  it('várias origens viram lista, com espaços aparados', () => {
    expect(parseCorsOrigin('https://a.io, http://localhost:5173')).toEqual(['https://a.io', 'http://localhost:5173']);
  });
  it('remove a barra final, que nunca casaria com o header Origin', () => {
    expect(parseCorsOrigin('https://lucvs07.github.io/')).toBe('https://lucvs07.github.io');
  });
  it('normaliza como o navegador serializa o Origin: host minúsculo, sem porta padrão, sem caminho', () => {
    expect(parseCorsOrigin('https://Lucvs07.GitHub.io')).toBe('https://lucvs07.github.io');
    expect(parseCorsOrigin('https://lucvs07.github.io:443')).toBe('https://lucvs07.github.io');
    expect(parseCorsOrigin('https://lucvs07.github.io/PFL/')).toBe('https://lucvs07.github.io');
    expect(parseCorsOrigin('http://localhost:5173')).toBe('http://localhost:5173'); // porta não padrão fica
  });
  it('valor que não é URL derruba a inicialização com mensagem clara', () => {
    expect(() => parseCorsOrigin('lucvs07.github.io')).toThrow(/CORS_ORIGIN inválido: "lucvs07.github.io"/);
    expect(() => parseCorsOrigin('https://ok.io, nada')).toThrow(/CORS_ORIGIN inválido: "nada"/);
  });
});
