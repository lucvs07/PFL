import './ui.css';

/** Nota de aptidão de 1 a 5 estrelas (spec 5.3). */
export function Stars({ value }: { value: number }) {
  const n = Math.max(0, Math.min(5, value));
  return (
    <span className="stars" role="img" aria-label={`${n} de 5 estrelas`} title={`Aptidão ${n}/5`}>
      {'★'.repeat(n)}
      {'☆'.repeat(5 - n)}
    </span>
  );
}
