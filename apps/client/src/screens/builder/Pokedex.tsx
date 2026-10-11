import { useMemo, useState, type CSSProperties } from 'react';
import type { PokemonType, Position, Species } from '@pfl/engine';
import { LEGENDARY_IDS, POKEMON_TYPES, aptitude, speciesCost } from '@pfl/engine';
import type { TeamDraft } from '../../builder/draft';
import { DEFAULT_FILTER, filterPokedex, type PokedexFilter } from '../../builder/derived';
import { detailSpecies, dexNumber, pickState, speciesActions, type PickState } from '../../builder/pokedexView';
import { POSITION_LABELS, TYPE_LABELS, displayName } from '../../lib/names';
import { Sprite } from '../../components/Sprite';
import { TypeBadge } from '../../components/TypeBadge';
import { Stars } from '../../components/Stars';
import { StatBars } from '../../components/StatBars';
import './builder.css';

const POSITIONS = Object.keys(POSITION_LABELS) as Position[];
const COST_LIMITS = [2, 4, 6, 8, 10, 12, 14, 17];
const PICK_LABEL: Record<Exclude<PickState, null>, string> = { ROSTER: 'No elenco', SPECIALIST: 'Kicker' };

interface Props {
  draft: TeamDraft;
  onAdd: (id: number) => void;
  onSpecialist: (id: number) => void;
}

/** Pokédex dos 151 (spec 6.1): trilho de tipos, filtros, grade de espécies e painel de detalhe. */
export function Pokedex({ draft, onAdd, onSpecialist }: Props) {
  const [filter, setFilter] = useState<PokedexFilter>(DEFAULT_FILTER);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const list = useMemo(() => filterPokedex(filter), [filter]);
  const detail = detailSpecies(list, selectedId);
  const set = (patch: Partial<PokedexFilter>) => setFilter((f) => ({ ...f, ...patch }));

  return (
    <section className="panel pokedex" aria-label="Pokédex">
      <TypeRail value={filter.type} onChange={(type) => set({ type })} />

      <div className="pokedex-main">
        <h2 className="panel-title">Pokédex</h2>
        <div className="pokedex-filters">
          <input
            className="input"
            placeholder="Nome ou nº"
            value={filter.search}
            onChange={(e) => set({ search: e.target.value })}
            aria-label="Buscar"
          />
          <select
            className="input"
            value={filter.maxCost ?? ''}
            onChange={(e) => set({ maxCost: e.target.value === '' ? null : Number(e.target.value) })}
            aria-label="Custo máximo"
          >
            <option value="">Qualquer custo</option>
            {COST_LIMITS.map((c) => (
              <option key={c} value={c}>
                Custo até {c}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={filter.position}
            onChange={(e) => set({ position: e.target.value as Position | 'ALL' })}
            aria-label="Posição"
          >
            <option value="ALL">Qualquer posição</option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p} · {POSITION_LABELS[p]}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={filter.minAptitude}
            disabled={filter.position === 'ALL'}
            onChange={(e) => set({ minAptitude: Number(e.target.value) })}
            aria-label="Aptidão mínima"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {'★'.repeat(n)} ou mais
              </option>
            ))}
          </select>
        </div>
        <p className="pokedex-count">
          {list.length} Pokémon
        </p>
        {list.length === 0 ? (
          <p className="muted">Nenhum Pokémon com esses filtros.</p>
        ) : (
          <ul className="dex-grid">
            {list.map((s) => {
              const state = pickState(draft, s.id);
              const selected = detail?.id === s.id;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`dex-tile${state ? ' is-picked' : ''}${selected ? ' is-selected' : ''}`}
                    aria-pressed={selected}
                    onClick={() => setSelectedId(s.id)}
                  >
                    <span className="dex-ghost" aria-hidden="true">
                      {String(s.id).padStart(3, '0')}
                    </span>
                    <span className="dex-tile-sprite">
                      <Sprite id={s.id} size={96} />
                    </span>
                    <span className="dex-tile-no">{dexNumber(s.id)}</span>
                    <span className="dex-tile-name">{displayName(s.name)}</span>
                    <span className="dex-types">
                      {s.types.map((t) => (
                        <TypeBadge key={t} type={t} />
                      ))}
                    </span>
                    <span className="dex-tile-foot">
                      <span className="dex-cost">{speciesCost(s.id)}pt</span>
                      {LEGENDARY_IDS.includes(s.id) && <span className="legend-tag">Lend.</span>}
                      {state && <span className="pick-tag">{PICK_LABEL[state]}</span>}
                    </span>
                    {filter.position !== 'ALL' && <Stars value={aptitude(s.id, filter.position)} />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {detail && <SpeciesDetail species={detail} draft={draft} onAdd={onAdd} onSpecialist={onSpecialist} />}
    </section>
  );
}

function TypeRail({ value, onChange }: { value: PokemonType | 'ALL'; onChange: (type: PokemonType | 'ALL') => void }) {
  return (
    <div className="type-rail" role="group" aria-label="Filtrar por tipo">
      <button type="button" className="rail-pill rail-all" aria-pressed={value === 'ALL'} onClick={() => onChange('ALL')}>
        Todos
      </button>
      {POKEMON_TYPES.map((t) => (
        <button
          key={t}
          type="button"
          className="rail-pill"
          style={{ '--pill-color': `var(--type-${t})` } as CSSProperties}
          aria-pressed={value === t}
          onClick={() => onChange(t)}
        >
          {TYPE_LABELS[t]}
        </button>
      ))}
    </div>
  );
}

interface DetailProps extends Props {
  species: Species;
}

function SpeciesDetail({ species, draft, onAdd, onSpecialist }: DetailProps) {
  const { canAdd, canSpecialist } = speciesActions(draft, species.id);
  const state = pickState(draft, species.id);
  return (
    <aside className="dex-detail" aria-label={`Detalhe de ${displayName(species.name)}`}>
      <div className="dex-detail-hero">
        <span className="dex-ghost dex-detail-ghost" aria-hidden="true">
          {String(species.id).padStart(3, '0')}
        </span>
        <Sprite id={species.id} size={192} />
      </div>
      <h3 className="dex-detail-title">
        <span className="dex-detail-no">{dexNumber(species.id)}</span> {displayName(species.name)}
      </h3>
      <div className="dex-detail-meta">
        {species.types.map((t) => (
          <TypeBadge key={t} type={t} />
        ))}
        <span className="dex-cost">{speciesCost(species.id)}pt</span>
        {LEGENDARY_IDS.includes(species.id) && <span className="legend-tag">Lendário</span>}
        {state && <span className="pick-tag">{PICK_LABEL[state]}</span>}
      </div>
      <StatBars stats={species.stats} />
      <h4 className="dex-detail-sub">Aptidão por posição</h4>
      <ul className="apt-list">
        {POSITIONS.map((p) => (
          <li key={p} title={POSITION_LABELS[p]}>
            <span className="apt-pos">{p}</span>
            <Stars value={aptitude(species.id, p)} />
          </li>
        ))}
      </ul>
      <div className="dex-detail-actions">
        <button type="button" className="btn" disabled={!canAdd} onClick={() => onAdd(species.id)}>
          + Elenco
        </button>
        <button type="button" className="btn" disabled={!canSpecialist} onClick={() => onSpecialist(species.id)}>
          Kicker
        </button>
      </div>
    </aside>
  );
}
