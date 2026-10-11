import { describe, it, expect } from 'vitest';
import {
  AckError, ERROR_MESSAGES, SESSION_KEY, clearSession, describeFailure, errorReaction, loadSession,
  normalizeRoomCode, saveSession, type Session,
} from '../src/net/session';
import { memoryStorage } from '../src/lib/storage';

const session: Session = { code: 'ABCDEF', token: 'tok-123', you: 'B', teamCode: 'xyz' };

describe('sessão (reconexão por aba)', () => {
  it('salva, carrega e limpa', () => {
    const mem = memoryStorage();
    expect(saveSession(mem, session)).toBe(true);
    expect(loadSession(mem)).toEqual(session);
    clearSession(mem);
    expect(loadSession(mem)).toBeNull();
  });

  it('ignora sessão corrompida ou incompleta', () => {
    const mem = memoryStorage();
    for (const raw of ['{x', JSON.stringify({ ...session, you: 'C' }), JSON.stringify({ ...session, code: 'abc' }), JSON.stringify({ ...session, token: '' })]) {
      mem.setItem(SESSION_KEY, raw);
      expect(loadSession(mem)).toBeNull();
    }
    mem.setItem(SESSION_KEY, JSON.stringify({ ...session, teamCode: 42 }));
    expect(loadSession(mem)?.teamCode).toBeNull();
  });

  it('sem storage: não carrega e informa que não salvou', () => {
    expect(loadSession(null)).toBeNull();
    expect(saveSession(null, session)).toBe(false);
    expect(() => clearSession(null)).not.toThrow();
  });
});

describe('normalizeRoomCode', () => {
  it('aceita 6 letras sem I/O, em qualquer caixa e com espaços', () => {
    expect(normalizeRoomCode(' abc def ')).toBe('ABCDEF');
    expect(normalizeRoomCode('QWERTY')).toBe('QWERTY');
  });

  it('recusa tamanho errado, dígitos e as letras I e O', () => {
    expect(normalizeRoomCode('ABCDE')).toBeNull();
    expect(normalizeRoomCode('ABCDE1')).toBeNull();
    expect(normalizeRoomCode('ABCDIO')).toBeNull();
    expect(normalizeRoomCode('')).toBeNull();
  });
});

describe('errorReaction', () => {
  it('STALE_TURN é silencioso: o servidor reenvia a fase', () => {
    expect(errorReaction({ code: 'STALE_TURN', message: '' })).toEqual({ notice: null, resync: false, leaveRoom: false, rejoin: false });
  });

  it('ENGINE_ERROR mostra o motivo e pede resync', () => {
    expect(errorReaction({ code: 'ENGINE_ERROR', message: 'CARD_NOT_PLAYABLE: punt' })).toEqual({
      notice: 'Ação recusada: CARD_NOT_PLAYABLE: punt', resync: true, leaveRoom: false, rejoin: false,
    });
    expect(errorReaction({ code: 'ENGINE_ERROR', message: 'INVALID_DEPTH: FORMATION_UNFILLABLE' }).notice).toMatch(/recusou o depth chart/);
    expect(errorReaction({ code: 'ENGINE_ERROR', message: 'DEPTH_LOCKED' }).notice).toMatch(/primeiro snap do seu drive/);
  });

  it('sala inexistente ou cheia tira o jogador da sala', () => {
    expect(errorReaction({ code: 'ROOM_NOT_FOUND', message: '' })).toMatchObject({ leaveRoom: true, rejoin: false, notice: ERROR_MESSAGES.ROOM_NOT_FOUND });
    expect(errorReaction({ code: 'ROOM_FULL', message: '' })).toMatchObject({ leaveRoom: true, rejoin: false });
  });

  it('NOT_IN_ROOM não sai da sala: pede novo room:join (emit em buffer antes do rejoin)', () => {
    expect(errorReaction({ code: 'NOT_IN_ROOM', message: '' })).toEqual({ notice: null, resync: false, leaveRoom: false, rejoin: true });
  });

  it('erros de time só avisam', () => {
    expect(errorReaction({ code: 'INVALID_TEAM_CODE', message: '' })).toEqual({ notice: ERROR_MESSAGES.INVALID_TEAM_CODE, resync: false, leaveRoom: false, rejoin: false });
  });

  it('NOT_READY cobre partida pausada, encerrada ou não iniciada', () => {
    expect(ERROR_MESSAGES.NOT_READY).toBe('A partida não está aceitando essa ação agora (pausada, encerrada ou ainda não começou).');
  });

  it('describeFailure traduz AckError e timeouts', () => {
    expect(describeFailure(new AckError({ code: 'ROOM_FULL', message: 'full' }))).toBe(ERROR_MESSAGES.ROOM_FULL);
    expect(describeFailure(new Error('O servidor não respondeu.'))).toBe('O servidor não respondeu.');
    expect(describeFailure('???')).toBe('Erro inesperado.');
  });

  it('describeFailure: ENGINE_ERROR no ack é falha do servidor ao abrir a sala', () => {
    expect(describeFailure(new AckError({ code: 'ENGINE_ERROR', message: 'Erro interno' }))).toBe('O servidor falhou ao abrir a sala. Tente de novo.');
  });
});
