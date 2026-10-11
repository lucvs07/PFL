import { describe, it, expect } from 'vitest';
import { createMatch, step, playableCards, playerView, type MatchState } from '../src/match';
import type { Action, GameEvent, TeamKey } from '../src/model';
import { electricTeam } from './fixtures';

const A = electricTeam('A');
const B = electricTeam('B');
const start = (seed = 1): MatchState => createMatch(A, B, seed).state;
const other = (k: TeamKey): TeamKey => (k === 'A' ? 'B' : 'A');

function run(s: MatchState, ...actions: Action[]): { state: MatchState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let state = s;
  for (const a of actions) {
    const r = step(state, a);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

function snap(s: MatchState, offCard = 'basic_run', defCard = 'basic_defense') {
  const o = s.offense;
  return run(
    s,
    { type: 'FORMATION', team: o, formation: 'PISTOL' },
    { type: 'PACKAGE', team: other(o), package: 'BASE' },
    { type: 'CARD', team: o, cardId: offCard },
    { type: 'CARD', team: other(o), cardId: defCard },
  );
}

describe('createMatch', () => {
  it('rejeita time inválido', () => {
    expect(() => createMatch({ ...A, roster: A.roster.slice(1) }, B, 1)).toThrow(/INVALID_TEAM/);
  });

  it('começa com A atacando da própria 25, mãos de 5', () => {
    const s = start();
    expect(s.phase).toBe('FORMATION');
    expect(s.offense).toBe('A');
    expect(s.possessions).toEqual({ A: 1, B: 0 });
    expect(s.field).toEqual({ down: 1, yardsToGo: 10, ballOn: 25 });
    expect(s.teams.A.offense.hand).toHaveLength(5);
    expect(s.teams.B.defense.hand).toHaveLength(5);
  });
});

describe('validação de ações', () => {
  it('rejeita time errado, fase errada e carta repetida', () => {
    const s = start();
    expect(() => step(s, { type: 'FORMATION', team: 'B', formation: 'PISTOL' })).toThrow(/WRONG_TEAM/);
    expect(() => step(s, { type: 'CARD', team: 'A', cardId: 'basic_run' })).toThrow(/WRONG_PHASE/);
    const { state } = run(
      s,
      { type: 'FORMATION', team: 'A', formation: 'PISTOL' },
      { type: 'PACKAGE', team: 'B', package: 'BASE' },
      { type: 'CARD', team: 'A', cardId: 'basic_run' },
    );
    expect(() => step(state, { type: 'CARD', team: 'A', cardId: 'basic_pass' })).toThrow(/ALREADY_CHOSEN/);
  });

  it('rejeita carta não jogável (punt fora do 4º down)', () => {
    const { state } = run(
      start(),
      { type: 'FORMATION', team: 'A', formation: 'PISTOL' },
      { type: 'PACKAGE', team: 'B', package: 'BASE' },
    );
    expect(() => step(state, { type: 'CARD', team: 'A', cardId: 'punt' })).toThrow(/CARD_NOT_PLAYABLE/);
  });

  it('ids e escolhas inválidos viram EngineError, mesmo com chaves de protótipo', () => {
    const s = start();
    for (const bad of ['toString', '__proto__', 'constructor']) {
      expect(() => step(s, { type: 'FORMATION', team: 'A', formation: bad as never })).toThrow(/UNKNOWN_FORMATION/);
    }
    const atPackage = run(s, { type: 'FORMATION', team: 'A', formation: 'PISTOL' }).state;
    expect(() => step(atPackage, { type: 'PACKAGE', team: 'B', package: 'toString' as never })).toThrow(/UNKNOWN_PACKAGE/);
    const atConversion = { ...start(), phase: 'CONVERSION' as const };
    expect(() => step(atConversion, { type: 'CONVERSION', team: 'A', choice: 'BOGUS' as never })).toThrow(/INVALID_CHOICE/);
  });

  it('não altera o estado de entrada', () => {
    const s = start();
    const before = structuredClone(s);
    snap(s);
    expect(s).toEqual(before);
  });
});

describe('loop da jogada', () => {
  it('um snap completo revela formação, pacote e cartas e avança o turno', () => {
    const s = start();
    const { state, events } = snap(s);
    const kinds = events.map((e) => e.t);
    expect(kinds).toEqual(expect.arrayContaining(['FORMATION', 'PACKAGE', 'CARDS', 'PLAY']));
    expect(state.turnId).toBeGreaterThan(s.turnId);
  });

  it('timeouts aplicam os padrões', () => {
    const { events } = run(start(), { type: 'TIMEOUT' }, { type: 'TIMEOUT' }, { type: 'TIMEOUT' });
    expect(events.find((e) => e.t === 'FORMATION')).toMatchObject({ formation: 'PISTOL' });
    expect(events.find((e) => e.t === 'PACKAGE')).toMatchObject({ package: 'BASE' });
    expect(events.find((e) => e.t === 'CARDS')).toMatchObject({ offense: 'basic_run', defense: 'basic_defense' });
  });

  it('aplica fadiga aos atores', () => {
    const { state } = snap(start());
    expect(Object.values(state.teams.A.fatigue.levels).some((l) => l > 0)).toBe(true);
  });

  it('jogar uma carta da mão mantém a mão com 5', () => {
    let s = run(start(), { type: 'FORMATION', team: 'A', formation: 'PISTOL' }, { type: 'PACKAGE', team: 'B', package: 'BASE' }).state;
    for (let seed = 2; !playableCards(s, 'A').some((id) => s.teams.A.offense.hand.includes(id)) && seed < 60; seed++) {
      s = run(start(seed), { type: 'FORMATION', team: 'A', formation: 'PISTOL' }, { type: 'PACKAGE', team: 'B', package: 'BASE' }).state;
    }
    const card = playableCards(s, 'A').find((id) => s.teams.A.offense.hand.includes(id));
    expect(card).toBeDefined();
    const next = run(s, { type: 'CARD', team: 'A', cardId: card! }, { type: 'CARD', team: 'B', cardId: 'basic_defense' }).state;
    expect(next.teams.A.offense.hand).toHaveLength(5);
    expect(next.teams.A.offense.discard).toContain(card);
  });
});

describe('deck esgotado no meio da partida', () => {
  it('reembaralha o descarte e mantém a mão com 5 e 12 cartas no total', () => {
    let s = start();
    s.field = { down: 1, yardsToGo: 100, ballOn: 25 }; // evita first down, TD e fim de drive
    let defCardsPlayed = 0;
    for (let i = 0; i < 9; i++) {
      s = run(s, { type: 'FORMATION', team: 'A', formation: 'PISTOL' }, { type: 'PACKAGE', team: 'B', package: 'BASE' }).state;
      const defCard = playableCards(s, 'B').find((id) => id !== 'basic_defense');
      if (!defCard) { s = run(s, { type: 'TIMEOUT' }).state; continue; }
      defCardsPlayed++;
      s = run(s, { type: 'CARD', team: 'A', cardId: 'basic_run' }, { type: 'CARD', team: 'B', cardId: defCard }).state;
      s.field = { down: 1, yardsToGo: 100, ballOn: 25 };
      const d = s.teams.B.defense;
      expect(d.hand).toHaveLength(5);
      expect(d.draw.length + d.hand.length + d.discard.length).toBe(12);
    }
    expect(defCardsPlayed).toBeGreaterThan(7); // mais que as 7 cartas do monte: obrigou a reembaralhar
  });
});

describe('4º down e chutes', () => {
  it('libera punt e field goal no 4º down', () => {
    const s = start();
    s.field = { down: 4, yardsToGo: 8, ballOn: 40 };
    const ready = run(s, { type: 'FORMATION', team: 'A', formation: 'PISTOL' }, { type: 'PACKAGE', team: 'B', package: 'BASE' }).state;
    expect(playableCards(ready, 'A')).toEqual(expect.arrayContaining(['punt', 'field_goal']));
  });

  it('punt passa a bola para B onde ela parou', () => {
    const s = start();
    s.field = { down: 4, yardsToGo: 8, ballOn: 40 };
    const { state, events } = snap(s, 'punt');
    const punt = events.find((e) => e.t === 'PUNT') as { distance: number };
    const landing = 40 + punt.distance;
    expect(state.offense).toBe('B');
    expect(state.possessions.B).toBe(1);
    expect(state.field.ballOn).toBe(landing >= 100 ? 25 : 100 - landing);
  });

  it('field goal: 3 pontos ou bola com B no ponto do chute', () => {
    const s = start();
    s.field = { down: 4, yardsToGo: 5, ballOn: 95 };
    const { state, events } = snap(s, 'field_goal');
    const fg = events.find((e) => e.t === 'FIELD_GOAL') as { good: boolean };
    if (fg.good) {
      expect(state.score.A).toBe(3);
      expect(state.field.ballOn).toBe(25);
    } else {
      expect(state.score.A).toBe(0);
      expect(state.field.ballOn).toBe(20);
    }
    expect(state.offense).toBe('B');
  });
});

describe('touchdown e conversão', () => {
  it('TD soma 6 e leva à fase de conversão', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = start(seed);
      s.field = { down: 1, yardsToGo: 1, ballOn: 99 };
      const { state } = snap(s);
      if (state.phase === 'CONVERSION') {
        expect(state.score.A).toBe(6);
        expect(state.offense).toBe('A');
        return;
      }
    }
    throw new Error('nenhuma seed gerou TD');
  });

  it('na conversão, as escolhas do snap do TD já foram limpas', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = start(seed);
      s.field = { down: 1, yardsToGo: 1, ballOn: 99 };
      const { state } = snap(s);
      if (state.phase !== 'CONVERSION') continue;
      expect(state.cards).toEqual({ offense: null, defense: null });
      expect(state.formation).toBeNull();
      expect(state.package).toBeNull();
      expect(state.lineups).toEqual({ offense: {}, defense: {} });
      const view = playerView(state, 'A');
      expect(view.yourCard).toBeNull();
      expect(view.opponentHasChosen).toBe(false);
      return;
    }
    throw new Error('nenhuma seed gerou TD');
  });

  it('PAT encerra o drive e B começa na 25', () => {
    const s = start();
    s.phase = 'CONVERSION';
    const { state, events } = run(s, { type: 'CONVERSION', team: 'A', choice: 'PAT' });
    const conv = events.find((e) => e.t === 'CONVERSION') as { good: boolean };
    expect(state.score.A).toBe(conv.good ? 1 : 0);
    expect(state.offense).toBe('B');
    expect(state.field.ballOn).toBe(25);
  });

  it('conversão de 2: uma jogada a partir da 97', () => {
    const s = start();
    s.phase = 'CONVERSION';
    const { state } = run(s, { type: 'CONVERSION', team: 'A', choice: 'TWO' });
    expect(state.conversionAttempt).toBe(true);
    expect(state.field).toEqual({ down: 1, yardsToGo: 3, ballOn: 97 });
    expect(state.offense).toBe('A');
    const after = snap(state);
    expect(after.events.some((e) => e.t === 'CONVERSION')).toBe(true);
    expect(after.state.offense).toBe('B');
  });
});

describe('fim de jogo e prorrogação', () => {
  const lastPossession = (scoreA: number, scoreB: number): MatchState => {
    const s = start();
    s.offense = 'B';
    s.possessions = { A: 6, B: 6 };
    s.score = { A: scoreA, B: scoreB };
    s.field = { down: 4, yardsToGo: 10, ballOn: 30 };
    return s;
  };

  it('encerra quando as posses acabam e há vencedor', () => {
    const { state, events } = snap(lastPossession(7, 0), 'punt');
    expect(state.phase).toBe('MATCH_END');
    expect(events.at(-1)).toEqual({ t: 'MATCH_END', score: { A: 7, B: 0 } });
    expect(() => step(state, { type: 'TIMEOUT' })).toThrow(/MATCH_OVER/);
  });

  it('empate leva à prorrogação: A ataca da 25 do adversário', () => {
    const { state, events } = snap(lastPossession(7, 7), 'punt');
    expect(events.some((e) => e.t === 'OVERTIME')).toBe(true);
    expect(state.overtime).toEqual({ round: 1, turnsInRound: 0 });
    expect(state.offense).toBe('A');
    expect(state.field.ballOn).toBe(75);
    expect(state.possessions).toEqual({ A: 6, B: 6 });
  });

  it('a partir da 3ª prorrogação a posse é só uma tentativa de 2', () => {
    const s = lastPossession(7, 7);
    s.overtime = { round: 2, turnsInRound: 1 };
    const { state } = snap(s, 'punt');
    expect(state.overtime).toEqual({ round: 3, turnsInRound: 0 });
    expect(state.offense).toBe('A');
    expect(state.conversionAttempt).toBe(true);
    expect(state.field.ballOn).toBe(97);
  });
});

describe('playerView', () => {
  it('mostra a própria mão e esconde a do adversário', () => {
    const s = start();
    const view = playerView(s, 'B');
    expect(view.side).toBe('defense');
    expect(view.hand).toEqual(s.teams.B.defense.hand);
    expect(view.opponentHandSize).toBe(5);
    expect(view).not.toHaveProperty('teams');
    expect(view).not.toHaveProperty('rng');
  });

  it('não revela a carta já escolhida pelo adversário', () => {
    const { state } = run(
      start(),
      { type: 'FORMATION', team: 'A', formation: 'PISTOL' },
      { type: 'PACKAGE', team: 'B', package: 'BASE' },
      { type: 'CARD', team: 'A', cardId: 'basic_pass' },
    );
    const view = playerView(state, 'B');
    expect(view.opponentHasChosen).toBe(true);
    expect(JSON.stringify(view)).not.toContain('basic_pass');
  });
});

describe('robustez do estado e das ações', () => {
  it('createMatch não compartilha objetos com o chamador', () => {
    const t = electricTeam('X');
    const s = createMatch(t, B, 1).state;
    t.depth.QB = [54];
    t.roster.pop();
    expect(s.teams.A.team.depth.QB).toEqual([63, 54]);
    expect(s.teams.A.team.roster).toHaveLength(16);
  });

  it('step reaproveita o Team (congelado) e copia o resto do estado', () => {
    const s = start();
    const next = step(s, { type: 'FORMATION', team: 'A', formation: 'PISTOL' }).state;
    expect(next.teams.A.team).toBe(s.teams.A.team);
    expect(Object.isFrozen(s.teams.A.team.depth.QB)).toBe(true);
    expect(() => s.teams.A.team.roster.push(1)).toThrow(TypeError);
    expect(next.teams.A.offense).not.toBe(s.teams.A.offense);
    expect(next.teams.A.fatigue).not.toBe(s.teams.A.fatigue);
    expect(next.lineups).not.toBe(s.lineups);
  });

  it('CARD de um time que não é A nem B é rejeitado', () => {
    const s = run(start(), { type: 'FORMATION', team: 'A', formation: 'PISTOL' }, { type: 'PACKAGE', team: 'B', package: 'BASE' }).state;
    expect(() => step(s, { type: 'CARD', team: 'C' as never, cardId: 'basic_defense' })).toThrow(/WRONG_TEAM/);
  });

  it('o estado de entrada continua intacto quando step lança erro', () => {
    const s = start();
    const before = structuredClone(s);
    expect(() => step(s, { type: 'FORMATION', team: 'B', formation: 'PISTOL' })).toThrow(/WRONG_TEAM/);
    expect(() => step(s, { type: 'CARD', team: 'A', cardId: 'basic_run' })).toThrow(/WRONG_PHASE/);
    expect(s).toEqual(before);
  });
});

describe('padrões de timeout em situações especiais', () => {
  it('no 4º down o ataque cai em punt', () => {
    const s = start();
    s.field = { down: 4, yardsToGo: 8, ballOn: 40 };
    const { events } = run(s, { type: 'TIMEOUT' }, { type: 'TIMEOUT' }, { type: 'TIMEOUT' });
    expect(events.find((e) => e.t === 'CARDS')).toMatchObject({ offense: 'punt', defense: 'basic_defense' });
  });

  it('na conversão cai em PAT', () => {
    const s = start();
    s.phase = 'CONVERSION';
    const { events } = run(s, { type: 'TIMEOUT' });
    expect(events.find((e) => e.t === 'CONVERSION')).toMatchObject({ choice: 'PAT' });
  });

  it('na tentativa de 2 pontos cai em corrida básica, mesmo no 4º down', () => {
    const s = start();
    s.phase = 'CONVERSION';
    const two = run(s, { type: 'CONVERSION', team: 'A', choice: 'TWO' }).state;
    two.field = { ...two.field, down: 4 };
    const { events } = run(two, { type: 'TIMEOUT' }, { type: 'TIMEOUT' }, { type: 'TIMEOUT' });
    expect(events.find((e) => e.t === 'CARDS')).toMatchObject({ offense: 'basic_run' });
  });
});

describe('prorrogação e fadiga em chutes', () => {
  it('termina já na rodada 1 quando há vencedor', () => {
    const s = start();
    s.offense = 'B';
    s.possessions = { A: 6, B: 6 };
    s.score = { A: 7, B: 0 };
    s.overtime = { round: 1, turnsInRound: 1 };
    s.field = { down: 4, yardsToGo: 10, ballOn: 75 };
    const { state, events } = snap(s, 'punt');
    expect(state.phase).toBe('MATCH_END');
    expect(events.at(-1)).toEqual({ t: 'MATCH_END', score: { A: 7, B: 0 } });
  });

  it('punt também recupera a fadiga de quem está fora de campo', () => {
    const s = start();
    s.field = { down: 4, yardsToGo: 8, ballOn: 40 };
    s.teams.A.fatigue = { levels: { 50: 5 }, resting: [50] }; // Diglett fora de campo
    const { state } = snap(s, 'punt');
    // -1 pela jogada e -2 pelo fim do drive
    expect(state.teams.A.fatigue.levels[50]).toBe(2);
  });
});
