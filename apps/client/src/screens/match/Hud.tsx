import type { PlayerView, TeamKey } from '@pfl/engine';
import { PHASE_LABELS, formatBallOn, formatDown, formatPossession } from '../../lib/format';
import './match.css';

interface Props {
  view: PlayerView;
  names: Record<TeamKey, string>;
  seconds: number | null;
}

/** HUD da spec 6.2 como placar de transmissão: placar | posse | down & distance | bola | timer da etapa. */
export function Hud({ view, names, seconds }: Props) {
  const team = (k: TeamKey) => (
    <span className={`hud-team hud-team-${k}${view.offense === k ? ' has-ball' : ''}${view.you === k ? ' is-you' : ''}`}>
      <span className="hud-ball" aria-hidden="true">
        {view.offense === k ? '●' : ''}
      </span>
      {view.offense === k && <span className="sr-only">Com a bola: </span>}
      <span className="hud-name">{names[k]}</span>
      {view.you === k && <span className="sr-only"> (você)</span>}
    </span>
  );
  const urgent = seconds !== null && seconds <= 3;
  const side = view.side === 'offense' ? 'offense' : 'defense';
  return (
    <header className="hud" aria-label="Placar">
      <div className="hud-board">
        {team('A')}
        <span className="hud-scores">
          <strong className="hud-digit">{view.score.A}</strong>
          <span className="hud-x" aria-hidden="true">
            ×
          </span>
          <strong className="hud-digit">{view.score.B}</strong>
        </span>
        {team('B')}
      </div>
      <div className="hud-segments">
        <span className="hud-seg">{formatPossession(view)}</span>
        <span className="hud-seg hud-down">{formatDown(view.field, view.conversionAttempt)}</span>
        <span className="hud-seg">Bola na {formatBallOn(view.field.ballOn)}</span>
        <span className={`hud-seg hud-side hud-side-${side}`}>Você: {view.side === 'offense' ? 'Ataque' : 'Defesa'}</span>
        <span className={`hud-seg hud-timer${urgent ? ' is-urgent' : ''}`}>
          <span className="hud-phase">{PHASE_LABELS[view.phase]}</span>
          <span className="hud-clock">{seconds === null ? '--' : `${seconds}s`}</span>
        </span>
      </div>
    </header>
  );
}
