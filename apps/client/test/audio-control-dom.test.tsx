// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AudioControl } from '../src/audio/AudioControl';
import * as audioModule from '../src/audio/index';
import type { FakeBackend } from './audio-fakes';

// O singleton `audio` vira um motor real sobre o FakeBackend: o controle é testado contra o motor de verdade.
vi.mock('../src/audio/index', async () => {
  const { createAudio } = await import('../src/audio/engine');
  const { SCORES } = await import('../src/audio/scores');
  const { memoryStorage } = await import('../src/lib/storage');
  const { FakeBackend } = await import('./audio-fakes');
  const backend = new FakeBackend();
  return { audio: createAudio({ backend, storage: memoryStorage(), scores: SCORES }), backend };
});

const { audio, backend } = audioModule as unknown as { audio: typeof audioModule.audio; backend: FakeBackend };

beforeEach(() => {
  backend.available = true;
  backend.tones.length = 0;
  audio.setMuted(false);
  audio.setVolume('music', 0.4);
  audio.setVolume('sfx', 0.7);
});
afterEach(cleanup);

const muteButton = () => screen.getByRole('button', { name: 'Silenciar o som' });
const volumeButton = () => screen.getByRole('button', { name: 'Ajustar volumes' });
const openPopover = () => fireEvent.click(volumeButton());
const sliders = () => screen.getAllByRole('slider') as HTMLInputElement[];

describe('<AudioControl>', () => {
  it('mostra o botão de mudo e o gatilho dos volumes, com o popover fechado', () => {
    render(<AudioControl />);
    expect(muteButton().getAttribute('aria-pressed')).toBe('false');
    expect(volumeButton().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Efeitos')).toBeNull();
  });

  it('o botão de mudo alterna o estado do motor e o aria-pressed', () => {
    render(<AudioControl />);
    fireEvent.click(muteButton());
    expect(audio.getState().muted).toBe(true);
    expect(muteButton().getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(muteButton());
    expect(audio.getState().muted).toBe(false);
    expect(muteButton().getAttribute('aria-pressed')).toBe('false');
  });

  it('abrir o popover mostra Música e Efeitos, e mexer nos controles muda o volume do motor', () => {
    render(<AudioControl />);
    openPopover();
    expect(volumeButton().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Música')).toBeTruthy();
    const [music, sfx] = sliders();
    expect(music.value).toBe('4');
    expect(sfx.value).toBe('7');
    fireEvent.change(music, { target: { value: '3' } });
    fireEvent.change(sfx, { target: { value: '9' } });
    expect(audio.getState()).toMatchObject({ music: 0.3, sfx: 0.9 });
  });

  it('subir um volume com o som mudo desmuta', () => {
    render(<AudioControl />);
    fireEvent.click(muteButton());
    openPopover();
    fireEvent.change(sliders()[1], { target: { value: '5' } });
    expect(muteButton().getAttribute('aria-pressed')).toBe('false');
  });

  it('Esc fecha o popover e devolve o foco ao gatilho dos volumes', () => {
    render(<AudioControl />);
    openPopover();
    sliders()[0].focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Efeitos')).toBeNull();
    expect(document.activeElement).toBe(volumeButton());
  });

  it('outras teclas não fecham o popover', () => {
    render(<AudioControl />);
    openPopover();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByText('Efeitos')).toBeTruthy();
  });

  it('clique fora fecha o popover; clique dentro não', () => {
    render(<AudioControl />);
    openPopover();
    fireEvent(sliders()[0], new Event('pointerdown', { bubbles: true }));
    expect(screen.getByText('Efeitos')).toBeTruthy();
    fireEvent(document.body, new Event('pointerdown', { bubbles: true }));
    expect(screen.queryByText('Efeitos')).toBeNull();
  });

  it('soltar o controle de Efeitos com uma seta toca o blip; Tab e o controle de Música não', () => {
    audio.unlock();
    render(<AudioControl />);
    openPopover();
    const [music, sfx] = sliders();
    fireEvent.keyUp(sfx, { key: 'Tab' });
    fireEvent.keyUp(music, { key: 'ArrowRight' });
    expect(backend.tones).toHaveLength(0);
    fireEvent.keyUp(sfx, { key: 'ArrowRight' });
    expect(backend.tones.length).toBeGreaterThan(0);
  });

  it('some quando o navegador não oferece Web Audio', () => {
    backend.available = false;
    audio.setVolume('sfx', 0.6); // reemite o estado, que agora lê available = false
    const { container } = render(<AudioControl />);
    expect(container.innerHTML).toBe('');
  });
});
