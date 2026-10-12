import type { TeamKey } from '@pfl/engine';
import type { EndMessage } from '@pfl/protocol';
import { mvpOf } from '../../lib/design';
import { speciesName } from '../../lib/names';
import { Sprite } from '../../components/Sprite';
import { StatsTable } from './StatsTable';
import { ReplayViewer } from './ReplayViewer';
import './end.css';

interface Props {
  end: EndMessage;
  you: TeamKey;
  onLeave: () => void;
}

export function EndScreen({ end, you, onLeave }: Props) {
  const names = { A: end.replay.teams.A.name, B: end.replay.teams.B.name };
  const opponent: TeamKey = you === 'A' ? 'B' : 'A';
  const diff = end.score[you] - end.score[opponent];
  const result = diff > 0 ? 'Vitória!' : diff < 0 ? 'Derrota...' : 'Empate';
  const tone = diff > 0 ? 'win' : diff < 0 ? 'loss' : 'draw';
  const mvp = mvpOf(end.stats);
  return (
    <main className="screen end">
      <div className="end-top">
        <section className="panel end-score">
          <h1 className={`end-result end-${tone}`}>{result}</h1>
          <p className="end-line">
            <span className="end-team">{names.A}</span>
            <strong className="end-num">{end.score.A}</strong>
            <span className="end-x">×</span>
            <strong className="end-num">{end.score.B}</strong>
            <span className="end-team">{names.B}</span>
          </p>
          <button type="button" className="btn btn-primary" onClick={onLeave}>
            Voltar ao início
          </button>
        </section>
        {mvp && (
          <section className="panel mvp" aria-label="Destaque da partida">
            <div className="mvp-sprite">
              <Sprite id={mvp.speciesId} size={192} />
            </div>
            <div className="mvp-info">
              <p className="mvp-tag">MVP</p>
              <h2 className="mvp-name">
                #{String(mvp.speciesId).padStart(3, '0')} {speciesName(mvp.speciesId)}
              </h2>
              <p className="mvp-team">{names[mvp.team]}</p>
              <p className="mvp-stats">
                <b>{mvp.yards}</b> jardas · <b>{mvp.touchdowns}</b> TD · <b>{mvp.plays}</b> jogadas
              </p>
            </div>
          </section>
        )}
      </div>
      <StatsTable stats={end.stats} names={names} />
      <ReplayViewer data={end.replay} score={end.score} />
    </main>
  );
}
