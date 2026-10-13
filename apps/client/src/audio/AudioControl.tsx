import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import type { Channel } from './backend';
import { AudioControlView } from './AudioControlView';
import { audio } from './index';
import { useAudioState } from './useAudioState';

/** Controle global de som: montado uma vez em App.tsx. Esc fecha o popover e devolve o foco. */
export function AudioControl(): ReactElement | null {
  const state = useAudioState();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) rootRef.current?.querySelector<HTMLButtonElement>('.audio-btn-volume')?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(true);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, close]);

  return (
    <AudioControlView
      state={state}
      open={open}
      rootRef={rootRef}
      onToggleMute={() => audio.setMuted(!state.muted)}
      onToggleOpen={() => setOpen((o) => !o)}
      onVolume={(channel: Channel, value: number) => audio.setVolume(channel, value / 10)}
      onVolumeCommit={(channel: Channel) => {
        if (channel === 'sfx') audio.play('ui-select'); // o jogador ouve o nível dos efeitos
      }}
    />
  );
}
