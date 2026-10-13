// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CARDS } from '@pfl/engine';
import { CardTile } from '../src/components/CardTile';
import { tapAction } from '../src/components/tapAction';

afterEach(cleanup);

describe('tapAction', () => {
  it('mouse: age, ou ignora se desabilitada', () => {
    expect(tapAction(false, false, false)).toBe('act');
    expect(tapAction(false, false, true)).toBe('ignore');
  });
  it('toque: abre no primeiro, age no segundo', () => {
    expect(tapAction(true, false, false)).toBe('open');
    expect(tapAction(true, true, false)).toBe('act');
  });
  it('toque em desabilitada: abre para explicar e depois fecha', () => {
    expect(tapAction(true, false, true)).toBe('open');
    expect(tapAction(true, true, true)).toBe('close');
  });
});

function mockTouch(touch: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: touch && query === '(hover: none)',
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
}

describe('CardTile no toque', () => {
  beforeEach(() => mockTouch(true));
  const [a, b] = [CARDS[0], CARDS[1]];

  it('primeiro toque abre o tooltip sem agir; o segundo age', () => {
    const onClick = vi.fn();
    const { container } = render(<CardTile card={a} onClick={onClick} />);
    const button = screen.getAllByRole('button')[0];
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(container.querySelector('.card-tile')!.classList.contains('is-tip-open')).toBe(true);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('Esc fecha o tooltip', () => {
    const { container } = render(<CardTile card={a} />);
    const button = screen.getAllByRole('button')[0];
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(container.querySelector('.card-tile')!.classList.contains('is-tip-open')).toBe(false);
  });

  it('tocar em outra carta fecha a primeira: só um tooltip aberto', () => {
    const { container } = render(
      <>
        <CardTile card={a} />
        <CardTile card={b} />
      </>,
    );
    const [first, second] = screen.getAllByRole('button');
    fireEvent.pointerDown(first);
    fireEvent.click(first);
    fireEvent.pointerDown(second);
    fireEvent.click(second);
    expect(container.querySelectorAll('.is-tip-open')).toHaveLength(1);
    expect(container.querySelectorAll('.card-tile')[1].classList.contains('is-tip-open')).toBe(true);
  });
});

describe('CardTile com mouse', () => {
  beforeEach(() => mockTouch(false));

  it('o clique age direto, sem abrir tooltip', () => {
    const onClick = vi.fn();
    const { container } = render(<CardTile card={CARDS[0]} onClick={onClick} />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.is-tip-open')).toBeNull();
  });
});
