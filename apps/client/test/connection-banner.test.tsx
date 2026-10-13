// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ConnectionBanner } from '../src/components/ConnectionBanner';

afterEach(cleanup);

describe('ConnectionBanner', () => {
  it('ok: não renderiza nada', () => {
    const { container } = render(<ConnectionBanner state={{ kind: 'ok' }} />);
    expect(container.firstChild).toBeNull();
  });

  it('é uma região de status educada com título e texto', () => {
    render(<ConnectionBanner state={{ kind: 'reconnecting' }} />);
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toContain('Reconectando');
  });

  it('o contador de "acordando" fica fora do que o leitor de tela anuncia', () => {
    render(<ConnectionBanner state={{ kind: 'waking', elapsedMs: 9000 }} />);
    expect(screen.getByText('9 s').getAttribute('aria-hidden')).toBe('true');
  });
});
