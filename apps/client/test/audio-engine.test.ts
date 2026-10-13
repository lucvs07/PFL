import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_CONCURRENT, createAudio, type AudioScores } from '../src/audio/engine';
import { MUSIC_BASE, SFX_BASE, STORAGE_KEY } from '../src/audio/mixer';
import { RECIPES } from '../src/audio/recipes';
import { noteFrequency, parseScore } from '../src/audio/score';
import { memoryStorage, type StorageLike } from '../src/lib/storage';
import type { AnimStep } from '../src/match/timeline';
import { FakeBackend } from './audio-fakes';

const tiny = (note: string) =>
  parseScore({ bpm: 120, channels: [{ voice: 'pulse1', bars: [`${note} - - - . . . . . . . . . . . .`] }] });
const scores: AudioScores = { menu: tiny('C4'), match: tiny('E4'), win: tiny('G4'), lose: tiny('A4') };

function setup(opts: { storage?: StorageLike | null; available?: boolean } = {}) {
  const backend = new FakeBackend();
  backend.available = opts.available ?? true;
  const storage = opts.storage === undefined ? memoryStorage() : opts.storage;
  const audio = createAudio({ backend, storage, scores });
  return { backend, storage, audio };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('desbloqueio', () => {
  it('efeitos antes do primeiro gesto são descartados; depois do unlock tocam', () => {
    const { backend, audio } = setup();
    audio.play('tackle');
    expect(backend.tones).toHaveLength(0);
    expect(audio.getState().unlocked).toBe(false);
    audio.unlock();
    audio.unlock();
    expect(backend.resumed).toBe(1);
    expect(audio.getState().unlocked).toBe(true);
    audio.play('tackle');
    expect(backend.tones).toHaveLength(RECIPES.tackle.length);
  });

  it('a música pedida antes do gesto começa quando o áudio é desbloqueado', () => {
    const { backend, audio } = setup();
    audio.setMusic('menu');
    expect(backend.tones).toHaveLength(0);
    audio.unlock();
    expect(backend.on('music')[0].freq).toBeCloseTo(noteFrequency('C4')!, 6);
  });

  it('se o contexto for suspenso de novo, o próximo gesto o retoma', () => {
    const { backend, audio } = setup();
    audio.unlock();
    backend.running = false;
    audio.unlock();
    expect(backend.resumed).toBe(2);
  });

  it('aplica os ganhos do mixer ao desbloquear', () => {
    const { backend, audio } = setup();
    audio.unlock();
    const last = (node: string) => backend.gains.filter((g) => g.node === node).at(-1)?.value;
    expect(last('master')).toBe(1);
    expect(last('music')).toBeCloseTo(0.4 * MUSIC_BASE, 9);
    expect(last('sfx')).toBeCloseTo(0.7 * SFX_BASE, 9);
  });
});

describe('contexto suspenso depois do desbloqueio', () => {
  it('efeitos e jingle são descartados enquanto o contexto não está tocando', () => {
    const { backend, audio } = setup();
    audio.unlock();
    backend.running = false; // iOS suspendeu o contexto (tela bloqueada, ligação)
    audio.play('tackle');
    audio.playCues([{ at: 0, cue: 'td' }]);
    audio.playJingle('win');
    expect(backend.tones).toHaveLength(0);
    expect(backend.fades).toHaveLength(0);
    audio.unlock(); // próximo gesto retoma
    audio.play('tackle');
    expect(backend.tones).toHaveLength(RECIPES.tackle.length);
  });
});

describe('sem Web Audio', () => {
  it('tudo vira no-op e available é falso', () => {
    const { backend, audio } = setup({ available: false });
    expect(audio.getState().available).toBe(false);
    audio.unlock();
    audio.setMusic('menu');
    audio.play('td');
    audio.playJingle('win');
    audio.playTimeline([{ kind: 'SNAP', at: 0, duration: 300 }]);
    expect(backend.resumed).toBe(0);
    expect(backend.tones).toHaveLength(0);
  });
});

describe('volume, mudo e persistência', () => {
  it('guarda no storage e a próxima instância lê de volta', () => {
    const { storage, audio } = setup();
    audio.setVolume('music', 0.34);
    audio.setMuted(true); // mudo por último: subir um volume desmuta
    const again = createAudio({ backend: new FakeBackend(), storage, scores });
    expect(again.getState()).toMatchObject({ muted: true, music: 0.3, sfx: 0.7 });
  });

  it('subir um volume acima de 0 desmuta; zerar não mexe no mudo', () => {
    const { audio } = setup();
    audio.setMuted(true);
    audio.setVolume('sfx', 0.5);
    expect(audio.getState().muted).toBe(false);
    audio.setMuted(true);
    audio.setVolume('sfx', 0);
    expect(audio.getState().muted).toBe(true);
  });

  it('mudo zera o mestre; efeitos não são agendados no mudo', () => {
    const { backend, audio } = setup();
    audio.unlock();
    audio.setMuted(true);
    expect(backend.gains.filter((g) => g.node === 'master').at(-1)?.value).toBe(0);
    audio.play('tackle');
    expect(backend.tones).toHaveLength(0);
  });

  it('valor corrompido no storage volta ao padrão, e storage nulo funciona', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, '{"music":7,"muted":"sim"}');
    expect(setup({ storage }).audio.getState()).toMatchObject({ muted: false, music: 1, sfx: 0.7 });
    expect(setup({ storage: null }).audio.getState()).toMatchObject({ muted: false, music: 0.4, sfx: 0.7 });
  });

  it('subscribe avisa quando o estado muda e getState é estável entre mudanças', () => {
    const { audio } = setup();
    const listener = vi.fn();
    const off = audio.subscribe(listener);
    const a = audio.getState();
    expect(audio.getState()).toBe(a);
    audio.setVolume('sfx', 0.2);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(audio.getState()).not.toBe(a);
    off();
    audio.setVolume('sfx', 0.3);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('proteção contra rajada', () => {
  it('o mesmo cue repetido em menos de 40 ms é descartado', () => {
    const { backend, audio } = setup();
    audio.unlock();
    audio.play('tackle');
    audio.play('tackle');
    expect(backend.tones).toHaveLength(RECIPES.tackle.length);
  });

  it('no máximo 3 instâncias simultâneas do mesmo cue', () => {
    const { backend, audio } = setup();
    audio.unlock();
    audio.playCues(Array.from({ length: 10 }, (_, i) => ({ at: i * 50, cue: 'td' as const })));
    expect(MAX_CONCURRENT).toBe(3);
    expect(backend.tones).toHaveLength(3 * RECIPES.td.length);
  });
});

describe('playTimeline', () => {
  it('agenda cada cue pelo `at` do passo, a partir do relógio atual', () => {
    const { backend, audio } = setup();
    audio.unlock();
    backend.currentTime = 10;
    const steps: AnimStep[] = [
      { kind: 'SNAP', at: 0, duration: 350 },
      { kind: 'TACKLE', by: 2, carrier: 1, at: 500, duration: 300 },
    ];
    audio.playTimeline(steps);
    const starts = backend.on('sfx').map((t) => t.start);
    expect(starts[0]).toBeCloseTo(10, 6);
    expect(starts.at(-1)).toBeGreaterThanOrEqual(10.5);
    expect(backend.on('sfx')).toHaveLength(RECIPES.snap.length + RECIPES.tackle.length);
  });
});

describe('aba oculta', () => {
  it('não toca efeitos enquanto oculta e a música pausa e volta', () => {
    const { backend, audio } = setup();
    audio.unlock();
    audio.setMusic('menu');
    audio.setHidden(true);
    const before = backend.tones.length;
    audio.play('tackle');
    backend.currentTime = 30;
    vi.advanceTimersByTime(500);
    expect(backend.tones.length).toBe(before);
    audio.setHidden(false);
    audio.play('tackle');
    expect(backend.tones.length).toBeGreaterThan(before);
  });
});

describe('música e jingle', () => {
  it('setMusic troca de faixa com fade; a mesma faixa não reinicia', () => {
    const { backend, audio } = setup();
    audio.unlock();
    audio.setMusic('menu');
    const n = backend.tones.length;
    audio.setMusic('menu');
    expect(backend.tones.length).toBe(n);
    audio.setMusic('match');
    expect(backend.fades.at(-1)).toEqual({ value: 0, seconds: 0.3 });
    vi.advanceTimersByTime(300);
    expect(backend.on('music').at(-1)?.freq).toBeCloseTo(noteFrequency('E4')!, 6);
  });

  it('o jingle substitui a música e setMusic durante o jingle só guarda a intenção', () => {
    const { backend, audio } = setup();
    audio.unlock();
    audio.setMusic('menu');
    audio.playJingle('win');
    expect(backend.fades.at(-1)).toEqual({ value: 0, seconds: 0.3 });
    audio.setMusic('match');
    vi.advanceTimersByTime(300);
    expect(backend.on('music').at(-1)?.freq).toBeCloseTo(noteFrequency('G4')!, 6);
  });

  it('jingle antes do desbloqueio é ignorado', () => {
    const { backend, audio } = setup();
    audio.playJingle('lose');
    expect(backend.tones).toHaveLength(0);
  });
});
