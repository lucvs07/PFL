import type { TeamError } from '@pfl/engine';
import { teamErrorMessage } from '../builder/derived';

export function ErrorList({ errors }: { errors: readonly TeamError[] }) {
  if (errors.length === 0) return <p className="ok-text">Time válido!</p>;
  return (
    <ul className="error-list">
      {errors.map((e, i) => (
        <li key={`${e.code}-${e.detail ?? ''}-${i}`}>{teamErrorMessage(e)}</li>
      ))}
    </ul>
  );
}
