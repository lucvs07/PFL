import { describe, it, expect } from 'vitest';
import {
  threshold, fatigueMultiplier, initialFatigue, pickLineup, applyPlayFatigue, recoverBetweenDrives,
} from '../src/fatigue';
import { FORMATIONS, PACKAGES } from '../src/formations';
import type { FatigueState } from '../src/model';
import { electricTeam } from './fixtures';

const team = electricTeam();

describe('limiar e penalidade', () => {
  it('limiar é 2, ou 3 com HP ≥ 100', () => {
    expect(threshold(25)).toBe(2); // Pikachu
    expect(threshold(143)).toBe(3); // Snorlax
  });

  it('penaliza 10% por nível acima do limiar, com piso de 50%', () => {
    expect(fatigueMultiplier(25, 2)).toBe(1);
    expect(fatigueMultiplier(25, 3)).toBeCloseTo(0.9);
    expect(fatigueMultiplier(25, 10)).toBe(0.5);
  });
});

describe('pickLineup', () => {
  it('usa os titulares do depth chart', () => {
    expect(pickLineup(FORMATIONS.PISTOL, team, initialFatigue())).toEqual({
      QB: 63, OL1: 95, OL2: 74, OL3: 66, RB: 25, WR1: 26, WR2: 125,
    });
    expect(pickLineup(PACKAGES.BASE, team, initialFatigue())).toEqual({
      DL1: 95, DL2: 74, DL3: 50, LB1: 66, CB1: 26, CB2: 100, S1: 63,
    });
  });

  it('troca um titular que está descansando', () => {
    const lineup = pickLineup(FORMATIONS.PISTOL, team, { levels: { 63: 2 }, resting: [63] });
    expect(lineup.QB).toBe(54);
  });

  it('escala um cansado se todos os candidatos estiverem descansando', () => {
    const lineup = pickLineup(FORMATIONS.PISTOL, team, { levels: { 63: 2, 54: 2 }, resting: [63, 54] });
    expect(lineup.QB).toBe(63);
    expect(Object.keys(lineup)).toHaveLength(7);
  });

  it('entre cansados, escala o menos cansado', () => {
    const lineup = pickLineup(FORMATIONS.PISTOL, team, { levels: { 63: 3, 54: 1 }, resting: [63, 54] });
    expect(lineup.QB).toBe(54);
  });
});

describe('fadiga por jogada', () => {
  const lineup = pickLineup(FORMATIONS.PISTOL, team, initialFatigue());

  it('ator ganha 1; QB e OL ganham ½', () => {
    const f = applyPlayFatigue(initialFatigue(), team, lineup, [25, 63, 95]);
    expect(f.levels[25]).toBe(1);
    expect(f.levels[63]).toBe(0.5);
    expect(f.levels[95]).toBe(0.5);
  });

  it('ao atingir o limiar entra em descanso, a menos que esteja em "manter em campo"', () => {
    let f = initialFatigue();
    f = applyPlayFatigue(f, team, lineup, [25]);
    f = applyPlayFatigue(f, team, lineup, [25]);
    expect(f.resting).toContain(25);

    const keep = { ...team, keepOnField: [25] };
    let g = initialFatigue();
    g = applyPlayFatigue(g, keep, lineup, [25]);
    g = applyPlayFatigue(g, keep, lineup, [25]);
    expect(g.resting).not.toContain(25);
  });

  it('fora de campo recupera 1 por jogada e só sai do descanso com fadiga 0', () => {
    const benchLineup = { ...lineup, RB: 50 };
    let f: FatigueState = { levels: { 25: 2 }, resting: [25] };
    f = applyPlayFatigue(f, team, benchLineup, []);
    expect(f.levels[25]).toBe(1);
    expect(f.resting).toContain(25);
    f = applyPlayFatigue(f, team, benchLineup, []);
    expect(f.levels[25]).toBe(0);
    expect(f.resting).not.toContain(25);
  });

  it('entre drives recupera 2 níveis, sem zerar', () => {
    const f = recoverBetweenDrives({ levels: { 25: 3, 63: 1 }, resting: [25] }, team);
    expect(f.levels[25]).toBe(1);
    expect(f.levels[63]).toBe(0);
    expect(f.resting).toContain(25);
  });
});
