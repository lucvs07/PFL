import type { FormationId, PackageId, SlotId, Team } from '@pfl/engine';
import { FORMATIONS, PACKAGES } from '@pfl/engine';
import { useArrowNav } from '../../app/useArrowNav';
import { previewLineup } from '../../match/lineupPreview';
import { FORMATION_LABELS, PACKAGE_LABELS, speciesName } from '../../lib/names';
import './match.css';

export interface LineupOption<T extends string> {
  id: T;
  label: string;
  slots: readonly SlotId[];
}

export const FORMATION_OPTIONS: LineupOption<FormationId>[] = (Object.keys(FORMATIONS) as FormationId[]).map((id) => ({
  id,
  label: FORMATION_LABELS[id],
  slots: FORMATIONS[id],
}));

export const PACKAGE_OPTIONS: LineupOption<PackageId>[] = (Object.keys(PACKAGES) as PackageId[]).map((id) => ({
  id,
  label: PACKAGE_LABELS[id],
  slots: PACKAGES[id],
}));

interface Props<T extends string> {
  title: string;
  hint?: string;
  options: LineupOption<T>[];
  team: Team | null;
  levels: Record<number, number>;
  onPick: (id: T) => void;
}

/** 4 botões, cada um com a lista de quem entra em campo (spec 6.2). A cor da vaga vem do lado (classe no pai). */
export function LineupPicker<T extends string>({ title, hint, options, team, levels, onPick }: Props<T>) {
  const { ref, onKeyDown } = useArrowNav<HTMLDivElement>();
  return (
    <div className="picker-wrap">
      <h3 className="match-panel-title">{title}</h3>
      {hint && <p className="match-hint">{hint}</p>}
      <div className="picker" role="group" aria-label={title} ref={ref} onKeyDown={onKeyDown}>
        {options.map((o) => {
          const lineup = team ? previewLineup(o.slots, team, levels) : null;
          return (
            <button key={o.id} type="button" className="picker-option" onClick={() => onPick(o.id)}>
              <span className="picker-title">{o.label}</span>
              {lineup ? (
                <ul className="picker-lineup">
                  {o.slots.map((slot) => {
                    const id = lineup[slot];
                    return id === undefined ? null : (
                      <li key={slot}>
                        <b className="picker-slot">{slot}</b> <span className="picker-name">{speciesName(id)}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <span className="picker-slots">
                  {o.slots.map((slot) => (
                    <b key={slot} className="picker-slot">
                      {slot}
                    </b>
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
