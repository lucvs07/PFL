import { validateTeam, type Team, type TeamError, type TeamKey } from '@pfl/engine';
import { decodeTeam, type ErrorCode, type RoomState, type RoomStatus } from '@pfl/protocol';
import { MatchSession } from './match-session';
import type { Outgoing, Send } from './outgoing';
import type { PlayRequest } from './parse';
import type { Scheduler, Timings } from './timings';

const KEYS: readonly TeamKey[] = ['A', 'B'];
const TEAM_NAME_MAX = 40;
const SEED_RANGE = 0x7fffffff;

interface Seat {
  key: TeamKey;
  token: string;
  connId: string | null;
  /** tolerância de reconexão esgotada */
  absent: boolean;
  ready: boolean;
  /** só guarda time válido */
  team: Team | null;
  teamName: string | null;
  teamErrors: TeamError[];
  cancelGrace: (() => void) | null;
  graceEndsAt: number | null;
  /** tolerância restante, guardada enquanto a sala está pausada */
  graceRemaining: number | null;
}

export interface RoomDeps {
  scheduler: Scheduler;
  timings: Timings;
  /** seed da partida (o servidor pode usar Math.random; o motor, não) */
  random: () => number;
  newToken: () => string;
  /** só é chamado para vagas conectadas */
  send: Send;
  onClose: () => void;
}

/** Sala em memória (spec 7.1/8): duas vagas com token, lobby, partida e política de desconexão. */
export class Room {
  private readonly seats: Partial<Record<TeamKey, Seat>> = {};
  private roomStatus: RoomStatus = 'WAITING';
  private matchSession: MatchSession | null = null;
  private cancelClose: (() => void) | null = null;
  private closed = false;

  constructor(readonly code: string, private readonly deps: RoomDeps) {}

  get status(): RoomStatus {
    return this.roomStatus;
  }
  get session(): MatchSession | null {
    return this.matchSession;
  }
  get isClosed(): boolean {
    return this.closed;
  }
  connectionOf(key: TeamKey): string | null {
    return this.seats[key]?.connId ?? null;
  }
  tokenOf(key: TeamKey): string | null {
    return this.seats[key]?.token ?? null;
  }

  /** Token da própria sala → a mesma vaga. Sem token (ou com token alheio) → vaga livre no lobby, ou null (cheia). */
  claimSeat(token?: unknown): { key: TeamKey; token: string } | null {
    if (this.closed) return null;
    if (typeof token === 'string') {
      const seat = this.seatList().find((s) => s.token === token);
      if (seat) return { key: seat.key, token: seat.token };
    }
    if (this.roomStatus !== 'WAITING') return null;
    const key = KEYS.find((k) => !this.seats[k]);
    if (!key) return null;
    const seat: Seat = {
      key,
      token: this.deps.newToken(),
      connId: null,
      absent: false,
      ready: false,
      team: null,
      teamName: null,
      teamErrors: [],
      cancelGrace: null,
      graceEndsAt: null,
      graceRemaining: null,
    };
    this.seats[key] = seat;
    return { key, token: seat.token };
  }

  connect(key: TeamKey, connId: string): string | null {
    const seat = this.seats[key];
    if (this.closed || !seat) return null;
    const previous = seat.connId;
    seat.connId = connId;
    seat.absent = false;
    this.clearGrace(seat);
    if (this.roomStatus !== 'FINISHED') this.clearCloseTimer();
    const wasPaused = this.roomStatus === 'PAUSED';
    if (wasPaused) this.roomStatus = 'IN_MATCH';
    this.broadcastState();
    if (wasPaused) {
      this.resumeGraces();
      this.matchSession?.resume();
    } else if (this.matchSession) {
      this.matchSession.refreshAbsence();
      this.matchSession.sendCurrent(key);
    }
    this.tryStart();
    return previous !== null && previous !== connId ? previous : null;
  }

  disconnect(key: TeamKey, connId: string): void {
    const seat = this.seats[key];
    if (this.closed || !seat || seat.connId !== connId) return; // socket antigo depois de uma troca de conexão
    seat.connId = null;
    const nobody = this.seatList().every((s) => s.connId === null);
    if (this.roomStatus === 'IN_MATCH') {
      if (nobody) {
        this.roomStatus = 'PAUSED';
        this.pauseGraces();
        seat.graceRemaining = seat.absent ? null : this.deps.timings.reconnectGraceMs;
        this.matchSession?.pause();
        this.scheduleClose();
      } else {
        this.startGrace(seat, this.deps.timings.reconnectGraceMs);
      }
    } else if (this.roomStatus === 'WAITING' && nobody) {
      this.scheduleClose();
    }
    this.broadcastState();
  }

  submitTeam(key: TeamKey, teamCode: unknown): void {
    const seat = this.seats[key];
    if (this.closed || !seat) return;
    if (this.roomStatus !== 'WAITING') return this.error(key, 'NOT_READY', 'A partida já começou');
    seat.ready = false;
    const decoded = typeof teamCode === 'string' ? decodeTeam(teamCode) : null;
    if (decoded === null) {
      seat.team = null;
      seat.teamName = null;
      seat.teamErrors = [{ code: 'MALFORMED_TEAM' }];
      this.error(key, 'INVALID_TEAM_CODE', 'Código de time ilegível');
    } else {
      const errors = validateTeam(decoded);
      const name =
        typeof decoded === 'object' && typeof (decoded as Record<string, unknown>).name === 'string'
          ? ((decoded as Record<string, unknown>).name as string).slice(0, TEAM_NAME_MAX)
          : null;
      seat.team = errors.length === 0 ? (decoded as Team) : null;
      seat.teamName = name;
      seat.teamErrors = errors;
    }
    this.broadcastState();
  }

  setReady(key: TeamKey, ready: unknown): void {
    const seat = this.seats[key];
    if (this.closed || !seat) return;
    if (this.roomStatus !== 'WAITING') return this.error(key, 'NOT_READY', 'A partida já começou');
    const wants = ready === true;
    if (wants && !seat.team) return this.error(key, 'TEAM_INVALID', 'Envie um time válido antes de ficar pronto');
    seat.ready = wants;
    this.broadcastState();
    this.tryStart();
  }

  play(key: TeamKey, req: PlayRequest): void {
    if (this.closed || !this.seats[key]) return;
    if (!this.matchSession) return this.error(key, 'NOT_READY', 'A partida ainda não começou');
    this.matchSession.handle(key, req);
  }

  resync(key: TeamKey): void {
    if (this.closed || !this.seats[key]) return;
    this.sendState(key);
    this.matchSession?.sendCurrent(key);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.clearCloseTimer();
    for (const s of this.seatList()) this.clearGrace(s);
    this.matchSession?.dispose();
    this.deps.onClose();
  }

  private seatList(): Seat[] {
    return KEYS.flatMap((k) => {
      const s = this.seats[k];
      return s ? [s] : [];
    });
  }

  private sendTo(to: TeamKey, msg: Outgoing): void {
    const seat = this.seats[to];
    if (seat && seat.connId !== null) this.deps.send(to, msg);
  }

  private error(to: TeamKey, code: ErrorCode, message: string): void {
    this.sendTo(to, { event: 'error', payload: { code, message } });
  }

  private stateFor(you: TeamKey): RoomState {
    return {
      code: this.code,
      you,
      status: this.roomStatus,
      players: this.seatList().map((s) => ({
        key: s.key,
        connected: s.connId !== null,
        ready: s.ready,
        teamName: s.teamName,
        teamErrors: s.teamErrors,
      })),
    };
  }

  private sendState(key: TeamKey): void {
    this.sendTo(key, { event: 'room:state', payload: this.stateFor(key) });
  }

  private broadcastState(): void {
    for (const s of this.seatList()) this.sendState(s.key);
  }

  private tryStart(): void {
    if (this.closed || this.roomStatus !== 'WAITING') return;
    const a = this.seats.A;
    const b = this.seats.B;
    if (!a || !b || !a.ready || !b.ready || !a.team || !b.team || a.connId === null || b.connId === null) return;
    const seed = Math.floor(this.deps.random() * SEED_RANGE);
    this.matchSession = new MatchSession({ A: a.team, B: b.team }, seed, {
      scheduler: this.deps.scheduler,
      timings: this.deps.timings,
      send: (to, msg) => this.sendTo(to, msg),
      isAbsent: (k) => this.seats[k]?.absent ?? false,
      onEnd: () => this.onMatchEnd(),
    });
    this.roomStatus = 'IN_MATCH';
    this.broadcastState();
    this.matchSession.start();
  }

  private onMatchEnd(): void {
    this.roomStatus = 'FINISHED';
    for (const s of this.seatList()) this.clearGrace(s);
    this.broadcastState();
    this.scheduleClose();
  }

  private startGrace(seat: Seat, ms: number): void {
    this.clearGrace(seat);
    seat.graceEndsAt = this.deps.scheduler.now() + ms;
    seat.cancelGrace = this.deps.scheduler.schedule(ms, () => {
      seat.cancelGrace = null;
      seat.graceEndsAt = null;
      seat.absent = true;
      this.matchSession?.refreshAbsence();
    });
  }

  private clearGrace(seat: Seat): void {
    seat.cancelGrace?.();
    seat.cancelGrace = null;
    seat.graceEndsAt = null;
    seat.graceRemaining = null;
  }

  private pauseGraces(): void {
    const now = this.deps.scheduler.now();
    for (const s of this.seatList()) {
      if (s.cancelGrace && s.graceEndsAt !== null) {
        const remaining = Math.max(0, s.graceEndsAt - now);
        s.cancelGrace();
        s.cancelGrace = null;
        s.graceEndsAt = null;
        s.graceRemaining = remaining;
      }
    }
  }

  private resumeGraces(): void {
    for (const s of this.seatList()) {
      if (s.connId === null && s.graceRemaining !== null) {
        const ms = s.graceRemaining;
        this.startGrace(s, ms);
      }
    }
  }

  private scheduleClose(): void {
    this.clearCloseTimer();
    this.cancelClose = this.deps.scheduler.schedule(this.deps.timings.bothDisconnectedCloseMs, () => {
      this.cancelClose = null;
      this.close();
    });
  }

  private clearCloseTimer(): void {
    this.cancelClose?.();
    this.cancelClose = null;
  }
}
