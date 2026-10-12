import {
  FORMATIONS, canPlay, fieldGoalDistance, fieldGoalProbability, getCard, pickLineup, playerView, readResult,
  type Action, type DefenseCategory, type FatigueState, type FormationId, type MatchState, type OffenseCategory,
  type PackageId, type PlayerView, type Team, type TeamKey,
} from '@pfl/engine';
import { weightedPick } from './pick';

/** O que o bot sabe: a visão pública do jogador + os dados do próprio time (nunca o estado do adversário). */
export interface BotKnowledge {
  view: PlayerView;
  own: { team: Team; fatigue: FatigueState };
}

export type Distance = 'SHORT' | 'MEDIUM' | 'LONG';

const OFFENSE_CATEGORIES: OffenseCategory[] = ['RUN_INSIDE', 'RUN_OUTSIDE', 'SHORT_PASS', 'DEEP_PASS', 'SCREEN', 'PLAY_ACTION'];
const FORMATION_IDS: FormationId[] = ['PISTOL', 'HEAVY', 'SPREAD', 'DOUBLE'];
const PACKAGE_IDS: PackageId[] = ['BASE', 'HEAVY_D', 'NICKEL', 'DIME'];

/** Tendência de chamada de jogada por distância (o bot também a usa para prever o adversário). */
export const CALL_TENDENCY: Record<Distance, Record<OffenseCategory, number>> = {
  SHORT: { RUN_INSIDE: 3, RUN_OUTSIDE: 2, SHORT_PASS: 2, DEEP_PASS: 0.5, SCREEN: 1, PLAY_ACTION: 1.5 },
  MEDIUM: { RUN_INSIDE: 2, RUN_OUTSIDE: 2, SHORT_PASS: 2.5, DEEP_PASS: 1, SCREEN: 1.5, PLAY_ACTION: 1.5 },
  LONG: { RUN_INSIDE: 1, RUN_OUTSIDE: 1, SHORT_PASS: 2, DEEP_PASS: 2.5, SCREEN: 1.5, PLAY_ACTION: 2 },
};
const FORMATION_TENDENCY: Record<Distance, Record<FormationId, number>> = {
  SHORT: { PISTOL: 1, HEAVY: 1.5, SPREAD: 0.7, DOUBLE: 1.5 },
  MEDIUM: { PISTOL: 1.2, HEAVY: 1, SPREAD: 1, DOUBLE: 1 },
  LONG: { PISTOL: 1.3, HEAVY: 0.7, SPREAD: 1.5, DOUBLE: 0.7 },
};
const PACKAGE_TENDENCY: Record<Distance, Record<PackageId, number>> = {
  SHORT: { BASE: 2, HEAVY_D: 3, NICKEL: 1, DIME: 0.5 },
  MEDIUM: { BASE: 2, HEAVY_D: 1, NICKEL: 2, DIME: 1 },
  LONG: { BASE: 1, HEAVY_D: 0.5, NICKEL: 2, DIME: 2.5 },
};
const RUNS: OffenseCategory[] = ['RUN_INSIDE', 'RUN_OUTSIDE'];
/** Peso extra para cartas do deck em relação às básicas. */
const DECK_CARD_BONUS = 1.5;
/** Quanto o valor esperado da leitura pesa na escolha da defesa (peso = e^(k·EV)). */
const READ_SHARPNESS = 2;

export function distanceOf(yardsToGo: number): Distance {
  return yardsToGo <= 3 ? 'SHORT' : yardsToGo <= 7 ? 'MEDIUM' : 'LONG';
}

/** Quais times precisam agir agora. Vazio quando a partida acabou. */
export function actingTeams(state: MatchState): TeamKey[] {
  const defense: TeamKey = state.offense === 'A' ? 'B' : 'A';
  switch (state.phase) {
    case 'FORMATION':
    case 'CONVERSION':
      return [state.offense];
    case 'PACKAGE':
      return [defense];
    case 'PLAYCALL': {
      const out: TeamKey[] = [];
      if (state.cards.offense === null) out.push(state.offense);
      if (state.cards.defense === null) out.push(defense);
      return out;
    }
    case 'MATCH_END':
      return [];
  }
}

/** Probabilidade prevista de cada categoria de ataque, dada a situação e a formação revelada. */
export function predictOffense(view: PlayerView): Record<OffenseCategory, number> {
  const base = CALL_TENDENCY[distanceOf(view.field.yardsToGo)];
  const tilt = (c: OffenseCategory): number => {
    if (view.formation === 'SPREAD') return RUNS.includes(c) ? 0.6 : 1.3;
    if (view.formation === 'HEAVY' || view.formation === 'DOUBLE') return RUNS.includes(c) ? 1.4 : 0.8;
    return 1;
  };
  const raw = OFFENSE_CATEGORIES.map((c) => base[c] * tilt(c));
  const total = raw.reduce((a, b) => a + b, 0);
  return Object.fromEntries(OFFENSE_CATEGORIES.map((c, i) => [c, raw[i] / total])) as Record<OffenseCategory, number>;
}

const readScore = { RIGHT: 1, NEUTRAL: 0, WRONG: -1 } as const;

function chooseFormation(k: BotKnowledge, rng: number): { action: Action; rng: number } {
  const { view, own } = k;
  const tendency = FORMATION_TENDENCY[distanceOf(view.field.yardsToGo)];
  const weights = FORMATION_IDS.map((f) => {
    const lineup = pickLineup(FORMATIONS[f], own.team, own.fatigue);
    const playable = view.hand.filter((id) => canPlay(getCard(id), lineup)).length;
    return (1 + playable) * tendency[f];
  });
  const r = weightedPick(FORMATION_IDS, weights, rng);
  return { action: { type: 'FORMATION', team: view.you, formation: r.item }, rng: r.rng };
}

function choosePackage(k: BotKnowledge, rng: number): { action: Action; rng: number } {
  const { view } = k;
  const tendency = PACKAGE_TENDENCY[distanceOf(view.field.yardsToGo)];
  const runHeavy = view.formation === 'HEAVY' || view.formation === 'DOUBLE';
  const weights = PACKAGE_IDS.map((p) => {
    let w = tendency[p];
    if (runHeavy && (p === 'HEAVY_D' || p === 'BASE')) w *= 1.5;
    if (view.formation === 'SPREAD' && (p === 'NICKEL' || p === 'DIME')) w *= 1.5;
    return w;
  });
  const r = weightedPick(PACKAGE_IDS, weights, rng);
  return { action: { type: 'PACKAGE', team: view.you, package: r.item }, rng: r.rng };
}

/** Decisão de 4º down: 'GO' (jogada normal), 'FIELD_GOAL' ou 'PUNT'. */
export function fourthDownDecision(view: PlayerView, specialist: number): 'GO' | 'FIELD_GOAL' | 'PUNT' {
  const { ballOn, yardsToGo } = view.field;
  const fgProb = fieldGoalProbability(fieldGoalDistance(ballOn), specialist);
  const lastChance = view.overtimeRound > 0 || view.possessions[view.you] >= view.possessionsPerTeam;
  const opponent: TeamKey = view.you === 'A' ? 'B' : 'A';
  const deficit = view.score[opponent] - view.score[view.you];
  if (lastChance && deficit > 0) {
    if (deficit <= 3 && fgProb >= 0.3) return 'FIELD_GOAL';
    return 'GO';
  }
  // na prorrogação o punt só entrega a posse sem pontos: chuta FG se der, senão tenta
  if (view.overtimeRound > 0) return fgProb >= 0.3 ? 'FIELD_GOAL' : 'GO';
  if (yardsToGo <= 2 && ballOn >= 40) return 'GO';
  if (fgProb >= 0.5) return 'FIELD_GOAL';
  if (yardsToGo <= 4 && ballOn >= 60) return 'GO';
  return 'PUNT';
}

function chooseOffenseCard(k: BotKnowledge, rng: number): { action: Action; rng: number } {
  const { view, own } = k;
  if (view.field.down === 4 && !view.conversionAttempt) {
    const decision = fourthDownDecision(view, own.team.specialist);
    if (decision === 'PUNT') return { action: { type: 'CARD', team: view.you, cardId: 'punt' }, rng };
    if (decision === 'FIELD_GOAL') return { action: { type: 'CARD', team: view.you, cardId: 'field_goal' }, rng };
  }
  const options = view.playable.filter((id) => id !== 'punt' && id !== 'field_goal');
  const tendency = CALL_TENDENCY[distanceOf(view.field.yardsToGo)];
  const weights = options.map((id) => {
    const card = getCard(id);
    return tendency[card.category as OffenseCategory] * (card.origin === 'BASIC' ? 1 : DECK_CARD_BONUS);
  });
  const r = weightedPick(options, weights, rng);
  return { action: { type: 'CARD', team: view.you, cardId: r.item }, rng: r.rng };
}

function chooseDefenseCard(k: BotKnowledge, rng: number): { action: Action; rng: number } {
  const { view } = k;
  const predicted = predictOffense(view);
  const options = view.playable;
  const weights = options.map((id) => {
    const card = getCard(id);
    const ev = OFFENSE_CATEGORIES.reduce(
      (sum, c) => sum + predicted[c] * readScore[readResult(card.category as DefenseCategory, c)],
      0,
    );
    return Math.exp(READ_SHARPNESS * ev) * (card.origin === 'BASIC' ? 1 : DECK_CARD_BONUS);
  });
  const r = weightedPick(options, weights, rng);
  return { action: { type: 'CARD', team: view.you, cardId: r.item }, rng: r.rng };
}

function chooseConversion(k: BotKnowledge, rng: number): { action: Action; rng: number } {
  const { view } = k;
  const opponent: TeamKey = view.you === 'A' ? 'B' : 'A';
  const deficit = view.score[opponent] - view.score[view.you];
  const twoProbability = deficit === 2 || deficit === 5 || deficit === 10 || deficit === -1 ? 0.7 : 0.1;
  const r = weightedPick(['TWO', 'PAT'] as const, [twoProbability, 1 - twoProbability], rng);
  return { action: { type: 'CONVERSION', team: view.you, choice: r.item }, rng: r.rng };
}

/** Decide a partir apenas do que o jogador sabe. */
export function botDecide(k: BotKnowledge, rng: number): { action: Action; rng: number } {
  const { view } = k;
  switch (view.phase) {
    case 'FORMATION':
      return chooseFormation(k, rng);
    case 'PACKAGE':
      return choosePackage(k, rng);
    case 'PLAYCALL':
      return view.side === 'offense' ? chooseOffenseCard(k, rng) : chooseDefenseCard(k, rng);
    case 'CONVERSION':
      return chooseConversion(k, rng);
    case 'MATCH_END':
      throw new Error('bot: a partida já terminou');
  }
}

/** Contrato (contracts.md, seção 1). Lança erro se `team` não precisa agir na fase atual. */
export function botAction(state: MatchState, team: TeamKey, rng: number): { action: Action; rng: number } {
  if (!actingTeams(state).includes(team)) throw new Error(`bot: o time ${team} não age na fase ${state.phase}`);
  const rt = state.teams[team];
  return botDecide({ view: playerView(state, team), own: { team: rt.team, fatigue: rt.fatigue } }, rng);
}
