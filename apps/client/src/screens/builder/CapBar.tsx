import type { CapInfo } from '../../builder/derived';
import './builder.css';

export function CapBar({ info }: { info: CapInfo }) {
  return (
    <div className={`cap-bar${info.over ? ' is-over' : ''}`}>
      <div className="cap-bar-label">
        <span>Teto salarial</span>
        <span>
          <span className="cap-bar-num">
            {info.cost}/{info.cap}
          </span>{' '}
          {info.over ? `(estourou ${-info.remaining})` : `(restam ${info.remaining})`}
        </span>
      </div>
      <div
        className="cap-bar-track"
        role="progressbar"
        aria-label="Teto salarial"
        aria-valuemin={0}
        aria-valuemax={info.cap}
        aria-valuenow={info.cost}
      >
        <div className="cap-bar-fill" style={{ width: `${info.ratio * 100}%` }} />
      </div>
    </div>
  );
}
