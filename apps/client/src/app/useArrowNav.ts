import { useCallback, useRef, type KeyboardEvent, type RefObject } from 'react';

const STEP: Record<string, (columns: number) => number> = {
  ArrowLeft: () => -1,
  ArrowRight: () => 1,
  ArrowUp: (columns) => -columns,
  ArrowDown: (columns) => columns,
};

/** Índice do próximo item habilitado na direção da tecla; null = fica onde está. Sem dar a volta. */
export function nextIndex(key: string, current: number, enabled: boolean[], columns: number): number | null {
  if (key === 'Home') {
    const i = enabled.indexOf(true);
    return i === -1 ? null : i;
  }
  if (key === 'End') {
    const i = enabled.lastIndexOf(true);
    return i === -1 ? null : i;
  }
  const step = STEP[key]?.(Math.max(1, columns));
  if (step === undefined) return null;
  for (let i = current + step; i >= 0 && i < enabled.length; i += step) {
    if (enabled[i]) return i;
  }
  return null;
}

/**
 * Setas, Home e End entre os botões de um grupo de escolhas. Tab continua passando por todos eles:
 * as setas são um atalho, não tabindex móvel (cada botão envia uma jogada, não é um radio).
 * `columns` omitido: conta os botões da primeira linha pela posição na tela.
 */
export function useArrowNav<T extends HTMLElement>(columns?: number): { ref: RefObject<T | null>; onKeyDown: (e: KeyboardEvent<T>) => void } {
  const ref = useRef<T | null>(null);
  const onKeyDown = useCallback(
    (e: KeyboardEvent<T>) => {
      const root = ref.current;
      if (!root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>('button'));
      const current = items.indexOf((e.target as HTMLElement).closest('button') as HTMLElement);
      if (current === -1) return;
      const cols = columns ?? Math.max(1, items.filter((el) => el.offsetTop === items[0].offsetTop).length);
      const target = nextIndex(
        e.key,
        current,
        items.map((el) => !el.hasAttribute('disabled')),
        cols,
      );
      if (target === null) return;
      e.preventDefault();
      items[target].focus();
    },
    [columns],
  );
  return { ref, onKeyDown };
}
