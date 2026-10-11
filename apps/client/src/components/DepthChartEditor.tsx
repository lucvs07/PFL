import type { SlotId, Team } from '@pfl/engine';
import { DEFENSE_SLOTS, OFFENSE_SLOTS, aptitude, slotPosition } from '@pfl/engine';
import { rankForPosition, type DepthAction } from '../builder/depth';
import { POSITION_LABELS, speciesName } from '../lib/names';
import { Sprite } from './Sprite';
import { Stars } from './Stars';
import './ui.css';

interface Props {
  roster: readonly number[];
  depth: Team['depth'];
  keepOnField: readonly number[];
  onAction: (a: DepthAction) => void;
}

/** Depth chart por vaga (spec 5.4): a mesma ordem vale em todas as formações/pacotes que usam a vaga. */
export function DepthChartEditor({ roster, depth, keepOnField, onAction }: Props) {
  return (
    <div className="depth-editor stack">
      <div className="row">
        <button type="button" className="btn btn-small" disabled={roster.length === 0} onClick={() => onAction({ type: 'AUTO_DEPTH' })}>
          Preencher automaticamente
        </button>
        <span className="muted">O primeiro de cada vaga é o titular; os demais entram por fadiga, na ordem.</span>
      </div>
      <h3>Ataque</h3>
      <div className="depth-grid">
        {OFFENSE_SLOTS.map((slot) => (
          <SlotEditor key={slot} slot={slot} roster={roster} list={depth[slot] ?? []} onAction={onAction} />
        ))}
      </div>
      <h3>Defesa</h3>
      <div className="depth-grid">
        {DEFENSE_SLOTS.map((slot) => (
          <SlotEditor key={slot} slot={slot} roster={roster} list={depth[slot] ?? []} onAction={onAction} />
        ))}
      </div>
      <h3>Manter em campo</h3>
      <p className="muted">Ignora a substituição por fadiga e aceita −10% nos stats por nível acima do limiar.</p>
      <div className="keep-list">
        {roster.map((id) => (
          <label key={id} className="keep-item">
            <input type="checkbox" checked={keepOnField.includes(id)} onChange={() => onAction({ type: 'TOGGLE_KEEP', id })} />
            {speciesName(id)}
          </label>
        ))}
      </div>
    </div>
  );
}

interface SlotProps {
  slot: SlotId;
  roster: readonly number[];
  list: readonly number[];
  onAction: (a: DepthAction) => void;
}

function SlotEditor({ slot, roster, list, onAction }: SlotProps) {
  const position = slotPosition(slot);
  const available = rankForPosition(roster.filter((id) => !list.includes(id)), position);
  return (
    <div className="depth-slot">
      <div className="depth-slot-head">
        <strong>{slot}</strong>
        <span className="muted">{POSITION_LABELS[position]}</span>
      </div>
      {list.length === 0 ? (
        <p className="error-text">vaga vazia</p>
      ) : (
        <ol className="depth-list">
          {list.map((id, i) => (
            <li key={id}>
              <Sprite id={id} size={32} />
              <span className="depth-name">{speciesName(id)}</span>
              <Stars value={aptitude(id, position)} />
              <span className="depth-buttons">
                <button type="button" className="btn btn-small" aria-label="Subir" disabled={i === 0} onClick={() => onAction({ type: 'DEPTH_MOVE', slot, id, dir: -1 })}>
                  ▲
                </button>
                <button type="button" className="btn btn-small" aria-label="Descer" disabled={i === list.length - 1} onClick={() => onAction({ type: 'DEPTH_MOVE', slot, id, dir: 1 })}>
                  ▼
                </button>
                <button type="button" className="btn btn-small" aria-label="Remover" onClick={() => onAction({ type: 'DEPTH_REMOVE', slot, id })}>
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
      <select
        className="input depth-add"
        value=""
        disabled={available.length === 0}
        onChange={(e) => {
          const id = Number(e.target.value);
          if (id) onAction({ type: 'DEPTH_ADD', slot, id });
        }}
      >
        <option value="">+ adicionar</option>
        {available.map((id) => (
          <option key={id} value={id}>
            {speciesName(id)} {'★'.repeat(aptitude(id, position))}
          </option>
        ))}
      </select>
    </div>
  );
}
