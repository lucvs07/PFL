import { describe, it, expect } from 'vitest';
import {
  BOTH_DISCONNECTED_CLOSE_MS, PHASE_SECONDS, RECONNECT_GRACE_MS, RESULT_ANIMATION_MS, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH,
} from '../src/index';

describe('constantes do protocolo', () => {
  it('seguem a spec (2.4 e 8) e o contrato', () => {
    expect(PHASE_SECONDS).toEqual({ FORMATION: 5, PACKAGE: 4, PLAYCALL: 8, CONVERSION: 8 });
    expect(RESULT_ANIMATION_MS).toBe(4500);
    expect(RECONNECT_GRACE_MS).toBe(60_000);
    expect(BOTH_DISCONNECTED_CLOSE_MS).toBe(300_000);
    expect(ROOM_CODE_LENGTH).toBe(6);
  });

  it('o alfabeto do código de sala é A–Z sem I e O', () => {
    expect(ROOM_CODE_ALPHABET).toHaveLength(24);
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[IO]/);
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(24);
    expect(ROOM_CODE_ALPHABET).toMatch(/^[A-Z]+$/);
  });
});
