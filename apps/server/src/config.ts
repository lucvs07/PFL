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
