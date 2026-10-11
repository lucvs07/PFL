import { SUGGESTED_TEAMS, createMatch, rngNext, step, type GameEvent, type Team, type TeamKey } from '@pfl/engine';
import { actingTeams, botAction } from './bot';
import { randomTeam } from './random-team';

export const MAX_STEPS_PER_MATCH = 5000;
/** maior seed aceita (32 bits sem sinal): acima disso `seed | 0` repetiria outra seed em silêncio */
export const MAX_SEED = 2 ** 32 - 1;

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
  for (let i = 0; i <= maxSteps; i++) {
    if (state.phase === 'MATCH_END') {
      const winner: TeamKey = state.score.A > state.score.B ? 'A' : 'B';
      return { teams: { A: teamA.name, B: teamB.name }, score: { ...state.score }, winner, events: log };
    }
    if (i === maxSteps) break;
    const team = actingTeams(state)[0];
    const decision = botAction(state, team, rng);
    rng = decision.rng;
    const r = step(state, decision.action);
    state = r.state;
    log.push(...r.events);
  }
  throw new Error(
    `partida não terminou em ${maxSteps} ações (seed ${seed}) [botSeed ${botSeed}; A: ${teamA.name}; B: ${teamB.name}]`,
  );
}

export interface SimOptions {
  games: number;
  seed: number;
  /** a cada quantos confrontos um usa dois times sugeridos (o resto usa times aleatórios) */
  suggestedEvery?: number;
  /** limite de ações por partida (padrão MAX_STEPS_PER_MATCH) */
  maxSteps?: number;
}

/**
 * Roda `games` partidas. Os confrontos vêm em pares com os lados trocados (A/B), para que a vantagem
 * da primeira posse não contamine as estatísticas de carta. Os dois times de um confronto são sempre diferentes.
 */
export function runSim(options: SimOptions): MatchRecord[] {
  if (!Number.isInteger(options.games) || options.games < 1) throw new Error(`games inválido: ${options.games}`);
  if (!Number.isInteger(options.seed) || options.seed < 0 || options.seed > MAX_SEED) throw new Error(`seed inválida: ${options.seed}`);
  const every = options.suggestedEvery ?? 4;
  if (!Number.isInteger(every) || every < 1) throw new Error(`suggestedEvery inválido: ${options.suggestedEvery}`);
  let rng = options.seed | 0;
  const next = (): number => {
    const r = rngNext(rng);
    rng = r.state;
    return Math.floor(r.value * 2 ** 31);
  };
  const records: MatchRecord[] = [];
  for (let pair = 0; records.length < options.games; pair++) {
    // a geração dos times também entra no try: um erro dela precisa do mesmo contexto para ser reproduzido
    try {
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
      records.push(playMatch(x, y, seed, botSeed, options.maxSteps));
      if (records.length < options.games) records.push(playMatch(y, x, seed, botSeed, options.maxSteps));
    } catch (e) {
      throw new Error(`${(e as Error).message} [runSim --seed ${options.seed}, par ${pair}]`);
    }
  }
  return records;
}
