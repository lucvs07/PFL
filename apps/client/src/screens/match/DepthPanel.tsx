import type { Team } from '@pfl/engine';
import type { DepthAction } from '../../builder/depth';
import { depthDraftErrors, isDepthDirty, type DepthDraft } from '../../match/depthDraft';
import { DepthChartEditor } from '../../components/DepthChartEditor';
import { ErrorList } from '../../components/ErrorList';
import './match.css';

interface Props {
  team: Team;
  draft: DepthDraft;
  canEditNow: boolean;
  onAction: (a: DepthAction) => void;
  onReset: () => void;
}

/** Ajuste do depth chart entre drives (spec 5.4): rascunho enviado sozinho quando a janela abre. */
export function DepthPanel({ team, draft, canEditNow, onAction, onReset }: Props) {
  const dirty = isDepthDirty(draft, team);
  const errors = dirty ? depthDraftErrors(team, draft) : [];
  let status = 'Sem alterações pendentes.';
  if (dirty && errors.length > 0) status = 'Corrija o depth chart para que ele possa ser enviado.';
  else if (dirty && canEditNow) status = 'Enviando agora...';
  else if (dirty) status = 'Alterações pendentes: serão enviadas no início do seu próximo drive.';
  return (
    <section className="depth-panel stack" aria-label="Depth chart">
      <div className="depth-panel-head">
        <strong className="depth-panel-title">Depth chart</strong>
        <span className="depth-panel-status" role="status">
          {status}
        </span>
        <button type="button" className="btn btn-small" disabled={!dirty} onClick={onReset}>
          Desfazer
        </button>
      </div>
      {errors.length > 0 && <ErrorList errors={errors} />}
      <DepthChartEditor roster={team.roster} depth={draft.depth} keepOnField={draft.keepOnField} onAction={onAction} />
    </section>
  );
}
