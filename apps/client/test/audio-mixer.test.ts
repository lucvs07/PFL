import { describe, expect, it } from 'vitest';
import { memoryStorage } from '../src/lib/storage';
import {
  DEFAULT_SETTINGS, MUSIC_BASE, SFX_BASE, STORAGE_KEY,
  gainsFor, loadSettings, parseSettings, roundVolume, saveSettings, volumeLevel,
} from '../src/audio/mixer';

describe('roundVolume', () => {
  it('limita a 0..1 e arredonda em passos de 0,1', () => {
    expect(roundVolume(0.34)).toBe(0.3);
    expect(roundVolume(0.35)).toBe(0.4);
    expect(roundVolume(-2)).toBe(0);
    expect(roundVolume(7)).toBe(1);
  });
});

describe('parseSettings', () => {
  it('padrão: música 0,4, efeitos 0,7, sem mudo', () => {
    expect(DEFAULT_SETTINGS).toEqual({ muted: false, music: 0.4, sfx: 0.7 });
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('valor corrompido volta ao padrão por campo', () => {
    expect(parseSettings({ muted: 'sim', music: 7, sfx: 'alto' })).toEqual({ muted: false, music: 1, sfx: 0.7 });
    expect(parseSettings({ music: Number.NaN, sfx: null })).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('texto')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings([1, 2])).toEqual(DEFAULT_SETTINGS);
  });

  it('aceita um valor válido', () => {
    expect(parseSettings({ muted: true, music: 0.2, sfx: 0 })).toEqual({ muted: true, music: 0.2, sfx: 0 });
  });
});

describe('loadSettings / saveSettings', () => {
  it('ida e volta pelo storage', () => {
    const storage = memoryStorage();
    expect(saveSettings(storage, { muted: true, music: 0.3, sfx: 0.9 })).toBe(true);
    expect(loadSettings(storage)).toEqual({ muted: true, music: 0.3, sfx: 0.9 });
  });

  it('storage nulo, JSON quebrado ou escrita que falha não lançam', () => {
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
    const broken = memoryStorage();
    broken.setItem(STORAGE_KEY, '{nao e json');
    expect(loadSettings(broken)).toEqual(DEFAULT_SETTINGS);
    const full = { getItem: () => null, removeItem: () => {}, setItem: () => { throw new Error('cota'); } };
    expect(saveSettings(full, DEFAULT_SETTINGS)).toBe(false);
    expect(saveSettings(null, DEFAULT_SETTINGS)).toBe(false);
  });
});

describe('gainsFor', () => {
  it('mestre vale 0 no mudo e 1 fora dele; música fica abaixo dos efeitos', () => {
    expect(gainsFor({ muted: true, music: 1, sfx: 1 }).master).toBe(0);
    const g = gainsFor({ muted: false, music: 1, sfx: 1 });
    expect(g.master).toBe(1);
    expect(g.music).toBeCloseTo(MUSIC_BASE, 9);
    expect(g.sfx).toBeCloseTo(SFX_BASE, 9);
    expect(g.music).toBeLessThan(g.sfx);
  });
});

describe('volumeLevel (ondas do ícone)', () => {
  it('0 quando os dois volumes são 0; 1 a 3 pelo maior volume', () => {
    expect(volumeLevel({ muted: false, music: 0, sfx: 0 })).toBe(0);
    expect(volumeLevel({ muted: false, music: 0.2, sfx: 0 })).toBe(1);
    expect(volumeLevel({ muted: false, music: 0.4, sfx: 0.5 })).toBe(2);
    expect(volumeLevel({ muted: false, music: 0.4, sfx: 0.9 })).toBe(3);
  });
});
