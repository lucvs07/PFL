/**
 * CORS_ORIGIN: origens permitidas, separadas por vírgula. Sem valor útil, libera qualquer origem
 * (o cliente Vite do dev roda em outra porta). Cada valor vira a origem serializada que o navegador
 * manda no header Origin (`new URL(v).origin`): host em minúsculas, sem porta padrão, sem caminho nem
 * barra final. Valor que não é URL lança erro, para o servidor não subir recusando todo mundo em silêncio.
 */
export function parseCorsOrigin(raw: string | undefined): string | string[] | true {
  const origins = (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(normalizeOrigin);
  if (origins.length === 0) return true;
  return origins.length === 1 ? origins[0]! : origins;
}

function normalizeOrigin(value: string): string {
  let origin: string;
  try {
    origin = new URL(value).origin;
  } catch {
    throw new Error(`CORS_ORIGIN inválido: "${value}" não é uma URL (ex.: https://lucvs07.github.io)`);
  }
  if (origin === 'null') throw new Error(`CORS_ORIGIN inválido: "${value}" não tem origem http(s)`);
  return origin;
}

/**
 * O `cors` do Socket.IO só vale no long-polling; o cliente usa só WebSocket. Esta checagem roda no
 * allowRequest, que cobre o handshake de upgrade. Sem header Origin (clientes que não são navegador) passa.
 */
export function originAllowed(allowed: string | string[] | boolean, origin: string | undefined): boolean {
  if (allowed === true || origin === undefined) return true;
  if (allowed === false) return false;
  return (Array.isArray(allowed) ? allowed : [allowed]).includes(origin);
}
