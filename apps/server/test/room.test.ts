import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeTeam } from '@pfl/protocol';
import { Room } from '../src/room';
import { realScheduler, resolveTimings, type TimingsInput } from '../src/timings';
import { electricTeam } from './fixtures';
import { recorder } from './helpers';

const T0 = 1_000_000;

function makeRoom(timings?: TimingsInput) {
  const rec = recorder();
  let closed = 0;
  let tokens = 0;
  const room = new Room('ABCDEF', {
    scheduler: realScheduler,
    timings: resolveTimings(timings),
    random: () => 0.5,
    newToken: () => `tok-${++tokens}`,
    send: rec.send,
    onClose: () => {
      closed += 1;
    },
  });
  return { room, rec, closedCount: () => closed };
}

/** Sala com os dois conectados, times válidos e prontos: a partida já começou. */
function started(timings?: TimingsInput) {
  const h = makeRoom(timings);
  const a = h.room.claimSeat()!;
  const b = h.room.claimSeat()!;
  h.room.connect('A', 'conn-a');
  h.room.connect('B', 'conn-b');
  h.room.submitTeam('A', encodeTeam(electricTeam('Raio')));
  h.room.submitTeam('B', encodeTeam(electricTeam('Trovão')));
  h.room.setReady('A', true);
  h.room.setReady('B', true);
  return { ...h, tokenA: a.token, tokenB: b.token };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('vagas e tokens', () => {
  it('A, depois B; o terceiro cliente fica de fora', () => {
    const { room } = makeRoom();
    expect(room.claimSeat()).toEqual({ key: 'A', token: 'tok-1' });
    expect(room.claimSeat()).toEqual({ key: 'B', token: 'tok-2' });
    expect(room.claimSeat()).toBeNull();
  });

  it('o token devolve a mesma vaga; token de outra sala ou que não é string não dá acesso', () => {
    const { room } = makeRoom();
    const a = room.claimSeat()!;
    room.claimSeat();
    expect(room.claimSeat(a.token)).toEqual(a);
    expect(room.claimSeat('token-de-outra-sala')).toBeNull();
    expect(room.claimSeat(42)).toBeNull();
    expect(room.tokenOf('A')).toBe(a.token);
    expect(room.tokenOf('B')).toBe('tok-2');
  });

  it('com a partida em andamento, só volta quem tem o token', () => {
    const { room, tokenB } = started();
    expect(room.status).toBe('IN_MATCH');
    expect(room.claimSeat()).toBeNull();
    expect(room.claimSeat(tokenB)).toEqual({ key: 'B', token: tokenB });
  });
});

describe('lobby', () => {
  it('room:state traz a visão de cada jogador', () => {
    const { room, rec } = makeRoom();
    room.claimSeat();
    room.connect('A', 'conn-a');
    expect(rec.last('A', 'room:state')).toEqual({
      code: 'ABCDEF',
      you: 'A',
      status: 'WAITING',
      players: [{ key: 'A', connected: true, ready: false, teamName: null, teamErrors: [] }],
    });
    room.claimSeat();
    room.connect('B', 'conn-b');
    expect(rec.last('A', 'room:state')!.players).toHaveLength(2);
    expect(rec.last('B', 'room:state')!.you).toBe('B');
  });

  it('código de time ilegível: INVALID_TEAM_CODE e MALFORMED_TEAM no room:state', () => {
    const { room, rec } = makeRoom();
    room.claimSeat();
    room.connect('A', 'conn-a');
    room.submitTeam('A', '%%%');
    expect(rec.last('A', 'error')!.code).toBe('INVALID_TEAM_CODE');
    expect(rec.last('A', 'room:state')!.players[0]).toMatchObject({ teamName: null, teamErrors: [{ code: 'MALFORMED_TEAM' }] });
    room.submitTeam('A', 12345);
    expect(rec.all('A', 'error')).toHaveLength(2);
  });

  it('time inválido: lista de motivos no room:state, com o nome do time', () => {
    const { room, rec } = makeRoom();
    room.claimSeat();
    room.connect('A', 'conn-a');
    const team = electricTeam('Fraco');
    room.submitTeam('A', encodeTeam({ ...team, roster: team.roster.slice(1) }));
    const player = rec.last('A', 'room:state')!.players[0];
    expect(player.teamName).toBe('Fraco');
    expect(player.teamErrors.map((e) => e.code)).toContain('ROSTER_SIZE');
    expect(rec.all('A', 'error')).toEqual([]);
  });

  it('time válido: sem erros; pronto sem time válido dá TEAM_INVALID', () => {
    const { room, rec } = makeRoom();
    room.claimSeat();
    room.connect('A', 'conn-a');
    room.setReady('A', true);
    expect(rec.last('A', 'error')!.code).toBe('TEAM_INVALID');
    room.submitTeam('A', encodeTeam(electricTeam('Raio')));
    expect(rec.last('A', 'room:state')!.players[0]).toMatchObject({ teamName: 'Raio', teamErrors: [], ready: false });
    room.setReady('A', true);
    expect(rec.last('A', 'room:state')!.players[0].ready).toBe(true);
    room.setReady('A', 'sim');
    expect(rec.last('A', 'room:state')!.players[0].ready).toBe(false);
  });

  it('reenviar o time tira o pronto', () => {
    const { room, rec } = makeRoom();
    room.claimSeat();
    room.connect('A', 'conn-a');
    room.submitTeam('A', encodeTeam(electricTeam('Raio')));
    room.setReady('A', true);
    room.submitTeam('A', encodeTeam(electricTeam('Raio 2')));
    expect(rec.last('A', 'room:state')!.players[0]).toMatchObject({ teamName: 'Raio 2', ready: false });
  });

  it('a partida começa quando os dois estão prontos e válidos, com seed gerada pelo servidor', () => {
    const { room, rec } = started();
    expect(room.status).toBe('IN_MATCH');
    expect(rec.last('A', 'room:state')!.status).toBe('IN_MATCH');
    expect(room.session!.seed).toBe(Math.floor(0.5 * 0x7fffffff));
    expect(room.session!.state.teams.A.team.name).toBe('Raio');
    expect(room.session!.state.teams.B.team.name).toBe('Trovão');
    for (const k of ['A', 'B'] as const) expect(rec.last(k, 'match:phase')!.phase).toBe('FORMATION');
  });

  it('não começa com alguém desconectado; começa quando ele volta', () => {
    const { room } = makeRoom();
    room.claimSeat();
    room.claimSeat();
    room.connect('A', 'conn-a');
    room.connect('B', 'conn-b');
    room.submitTeam('A', encodeTeam(electricTeam('Raio')));
    room.submitTeam('B', encodeTeam(electricTeam('Trovão')));
    room.setReady('A', true);
    room.disconnect('A', 'conn-a');
    room.setReady('B', true);
    expect(room.status).toBe('WAITING');
    room.connect('A', 'conn-a2');
    expect(room.status).toBe('IN_MATCH');
  });

  it('NOT_READY: time ou pronto com a partida em andamento, jogada antes da partida', () => {
    const lobby = makeRoom();
    lobby.room.claimSeat();
    lobby.room.connect('A', 'conn-a');
    lobby.room.play('A', { kind: 'formation', turnId: 1, formation: 'PISTOL' });
    expect(lobby.rec.last('A', 'error')!.code).toBe('NOT_READY');

    const { room, rec } = started();
    room.submitTeam('A', encodeTeam(electricTeam('Outro')));
    expect(rec.last('A', 'error')!.code).toBe('NOT_READY');
    room.setReady('B', false);
    expect(rec.last('B', 'error')!.code).toBe('NOT_READY');
  });

  it('token de outra sala num lobby com vaga livre recebe uma vaga nova com token novo', () => {
    const { room } = makeRoom();
    expect(room.claimSeat('token-de-outra-sala')).toEqual({ key: 'A', token: 'tok-1' });
  });

  it('partida encerrada: play responde NOT_READY em vez de encaminhar à sessão', () => {
    const { room, rec } = started({ resultAnimationMs: 0 });
    for (let i = 0; i < 10_000 && room.status === 'IN_MATCH'; i++) vi.advanceTimersToNextTimer();
    expect(room.status).toBe('FINISHED');
    rec.clear();
    room.play('A', { kind: 'formation', turnId: 1, formation: 'PISTOL' });
    expect(rec.events('A')).toEqual(['error']);
    expect(rec.last('A', 'error')).toEqual({ code: 'NOT_READY', message: 'A partida já terminou' });
  });

  it('play encaminha para a partida', () => {
    const { room, rec } = started();
    room.play('A', { kind: 'formation', turnId: room.session!.state.turnId, formation: 'SPREAD' });
    expect(rec.last('B', 'match:reveal')!.events[0]).toMatchObject({ t: 'FORMATION', formation: 'SPREAD' });
  });
});

describe('desconexão e reconexão', () => {
  it('com um desconectado, os timers seguem e o padrão é aplicado', () => {
    const { room, rec } = started();
    room.disconnect('A', 'conn-a');
    expect(room.status).toBe('IN_MATCH');
    expect(rec.last('B', 'room:state')!.players.find((p) => p.key === 'A')!.connected).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(rec.last('B', 'match:reveal')!.events[0]).toMatchObject({ t: 'FORMATION', formation: 'PISTOL' });
  });

  it('depois da tolerância, a etapa do desconectado expira assim que começa', () => {
    const { room, rec } = started({ reconnectGraceMs: 100 });
    room.disconnect('A', 'conn-a');
    vi.advanceTimersByTime(100);
    expect(rec.all('B', 'match:phase').some((p) => p.phase === 'FORMATION' && p.deadline === T0 + 100)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(rec.last('B', 'match:reveal')!.events[0]).toMatchObject({ t: 'FORMATION', formation: 'PISTOL' });
  });

  it('reconectar com o token devolve a vaga e a visão atual e cancela a tolerância', () => {
    const { room, rec, tokenA } = started({ reconnectGraceMs: 100 });
    room.disconnect('A', 'conn-a');
    vi.advanceTimersByTime(50);
    expect(room.claimSeat(tokenA)).toEqual({ key: 'A', token: tokenA });
    expect(room.connect('A', 'conn-a2')).toBeNull();
    const phase = rec.last('A', 'match:phase')!;
    expect(phase.view.you).toBe('A');
    expect(phase.phase).toBe('FORMATION');
    expect(phase.deadline).toBe(T0 + 5000);
    expect(rec.last('B', 'room:state')!.players.every((p) => p.connected)).toBe(true);
    vi.advanceTimersByTime(100);
    expect(room.session!.actions).toEqual([]); // A não ficou ausente: o deadline de 5 s continua valendo
  });

  it('troca de conexão: devolve a anterior e ignora o disconnect atrasado do socket antigo', () => {
    const { room, rec } = started();
    expect(room.connect('A', 'conn-a2')).toBe('conn-a');
    room.disconnect('A', 'conn-a');
    expect(room.connectionOf('A')).toBe('conn-a2');
    expect(rec.last('B', 'room:state')!.players.every((p) => p.connected)).toBe(true);
    room.disconnect('B', 'conn-b');
    expect(room.status).toBe('IN_MATCH'); // A continua conectado pelo socket novo: não pausa
  });

  it('os dois desconectados: PAUSED com timers parados; quem volta retoma com o tempo restante', () => {
    const { room, rec } = started();
    vi.advanceTimersByTime(2000);
    room.disconnect('A', 'conn-a');
    room.disconnect('B', 'conn-b');
    expect(room.status).toBe('PAUSED');
    vi.advanceTimersByTime(60_000);
    expect(room.session!.actions).toEqual([]);
    room.connect('A', 'conn-a2');
    expect(room.status).toBe('IN_MATCH');
    expect(rec.last('A', 'room:state')!.status).toBe('IN_MATCH');
    expect(rec.last('A', 'match:phase')!.deadline).toBe(T0 + 62_000 + 3000);
  });

  it('ao retomar, quem continua desconectado recebe o restante da tolerância', () => {
    const { room, rec } = started({ reconnectGraceMs: 100 });
    room.disconnect('A', 'conn-a');
    room.disconnect('B', 'conn-b');
    room.connect('A', 'conn-a2');
    room.play('A', { kind: 'formation', turnId: room.session!.state.turnId, formation: 'SPREAD' });
    expect(rec.last('A', 'match:phase')!.phase).toBe('PACKAGE');
    vi.advanceTimersByTime(100);
    vi.advanceTimersByTime(1);
    expect(rec.all('A', 'match:reveal').map((r) => r.events[0]?.t)).toEqual(['FORMATION', 'PACKAGE']);
  });

  it('tolerância parcialmente gasta antes da pausa: só o restante vale depois da retomada', () => {
    const { room, rec } = started({ reconnectGraceMs: 1000 });
    room.disconnect('A', 'conn-a');
    vi.advanceTimersByTime(400);
    room.disconnect('B', 'conn-b');
    expect(room.status).toBe('PAUSED');
    vi.advanceTimersByTime(100_000);
    const resumedAt = T0 + 400 + 100_000;
    room.connect('B', 'conn-b2');
    expect(rec.last('B', 'match:phase')!.deadline).toBe(resumedAt + 4600);
    vi.advanceTimersByTime(599);
    expect(rec.last('B', 'match:phase')!.deadline).toBe(resumedAt + 4600); // A ainda dentro da tolerância
    vi.advanceTimersByTime(1);
    expect(rec.last('B', 'match:phase')!.deadline).toBe(resumedAt + 600); // 600 ms depois da retomada, não 1000
  });

  it('resync reenvia room:state e a etapa atual', () => {
    const { room, rec } = started();
    rec.clear();
    room.resync('B');
    expect(rec.events('B')).toEqual(['room:state', 'match:phase']);
  });
});

describe('salas abandonadas', () => {
  it('lobby sem ninguém conectado fecha depois de 5 min', () => {
    const { room, closedCount } = makeRoom();
    room.claimSeat();
    room.connect('A', 'conn-a');
    room.disconnect('A', 'conn-a');
    vi.advanceTimersByTime(299_999);
    expect(closedCount()).toBe(0);
    vi.advanceTimersByTime(1);
    expect(closedCount()).toBe(1);
    expect(room.isClosed).toBe(true);
    expect(room.claimSeat('tok-1')).toBeNull();
  });

  it('quem volta ao lobby antes dos 5 min cancela o fechamento', () => {
    const { room, closedCount } = makeRoom();
    room.claimSeat();
    room.connect('A', 'conn-a');
    room.disconnect('A', 'conn-a');
    vi.advanceTimersByTime(100_000);
    room.connect('A', 'conn-a2');
    vi.advanceTimersByTime(300_000);
    expect(closedCount()).toBe(0);
  });

  it('partida pausada fecha depois de 5 min e não deixa timers para trás', () => {
    const { room, closedCount } = started();
    room.disconnect('A', 'conn-a');
    room.disconnect('B', 'conn-b');
    vi.advanceTimersByTime(300_000);
    expect(closedCount()).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('close() em partida com tolerância ativa não deixa timers para trás', () => {
    const { room } = started();
    room.disconnect('A', 'conn-a');
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    room.close();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('partida encerrada: FINISHED, match:end no resync e fechamento 5 min depois do fim', () => {
    const { room, rec, closedCount } = started({ resultAnimationMs: 0 });
    for (let i = 0; i < 10_000 && room.status === 'IN_MATCH'; i++) vi.advanceTimersToNextTimer();
    expect(room.status).toBe('FINISHED');
    expect(rec.last('A', 'room:state')!.status).toBe('FINISHED');
    expect(rec.last('B', 'match:end')).toBeDefined();
    rec.clear();
    room.resync('A');
    expect(rec.events('A')).toEqual(['room:state', 'match:end']);
    room.disconnect('A', 'conn-a');
    room.connect('A', 'conn-a2'); // reconectar não adia o fechamento
    expect(rec.last('A', 'match:end')).toBeDefined();
    vi.advanceTimersByTime(300_000);
    expect(closedCount()).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
