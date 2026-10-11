import { describe, it, expect } from 'vitest';
import { displayName, speciesName, TYPE_LABELS, CATEGORY_LABELS } from '../src/lib/names';
import { formatBallOn, formatDown, formatPossession, secondsLeft } from '../src/lib/format';

describe('nomes', () => {
  it('converte os slugs da PokéAPI em nomes de exibição', () => {
    expect(displayName('pikachu')).toBe('Pikachu');
    expect(displayName('mr-mime')).toBe('Mr. Mime');
    expect(displayName('nidoran-f')).toBe('Nidoran♀');
    expect(displayName('nidoran-m')).toBe('Nidoran♂');
    expect(displayName('farfetchd')).toBe("Farfetch'd");
  });

  it('busca o nome pela espécie', () => {
    expect(speciesName(135)).toBe('Jolteon');
    expect(speciesName(122)).toBe('Mr. Mime');
  });

  it('tem rótulos em português', () => {
    expect(TYPE_LABELS.electric).toBe('Elétrico');
    expect(CATEGORY_LABELS.RUN_OUTSIDE).toBe('Corrida por Fora');
  });
});

describe('down & distance e campo', () => {
  it('formata o down', () => {
    expect(formatDown({ down: 1, yardsToGo: 10, ballOn: 25 }, false)).toBe('1st & 10');
    expect(formatDown({ down: 2, yardsToGo: 6, ballOn: 44 }, false)).toBe('2nd & 6');
    expect(formatDown({ down: 4, yardsToGo: 1, ballOn: 50 }, false)).toBe('4th & 1');
  });

  it('usa "Goal" quando a distância chega à end zone', () => {
    expect(formatDown({ down: 3, yardsToGo: 5, ballOn: 95 }, false)).toBe('3rd & Goal');
  });

  it('mostra a tentativa de 2 pontos', () => {
    expect(formatDown({ down: 1, yardsToGo: 3, ballOn: 97 }, true)).toBe('Conversão de 2');
  });

  it('formata a posição da bola do ponto de vista do ataque', () => {
    expect(formatBallOn(44)).toBe('OWN 44');
    expect(formatBallOn(50)).toBe('50');
    expect(formatBallOn(70)).toBe('OPP 30');
  });

  it('formata a posse e a prorrogação', () => {
    expect(formatPossession({ possessions: { A: 3, B: 2 }, offense: 'A', possessionsPerTeam: 6, overtimeRound: 0 })).toBe('Posse 3/6');
    expect(formatPossession({ possessions: { A: 6, B: 6 }, offense: 'B', possessionsPerTeam: 6, overtimeRound: 2 })).toBe('Prorrogação 2');
  });
});

describe('secondsLeft', () => {
  it('arredonda para cima e nunca fica negativo', () => {
    expect(secondsLeft('PLAYCALL', 10_000 + 2_100, 10_000)).toBe(3);
    expect(secondsLeft('PLAYCALL', 9_000, 10_000)).toBe(0);
    expect(secondsLeft('MATCH_END', 99_999, 0)).toBe(0);
  });

  it('limita a diferença de relógio entre cliente e servidor (etapa + animação)', () => {
    expect(secondsLeft('FORMATION', 60_000, 0)).toBe(10); // 5 s de formação + 5 s (ceil de 4,5 s) de animação
  });
});
