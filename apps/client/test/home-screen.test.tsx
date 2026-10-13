// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HomeScreen } from '../src/screens/HomeScreen';

afterEach(cleanup);

function setup(busy = false) {
  const handlers = { onCreate: vi.fn(), onJoin: vi.fn(), onBuilder: vi.fn() };
  const view = render(<HomeScreen busy={busy} {...handlers} />);
  return { ...view, ...handlers };
}

describe('<HomeScreen>', () => {
  it('mostra o título PFL, a logo decorativa e o subtítulo', () => {
    const { container } = setup();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('PFL');
    const logo = container.querySelector('img.home-logo') as HTMLImageElement;
    expect(logo.getAttribute('src')).toBe('/logo.svg');
    expect(logo.getAttribute('alt')).toBe('');
    expect(screen.getByText('Pokémon Football League')).toBeTruthy();
  });

  it('não carrega Pokémon sorteados nem sprites na tela inicial', () => {
    const { container } = setup();
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('criar sala e montar time chamam os callbacks', () => {
    const { onCreate, onBuilder } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Criar sala' }));
    fireEvent.click(screen.getByRole('button', { name: 'Montar time' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onBuilder).toHaveBeenCalledTimes(1);
  });

  it('criar sala fica desabilitado enquanto ocupado', () => {
    setup(true);
    expect((screen.getByRole('button', { name: 'Criar sala' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Entrar' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('entra com um código válido em maiúsculas, sem hífen nem espaço', () => {
    const { onJoin } = setup();
    const input = screen.getByLabelText('Código da sala') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'abc-def' } });
    expect(input.value).toBe('ABC-DEF');
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(onJoin).toHaveBeenCalledWith('ABCDEF');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('código inválido mostra o erro e não chama onJoin', () => {
    const { onJoin } = setup();
    fireEvent.change(screen.getByLabelText('Código da sala'), { target: { value: 'AB1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(onJoin).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('6 letras');
    expect(screen.getByLabelText('Código da sala').getAttribute('aria-invalid')).toBe('true');
  });
});
