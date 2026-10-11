export type EngineErrorCode =
  | 'INVALID_TEAM'
  | 'MATCH_OVER'
  | 'WRONG_PHASE'
  | 'WRONG_TEAM'
  | 'ALREADY_CHOSEN'
  | 'CARD_NOT_PLAYABLE'
  | 'UNKNOWN_FORMATION'
  | 'UNKNOWN_PACKAGE';

export class EngineError extends Error {
  readonly code: EngineErrorCode;

  constructor(code: EngineErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'EngineError';
    this.code = code;
  }
}
