import { describe, it, expect } from 'vitest';
import type { GameEvent, PlayerView } from '@pfl/engine';
import type { EndMessage } from '@pfl/protocol';
import {
  canSubmitCard, handEntries, initialMatchState, isAnimating, matchReducer, needsResync, panelMode, showEndScreen,
  timerSeconds, type MatchClientState, type MatchInput,
} from '../src/match/matchState';
import { makeView, testTeam } from './fixtures';

const T0 = 1_000_000;
const phase = (view: PlayerView, deadline = T0 + 5000): MatchInput => ({
  type: 'PHASE', msg: { turnId: view.turnId, phase: view.phase, deadline, view },
});
const apply = (...inputs: MatchInput[]): MatchClientState => inputs.reduce(matchReducer, initialMatchState());

const offLineup = { QB: 63, OL1: 95, OL2: 74, OL3: 66, RB: 25, WR1: 26, WR2: 125 };
const defLineup = { DL1: 95, DL2: 74, DL3: 50, LB1: 66, CB1: 26, CB2: 100, S1: 63 };
const formationReveal: MatchInput = {
  type: 'REVEAL', msg: { turnId: 1, events: [{ t: 'FORMATION', team: 'A', formation: 'PISTOL', lineup: offLineup }] },
};
const packageReveal: MatchInput = {
  type: 'REVEAL', msg: { turnId: 1, events: [{ t: 'PACKAGE', team: 'B', package: 'BASE', lineup: defLineup }] },
};
const playEvents: GameEvent[] = [
  { t: 'CARDS', offense: 'basic_run', defense: 'basic_defense', read: 'NEUTRAL' },
  {
    t: 'PLAY',
    outcome: {
      kind: 'GAIN', yards: 5, bigPlay: false, read: 'NEUTRAL', offActors: [25, 95, 74, 66], defActors: [95, 74, 50, 66],
      offTypeMult: 1, defTypeMult: 1, readFactor: 1, statFactor: 1, varianceFactor: 1,
    },
  },
];
const nextView = makeView({ turnId: 2, field: { down: 2, yardsToGo: 5, ballOn: 30 } });
const result = (turnId = 1, events = playEvents, view = nextView): MatchInput => ({
  type: 'RESULT', msg: { turnId, events, view }, now: T0,
});
const playcallView = (overrides: Partial<PlayerView> = {}) =>
  makeView({
    phase: 'PLAYCALL', formation: 'PISTOL', package: 'BASE', lineups: { offense: offLineup, defense: defLineup },
    hand: ['normal_tackle'], playable: ['basic_run', 'basic_pass'], ...overrides,
  });

/** Uma jogada completa do ponto de vista do ataque (A), até o match:result. */
function untilResult(): MatchClientState {
  return apply(
    phase(makeView()),
    formationReveal,
    phase(makeView({ phase: 'PACKAGE', formation: 'PISTOL', lineups: { offense: offLineup, defense: {} } })),
    packageReveal,
    phase(playcallView()),
    result(),
  );
}

const endMessage: EndMessage = {
  score: { A: 7, B: 0 },
  stats: { pokemon: [], yards: { A: 0, B: 0 }, turnovers: { A: 0, B: 0 }, sacks: { A: 0, B: 0 } },
  replay: { seed: 1, teams: { A: testTeam('A'), B: testTeam('B') }, actions: [] },
};

describe('mensagens de fase', () => {
  it('a fase atual define view, estágio, timer e painel', () => {
    const s = apply(phase(makeView()));
    expect(s.view?.turnId).toBe(1);
    expect(s.stage?.ballOn).toBe(25);
    expect(timerSeconds(s, T0)).toBe(5);
    expect(panelMode(s, T0)).toBe('PICK_FORMATION');
  });

  it('ignora mensagens antigas ou fora de ordem', () => {
    const older = apply(phase(makeView({ turnId: 2 })), phase(makeView({ turnId: 1, phase: 'PLAYCALL' })));
    expect(older.view).toMatchObject({ turnId: 2, phase: 'FORMATION' });
    const samTurn = apply(phase(makeView({ phase: 'PACKAGE' })), phase(makeView({ phase: 'FORMATION' })));
    expect(samTurn.view?.phase).toBe('PACKAGE');
  });

  it('as revelações preenchem a escalação e narram uma vez só', () => {
    const s = apply(phase(makeView()), formationReveal, formationReveal);
    expect(s.stage?.lineups.offense).toEqual(offLineup);
    expect(s.log.filter((l) => l.text.includes('formação Pistol'))).toHaveLength(1);
  });

  it('a defesa espera na formação; o ataque espera no pacote; conversão é do ataque', () => {
    expect(panelMode(apply(phase(makeView({ you: 'B', side: 'defense' }))), T0)).toBe('WAIT_OPPONENT');
    expect(panelMode(apply(phase(makeView({ you: 'B', side: 'defense', phase: 'PACKAGE' }))), T0)).toBe('PICK_PACKAGE');
    expect(panelMode(apply(phase(makeView({ phase: 'PACKAGE' }))), T0)).toBe('WAIT_OPPONENT');
    expect(panelMode(apply(phase(makeView({ phase: 'CONVERSION' }))), T0)).toBe('PICK_CONVERSION');
  });
});

describe('resultado e animação', () => {
  it('anima a partir do estado pré-jogada e atualiza o pós-jogada', () => {
    const s = untilResult();
    expect(s.animation?.stage.ballOn).toBe(25);
    expect(s.animation?.stage.lineups).toEqual({ offense: offLineup, defense: defLineup });
    expect(s.animation?.steps.length).toBeGreaterThan(0);
    expect(s.stage?.ballOn).toBe(30);
    expect(s.reveal).toEqual({ offense: 'basic_run', defense: 'basic_defense', read: 'NEUTRAL' });
    expect(s.log.map((l) => l.text)).toContain('Ganho de 5 jardas!');
    expect(isAnimating(s, T0 + 10)).toBe(true);
    expect(panelMode(s, T0 + 10)).toBe('ANIMATING');
  });

  it('match:phase chegando durante a animação não a interrompe', () => {
    const s = untilResult();
    const s2 = matchReducer(s, phase(nextView, T0 + 9000));
    expect(s2.animation).toBe(s.animation);
    expect(s2.view?.turnId).toBe(2);
    expect(panelMode(s2, T0 + 100)).toBe('ANIMATING');
    const end = s.animation!.endsAt;
    expect(panelMode(s2, end)).toBe('PICK_FORMATION');
    expect(timerSeconds(s2, end)).toBeGreaterThan(0);
  });

  it('o timer some quando a view já é de outro turno que a última fase', () => {
    expect(timerSeconds(untilResult(), T0)).toBeNull();
  });

  it('resultado reenviado (reconexão) não duplica o log nem reinicia a animação', () => {
    const s = untilResult();
    expect(matchReducer(s, result())).toBe(s);
  });

  it('punt e field goal não mostram leitura', () => {
    const s = matchReducer(
      apply(phase(playcallView())),
      result(1, [{ t: 'CARDS', offense: 'punt', defense: 'basic_defense', read: 'NEUTRAL' }, { t: 'PUNT', distance: 40 }]),
    );
    expect(s.reveal).toEqual({ offense: 'punt', defense: 'basic_defense', read: null });
  });

  it('match:end durante a animação final só mostra o fim depois dela', () => {
    const s = matchReducer(untilResult(), { type: 'END', msg: endMessage });
    expect(showEndScreen(s, T0 + 10)).toBe(false);
    expect(showEndScreen(s, s.animation!.endsAt)).toBe(true);
    expect(panelMode(s, s.animation!.endsAt)).toBe('ENDED');
  });
});

describe('envio de carta', () => {
  it('carta não jogável, clique duplo e fase errada não são enviados', () => {
    const s = apply(phase(playcallView()));
    expect(canSubmitCard(s, 'normal_tackle', T0)).toBe(false);
    expect(canSubmitCard(s, 'basic_run', T0)).toBe(true);
    const sent = matchReducer(s, { type: 'SENT', turnId: 1, phase: 'PLAYCALL' });
    expect(canSubmitCard(sent, 'basic_run', T0)).toBe(false);
    expect(panelMode(sent, T0)).toBe('WAIT_OPPONENT');
    expect(canSubmitCard(apply(phase(playcallView({ yourCard: 'basic_run' }))), 'basic_pass', T0)).toBe(false);
    expect(canSubmitCard(apply(phase(makeView({ playable: ['basic_run'] }))), 'basic_run', T0)).toBe(false);
  });

  it('STALE_TURN libera o reenvio depois que o servidor reenvia a fase', () => {
    const sent = matchReducer(apply(phase(playcallView())), { type: 'SENT', turnId: 1, phase: 'PLAYCALL' });
    const stale = matchReducer(sent, { type: 'ERROR', error: { code: 'STALE_TURN', message: '' } });
    expect(canSubmitCard(stale, 'basic_run', T0)).toBe(true);
  });

  it('NOT_READY libera o reenvio (partida pausada ou encerrada)', () => {
    const sent = matchReducer(apply(phase(playcallView())), { type: 'SENT', turnId: 1, phase: 'PLAYCALL' });
    const notReady = matchReducer(sent, { type: 'ERROR', error: { code: 'NOT_READY', message: '' } });
    expect(canSubmitCard(notReady, 'basic_run', T0)).toBe(true);
  });

  it('a mão mostra cópias repetidas, básicas fora da mão e especiais só quando jogáveis', () => {
    const view = makeView({ phase: 'PLAYCALL', hand: ['normal_tackle', 'normal_tackle'], playable: ['basic_run', 'normal_tackle'] });
    const entries = handEntries(view);
    expect(entries.map((e) => e.cardId)).toEqual(['normal_tackle', 'normal_tackle', 'basic_run', 'basic_pass']);
    expect(new Set(entries.map((e) => e.key)).size).toBe(4);
    expect(entries.find((e) => e.cardId === 'basic_pass')?.playable).toBe(false);
    const fourth = handEntries({ ...view, playable: [...view.playable, 'punt', 'field_goal'] });
    expect(fourth.filter((e) => e.source === 'SPECIAL').map((e) => e.cardId)).toEqual(['punt', 'field_goal']);
    const defense = handEntries(makeView({ side: 'defense', hand: ['ground_dig'], playable: ['basic_defense'] }));
    expect(defense.map((e) => e.cardId)).toEqual(['ground_dig', 'basic_defense']);
  });
});

describe('aba recarregada', () => {
  it('pede resync só quando a sala está em partida e ainda não há view', () => {
    expect(needsResync('IN_MATCH', initialMatchState())).toBe(true);
    expect(needsResync('PAUSED', initialMatchState())).toBe(true);
    expect(needsResync('WAITING', initialMatchState())).toBe(false);
    expect(needsResync(null, initialMatchState())).toBe(false);
    expect(needsResync('IN_MATCH', apply(phase(makeView())))).toBe(false);
    expect(needsResync('IN_MATCH', apply({ type: 'END', msg: endMessage }))).toBe(false);
  });

  it('um único match:phase reconstrói a tela, mesmo sem as revelações perdidas', () => {
    const s = apply(phase(playcallView()));
    expect(s.stage?.lineups).toEqual({ offense: offLineup, defense: defLineup });
    expect(panelMode(s, T0)).toBe('PICK_CARD');
  });

  it('RESET volta ao estado inicial', () => {
    expect(matchReducer(untilResult(), { type: 'RESET' })).toEqual(initialMatchState());
  });
});
