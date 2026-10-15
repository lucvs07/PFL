import { describe, expect, it } from 'vitest';
import type { RoomState } from '@pfl/protocol';
import {
  connectionMessage,
  connectionState,
  WAKING_AFTER_HEALTH_DOWN_MS,
  WAKING_AFTER_MS,
  type ConnectionInput,
} from '../src/net/connectionState';

type RoomLike = NonNullable<ConnectionInput['room']>;
const room = (status: RoomState['status'], opponentConnected: boolean): RoomLike =>
  ({
    status,
    you: 'A',
    players: [
      { key: 'A', connected: true },
      { key: 'B', connected: opponentConnected },
    ],
  }) as unknown as RoomLike;

const base: ConnectionInput = { connected: true, everConnected: true, startedAt: 0, now: 0, healthDown: false, room: null };

describe('connectionState', () => {
  it('conectado e sem sala: ok', () => {
    expect(connectionState(base)).toEqual({ kind: 'ok' });
  });

  it('primeira conexão ainda dentro do prazo: silencioso', () => {
    expect(connectionState({ ...base, connected: false, everConnected: false, now: WAKING_AFTER_MS - 1 })).toEqual({ kind: 'ok' });
  });

  it('primeira conexão passou do prazo: servidor acordando, com o tempo decorrido', () => {
    expect(connectionState({ ...base, connected: false, everConnected: false, now: 12_000 })).toEqual({ kind: 'waking', elapsedMs: 12_000 });
  });

  it('o /health sem resposta antecipa o aviso', () => {
    const input = { ...base, connected: false, everConnected: false, now: WAKING_AFTER_HEALTH_DOWN_MS };
    expect(connectionState({ ...input, healthDown: false })).toEqual({ kind: 'ok' });
    expect(connectionState({ ...input, healthDown: true }).kind).toBe('waking');
  });

  it('caiu depois de ter conectado: reconectando, nunca acordando', () => {
    expect(connectionState({ ...base, connected: false, everConnected: true, now: 999_999 })).toEqual({ kind: 'reconnecting' });
  });

  it('sala PAUSED: pausada', () => {
    expect(connectionState({ ...base, room: room('PAUSED', true) })).toEqual({ kind: 'paused' });
  });

  it('adversário desconectado durante a partida: pausada', () => {
    expect(connectionState({ ...base, room: room('IN_MATCH', false) })).toEqual({ kind: 'paused' });
  });

  it('adversário desconectado no lobby não é pausa', () => {
    expect(connectionState({ ...base, room: room('WAITING', false) })).toEqual({ kind: 'ok' });
  });

  it('o meu lado desconectado vence a pausa do adversário', () => {
    expect(connectionState({ ...base, connected: false, room: room('PAUSED', false) })).toEqual({ kind: 'reconnecting' });
  });
});

describe('connectionMessage', () => {
  it('ok não mostra nada', () => {
    expect(connectionMessage({ kind: 'ok' })).toBeNull();
  });

  it('acordando: texto fixo para leitor de tela e contador à parte', () => {
    const m = connectionMessage({ kind: 'waking', elapsedMs: 12_400 })!;
    expect(m.title).toBe('Servidor acordando');
    expect(m.text).toContain('até 1 min');
    expect(m.detail).toBe('12 s');
    expect(m.text).not.toContain('12');
  });

  it('reconectando e pausada têm título próprio', () => {
    expect(connectionMessage({ kind: 'reconnecting' })!.title).toBe('Reconectando');
    expect(connectionMessage({ kind: 'paused' })!.title).toBe('Partida pausada');
  });
});
