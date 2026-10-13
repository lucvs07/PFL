/**
 * Acorda o Render antes do socket. O handler de /health não envia CORS, então o pedido é `no-cors`:
 * a resposta é opaca (não dá para ler), mas resolver já prova que o servidor está de pé; rejeitar
 * quer dizer "ainda dormindo ou fora do ar". Nunca lança.
 */
export async function warmServer(url: string, fetchImpl: typeof fetch | null | undefined = globalThis.fetch): Promise<boolean> {
  try {
    if (!fetchImpl) return false;
    await fetchImpl(`${url.replace(/\/$/, '')}/health`, { mode: 'no-cors', cache: 'no-store' });
    return true;
  } catch {
    return false;
  }
}
