import type { GameEvent, MatchState, TeamKey } from '@pfl/engine';
import { DEFAULT_CONFIG, createMatch, replay, step } from '@pfl/engine';
import type { ReplayData } from '@pfl/protocol';
import { narrate, type NarrationLine } from './narration';
import { buildTimeline, type AnimStep } from './timeline';
import type { Stage } from './matchState';

export interface ReplayFrame {
  index: number;
  /** estado pré-jogada (escalações já reveladas) */
  stage: Stage;
  /** eventos desde o frame anterior até a resolução desta jogada */
  events: GameEvent[];
  steps: AnimStep[];
  lines: NarrationLine[];
}

export type ReplayBuild =
  | { ok: true; frames: ReplayFrame[]; allEvents: GameEvent[]; finalScore: Record<TeamKey, number> }
  | { ok: false; message: string };

export function stageFromState(s: MatchState): Stage {
  return {
    turnId: s.turnId,
    offenseTeam: s.offense,
    ballOn: s.field.ballOn,
    yardsToGo: s.field.yardsToGo,
    lineups: structuredClone(s.lineups),
    fatigue: { A: { ...s.teams.A.fatigue.levels }, B: { ...s.teams.B.fatigue.levels } },
  };
}

/** Eventos que marcam a resolução de uma jogada (uma jogada = um frame). */
const RESOLVES = new Set<GameEvent['t']>(['CARDS', 'CONVERSION', 'MATCH_END']);

/**
 * Reproduz a partida com o engine (spec 6.1: replay a partir de seed + ações). O `step` dá o estado
 * pré-jogada de cada frame. O `replay` confere o placar final. Ações sem eventos (TIMEOUT de etapa,
 * SET_DEPTH) só acumulam. Nunca lança: dados corrompidos ou de outra versão do motor viram mensagem.
 */
export function buildReplay(data: ReplayData, expectedScore?: Record<TeamKey, number>): ReplayBuild {
  try {
    const ctx = {
      names: { A: data.teams.A.name, B: data.teams.B.name },
      possessionsPerTeam: DEFAULT_CONFIG.possessionsPerTeam,
    };
    const start = createMatch(data.teams.A, data.teams.B, data.seed);
    let state = start.state;
    let pending: GameEvent[] = [...start.events];
    const frames: ReplayFrame[] = [];
    const flush = (stage: Stage, resolved: readonly GameEvent[]) => {
      frames.push({ index: frames.length, stage, events: pending, steps: buildTimeline(resolved), lines: narrate(pending, ctx) });
      pending = [];
    };

    for (const action of data.actions) {
      const before = state;
      const r = step(state, action);
      state = r.state;
      pending.push(...r.events);
      if (r.events.some((e) => RESOLVES.has(e.t))) flush(stageFromState(before), r.events);
    }
    if (pending.length > 0) flush(stageFromState(state), pending);

    const full = replay(data.teams.A, data.teams.B, data.seed, data.actions);
    if (expectedScore && (full.state.score.A !== expectedScore.A || full.state.score.B !== expectedScore.B)) {
      return { ok: false, message: 'O replay não reproduz o placar final (versões diferentes do motor?).' };
    }
    return { ok: true, frames, allEvents: full.events, finalScore: { ...full.state.score } };
  } catch {
    return { ok: false, message: 'Não foi possível reproduzir o replay.' };
  }
}
