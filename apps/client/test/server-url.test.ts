import { afterEach, describe, expect, it, vi } from 'vitest';
import { serverUrl } from '../src/net/socket';

afterEach(() => vi.unstubAllEnvs());

describe('serverUrl', () => {
  it('usa VITE_SERVER_URL quando definida', () => {
    vi.stubEnv('VITE_SERVER_URL', 'https://pfl.onrender.com');
    expect(serverUrl()).toBe('https://pfl.onrender.com');
  });
  it('variável vazia (repo variable ausente no CI) cai no padrão local, não em io("")', () => {
    vi.stubEnv('VITE_SERVER_URL', '');
    expect(serverUrl()).toBe('http://localhost:3001');
  });
});
