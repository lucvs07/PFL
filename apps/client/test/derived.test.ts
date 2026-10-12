import { describe, it, expect } from 'vitest';
import { OFFENSE_PROFILES, SALARY_CAP, getCard, teamCost } from '@pfl/engine';
import {
  DEFAULT_FILTER, capInfo, copiesIn, draftErrors, eligibleCards, filterPokedex, teamErrorMessage,
} from '../src/builder/derived';
import { cardInfo, requirementText } from '../src/builder/cardInfo';
import { draftFromTeam, emptyDraft } from '../src/builder/draft';
import { testTeam } from './fixtures';

describe('teto salarial', () => {
  it('soma elenco e especialista como o engine', () => {
    const team = testTeam();
    const info = capInfo(draftFromTeam(team));
    expect(info.cost).toBe(teamCost(team));
    expect(info.cap).toBe(SALARY_CAP);
    expect(info.remaining).toBe(SALARY_CAP - info.cost);
    expect(info.over).toBe(false);
  });

  it('marca time acima do teto', () => {
    const expensive = [3, 6, 9, 149, 143, 130, 131, 59, 65, 68, 76, 94, 112, 134, 135, 136];
    const info = capInfo({ ...draftFromTeam(testTeam()), roster: expensive });
    expect(info.over).toBe(true);
    expect(info.ratio).toBe(1);
  });

  it('rascunho vazio custa 0', () => {
    expect(capInfo(emptyDraft()).cost).toBe(0);
  });
});

describe('cartas liberadas pelo elenco', () => {
  const roster = testTeam().roster;

  it('lista só cartas de tipo/assinatura do lado pedido que o elenco libera', () => {
    const offense = eligibleCards(roster, 'OFFENSE').map((c) => c.id);
    expect(offense).toContain('electric_thunder_screen');
    expect(offense).not.toContain('fire_deep');
    expect(offense).not.toContain('basic_run');
    expect(offense).not.toContain('punt');
    expect(eligibleCards(roster, 'DEFENSE').every((c) => c.side === 'DEFENSE')).toBe(true);
    expect(eligibleCards([], 'OFFENSE')).toEqual([]);
  });

  it('conta cópias no deck', () => {
    expect(copiesIn(testTeam().offenseDeck, 'normal_tackle')).toBe(2);
    expect(copiesIn([], 'normal_tackle')).toBe(0);
  });
});

describe('Pokédex', () => {
  it('filtra por tipo, custo, aptidão e busca', () => {
    const electric = filterPokedex({ ...DEFAULT_FILTER, type: 'electric' }).map((s) => s.id);
    expect(electric).toContain(25);
    expect(electric).not.toContain(1);
    expect(filterPokedex({ ...DEFAULT_FILTER, maxCost: 1 }).map((s) => s.id)).toContain(129);
    const fastWr = filterPokedex({ ...DEFAULT_FILTER, position: 'WR', minAptitude: 5 }).map((s) => s.id);
    expect(fastWr).toContain(135);
    expect(fastWr).not.toContain(143);
    expect(filterPokedex({ ...DEFAULT_FILTER, search: 'mr. m' }).map((s) => s.id)).toEqual([122]);
    expect(filterPokedex({ ...DEFAULT_FILTER, search: '25' }).map((s) => s.id)).toEqual([25]);
    expect(filterPokedex(DEFAULT_FILTER)).toHaveLength(151);
  });
});

describe('erros do time', () => {
  it('pede especialista antes de validar', () => {
    expect(draftErrors(emptyDraft()).map((e) => e.code)).toEqual(['NO_SPECIALIST']);
  });

  it('time válido não tem erros', () => {
    expect(draftErrors(draftFromTeam(testTeam()))).toEqual([]);
  });

  it('traduz os códigos do engine', () => {
    expect(teamErrorMessage({ code: 'OVER_CAP', detail: '130' })).toMatch(/130.*120/);
    expect(teamErrorMessage({ code: 'CARD_NOT_ELIGIBLE', detail: 'fire_deep' })).toContain(getCard('fire_deep').name);
    expect(teamErrorMessage({ code: 'FORMATION_UNFILLABLE', detail: 'HEAVY' })).toContain('Pesada');
    expect(teamErrorMessage({ code: 'CODIGO_NOVO', detail: 'x' })).toBe('CODIGO_NOVO: x');
  });
});

describe('tooltip de carta', () => {
  it('descreve requisitos', () => {
    expect(requirementText({ position: 'RB', types: ['electric'] })).toBe('RB Elétrico');
    expect(requirementText({ position: 'OL', types: ['rock'], count: 2 })).toBe('2 OL Pedra');
    expect(requirementText({ position: 'DL', types: ['rock', 'ground'], count: 3 })).toBe('3 DL Pedra/Terra');
    expect(requirementText({ position: 'WR', species: [17, 18] })).toBe('WR: Pidgeotto/Pidgeot');
  });

  it('mostra o perfil da categoria e a leitura', () => {
    const info = cardInfo(getCard('basic_run'));
    expect(info.category).toBe('Corrida por Dentro');
    expect(info.element).toBeNull();
    expect(info.requirements).toEqual([]);
    expect(info.profile[0]).toBe(`Jardas base: ${OFFENSE_PROFILES.RUN_INSIDE.baseYards}`);
    expect(info.reads.join(' ')).toContain('Contenção de Corrida');
    expect(info.reads[1]).toMatch(/Homem a Homem/);
  });

  it('defesa base é sempre neutra; especiais explicam o chute', () => {
    expect(cardInfo(getCard('basic_defense')).reads).toEqual(['Leitura sempre neutra']);
    expect(cardInfo(getCard('punt')).profile[0]).toMatch(/especialista/);
  });
});
