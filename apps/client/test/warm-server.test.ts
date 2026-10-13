import { describe, expect, it, vi } from 'vitest';
import { warmServer } from '../src/net/warmServer';

describe('warmServer', () => {
  it('pede /health sem CORS e devolve true quando o servidor responde', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ type: 'opaque' });
    await expect(warmServer('https://pfl.example/', fetchImpl as unknown as typeof fetch)).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith('https://pfl.example/health', { mode: 'no-cors', cache: 'no-store' });
  });

  it('rede recusada: false, sem lançar', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(warmServer('https://pfl.example', fetchImpl as unknown as typeof fetch)).resolves.toBe(false);
  });

  it('sem fetch no ambiente: false, sem lançar', async () => {
    await expect(warmServer('https://pfl.example', null as unknown as typeof fetch)).resolves.toBe(false);
  });
});
