import { SUGGESTED_TEAMS, createMatch, rngNext, step, type GameEvent, type Team, type TeamKey } from '@pfl/engine';
import { actingTeams, botAction } from './bot';
import { randomTeam } from './random-team';

export const MAX_STEPS_PER_MATCH = 5000;

export interface MatchRecord {
  teams: Record<TeamKey, string>;
  score: Record<TeamKey, number>;
  winner: TeamKey;
  events: GameEvent[];
}

/** Uma partida bot × bot. Lança erro (em vez de travar) se não terminar em `maxSteps` ações. */
export function playMatch(teamA: Team, teamB: Team, seed: number, botSeed: number, maxSteps = MAX_STEPS_PER_MATCH): MatchRecord {
  let { state, events } = createMatch(teamA, teamB, seed);
  const log: GameEvent[] = [...events];
  let rng = botSeed;
  for (let i = 0; i < maxSteps; i++) {
    if (state.phase === 'MATCH_END') {
      const winner: TeamKey = state.score.A > state.score.B ? 'A' : 'B';
      return { teams: { A: teamA.name, B: teamB.name }, score: { ...state.score }, winner, events: log };
    }
    const team = actingTeams(state)[0];
    const decision = botAction(state, team, rng);
    rng = decision.rng;
    const r = step(state, decision.action);
    state = r.state;
    log.push(...r.events);
  }
  throw new Error(`partida não terminou em ${maxSteps} ações (seed ${seed})`);
}

export interface SimOptions {
  games: number;
  seed: number;
  /** a cada quantos confrontos um usa dois times sugeridos (o resto usa times aleatórios) */
  suggestedEvery?: number;
}

/**
 * Roda `games` partidas. Os confrontos vêm em pares com os lados trocados (A/B), para que a vantagem
 * da primeira posse não contamine as estatísticas de carta. Os dois times de um confronto são sempre diferentes.
 */
export function runSim(options: SimOptions): MatchRecord[] {
  if (!Number.isInteger(options.games) || options.games < 1) throw new Error(`games inválido: ${options.games}`);
  const every = options.suggestedEvery ?? 4;
  let rng = options.seed | 0;
  const next = (): number => {
    const r = rngNext(rng);
    rng = r.state;
    return Math.floor(r.value * 2 ** 31);
  };
  const records: MatchRecord[] = [];
  for (let pair = 0; records.length < options.games; pair++) {
    let x: Team;
    let y: Team;
    if (pair % every === 0) {
      const i = next() % SUGGESTED_TEAMS.length;
      const j = (i + 1 + (next() % (SUGGESTED_TEAMS.length - 1))) % SUGGESTED_TEAMS.length;
      x = SUGGESTED_TEAMS[i];
      y = SUGGESTED_TEAMS[j];
    } else {
      const rx = randomTeam(next(), `Aleatório ${pair}a`);
      const ry = randomTeam(rx.rng, `Aleatório ${pair}b`);
      x = rx.team;
      y = ry.team;
    }
    const seed = next();
    const botSeed = next();
    records.push(playMatch(x, y, seed, botSeed));
    if (records.length < options.games) records.push(playMatch(y, x, seed, botSeed));
  }
  return records;
}
