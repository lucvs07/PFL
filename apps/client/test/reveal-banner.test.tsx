// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { RevealBanner } from '../src/screens/match/RevealBanner';
import { READ_SYMBOL } from '../src/lib/names';

afterEach(cleanup);

describe('<RevealBanner>', () => {
  it('não mostra nada sem revelação', () => {
    const { container } = render(<RevealBanner reveal={null} />);
    expect(container.firstChild).toBeNull();
  });

  it.each([
    ['RIGHT', 'reveal-right'],
    ['NEUTRAL', 'reveal-neutral'],
    ['WRONG', 'reveal-wrong'],
  ] as const)('leitura %s: classe de cor e carimbo com o símbolo', (read, cls) => {
    const { container } = render(<RevealBanner reveal={{ offense: 'basic_run', defense: 'basic_defense', read }} />);
    expect(container.querySelector('.reveal')!.classList.contains(cls)).toBe(true);
    const stamp = container.querySelector('.reveal-read.reveal-stamp')!;
    expect(stamp).not.toBeNull();
    expect(stamp.textContent).toContain(READ_SYMBOL[read]);
  });

  it('chute (sem leitura): sem carimbo', () => {
    const { container } = render(<RevealBanner reveal={{ offense: 'punt', defense: 'basic_defense', read: null }} />);
    expect(container.querySelector('.reveal-stamp')).toBeNull();
    expect(container.querySelector('.reveal')!.classList.contains('reveal-kick')).toBe(true);
  });
});
