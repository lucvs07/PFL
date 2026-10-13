import { readJson, writeJson, type StorageLike } from '../lib/storage';

export const STORAGE_KEY = 'pfl.audio.v1';

export interface AudioSettings {
  muted: boolean;
  /** 0 a 1, em passos de 0,1 */
  music: number;
  sfx: number;
}

export const DEFAULT_SETTINGS: AudioSettings = { muted: false, music: 0.4, sfx: 0.7 };

/** Ganhos-base: a música fica abaixo dos efeitos para o feedback da jogada sempre passar por cima. */
export const MUSIC_BASE = 0.22;
export const SFX_BASE = 0.5;

export function roundVolume(v: number): number {
  const clamped = Math.min(1, Math.max(0, v));
  return Math.round(clamped * 10) / 10;
}

export function parseSettings(raw: unknown): AudioSettings {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ...DEFAULT_SETTINGS };
  const o = raw as Record<string, unknown>;
  // Fora de 0..1 é valor inválido (storage corrompido ou de outra versão): volta ao padrão, não ao volume máximo.
  const volume = (value: unknown, fallback: number) =>
    typeof value === 'number' && value >= 0 && value <= 1 ? roundVolume(value) : fallback;
  return {
    muted: typeof o.muted === 'boolean' ? o.muted : DEFAULT_SETTINGS.muted,
    music: volume(o.music, DEFAULT_SETTINGS.music),
    sfx: volume(o.sfx, DEFAULT_SETTINGS.sfx),
  };
}

export function loadSettings(storage: StorageLike | null): AudioSettings {
  return parseSettings(readJson(storage, STORAGE_KEY));
}

export function saveSettings(storage: StorageLike | null, settings: AudioSettings): boolean {
  return writeJson(storage, STORAGE_KEY, settings);
}

export function gainsFor(s: AudioSettings): { master: number; music: number; sfx: number } {
  return { master: s.muted ? 0 : 1, music: s.music * MUSIC_BASE, sfx: s.sfx * SFX_BASE };
}

export type VolumeLevel = 0 | 1 | 2 | 3;

/** Quantas ondas o ícone mostra: pelo maior dos dois volumes. */
export function volumeLevel(s: AudioSettings): VolumeLevel {
  const top = Math.max(s.music, s.sfx);
  if (top <= 0) return 0;
  if (top <= 0.3) return 1;
  if (top <= 0.7) return 2;
  return 3;
}
