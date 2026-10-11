import type { TeamKey } from '@pfl/engine';
import { generateRoomCode, normalizeRoomCode } from './codes';
import type { Outgoing } from './outgoing';
import { Room } from './room';
import type { Scheduler, Timings } from './timings';

export interface RoomManagerDeps {
  scheduler: Scheduler;
  timings: Timings;
  random: () => number;
  newToken: () => string;
  send: (code: string, to: TeamKey, msg: Outgoing) => void;
  onRoomClosed?: (code: string) => void;
}

export type JoinResult =
  | { ok: true; room: Room; key: TeamKey; token: string }
  | { ok: false; code: 'ROOM_NOT_FOUND' | 'ROOM_FULL' };

/** Salas em memória por código (spec 8: perdidas se o servidor reiniciar). */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  constructor(private readonly deps: RoomManagerDeps) {}

  create(): { room: Room; key: TeamKey; token: string } {
    const code = generateRoomCode(this.deps.random, (c) => this.rooms.has(c));
    const room = new Room(code, {
      scheduler: this.deps.scheduler,
      timings: this.deps.timings,
      random: this.deps.random,
      newToken: this.deps.newToken,
      send: (to, msg) => this.deps.send(code, to, msg),
      onClose: () => {
        this.rooms.delete(code);
        this.deps.onRoomClosed?.(code);
      },
    });
    this.rooms.set(code, room);
    const seat = room.claimSeat();
    if (!seat) throw new Error('Sala nova sem vaga livre');
    return { room, ...seat };
  }

  join(rawCode: unknown, token?: unknown): JoinResult {
    const code = normalizeRoomCode(rawCode);
    const room = code ? this.rooms.get(code) : undefined;
    if (!room) return { ok: false, code: 'ROOM_NOT_FOUND' };
    const seat = room.claimSeat(token);
    return seat ? { ok: true, room, ...seat } : { ok: false, code: 'ROOM_FULL' };
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  get size(): number {
    return this.rooms.size;
  }

  closeAll(): void {
    for (const room of [...this.rooms.values()]) room.close();
  }
}
