import type { TeamKey } from '@pfl/engine';
import type { ServerToClientEvents } from '@pfl/protocol';

/** Uma mensagem servidor → cliente: o nome do evento e o payload tipado. */
export type Outgoing = {
  [E in keyof ServerToClientEvents]: { event: E; payload: Parameters<ServerToClientEvents[E]>[0] };
}[keyof ServerToClientEvents];

export type Send = (to: TeamKey, msg: Outgoing) => void;
