import type { GameEvent, PlayOutcome, TeamKey } from '@pfl/engine';
import { findCard } from '@pfl/engine';
import { FORMATION_LABELS, PACKAGE_LABELS, READ_LABELS, READ_SYMBOL, speciesName } from '../lib/names';
import { formatBallOn } from '../lib/format';
import { EFFECT_TEXT, typeEffect } from './effect';

export type LineKind = 'drive' | 'call' | 'play' | 'effect' | 'result' | 'score' | 'system';

export interface NarrationLine {
  text: string;
  kind: LineKind;
}

export interface NarrationContext {
  names: Record<TeamKey, string>;
  possessionsPerTeam: number;
}

const yardsText = (n: number) => `${n} jarda${n === 1 ? '' : 's'}`;
const actorName = (id: number | undefined) => (id === undefined ? null : speciesName(id));

export function outcomeText(o: PlayOutcome): string {
  const defender = actorName(o.defActors[0]);
  switch (o.kind) {
    case 'SACK':
      return `Sack! Perda de ${yardsText(Math.abs(o.yards))}.`;
    case 'INCOMPLETE':
      return 'Passe incompleto.';
    case 'INTERCEPTION':
      return defender ? `Interceptado por ${defender}!` : 'Interceptado!';
    case 'FUMBLE':
      return defender ? `Fumble! ${defender} recupera a bola!` : 'Fumble!';
    case 'GAIN': {
      const base = o.yards > 0 ? `Ganho de ${yardsText(o.yards)}!` : o.yards === 0 ? 'Sem ganho.' : `Perda de ${yardsText(-o.yards)}.`;
      return o.bigPlay ? `Jogada explosiva! ${base}` : base;
    }
  }
}

const isKick = (cardId: string) => {
  const category = findCard(cardId)?.category;
  return category === 'PUNT' || category === 'FIELD_GOAL';
};

/** Transforma eventos do motor em linhas de log ("Jolteon usou Corrida por Fora! É super efetivo!"). */
export function narrate(events: readonly GameEvent[], ctx: NarrationContext): NarrationLine[] {
  const lines: NarrationLine[] = [];
  const add = (text: string, kind: LineKind) => lines.push({ text, kind });
  let cards: { offense: string; defense: string } | null = null;

  for (const e of events) {
    switch (e.t) {
      case 'DRIVE_START':
        if (e.overtimeRound > 0) {
          add(`${ctx.names[e.offense]} ataca na prorrogação ${e.overtimeRound}, bola na ${formatBallOn(e.ballOn)}.`, 'drive');
        } else {
          add(`${ctx.names[e.offense]} começa a posse ${e.possession}/${ctx.possessionsPerTeam} na ${formatBallOn(e.ballOn)}.`, 'drive');
        }
        break;
      case 'FORMATION':
        add(`${ctx.names[e.team]} entra em formação ${FORMATION_LABELS[e.formation]}.`, 'call');
        break;
      case 'PACKAGE':
        add(`${ctx.names[e.team]} responde com o pacote ${PACKAGE_LABELS[e.package]}.`, 'call');
        break;
      case 'CARDS': {
        cards = { offense: e.offense, defense: e.defense };
        if (isKick(e.offense)) break;
        const off = findCard(e.offense)?.name ?? e.offense;
        const def = findCard(e.defense)?.name ?? e.defense;
        add(`${off} × ${def}`, 'call');
        add(`${READ_SYMBOL[e.read]} ${READ_LABELS[e.read]}!`, 'effect');
        break;
      }
      case 'PLAY': {
        const o = e.outcome;
        const offCard = cards ? findCard(cards.offense) : undefined;
        const defCard = cards ? findCard(cards.defense) : undefined;
        const offActor = actorName(o.offActors[0]);
        const defActor = actorName(o.defActors[0]);
        if (offCard && offActor) {
          add(`${offActor} usou ${offCard.name}!`, 'play');
          const effect = typeEffect(offCard.element, o.defActors);
          const text = effect ? EFFECT_TEXT[effect] : null;
          if (text) add(text, 'effect');
        }
        if (defCard && defActor) {
          add(`${defActor} usou ${defCard.name}!`, 'play');
          const effect = typeEffect(defCard.element, o.offActors);
          const text = effect ? EFFECT_TEXT[effect] : null;
          if (text) add(text, 'effect');
        }
        add(outcomeText(o), 'result');
        break;
      }
      case 'PUNT':
        add(`Punt de ${yardsText(e.distance)}!`, 'play');
        break;
      case 'FIELD_GOAL':
        add(`Field goal de ${yardsText(e.distance)}... ${e.good ? 'é bom!' : 'errou!'}`, e.good ? 'score' : 'result');
        break;
      case 'FIRST_DOWN':
        add('FIRST DOWN!', 'result');
        break;
      case 'TOUCHDOWN':
        add(`TOUCHDOWN de ${ctx.names[e.team]}!`, 'score');
        break;
      case 'SAFETY':
        add(`Safety! 2 pontos para ${ctx.names[e.team]}.`, 'score');
        break;
      case 'CONVERSION':
        if (e.choice === 'PAT') {
          add(e.good ? `PAT convertido por ${ctx.names[e.team]}!` : `${ctx.names[e.team]} perdeu o PAT.`, e.good ? 'score' : 'result');
        } else {
          add(e.good ? `Conversão de 2 de ${ctx.names[e.team]}!` : `A conversão de 2 de ${ctx.names[e.team]} falhou.`, e.good ? 'score' : 'result');
        }
        break;
      case 'TURNOVER_ON_DOWNS':
        add('Turnover on downs! A bola troca de mãos.', 'result');
        break;
      case 'TURNOVER':
        add('A bola troca de mãos!', 'result');
        break;
      case 'OVERTIME':
        add(`Prorrogação ${e.round}!`, 'system');
        break;
      case 'MATCH_END':
        add(`Fim de jogo! ${ctx.names.A} ${e.score.A} × ${e.score.B} ${ctx.names.B}`, 'system');
        break;
      default:
        break;
    }
  }
  return lines;
}
