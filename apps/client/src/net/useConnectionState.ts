import { useEffect, useRef, useState } from 'react';
import type { RoomState } from '@pfl/protocol';
import { useNow } from '../app/useNow';
import { connectionState, type ConnectionState } from './connectionState';
import { serverUrl, type PflSocket } from './socket';
import { warmServer } from './warmServer';

/** Liga o socket, o relógio e o ping de /health à função pura `connectionState`. */
export function useConnectionState(socket: PflSocket, room: RoomState | null): ConnectionState {
  const [connected, setConnected] = useState(socket.connected);
  const [everConnected, setEverConnected] = useState(socket.connected);
  const [healthDown, setHealthDown] = useState(false);
  const startedAt = useRef(Date.now());
  // o relógio só corre enquanto desconectado: o contador de "acordando" precisa dele
  const now = useNow(connected ? null : 1000);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      setEverConnected(true);
    };
    const onDisconnect = () => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [socket]);

  useEffect(() => {
    let alive = true;
    void warmServer(serverUrl()).then((up) => {
      if (alive) setHealthDown(!up);
    });
    return () => {
      alive = false;
    };
  }, []);

  return connectionState({ connected, everConnected, startedAt: startedAt.current, now, healthDown, room });
}
