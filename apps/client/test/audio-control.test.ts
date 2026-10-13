import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AudioControlView, type AudioControlViewProps } from '../src/audio/AudioControlView';
import type { AudioState } from '../src/audio/engine';
import { ICON_COLS, ICON_ROWS, speakerCells } from '../src/audio/speaker';

const state = (over: Partial<AudioState> = {}): AudioState => ({
  available: true, unlocked: true, muted: false, music: 0.4, sfx: 0.7, ...over,
});
const props = (over: Partial<AudioControlViewProps> = {}): AudioControlViewProps => ({
  state: state(),
  open: false,
  onToggleMute: vi.fn(),
  onToggleOpen: vi.fn(),
  onVolume: vi.fn(),
  onVolumeCommit: vi.fn(),
  ...over,
});
const html = (over: Partial<AudioControlViewProps> = {}) => renderToStaticMarkup(createElement(AudioControlView, props(over)));

describe('speakerCells', () => {
  const body = speakerCells(0, false).length;

  it('o corpo do alto-falante é fixo e as ondas crescem com o nível', () => {
    expect(body).toBe(26);
    expect(speakerCells(1, false)).toHaveLength(body + 2);
    expect(speakerCells(2, false)).toHaveLength(body + 2 + 4);
    expect(speakerCells(3, false)).toHaveLength(body + 2 + 4 + 6);
  });

  it('mudo troca as ondas por um X, qualquer que seja o nível', () => {
    expect(speakerCells(3, true)).toHaveLength(body + 12);
    expect(speakerCells(0, true)).toHaveLength(body + 12);
  });

  it('todas as células cabem na grade do ícone, sem repetição', () => {
    for (const level of [0, 1, 2, 3] as const) {
      for (const muted of [false, true]) {
        const cells = speakerCells(level, muted);
        expect(new Set(cells.map(([x, y]) => `${x},${y}`)).size).toBe(cells.length);
        for (const [x, y] of cells) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThan(ICON_COLS);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThan(ICON_ROWS);
        }
      }
    }
  });
});

describe('AudioControlView', () => {
  it('some quando o navegador não tem Web Audio', () => {
    expect(html({ state: state({ available: false }) })).toBe('');
  });

  it('botão de mudo: rótulo estável e aria-pressed reflete o estado', () => {
    const on = html();
    expect(on).toContain('aria-label="Silenciar o som"');
    expect(on).toContain('aria-pressed="false"');
    const muted = html({ state: state({ muted: true }) });
    expect(muted).toContain('aria-label="Silenciar o som"');
    expect(muted).toContain('aria-pressed="true"');
    expect(muted).toContain('audio-btn-muted');
  });

  it('o grupo se chama Som e o gatilho dos volumes informa aria-expanded', () => {
    const closed = html();
    expect(closed).toContain('role="group"');
    expect(closed).toContain('aria-label="Som"');
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).not.toContain('audio-popover');
    const open = html({ open: true });
    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain('audio-popover');
  });

  it('o popover tem Música e Efeitos como controles de 0 a 10 com o valor atual', () => {
    const open = html({ open: true, state: state({ music: 0.4, sfx: 0.7 }) });
    expect(open).toContain('Música');
    expect(open).toContain('Efeitos');
    expect(open).toContain('type="range"');
    expect(open).toContain('min="0"');
    expect(open).toContain('max="10"');
    expect(open).toContain('value="4"');
    expect(open).toContain('value="7"');
  });
});
