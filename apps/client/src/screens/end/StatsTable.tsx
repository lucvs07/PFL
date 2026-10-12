import type { TeamKey } from '@pfl/engine';
import type { MatchStats } from '@pfl/protocol';
import { speciesName } from '../../lib/names';
import { barRatio } from '../../lib/design';
import { Sprite } from '../../components/Sprite';
import './end.css';

const KEYS: TeamKey[] = ['A', 'B'];

/** Estatísticas por Pokémon vindas de EndMessage.stats (spec 6.1, item 5), com barra de jardas. */
export function StatsTable({ stats, names }: { stats: MatchStats; names: Record<TeamKey, string> }) {
  return (
    <div className="stats-grid">
      {KEYS.map((team) => {
        const rows = stats.pokemon
          .filter((p) => p.team === team)
          .sort((a, b) => b.plays - a.plays || b.yards - a.yards);
        const max = Math.max(0, ...rows.map((r) => r.yards));
        return (
          <section key={team} className="panel">
            <h2 className="panel-title">{names[team]}</h2>
            <p className="stats-summary">
              Jardas <b>{stats.yards[team]}</b> · Turnovers <b>{stats.turnovers[team]}</b> · Sacks <b>{stats.sacks[team]}</b>
            </p>
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Pokémon</th>
                  <th>Jogadas</th>
                  <th>Jardas</th>
                  <th>TD</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.speciesId}>
                    <td>
                      <span className="stats-name">
                        <Sprite id={r.speciesId} size={48} />
                        <span>{speciesName(r.speciesId)}</span>
                      </span>
                      <span className="yards-bar" aria-hidden="true">
                        <span className="yards-fill" style={{ width: `${Math.round(barRatio(r.yards, max) * 100)}%` }} />
                      </span>
                    </td>
                    <td className="num">{r.plays}</td>
                    <td className="num">{r.yards}</td>
                    <td className="num">{r.touchdowns}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      Sem estatísticas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
