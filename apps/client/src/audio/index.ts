import { getLocalStorage } from '../lib/storage';
import { createAudio } from './engine';
import { SCORES } from './scores';
import { createWebBackend } from './webBackend';

export type { Audio, AudioState, JingleName, MusicName } from './engine';

/** Instância única do app. Em Node (testes) o backend é o "indisponível" e o storage é nulo. */
export const audio = createAudio({ backend: createWebBackend(), storage: getLocalStorage(), scores: SCORES });
