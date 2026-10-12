import { useMemo, useReducer, useState } from 'react';
import type { Team } from '@pfl/engine';
import { builderReducer } from '../../builder/builderState';
import { draftFromTeam, emptyDraft, type TeamDraft } from '../../builder/draft';
import { capInfo, draftErrors } from '../../builder/derived';
import { loadTeams, saveTeams } from '../../builder/teamStore';
import { getLocalStorage } from '../../lib/storage';
import { ErrorList } from '../../components/ErrorList';
import { DepthChartEditor } from '../../components/DepthChartEditor';
import { CapBar } from './CapBar';
import { Pokedex } from './Pokedex';
import { RosterPanel } from './RosterPanel';
import { DeckEditor } from './DeckEditor';
import { TeamCodePanel } from './TeamCodePanel';
import { SuggestedTeams } from './SuggestedTeams';
import './builder.css';

type Tab = 'ROSTER' | 'DEPTH' | 'DECK' | 'CODE';
const TABS: { id: Tab; label: string }[] = [
  { id: 'ROSTER', label: 'Elenco' },
  { id: 'DEPTH', label: 'Depth chart' },
  { id: 'DECK', label: 'Deck' },
  { id: 'CODE', label: 'Código' },
];
const NO_STORAGE = 'Este navegador não permite salvar times. Use a aba Código para exportar o seu.';

export function BuilderScreen({ onBack }: { onBack: () => void }) {
  const storage = useMemo(() => getLocalStorage(), []);
  const [saved, setSaved] = useState<TeamDraft[]>(() => loadTeams(storage));
  const [index, setIndex] = useState<number | null>(null);
  const [draft, dispatch] = useReducer(builderReducer, undefined, () => emptyDraft());
  const [tab, setTab] = useState<Tab>('ROSTER');
  const [message, setMessage] = useState<string | null>(storage ? null : NO_STORAGE);
  const errors = useMemo(() => draftErrors(draft), [draft]);
  const cap = useMemo(() => capInfo(draft), [draft]);

  const load = (draftToLoad: TeamDraft, at: number | null, text: string | null) => {
    dispatch({ type: 'LOAD', draft: draftToLoad });
    setIndex(at);
    setMessage(text);
  };

  const save = () => {
    const next = index === null ? [...saved, draft] : saved.map((t, i) => (i === index ? draft : t));
    setSaved(next);
    if (index === null) setIndex(next.length - 1);
    setMessage(saveTeams(storage, next) ? 'Time salvo neste navegador.' : 'Não foi possível salvar neste navegador. Exporte o código para não perder o time.');
  };

  const pickSuggested = (team: Team) => load(draftFromTeam(team), null, `"${team.name}" carregado. Salve para guardar uma cópia editável.`);

  return (
    <main className="screen builder">
      <header className="builder-header panel">
        <div className="builder-header-top">
          <button type="button" className="btn btn-small" onClick={onBack}>
            ◀ Voltar
          </button>
          <h1 className="builder-title">Montar time</h1>
        </div>
        <div className="builder-controls">
          <input
            className="input builder-name"
            value={draft.name}
            aria-label="Nome do time"
            onChange={(e) => dispatch({ type: 'RENAME', name: e.target.value })}
          />
          <select
            className="input"
            aria-label="Times salvos"
            value={index ?? ''}
            onChange={(e) => {
              if (e.target.value === '') return;
              const i = Number(e.target.value);
              load(saved[i], i, null);
            }}
          >
            <option value="">{index === null ? 'Time não salvo' : 'Times salvos'}</option>
            {saved.map((t, i) => (
              <option key={`${t.name}-${i}`} value={i}>
                {t.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn" onClick={() => load(emptyDraft(), null, null)}>
            Novo
          </button>
          <button type="button" className="btn btn-primary" onClick={save}>
            Salvar
          </button>
        </div>
        {message && (
          <p className="builder-message" role="status">
            {message}
          </p>
        )}
        <details className="builder-errors" open={errors.length > 0 && errors.length <= 4}>
          <summary>{errors.length === 0 ? 'Time válido' : `${errors.length} pendência(s)`}</summary>
          <ErrorList errors={errors} />
        </details>
      </header>

      <div className="builder-strip panel">
        <CapBar info={cap} />
        <RosterPanel draft={draft} onRemove={(id) => dispatch({ type: 'REMOVE_SPECIES', id })} />
      </div>

      <nav className="tabs" aria-label="Seções do time">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`btn tab${tab === t.id ? ' is-active' : ''}`}
            aria-pressed={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'ROSTER' && (
        <div className="builder-roster-layout">
          <Pokedex draft={draft} onAdd={(id) => dispatch({ type: 'ADD_SPECIES', id })} onSpecialist={(id) => dispatch({ type: 'SET_SPECIALIST', id })} />
          <SuggestedTeams onPick={pickSuggested} />
        </div>
      )}
      {tab === 'DEPTH' && (
        <section className="panel">
          <DepthChartEditor roster={draft.roster} depth={draft.depth} keepOnField={draft.keepOnField} onAction={dispatch} />
        </section>
      )}
      {tab === 'DECK' && (
        <DeckEditor
          draft={draft}
          onAdd={(side, cardId) => dispatch({ type: 'DECK_ADD', side, cardId })}
          onRemove={(side, cardId) => dispatch({ type: 'DECK_REMOVE', side, cardId })}
        />
      )}
      {tab === 'CODE' && (
        <TeamCodePanel
          draft={draft}
          onImport={(imported) => load(imported, null, `"${imported.name}" importado. Salve para guardá-lo.`)}
        />
      )}
    </main>
  );
}
