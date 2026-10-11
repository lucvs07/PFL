import { useMemo, useState, type CSSProperties } from 'react';
import type { Team, TeamKey } from '@pfl/engine';
import { SUGGESTED_TEAMS, teamCost } from '@pfl/engine';
import type { RoomPlayer, RoomState } from '@pfl/protocol';
import { loadTeams } from '../builder/teamStore';
import { draftToTeam } from '../builder/draft';
import { draftErrors } from '../builder/derived';
import { getLocalStorage } from '../lib/storage';
import { gymTheme } from '../lib/design';
import { leadSpecies } from '../lib/lobby';
import { ErrorList } from '../components/ErrorList';
import { Sprite } from '../components/Sprite';
import './lobby.css';

interface Props {
  room: RoomState;
  myTeam: Team | null;
  onSubmitTeam: (team: Team) => void;
  onReady: (ready: boolean) => void;
  onLeave: () => void;
}

interface TeamOption {
  key: string;
  source: 'Salvo' | 'Sugerido';
  team: Team;
}

const KEYS: TeamKey[] = ['A', 'B'];
const OPTION_SPRITES = 6;

/** Spec 6.1 (3): escolher o time e marcar "pronto"; o servidor valida os dois e começa a partida. */
export function LobbyScreen({ room, myTeam, onSubmitTeam, onReady, onLeave }: Props) {
  const options = useMemo<TeamOption[]>(() => {
    const saved = loadTeams(getLocalStorage()).flatMap((draft, i): TeamOption[] => {
      const team = draftToTeam(draft);
      return team && draftErrors(draft).length === 0 ? [{ key: `saved-${i}`, source: 'Salvo', team }] : [];
    });
    const suggested = SUGGESTED_TEAMS.map((team, i): TeamOption => ({ key: `suggested-${i}`, source: 'Sugerido', team }));
    return [...saved, ...suggested];
  }, []);
  const [selected, setSelected] = useState(options[0]?.key ?? '');
  const me: RoomPlayer | undefined = room.players.find((p) => p.key === room.you);
  const canReady = !!me && me.teamName !== null && me.teamErrors.length === 0;
  const chosen = options.find((o) => o.key === selected);

  return (
    <main className="screen lobby">
      <header className="panel lobby-header">
        <div className="lobby-code-block">
          <p className="muted">Código da sala</p>
          <p className="room-code" aria-label="Código da sala">
            {room.code}
          </p>
          <p className="muted">Passe este código para seu amigo entrar.</p>
        </div>
        <div className="lobby-leave">
          <button type="button" className="btn" onClick={onLeave}>
            Sair da sala
          </button>
          <p className="muted lobby-leave-note">Sair libera esta aba; a vaga continua reservada até a sala fechar.</p>
        </div>
      </header>

      <section className="lobby-players" aria-label="Jogadores">
        {KEYS.map((key) => {
          const p = room.players.find((player) => player.key === key);
          const isYou = key === room.you;
          const lead = isYou && p ? leadSpecies(myTeam) : null;
          const classes = ['lobby-card', isYou ? 'is-you' : '', p?.ready ? 'is-ready' : '', lead !== null ? 'has-lead' : '']
            .filter(Boolean)
            .join(' ');
          return (
            <article key={key} className={classes}>
              <div className="lobby-card-facts">
                <h2 className="lobby-card-title">
                  Jogador {key}
                  {isYou && <span className="lobby-you"> (você)</span>}
                </h2>
                {!p ? (
                  <p className="muted">Aguardando entrar...</p>
                ) : (
                  <>
                    <p className={p.connected ? 'lobby-conn' : 'lobby-conn muted'}>
                      <span aria-hidden="true">{p.connected ? '●' : '○'}</span> {p.connected ? 'conectado' : 'desconectado'}
                    </p>
                    <p className="lobby-team">
                      {p.teamName ?? <span className="muted lobby-team-none">sem time</span>}
                    </p>
                    {isYou && myTeam && <p className="lobby-cost">{teamCost(myTeam)}pt</p>}
                    <p className={p.ready ? 'lobby-ready' : 'lobby-ready is-waiting'}>{p.ready ? 'PRONTO!' : 'não está pronto'}</p>
                    {p.teamName !== null && p.teamErrors.length > 0 && <ErrorList errors={p.teamErrors} />}
                  </>
                )}
              </div>
              {lead !== null && (
                <div className="lobby-lead">
                  <Sprite id={lead} size={112} />
                </div>
              )}
            </article>
          );
        })}
      </section>

      <section className="panel stack lobby-pick">
        <h2 className="panel-title">Seu time</h2>
        {options.length === 0 ? (
          <p className="muted">Nenhum time válido salvo. Monte um na tela inicial ou use um sugerido.</p>
        ) : (
          <ul className="team-options">
            {options.map((o) => {
              const theme = o.source === 'Sugerido' ? gymTheme(o.team.name) : null;
              const tint = theme ? `var(--type-${theme.type})` : 'var(--gbc-ink)';
              return (
                <li key={o.key}>
                  <label
                    className={`team-option${selected === o.key ? ' is-selected' : ''}`}
                    style={{ '--gym-color': tint } as CSSProperties}
                  >
                    <input type="radio" name="team" value={o.key} checked={selected === o.key} onChange={() => setSelected(o.key)} />
                    <span className="team-option-text">
                      <span className="team-option-name">{o.team.name}</span>
                      <span className="team-option-source">
                        {o.source}
                        {theme ? ` · Ginásio de ${theme.city}` : ''} · {teamCost(o.team)}pt
                      </span>
                    </span>
                    <span className="team-option-sprites" aria-hidden="true">
                      {o.team.roster.slice(0, OPTION_SPRITES).map((id) => (
                        <Sprite key={id} id={id} size={28} />
                      ))}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <div className="row lobby-actions">
          <button type="button" className="btn" disabled={!chosen || me?.ready} onClick={() => chosen && onSubmitTeam(chosen.team)}>
            Enviar time
          </button>
          <button type="button" className="btn btn-primary" disabled={!canReady} onClick={() => onReady(!me?.ready)}>
            {me?.ready ? 'Cancelar pronto' : 'Estou pronto'}
          </button>
        </div>
        {myTeam && <p className="muted lobby-help">Enviado: {myTeam.name}. O servidor revalida o time.</p>}
        <p className="muted lobby-help">
          {room.status === 'WAITING' ? 'A partida começa quando os dois estiverem prontos.' : `Sala: ${room.status}`}
        </p>
      </section>
    </main>
  );
}
