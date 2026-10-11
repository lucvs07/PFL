// Código de time (exportar/importar, spec 5.5): JSON → UTF-8 → base64url.
// Usa só TextEncoder/TextDecoder/btoa/atob, que existem como globais no Node 24 e nos navegadores.
import type { Team } from '@pfl/engine';

/** Um time real dá cerca de 2 KB. O limite evita gastar CPU com entradas absurdas. */
const MAX_CODE_LENGTH = 16_384;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(code: string): Uint8Array | null {
  if (code.length % 4 === 1) return null;
  const base64 = code.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (code.length % 4)) % 4);
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export function encodeTeam(team: Team): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(team)));
}

/** Nunca lança. Devolve o JSON decodificado (ainda não validado) ou null se o código não decodificar. */
export function decodeTeam(code: string): unknown {
  if (typeof code !== 'string') return null;
  const trimmed = code.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_CODE_LENGTH || !BASE64URL.test(trimmed)) return null;
  const bytes = base64UrlToBytes(trimmed);
  if (!bytes) return null;
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    return null;
  }
}
