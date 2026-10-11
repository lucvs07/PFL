import { describe, it, expect } from 'vitest';
import { main, parseArgs } from '../src/cli';

describe('parseArgs', () => {
  it('lê --games, --seed, --min-sample e --gate', () => {
    expect(parseArgs(['--games', '10'])).toEqual({ games: 10, seed: 1, minSample: 1000, gate: false });
    expect(parseArgs(['--games', '4', '--seed', '0', '--min-sample', '50', '--gate'])).toEqual({ games: 4, seed: 0, minSample: 50, gate: true });
  });

  it.each([
    [[], /--games é obrigatório/],
    [['--games'], /--games precisa/],
    [['--games', '0'], /--games precisa/],
    [['--games', '-5'], /--games precisa/],
    [['--games', 'dez'], /--games precisa/],
    [['--games', '2.5'], /--games precisa/],
    [['--games', '--seed', '3'], /--games precisa/],
    [['--games', '3', '--seed', 'x'], /--seed precisa/],
    [['--games', '3', '--turbo'], /opção desconhecida/],
  ])('rejeita %j com mensagem clara', (argv, message) => {
    expect(() => parseArgs(argv as string[])).toThrow(message);
  });
});

describe('main', () => {
  it('devolve 2 e explica o uso quando os argumentos são inválidos', () => {
    const errors: string[] = [];
    expect(main(['--games', '0'], () => {}, (l) => errors.push(l))).toBe(2);
    expect(errors.join('\n')).toContain('uso: npm run sim -- --games N');
  });

  it('roda e imprime o relatório', () => {
    const out: string[] = [];
    expect(main(['--games', '4', '--seed', '2'], (l) => out.push(l))).toBe(0);
    expect(out.join('\n')).toContain('relatório de balanceamento (4 partidas)');
  });

  it('com --gate devolve 1 se alguma carta amostrada sair da faixa', () => {
    // com amostra mínima 1, quase toda carta jogada em 2 partidas tem win rate 0% ou 100%
    expect(main(['--games', '2', '--seed', '2', '--min-sample', '1', '--gate'], () => {})).toBe(1);
  });
});
