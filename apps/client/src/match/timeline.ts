import type { GameEvent, OffenseCategory, PlayOutcome } from '@pfl/engine';
import { findCard } from '@pfl/engine';
import { RESULT_ANIMATION_MS } from '@pfl/protocol';
import { typeEffect, type TypeEffect } from './effect';

interface Timed {
  /** ms desde o início da animação */
  at: number;
  duration: number;
}

export type AnimStep = Timed &
  (
    | { kind: 'SNAP' }
    | { kind: 'BLOCK' }
    | { kind: 'CLASH'; off: number; def: number; effect: TypeEffect | null }
    | { kind: 'THROW'; from: number | null; to: number }
    | { kind: 'RUN'; carrier: number; yards: number }
    | { kind: 'TACKLE'; by: number; carrier: number }
    | { kind: 'INCOMPLETE' }
    | { kind: 'SACK'; qb: number; by: number; yards: number }
    | { kind: 'TURNOVER'; by: number }
    | { kind: 'KICK'; distance: number; good: boolean | null }
    | { kind: 'BANNER'; text: string; tone: 'good' | 'bad' | 'info' }
  );

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type StepBody = DistributiveOmit<AnimStep, 'at' | 'duration'>;

/** A animação precisa terminar antes do próximo timer (RESULT_ANIMATION_MS), com folga. */
export const TIMELINE_BUDGET_MS = RESULT_ANIMATION_MS - 500;

const D = {
  snap: 350, block: 350, clash: 550, throw: 450, run: 700, runBig: 900, tackle: 300,
  incomplete: 450, sack: 650, turnover: 600, kick: 800, banner: 800,
};

const PASSES: OffenseCategory[] = ['SHORT_PASS', 'DEEP_PASS', 'PLAY_ACTION', 'SCREEN'];
const PROTECTED: OffenseCategory[] = ['SHORT_PASS', 'DEEP_PASS', 'PLAY_ACTION'];

export function timelineDuration(steps: readonly AnimStep[]): number {
  return steps.reduce((max, s) => Math.max(max, s.at + s.duration), 0);
}

function fitToBudget(steps: AnimStep[], budget: number): AnimStep[] {
  const total = timelineDuration(steps);
  if (total <= budget) return steps;
  const f = budget / total;
  return steps.map((s) => ({ ...s, at: Math.floor(s.at * f), duration: Math.max(1, Math.floor(s.duration * f)) }));
}

/**
 * Eventos do motor → passos de animação (spec 6.2: snap → bloqueio → confronto com efeito de tipo →
 * tackle/recepção/TD). Os atores vêm da ordem de PlayOutcome.offActors/defActors: na corrida o primeiro
 * atacante é o RB; nos passes protegidos é o QB, e o segundo é o recebedor; no screen, o RB.
 */
export function buildTimeline(events: readonly GameEvent[]): AnimStep[] {
  const steps: AnimStep[] = [];
  let t = 0;
  const push = (body: StepBody, duration: number) => {
    steps.push({ ...body, at: t, duration } as AnimStep);
    t += duration;
  };
  const scored = events.some((e) => e.t === 'TOUCHDOWN' || (e.t === 'CONVERSION' && e.choice === 'TWO' && e.good));
  let offenseCard: string | null = null;

  const playSteps = (o: PlayOutcome) => {
    const card = offenseCard ? findCard(offenseCard) : undefined;
    const category = (card?.category ?? 'RUN_INSIDE') as OffenseCategory;
    const isPass = PASSES.includes(category);
    const isProtected = PROTECTED.includes(category);
    const qb = isProtected ? o.offActors[0] : undefined;
    const carrier = isProtected ? (o.offActors[1] ?? o.offActors[0]) : o.offActors[0];
    const defender = o.defActors[0];

    push({ kind: 'SNAP' }, D.snap);
    if (isProtected) push({ kind: 'BLOCK' }, D.block);
    if (o.kind === 'SACK') {
      const by = o.defActors.at(-1);
      if (qb !== undefined && by !== undefined) push({ kind: 'SACK', qb, by, yards: o.yards }, D.sack);
      return;
    }
    if (carrier !== undefined && defender !== undefined) {
      push({ kind: 'CLASH', off: carrier, def: defender, effect: typeEffect(card?.element ?? null, o.defActors) }, D.clash);
    }
    if (isPass && carrier !== undefined) push({ kind: 'THROW', from: qb ?? null, to: carrier }, D.throw);
    switch (o.kind) {
      case 'INCOMPLETE':
        push({ kind: 'INCOMPLETE' }, D.incomplete);
        break;
      case 'INTERCEPTION':
      case 'FUMBLE':
        if (defender !== undefined) push({ kind: 'TURNOVER', by: defender }, D.turnover);
        break;
      case 'GAIN':
        if (carrier !== undefined) {
          push({ kind: 'RUN', carrier, yards: o.yards }, o.bigPlay ? D.runBig : D.run);
          if (!scored && defender !== undefined) push({ kind: 'TACKLE', by: defender, carrier }, D.tackle);
        }
        break;
    }
  };

  for (const e of events) {
    switch (e.t) {
      case 'CARDS':
        offenseCard = e.offense;
        break;
      case 'PLAY':
        playSteps(e.outcome);
        break;
      case 'PUNT':
        push({ kind: 'SNAP' }, D.snap);
        push({ kind: 'KICK', distance: e.distance, good: null }, D.kick);
        break;
      case 'FIELD_GOAL':
        push({ kind: 'SNAP' }, D.snap);
        push({ kind: 'KICK', distance: e.distance, good: e.good }, D.kick);
        push({ kind: 'BANNER', text: e.good ? 'É BOM!' : 'ERROU!', tone: e.good ? 'good' : 'bad' }, D.banner);
        break;
      case 'FIRST_DOWN':
        push({ kind: 'BANNER', text: 'FIRST DOWN!', tone: 'info' }, D.banner);
        break;
      case 'TOUCHDOWN':
        push({ kind: 'BANNER', text: 'TOUCHDOWN!', tone: 'good' }, D.banner);
        break;
      case 'SAFETY':
        push({ kind: 'BANNER', text: 'SAFETY!', tone: 'bad' }, D.banner);
        break;
      case 'TURNOVER':
      case 'TURNOVER_ON_DOWNS':
        push({ kind: 'BANNER', text: 'TROCA DE POSSE!', tone: 'bad' }, D.banner);
        break;
      case 'CONVERSION':
        if (e.choice === 'PAT') {
          push({ kind: 'KICK', distance: 20, good: e.good }, D.kick);
          push({ kind: 'BANNER', text: e.good ? 'PAT BOM!' : 'PAT ERROU!', tone: e.good ? 'good' : 'bad' }, D.banner);
        } else {
          push({ kind: 'BANNER', text: e.good ? 'CONVERSÃO!' : 'FALHOU!', tone: e.good ? 'good' : 'bad' }, D.banner);
        }
        break;
      case 'OVERTIME':
        push({ kind: 'BANNER', text: `PRORROGAÇÃO ${e.round}`, tone: 'info' }, D.banner);
        break;
      case 'MATCH_END':
        push({ kind: 'BANNER', text: 'FIM DE JOGO', tone: 'info' }, D.banner);
        break;
      default:
        break;
    }
  }
  return fitToBudget(steps, TIMELINE_BUDGET_MS);
}
