import type { GameEvent, Lineup, Phase, PlayerView, ReadResult, TeamKey } from '@pfl/engine';
import { BASIC_DEFENSE_IDS, BASIC_OFFENSE_IDS, SPECIAL_IDS, findCard } from '@pfl/engine';
import type { EndMessage, ErrorMessage, PhaseMessage, ResultMessage, RevealMessage, RoomStatus } from '@pfl/protocol';
import { narrate, type NarrationContext, type NarrationLine } from './narration';
import { buildTimeline, timelineDuration, type AnimStep } from './timeline';
import { secondsLeft } from '../lib/format';

/** O que o campo mostra: posição da bola e quem está em cada vaga. */
export interface Stage {
  turnId: number;
  offenseTeam: TeamKey;
  ballOn: number;
  yardsToGo: number;
  lineups: { offense: Lineup; defense: Lineup };
  fatigue: Record<TeamKey, Record<number, number>>;
}

/** Animação de um match:result; `stage` é o snapshot pré-jogada. */
export interface Animation {
  seq: number;
  events: GameEvent[];
  steps: AnimStep[];
  stage: Stage;
  startedAt: number;
  endsAt: number;
}

export interface CardReveal {
  offense: string;
  defense: string;
  /** null em punt/field goal: o engine sempre manda NEUTRAL nesses casos e não há leitura a destacar */
  read: ReadResult | null;
}

export interface MatchClientState {
  /** último match:phase aceito (deadline e fase) */
  phase: PhaseMessage | null;
  /** view mais recente (de match:phase ou match:result) */
  view: PlayerView | null;
  stage: Stage | null;
  log: NarrationLine[];
  reveal: CardReveal | null;
  animation: Animation | null;
  /** ação já enviada nesta fase (evita clique duplo) */
  sent: { turnId: number; phase: Phase } | null;
  end: EndMessage | null;
  names: Record<TeamKey, string>;
  lastError: ErrorMessage | null;
  seenReveals: string[];
  lastResultTurn: number | null;
  seq: number;
}

export type MatchInput =
  | { type: 'PHASE'; msg: PhaseMessage }
  | { type: 'REVEAL'; msg: RevealMessage }
  | { type: 'RESULT'; msg: ResultMessage; now: number }
  | { type: 'END'; msg: EndMessage }
  | { type: 'ERROR'; error: ErrorMessage }
  | { type: 'SENT'; turnId: number; phase: Phase }
  | { type: 'NAMES'; names: Record<TeamKey, string> }
  | { type: 'RESET' };

export const MAX_LOG = 200;

export function initialMatchState(): MatchClientState {
  return {
    phase: null,
    view: null,
    stage: null,
    log: [],
    reveal: null,
    animation: null,
    sent: null,
    end: null,
    names: { A: 'Time A', B: 'Time B' },
    lastError: null,
    seenReveals: [],
    lastResultTurn: null,
    seq: 0,
  };
}

const PHASE_RANK: Record<Phase, number> = { FORMATION: 0, PACKAGE: 1, PLAYCALL: 2, CONVERSION: 3, MATCH_END: 4 };

/** O turnId é o mesmo nas três etapas de um snap; a ordem é (turnId, etapa). */
export function isNewerView(next: PlayerView, current: PlayerView | null): boolean {
  if (!current) return true;
  if (next.turnId !== current.turnId) return next.turnId > current.turnId;
  return PHASE_RANK[next.phase] >= PHASE_RANK[current.phase];
}

const isEmpty = (lineup: Lineup) => Object.keys(lineup).length === 0;

/** Usa as escalações da view; se vierem vazias no mesmo turno, mantém as reveladas antes. */
export function stageFromView(view: PlayerView, prev: Stage | null): Stage {
  const kept = prev && prev.turnId === view.turnId ? prev.lineups : { offense: {}, defense: {} };
  return {
    turnId: view.turnId,
    offenseTeam: view.offense,
    ballOn: view.field.ballOn,
    yardsToGo: view.field.yardsToGo,
    lineups: {
      offense: isEmpty(view.lineups.offense) ? kept.offense : view.lineups.offense,
      defense: isEmpty(view.lineups.defense) ? kept.defense : view.lineups.defense,
    },
    fatigue: view.fatigue,
  };
}

function withLineups(stage: Stage, events: readonly GameEvent[]): Stage {
  let lineups = stage.lineups;
  for (const e of events) {
    if (e.t === 'FORMATION') lineups = { ...lineups, offense: e.lineup };
    if (e.t === 'PACKAGE') lineups = { ...lineups, defense: e.lineup };
  }
  return lineups === stage.lineups ? stage : { ...stage, lineups };
}

export function revealFrom(events: readonly GameEvent[]): CardReveal | null {
  for (const e of events) {
    if (e.t !== 'CARDS') continue;
    const category = findCard(e.offense)?.category;
    const kick = category === 'PUNT' || category === 'FIELD_GOAL';
    return { offense: e.offense, defense: e.defense, read: kick ? null : e.read };
  }
  return null;
}

const contextOf = (s: MatchClientState): NarrationContext => ({
  names: s.names,
  possessionsPerTeam: s.view?.possessionsPerTeam ?? 6,
});
const appendLog = (log: NarrationLine[], lines: NarrationLine[]) => (lines.length ? [...log, ...lines].slice(-MAX_LOG) : log);
const revealKey = (turnId: number, e: GameEvent) => `${turnId}:${e.t}`;

export function matchReducer(s: MatchClientState, input: MatchInput): MatchClientState {
  switch (input.type) {
    case 'PHASE': {
      const { msg } = input;
      if (!isNewerView(msg.view, s.view)) return s;
      const changed = !s.view || s.view.turnId !== msg.view.turnId || s.view.phase !== msg.view.phase;
      return { ...s, phase: msg, view: msg.view, stage: stageFromView(msg.view, s.stage), sent: changed ? null : s.sent };
    }
    case 'REVEAL': {
      const { msg } = input;
      if (s.view && msg.turnId < s.view.turnId) return s;
      const fresh = msg.events.filter((e) => !s.seenReveals.includes(revealKey(msg.turnId, e)));
      if (fresh.length === 0) return s;
      const stage = s.stage && s.stage.turnId === msg.turnId ? withLineups(s.stage, fresh) : s.stage;
      return {
        ...s,
        stage,
        log: appendLog(s.log, narrate(fresh, contextOf(s))),
        seenReveals: [...s.seenReveals, ...fresh.map((e) => revealKey(msg.turnId, e))].slice(-16),
      };
    }
    case 'RESULT': {
      const { msg, now } = input;
      if (s.lastResultTurn !== null && msg.turnId <= s.lastResultTurn) return s;
      const pre = s.stage ? withLineups(s.stage, msg.events) : stageFromView(msg.view, null);
      const steps = buildTimeline(msg.events);
      const seq = s.seq + 1;
      const newer = isNewerView(msg.view, s.view);
      return {
        ...s,
        seq,
        lastResultTurn: msg.turnId,
        animation: { seq, events: msg.events, steps, stage: pre, startedAt: now, endsAt: now + timelineDuration(steps) },
        reveal: revealFrom(msg.events) ?? s.reveal,
        log: appendLog(s.log, narrate(msg.events, contextOf(s))),
        view: newer ? msg.view : s.view,
        stage: newer ? stageFromView(msg.view, s.stage) : s.stage,
        sent: null,
      };
    }
    case 'END':
      return { ...s, end: input.msg, sent: null };
    case 'ERROR': {
      // NOT_READY (partida pausada ou encerrada): o match:phase reenviado repete (turnId, fase) e não limparia `sent`.
      const clears = ['STALE_TURN', 'ENGINE_ERROR', 'NOT_READY'].includes(input.error.code);
      return { ...s, lastError: input.error, sent: clears ? null : s.sent };
    }
    case 'SENT':
      return { ...s, sent: { turnId: input.turnId, phase: input.phase } };
    case 'NAMES':
      return { ...s, names: input.names };
    case 'RESET':
      return initialMatchState();
  }
}

export function isAnimating(s: MatchClientState, now: number): boolean {
  return s.animation !== null && now < s.animation.endsAt;
}

export type PanelMode =
  | 'WAITING'
  | 'ANIMATING'
  | 'PICK_FORMATION'
  | 'PICK_PACKAGE'
  | 'PICK_CARD'
  | 'PICK_CONVERSION'
  | 'WAIT_OPPONENT'
  | 'ENDED';

/** O painel da próxima etapa só aparece depois da animação (o deadline já inclui RESULT_ANIMATION_MS). */
export function panelMode(s: MatchClientState, now: number): PanelMode {
  if (isAnimating(s, now)) return 'ANIMATING';
  if (s.end) return 'ENDED';
  const v = s.view;
  if (!v) return 'WAITING';
  const alreadySent = s.sent !== null && s.sent.turnId === v.turnId && s.sent.phase === v.phase;
  switch (v.phase) {
    case 'FORMATION':
      return v.side === 'offense' && !alreadySent ? 'PICK_FORMATION' : 'WAIT_OPPONENT';
    case 'PACKAGE':
      return v.side === 'defense' && !alreadySent ? 'PICK_PACKAGE' : 'WAIT_OPPONENT';
    case 'PLAYCALL':
      return v.yourCard === null && !alreadySent ? 'PICK_CARD' : 'WAIT_OPPONENT';
    case 'CONVERSION':
      return v.side === 'offense' && !alreadySent ? 'PICK_CONVERSION' : 'WAIT_OPPONENT';
    case 'MATCH_END':
      return 'ENDED';
  }
}

export function showEndScreen(s: MatchClientState, now: number): boolean {
  return s.end !== null && !isAnimating(s, now);
}

/** Carta só sai se a etapa é de carta, nada foi enviado e o servidor a listou em `playable`. */
export function canSubmitCard(s: MatchClientState, cardId: string, now: number): boolean {
  return panelMode(s, now) === 'PICK_CARD' && s.view !== null && s.view.playable.includes(cardId);
}

export interface HandEntry {
  key: string;
  cardId: string;
  source: 'HAND' | 'BASIC' | 'SPECIAL';
  playable: boolean;
}

/** Mão (pode ter cópias repetidas) + básicas sempre disponíveis + Punt/FG quando jogáveis (4º down). */
export function handEntries(view: PlayerView): HandEntry[] {
  const playable = (id: string) => view.playable.includes(id);
  const basics: readonly string[] = view.side === 'offense' ? BASIC_OFFENSE_IDS : BASIC_DEFENSE_IDS;
  const specials: readonly string[] = view.side === 'offense' ? SPECIAL_IDS.filter((id) => playable(id)) : [];
  return [
    ...view.hand.map((cardId, i): HandEntry => ({ key: `hand-${i}-${cardId}`, cardId, source: 'HAND', playable: playable(cardId) })),
    ...basics.map((cardId): HandEntry => ({ key: `basic-${cardId}`, cardId, source: 'BASIC', playable: playable(cardId) })),
    ...specials.map((cardId): HandEntry => ({ key: `special-${cardId}`, cardId, source: 'SPECIAL', playable: true })),
  ];
}

/** Segundos da etapa atual; null quando a última fase recebida não é a da view (ex.: logo após o resultado). */
export function timerSeconds(s: MatchClientState, now: number): number | null {
  if (!s.phase || !s.view) return null;
  if (s.phase.view.turnId !== s.view.turnId || s.phase.phase !== s.view.phase) return null;
  return secondsLeft(s.phase.phase, s.phase.deadline, now);
}

/** Aba recarregada (ou reconexão) no meio da partida: pedir o estado atual ao servidor. */
export function needsResync(status: RoomStatus | null, s: MatchClientState): boolean {
  return (status === 'IN_MATCH' || status === 'PAUSED') && s.view === null && s.end === null;
}
