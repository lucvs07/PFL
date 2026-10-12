import { describe, it, expect } from 'vitest';
import { validateTeam, teamCost, SALARY_CAP, OFFENSE_SLOTS, DEFENSE_SLOTS } from '@pfl/engine';
import { randomTeam, buildDepth, usableCards } from '../src/random-team';

describe('randomTeam', () => {
  it('gera 150 times válidos e próximos do teto', () => {
    let rng = 1;
    const costs: number[] = [];
    for (let i = 0; i < 150; i++) {
      const r = randomTeam(rng, `T${i}`);
      rng = r.rng;
      expect(validateTeam(r.team), `seed índice ${i}`).toEqual([]);
      costs.push(teamCost(r.team));
    }
    expect(Math.max(...costs)).toBeLessThanOrEqual(SALARY_CAP);
    expect(costs.reduce((a, b) => a + b, 0) / costs.length).toBeGreaterThan(110);
  });

  it('desiste com erro claro em vez de travar quando não acha elenco', () => {
    expect(() => randomTeam(1, 'x', 0)).toThrow(/nenhum elenco válido em 0 tentativas/);
  });

  it('tenta de novo quando um elenco não libera as cartas: seed 1 falha com 1 tentativa e fecha com o padrão', () => {
    expect(() => randomTeam(1, 'x', 1)).toThrow(/nenhum elenco válido em 1 tentativas/);
    const r = randomTeam(1, 'x');
    expect(validateTeam(r.team)).toEqual([]);
    expect(randomTeam(1, 'x')).toEqual(r); // as tentativas descartadas avançam o rng de forma determinística
  });

  it('é determinístico', () => {
    expect(randomTeam(99)).toEqual(randomTeam(99));
    expect(randomTeam(99).team).not.toEqual(randomTeam(100).team);
  });

  it('só põe no deck cartas jogáveis com os titulares', () => {
    const { team } = randomTeam(7);
    const off = usableCards(team, 'OFFENSE').map((c) => c.id);
    const def = usableCards(team, 'DEFENSE').map((c) => c.id);
    for (const id of team.offenseDeck) expect(off).toContain(id);
    for (const id of team.defenseDeck) expect(def).toContain(id);
  });
});

describe('buildDepth', () => {
  it('titulares distintos em cada lado e 3 nomes por vaga', () => {
    const roster = [25, 26, 100, 81, 125, 74, 95, 66, 19, 16, 21, 50, 54, 63, 10, 13];
    const depth = buildDepth(roster);
    for (const side of [OFFENSE_SLOTS, DEFENSE_SLOTS]) {
      const starters = side.map((s) => depth[s]![0]);
      expect(new Set(starters).size).toBe(side.length);
      for (const s of side) expect(depth[s]).toHaveLength(3);
    }
    expect(depth.QB![0]).toBe(125); // Electabuzz: maior nota de QB (0,7·SpA + 0,2·SpD + 0,1·Vel = 94)
  });
});
