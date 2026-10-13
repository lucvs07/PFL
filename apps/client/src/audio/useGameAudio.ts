import { useEffect, useRef } from 'react';
import type { RoomState } from '@pfl/protocol';
import type { Screen } from '../app/screen';
import { panelMode, type MatchClientState, type PanelMode } from '../match/matchState';
import { installBrowserHooks } from './browser';
import { animationCues, jingleFor, musicForScreen, turnStartCue } from './gameAudio';
import { audio } from './index';

interface Input {
  screen: Screen;
  match: MatchClientState;
  room: RoomState | null;
  notice: string | null;
  now: number;
}

/** Liga o estado do jogo ao áudio. Chamado uma vez, em App.tsx. */
export function useGameAudio({ screen, match, room, notice, now }: Input): void {
  useEffect(() => installBrowserHooks(audio), []);

  // Música pela tela.
  useEffect(() => {
    audio.setMusic(musicForScreen(screen));
  }, [screen]);

  // Jingle ao entrar na tela de fim.
  useEffect(() => {
    if (screen !== 'END' || !match.end) return;
    const jingle = jingleFor(match.end.score, room?.you ?? 'A');
    if (jingle) audio.playJingle(jingle);
  }, [screen, match.end, room?.you]);

  // Sons da jogada: uma vez por animação nova.
  const lastSeq = useRef(0);
  useEffect(() => {
    const a = match.animation;
    if (!a) {
      lastSeq.current = 0;
      return;
    }
    if (a.seq === lastSeq.current) return;
    lastSeq.current = a.seq;
    const youAreOffense = room ? a.stage.offenseTeam === room.you : null;
    audio.playCues(animationCues(a, youAreOffense, Date.now()));
  }, [match.animation, room]);

  // Aviso de vez.
  const prevMode = useRef<PanelMode | null>(null);
  const mode = room ? panelMode(match, now) : null;
  useEffect(() => {
    if (mode === null) {
      prevMode.current = null;
      return;
    }
    const cue = turnStartCue(prevMode.current, mode);
    prevMode.current = mode;
    if (cue && screen === 'MATCH') audio.play(cue);
  }, [mode, screen]);

  // Erros.
  useEffect(() => {
    if (match.lastError) audio.play('ui-error');
  }, [match.lastError]);
  useEffect(() => {
    if (notice) audio.play('ui-error');
  }, [notice]);
}
