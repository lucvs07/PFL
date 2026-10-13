import type { ReactElement, Ref } from 'react';
import type { Channel } from './backend';
import type { AudioState } from './engine';
import { volumeLevel, type VolumeLevel } from './mixer';
import { ICON_COLS, ICON_ROWS, speakerCells } from './speaker';
import './audio.css';

export interface AudioControlViewProps {
  state: AudioState;
  open: boolean;
  rootRef?: Ref<HTMLDivElement>;
  onToggleMute(): void;
  onToggleOpen(): void;
  /** `value` de 0 a 10 */
  onVolume(channel: Channel, value: number): void;
  /** o jogador soltou o controle (tecla ou ponteiro) */
  onVolumeCommit(channel: Channel): void;
}

export function SpeakerIcon({ level, muted }: { level: VolumeLevel; muted: boolean }): ReactElement {
  return (
    <svg className="audio-icon" viewBox={`0 0 ${ICON_COLS} ${ICON_ROWS}`} aria-hidden="true" focusable="false">
      {speakerCells(level, muted).map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />
      ))}
    </svg>
  );
}

const ROWS: { channel: Channel; label: string }[] = [
  { channel: 'music', label: 'Música' },
  { channel: 'sfx', label: 'Efeitos' },
];

export function AudioControlView({ state, open, rootRef, onToggleMute, onToggleOpen, onVolume, onVolumeCommit }: AudioControlViewProps): ReactElement | null {
  if (!state.available) return null;
  return (
    <div ref={rootRef} className="audio-control" role="group" aria-label="Som">
      {open && (
        <div className="audio-popover" id="audio-popover">
          <p className="audio-popover-title">Som</p>
          {ROWS.map(({ channel, label }) => {
            const n = Math.round(state[channel] * 10);
            return (
              <label key={channel} className="audio-row">
                <span className="audio-row-head">
                  <span>{label}</span>
                  <span className="audio-value">{n}</span>
                </span>
                <input
                  className="audio-range"
                  type="range"
                  min={0}
                  max={10}
                  step={1}
                  value={n}
                  onChange={(e) => onVolume(channel, Number(e.currentTarget.value))}
                  onPointerUp={() => onVolumeCommit(channel)}
                  onKeyUp={() => onVolumeCommit(channel)}
                />
              </label>
            );
          })}
        </div>
      )}
      <button
        type="button"
        className={`btn audio-btn${state.muted ? ' audio-btn-muted' : ''}`}
        aria-label="Silenciar o som"
        aria-pressed={state.muted}
        title="Silenciar o som"
        onClick={onToggleMute}
      >
        <SpeakerIcon level={volumeLevel(state)} muted={state.muted} />
      </button>
      <button
        type="button"
        className="btn audio-btn audio-btn-volume"
        aria-label="Ajustar volumes"
        aria-expanded={open}
        aria-controls={open ? 'audio-popover' : undefined}
        title="Ajustar volumes"
        onClick={onToggleOpen}
      >
        <span className="audio-arrow" aria-hidden="true">
          {open ? '▼' : '▲'}
        </span>
      </button>
    </div>
  );
}
