import { describe, it, expect } from 'vitest';
import { encodeTeam, decodeTeam } from '../src/index';
import { electricTeam } from '../../engine/test/fixtures';

/** base64url de bytes arbitrários, para montar entradas inválidas nos testes. */
const rawBase64Url = (text: string): string =>
  btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('encodeTeam / decodeTeam', () => {
  it('ida e volta preserva o time', () => {
    const team = electricTeam();
    expect(decodeTeam(encodeTeam(team))).toEqual(team);
  });

  it('gera só caracteres base64url, sem padding', () => {
    expect(encodeTeam(electricTeam())).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('preserva acentos e caracteres fora do ASCII no nome', () => {
    const team = { ...electricTeam(), name: 'Trovões de Pallet — ñ ü' };
    expect(decodeTeam(encodeTeam(team))).toEqual(team);
  });

  it('ignora espaços nas pontas (código colado de um chat)', () => {
    const team = electricTeam();
    expect(decodeTeam(`  ${encodeTeam(team)}\n`)).toEqual(team);
  });

  it('devolve o JSON decodificado mesmo que não seja um time (a validação é do chamador)', () => {
    expect(decodeTeam(rawBase64Url('{"a":1}'))).toEqual({ a: 1 });
  });

  it('nunca lança: entradas inválidas devolvem null', () => {
    const bad: unknown[] = [
      '',
      '   ',
      '!!!!',
      'a', // tamanho impossível em base64
      'abc', // decodifica para bytes que não são JSON
      rawBase64Url('não é json'),
      '_w', // byte 0xFF: UTF-8 inválido
      'A'.repeat(20_000), // longo demais
      123,
      null,
      undefined,
      { teamCode: 'x' },
    ];
    for (const code of bad) {
      expect(() => decodeTeam(code as string)).not.toThrow();
      expect(decodeTeam(code as string)).toBeNull();
    }
  });
});
