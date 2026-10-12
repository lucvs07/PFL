import type { Species } from '@pfl/engine';
import { STAT_MAX, statRatio, statTier } from '../lib/design';
import './ui.css';

const ROWS: readonly { key: keyof Species['stats']; label: string }[] = [
  { key: 'hp', label: 'HP' },
  { key: 'attack', label: 'Atk' },
  { key: 'defense', label: 'Def' },
  { key: 'spAttack', label: 'SpA' },
  { key: 'spDefense', label: 'SpD' },
  { key: 'speed', label: 'Vel' },
];

/** Seis barras de stat; a cor segue a faixa do valor. */
export function StatBars({ stats }: { stats: Species['stats'] }) {
  return (
    <ul className="stat-bars">
      {ROWS.map(({ key, label }) => {
        const value = stats[key];
        return (
          <li key={key} className="stat-row">
            <span className="stat-label">{label}</span>
            <span className="stat-value">{value}</span>
            <span
              className="stat-track"
              role="meter"
              aria-label={label}
              aria-valuemin={0}
              aria-valuemax={STAT_MAX}
              aria-valuenow={value}
            >
              <span
                className="stat-fill"
                style={{ width: `${statRatio(value) * 100}%`, background: `var(--stat-${statTier(value)})` }}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
