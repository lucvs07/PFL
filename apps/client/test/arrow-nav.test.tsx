// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CARDS } from '@pfl/engine';
import { nextIndex, useArrowNav } from '../src/app/useArrowNav';
import { CardTile } from '../src/components/CardTile';

afterEach(cleanup);

describe('nextIndex', () => {
  const all = [true, true, true, true, true, true]; // 2 linhas x 3 colunas

  it('setas horizontais andam um item e não dão a volta', () => {
    expect(nextIndex('ArrowRight', 0, all, 3)).toBe(1);
    expect(nextIndex('ArrowLeft', 1, all, 3)).toBe(0);
    expect(nextIndex('ArrowLeft', 0, all, 3)).toBeNull();
    expect(nextIndex('ArrowRight', 5, all, 3)).toBeNull();
  });

  it('setas verticais andam uma linha', () => {
    expect(nextIndex('ArrowDown', 1, all, 3)).toBe(4);
    expect(nextIndex('ArrowUp', 4, all, 3)).toBe(1);
    expect(nextIndex('ArrowUp', 1, all, 3)).toBeNull();
  });

  it('Home e End vão às pontas', () => {
    expect(nextIndex('Home', 4, all, 3)).toBe(0);
    expect(nextIndex('End', 0, all, 3)).toBe(5);
  });

  it('pula itens desabilitados', () => {
    expect(nextIndex('ArrowRight', 0, [true, false, true], 3)).toBe(2);
    expect(nextIndex('Home', 2, [false, true, true], 3)).toBe(1);
  });

  it('tudo desabilitado ou tecla estranha: null, sem lançar', () => {
    expect(nextIndex('ArrowRight', 0, [false, false, false], 3)).toBeNull();
    expect(nextIndex('Home', 0, [false, false, false], 3)).toBeNull();
    expect(nextIndex('a', 0, all, 3)).toBeNull();
  });
});

function Group({ cols }: { cols: number }) {
  const { ref, onKeyDown } = useArrowNav<HTMLDivElement>(cols);
  return (
    <div ref={ref} role="group" aria-label="g" onKeyDown={onKeyDown}>
      <button>a</button>
      <button disabled>b</button>
      <button>c</button>
    </div>
  );
}

describe('useArrowNav', () => {
  it('seta move o foco pulando botão desabilitado', () => {
    render(<Group cols={3} />);
    screen.getByText('a').focus();
    fireEvent.keyDown(screen.getByText('a'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByText('c'));
  });
});

describe('mão sem nenhuma carta jogável', () => {
  function Hand() {
    const { ref, onKeyDown } = useArrowNav<HTMLDivElement>();
    return (
      <div ref={ref} role="group" aria-label="mão" onKeyDown={onKeyDown}>
        {CARDS.slice(0, 3).map((c) => (
          <CardTile key={c.id} card={c} disabled />
        ))}
      </div>
    );
  }

  it('cartas aria-disabled seguem alcançáveis pelas setas, sem erro', () => {
    render(<Hand />);
    const buttons = screen.getAllByRole('button');
    buttons[0].focus();
    fireEvent.keyDown(buttons[0], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(buttons[1]);
    fireEvent.keyDown(buttons[1], { key: 'End' });
    expect(document.activeElement).toBe(buttons[2]);
  });
});

describe('CardTile desabilitada', () => {
  it('usa aria-disabled, continua focável e não dispara o clique', () => {
    const onClick = vi.fn();
    render(<CardTile card={CARDS[0]} disabled onClick={onClick} />);
    const button = screen.getAllByRole('button')[0];
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.hasAttribute('disabled')).toBe(false);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
