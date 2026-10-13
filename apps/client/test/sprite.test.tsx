// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { Sprite } from '../src/components/Sprite';
import { speciesName } from '../src/lib/names';

function setReducedMotion(reduce: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

/** jsdom não carrega imagens: simulamos o onLoad com o tamanho natural do GIF. */
function loadGif(img: HTMLImageElement, w: number, h: number): void {
  Object.defineProperty(img, 'naturalWidth', { configurable: true, value: w });
  Object.defineProperty(img, 'naturalHeight', { configurable: true, value: h });
  fireEvent.load(img);
}

const image = (container: HTMLElement): HTMLImageElement => container.querySelector('img') as HTMLImageElement;

beforeEach(() => setReducedMotion(false));
afterEach(cleanup);

describe('<Sprite> estático', () => {
  it('mostra o PNG de frente no tamanho pedido, com nome como alt e title', () => {
    const { container } = render(<Sprite id={25} size={96} />);
    const img = image(container);
    expect(img.getAttribute('src')).toBe('/sprites/bw/front/25.png');
    expect(img.getAttribute('alt')).toBe(speciesName(25));
    expect(img.getAttribute('title')).toBe(speciesName(25));
    expect(img.getAttribute('width')).toBe('96');
    expect(img.getAttribute('height')).toBe('96');
  });

  it('usa o PNG de costas quando view="back"', () => {
    const { container } = render(<Sprite id={6} view="back" />);
    expect(image(container).getAttribute('src')).toBe('/sprites/bw/back/6.png');
  });

  it('sem o arquivo, mostra as iniciais da espécie', () => {
    const { container } = render(<Sprite id={25} size={48} />);
    fireEvent.error(image(container));
    const missing = container.querySelector('.sprite-missing') as HTMLElement;
    expect(missing.textContent).toBe(speciesName(25).slice(0, 2));
    expect(missing.style.width).toBe('48px');
    expect(container.querySelector('img')).toBeNull();
  });

  it('volta a tentar o sprite quando a espécie muda', () => {
    const { container, rerender } = render(<Sprite id={25} />);
    fireEvent.error(image(container));
    expect(container.querySelector('.sprite-missing')).not.toBeNull();
    rerender(<Sprite id={26} />);
    expect(image(container).getAttribute('src')).toBe('/sprites/bw/front/26.png');
  });
});

describe('<Sprite animated>', () => {
  it('usa o GIF de frente, escondido até saber o tamanho', () => {
    const { container } = render(<Sprite id={25} size={192} animated />);
    const img = image(container);
    expect(img.getAttribute('src')).toBe('/sprites/bw/animated/25.gif');
    expect(img.classList.contains('sprite-animated')).toBe(true);
    expect(img.style.visibility).toBe('hidden');
  });

  it('escala o GIF por um fator inteiro (o mesmo dos PNGs de 96 px)', () => {
    const { container } = render(<Sprite id={25} size={192} animated />);
    const img = image(container);
    loadGif(img, 50, 46);
    expect(img.style.visibility).toBe('');
    expect(img.style.width).toBe('100px');
    expect(img.style.height).toBe('92px');
  });

  it('tamanho 96 mantém o GIF em escala 1', () => {
    const { container } = render(<Sprite id={25} size={96} animated />);
    const img = image(container);
    loadGif(img, 50, 46);
    expect(img.style.width).toBe('50px');
    expect(img.style.height).toBe('46px');
  });

  it('cai no PNG estático se o GIF faltar', () => {
    const { container } = render(<Sprite id={25} animated />);
    fireEvent.error(image(container));
    const img = image(container);
    expect(img.getAttribute('src')).toBe('/sprites/bw/front/25.png');
    expect(img.classList.contains('sprite-animated')).toBe(false);
  });

  it('não anima o sprite de costas', () => {
    const { container } = render(<Sprite id={25} view="back" animated />);
    expect(image(container).getAttribute('src')).toBe('/sprites/bw/back/25.png');
  });

  it('com movimento reduzido, fica no PNG estático', () => {
    setReducedMotion(true);
    const { container } = render(<Sprite id={25} animated />);
    expect(image(container).getAttribute('src')).toBe('/sprites/bw/front/25.png');
  });

  it('ao trocar de espécie, ignora a medida do GIF anterior até o novo carregar', () => {
    const { container, rerender } = render(<Sprite id={25} size={192} animated />);
    loadGif(image(container), 50, 46);
    expect(image(container).style.width).toBe('100px');

    rerender(<Sprite id={150} size={192} animated />);
    const img = image(container);
    expect(img.getAttribute('src')).toBe('/sprites/bw/animated/150.gif');
    expect(img.style.visibility).toBe('hidden');
    expect(img.style.width).toBe('');

    loadGif(img, 90, 69);
    expect(img.style.width).toBe('180px');
    expect(img.style.height).toBe('138px');
  });

  it('uma falha do GIF de uma espécie não desliga a animação da próxima', () => {
    const { container, rerender } = render(<Sprite id={25} animated />);
    fireEvent.error(image(container));
    expect(image(container).getAttribute('src')).toBe('/sprites/bw/front/25.png');
    rerender(<Sprite id={26} animated />);
    expect(image(container).getAttribute('src')).toBe('/sprites/bw/animated/26.gif');
  });
});
