import type { TeamKey } from '@pfl/engine';
import type { Outgoing } from '../src/outgoing';

export type PayloadOf<E extends Outgoing['event']> = Extract<Outgoing, { event: E }>['payload'];
export interface Sent {
  to: TeamKey;
  msg: Outgoing;
}

/** Grava as mensagens que a sala/sessão envia, para os testes inspecionarem. */
export function recorder() {
  const sent: Sent[] = [];
  const all = <E extends Outgoing['event']>(to: TeamKey, event: E): PayloadOf<E>[] =>
    sent.filter((s) => s.to === to && s.msg.event === event).map((s) => s.msg.payload as PayloadOf<E>);
  return {
    sent,
    send: (to: TeamKey, msg: Outgoing): void => {
      sent.push({ to, msg });
    },
    /** nomes dos eventos recebidos por um jogador, em ordem */
    events: (to: TeamKey): string[] => sent.filter((s) => s.to === to).map((s) => s.msg.event),
    all,
    last: <E extends Outgoing['event']>(to: TeamKey, event: E): PayloadOf<E> | undefined => all(to, event).at(-1),
    clear: (): void => {
      sent.length = 0;
    },
  };
}
