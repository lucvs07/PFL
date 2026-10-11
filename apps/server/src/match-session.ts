import {
  EngineError, createMatch, playerView, step,
  type Action, type GameEvent, type MatchState, type StepResult, type Team, type TeamKey,
} from '@pfl/engine';
import { computeStats, type EndMessage, type ErrorCode } from '@pfl/protocol';
import type { Send } from './outgoing';
import { toAction, type PlayRequest } from './parse';
import type { Scheduler, TimedPhase, Timings } from './timings';

const KEYS: readonly TeamKey[] = ['A', 'B'];
const other = (k: TeamKey): TeamKey => (k === 'A' ? 'B' : 'A');

export interface SessionDeps {
  scheduler: Scheduler;
  timings: Timings;
  /** A Room filtra quem está desconectado. */
  send: Send;
  /** Tolerância de reconexão esgotada. */
  isAbsent: (key: TeamKey) => boolean;
  onEnd: (end: EndMessage) => void;
}

/**
 * Uma partida em andamento: o servidor é a autoridade (spec 7.1).
 * Guarda o estado do motor, o log de ações (replay) e os timers de etapa, e projeta a visão de cada jogador.
 */
export class MatchSession {
  private current: MatchState;
  private readonly log: Action[] = [];
  private readonly history: GameEvent[];
  private readonly teams: Record<TeamKey, Team>;
  /** muda a cada timer programado; um callback de timer antigo não faz nada */
  private phaseSeq = 0;
  /** início da etapa (depois da folga de animação) */
  private phaseStartsAt = 0;
  /** deadline cheio da etapa */
  private fullDeadline = 0;
  /** deadline efetivo: o cheio, ou o início da etapa se todos que faltam agir estão ausentes */
  private deadlineAt = 0;
  private cancelTimer: (() => void) | null = null;
  private pausedOffsets: { start: number; full: number } | null = null;
  private endMessage: EndMessage | null = null;

  constructor(teams: Record<TeamKey, Team>, readonly seed: number, private readonly deps: SessionDeps) {
    this.teams = structuredClone(teams);
    const created = createMatch(this.teams.A, this.teams.B, seed);
    this.current = created.state;
    this.history = [...created.events];
  }

  get state(): MatchState {
    return this.current;
  }
  get actions(): readonly Action[] {
    return this.log;
  }
  get events(): readonly GameEvent[] {
    return this.history;
  }
  get deadline(): number {
    return this.deadlineAt;
  }
  get finished(): boolean {
    return this.endMessage !== null;
  }
  get paused(): boolean {
    return this.pausedOffsets !== null;
  }

  start(): void {
    this.enterPhase(0);
  }

  handle(key: TeamKey, req: PlayRequest): void {
    if (this.pausedOffsets) return;
    this.expireIfDue();
    if (req.turnId !== this.current.turnId) {
      this.error(key, 'STALE_TURN', `turnId ${req.turnId} não é o turno atual (${this.current.turnId})`);
      this.sendCurrent(key);
      return;
    }
    this.apply(toAction(key, req), key);
  }

  sendCurrent(key: TeamKey): void {
    if (this.endMessage) {
      this.deps.send(key, { event: 'match:end', payload: this.endMessage });
      return;
    }
    const s = this.current;
    this.deps.send(key, {
      event: 'match:phase',
      payload: { turnId: s.turnId, phase: s.phase, deadline: this.deadlineAt, view: playerView(s, key) },
    });
  }

  pause(): void {
    if (this.endMessage || this.pausedOffsets) return;
    const now = this.deps.scheduler.now();
    this.pausedOffsets = {
      start: Math.max(0, this.phaseStartsAt - now),
      full: Math.max(0, this.fullDeadline - now),
    };
    this.clearTimer();
  }

  resume(): void {
    if (!this.pausedOffsets) return;
    const now = this.deps.scheduler.now();
    this.phaseStartsAt = now + this.pausedOffsets.start;
    this.fullDeadline = now + this.pausedOffsets.full;
    this.pausedOffsets = null;
    this.armTimer();
    for (const k of KEYS) this.sendCurrent(k);
  }

  refreshAbsence(): void {
    if (this.endMessage || this.pausedOffsets) return;
    const before = this.deadlineAt;
    this.armTimer();
    if (this.deadlineAt !== before) for (const k of KEYS) this.sendCurrent(k);
  }

  dispose(): void {
    this.clearTimer();
  }

  private apply(action: Action, from: TeamKey | null): void {
    const prev = this.current;
    let result: StepResult;
    try {
      result = step(prev, action);
    } catch (err) {
      if (!(err instanceof EngineError)) console.error('[pfl] erro inesperado do motor', err);
      if (from) this.error(from, 'ENGINE_ERROR', err instanceof EngineError ? err.message : 'Ação inválida');
      return;
    }
    this.current = result.state;
    this.log.push(action);
    this.history.push(...result.events);
    this.dispatch(prev, action, result.events, from);
  }

  private dispatch(prev: MatchState, action: Action, events: GameEvent[], from: TeamKey | null): void {
    const s = this.current;
    if (action.type === 'SET_DEPTH') {
      // confirmação: mesma etapa e mesmo deadline, só para quem pediu
      if (from) this.sendCurrent(from);
      return;
    }
    if (s.phase === 'MATCH_END') {
      this.clearTimer();
      this.sendResult(prev.turnId, events);
      this.finish();
      return;
    }
    if (s.turnId === prev.turnId && s.phase === prev.phase) {
      // PLAYCALL: um lado escolheu; o outro passa a ver opponentHasChosen
      this.armTimer();
      for (const k of KEYS) this.sendCurrent(k);
      return;
    }
    if (s.turnId === prev.turnId) {
      // FORMATION → PACKAGE ou PACKAGE → PLAYCALL
      for (const k of KEYS) this.deps.send(k, { event: 'match:reveal', payload: { turnId: prev.turnId, events } });
      this.enterPhase(0);
      return;
    }
    // jogada resolvida ou conversão
    this.sendResult(prev.turnId, events);
    this.enterPhase(events.length > 0 ? this.deps.timings.resultAnimationMs : 0);
  }

  private sendResult(turnId: number, events: GameEvent[]): void {
    for (const k of KEYS) {
      this.deps.send(k, { event: 'match:result', payload: { turnId, events, view: playerView(this.current, k) } });
    }
  }

  private enterPhase(delayMs: number): void {
    const now = this.deps.scheduler.now();
    this.phaseStartsAt = now + delayMs;
    this.fullDeadline = this.phaseStartsAt + this.deps.timings.phaseMs[this.current.phase as TimedPhase];
    this.armTimer();
    for (const k of KEYS) this.sendCurrent(k);
  }

  /** Quem ainda precisa agir na etapa atual. */
  private pendingActors(): TeamKey[] {
    const s = this.current;
    const defense = other(s.offense);
    switch (s.phase) {
      case 'FORMATION':
      case 'CONVERSION':
        return [s.offense];
      case 'PACKAGE':
        return [defense];
      case 'PLAYCALL':
        return [...(s.cards.offense === null ? [s.offense] : []), ...(s.cards.defense === null ? [defense] : [])];
      default:
        return [];
    }
  }

  private armTimer(): void {
    this.clearTimer();
    if (this.endMessage || this.pausedOffsets) return;
    const now = this.deps.scheduler.now();
    const pending = this.pendingActors();
    const allAbsent = pending.length > 0 && pending.every((k) => this.deps.isAbsent(k));
    this.deadlineAt = allAbsent ? Math.min(this.fullDeadline, Math.max(this.phaseStartsAt, now)) : this.fullDeadline;
    const seq = this.phaseSeq;
    this.cancelTimer = this.deps.scheduler.schedule(Math.max(0, this.deadlineAt - now), () => this.onDeadline(seq));
  }

  private clearTimer(): void {
    this.cancelTimer?.();
    this.cancelTimer = null;
    this.phaseSeq += 1;
  }

  private onDeadline(seq: number): void {
    if (seq !== this.phaseSeq || this.endMessage || this.pausedOffsets) return;
    this.cancelTimer = null;
    this.apply({ type: 'TIMEOUT' }, null);
  }

  /** Corrida entre a ação e o timer: se o deadline já passou, o padrão vale primeiro. */
  private expireIfDue(): void {
    if (this.endMessage || this.pausedOffsets) return;
    if (this.deps.scheduler.now() >= this.deadlineAt) this.onDeadline(this.phaseSeq);
  }

  private finish(): void {
    const s = this.current;
    this.endMessage = {
      score: { ...s.score },
      stats: computeStats(this.history),
      replay: { seed: this.seed, teams: structuredClone(this.teams), actions: structuredClone(this.log) },
    };
    for (const k of KEYS) this.deps.send(k, { event: 'match:end', payload: this.endMessage });
    this.deps.onEnd(this.endMessage);
  }

  private error(to: TeamKey, code: ErrorCode, message: string): void {
    this.deps.send(to, { event: 'error', payload: { code, message } });
  }
}
