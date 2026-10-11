import { DEFENSE_SLOTS, FORMATIONS, OFFENSE_SLOTS, PACKAGES, ROSTER_SIZE, type Action, type FormationId, type PackageId, type Team, type TeamKey } from '@pfl/engine';

/** Intenção de jogo já validada quanto ao formato. A validação de regra é do motor. */
export type PlayRequest =
  | { kind: 'formation'; turnId: number; formation: FormationId }
  | { kind: 'package'; turnId: number; package: PackageId }
  | { kind: 'card'; turnId: number; cardId: string }
  | { kind: 'conversion'; turnId: number; choice: 'PAT' | 'TWO' }
  | { kind: 'depth'; turnId: number; depth: Team['depth']; keepOnField: number[] };

export type PlayEvent = 'play:formation' | 'play:package' | 'play:card' | 'play:conversion' | 'team:depth';

const MAX_CARD_ID_LENGTH = 64;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const DEPTH_KEYS: ReadonlySet<string> = new Set<string>([...OFFENSE_SLOTS, ...DEFENSE_SLOTS]);

/** Lista curta de inteiros seguros: limita o custo de guardar e revalidar o payload. */
const isIdList = (v: unknown): v is number[] =>
  Array.isArray(v) && v.length <= ROSTER_SIZE && v.every((n) => Number.isSafeInteger(n));

/** Nunca lança. Devolve null para qualquer payload fora do formato do contrato. */
export function parsePlay(event: PlayEvent, payload: unknown): PlayRequest | null {
  if (!isRecord(payload) || !Number.isSafeInteger(payload.turnId)) return null;
  const turnId = payload.turnId as number;
  switch (event) {
    case 'play:formation': {
      const f = payload.formation;
      return typeof f === 'string' && Object.hasOwn(FORMATIONS, f) ? { kind: 'formation', turnId, formation: f as FormationId } : null;
    }
    case 'play:package': {
      const p = payload.package;
      return typeof p === 'string' && Object.hasOwn(PACKAGES, p) ? { kind: 'package', turnId, package: p as PackageId } : null;
    }
    case 'play:card': {
      const c = payload.cardId;
      return typeof c === 'string' && c.length <= MAX_CARD_ID_LENGTH ? { kind: 'card', turnId, cardId: c } : null;
    }
    case 'play:conversion': {
      const c = payload.choice;
      return c === 'PAT' || c === 'TWO' ? { kind: 'conversion', turnId, choice: c } : null;
    }
    case 'team:depth': {
      const { depth, keepOnField } = payload;
      if (!isRecord(depth) || !Object.keys(depth).every((k) => DEPTH_KEYS.has(k) && isIdList(depth[k]))) return null;
      return isIdList(keepOnField)
        ? { kind: 'depth', turnId, depth: depth as Team['depth'], keepOnField }
        : null;
    }
  }
}

/** O time vem da vaga do socket, nunca do payload. */
export function toAction(team: TeamKey, req: PlayRequest): Action {
  switch (req.kind) {
    case 'formation':
      return { type: 'FORMATION', team, formation: req.formation };
    case 'package':
      return { type: 'PACKAGE', team, package: req.package };
    case 'card':
      return { type: 'CARD', team, cardId: req.cardId };
    case 'conversion':
      return { type: 'CONVERSION', team, choice: req.choice };
    case 'depth':
      return { type: 'SET_DEPTH', team, depth: req.depth, keepOnField: req.keepOnField };
  }
}
