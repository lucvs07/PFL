// @vitest-environment jsdom
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import type { GameEvent } from '@pfl/engine';
import type { EndMessage, RoomState } from '@pfl/protocol';
import type { Screen } from '../src/app/screen';
import { useGameAudio } from '../src/audio/useGameAudio';
import { initialMatchState, matchReducer, type MatchClientState, type MatchInput } from '../src/match/matchState';
import { makeView } from './fixtures';

const fake = vi.hoisted(() => ({
  unlock: vi.fn(),
  play: vi.fn(),
  playCues: vi.fn(),
  playTimeline: vi.fn(),
  setMusic: vi.fn(),
  playJingle: vi.fn(),
  setVolume: vi.fn(),
  setMuted: vi.fn(),
  setHidden: vi.fn(),
  getState: vi.fn(),
  subscribe: vi.fn(),
}));
vi.mock('../src/audio/index', () => ({ audio: fake }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const room = (you: 'A' | 'B' = 'A'): RoomState => ({ code: 'ABCDEF', you, status: 'IN_MATCH', players: [] });
const NOW = 1_000_000;

interface Props {
  screen: Screen;
  match: MatchClientState;
  room: RoomState | null;
  notice: string | null;
  now: number;
}
const props = (over: Partial<Props> = {}): Props => ({ screen: 'HOME', match: initialMatchState(), room: null, notice: null, now: NOW, ...over });
const mount = (initial: Props, strict = false) =>
  renderHook((p: Props) => useGameAudio(p), { initialProps: initial, ...(strict ? { wrapper: StrictMode } : {}) });

const apply = (...inputs: MatchInput[]) => inputs.reduce(matchReducer, initialMatchState());
const phase = (over = {}): MatchInput => {
  const view = makeView(over);
  return { type: 'PHASE', msg: { turnId: view.turnId, phase: view.phase, deadline: NOW + 5000, view } };
};
const playEvents = (read: 'RIGHT' | 'NEUTRAL' | 'WRONG' = 'NEUTRAL'): GameEvent[] => [
  { t: 'CARDS', offense: 'basic_run', defense: 'basic_defense', read },
  {
    t: 'PLAY',
    outcome: {
      kind: 'GAIN', yards: 5, bigPlay: false, read, offActors: [25, 95, 74, 66], defActors: [95, 74, 50, 66],
      offTypeMult: 1, defTypeMult: 1, readFactor: 1, statFactor: 1, varianceFactor: 1,
    },
  },
];
/** o `now` do RESULT é o relógio real: o hook descarta animações velhas demais */
const result = (turnId: number, events = playEvents()): MatchInput => ({
  type: 'RESULT', msg: { turnId, events, view: makeView({ turnId: turnId + 1 }) }, now: Date.now(),
});
const end = (score: { A: number; B: number }): MatchInput => ({
  type: 'END', msg: { score, stats: { pokemon: [], teams: {} } as unknown as EndMessage['stats'], replay: { seed: 1, actions: [] } as unknown as EndMessage['replay'] },
});

describe('useGameAudio: navegador', () => {
  it('o primeiro gesto desbloqueia o áudio, e desmontar remove o ouvinte', () => {
    const { unmount } = mount(props());
    window.dispatchEvent(new Event('pointerdown'));
    expect(fake.unlock).toHaveBeenCalledTimes(1);
    unmount();
    window.dispatchEvent(new Event('pointerdown'));
    expect(fake.unlock).toHaveBeenCalledTimes(1);
  });

  it('a aba oculta avisa o motor ao montar', () => {
    mount(props());
    expect(fake.setHidden).toHaveBeenCalledWith(document.hidden);
  });
});

describe('useGameAudio: música e jingle', () => {
  it('a música acompanha a tela', () => {
    const { rerender } = mount(props({ screen: 'HOME' }));
    expect(fake.setMusic).toHaveBeenLastCalledWith('menu');
    rerender(props({ screen: 'MATCH' }));
    expect(fake.setMusic).toHaveBeenLastCalledWith('match');
    rerender(props({ screen: 'END' }));
    expect(fake.setMusic).toHaveBeenLastCalledWith('menu');
  });

  it('ao entrar na tela de fim toca o jingle do placar, do ponto de vista de quem joga', () => {
    mount(props({ screen: 'END', match: apply(end({ A: 21, B: 14 })), room: room('B') }));
    expect(fake.playJingle).toHaveBeenCalledWith('lose');
  });

  it('vitória toca o jingle de vitória; empate não toca jingle', () => {
    mount(props({ screen: 'END', match: apply(end({ A: 21, B: 14 })), room: room('A') }));
    expect(fake.playJingle).toHaveBeenCalledWith('win');
    fake.playJingle.mockClear();
    mount(props({ screen: 'END', match: apply(end({ A: 7, B: 7 })), room: room('A') }));
    expect(fake.playJingle).not.toHaveBeenCalled();
  });
});

describe('useGameAudio: sons da jogada', () => {
  const withResult = (read: 'RIGHT' | 'NEUTRAL' | 'WRONG' = 'NEUTRAL') => apply(phase(), result(1, playEvents(read)));

  it('uma animação nova toca revelação, leitura e passos; rerender e StrictMode não repetem', () => {
    const match = withResult('RIGHT');
    const { rerender } = mount(props({ screen: 'MATCH', match, room: room('A') }), true);
    expect(fake.playCues).toHaveBeenCalledTimes(1);
    const cues = fake.playCues.mock.calls[0][0] as { cue: string }[];
    expect(cues[0].cue).toBe('reveal');
    expect(cues[1].cue).toBe('read-bad'); // jogador A ataca e a defesa acertou a leitura
    expect(cues.map((c) => c.cue)).toContain('snap');
    rerender(props({ screen: 'MATCH', match, room: room('A'), now: NOW + 200 }));
    rerender(props({ screen: 'MATCH', match, room: room('A'), notice: null }));
    expect(fake.playCues).toHaveBeenCalledTimes(1);
  });

  it('a segunda animação toca de novo; o lado de quem joga inverte a leitura', () => {
    const first = withResult('RIGHT');
    const { rerender } = mount(props({ screen: 'MATCH', match: first, room: room('B') }));
    expect((fake.playCues.mock.calls[0][0] as { cue: string }[])[1].cue).toBe('read-good'); // B defende
    const second = matchReducer(first, result(2, playEvents('WRONG')));
    rerender(props({ screen: 'MATCH', match: second, room: room('B') }));
    expect(fake.playCues).toHaveBeenCalledTimes(2);
  });

  it('sem sala não há lado: toca a revelação e não a leitura', () => {
    mount(props({ screen: 'MATCH', match: withResult('RIGHT'), room: null }));
    const names = (fake.playCues.mock.calls[0][0] as { cue: string }[]).map((c) => c.cue);
    expect(names).toContain('reveal');
    expect(names.some((n) => n.startsWith('read-'))).toBe(false);
  });
});

describe('useGameAudio: aviso de vez e erros', () => {
  it('toca o aviso ao entrar numa etapa em que o jogador escolhe, uma vez só', () => {
    const match = apply(phase());
    const { rerender } = mount(props({ screen: 'MATCH', match, room: room('A') }));
    expect(fake.play).toHaveBeenCalledWith('turn-start');
    rerender(props({ screen: 'MATCH', match, room: room('A'), now: NOW + 200 }));
    expect(fake.play.mock.calls.filter((c) => c[0] === 'turn-start')).toHaveLength(1);
  });

  it('fora da partida não toca o aviso de vez', () => {
    mount(props({ screen: 'LOBBY', match: apply(phase()), room: room('A') }));
    expect(fake.play).not.toHaveBeenCalledWith('turn-start');
  });

  it('erro do servidor e aviso na tela tocam o som de erro', () => {
    const withError = matchReducer(initialMatchState(), { type: 'ERROR', error: { code: 'STALE_TURN', message: 'jogada velha' } });
    mount(props({ match: withError }));
    expect(fake.play).toHaveBeenCalledWith('ui-error');
    fake.play.mockClear();
    mount(props({ notice: 'Sem resposta do servidor.' }));
    expect(fake.play).toHaveBeenCalledWith('ui-error');
  });
});
