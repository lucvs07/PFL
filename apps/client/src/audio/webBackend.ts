import type { AudioBackend, Channel, Tone } from './backend';

const ATTACK_S = 0.004;
const SILENCE = 0.0001;
const PULSE_HARMONICS = 32;

type AudioContextCtor = typeof AudioContext;

function contextCtor(): AudioContextCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext;
}

const unavailable: AudioBackend = {
  available: false,
  currentTime: 0,
  running: false,
  resume: () => {},
  setGain: () => {},
  fadeMusic: () => {},
  playTone: () => {},
};

/** Série de Fourier de uma onda de pulso com o ciclo de trabalho `duty`. */
function pulseWave(ctx: AudioContext, duty: number): PeriodicWave {
  const real = new Float32Array(PULSE_HARMONICS + 1);
  const imag = new Float32Array(PULSE_HARMONICS + 1);
  for (let n = 1; n <= PULSE_HARMONICS; n++) {
    const k = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
    real[n] = k * Math.cos(n * Math.PI * duty);
    imag[n] = k * Math.sin(n * Math.PI * duty);
  }
  return ctx.createPeriodicWave(real, imag);
}

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

interface Graph {
  ctx: AudioContext;
  master: GainNode;
  music: GainNode;
  fade: GainNode;
  sfx: GainNode;
  noise: AudioBuffer;
}

export function createWebBackend(): AudioBackend {
  const Ctor = contextCtor();
  if (!Ctor) return unavailable;

  let graph: Graph | null = null;
  const pulses = new Map<number, PeriodicWave>();

  const ensure = (): Graph => {
    if (graph) return graph;
    const ctx = new Ctor();
    const master = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();
    const music = ctx.createGain();
    const fade = ctx.createGain();
    const sfx = ctx.createGain();
    fade.connect(music);
    music.connect(master);
    sfx.connect(master);
    master.connect(compressor);
    compressor.connect(ctx.destination);
    graph = { ctx, master, music, fade, sfx, noise: noiseBuffer(ctx) };
    return graph;
  };

  const ramp = (param: AudioParam, ctx: AudioContext, value: number, seconds: number) => {
    const t = ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(value, t + Math.max(seconds, 0.001));
  };

  return {
    available: true,
    get currentTime() {
      return graph?.ctx.currentTime ?? 0;
    },
    get running() {
      return graph?.ctx.state === 'running';
    },
    resume() {
      const { ctx } = ensure();
      if (ctx.state === 'suspended') void ctx.resume();
    },
    setGain(node, value, seconds) {
      if (!graph) return;
      ramp(graph[node].gain, graph.ctx, value, seconds);
    },
    fadeMusic(value, seconds) {
      if (!graph) return;
      ramp(graph.fade.gain, graph.ctx, value, seconds);
    },
    playTone(channel: Channel, tone: Tone) {
      if (!graph) return;
      const { ctx, noise } = graph;
      const start = Math.max(tone.start, ctx.currentTime);
      const end = start + tone.duration;
      const release = Math.min(0.04, tone.duration / 2);

      const env = ctx.createGain();
      env.gain.setValueAtTime(SILENCE, start);
      env.gain.linearRampToValueAtTime(tone.gain, start + ATTACK_S);
      env.gain.setValueAtTime(tone.gain, Math.max(start + ATTACK_S, end - release));
      env.gain.exponentialRampToValueAtTime(SILENCE, end);
      env.connect(channel === 'music' ? graph.fade : graph.sfx);

      let source: OscillatorNode | AudioBufferSourceNode;
      if (tone.wave === 'noise') {
        const src = ctx.createBufferSource();
        src.buffer = noise;
        src.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.value = 0.8;
        filter.frequency.setValueAtTime(tone.freq, start);
        if (tone.freqEnd) filter.frequency.exponentialRampToValueAtTime(tone.freqEnd, end);
        src.connect(filter);
        filter.connect(env);
        source = src;
      } else {
        const osc = ctx.createOscillator();
        if (tone.wave === 'square') {
          const duty = tone.duty ?? 0.5;
          let wave = pulses.get(duty);
          if (!wave) {
            wave = pulseWave(ctx, duty);
            pulses.set(duty, wave);
          }
          osc.setPeriodicWave(wave);
        } else {
          osc.type = 'triangle';
        }
        osc.frequency.setValueAtTime(tone.freq, start);
        if (tone.freqEnd) osc.frequency.exponentialRampToValueAtTime(tone.freqEnd, end);
        osc.connect(env);
        source = osc;
      }
      source.start(start);
      source.stop(end + 0.02);
      source.onended = () => env.disconnect();
    },
  };
}
