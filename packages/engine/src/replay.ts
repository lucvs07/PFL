import type { Action, GameEvent, Team } from './model';
import { createMatch, step, DEFAULT_CONFIG, type MatchConfig, type StepResult } from './match';

/** Reconstrói uma partida a partir da seed e do log de ações (spec 7.1). */
export function replay(
  teamA: Team,
  teamB: Team,
  seed: number,
  actions: readonly Action[],
  config: MatchConfig = DEFAULT_CONFIG,
): StepResult {
  let { state, events } = createMatch(teamA, teamB, seed, config);
  const all: GameEvent[] = [...events];
  for (const action of actions) {
    const r = step(state, action);
    state = r.state;
    all.push(...r.events);
  }
  return { state, events: all };
}
