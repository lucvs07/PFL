import type { AudioScores } from '../engine';
import { parseScore } from '../score';
import { LOSE, WIN } from './jingles';
import { MATCH } from './match';
import { MENU } from './menu';

export const SCORES: AudioScores = {
  menu: parseScore(MENU),
  match: parseScore(MATCH),
  win: parseScore(WIN),
  lose: parseScore(LOSE),
};
