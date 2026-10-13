import type { StorageLike } from '../lib/storage';
import type { AnimStep } from '../match/timeline';
import type { AudioBackend, Channel } from './backend';
import { cuesFor, type Cue, type TimedCue } from './cues';
import { gainsFor, loadSettings, roundVolume, saveSettings, type AudioSettings } from './mixer';
import { RECIPES } from './recipes';
import type { ParsedScore } from './score';
import { createSequencer } from './sequencer';
import { recipeDuration, scheduleRecipe } from './synth';

export type MusicName = 'menu' | 'match';
export type JingleName = 'win' | 'lose';

export interface AudioScores {
  menu: ParsedScore;
  match: ParsedScore;
  win: ParsedScore;
  lose: ParsedScore;
}

export interface AudioState extends AudioSettings {
  /** o navegador oferece Web Audio */
  available: boolean;
  /** já houve um gesto do usuário e o contexto foi criado */
  unlocked: boolean;
}

export interface AudioDeps {
  backend: AudioBackend;
  storage: StorageLike | null;
  scores: AudioScores;
}

export interface Audio {
  /** idempotente; chame dentro de um gesto do usuário */
  unlock(): void;
  play(cue: Cue): void;
  /** `at` em ms a partir de agora */
  playCues(cues: readonly TimedCue[]): void;
  playTimeline(steps: readonly AnimStep[]): void;
  setMusic(name: MusicName | null): void;
  playJingle(name: JingleName): void;
  setVolume(channel: Channel, value: number): void;
  setMuted(muted: boolean): void;
  setHidden(hidden: boolean): void;
  getState(): AudioState;
  subscribe(listener: () => void): () => void;
}

export const COOLDOWN_S = 0.04;
export const MAX_CONCURRENT = 3;

export function createAudio({ backend, storage, scores }: AudioDeps): Audio {
  let settings = loadSettings(storage);
  let unlocked = false;
  let hidden = false;
  let jingling = false;
  let wanted: MusicName | null = null;
  const listeners = new Set<() => void>();
  const sequencer = createSequencer(backend);
  const lastScheduled = new Map<Cue, number>();
  const endTimes = new Map<Cue, number[]>();

  const snapshot = (): AudioState => ({ available: backend.available, unlocked, ...settings });
  let state = snapshot();
  const emit = () => {
    state = snapshot();
    listeners.forEach((l) => l());
  };

  const applyGains = (rampSeconds: number) => {
    const g = gainsFor(settings);
    backend.setGain('master', g.master, rampSeconds);
    backend.setGain('music', g.music, rampSeconds);
    backend.setGain('sfx', g.sfx, rampSeconds);
  };

  const applyMusic = () => sequencer.play(wanted ? scores[wanted] : null);

  const scheduleCue = (cue: Cue, delaySeconds: number) => {
    if (!unlocked || !backend.available || hidden) return;
    if (settings.muted || settings.sfx === 0) return;
    const when = backend.currentTime + delaySeconds;
    const last = lastScheduled.get(cue);
    if (last !== undefined && Math.abs(when - last) < COOLDOWN_S) return;
    const live = (endTimes.get(cue) ?? []).filter((end) => end > when);
    if (live.length >= MAX_CONCURRENT) {
      endTimes.set(cue, live);
      return;
    }
    const recipe = RECIPES[cue];
    scheduleRecipe(backend, recipe, when);
    live.push(when + recipeDuration(recipe));
    endTimes.set(cue, live);
    lastScheduled.set(cue, when);
  };

  const update = (next: AudioSettings) => {
    settings = next;
    saveSettings(storage, settings);
    if (unlocked) applyGains(0.03);
    emit();
  };

  return {
    unlock() {
      if (!backend.available) return;
      if (!backend.running) backend.resume();
      if (unlocked) return;
      unlocked = true;
      applyGains(0);
      if (wanted !== null) applyMusic();
      emit();
    },
    play: (cue) => scheduleCue(cue, 0),
    playCues(cues) {
      for (const { at, cue } of cues) scheduleCue(cue, at / 1000);
    },
    playTimeline(steps) {
      for (const { at, cue } of cuesFor(steps)) scheduleCue(cue, at / 1000);
    },
    setMusic(name) {
      wanted = name;
      if (unlocked && !jingling) applyMusic();
    },
    playJingle(name) {
      if (!unlocked || !backend.available) return;
      jingling = true;
      sequencer.playOnce(scores[name], () => {
        jingling = false;
        applyMusic();
      });
    },
    setVolume(channel, value) {
      const v = roundVolume(value);
      const muted = settings.muted && v === 0; // subir um volume desmuta
      update(channel === 'music' ? { ...settings, music: v, muted } : { ...settings, sfx: v, muted });
    },
    setMuted(muted) {
      update({ ...settings, muted });
    },
    setHidden(value) {
      hidden = value;
      if (value) sequencer.pause();
      else sequencer.resume();
    },
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
