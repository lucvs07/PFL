import { useSyncExternalStore } from 'react';
import { audio } from './index';
import type { AudioState } from './engine';

export function useAudioState(): AudioState {
  return useSyncExternalStore(audio.subscribe, audio.getState, audio.getState);
}
