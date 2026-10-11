# PFL — Contratos entre os Planos 2, 3 e 4

Este documento fixa os nomes, tipos e eventos que mais de um plano usa. Se um plano mudar algo daqui, precisa atualizar este arquivo e os outros planos que o consomem.

## 1. Plano 2 → Planos 3 e 4 (engine)

O Plano 2 adiciona ao `@pfl/engine`:

```ts
// packages/engine/src/teams/suggested.ts (reexportado em src/index.ts)
export const SUGGESTED_TEAMS: readonly Team[]; // 6 times válidos (validateTeam === [])
```

O catálogo `CARDS` cresce para cerca de 60 de tipo + 20 assinatura. **Todos os 35 ids do Plano 1 continuam existindo, com o mesmo significado.**

O bot heurístico vive em `packages/sim/src/bot.ts`:

```ts
export function botAction(state: MatchState, team: TeamKey, rng: number): { action: Action; rng: number };
```

## 2. Plano 3 → Plano 4 (engine: ajuste manual do depth chart)

O Plano 3 adiciona ao engine:

- **Nova ação:** `{ type: 'SET_DEPTH'; team: TeamKey; depth: Team['depth']; keepOnField: number[] }`.
  - Aceita somente na fase `FORMATION` do **primeiro snap de um drive**.
  - Pode ser enviada pelos dois times: o ataque e a defesa daquele drive.
  - Não muda a fase.
  - Revalida o time com `validateTeam`. Se for inválido, lança `EngineError('INVALID_DEPTH')`.
- **Novo campo** `MatchState.snapInDrive: number` (1 no primeiro snap do drive).
- **Novo campo** `PlayerView.canEditDepth: boolean`.
- **Novos códigos de `EngineErrorCode`:** `'INVALID_DEPTH' | 'DEPTH_LOCKED'`.

## 3. Pacote `@pfl/protocol` (criado no Plano 3, consumido pelo Plano 4)

Local: `packages/protocol/src/index.ts`. Depende só de `@pfl/engine` (tipos).

```ts
import type { Action, FormationId, GameEvent, PackageId, Phase, PlayerView, Team, TeamError, TeamKey } from '@pfl/engine';

export const ROOM_CODE_LENGTH = 6;           // letras A–Z sem I/O
export const PHASE_SECONDS: Record<Exclude<Phase, 'MATCH_END'>, number> = {
  FORMATION: 5, PACKAGE: 4, PLAYCALL: 8, CONVERSION: 8,
};
export const RESULT_ANIMATION_MS = 4500;     // folga antes do próximo timer após match:result
export const RECONNECT_GRACE_MS = 60_000;
export const BOTH_DISCONNECTED_CLOSE_MS = 5 * 60_000;

export type RoomStatus = 'WAITING' | 'IN_MATCH' | 'PAUSED' | 'FINISHED';
export interface RoomPlayer {
  key: TeamKey;
  connected: boolean;
  ready: boolean;
  teamName: string | null;
  teamErrors: TeamError[];
}
export interface RoomState { code: string; you: TeamKey; status: RoomStatus; players: RoomPlayer[]; }

export interface PhaseMessage { turnId: number; phase: Phase; deadline: number /* epoch ms */; view: PlayerView; }
export interface RevealMessage { turnId: number; events: GameEvent[]; }               // após FORMATION/PACKAGE
export interface ResultMessage { turnId: number; events: GameEvent[]; view: PlayerView; } // após resolução/conversão
export interface PokemonMatchStats { speciesId: number; team: TeamKey; plays: number; yards: number; touchdowns: number; }
export interface MatchStats { pokemon: PokemonMatchStats[]; yards: Record<TeamKey, number>; turnovers: Record<TeamKey, number>; sacks: Record<TeamKey, number>; }
export interface ReplayData { seed: number; teams: Record<TeamKey, Team>; actions: Action[]; }
export interface EndMessage { score: Record<TeamKey, number>; stats: MatchStats; replay: ReplayData; }

export type ErrorCode =
  | 'ROOM_NOT_FOUND' | 'ROOM_FULL' | 'NOT_IN_ROOM' | 'INVALID_TEAM_CODE' | 'TEAM_INVALID'
  | 'NOT_READY' | 'STALE_TURN' | 'ENGINE_ERROR';
export interface ErrorMessage { code: ErrorCode; message: string; }

export type Ack<T> = (res: { ok: true; data: T } | { ok: false; error: ErrorMessage }) => void;

export interface ClientToServerEvents {
  'room:create': (ack: Ack<{ code: string; you: TeamKey; token: string }>) => void;
  'room:join': (p: { code: string; token?: string }, ack: Ack<{ code: string; you: TeamKey; token: string }>) => void;
  'team:submit': (p: { teamCode: string }) => void;
  'room:ready': (p: { ready: boolean }) => void;
  'play:formation': (p: { turnId: number; formation: FormationId }) => void;
  'play:package': (p: { turnId: number; package: PackageId }) => void;
  'play:card': (p: { turnId: number; cardId: string }) => void;
  'play:conversion': (p: { turnId: number; choice: 'PAT' | 'TWO' }) => void;
  'team:depth': (p: { turnId: number; depth: Team['depth']; keepOnField: number[] }) => void;
  'match:resync': () => void;
}

export interface ServerToClientEvents {
  'room:state': (s: RoomState) => void;
  'match:phase': (m: PhaseMessage) => void;
  'match:reveal': (m: RevealMessage) => void;
  'match:result': (m: ResultMessage) => void;
  'match:end': (m: EndMessage) => void;
  'error': (e: ErrorMessage) => void;
}

// Código de time (exportar/importar, spec 5.5): JSON → base64url. Funciona em Node e no navegador.
export function encodeTeam(team: Team): string;
export function decodeTeam(code: string): unknown;   // nunca lança; devolve null se o código não decodificar
// plays = vezes como ator; yards/touchdowns creditados ao ator de habilidade do ataque (RB/WR/TE/FB, ou o QB
// se nenhum), identificado pela vaga na lineup do evento FORMATION mais recente.
export function computeStats(events: readonly GameEvent[]): MatchStats;
```

**Reconexão:**
- `room:create` e `room:join` devolvem um `token` opaco.
- O cliente guarda o token em `sessionStorage` e o reenvia em `room:join` para retomar a mesma vaga (A ou B).

**Ordem dos eventos numa jogada:**
1. `match:phase` (FORMATION)
2. `match:reveal` (evento FORMATION)
3. `match:phase` (PACKAGE)
4. `match:reveal` (evento PACKAGE)
5. `match:phase` (PLAYCALL)
6. `match:result` (CARDS, PLAY e demais eventos)
7. `match:phase` do próximo snap, com `deadline` incluindo `RESULT_ANIMATION_MS`

Quando a partida acaba, `match:end` substitui o último `match:phase`.

**Turnos:** toda ação `play:*` e `team:depth` carrega o `turnId`. Se ele for diferente do atual, o servidor responde com `error { code: 'STALE_TURN' }` e reenvia o `match:phase` atual.

## 4. Scripts e portas

- **Raiz:**
  - `npm run dev:server`: server em `http://localhost:3001`
  - `npm run dev:client`: Vite em `http://localhost:5173`, que acessa o servidor via `VITE_SERVER_URL` (padrão `http://localhost:3001`)
  - `npm run sim -- --games N`: simulador do Plano 2
- **Testes:** o `vitest.config.ts` da raiz passa a incluir `apps/**/test/**/*.test.ts` e `packages/**/test/**/*.test.ts`.

## 5. Ajustes registrados após a escrita dos planos (2026-10-10)

Os autores dos Planos 2–4 levantaram os pontos abaixo. Eles valem como contrato.

- **Catálogo:** o Plano 1 tem **40** cartas (3 básicas + 2 especiais + 35 de tipo/assinatura). O Plano 2 preserva os 40 ids e chega a 85.
- **`PlayOutcome`** (Plano 2) ganha os campos obrigatórios `readFactor`, `statFactor` e `varianceFactor`.
  - `READ_YARDS` passa a ser exportado.
  - Todo literal de `PlayOutcome` em testes precisa incluir os três campos.
- **`SUGGESTED_TEAMS`:** a ordem importa para os testes do simulador.
- **`packages/sim`** exporta também `actingTeams(state)`. `botAction` lança erro se o time não precisa agir na fase atual.
- **`ROOM_CODE_ALPHABET`:** `@pfl/protocol` exporta `ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'`.
- **`match:phase` idempotente:** pode ser reenviado com o mesmo `(turnId, phase)` nestes casos:
  - o adversário escolheu a carta;
  - confirmação de `team:depth`;
  - mudança de deadline por ausência ou pausa;
  - `match:resync`.

  O cliente trata a mensagem como estado e não como transição.
- **`turnId`:** FORMATION, PACKAGE e PLAYCALL do mesmo snap compartilham o `turnId`. Uma ação da fase errada com o `turnId` atual (inclusive a que perde a corrida contra o deadline) gera `error { code: 'ENGINE_ERROR' }`, com o código do motor na `message`.
- **`ResultMessage.turnId`** é o `turnId` do snap resolvido. O cliente deduplica com `<=`.
- **Erros de entrada na sala:** `ROOM_NOT_FOUND` e `ROOM_FULL` chegam só pelo Ack. Payload malformado gera `ENGINE_ERROR`; evento fora de sala gera `NOT_IN_ROOM`.
- **`MatchStats`:**
  - `sacks[K]` = sacks **feitos pela defesa** de K;
  - `turnovers[K]` = turnovers **cometidos** por K;
  - sacks não são creditados a nenhum Pokémon.
- **Janela de `SET_DEPTH`:** vale só na etapa FORMATION do primeiro snap do drive. O cliente (Plano 4) mantém um rascunho de depth editável a qualquer momento e o **envia automaticamente** assim que `canEditDepth` fica verdadeiro. Assim a janela curta não exige ação humana.
- **Replay:** `ReplayData` usa `DEFAULT_CONFIG`. `teams` são os times iniciais e os `SET_DEPTH` ficam em `actions`.
- **Ajustes do Plano 1 após a revisão final** (já no branch `pfl-1-engine`):
  - `EngineErrorCode` ganha `'INVALID_CHOICE'` (escolha de conversão diferente de `'PAT'`/`'TWO'`). O Plano 3 acrescenta `'INVALID_DEPTH' | 'DEPTH_LOCKED'` sem remover esse.
  - `UNKNOWN_FORMATION`/`UNKNOWN_PACKAGE` usam `Object.hasOwn`: `'constructor'`, `'__proto__'` e `'toString'` lançam `EngineError`, não `TypeError`.
  - Turnover (interceptação/fumble) que passa da linha de gol adversária vira touchback: `advanceField` devolve `TURNOVER` com `spot: 75`, e o novo ataque começa na 25. `nextDriveStart` não mudou.
  - `createMatch` faz `structuredClone` dos dois `Team`: editar o objeto do chamador depois não altera a partida nem o replay.
  - `CARD` com `team` diferente de `'A'`/`'B'` lança `WRONG_TEAM`.
  - Punt e FG aplicam a recuperação de fadiga (−1 por jogada fora de campo) aos dois times, sem atores.
  - `pickLineup` prefere quem não descansa; se todos descansam, escala o menos cansado (empate: ordem do depth chart). Mantém o fallback `fillSlots` simples, que `validateTeam` garante ser viável.
  - `DRIVE_START.possession` continua contando só as posses de tempo regulamentar. Na prorrogação, o cliente usa `overtimeRound` (o Plano 4 já faz isso).
  - Snapshot golden do Plano 1 regenerado: placar 14 × 22, 357 ações, `turnId` 94.
- **Typecheck da raiz:** `tsconfig.json` exclui `apps/client`, e o script `typecheck` roda também `tsc -p apps/client/tsconfig.json`.
