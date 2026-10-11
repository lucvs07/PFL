import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { replay, type Team, type TeamKey } from '@pfl/engine';
import { computeStats, type EndMessage } from '@pfl/protocol';
import { MatchSession } from '../src/match-session';
import { realScheduler, resolveTimings, type TimingsInput } from '../src/timings';
import { electricTeam } from './fixtures';
import { failOnConsoleError, recorder } from './helpers';

const T0 = 1_000_000;
const KEYS = ['A', 'B'] as const;
const teams = (): Record<TeamKey, Team> => ({ A: electricTeam('A'), B: electricTeam('B') });

function setup(opts: { absent?: TeamKey[]; timings?: TimingsInput } = {}) {
  const rec = recorder();
  const absent = new Set<TeamKey>(opts.absent ?? []);
  const ends: EndMessage[] = [];
  const session = new MatchSession(teams(), 42, {
    scheduler: realScheduler,
    timings: resolveTimings(opts.timings),
    send: rec.send,
    isAbsent: (k) => absent.has(k),
    onEnd: (e) => {
      ends.push(e);
    },
  });
  return { session, rec, absent, ends };
}

failOnConsoleError();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('início e loop da jogada', () => {
  it('envia FORMATION aos dois, com deadline de 5 s e a visão de cada um', () => {
    const { session, rec } = setup();
    session.start();
    for (const k of KEYS) {
      const phase = rec.last(k, 'match:phase')!;
      expect(phase.phase).toBe('FORMATION');
      expect(phase.turnId).toBe(session.state.turnId);
      expect(phase.deadline).toBe(T0 + 5000);
      expect(phase.view.you).toBe(k);
      expect(phase.view.canEditDepth).toBe(true);
    }
    expect(rec.last('A', 'match:phase')!.view.side).toBe('offense');
    expect(rec.last('B', 'match:phase')!.view.side).toBe('defense');
  });

  it('segue a ordem do contrato num snap completo', () => {
    const { session, rec } = setup();
    session.start();
    const turnId = session.state.turnId;
    session.handle('A', { kind: 'formation', turnId, formation: 'PISTOL' });
    session.handle('B', { kind: 'package', turnId, package: 'BASE' });
    session.handle('A', { kind: 'card', turnId, cardId: 'basic_run' });
    session.handle('B', { kind: 'card', turnId, cardId: 'basic_defense' });
    expect(rec.events('A')).toEqual([
      'match:phase', // FORMATION
      'match:reveal', // evento FORMATION
      'match:phase', // PACKAGE
      'match:reveal', // evento PACKAGE
      'match:phase', // PLAYCALL
      'match:phase', // PLAYCALL de novo: A escolheu (mesmo turnId/fase, visão atualizada)
      'match:result',
      'match:phase', // próximo snap
    ]);
    const [formationReveal, packageReveal] = rec.all('B', 'match:reveal');
    expect(formationReveal.events.map((e) => e.t)).toEqual(['FORMATION']);
    expect(packageReveal.events.map((e) => e.t)).toEqual(['PACKAGE']);
    const result = rec.last('B', 'match:result')!;
    expect(result.turnId).toBe(turnId);
    expect(result.events.map((e) => e.t)).toEqual(expect.arrayContaining(['CARDS', 'PLAY']));
    expect(result.view.you).toBe('B');
    const next = rec.last('A', 'match:phase')!;
    expect(next.turnId).toBeGreaterThan(turnId);
    expect(next.deadline).toBe(T0 + 4500 + 5000);
  });

  it('quando um lado escolhe a carta, o outro vê só que ele escolheu', () => {
    const { session, rec } = setup();
    session.start();
    const turnId = session.state.turnId;
    session.handle('A', { kind: 'formation', turnId, formation: 'PISTOL' });
    session.handle('B', { kind: 'package', turnId, package: 'BASE' });
    session.handle('A', { kind: 'card', turnId, cardId: 'basic_pass' });
    const phaseB = rec.last('B', 'match:phase')!;
    expect(phaseB.phase).toBe('PLAYCALL');
    expect(phaseB.deadline).toBe(T0 + 8000);
    expect(phaseB.view.opponentHasChosen).toBe(true);
    expect(JSON.stringify(phaseB)).not.toContain('basic_pass');
    expect(rec.last('A', 'match:phase')!.view.yourCard).toBe('basic_pass');
  });
});

describe('ações inválidas', () => {
  it('turnId antigo: STALE_TURN e reenvio do match:phase atual', () => {
    const { session, rec } = setup();
    session.start();
    rec.clear();
    session.handle('A', { kind: 'formation', turnId: session.state.turnId + 1, formation: 'PISTOL' });
    expect(rec.events('A')).toEqual(['error', 'match:phase']);
    expect(rec.last('A', 'error')!.code).toBe('STALE_TURN');
    expect(rec.events('B')).toEqual([]);
    expect(session.actions).toEqual([]);
  });

  it('ação do time errado: ENGINE_ERROR com o código do motor, estado intacto', () => {
    const { session, rec } = setup();
    session.start();
    const before = structuredClone(session.state);
    session.handle('B', { kind: 'formation', turnId: session.state.turnId, formation: 'PISTOL' });
    expect(rec.last('B', 'error')).toEqual({ code: 'ENGINE_ERROR', message: 'WRONG_TEAM' });
    expect(session.state).toEqual(before);
    expect(session.actions).toEqual([]);
  });

  it('carta repetida: ALREADY_CHOSEN', () => {
    const { session, rec } = setup();
    session.start();
    const turnId = session.state.turnId;
    session.handle('A', { kind: 'formation', turnId, formation: 'PISTOL' });
    session.handle('B', { kind: 'package', turnId, package: 'BASE' });
    session.handle('A', { kind: 'card', turnId, cardId: 'basic_run' });
    session.handle('A', { kind: 'card', turnId, cardId: 'basic_pass' });
    expect(rec.last('A', 'error')!.message).toMatch(/ALREADY_CHOSEN/);
    expect(session.actions).toHaveLength(3);
  });
});

describe('a sessão se protege sozinha', () => {
  it('antes do start: handle responde NOT_READY e sendCurrent não envia nada', () => {
    const { session, rec } = setup();
    vi.advanceTimersByTime(60_000);
    session.handle('A', { kind: 'formation', turnId: session.state.turnId, formation: 'PISTOL' });
    expect(rec.last('A', 'error')!.code).toBe('NOT_READY');
    expect(rec.events('B')).toEqual([]);
    expect(session.actions).toEqual([]);
    rec.clear();
    session.sendCurrent('A');
    expect(rec.sent).toEqual([]);
  });

  it('pausada: handle responde NOT_READY (Partida pausada) sem chamar o motor', () => {
    const { session, rec } = setup();
    session.start();
    session.pause();
    rec.clear();
    session.handle('A', { kind: 'formation', turnId: session.state.turnId, formation: 'PISTOL' });
    expect(rec.last('A', 'error')).toEqual({ code: 'NOT_READY', message: 'Partida pausada' });
    expect(rec.events('A')).toEqual(['error']);
    expect(session.actions).toEqual([]);
  });

  it('depois de dispose: nada é enviado nem muda, e start/resume/refreshAbsence são no-op', () => {
    const { session, rec } = setup();
    session.start();
    session.dispose();
    rec.clear();
    const before = structuredClone(session.state);
    session.handle('A', { kind: 'formation', turnId: session.state.turnId, formation: 'PISTOL' });
    session.start();
    session.resume();
    session.refreshAbsence();
    vi.advanceTimersByTime(60_000);
    expect(rec.sent).toEqual([]);
    expect(session.actions).toEqual([]);
    expect(session.state).toEqual(before);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('timers e padrões de timeout', () => {
  it('o servidor aplica TIMEOUT quando o deadline expira', () => {
    const { session, rec } = setup();
    session.start();
    vi.advanceTimersByTime(4999);
    expect(rec.all('B', 'match:reveal')).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(rec.last('B', 'match:reveal')!.events[0]).toMatchObject({ t: 'FORMATION', formation: 'PISTOL' });
    expect(session.actions).toEqual([{ type: 'TIMEOUT' }]);
    expect(rec.last('B', 'match:phase')!.deadline).toBe(T0 + 5000 + 4000);
  });

  it('ação que chega depois do deadline, antes do timer disparar: o padrão vale e a ação é rejeitada', () => {
    const { session, rec } = setup();
    session.start();
    const turnId = session.state.turnId;
    vi.setSystemTime(T0 + 5001); // o relógio passou do deadline, mas o callback do timer ainda não rodou
    session.handle('A', { kind: 'formation', turnId, formation: 'HEAVY' });
    expect(rec.all('B', 'match:reveal')).toHaveLength(1);
    expect(rec.last('B', 'match:reveal')!.events[0]).toMatchObject({ t: 'FORMATION', formation: 'PISTOL' });
    expect(rec.last('A', 'error')).toMatchObject({ code: 'ENGINE_ERROR', message: expect.stringMatching(/WRONG_PHASE/) });
    expect(session.actions).toEqual([{ type: 'TIMEOUT' }]);
    vi.advanceTimersByTime(0);
    expect(rec.all('B', 'match:reveal')).toHaveLength(1); // o timer antigo não dispara um segundo TIMEOUT
  });

  it('com a tolerância esgotada, a etapa de quem está ausente expira assim que começa', () => {
    const { session, rec } = setup({ absent: ['A'] });
    session.start();
    expect(rec.last('B', 'match:phase')!.deadline).toBe(T0);
    vi.advanceTimersByTime(1);
    expect(rec.last('B', 'match:reveal')!.events[0]).toMatchObject({ t: 'FORMATION', formation: 'PISTOL' });
    const turnId = session.state.turnId;
    const pkg = rec.last('B', 'match:phase')!;
    expect(pkg.phase).toBe('PACKAGE');
    expect(pkg.deadline).toBe(T0 + 4000); // B está presente: timer normal (o TIMEOUT disparou em T0)
    session.handle('B', { kind: 'package', turnId, package: 'NICKEL' });
    expect(rec.last('B', 'match:phase')!.deadline).toBe(T0 + 1 + 8000); // PLAYCALL: B ainda precisa agir
    session.handle('B', { kind: 'card', turnId, cardId: 'basic_defense' });
    expect(rec.last('B', 'match:phase')!.deadline).toBe(T0 + 1); // falta só A, que está ausente
    vi.advanceTimersByTime(1);
    expect(rec.last('B', 'match:result')!.events.find((e) => e.t === 'CARDS')).toMatchObject({
      offense: 'basic_run',
      defense: 'basic_defense',
    });
  });

  it('refreshAbsence antecipa o deadline e avisa os dois', () => {
    const { session, rec, absent } = setup();
    session.start();
    vi.advanceTimersByTime(1000);
    absent.add('A');
    session.refreshAbsence();
    expect(rec.last('A', 'match:phase')!.deadline).toBe(T0 + 1000);
    expect(rec.last('B', 'match:phase')!.deadline).toBe(T0 + 1000);
    vi.advanceTimersByTime(1);
    expect(rec.all('B', 'match:reveal')).toHaveLength(1);
  });

  it('quando o ausente volta, o deadline volta ao cheio e os dois são avisados', () => {
    const { session, rec, absent } = setup();
    session.start();
    vi.advanceTimersByTime(1000);
    absent.add('A');
    session.refreshAbsence();
    expect(rec.last('A', 'match:phase')!.deadline).toBe(T0 + 1000);
    rec.clear();
    absent.delete('A');
    session.refreshAbsence();
    for (const k of KEYS) expect(rec.last(k, 'match:phase')!.deadline).toBe(T0 + 5000);
    expect(session.deadline).toBe(T0 + 5000);
    vi.advanceTimersByTime(3999);
    expect(rec.all('B', 'match:reveal')).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(rec.all('B', 'match:reveal')).toHaveLength(1);
  });

  it('pause congela o timer; resume continua com o tempo restante', () => {
    const { session, rec } = setup();
    session.start();
    vi.advanceTimersByTime(2000);
    session.pause();
    expect(session.paused).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(session.actions).toEqual([]);
    session.resume();
    expect(session.paused).toBe(false);
    expect(rec.last('A', 'match:phase')!.deadline).toBe(T0 + 62_000 + 3000);
    vi.advanceTimersByTime(2999);
    expect(session.actions).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(session.actions).toEqual([{ type: 'TIMEOUT' }]);
  });
});

describe('ajuste do depth chart (team:depth)', () => {
  it('aceita no primeiro snap, confirma reenviando a fase só para quem pediu e entra no log', () => {
    const { session, rec } = setup();
    session.start();
    const turnId = session.state.turnId;
    const depth = { ...electricTeam().depth, QB: [54, 63] };
    rec.clear();
    session.handle('A', { kind: 'depth', turnId, depth, keepOnField: [25] });
    expect(rec.events('A')).toEqual(['match:phase']);
    expect(rec.last('A', 'match:phase')!.deadline).toBe(T0 + 5000);
    expect(rec.events('B')).toEqual([]);
    expect(session.actions).toEqual([{ type: 'SET_DEPTH', team: 'A', depth, keepOnField: [25] }]);
    session.handle('A', { kind: 'formation', turnId, formation: 'PISTOL' });
    expect(rec.last('B', 'match:reveal')!.events[0]).toMatchObject({ t: 'FORMATION', lineup: { QB: 54 } });
  });

  it('depth inválido → INVALID_DEPTH; depois da formação → DEPTH_LOCKED', () => {
    const { session, rec } = setup();
    session.start();
    const turnId = session.state.turnId;
    session.handle('A', { kind: 'depth', turnId, depth: { ...electricTeam().depth, QB: [150] }, keepOnField: [] });
    expect(rec.last('A', 'error')!.message).toMatch(/INVALID_DEPTH/);
    session.handle('A', { kind: 'formation', turnId, formation: 'PISTOL' });
    session.handle('B', { kind: 'depth', turnId, depth: electricTeam().depth, keepOnField: [] });
    expect(rec.last('B', 'error')!.message).toMatch(/DEPTH_LOCKED/);
    expect(session.actions).toHaveLength(1);
  });
});

describe('log de SET_DEPTH', () => {
  it('três depths do mesmo time na janela deixam só o último no log', () => {
    const { session } = setup();
    session.start();
    const turnId = session.state.turnId;
    const d = (qb: number[]) => ({ ...electricTeam().depth, QB: qb });
    session.handle('A', { kind: 'depth', turnId, depth: d([54, 63]), keepOnField: [] });
    session.handle('A', { kind: 'depth', turnId, depth: d([63, 54]), keepOnField: [25] });
    session.handle('A', { kind: 'depth', turnId, depth: d([54]), keepOnField: [26] });
    expect(session.actions).toEqual([{ type: 'SET_DEPTH', team: 'A', depth: d([54]), keepOnField: [26] }]);
    expect(replay(teams().A, teams().B, session.seed, session.actions).state).toEqual(session.state);
  });

  it('A, B, A: um SET_DEPTH por time (o último de cada)', () => {
    const { session } = setup();
    session.start();
    const turnId = session.state.turnId;
    const d = (qb: number[]) => ({ ...electricTeam().depth, QB: qb });
    session.handle('A', { kind: 'depth', turnId, depth: d([54, 63]), keepOnField: [] });
    session.handle('B', { kind: 'depth', turnId, depth: d([63, 54]), keepOnField: [] });
    session.handle('A', { kind: 'depth', turnId, depth: d([54]), keepOnField: [25] });
    const sets = session.actions.filter((a) => a.type === 'SET_DEPTH');
    expect(sets).toHaveLength(2);
    expect(sets).toContainEqual({ type: 'SET_DEPTH', team: 'A', depth: d([54]), keepOnField: [25] });
    expect(sets).toContainEqual({ type: 'SET_DEPTH', team: 'B', depth: d([63, 54]), keepOnField: [] });
    expect(replay(teams().A, teams().B, session.seed, session.actions).state).toEqual(session.state);
  });
});

describe('fim de partida', () => {
  it('uma partida só de timeouts termina com match:end, stats e replay reproduzível', () => {
    const { session, rec, ends } = setup({ timings: { resultAnimationMs: 0 } });
    session.start();
    for (let i = 0; i < 10_000 && !session.finished; i++) vi.advanceTimersToNextTimer();
    expect(session.finished).toBe(true);
    expect(ends).toHaveLength(1);
    const end = ends[0];
    expect(end.score).toEqual(session.state.score);
    expect(end.score.A).not.toBe(end.score.B);
    expect(end.replay.seed).toBe(42);
    expect(end.replay.teams).toEqual(teams());
    expect(end.replay.actions.every((a) => a.type === 'TIMEOUT')).toBe(true);
    const replayed = replay(end.replay.teams.A, end.replay.teams.B, end.replay.seed, end.replay.actions);
    expect(replayed.state).toEqual(session.state);
    expect(end.stats).toEqual(computeStats(replayed.events));
    for (const k of KEYS) {
      expect(rec.events(k).at(-1)).toBe('match:end');
      expect(rec.events(k).at(-2)).toBe('match:result');
      expect(rec.last(k, 'match:end')).toEqual(end);
    }
  });

  it('depois do fim, ações recebem STALE_TURN e o match:end é reenviado; resync também', () => {
    const { session, rec } = setup({ timings: { resultAnimationMs: 0 } });
    session.start();
    for (let i = 0; i < 10_000 && !session.finished; i++) vi.advanceTimersToNextTimer();
    rec.clear();
    session.handle('A', { kind: 'formation', turnId: 1, formation: 'PISTOL' });
    expect(rec.events('A')).toEqual(['error', 'match:end']);
    session.sendCurrent('B');
    expect(rec.events('B')).toEqual(['match:end']);
  });
});
