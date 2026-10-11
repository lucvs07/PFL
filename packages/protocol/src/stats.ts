import type { GameEvent, Lineup, PlayOutcome, TeamKey } from '@pfl/engine';
import type { MatchStats, PokemonMatchStats } from './messages';

/**
 * Estatísticas de fim de jogo, derivadas só dos eventos do motor. Convenções:
 * - plays: vezes como ator (offActors/defActors de cada PLAY), por (time, espécie).
 * - Ator de habilidade: o primeiro de offActors cuja vaga, na lineup do FORMATION mais recente, é RB/WR1-3/TE/FB;
 *   se não houver, o QB da lineup.
 * - yards por Pokémon: só jardas de GAIN, creditadas ao ator de habilidade. Sack não é creditado a nenhum Pokémon.
 * - yards[K]: GAIN + SACK (negativo) com K no ataque, com as jardas brutas do motor (num TD contam além da linha de gol).
 * - touchdowns: TOUCHDOWN creditado ao ator de habilidade do PLAY anterior (a conversão de 2 não é TD).
 * - turnovers[K]: turnovers cometidos por K (interceptação/fumble). Turnover on downs não conta.
 * - sacks[K]: sacks feitos pela defesa de K.
 */
const SKILL_SLOT = /^(RB|WR\d|TE|FB)$/;

function skillActor(outcome: PlayOutcome, lineup: Lineup): number | null {
  const slotOf = new Map<number, string>();
  for (const [slot, id] of Object.entries(lineup)) if (id !== undefined) slotOf.set(id, slot);
  const skill = outcome.offActors.find((id) => SKILL_SLOT.test(slotOf.get(id) ?? ''));
  return skill ?? lineup.QB ?? null;
}

export function computeStats(events: readonly GameEvent[]): MatchStats {
  const byKey = new Map<string, PokemonMatchStats>();
  const entry = (team: TeamKey, speciesId: number): PokemonMatchStats => {
    const key = `${team}:${speciesId}`;
    let e = byKey.get(key);
    if (!e) {
      e = { speciesId, team, plays: 0, yards: 0, touchdowns: 0 };
      byKey.set(key, e);
    }
    return e;
  };
  const yards: Record<TeamKey, number> = { A: 0, B: 0 };
  const turnovers: Record<TeamKey, number> = { A: 0, B: 0 };
  const sacks: Record<TeamKey, number> = { A: 0, B: 0 };
  let offense: TeamKey | null = null;
  let defense: TeamKey | null = null;
  let lineup: Lineup = {};
  let lastSkill: { team: TeamKey; id: number } | null = null;

  for (const ev of events) {
    switch (ev.t) {
      case 'FORMATION':
        offense = ev.team;
        defense = ev.team === 'A' ? 'B' : 'A';
        lineup = ev.lineup;
        lastSkill = null;
        break;
      case 'PLAY': {
        if (!offense || !defense) break;
        const o = ev.outcome;
        for (const id of o.offActors) entry(offense, id).plays += 1;
        for (const id of o.defActors) entry(defense, id).plays += 1;
        const skill = skillActor(o, lineup);
        lastSkill = skill === null ? null : { team: offense, id: skill };
        if (o.kind === 'GAIN' || o.kind === 'SACK') yards[offense] += o.yards;
        if (o.kind === 'GAIN' && skill !== null) entry(offense, skill).yards += o.yards;
        if (o.kind === 'SACK') sacks[defense] += 1;
        break;
      }
      case 'TURNOVER':
        if (offense) turnovers[offense] += 1;
        break;
      case 'TOUCHDOWN':
        if (lastSkill && lastSkill.team === ev.team) entry(lastSkill.team, lastSkill.id).touchdowns += 1;
        break;
      default:
        break;
    }
  }

  const pokemon = [...byKey.values()].sort((a, b) =>
    a.team === b.team ? a.speciesId - b.speciesId : a.team < b.team ? -1 : 1,
  );
  return { pokemon, yards, turnovers, sacks };
}
