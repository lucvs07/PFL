import { useEffect, useRef } from 'react';
import type { NarrationLine } from '../../match/narration';
import './match.css';

export function NarrationLog({ lines }: { lines: readonly NarrationLine[] }) {
  const listRef = useRef<HTMLOListElement | null>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);
  return (
    <div className="log">
      <h2 className="panel-title">Log</h2>
      <ol className="log-list" ref={listRef} aria-live="polite">
        {lines.map((line, i) => (
          <li key={i} className={`log-line log-${line.kind}`}>
            {line.text}
          </li>
        ))}
      </ol>
    </div>
  );
}
