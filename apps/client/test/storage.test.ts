import { describe, it, expect } from 'vitest';
import { memoryStorage, probeStorage, readJson, removeKey, writeJson, type StorageLike } from '../src/lib/storage';

const throwing = (what: 'get' | 'set'): StorageLike => ({
  getItem: () => { if (what === 'get') throw new Error('SecurityError'); return null; },
  setItem: () => { throw new Error('QuotaExceededError'); },
  removeItem: () => {},
});

describe('probeStorage', () => {
  it('devolve null quando o próprio acesso ao storage lança (modo privado)', () => {
    expect(probeStorage(() => { throw new Error('SecurityError'); })).toBeNull();
  });

  it('devolve null quando a escrita falha (cota cheia)', () => {
    expect(probeStorage(() => throwing('set'))).toBeNull();
  });

  it('devolve null quando não há storage', () => {
    expect(probeStorage(() => undefined)).toBeNull();
  });

  it('devolve o storage quando funciona e não deixa a chave de teste', () => {
    const mem = memoryStorage();
    expect(probeStorage(() => mem)).toBe(mem);
    expect(mem.getItem('__pfl_probe__')).toBeNull();
  });
});

describe('readJson / writeJson', () => {
  it('faz ida e volta', () => {
    const mem = memoryStorage();
    expect(writeJson(mem, 'k', { a: 1 })).toBe(true);
    expect(readJson(mem, 'k')).toEqual({ a: 1 });
    removeKey(mem, 'k');
    expect(readJson(mem, 'k')).toBeNull();
  });

  it('JSON corrompido vira null', () => {
    const mem = memoryStorage();
    mem.setItem('k', '{nao-e-json');
    expect(readJson(mem, 'k')).toBeNull();
  });

  it('nunca lança: storage nulo, getItem que lança, setItem que lança', () => {
    expect(readJson(null, 'k')).toBeNull();
    expect(writeJson(null, 'k', 1)).toBe(false);
    expect(readJson(throwing('get'), 'k')).toBeNull();
    expect(writeJson(throwing('set'), 'k', 1)).toBe(false);
    expect(() => removeKey(null, 'k')).not.toThrow();
  });
});
