import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TeamKey } from '@pfl/engine';
import { RESULT_ANIMATION_MS, computeStats, type ReplayData } from '@pfl/protocol';
import { audio } from '../../audio';
import { replayCues, shouldSoundReplay } from '../../audio/gameAudio';
import { buildReplay } from '../../match/replayFrames';
import { PhaserField } from '../../phaser/PhaserField';
import type { PlaySpec } from '../../phaser/FieldScene';
import '../match/match.css';
import './end.css';

interface Props {
  data: ReplayData;
  score: Record<TeamKey, number>;
}

/** Replay jogada a jogada, reproduzido pelo engine a partir de seed + ações (spec 6.1, item 5). */
export function ReplayViewer({ data, score }: Props) {
  const build = useMemo(() => buildReplay(data, score), [data, score]);
  const frames = useMemo(() => (build.ok ? build.frames : []), [build]);
  const last = frames.length - 1;
  const [index, setIndex] = useState(0);
  const [nonce, setNonce] = useState(1);
  const [auto, setAuto] = useState(false);

  const go = useCallback(
    (i: number) => {
      setIndex(Math.max(0, Math.min(last, i)));
      setNonce((n) => n + 1);
    },
    [last],
  );

  useEffect(() => {
    if (!auto) return;
    if (index >= last) {
      setAuto(false);
      return;
    }
    const id = window.setTimeout(() => go(index + 1), RESULT_ANIMATION_MS);
    return () => window.clearTimeout(id);
  }, [auto, index, last, go]);

  const frame = frames[index] ?? null;
  const play = useMemo<PlaySpec | null>(() => (frame ? { seq: nonce, stage: frame.stage, steps: frame.steps } : null), [frame, nonce]);
  const partial = useMemo(() => computeStats(frames.slice(0, index + 1).flatMap((f) => f.events)), [frames, index]);

  useEffect(() => {
    if (frame && play && shouldSoundReplay(play.seq)) audio.playCues(replayCues(frame.events, frame.steps));
  }, [frame, play]);

  if (!build.ok) {
    return (
      <section className="panel">
        <h2 className="panel-title">Replay</h2>
        <p className="error-text">{build.message}</p>
      </section>
    );
  }
  if (!frame) {
    return (
      <section className="panel">
        <p className="muted">Replay vazio.</p>
      </section>
    );
  }

  return (
    <section className="panel replay">
      <h2 className="panel-title">Replay</h2>
      <div className="replay-layout">
        <PhaserField stage={frame.stage} play={play} />
        <div className="stack">
          <div className="row">
            <button type="button" className="btn btn-small" aria-label="Primeira jogada" disabled={index === 0} onClick={() => go(0)}>
              ⏮
            </button>
            <button type="button" className="btn btn-small" aria-label="Jogada anterior" disabled={index === 0} onClick={() => go(index - 1)}>
              ◀
            </button>
            <span>
              Jogada {index + 1}/{frames.length}
            </span>
            <button type="button" className="btn btn-small" aria-label="Próxima jogada" disabled={index === last} onClick={() => go(index + 1)}>
              ▶
            </button>
            <button type="button" className="btn btn-small" aria-label="Última jogada" disabled={index === last} onClick={() => go(last)}>
              ⏭
            </button>
            <button type="button" className="btn btn-small" onClick={() => setAuto((a) => !a)}>
              {auto ? 'Pausar' : 'Reproduzir'}
            </button>
            <button type="button" className="btn btn-small" onClick={() => go(index)}>
              Repetir
            </button>
          </div>
          <ol className="log-list replay-lines">
            {frame.lines.map((line, i) => (
              <li key={i} className={`log-line log-${line.kind}`}>
                {line.text}
              </li>
            ))}
          </ol>
          <p className="muted">
            Até aqui: {data.teams.A.name} {partial.yards.A} jardas · {data.teams.B.name} {partial.yards.B} jardas
          </p>
        </div>
      </div>
    </section>
  );
}
