import type { CSSProperties } from 'react';
import type { Team } from '@pfl/engine';
import { SUGGESTED_TEAMS, teamCost } from '@pfl/engine';
import { gymTheme } from '../../lib/design';
import { speciesName } from '../../lib/names';
import { Sprite } from '../../components/Sprite';
import './builder.css';

const SHOWN = 6;

/** Times sugeridos como cards de cidade de ginásio; cor da cidade pela tabela, elenco e custo dos dados. */
export function SuggestedTeams({ onPick }: { onPick: (team: Team) => void }) {
  return (
    <section className="panel suggested">
      <h2 className="panel-title">Times sugeridos</h2>
      <ul className="suggested-list">
        {SUGGESTED_TEAMS.map((team) => {
          const theme = gymTheme(team.name);
          const band = theme ? `var(--type-${theme.type})` : 'var(--gbc-ink)';
          const rest = team.roster.length - SHOWN;
          return (
            <li key={team.name} className="gym-card" style={{ '--gym-color': band } as CSSProperties}>
              <span className="gym-band" aria-hidden="true" />
              <div className="gym-body">
                <span className="gym-city">{theme ? `Ginásio de ${theme.city}` : 'Time livre'}</span>
                <h3 className="gym-name">{team.name}</h3>
                <ul className="gym-roster">
                  {team.roster.slice(0, SHOWN).map((id) => (
                    <li key={id}>
                      <Sprite id={id} size={32} />
                      <span className="gym-roster-name">{speciesName(id)}</span>
                    </li>
                  ))}
                </ul>
                <div className="gym-foot">
                  <span className="gym-extra">
                    {rest > 0 ? `+${rest} no elenco · ` : ''}kicker {speciesName(team.specialist)}
                  </span>
                  <span className="gym-cost">{teamCost(team)}pt</span>
                  <button type="button" className="btn btn-small" aria-label={`Usar ${team.name}`} onClick={() => onPick(team)}>
                    Usar
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
