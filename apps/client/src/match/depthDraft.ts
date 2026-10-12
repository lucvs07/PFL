import type { PlayerView, Team, TeamError } from '@pfl/engine';
import { validateTeam } from '@pfl/engine';
import type { PhaseMessage } from '@pfl/protocol';
import { ALL_SLOTS } from '../builder/depth';

/**
 * Ajuste manual do depth chart (spec 5.4). O servidor só aceita na etapa FORMATION do primeiro snap do
 * drive (view.canEditDepth), uma janela de poucos segundos. Por isso o jogador edita um rascunho a
 * qualquer momento, e o cliente o envia sozinho quando a janela abre.
 */
export interface DepthDraft {
  depth: Team['depth'];
  keepOnField: number[];
}

export interface PendingDepth {
  turnId: number;
  draft: DepthDraft;
}

export function draftFromTeamDepth(team: Team): DepthDraft {
  return structuredClone({ depth: team.depth, keepOnField: team.keepOnField });
}

const canonical = (d: DepthDraft) =>
  JSON.stringify([ALL_SLOTS.map((slot) => d.depth[slot] ?? []), [...d.keepOnField].sort((a, b) => a - b)]);

export function isDepthDirty(draft: DepthDraft, team: Team): boolean {
  return canonical(draft) !== canonical({ depth: team.depth, keepOnField: team.keepOnField });
}

export function depthDraftErrors(team: Team, draft: DepthDraft): TeamError[] {
  return validateTeam({ ...team, depth: draft.depth, keepOnField: draft.keepOnField });
}

export function shouldSendDepth(
  view: PlayerView | null,
  team: Team | null,
  draft: DepthDraft | null,
  lastSentTurn: number | null,
): boolean {
  if (!view || !team || !draft) return false;
  if (!view.canEditDepth || view.phase !== 'FORMATION' || lastSentTurn === view.turnId) return false;
  return isDepthDirty(draft, team) && depthDraftErrors(team, draft).length === 0;
}

/**
 * team:depth não tem ack. Se o servidor recusar, o `error` chega antes da próxima fase (e o App descarta o
 * pendente); se a etapa avançar sem erro, o depth foi aceito.
 */
export function resolvePendingDepth(pending: PendingDepth, msg: PhaseMessage): 'commit' | 'keep' {
  if (msg.view.turnId > pending.turnId) return 'commit';
  if (msg.view.turnId === pending.turnId && msg.view.phase !== 'FORMATION') return 'commit';
  return 'keep';
}
