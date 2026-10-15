import { describe, expect, it } from 'vitest';
import { isVolumeKey, popoverCloseAction } from '../src/audio/controlLogic';

describe('isVolumeKey', () => {
  it('só as teclas que mudam o controle deslizante soltam o blip de amostra', () => {
    for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']) {
      expect(isVolumeKey(k), k).toBe(true);
    }
    for (const k of ['Tab', 'Shift', 'Enter', 'Escape', 'a']) expect(isVolumeKey(k), k).toBe(false);
  });
});

describe('popoverCloseAction', () => {
  it('Esc fecha e devolve o foco ao gatilho; outras teclas não fecham', () => {
    expect(popoverCloseAction(true, { type: 'key', key: 'Escape' })).toBe('close-refocus');
    expect(popoverCloseAction(true, { type: 'key', key: 'Tab' })).toBeNull();
  });

  it('clique fora fecha sem mexer no foco; clique dentro não fecha', () => {
    expect(popoverCloseAction(true, { type: 'pointer', inside: false })).toBe('close');
    expect(popoverCloseAction(true, { type: 'pointer', inside: true })).toBeNull();
  });

  it('fechado, nada acontece', () => {
    expect(popoverCloseAction(false, { type: 'key', key: 'Escape' })).toBeNull();
    expect(popoverCloseAction(false, { type: 'pointer', inside: false })).toBeNull();
  });
});
