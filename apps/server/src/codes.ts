import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@pfl/protocol';

const MAX_ATTEMPTS = 1000;

/** Código de 6 letras (A–Z sem I/O). O servidor pode usar Math.random; o motor, não. */
export function generateRoomCode(random: () => number, isTaken: (code: string) => boolean): string {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      const index = Math.floor(random() * ROOM_CODE_ALPHABET.length) % ROOM_CODE_ALPHABET.length;
      code += ROOM_CODE_ALPHABET[index];
    }
    if (!isTaken(code)) return code;
  }
  throw new Error('Não foi possível gerar um código de sala livre');
}

export function normalizeRoomCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const code = input.trim().toUpperCase();
  if (code.length !== ROOM_CODE_LENGTH) return null;
  return [...code].every((c) => ROOM_CODE_ALPHABET.includes(c)) ? code : null;
}
