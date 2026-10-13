import type { AudioBackend, Tone } from './backend';
import type { DrumKind, ParsedScore, ScoreChannel, ScoreEvent, VoiceName } from './score';

export const LOOKAHEAD_S = 0.1;
export const TICK_MS = 25;
export const FADE_S = 0.3;

const START_DELAY_S = 0.05;
/** atraso máximo tolerado antes de recomeçar o relógio da faixa (evita rajada de notas velhas) */
const LATE_S = 0.25;
const NOTE_GAP = 0.92;

const VOICE_GAIN: Record<VoiceName, number> = { pulse1: 0.5, pulse2: 0.35, tri: 0.7, noise: 0.5 };

const DRUMS: Record<DrumKind, (start: number) => Tone> = {
  k: (start) => ({ wave: 'triangle', freq: 150, freqEnd: 45, start, duration: 0.12, gain: 0.9 }),
  s: (start) => ({ wave: 'noise', freq: 1800, freqEnd: 900, start, duration: 0.1, gain: 0.55 }),
  h: (start) => ({ wave: 'noise', freq: 7000, start, duration: 0.035, gain: 0.35 }),
};

interface Slot {
  channel: ScoreChannel;
  event: ScoreEvent;
}

interface Track {
  score: ParsedScore;
  byStep: Slot[][];
  loop: boolean;
  onEnd: (() => void) | null;
}

function makeTrack(score: ParsedScore, loop: boolean, onEnd: (() => void) | null): Track {
  const byStep: Slot[][] = Array.from({ length: score.steps }, () => []);
  for (const channel of score.channels) {
    for (const event of channel.events) byStep[event.step].push({ channel, event });
  }
  return { score, byStep, loop, onEnd };
}

export interface Sequencer {
  /** toca a faixa em loop; `null` para (com fade-out). A mesma faixa de novo não reinicia */
  play(score: ParsedScore | null): void;
  /** toca uma vez; `onEnd` roda quando o som termina */
  playOnce(score: ParsedScore, onEnd: () => void): void;
  pause(): void;
  resume(): void;
  /** um passo do agendador (chamado a cada TICK_MS; público para os testes) */
  tick(): void;
}

export function createSequencer(backend: AudioBackend): Sequencer {
  let track: Track | null = null;
  let pending: Track | null = null;
  let step = 0;
  let nextTime = 0;
  let paused = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let switchTimer: ReturnType<typeof setTimeout> | null = null;
  let endTimer: ReturnType<typeof setTimeout> | null = null;

  const clearTimers = () => {
    if (switchTimer !== null) clearTimeout(switchTimer);
    if (endTimer !== null) clearTimeout(endTimer);
    switchTimer = null;
    endTimer = null;
  };
  const stopTicking = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };

  function schedule(t: Track, i: number, start: number) {
    for (const { channel, event } of t.byStep[i]) {
      if (event.drum) {
        backend.playTone('music', DRUMS[event.drum](start));
      } else if (event.freq !== undefined) {
        backend.playTone('music', {
          wave: channel.voice === 'tri' ? 'triangle' : 'square',
          duty: channel.duty,
          freq: event.freq,
          start,
          duration: event.length * t.score.stepSeconds * NOTE_GAP,
          gain: VOICE_GAIN[channel.voice] * channel.gain,
        });
      }
    }
  }

  function finish(t: Track, remaining: number) {
    track = null;
    stopTicking();
    const onEnd = t.onEnd;
    if (onEnd) {
      endTimer = setTimeout(() => {
        endTimer = null;
        onEnd();
      }, Math.max(0, remaining) * 1000 + 100);
    }
  }

  function tick() {
    const t = track;
    if (t === null || paused) return;
    const now = backend.currentTime;
    if (nextTime < now - LATE_S) nextTime = now + 0.02;
    while (nextTime < now + LOOKAHEAD_S) {
      schedule(t, step, nextTime);
      step += 1;
      nextTime += t.score.stepSeconds;
      if (step >= t.score.steps) {
        if (t.loop) {
          step = 0;
          continue;
        }
        finish(t, nextTime - now);
        return;
      }
    }
  }

  function begin(next: Track) {
    pending = null;
    track = next;
    step = 0;
    nextTime = backend.currentTime + START_DELAY_S;
    backend.fadeMusic(1, 0);
    if (timer === null) timer = setInterval(tick, TICK_MS);
    tick();
  }

  function replaceWith(next: Track) {
    const wasPlaying = track !== null;
    clearTimers();
    track = null;
    if (!wasPlaying) {
      begin(next);
      return;
    }
    pending = next;
    backend.fadeMusic(0, FADE_S);
    switchTimer = setTimeout(() => {
      switchTimer = null;
      if (pending) begin(pending);
    }, FADE_S * 1000);
  }

  function stop() {
    const wasPlaying = track !== null;
    clearTimers();
    track = null;
    pending = null;
    stopTicking();
    if (wasPlaying) backend.fadeMusic(0, FADE_S);
  }

  return {
    play(score) {
      if (score === null) return stop();
      const current = track ?? pending;
      if (current && current.loop && current.score === score) return;
      replaceWith(makeTrack(score, true, null));
    },
    playOnce(score, onEnd) {
      replaceWith(makeTrack(score, false, onEnd));
    },
    pause() {
      paused = true;
    },
    resume() {
      if (!paused) return;
      paused = false;
      nextTime = Math.max(nextTime, backend.currentTime + 0.02);
      tick();
    },
    tick,
  };
}
