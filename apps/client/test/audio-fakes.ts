import type { AudioBackend, Channel, Tone } from '../src/audio/backend';

/** Backend que só registra as chamadas; o relógio é movido à mão pelo teste. */
export class FakeBackend implements AudioBackend {
  available = true;
  running = false;
  currentTime = 0;
  resumed = 0;
  tones: { channel: Channel; tone: Tone }[] = [];
  gains: { node: 'master' | Channel; value: number; seconds: number }[] = [];
  fades: { value: number; seconds: number }[] = [];

  resume(): void {
    this.resumed += 1;
    this.running = true;
  }
  setGain(node: 'master' | Channel, value: number, seconds: number): void {
    this.gains.push({ node, value, seconds });
  }
  fadeMusic(value: number, seconds: number): void {
    this.fades.push({ value, seconds });
  }
  playTone(channel: Channel, tone: Tone): void {
    this.tones.push({ channel, tone });
  }
  /** tons de um canal */
  on(channel: Channel): Tone[] {
    return this.tones.filter((t) => t.channel === channel).map((t) => t.tone);
  }
}
