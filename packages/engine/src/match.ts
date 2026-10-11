import type {
  Action, DeckState, FatigueState, FieldState, FormationId, GameEvent, Lineup, PackageId, Phase, Team, TeamKey,
} from './model';
import { FORMATIONS, PACKAGES } from './formations';
import { BASIC_DEFENSE_IDS, BASIC_OFFENSE_IDS, SPECIAL_IDS, getCard } from './cards/catalog';
import { canPlay } from './cards/eligibility';
import { drawCards, newHand, playFromHand } from './cards/deck';
import { applyPlayFatigue, initialFatigue, pickLineup, recoverBetweenDrives } from './fatigue';
import { resolvePlay } from './resolve';
import { resolveFieldGoal, resolvePat, resolvePunt } from './specials';
import { advanceField, nextDriveStart, type DriveEnd } from './field';
import { validateTeam } from './team';
import { rngShuffle } from './rng';
import { EngineError } from './errors';

export interface MatchConfig {
  possessionsPerTeam: number;
  handSize: number;
}
export const DEFAULT_CONFIG: MatchConfig = { possessionsPerTeam: 6, handSize: 5 };
export const OVERTIME_START = 75;
export const TWO_POINT_BALL_ON = 97;
const DEFAULT_FORMATION: FormationId = 'PISTOL';
const DEFAULT_PACKAGE: PackageId = 'BASE';

export interface TeamRuntime {
  team: Team;
  offense: DeckState;
  defense: DeckState;
  fatigue: FatigueState;
  lastFormation: FormationId;
}

export interface MatchState {
  config: MatchConfig;
  teams: Record<TeamKey, TeamRuntime>;
  rng: number;
  phase: Phase;
  turnId: number;
  /** número do snap dentro do drive atual: 1 no primeiro snap (contrato, seção 2) */
  snapInDrive: number;
  score: Record<TeamKey, number>;
  offense: TeamKey;
  /** posses de tempo regulamentar já iniciadas */
  possessions: Record<TeamKey, number>;
  field: FieldState;
  formation: FormationId | null;
  package: PackageId | null;
  lineups: { offense: Lineup; defense: Lineup };
  cards: { offense: string | null; defense: string | null };
  /** a jogada atual é uma tentativa de 2 pontos */
  conversionAttempt: boolean;
  overtime: { round: number; turnsInRound: number } | null;
}

export interface StepResult {
  state: MatchState;
  events: GameEvent[];
}

const other = (k: TeamKey): TeamKey => (k === 'A' ? 'B' : 'A');

export function createMatch(teamA: Team, teamB: Team, seed: number, config: MatchConfig = DEFAULT_CONFIG): StepResult {
  for (const [key, team] of [['A', teamA], ['B', teamB]] as const) {
    const errors = validateTeam(team);
    if (errors.length) throw new EngineError('INVALID_TEAM', `${key}: ${errors.map((e) => e.code).join(', ')}`);
  }
  let rng = seed | 0;
  const runtime = (team: Team): TeamRuntime => {
    const off = rngShuffle(team.offenseDeck, rng);
    rng = off.state;
    const def = rngShuffle(team.defenseDeck, rng);
    rng = def.state;
    return {
      team,
      offense: { draw: off.items, hand: [], discard: [] },
      defense: { draw: def.items, hand: [], discard: [] },
      fatigue: initialFatigue(),
      lastFormation: DEFAULT_FORMATION,
    };
  };
  // Copia os times: editar o objeto do chamador depois não pode alterar a partida (nem o replay).
  // Congelados porque os estados seguintes compartilham o mesmo `Team` (ver cloneState).
  const teams = { A: runtime(deepFreeze(structuredClone(teamA))), B: runtime(deepFreeze(structuredClone(teamB))) };
  const state: MatchState = {
    config,
    teams,
    rng,
    phase: 'FORMATION',
    turnId: 0,
    snapInDrive: 0,
    score: { A: 0, B: 0 },
    offense: 'A',
    possessions: { A: 0, B: 0 },
    field: { down: 1, yardsToGo: 10, ballOn: 25 },
    formation: null,
    package: null,
    lineups: { offense: {}, defense: {} },
    cards: { offense: null, defense: null },
    conversionAttempt: false,
    overtime: null,
  };
  const events: GameEvent[] = [];
  startDrive(state, 'A', 25, events);
  return { state, events };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

/** Cópia do estado para o próximo passo. O `Team` não muda durante a partida e é compartilhado. */
function cloneState(state: MatchState): MatchState {
  const runtime = (rt: TeamRuntime): TeamRuntime => ({ ...structuredClone({ ...rt, team: null }), team: rt.team });
  return { ...structuredClone({ ...state, teams: null }), teams: { A: runtime(state.teams.A), B: runtime(state.teams.B) } };
}

export function step(state: MatchState, action: Action): StepResult {
  if (state.phase === 'MATCH_END') throw new EngineError('MATCH_OVER');
  const s = cloneState(state);
  const events: GameEvent[] = [];
  if (action.type === 'SET_DEPTH') {
    onSetDepth(s, action);
    return { state: s, events };
  }
  switch (s.phase) {
    case 'FORMATION':
      onFormation(s, action, events);
      break;
    case 'PACKAGE':
      onPackage(s, action, events);
      break;
    case 'PLAYCALL':
      onPlaycall(s, action, events);
      break;
    case 'CONVERSION':
      onConversion(s, action, events);
      break;
  }
  return { state: s, events };
}

/** Ajuste manual do depth chart (spec 5.4): só na FORMATION do primeiro snap do drive. */
export function canEditDepth(s: MatchState): boolean {
  return s.phase === 'FORMATION' && s.snapInDrive === 1;
}

function onSetDepth(s: MatchState, action: Extract<Action, { type: 'SET_DEPTH' }>): void {
  if (action.team !== 'A' && action.team !== 'B') throw new EngineError('WRONG_TEAM');
  if (!canEditDepth(s)) throw new EngineError('DEPTH_LOCKED');
  const rt = s.teams[action.team];
  const candidate = { ...rt.team, depth: action.depth, keepOnField: action.keepOnField };
  const errors = validateTeam(candidate);
  if (errors.length) throw new EngineError('INVALID_DEPTH', errors.map((e) => e.code).join(', '));
  rt.team = structuredClone(candidate);
}

export function playableCards(s: MatchState, team: TeamKey): string[] {
  if (s.phase !== 'PLAYCALL') return [];
  const isOffense = team === s.offense;
  const rt = s.teams[team];
  const lineup = isOffense ? s.lineups.offense : s.lineups.defense;
  const pool = isOffense ? [...BASIC_OFFENSE_IDS, ...rt.offense.hand] : [...BASIC_DEFENSE_IDS, ...rt.defense.hand];
  const ids = [...new Set(pool)].filter((id) => canPlay(getCard(id), lineup));
  if (isOffense && s.field.down === 4 && !s.conversionAttempt) ids.push(...SPECIAL_IDS);
  return ids;
}

/** Devolve a ação se for do tipo e do time esperados; null se for TIMEOUT. */
function accept<T extends Exclude<Action['type'], 'TIMEOUT'>>(
  action: Action,
  type: T,
  team: TeamKey,
): Extract<Action, { type: T }> | null {
  if (action.type === 'TIMEOUT') return null;
  if (action.type !== type) throw new EngineError('WRONG_PHASE', `${action.type} na fase de ${type}`);
  if (action.team !== team) throw new EngineError('WRONG_TEAM');
  return action as Extract<Action, { type: T }>;
}

function onFormation(s: MatchState, action: Action, events: GameEvent[]): void {
  const a = accept(action, 'FORMATION', s.offense);
  const rt = s.teams[s.offense];
  const formation = a ? a.formation : rt.lastFormation;
  if (!Object.hasOwn(FORMATIONS, formation)) throw new EngineError('UNKNOWN_FORMATION', formation);
  s.formation = formation;
  rt.lastFormation = formation;
  s.lineups.offense = pickLineup(FORMATIONS[formation], rt.team, rt.fatigue);
  events.push({ t: 'FORMATION', team: s.offense, formation, lineup: s.lineups.offense });
  s.phase = 'PACKAGE';
}

function onPackage(s: MatchState, action: Action, events: GameEvent[]): void {
  const defense = other(s.offense);
  const a = accept(action, 'PACKAGE', defense);
  const pkg = a ? a.package : DEFAULT_PACKAGE;
  if (!Object.hasOwn(PACKAGES, pkg)) throw new EngineError('UNKNOWN_PACKAGE', pkg);
  const rt = s.teams[defense];
  s.package = pkg;
  s.lineups.defense = pickLineup(PACKAGES[pkg], rt.team, rt.fatigue);
  events.push({ t: 'PACKAGE', team: defense, package: pkg, lineup: s.lineups.defense });
  s.phase = 'PLAYCALL';
}

function onPlaycall(s: MatchState, action: Action, events: GameEvent[]): void {
  if (action.type === 'TIMEOUT') {
    s.cards.offense ??= s.field.down === 4 && !s.conversionAttempt ? 'punt' : 'basic_run';
    s.cards.defense ??= 'basic_defense';
  } else {
    if (action.type !== 'CARD') throw new EngineError('WRONG_PHASE', `${action.type} na fase de CARD`);
    if (action.team !== 'A' && action.team !== 'B') throw new EngineError('WRONG_TEAM', String(action.team));
    const side = action.team === s.offense ? 'offense' : 'defense';
    if (s.cards[side] !== null) throw new EngineError('ALREADY_CHOSEN');
    if (!playableCards(s, action.team).includes(action.cardId)) throw new EngineError('CARD_NOT_PLAYABLE', action.cardId);
    s.cards[side] = action.cardId;
  }
  if (s.cards.offense && s.cards.defense) resolveSnap(s, events);
}

function onConversion(s: MatchState, action: Action, events: GameEvent[]): void {
  const a = accept(action, 'CONVERSION', s.offense);
  const choice = a ? a.choice : 'PAT';
  if (choice !== 'PAT' && choice !== 'TWO') throw new EngineError('INVALID_CHOICE', String(choice));
  if (choice === 'PAT') {
    const r = resolvePat(s.teams[s.offense].team.specialist, s.rng);
    s.rng = r.rng;
    if (r.good) s.score[s.offense] += 1;
    events.push({ t: 'CONVERSION', team: s.offense, choice, good: r.good });
    endDrive(s, { kind: 'CONVERSION' }, events);
    return;
  }
  s.conversionAttempt = true;
  s.field = { down: 1, yardsToGo: 3, ballOn: TWO_POINT_BALL_ON };
  beginSnap(s);
}

function consumeCard(s: MatchState, rt: TeamRuntime, side: 'offense' | 'defense', cardId: string): void {
  const card = getCard(cardId);
  if (card.origin === 'BASIC' || card.origin === 'SPECIAL') return;
  const after = drawCards(playFromHand(rt[side], cardId), 1, s.rng);
  rt[side] = after.deck;
  s.rng = after.rng;
}

function resolveSnap(s: MatchState, events: GameEvent[]): void {
  const offKey = s.offense;
  const defKey = other(offKey);
  const off = s.teams[offKey];
  const def = s.teams[defKey];
  const offCard = getCard(s.cards.offense as string);
  const defCard = getCard(s.cards.defense as string);
  consumeCard(s, off, 'offense', offCard.id);
  consumeCard(s, def, 'defense', defCard.id);

  if (offCard.category === 'PUNT' || offCard.category === 'FIELD_GOAL') {
    // Chutes não geram atores, mas quem está fora de campo continua recuperando 1 nível (spec 3.6).
    off.fatigue = applyPlayFatigue(off.fatigue, off.team, s.lineups.offense, []);
    def.fatigue = applyPlayFatigue(def.fatigue, def.team, s.lineups.defense, []);
    events.push({ t: 'CARDS', offense: offCard.id, defense: defCard.id, read: 'NEUTRAL' });
    if (offCard.category === 'PUNT') {
      const r = resolvePunt(off.team.specialist, s.rng);
      s.rng = r.rng;
      events.push({ t: 'PUNT', distance: r.distance });
      endDrive(s, { kind: 'PUNT', landing: s.field.ballOn + r.distance }, events);
    } else {
      const r = resolveFieldGoal(s.field.ballOn, off.team.specialist, s.rng);
      s.rng = r.rng;
      events.push({ t: 'FIELD_GOAL', distance: r.distance, good: r.good });
      if (r.good) s.score[offKey] += 3;
      endDrive(s, { kind: 'FIELD_GOAL', good: r.good, ballOn: s.field.ballOn }, events);
    }
    return;
  }

  const res = resolvePlay({
    offCard,
    defCard,
    offLineup: s.lineups.offense,
    defLineup: s.lineups.defense,
    offFatigue: off.fatigue.levels,
    defFatigue: def.fatigue.levels,
    rng: s.rng,
  });
  s.rng = res.rng;
  const outcome = res.outcome;
  events.push({ t: 'CARDS', offense: offCard.id, defense: defCard.id, read: outcome.read });
  events.push({ t: 'PLAY', outcome });
  off.fatigue = applyPlayFatigue(off.fatigue, off.team, s.lineups.offense, outcome.offActors);
  def.fatigue = applyPlayFatigue(def.fatigue, def.team, s.lineups.defense, outcome.defActors);

  const adv = advanceField(s.field, outcome);
  if (s.conversionAttempt) {
    const good = adv.end?.kind === 'TOUCHDOWN';
    if (good) s.score[offKey] += 2;
    events.push({ t: 'CONVERSION', team: offKey, choice: 'TWO', good });
    endDrive(s, { kind: 'CONVERSION' }, events);
    return;
  }
  if (!adv.end) {
    s.field = adv.field;
    if (adv.firstDown) events.push({ t: 'FIRST_DOWN' });
    beginSnap(s);
    return;
  }
  switch (adv.end.kind) {
    case 'TOUCHDOWN':
      s.score[offKey] += 6;
      events.push({ t: 'TOUCHDOWN', team: offKey });
      clearSnap(s);
      s.phase = 'CONVERSION';
      s.turnId += 1;
      return;
    case 'SAFETY':
      s.score[defKey] += 2;
      events.push({ t: 'SAFETY', team: defKey });
      break;
    case 'TURNOVER':
      events.push({ t: 'TURNOVER', kind: outcome.kind === 'FUMBLE' ? 'FUMBLE' : 'INTERCEPTION' });
      break;
    case 'DOWNS':
      events.push({ t: 'TURNOVER_ON_DOWNS' });
      break;
  }
  endDrive(s, adv.end, events);
}

function beginSnap(s: MatchState): void {
  clearSnap(s);
  s.phase = 'FORMATION';
  s.turnId += 1;
  s.snapInDrive += 1;
}

/** Limpa as escolhas do snap anterior (formação, pacote, escalações e cartas). */
function clearSnap(s: MatchState): void {
  s.formation = null;
  s.package = null;
  s.lineups = { offense: {}, defense: {} };
  s.cards = { offense: null, defense: null };
}

function startDrive(s: MatchState, offense: TeamKey, ballOn: number, events: GameEvent[]): void {
  s.offense = offense;
  if (!s.overtime) s.possessions[offense] += 1;
  for (const key of ['A', 'B'] as const) {
    s.teams[key].fatigue = recoverBetweenDrives(s.teams[key].fatigue, s.teams[key].team);
  }
  const off = s.teams[offense];
  const def = s.teams[other(offense)];
  const oh = newHand(off.offense, s.config.handSize, s.rng);
  off.offense = oh.deck;
  s.rng = oh.rng;
  const dh = newHand(def.defense, s.config.handSize, s.rng);
  def.defense = dh.deck;
  s.rng = dh.rng;
  off.lastFormation = DEFAULT_FORMATION;

  const twoPointOnly = s.overtime !== null && s.overtime.round >= 3;
  s.conversionAttempt = twoPointOnly;
  s.field = twoPointOnly
    ? { down: 1, yardsToGo: 3, ballOn: TWO_POINT_BALL_ON }
    : { down: 1, yardsToGo: Math.min(10, 100 - ballOn), ballOn };
  events.push({
    t: 'DRIVE_START',
    offense,
    ballOn: s.field.ballOn,
    possession: s.possessions[offense],
    overtimeRound: s.overtime?.round ?? 0,
  });
  s.snapInDrive = 0;
  beginSnap(s);
}

function endDrive(s: MatchState, end: DriveEnd, events: GameEvent[]): void {
  const next = other(s.offense);
  if (s.overtime) {
    s.overtime.turnsInRound += 1;
    if (s.overtime.turnsInRound < 2) return startDrive(s, next, OVERTIME_START, events);
    if (s.score.A !== s.score.B) return finish(s, events);
    s.overtime = { round: s.overtime.round + 1, turnsInRound: 0 };
    events.push({ t: 'OVERTIME', round: s.overtime.round });
    return startDrive(s, s.overtime.round % 2 === 1 ? 'A' : 'B', OVERTIME_START, events);
  }
  const n = s.config.possessionsPerTeam;
  if (s.possessions.A >= n && s.possessions.B >= n) {
    if (s.score.A !== s.score.B) return finish(s, events);
    s.overtime = { round: 1, turnsInRound: 0 };
    events.push({ t: 'OVERTIME', round: 1 });
    return startDrive(s, 'A', OVERTIME_START, events);
  }
  startDrive(s, next, nextDriveStart(end), events);
}

function finish(s: MatchState, events: GameEvent[]): void {
  s.phase = 'MATCH_END';
  s.turnId += 1;
  events.push({ t: 'MATCH_END', score: { ...s.score } });
}

export interface PlayerView {
  you: TeamKey;
  side: 'offense' | 'defense';
  phase: Phase;
  turnId: number;
  score: Record<TeamKey, number>;
  offense: TeamKey;
  possessions: Record<TeamKey, number>;
  possessionsPerTeam: number;
  field: FieldState;
  formation: FormationId | null;
  package: PackageId | null;
  lineups: { offense: Lineup; defense: Lineup };
  conversionAttempt: boolean;
  overtimeRound: number;
  hand: string[];
  playable: string[];
  opponentHandSize: number;
  yourCard: string | null;
  opponentHasChosen: boolean;
  fatigue: Record<TeamKey, Record<number, number>>;
  /** o jogador pode enviar SET_DEPTH agora (FORMATION do primeiro snap do drive) */
  canEditDepth: boolean;
}

/** Visão de um jogador: a própria mão; do adversário, só a contagem (spec 7.1). */
export function playerView(s: MatchState, you: TeamKey): PlayerView {
  const side = you === s.offense ? 'offense' : 'defense';
  const opponentSide = side === 'offense' ? 'defense' : 'offense';
  return {
    you,
    side,
    phase: s.phase,
    turnId: s.turnId,
    score: { ...s.score },
    offense: s.offense,
    possessions: { ...s.possessions },
    possessionsPerTeam: s.config.possessionsPerTeam,
    field: { ...s.field },
    formation: s.formation,
    package: s.package,
    lineups: structuredClone(s.lineups),
    conversionAttempt: s.conversionAttempt,
    overtimeRound: s.overtime?.round ?? 0,
    hand: [...s.teams[you][side].hand],
    playable: playableCards(s, you),
    opponentHandSize: s.teams[other(you)][opponentSide].hand.length,
    yourCard: s.cards[side],
    opponentHasChosen: s.cards[opponentSide] !== null,
    fatigue: { A: { ...s.teams.A.fatigue.levels }, B: { ...s.teams.B.fatigue.levels } },
    canEditDepth: canEditDepth(s),
  };
}
