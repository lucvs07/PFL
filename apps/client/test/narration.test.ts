import { describe, it, expect } from 'vitest';
import { getCard, type GameEvent, type PlayOutcome } from '@pfl/engine';
import { narrate, outcomeText, type NarrationContext } from '../src/match/narration';
import { typeEffect } from '../src/match/effect';

const ctx: NarrationContext = { names: { A: 'Trovões', B: 'Pedreiras' }, possessionsPerTeam: 6 };
const outcome = (o: Partial<PlayOutcome> = {}): PlayOutcome => ({
  kind: 'GAIN', yards: 8, bigPlay: false, read: 'WRONG', offActors: [135, 63], defActors: [130, 66],
  offTypeMult: 1, defTypeMult: 1, readFactor: 1, statFactor: 1, varianceFactor: 1, ...o,
});
const texts = (events: GameEvent[]) => narrate(events, ctx).map((l) => l.text);
const name = (id: string) => getCard(id).name;

describe('typeEffect', () => {
  it('usa a tabela de tipos contra os atores, sem o bônus de afinidade', () => {
    expect(typeEffect('electric', [130])).toBe('SUPER'); // Gyarados água/voador: 4x
    expect(typeEffect('electric', [69])).toBe('WEAK'); // Bellsprout planta/veneno: ½x
    expect(typeEffect('electric', [50])).toBe('IMMUNE'); // Diglett terra: 0x
    expect(typeEffect('electric', [19])).toBe('NEUTRAL'); // Rattata
    expect(typeEffect(null, [130])).toBeNull();
    expect(typeEffect('electric', [])).toBeNull();
  });
});

describe('narrate', () => {
  it('narra a jogada no estilo Gen 1', () => {
    expect(
      texts([
        { t: 'CARDS', offense: 'electric_thunder_screen', defense: 'basic_defense', read: 'WRONG' },
        { t: 'PLAY', outcome: outcome() },
        { t: 'FIRST_DOWN' },
      ]),
    ).toEqual([
      `${name('electric_thunder_screen')} × ${name('basic_defense')}`,
      '✖ Leitura errada da defesa!',
      `Jolteon usou ${name('electric_thunder_screen')}!`,
      'É super efetivo!',
      `Gyarados usou ${name('basic_defense')}!`,
      'Ganho de 8 jardas!',
      'FIRST DOWN!',
    ]);
  });

  it('narra a efetividade da carta de defesa contra os atores do ataque', () => {
    const lines = texts([
      { t: 'CARDS', offense: 'basic_run', defense: 'ground_dig', read: 'RIGHT' },
      { t: 'PLAY', outcome: outcome({ offActors: [135], defActors: [50], read: 'RIGHT', yards: 1 }) },
    ]);
    expect(lines).toContain('✔ Leitura certa da defesa!');
    expect(lines).toContain(`Diglett usou ${name('ground_dig')}!`);
    expect(lines.indexOf('É super efetivo!')).toBeGreaterThan(lines.indexOf(`Diglett usou ${name('ground_dig')}!`));
    expect(lines.at(-1)).toBe('Ganho de 1 jarda!');
  });

  it('imunidade e pouca efetividade', () => {
    const immune = texts([
      { t: 'CARDS', offense: 'electric_thunder_screen', defense: 'basic_defense', read: 'NEUTRAL' },
      { t: 'PLAY', outcome: outcome({ defActors: [50] }) },
    ]);
    expect(immune).toContain('Não teve efeito...');
    const weak = texts([
      { t: 'CARDS', offense: 'electric_thunder_screen', defense: 'basic_defense', read: 'NEUTRAL' },
      { t: 'PLAY', outcome: outcome({ defActors: [69] }) },
    ]);
    expect(weak).toContain('Não é muito efetivo...');
  });

  it('chutes não têm linha de leitura', () => {
    expect(
      texts([
        { t: 'CARDS', offense: 'punt', defense: 'basic_defense', read: 'NEUTRAL' },
        { t: 'PUNT', distance: 42 },
      ]),
    ).toEqual(['Punt de 42 jardas!']);
    expect(texts([{ t: 'FIELD_GOAL', distance: 45, good: false }])).toEqual(['Field goal de 45 jardas... errou!']);
  });

  it('narra drives, pontos e o fim', () => {
    const lines = narrate(
      [
        { t: 'DRIVE_START', offense: 'B', ballOn: 25, possession: 2, overtimeRound: 0 },
        { t: 'FORMATION', team: 'B', formation: 'SPREAD', lineup: {} },
        { t: 'PACKAGE', team: 'A', package: 'NICKEL', lineup: {} },
        { t: 'TOUCHDOWN', team: 'A' },
        { t: 'CONVERSION', team: 'A', choice: 'PAT', good: true },
        { t: 'OVERTIME', round: 2 },
        { t: 'DRIVE_START', offense: 'A', ballOn: 75, possession: 6, overtimeRound: 2 },
        { t: 'MATCH_END', score: { A: 7, B: 3 } },
      ],
      ctx,
    );
    expect(lines.map((l) => l.text)).toEqual([
      'Pedreiras começa a posse 2/6 na OWN 25.',
      'Pedreiras entra em formação Spread.',
      'Trovões responde com o pacote Nickel.',
      'TOUCHDOWN de Trovões!',
      'PAT convertido por Trovões!',
      'Prorrogação 2!',
      'Trovões ataca na prorrogação 2, bola na OPP 25.',
      'Fim de jogo! Trovões 7 × 3 Pedreiras',
    ]);
    expect(lines[3].kind).toBe('score');
  });

  it('PLAY sem CARDS antes (eventos parciais) não quebra', () => {
    expect(texts([{ t: 'PLAY', outcome: outcome({ kind: 'INCOMPLETE', yards: 0 }) }])).toEqual(['Passe incompleto.']);
  });
});

describe('outcomeText', () => {
  it('cobre todos os resultados', () => {
    expect(outcomeText(outcome({ kind: 'SACK', yards: -6 }))).toBe('Sack! Perda de 6 jardas.');
    expect(outcomeText(outcome({ kind: 'INTERCEPTION', yards: 18 }))).toBe('Interceptado por Gyarados!');
    expect(outcomeText(outcome({ kind: 'FUMBLE', yards: 2 }))).toBe('Fumble! Gyarados recupera a bola!');
    expect(outcomeText(outcome({ yards: 0 }))).toBe('Sem ganho.');
    expect(outcomeText(outcome({ yards: -2 }))).toBe('Perda de 2 jardas.');
    expect(outcomeText(outcome({ yards: 30, bigPlay: true }))).toBe('Jogada explosiva! Ganho de 30 jardas!');
  });
});
