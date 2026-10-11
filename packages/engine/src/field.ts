import type { FieldState, PlayOutcome } from './model';

export type DriveEnd =
  | { kind: 'TOUCHDOWN' }
  | { kind: 'SAFETY' }
  | { kind: 'CONVERSION' }
  | { kind: 'FIELD_GOAL'; good: boolean; ballOn: number }
  | { kind: 'PUNT'; landing: number }
  | { kind: 'TURNOVER'; spot: number }
  | { kind: 'DOWNS'; spot: number };

export interface PlayAdvance {
  field: FieldState;
  firstDown: boolean;
  end: DriveEnd | null;
}

export const TOUCHBACK = 25;
export const MISSED_FG_MIN = 20;
export const KICK_SPOT_OFFSET = 7;

const clampSpot = (yard: number): number => Math.min(99, Math.max(1, yard));

export function advanceField(field: FieldState, outcome: PlayOutcome): PlayAdvance {
  if (outcome.kind === 'INTERCEPTION' || outcome.kind === 'FUMBLE') {
    return { field, firstDown: false, end: { kind: 'TURNOVER', spot: clampSpot(field.ballOn + outcome.yards) } };
  }
  const yards = outcome.kind === 'INCOMPLETE' ? 0 : outcome.yards;
  const ballOn = field.ballOn + yards;
  if (ballOn >= 100) return { field, firstDown: false, end: { kind: 'TOUCHDOWN' } };
  if (ballOn <= 0) return { field, firstDown: false, end: { kind: 'SAFETY' } };

  const toGo = field.yardsToGo - yards;
  if (toGo <= 0) {
    return { field: { down: 1, yardsToGo: Math.min(10, 100 - ballOn), ballOn }, firstDown: true, end: null };
  }
  if (field.down >= 4) return { field, firstDown: false, end: { kind: 'DOWNS', spot: ballOn } };
  return { field: { down: field.down + 1, yardsToGo: toGo, ballOn }, firstDown: false, end: null };
}

/** Linha de início do próximo drive, do ponto de vista do novo atacante (spec 2.1). */
export function nextDriveStart(end: DriveEnd): number {
  switch (end.kind) {
    case 'TOUCHDOWN':
    case 'SAFETY':
    case 'CONVERSION':
      return TOUCHBACK;
    case 'FIELD_GOAL':
      return end.good ? TOUCHBACK : Math.max(100 - (end.ballOn - KICK_SPOT_OFFSET), MISSED_FG_MIN);
    case 'PUNT':
      return end.landing >= 100 ? TOUCHBACK : 100 - end.landing;
    case 'TURNOVER':
    case 'DOWNS':
      return 100 - end.spot;
  }
}
