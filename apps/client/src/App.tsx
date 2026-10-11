import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { FormationId, PackageId, Team } from '@pfl/engine';
import {
  encodeTeam,
  type EndMessage,
  type ErrorMessage,
  type PhaseMessage,
  type ResultMessage,
  type RevealMessage,
  type RoomState,
} from '@pfl/protocol';
import { createRoom, createSocket, emitIfConnected, joinRoom, type Joined, type PflSocket } from './net/socket';
import { clearSession, describeFailure, errorReaction, loadSession, saveSession, type Session } from './net/session';
import { getSessionStorage, memoryStorage } from './lib/storage';
import { canSubmitCard, initialMatchState, matchReducer, needsResync, panelMode } from './match/matchState';
import { resolvePendingDepth, type DepthDraft, type PendingDepth } from './match/depthDraft';
import { importTeamCode } from './builder/teamStore';
import { draftToTeam } from './builder/draft';
import { namesFromRoom, screenFor, type LocalScreen } from './app/screen';
import { useNow } from './app/useNow';
import { HomeScreen } from './screens/HomeScreen';
import { BuilderScreen } from './screens/builder/BuilderScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { MatchScreen } from './screens/match/MatchScreen';
import { EndScreen } from './screens/end/EndScreen';

function teamFromCode(code: string | null): Team | null {
  if (!code) return null;
  const result = importTeamCode(code);
  return result.ok ? draftToTeam(result.draft) : null;
}

export function App() {
  // useRef com guarda (e não useMemo): no StrictMode o useMemo roda duas vezes e o socket descartado já teria conectado.
  const socketRef = useRef<PflSocket | null>(null);
  if (socketRef.current === null) socketRef.current = createSocket();
  const socket = socketRef.current;
  const storage = useMemo(() => getSessionStorage() ?? memoryStorage(), []);
  const sessionRef = useRef<Session | null>(null);
  const sessionLoaded = useRef(false);
  if (!sessionLoaded.current) {
    sessionLoaded.current = true;
    sessionRef.current = loadSession(storage);
  }

  const [local, setLocal] = useState<LocalScreen>('HOME');
  const [room, setRoom] = useState<RoomState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [myTeam, setMyTeam] = useState<Team | null>(() => teamFromCode(sessionRef.current?.teamCode ?? null));
  const [match, dispatch] = useReducer(matchReducer, undefined, initialMatchState);
  const matchRef = useRef(match);
  matchRef.current = match;
  const pendingDepth = useRef<PendingDepth | null>(null);
  const resyncAsked = useRef(false);
  // Retomada já tentada nesta conexão: evita laço NOT_IN_ROOM -> room:join -> NOT_IN_ROOM.
  const rejoinTried = useRef(false);
  const now = useNow(room ? 200 : null);

  const updateSession = useCallback(
    (s: Session | null) => {
      sessionRef.current = s;
      if (s) saveSession(storage, s);
      else clearSession(storage);
    },
    [storage],
  );

  const leave = useCallback(() => {
    updateSession(null);
    setRoom(null);
    setMyTeam(null);
    dispatch({ type: 'RESET' });
    pendingDepth.current = null;
    resyncAsked.current = false;
    setLocal('HOME');
    socket.disconnect();
    socket.connect();
  }, [socket, updateSession]);

  const onJoined = useCallback(
    (j: Joined) => {
      const prev = sessionRef.current;
      updateSession({ code: j.code, token: j.token, you: j.you, teamCode: prev && prev.code === j.code ? prev.teamCode : null });
    },
    [updateSession],
  );

  // Eventos do servidor. Ao (re)conectar com sessão salva, volta para a mesma vaga com o token.
  useEffect(() => {
    const rejoin = () => {
      const s = sessionRef.current;
      if (!s) return;
      rejoinTried.current = true;
      joinRoom(socket, s.code, s.token)
        .then((j) => {
          onJoined(j);
          const m = matchRef.current;
          if (m.view && !m.end) emitIfConnected(socket, 'match:resync'); // reconexão no meio da partida: estado atual
        })
        .catch((err: unknown) => {
          updateSession(null);
          setRoom(null);
          dispatch({ type: 'RESET' });
          setNotice(`Não foi possível voltar à sala ${s.code}: ${describeFailure(err)}`);
        });
    };
    const onConnect = () => {
      rejoinTried.current = false;
      rejoin();
    };
    const onRoom = (s: RoomState) => {
      setRoom(s);
      dispatch({ type: 'NAMES', names: namesFromRoom(s) });
    };
    const onPhase = (m: PhaseMessage) => {
      const pending = pendingDepth.current;
      if (pending && resolvePendingDepth(pending, m) === 'commit') {
        pendingDepth.current = null;
        setMyTeam((t) => (t ? { ...t, depth: pending.draft.depth, keepOnField: pending.draft.keepOnField } : t));
      }
      dispatch({ type: 'PHASE', msg: m });
    };
    const onReveal = (m: RevealMessage) => dispatch({ type: 'REVEAL', msg: m });
    const onResult = (m: ResultMessage) => dispatch({ type: 'RESULT', msg: m, now: Date.now() });
    const onEnd = (m: EndMessage) => {
      dispatch({ type: 'END', msg: m });
      updateSession(null); // a partida acabou: recarregar a aba não deve tentar voltar a ela
    };
    const onError = (e: ErrorMessage) => {
      // Qualquer erro (ENGINE_ERROR, STALE_TURN...) pode ser a recusa do team:depth, que não tem ack: descarta o pendente.
      // O rascunho continua "sujo" e é reenviado na próxima janela.
      pendingDepth.current = null;
      const reaction = errorReaction(e);
      dispatch({ type: 'ERROR', error: e });
      if (reaction.notice) setNotice(reaction.notice);
      // NOT_IN_ROOM: emits em buffer chegaram antes do room:join de retomada; retoma uma vez por conexão.
      if (reaction.rejoin && sessionRef.current && !rejoinTried.current) rejoin();
      if (reaction.resync) emitIfConnected(socket, 'match:resync');
      if (reaction.leaveRoom) leave();
    };

    socket.on('connect', onConnect);
    socket.on('room:state', onRoom);
    socket.on('match:phase', onPhase);
    socket.on('match:reveal', onReveal);
    socket.on('match:result', onResult);
    socket.on('match:end', onEnd);
    socket.on('error', onError);
    if (socket.connected) rejoin();
    return () => {
      socket.off('connect', onConnect);
      socket.off('room:state', onRoom);
      socket.off('match:phase', onPhase);
      socket.off('match:reveal', onReveal);
      socket.off('match:result', onResult);
      socket.off('match:end', onEnd);
      socket.off('error', onError);
    };
  }, [socket, onJoined, updateSession, leave]);

  // Aba recarregada no meio da partida: um único match:resync até chegar a primeira view.
  useEffect(() => {
    if (!room) return;
    if (!needsResync(room.status, match)) {
      if (match.view) resyncAsked.current = false;
      return;
    }
    if (resyncAsked.current) return;
    if (emitIfConnected(socket, 'match:resync')) resyncAsked.current = true;
  }, [room, match, socket]);

  // O time enviado vai junto com a sessão da aba, para a prévia de escalação e o depth sobreviverem ao F5.
  useEffect(() => {
    const s = sessionRef.current;
    if (s && myTeam) updateSession({ ...s, teamCode: encodeTeam(myTeam) });
  }, [myTeam, updateSession]);

  const enterRoom = (action: Promise<Joined>) => {
    setBusy(true);
    setNotice(null);
    action
      .then((j) => {
        setMyTeam(null);
        dispatch({ type: 'RESET' });
        onJoined(j);
      })
      .catch((err: unknown) => setNotice(describeFailure(err)))
      .finally(() => setBusy(false));
  };

  const submitTeam = (team: Team) => {
    socket.emit('team:submit', { teamCode: encodeTeam(team) });
    setMyTeam(team);
  };

  const sendFormation = (formation: FormationId) => {
    const m = matchRef.current;
    if (!m.view || panelMode(m, Date.now()) !== 'PICK_FORMATION') return;
    if (emitIfConnected(socket, 'play:formation', { turnId: m.view.turnId, formation })) {
      dispatch({ type: 'SENT', turnId: m.view.turnId, phase: 'FORMATION' });
    }
  };

  const sendPackage = (pkg: PackageId) => {
    const m = matchRef.current;
    if (!m.view || panelMode(m, Date.now()) !== 'PICK_PACKAGE') return;
    if (emitIfConnected(socket, 'play:package', { turnId: m.view.turnId, package: pkg })) {
      dispatch({ type: 'SENT', turnId: m.view.turnId, phase: 'PACKAGE' });
    }
  };

  const sendCard = (cardId: string) => {
    const m = matchRef.current;
    if (!m.view || !canSubmitCard(m, cardId, Date.now())) return;
    if (emitIfConnected(socket, 'play:card', { turnId: m.view.turnId, cardId })) {
      dispatch({ type: 'SENT', turnId: m.view.turnId, phase: 'PLAYCALL' });
    }
  };

  const sendConversion = (choice: 'PAT' | 'TWO') => {
    const m = matchRef.current;
    if (!m.view || panelMode(m, Date.now()) !== 'PICK_CONVERSION') return;
    if (emitIfConnected(socket, 'play:conversion', { turnId: m.view.turnId, choice })) {
      dispatch({ type: 'SENT', turnId: m.view.turnId, phase: 'CONVERSION' });
    }
  };

  const sendDepth = useCallback(
    (draft: DepthDraft) => {
      const m = matchRef.current;
      if (!m.view) return;
      const turnId = m.view.turnId;
      if (emitIfConnected(socket, 'team:depth', { turnId, depth: draft.depth, keepOnField: draft.keepOnField })) {
        pendingDepth.current = { turnId, draft };
      }
    },
    [socket],
  );

  const screen = screenFor({ local, room, match, now: room ? now : Date.now() });

  return (
    <>
      {notice && (
        <div className="notice notice-top" role="status">
          <span>{notice}</span>
          <button type="button" className="btn btn-small" onClick={() => setNotice(null)}>
            OK
          </button>
        </div>
      )}
      {screen === 'HOME' && (
        <HomeScreen
          busy={busy}
          onCreate={() => enterRoom(createRoom(socket))}
          onJoin={(code) => enterRoom(joinRoom(socket, code))}
          onBuilder={() => setLocal('BUILDER')}
        />
      )}
      {screen === 'BUILDER' && <BuilderScreen onBack={() => setLocal('HOME')} />}
      {screen === 'LOBBY' && room && (
        <LobbyScreen
          room={room}
          myTeam={myTeam}
          onSubmitTeam={submitTeam}
          onReady={(ready) => socket.emit('room:ready', { ready })}
          onLeave={leave}
        />
      )}
      {screen === 'MATCH' && room && (
        <MatchScreen
          state={match}
          room={room}
          myTeam={myTeam}
          now={now}
          onFormation={sendFormation}
          onPackage={sendPackage}
          onCard={sendCard}
          onConversion={sendConversion}
          onSendDepth={sendDepth}
        />
      )}
      {screen === 'END' && match.end && <EndScreen end={match.end} you={room?.you ?? 'A'} onLeave={leave} />}
    </>
  );
}
