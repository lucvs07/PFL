/**
 * CORS_ORIGIN: origens permitidas, separadas por vírgula. Sem valor útil, libera qualquer origem
 * (o cliente Vite do dev roda em outra porta). A barra final é removida: o header Origin nunca a tem.
 */
export function parseCorsOrigin(raw: string | undefined): string | string[] | true {
  const origins = (raw ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  if (origins.length === 0) return true;
  return origins.length === 1 ? origins[0]! : origins;
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
