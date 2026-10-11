import { LEGENDARY_IDS, ROSTER_SIZE, getSpecies, speciesCost } from '@pfl/engine';
import type { TeamDraft } from '../../builder/draft';
import { rosterSlots } from '../../builder/pokedexView';
import { speciesName } from '../../lib/names';
import { Sprite } from '../../components/Sprite';
import './builder.css';

interface Props {
  draft: TeamDraft;
  onRemove: (id: number) => void;
}

/** Fileira do elenco (16 vagas, as vazias tracejadas) + vaga do especialista (kicker/punter). */
export function RosterPanel({ draft, onRemove }: Props) {
  const specialist = draft.specialist;
  return (
    <section className="roster-strip" aria-label="Elenco">
      <h2 className="roster-strip-title">
        Elenco <span className="roster-strip-count">{draft.roster.length}/{ROSTER_SIZE}</span>
      </h2>
      <div className="roster-strip-body">
        <ul className="roster-slots">
          {rosterSlots(draft.roster).map((id, i) =>
            id === null ? (
              <li key={`empty-${i}`} className="roster-slot is-empty" aria-label={`Vaga ${i + 1} vazia`}>
                <span className="roster-slot-no">{i + 1}</span>
              </li>
            ) : (
              <li key={id} className="roster-slot">
                <Sprite id={id} size={40} />
                <span className="roster-slot-name" title={speciesName(id)}>
                  {speciesName(id)}
                </span>
                <span className="roster-slot-meta">
                  {LEGENDARY_IDS.includes(id) && <span className="legend-tag">Lend.</span>}
                  <span className="roster-slot-cost">{speciesCost(id)}pt</span>
                </span>
                <button
                  type="button"
                  className="roster-slot-remove"
                  aria-label={`Remover ${speciesName(id)}`}
                  onClick={() => onRemove(id)}
                >
                  ✕
                </button>
              </li>
            ),
          )}
        </ul>
        <div className={`roster-slot roster-kicker${specialist === null ? ' is-empty' : ''}`}>
          <span className="roster-kicker-label">Kicker</span>
          {specialist === null ? (
            <span className="roster-kicker-help">Escolha na Pokédex</span>
          ) : (
            <>
              <Sprite id={specialist} size={40} />
              <span className="roster-slot-name" title={speciesName(specialist)}>
                {speciesName(specialist)}
              </span>
              <span className="roster-slot-meta">
                <span className="roster-slot-cost">{speciesCost(specialist)}pt</span>
              </span>
              <span className="roster-kicker-stats">
                SpA {getSpecies(specialist).stats.spAttack} · Atk {getSpecies(specialist).stats.attack}
              </span>
              <button
                type="button"
                className="roster-slot-remove"
                aria-label="Remover especialista"
                onClick={() => onRemove(specialist)}
              >
                ✕
              </button>
            </>
          )}
        </div>
      </div>
      {draft.roster.length === 0 && (
        <p className="roster-strip-help">Adicione Pokémon pela Pokédex ou carregue um time sugerido.</p>
      )}
      {specialist === null && (
        <p className="roster-strip-help">O kicker não ocupa vaga do elenco. Sp. Atk define FG e PAT; Sp. Atk + Attack, o punt.</p>
      )}
    </section>
  );
}
