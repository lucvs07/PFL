import { describe, expect, it } from 'vitest';
import { failOnConsoleError } from './helpers';
import { RoomManager } from '../src/rooms';
import { realScheduler, resolveTimings } from '../src/timings';

failOnConsoleError();

const manager = () => {
  let n = 0;
  return new RoomManager({
    scheduler: realScheduler,
    timings: resolveTimings(),
    random: Math.random,
    newToken: () => `tok-${++n}`,
    send: () => {},
  });
};

describe('RoomManager', () => {
  it('cria salas com código de 6 letras sem I/O; o criador fica com a vaga A', () => {
    const m = manager();
    const { room, key, token } = m.create();
    expect(room.code).toMatch(/^[A-HJ-NP-Z]{6}$/);
    expect(key).toBe('A');
    expect(token).toBe('tok-1');
    expect(m.get(room.code)).toBe(room);
    expect(m.size).toBe(1);
    m.closeAll();
  });

  it('entra pelo código sem diferenciar maiúsculas; a segunda vaga é B', () => {
    const m = manager();
    const { room } = m.create();
    const joined = m.join(` ${room.code.toLowerCase()} `);
    expect(joined).toMatchObject({ ok: true, key: 'B' });
    m.closeAll();
  });

  it('ROOM_NOT_FOUND para código inexistente ou malformado; ROOM_FULL para o terceiro', () => {
    const m = manager();
    const { room } = m.create();
    m.join(room.code);
    const missing = room.code === 'ZZZZZZ' ? 'YYYYYY' : 'ZZZZZZ';
    expect(m.join(missing)).toEqual({ ok: false, code: 'ROOM_NOT_FOUND' });
    expect(m.join(123)).toEqual({ ok: false, code: 'ROOM_NOT_FOUND' });
    expect(m.join(room.code)).toEqual({ ok: false, code: 'ROOM_FULL' });
    m.closeAll();
  });

  it('token de outra sala não dá vaga numa sala cheia', () => {
    const m = manager();
    const first = m.create();
    m.join(first.room.code);
    const other = m.create();
    expect(m.join(first.room.code, other.token)).toEqual({ ok: false, code: 'ROOM_FULL' });
    m.closeAll();
  });

  it('a sala fechada sai do mapa e o código deixa de existir', () => {
    const closed: string[] = [];
    let n = 0;
    const m = new RoomManager({
      scheduler: realScheduler,
      timings: resolveTimings(),
      random: Math.random,
      newToken: () => `tok-${++n}`,
      send: () => {},
      onRoomClosed: (code) => closed.push(code),
    });
    const { room } = m.create();
    room.close();
    expect(m.get(room.code)).toBeUndefined();
    expect(m.join(room.code)).toEqual({ ok: false, code: 'ROOM_NOT_FOUND' });
    expect(closed).toEqual([room.code]);
  });
});
