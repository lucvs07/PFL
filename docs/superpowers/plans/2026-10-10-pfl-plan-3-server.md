# PFL — Plano 3: Servidor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colocar a partida 7v7 no ar entre dois amigos. O plano entrega um servidor Node + Socket.io autoritativo, com salas em memória identificadas por código de 6 letras, tokens de reconexão, lobby com validação de time, timers por etapa, padrões de timeout aplicados pelo servidor, visão por jogador, tratamento de desconexão e `match:end` com estatísticas e replay. Também cria o pacote `@pfl/protocol` (contrato com o cliente) e adiciona ao motor o ajuste manual do depth chart (`SET_DEPTH`).

**Architecture:** são três camadas, cada uma testável sem a de cima.
1. **Motor** (`@pfl/engine`, Plano 1): ganha a ação `SET_DEPTH`, o campo `MatchState.snapInDrive` e o campo `PlayerView.canEditDepth`.
2. **Protocolo** (`@pfl/protocol`): só tipos, constantes, `encodeTeam`/`decodeTeam` e `computeStats`. Roda em Node e no navegador.
3. **Servidor** (`apps/server`), em três partes:
   - **`MatchSession`**: classe pura que envolve o motor e controla timers, TIMEOUT, mensagens por jogador, pausa e fim de partida.
   - **`Room`**: classe pura com vagas, tokens, lobby e a política de desconexão. Usa a `MatchSession`.
   - **`createPflServer`**: camada fina de Socket.io. Faz o parse dos payloads e liga cada socket a uma vaga.

Toda a lógica de tempo passa por um `Scheduler` injetável (`now`/`schedule`), testado com `vi.useFakeTimers()`.

**Tech Stack:** Node 24, npm workspaces, TypeScript (strict, moduleResolution Bundler), Vitest, tsx, socket.io 4, socket.io-client 4 (testes).

**Spec:** `docs/superpowers/specs/2026-10-10-pfl-core-design.md` (seções 2.4, 2.5, 5.4, 5.5, 7.1, 7.2, 8 e 9). **Contratos:** `docs/superpowers/plans/2026-10-10-pfl-contracts.md` (seções 2, 3 e 4). Este plano **produz** as seções 2 e 3 do contrato e os scripts da seção 4 referentes ao servidor e aos testes.

**Pré-requisitos:**
- O Plano 1 precisa estar executado (motor completo, `npm test` passando).
- Do Plano 2, nada é usado: os testes usam uma cópia da fixture `electricTeam` do Plano 1.

## Global Constraints

- Node ≥ 24 e npm (workspaces). **Não usar pnpm/yarn.** (Plano 1, Global Constraints)
- TypeScript `strict: true`. `packages/engine` **sem dependências de runtime**. (Plano 1, Global Constraints)
- Determinismo: toda aleatoriedade do motor vem de `rngNext`/`rngShuffle` com o estado guardado em `MatchState.rng`. **Nunca usar `Math.random`** no engine. (Plano 1, Global Constraints)
- Identificadores de código em inglês. Comentários, mensagens e nomes de cartas em português. (Plano 1, Global Constraints)
- **O servidor é a autoridade:** guarda o estado, controla timers, valida ações e aplica os padrões de timeout. (spec 7.1)
- **O client só envia intenções** e anima os `events` recebidos. Não calcula resultados. (spec 7.1)
- **Ocultação de informação:** o servidor projeta uma `view` por jogador, com a própria mão completa e apenas a contagem de cartas do adversário. (spec 7.1)
- Toda ação de jogo carrega `turnId`. (spec 7.2)
- Se um timer de etapa expirar, o servidor aplica o padrão: (spec 2.5)
  - Formação → a última usada no drive (ou *Pistol* na primeira jogada)
  - Pacote → *Base*
  - Carta → a básica (no ataque, *Corrida Básica*; no 4º down, *Punt*)
  - Escolha pós-TD → *PAT*
- **Ajuste manual entre drives:** o jogador pode editar o depth chart e o "manter em campo" no início de cada drive em que vai entrar em campo. O servidor revalida o time (subprojeto do servidor, Plano 3). (spec 5.4)
- O servidor **revalida** o time recebido. O client nunca é confiável. (spec 5.5)
- **Exportar/importar** como código de texto (JSON compactado em base64url), para compartilhar com amigos ou trocar de máquina. (spec 5.5)
- Ação inválida (etapa errada, carta não jogável, `turnId` antigo) → Servidor rejeita com `error { code }`; o client faz `match:resync`. (spec 8)
- Desconexão de um jogador → 60 s de tolerância; o servidor aplica os padrões de timeout; ao reconectar, recebe a `view` atual. (spec 8)
- Desconexão dos dois jogadores → A sala pausa por 5 min e depois é encerrada. (spec 8)
- Reinício do servidor → As salas em memória são perdidas (aceitável nesta versão). (spec 8)
- Time inválido no lobby → Rejeitado com a lista de motivos em `room:state`. (spec 8)
- Código de sala inexistente ou sala cheia → `error { code: 'ROOM_NOT_FOUND' | 'ROOM_FULL' }`. (spec 8)
- **Server:** teste de integração com 2 clientes Socket.io jogando uma partida completa, incluindo timeout e reconexão. (spec 9)
- `ROOM_CODE_LENGTH = 6;           // letras A–Z sem I/O` (contrato 3)
- `PHASE_SECONDS = { FORMATION: 5, PACKAGE: 4, PLAYCALL: 8, CONVERSION: 8 }` (contrato 3)
- `RESULT_ANIMATION_MS = 4500;     // folga antes do próximo timer após match:result` (contrato 3)
- `RECONNECT_GRACE_MS = 60_000;` (contrato 3)
- `BOTH_DISCONNECTED_CLOSE_MS = 5 * 60_000;` (contrato 3)
- `decodeTeam(code: string): unknown;   // nunca lança; devolve null se o código não decodificar` (contrato 3)
- **Nova ação:** `{ type: 'SET_DEPTH'; team: TeamKey; depth: Team['depth']; keepOnField: number[] }`. Aceita somente na fase `FORMATION` do **primeiro snap de um drive**. Pode ser enviada pelos dois times: o ataque e a defesa daquele drive. Não muda a fase. Revalida o time com `validateTeam`. Se for inválido, lança `EngineError('INVALID_DEPTH')`. (contrato 2)
- **Turnos:** toda ação `play:*` e `team:depth` carrega o `turnId`. Se ele for diferente do atual, o servidor responde com `error { code: 'STALE_TURN' }` e reenvia o `match:phase` atual. (contrato 3)
- Quando a partida acaba, `match:end` substitui o último `match:phase`. (contrato 3)
- `npm run dev:server`: server em `http://localhost:3001` (contrato 4)
- **Testes:** o `vitest.config.ts` da raiz passa a incluir `apps/**/test/**/*.test.ts` e `packages/**/test/**/*.test.ts`. (contrato 4)

## Review Focus

1. **Cliente malicioso ou fora de vez.** Exemplos: ação do time adversário, formação `'constructor'`/`'__proto__'`, `turnId` que não é número, evento de jogo antes de entrar numa sala. Esperado: o servidor responde `error` e nunca cai nem altera o estado. Testes:
   - Task 1: `Object.hasOwn` no motor, `'constructor'` vira `UNKNOWN_FORMATION`.
   - Task 4: `parsePlay` rejeita payloads malformados.
   - Task 5: `WRONG_TEAM` vira `ENGINE_ERROR` e o log de ações fica intacto.
   - Task 7: integração com payloads maliciosos e `NOT_IN_ROOM`.
2. **Deadline expirando junto com a ação.** A ação chega depois do deadline, mas antes de o callback do timer rodar (atraso do event loop). Esperado: o padrão de timeout é aplicado primeiro e a ação atrasada é rejeitada. O motor nunca recebe as duas como válidas. Teste na Task 5 (`vi.setSystemTime` além do deadline, sem rodar os timers).
3. **Terceiro cliente na sala, ou token de outra sala.** Esperado: `ROOM_FULL`. O token de outra sala não dá acesso a nenhuma vaga. Testes na Task 6 (`claimSeat`) e na Task 7 (integração).
4. **Socket antigo após reconexão** (duas abas, ou reconexão antes de o servidor perceber a queda do socket velho). Esperado:
   - A conexão nova assume a vaga e o socket antigo é desconectado.
   - O `disconnect` atrasado do socket antigo é ignorado: não marca o jogador como desconectado nem pausa a sala.
   - Testes na Task 6 (`connect` devolve a conexão anterior; `disconnect` com `connId` velho é ignorado).
5. **Sala abandonada** (lobby que ninguém usa, partida com os dois fora, partida encerrada). Esperado: a sala fecha 5 min depois, cancela todos os timers e libera o código. Testes:
   - Task 6: fechamento no lobby vazio, na sala pausada e após `FINISHED`.
   - Task 7: o `RoomManager` remove a sala fechada e o código passa a dar `ROOM_NOT_FOUND`.

---

## File Structure

```
pfl/
  package.json                       + script dev:server (Task 7)
  tsconfig.json                      include passa a cobrir apps/*/src e apps/*/test (Task 2)
  vitest.config.ts                   include passa a cobrir apps/**/test/**/*.test.ts (Task 2)
  packages/
    engine/
      src/model.ts                   + ação SET_DEPTH (Task 1)
      src/errors.ts                  + INVALID_DEPTH, DEPTH_LOCKED (Task 1)
      src/match.ts                   + snapInDrive, onSetDepth, canEditDepth, PlayerView.canEditDepth, Object.hasOwn (Task 1)
      test/depth.test.ts             (Task 1)
    protocol/
      package.json                   @pfl/protocol — main: src/index.ts
      src/index.ts                   reexporta messages, codec, stats
      src/messages.ts                constantes, tipos de sala/mensagens, eventos tipados do Socket.io
      src/codec.ts                   encodeTeam / decodeTeam (base64url, Node e navegador)
      src/stats.ts                   computeStats
      test/messages.test.ts
      test/codec.test.ts
      test/stats.test.ts
  apps/
    server/
      package.json                   @pfl/server — scripts dev/start
      src/index.ts                   reexporta a API do servidor
      src/main.ts                    ponto de entrada (porta 3001)
      src/timings.ts                 Timings, DEFAULT_TIMINGS, resolveTimings, Scheduler, realScheduler
      src/codes.ts                   geração/normalização de código de sala
      src/outgoing.ts                tipo Outgoing (mensagem servidor → cliente) e Send
      src/parse.ts                   PlayRequest, parsePlay, toAction
      src/match-session.ts           MatchSession (motor + timers + mensagens)
      src/room.ts                    Room (vagas, tokens, lobby, desconexão)
      src/rooms.ts                   RoomManager (mapa de salas por código)
      src/server.ts                  createPflServer (Socket.io)
      test/fixtures.ts               cópia de electricTeam (Plano 1)
      test/helpers.ts                recorder de mensagens
      test/timings.test.ts
      test/codes.test.ts
      test/parse.test.ts
      test/match-session.test.ts
      test/room.test.ts
      test/rooms.test.ts
      test/integration.test.ts
```

**Regras de mensagens que o servidor segue** (as Tasks 5 e 6 as implementam e testam):
- A ordem por jogada é a do contrato:
  1. `match:phase` FORMATION
  2. `match:reveal` FORMATION
  3. `match:phase` PACKAGE
  4. `match:reveal` PACKAGE
  5. `match:phase` PLAYCALL
  6. `match:result`
  7. `match:phase` do próximo snap, com `deadline` incluindo `RESULT_ANIMATION_MS`, ou `match:end`
- **`match:phase` é idempotente, identificado por `(turnId, phase)`.** O servidor reenvia `match:phase` com o mesmo `turnId`/`phase` e uma `view` atualizada em quatro situações:
  - quando um lado escolhe a carta (para o outro ver `opponentHasChosen`);
  - como confirmação de `team:depth`;
  - quando o deadline muda (ausência ou retomada após pausa);
  - em `match:resync`.
  O cliente substitui o estado pela última mensagem e não deve agir duas vezes no mesmo `(turnId, phase)`.
- FORMATION, PACKAGE e PLAYCALL do mesmo snap compartilham o `turnId`, porque o motor do Plano 1 só incrementa o turno em `beginSnap`, no TD e no fim. Por isso, uma ação com o `turnId` certo e a fase errada (por exemplo, a que perdeu a corrida contra o deadline) volta como `error { code: 'ENGINE_ERROR' }` com a mensagem do motor (`WRONG_PHASE: ...`), e não como `STALE_TURN`.
- `room:create` e `room:join` respondem pelo `Ack`: `{ ok: false, error: { code: 'ROOM_NOT_FOUND' | 'ROOM_FULL' } }`. Não há um evento `error` separado para esses dois casos.
- Payload malformado (`parsePlay` devolve `null`) → `error { code: 'ENGINE_ERROR' }`. Evento de sala/jogo sem estar numa sala → `NOT_IN_ROOM`. `team:submit`/`room:ready` com a partida em andamento, ou `play:*` antes de a partida começar → `NOT_READY`. `room:ready` sem time válido → `TEAM_INVALID`. Código de time ilegível → `INVALID_TEAM_CODE`, e `room:state` traz `teamErrors: [{ code: 'MALFORMED_TEAM' }]`.
- **Tolerância de 60 s esgotada:** o jogador passa a "ausente". Quando todos que ainda precisam agir na etapa estão ausentes, o padrão é aplicado assim que a etapa começa, sem esperar o timer inteiro. O jogador conectado continua com o timer normal. Isso é uma interpretação: a spec e o contrato não dizem o que acontece depois dos 60 s.

---

### Task 1: Motor — ajuste manual do depth chart (`SET_DEPTH`)

**Files:**
- Modify: `packages/engine/src/model.ts` (union `Action`)
- Modify: `packages/engine/src/errors.ts` (`EngineErrorCode`)
- Modify: `packages/engine/src/match.ts` (`MatchState`, `createMatch`, `step`, `onFormation`, `onPackage`, `beginSnap`, `startDrive`, `PlayerView`, `playerView`; novas `onSetDepth` e `canEditDepth`)
- Test: `packages/engine/test/depth.test.ts`

**Interfaces:**
- Consumes (Plano 1): `createMatch`, `step`, `playerView`, `replay`, `validateTeam`, `EngineError`, `MatchState`, `Action`, `Team`, `TeamKey`, fixture `electricTeam`.
- Produces (contrato, seção 2):
  - `Action` ganha `{ type: 'SET_DEPTH'; team: TeamKey; depth: Team['depth']; keepOnField: number[] }`
  - `MatchState.snapInDrive: number` (1 no primeiro snap do drive)
  - `PlayerView.canEditDepth: boolean`
  - `EngineErrorCode` ganha `'INVALID_DEPTH' | 'DEPTH_LOCKED'`
  - `canEditDepth(s: MatchState): boolean` (exportada de `match.ts`, portanto de `@pfl/engine`)
  - Endurecimento: formação/pacote desconhecidos (inclusive `'constructor'`, `'__proto__'`, `'toString'`) lançam `UNKNOWN_FORMATION`/`UNKNOWN_PACKAGE` em vez de `TypeError`.

- [ ] **Step 1: Escrever o teste (deve falhar)**

`packages/engine/test/depth.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createMatch, step, playerView, type MatchState } from '../src/match';
import { replay } from '../src/replay';
import { EngineError } from '../src/errors';
import type { Action, FormationId, GameEvent, PackageId, Team, TeamKey } from '../src/model';
import { electricTeam } from './fixtures';

const A = electricTeam('A');
const B = electricTeam('B');
const start = (): MatchState => createMatch(A, B, 1).state;

function run(s: MatchState, ...actions: Action[]): { state: MatchState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let state = s;
  for (const a of actions) {
    const r = step(state, a);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

const setDepth = (team: TeamKey, depth: Team['depth'], keepOnField: number[] = []): Action => ({
  type: 'SET_DEPTH',
  team,
  depth,
  keepOnField,
});
/** Psyduck (54) passa a titular de QB no lugar de Abra (63). */
const qbSwap = (): Team['depth'] => ({ ...A.depth, QB: [54, 63] });

const snapActions = (offense: TeamKey): Action[] => {
  const defense: TeamKey = offense === 'A' ? 'B' : 'A';
  return [
    { type: 'FORMATION', team: offense, formation: 'PISTOL' },
    { type: 'PACKAGE', team: defense, package: 'BASE' },
    { type: 'CARD', team: offense, cardId: 'basic_run' },
    { type: 'CARD', team: defense, cardId: 'basic_defense' },
  ];
};

describe('snapInDrive', () => {
  it('vale 1 no primeiro snap da partida', () => {
    expect(start().snapInDrive).toBe(1);
  });

  it('incrementa a cada snap e volta a 1 num drive novo', () => {
    const { state } = run(start(), ...snapActions('A'));
    // seed fixa: se o snap terminou o drive (fumble), o novo drive recomeça em 1
    expect(state.snapInDrive).toBe(state.offense === 'A' ? 2 : 1);
  });

  it('um punt abre o drive do adversário com snapInDrive = 1', () => {
    const s = start();
    s.field = { down: 4, yardsToGo: 8, ballOn: 40 };
    s.snapInDrive = 4;
    const { state } = run(
      s,
      { type: 'FORMATION', team: 'A', formation: 'PISTOL' },
      { type: 'PACKAGE', team: 'B', package: 'BASE' },
      { type: 'CARD', team: 'A', cardId: 'punt' },
      { type: 'CARD', team: 'B', cardId: 'basic_defense' },
    );
    expect(state.offense).toBe('B');
    expect(state.snapInDrive).toBe(1);
  });
});

describe('SET_DEPTH', () => {
  it('o ataque troca o titular no primeiro snap; não muda fase, turno nem gera eventos', () => {
    const s = start();
    const r = step(s, setDepth('A', qbSwap()));
    expect(r.events).toEqual([]);
    expect(r.state.phase).toBe('FORMATION');
    expect(r.state.turnId).toBe(s.turnId);
    expect(r.state.teams.A.team.depth.QB).toEqual([54, 63]);
    const { events } = run(r.state, { type: 'FORMATION', team: 'A', formation: 'PISTOL' });
    expect(events[0]).toMatchObject({ t: 'FORMATION', lineup: { QB: 54 } });
  });

  it('a defesa do drive também pode editar, e o pacote usa a nova ordem', () => {
    const depth = { ...B.depth, DL1: [19, 95, 74] };
    const r = step(start(), setDepth('B', depth));
    const { events } = run(
      r.state,
      { type: 'FORMATION', team: 'A', formation: 'PISTOL' },
      { type: 'PACKAGE', team: 'B', package: 'BASE' },
    );
    expect(events.find((e) => e.t === 'PACKAGE')).toMatchObject({ lineup: { DL1: 19 } });
  });

  it('atualiza o "manter em campo" e aceita reenvio na mesma janela', () => {
    const first = step(start(), setDepth('A', qbSwap(), [25])).state;
    const second = step(first, setDepth('A', A.depth, [25, 26])).state;
    expect(second.teams.A.team.keepOnField).toEqual([25, 26]);
    expect(second.teams.A.team.depth.QB).toEqual([63, 54]);
  });

  it('o elenco, o especialista e os decks não mudam', () => {
    const r = step(start(), setDepth('A', qbSwap()));
    expect(r.state.teams.A.team.roster).toEqual(A.roster);
    expect(r.state.teams.A.team.specialist).toBe(A.specialist);
    expect(r.state.teams.A.team.offenseDeck).toEqual(A.offenseDeck);
  });

  it('DEPTH_LOCKED depois da formação, inclusive para a defesa', () => {
    const { state } = run(start(), { type: 'FORMATION', team: 'A', formation: 'PISTOL' });
    expect(() => step(state, setDepth('A', qbSwap()))).toThrow(/DEPTH_LOCKED/);
    expect(() => step(state, setDepth('B', B.depth))).toThrow(/DEPTH_LOCKED/);
  });

  it('DEPTH_LOCKED a partir do segundo snap do drive', () => {
    const s = start();
    s.snapInDrive = 2;
    expect(() => step(s, setDepth('A', qbSwap()))).toThrow(/DEPTH_LOCKED/);
  });

  it('INVALID_DEPTH quando o time revalidado é inválido', () => {
    const s = start();
    expect(() => step(s, setDepth('A', { ...A.depth, QB: [150] }))).toThrow(/INVALID_DEPTH/); // fora do elenco
    expect(() => step(s, setDepth('A', { ...A.depth, TE: [] }))).toThrow(/INVALID_DEPTH/); // HEAVY sem TE
    expect(() => step(s, setDepth('A', A.depth, [999]))).toThrow(/INVALID_DEPTH/); // keepOnField fora do elenco
    const malformed = { ...A.depth, QB: ['63'] } as unknown as Team['depth'];
    expect(() => step(s, setDepth('A', malformed))).toThrow(/INVALID_DEPTH/);
    expect(() => step(s, setDepth('A', A.depth, 'x' as unknown as number[]))).toThrow(/INVALID_DEPTH/);
  });

  it('erros são EngineError e não alteram o estado de entrada', () => {
    const s = start();
    const before = structuredClone(s);
    expect(() => step(s, setDepth('A', { ...A.depth, QB: [150] }))).toThrow(EngineError);
    step(s, setDepth('A', qbSwap()));
    expect(s).toEqual(before);
  });

  it('é reproduzido pelo replay', () => {
    const actions: Action[] = [setDepth('A', qbSwap(), [25]), ...snapActions('A')];
    const direct = run(start(), ...actions);
    expect(replay(A, B, 1, actions).state).toEqual(direct.state);
  });
});

describe('playerView.canEditDepth', () => {
  it('true para os dois times na FORMATION do primeiro snap', () => {
    const s = start();
    expect(playerView(s, 'A').canEditDepth).toBe(true);
    expect(playerView(s, 'B').canEditDepth).toBe(true);
  });

  it('false depois da formação e a partir do segundo snap', () => {
    const { state } = run(start(), { type: 'FORMATION', team: 'A', formation: 'PISTOL' });
    expect(playerView(state, 'A').canEditDepth).toBe(false);
    expect(playerView(state, 'B').canEditDepth).toBe(false);
    const s = start();
    s.snapInDrive = 2;
    expect(playerView(s, 'A').canEditDepth).toBe(false);
  });
});

describe('formação e pacote desconhecidos (cliente malicioso)', () => {
  it('nomes herdados de Object viram UNKNOWN_FORMATION / UNKNOWN_PACKAGE, não TypeError', () => {
    const s = start();
    for (const bad of ['constructor', '__proto__', 'toString']) {
      expect(() => step(s, { type: 'FORMATION', team: 'A', formation: bad as FormationId })).toThrow(EngineError);
      expect(() => step(s, { type: 'FORMATION', team: 'A', formation: bad as FormationId })).toThrow(/UNKNOWN_FORMATION/);
    }
    const { state } = run(s, { type: 'FORMATION', team: 'A', formation: 'PISTOL' });
    expect(() => step(state, { type: 'PACKAGE', team: 'B', package: 'toString' as PackageId })).toThrow(/UNKNOWN_PACKAGE/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/engine/test/depth.test.ts`
Expected: FAIL. Os motivos esperados (o Vitest não checa tipos, então não aparece erro de compilação):
- os testes de `snapInDrive` recebem `undefined`, com mensagens como `expected undefined to be 1`;
- `SET_DEPTH` cai no handler da FORMATION e lança `WRONG_PHASE: SET_DEPTH na fase de FORMATION`;
- `canEditDepth` vem `undefined`;
- `'constructor'` lança `TypeError` (`slots is not iterable`) em vez de `EngineError`.

- [ ] **Step 3: Adicionar a ação ao modelo**

Em `packages/engine/src/model.ts`, substituir a union `Action` inteira por:
```ts
export type Action =
  | { type: 'FORMATION'; team: TeamKey; formation: FormationId }
  | { type: 'PACKAGE'; team: TeamKey; package: PackageId }
  | { type: 'CARD'; team: TeamKey; cardId: string }
  | { type: 'CONVERSION'; team: TeamKey; choice: 'PAT' | 'TWO' }
  | { type: 'SET_DEPTH'; team: TeamKey; depth: Team['depth']; keepOnField: number[] }
  | { type: 'TIMEOUT' };
```
(`Team` já é declarado antes de `Action` no mesmo arquivo.)

- [ ] **Step 4: Adicionar os códigos de erro**

Em `packages/engine/src/errors.ts`, substituir o tipo `EngineErrorCode` por:
```ts
export type EngineErrorCode =
  | 'INVALID_TEAM'
  | 'MATCH_OVER'
  | 'WRONG_PHASE'
  | 'WRONG_TEAM'
  | 'ALREADY_CHOSEN'
  | 'CARD_NOT_PLAYABLE'
  | 'UNKNOWN_FORMATION'
  | 'UNKNOWN_PACKAGE'
  | 'INVALID_DEPTH'
  | 'DEPTH_LOCKED';
```

- [ ] **Step 5: Editar `match.ts`**

Em `packages/engine/src/match.ts`, aplicar as edições abaixo, nesta ordem.

5a. Na interface `MatchState`, logo depois de `turnId: number;`, adicionar:
```ts
  /** número do snap dentro do drive atual: 1 no primeiro snap (contrato, seção 2) */
  snapInDrive: number;
```

5b. Em `createMatch`, no literal `const state: MatchState = { ... }`, logo depois de `turnId: 0,`, adicionar:
```ts
    snapInDrive: 0,
```

5c. Substituir a função `step` inteira por:
```ts
export function step(state: MatchState, action: Action): StepResult {
  if (state.phase === 'MATCH_END') throw new EngineError('MATCH_OVER');
  const s = structuredClone(state);
  const events: GameEvent[] = [];
  if (action.type === 'SET_DEPTH') {
    onSetDepth(s, action);
    return { state: s, events };
  }
  switch (s.phase) {
    case 'FORMATION':
      onFormation(s, action, events);
      break;
    case 'PACKAGE':
      onPackage(s, action, events);
      break;
    case 'PLAYCALL':
      onPlaycall(s, action, events);
      break;
    case 'CONVERSION':
      onConversion(s, action, events);
      break;
  }
  return { state: s, events };
}

/** Ajuste manual do depth chart (spec 5.4): só na FORMATION do primeiro snap do drive. */
export function canEditDepth(s: MatchState): boolean {
  return s.phase === 'FORMATION' && s.snapInDrive === 1;
}

function onSetDepth(s: MatchState, action: Extract<Action, { type: 'SET_DEPTH' }>): void {
  if (action.team !== 'A' && action.team !== 'B') throw new EngineError('WRONG_TEAM');
  if (!canEditDepth(s)) throw new EngineError('DEPTH_LOCKED');
  const rt = s.teams[action.team];
  const candidate = { ...rt.team, depth: action.depth, keepOnField: action.keepOnField };
  const errors = validateTeam(candidate);
  if (errors.length) throw new EngineError('INVALID_DEPTH', errors.map((e) => e.code).join(', '));
  rt.team = structuredClone(candidate);
}
```

5d. Em `onFormation`, substituir a linha
```ts
  if (!(formation in FORMATIONS)) throw new EngineError('UNKNOWN_FORMATION', formation);
```
por
```ts
  if (!Object.hasOwn(FORMATIONS, formation)) throw new EngineError('UNKNOWN_FORMATION', formation);
```

5e. Em `onPackage`, substituir a linha
```ts
  if (!(pkg in PACKAGES)) throw new EngineError('UNKNOWN_PACKAGE', pkg);
```
por
```ts
  if (!Object.hasOwn(PACKAGES, pkg)) throw new EngineError('UNKNOWN_PACKAGE', pkg);
```

5f. Substituir a função `beginSnap` inteira por:
```ts
function beginSnap(s: MatchState): void {
  s.phase = 'FORMATION';
  s.turnId += 1;
  s.snapInDrive += 1;
  s.formation = null;
  s.package = null;
  s.lineups = { offense: {}, defense: {} };
  s.cards = { offense: null, defense: null };
}
```

5g. Em `startDrive`, logo antes da chamada final `beginSnap(s);`, adicionar:
```ts
  s.snapInDrive = 0;
```
(`beginSnap` leva a 1. A tentativa de 2 pontos depois de um TD entra por `onConversion` → `beginSnap`, então vira o snap 2 ou mais e não reabre a janela de edição.)

5h. Na interface `PlayerView`, logo depois de `fatigue: Record<TeamKey, Record<number, number>>;`, adicionar:
```ts
  /** o jogador pode enviar SET_DEPTH agora (FORMATION do primeiro snap do drive) */
  canEditDepth: boolean;
```

5i. Em `playerView`, no objeto retornado, logo depois da linha `fatigue: { A: { ...s.teams.A.fatigue.levels }, B: { ...s.teams.B.fatigue.levels } },`, adicionar:
```ts
    canEditDepth: canEditDepth(s),
```

`index.ts` não muda: ele já reexporta `./match`, `./model` e `./errors`.

- [ ] **Step 6: Rodar o teste novo**

Run: `npx vitest run packages/engine/test/depth.test.ts`
Expected: PASS.

- [ ] **Step 7: Rodar a suíte inteira do motor sem atualizar snapshots**

Run: `npm test && npm run typecheck`
Expected: todos PASS, sem `-u`. O golden `packages/engine/test/__snapshots__/full-match.test.ts.snap` **não pode mudar**: `SET_DEPTH` não consome RNG e `snapInDrive` não entra no snapshot. Se o golden falhar, há regressão no motor; corrija o código, não o snapshot.

- [ ] **Step 8: Commit**

```bash
git add packages/engine/src/model.ts packages/engine/src/errors.ts packages/engine/src/match.ts packages/engine/test/depth.test.ts
git commit -m "feat(engine): ajuste manual do depth chart (SET_DEPTH) e snapInDrive"
```

---

### Task 2: Pacote `@pfl/protocol` — tipos, constantes e código de time

**Files:**
- Create: `packages/protocol/package.json`, `packages/protocol/src/index.ts`, `packages/protocol/src/messages.ts`, `packages/protocol/src/codec.ts`
- Modify: `tsconfig.json` (raiz), `vitest.config.ts` (raiz)
- Test: `packages/protocol/test/messages.test.ts`, `packages/protocol/test/codec.test.ts`

**Interfaces:**
- Consumes: tipos de `@pfl/engine` (`Action`, `FormationId`, `GameEvent`, `PackageId`, `Phase`, `PlayerView`, `Team`, `TeamError`, `TeamKey`). Em runtime, o pacote não importa nada do motor.
- Produces (contrato, seção 3, com os mesmos nomes):
  - `ROOM_CODE_LENGTH`, `PHASE_SECONDS`, `RESULT_ANIMATION_MS`, `RECONNECT_GRACE_MS`, `BOTH_DISCONNECTED_CLOSE_MS`
  - `RoomStatus`, `RoomPlayer`, `RoomState`, `PhaseMessage`, `RevealMessage`, `ResultMessage`, `PokemonMatchStats`, `MatchStats`, `ReplayData`, `EndMessage`, `ErrorCode`, `ErrorMessage`, `Ack<T>`, `ClientToServerEvents`, `ServerToClientEvents`
  - `encodeTeam(team: Team): string`, `decodeTeam(code: string): unknown`
  - Adição fora do contrato: `ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'` (24 letras, A–Z sem I e O)

- [ ] **Step 1: Criar o pacote e ajustar a configuração da raiz**

`packages/protocol/package.json`:
```json
{
  "name": "@pfl/protocol",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": {
    "@pfl/engine": "*"
  }
}
```

`tsconfig.json` (raiz): substituir a linha `"include"` por:
```json
  "include": ["packages/*/src", "packages/*/test", "packages/*/scripts", "apps/*/src", "apps/*/test", "vitest.config.ts"]
```
`packages/protocol` já é coberto por `packages/*/src` e `packages/*/test`. As entradas novas são `apps/*/src` e `apps/*/test`. Se o Plano 4 der ao `apps/client` um `tsconfig.json` próprio (JSX/DOM) e o typecheck da raiz passar a acusar erros nos arquivos do cliente, troque `apps/*` por `apps/server` nessas duas entradas.

`vitest.config.ts` (raiz): substituir o conteúdo por:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['packages/**/test/**/*.test.ts', 'apps/**/test/**/*.test.ts'] },
});
```

Run: `npm install`
Expected: o link `node_modules/@pfl/protocol` é criado, sem erros.

- [ ] **Step 2: Escrever os testes (devem falhar)**

`packages/protocol/test/messages.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  BOTH_DISCONNECTED_CLOSE_MS, PHASE_SECONDS, RECONNECT_GRACE_MS, RESULT_ANIMATION_MS, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH,
} from '../src/index';

describe('constantes do protocolo', () => {
  it('seguem a spec (2.4 e 8) e o contrato', () => {
    expect(PHASE_SECONDS).toEqual({ FORMATION: 5, PACKAGE: 4, PLAYCALL: 8, CONVERSION: 8 });
    expect(RESULT_ANIMATION_MS).toBe(4500);
    expect(RECONNECT_GRACE_MS).toBe(60_000);
    expect(BOTH_DISCONNECTED_CLOSE_MS).toBe(300_000);
    expect(ROOM_CODE_LENGTH).toBe(6);
  });

  it('o alfabeto do código de sala é A–Z sem I e O', () => {
    expect(ROOM_CODE_ALPHABET).toHaveLength(24);
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[IO]/);
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(24);
    expect(ROOM_CODE_ALPHABET).toMatch(/^[A-Z]+$/);
  });
});
```

`packages/protocol/test/codec.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { encodeTeam, decodeTeam } from '../src/index';
import { electricTeam } from '../../engine/test/fixtures';

/** base64url de bytes arbitrários, para montar entradas inválidas nos testes. */
const rawBase64Url = (text: string): string =>
  btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('encodeTeam / decodeTeam', () => {
  it('ida e volta preserva o time', () => {
    const team = electricTeam();
    expect(decodeTeam(encodeTeam(team))).toEqual(team);
  });

  it('gera só caracteres base64url, sem padding', () => {
    expect(encodeTeam(electricTeam())).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('preserva acentos e caracteres fora do ASCII no nome', () => {
    const team = { ...electricTeam(), name: 'Trovões de Pallet — ñ ü' };
    expect(decodeTeam(encodeTeam(team))).toEqual(team);
  });

  it('ignora espaços nas pontas (código colado de um chat)', () => {
    const team = electricTeam();
    expect(decodeTeam(`  ${encodeTeam(team)}\n`)).toEqual(team);
  });

  it('devolve o JSON decodificado mesmo que não seja um time (a validação é do chamador)', () => {
    expect(decodeTeam(rawBase64Url('{"a":1}'))).toEqual({ a: 1 });
  });

  it('nunca lança: entradas inválidas devolvem null', () => {
    const bad: unknown[] = [
      '',
      '   ',
      '!!!!',
      'a', // tamanho impossível em base64
      'abc', // decodifica para bytes que não são JSON
      rawBase64Url('não é json'),
      '_w', // byte 0xFF: UTF-8 inválido
      'A'.repeat(20_000), // longo demais
      123,
      null,
      undefined,
      { teamCode: 'x' },
    ];
    for (const code of bad) {
      expect(() => decodeTeam(code as string)).not.toThrow();
      expect(decodeTeam(code as string)).toBeNull();
    }
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run packages/protocol`
Expected: FAIL — `Failed to resolve import "../src/index"`.

- [ ] **Step 4: Implementar `messages.ts`, `codec.ts` e o índice**

`packages/protocol/src/messages.ts`:
```ts
// Contrato entre servidor (Plano 3) e cliente (Plano 4). Ver docs/superpowers/plans/2026-10-10-pfl-contracts.md, seção 3.
import type { Action, FormationId, GameEvent, PackageId, Phase, PlayerView, Team, TeamError, TeamKey } from '@pfl/engine';

export const ROOM_CODE_LENGTH = 6; // letras A–Z sem I/O
/** Alfabeto do código de sala: A–Z sem I e O (evita confusão com 1 e 0). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const PHASE_SECONDS: Record<Exclude<Phase, 'MATCH_END'>, number> = {
  FORMATION: 5,
  PACKAGE: 4,
  PLAYCALL: 8,
  CONVERSION: 8,
};
export const RESULT_ANIMATION_MS = 4500; // folga antes do próximo timer após match:result
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
export interface RoomState {
  code: string;
  you: TeamKey;
  status: RoomStatus;
  players: RoomPlayer[];
}

export interface PhaseMessage {
  turnId: number;
  phase: Phase;
  deadline: number /* epoch ms */;
  view: PlayerView;
}
/** Após FORMATION/PACKAGE. */
export interface RevealMessage {
  turnId: number;
  events: GameEvent[];
}
/** Após resolução/conversão. */
export interface ResultMessage {
  turnId: number;
  events: GameEvent[];
  view: PlayerView;
}
export interface PokemonMatchStats {
  speciesId: number;
  team: TeamKey;
  plays: number;
  yards: number;
  touchdowns: number;
}
export interface MatchStats {
  pokemon: PokemonMatchStats[];
  yards: Record<TeamKey, number>;
  turnovers: Record<TeamKey, number>;
  sacks: Record<TeamKey, number>;
}
export interface ReplayData {
  seed: number;
  teams: Record<TeamKey, Team>;
  actions: Action[];
}
export interface EndMessage {
  score: Record<TeamKey, number>;
  stats: MatchStats;
  replay: ReplayData;
}

export type ErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'NOT_IN_ROOM'
  | 'INVALID_TEAM_CODE'
  | 'TEAM_INVALID'
  | 'NOT_READY'
  | 'STALE_TURN'
  | 'ENGINE_ERROR';
export interface ErrorMessage {
  code: ErrorCode;
  message: string;
}

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
```

`packages/protocol/src/codec.ts`:
```ts
// Código de time (exportar/importar, spec 5.5): JSON → UTF-8 → base64url.
// Usa só TextEncoder/TextDecoder/btoa/atob, que existem como globais no Node 24 e nos navegadores.
import type { Team } from '@pfl/engine';

/** Um time real dá cerca de 2 KB. O limite evita gastar CPU com entradas absurdas. */
const MAX_CODE_LENGTH = 16_384;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(code: string): Uint8Array | null {
  if (code.length % 4 === 1) return null;
  const base64 = code.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (code.length % 4)) % 4);
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export function encodeTeam(team: Team): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(team)));
}

/** Nunca lança. Devolve o JSON decodificado (ainda não validado) ou null se o código não decodificar. */
export function decodeTeam(code: string): unknown {
  if (typeof code !== 'string') return null;
  const trimmed = code.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_CODE_LENGTH || !BASE64URL.test(trimmed)) return null;
  const bytes = base64UrlToBytes(trimmed);
  if (!bytes) return null;
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    return null;
  }
}
```

`packages/protocol/src/index.ts`:
```ts
export * from './messages';
export * from './codec';
```

- [ ] **Step 5: Rodar os testes e o typecheck**

Run: `npx vitest run packages/protocol && npm run typecheck`
Expected: PASS; typecheck sem erros.

- [ ] **Step 6: Commit**

```bash
git add packages/protocol tsconfig.json vitest.config.ts package-lock.json
git commit -m "feat(protocol): pacote @pfl/protocol com tipos, constantes e código de time"
```

---
### Task 3: `computeStats` — estatísticas da partida

**Files:**
- Create: `packages/protocol/src/stats.ts`
- Modify: `packages/protocol/src/index.ts`
- Test: `packages/protocol/test/stats.test.ts`

**Interfaces:**
- Consumes: tipos `GameEvent`, `Lineup`, `PlayOutcome`, `TeamKey` de `@pfl/engine`; `MatchStats` e `PokemonMatchStats` (Task 2). Os testes também usam `createMatch` e `step` do motor.
- Produces: `computeStats(events: readonly GameEvent[]): MatchStats`. O contrato deixa algumas convenções em aberto; as adotadas aqui estão no comentário do arquivo e nos testes:
  - `plays`: vezes como ator (`offActors`/`defActors` de cada evento `PLAY`), por `(team, speciesId)`. A mesma espécie nos dois times gera duas entradas.
  - Ator de habilidade: o primeiro de `offActors` cuja vaga, na lineup do `FORMATION` mais recente, é RB/WR1–3/TE/FB. Se não houver, é o QB da lineup.
  - `yards` por Pokémon: só jardas de `GAIN`, creditadas ao ator de habilidade. Sack não é creditado a nenhum Pokémon.
  - `yards[K]`: soma de `GAIN` e `SACK` (negativo) quando K está no ataque. Usa as jardas brutas do motor: num TD, as jardas que passam da linha de gol também contam.
  - `touchdowns`: evento `TOUCHDOWN` creditado ao ator de habilidade do `PLAY` anterior. A conversão de 2 bem-sucedida não é TD.
  - `turnovers[K]`: turnovers **cometidos** por K (eventos `TURNOVER` com K no ataque). Turnover on downs não conta.
  - `sacks[K]`: sacks **feitos** pela defesa de K.
  - `pokemon` ordenado por time (A, depois B) e por `speciesId`.

- [ ] **Step 1: Escrever o teste (deve falhar)**

`packages/protocol/test/stats.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createMatch, step, type GameEvent, type Lineup, type PlayKind, type TeamKey } from '@pfl/engine';
import { computeStats } from '../src/index';
import { electricTeam } from '../../engine/test/fixtures';

const PISTOL_LINEUP: Lineup = { QB: 63, OL1: 95, OL2: 74, OL3: 66, RB: 25, WR1: 26, WR2: 125 };
const BASE_LINEUP: Lineup = { DL1: 95, DL2: 74, DL3: 50, LB1: 66, CB1: 26, CB2: 100, S1: 63 };

const formation = (team: TeamKey, lineup: Lineup = PISTOL_LINEUP): GameEvent =>
  ({ t: 'FORMATION', team, formation: 'PISTOL', lineup });
const pkg = (team: TeamKey): GameEvent => ({ t: 'PACKAGE', team, package: 'BASE', lineup: BASE_LINEUP });
const play = (kind: PlayKind, yards: number, offActors: number[], defActors: number[] = [95, 74, 50, 66]): GameEvent => ({
  t: 'PLAY',
  outcome: { kind, yards, bigPlay: false, read: 'NEUTRAL', offActors, defActors, offTypeMult: 1, defTypeMult: 1, readFactor: 1, statFactor: 1, varianceFactor: 1 },
});
const find = (stats: ReturnType<typeof computeStats>, team: TeamKey, speciesId: number) =>
  stats.pokemon.find((p) => p.team === team && p.speciesId === speciesId);

describe('computeStats', () => {
  it('sem eventos, tudo zerado', () => {
    expect(computeStats([])).toEqual({
      pokemon: [],
      yards: { A: 0, B: 0 },
      turnovers: { A: 0, B: 0 },
      sacks: { A: 0, B: 0 },
    });
  });

  it('corrida: jardas para o RB, jogada para todos os atores dos dois lados', () => {
    const stats = computeStats([formation('A'), pkg('B'), play('GAIN', 8, [25, 95, 74, 66])]);
    expect(find(stats, 'A', 25)).toEqual({ speciesId: 25, team: 'A', plays: 1, yards: 8, touchdowns: 0 });
    expect(find(stats, 'A', 95)).toMatchObject({ plays: 1, yards: 0 });
    expect(find(stats, 'B', 95)).toMatchObject({ plays: 1, yards: 0 });
    expect(stats.yards).toEqual({ A: 8, B: 0 });
  });

  it('passe: jardas para o recebedor, não para o QB', () => {
    const stats = computeStats([formation('A'), pkg('B'), play('GAIN', 12, [63, 26, 95, 74, 66])]);
    expect(find(stats, 'A', 26)).toMatchObject({ yards: 12 });
    expect(find(stats, 'A', 63)).toMatchObject({ yards: 0, plays: 1 });
  });

  it('sem ator de habilidade, o QB recebe o crédito', () => {
    const stats = computeStats([formation('A'), pkg('B'), play('GAIN', 3, [63, 95])]);
    expect(find(stats, 'A', 63)).toMatchObject({ yards: 3 });
  });

  it('sack: jardas negativas para o time, sack para a defesa, nada para os Pokémon', () => {
    const stats = computeStats([formation('A'), pkg('B'), play('SACK', -6, [63, 95, 74, 66])]);
    expect(stats.yards.A).toBe(-6);
    expect(stats.sacks).toEqual({ A: 0, B: 1 });
    expect(stats.pokemon.every((p) => p.yards === 0)).toBe(true);
  });

  it('interceptação e fumble contam turnover para quem perdeu a bola e não somam jardas', () => {
    const stats = computeStats([
      formation('A'), pkg('B'), play('INTERCEPTION', 18, [63, 26, 95, 74, 66]), { t: 'TURNOVER', kind: 'INTERCEPTION' },
      formation('B'), pkg('A'), play('FUMBLE', 3, [25, 95, 74, 66]), { t: 'TURNOVER', kind: 'FUMBLE' },
    ]);
    expect(stats.turnovers).toEqual({ A: 1, B: 1 });
    expect(stats.yards).toEqual({ A: 0, B: 0 });
  });

  it('touchdown vai para o ator de habilidade da jogada', () => {
    const stats = computeStats([
      formation('A'), pkg('B'), play('GAIN', 20, [25, 95, 74, 66]), { t: 'TOUCHDOWN', team: 'A' },
    ]);
    expect(find(stats, 'A', 25)).toMatchObject({ yards: 20, touchdowns: 1 });
  });

  it('a mesma espécie nos dois times fica separada; a ordem é por time e espécie', () => {
    const stats = computeStats([
      formation('A'), pkg('B'), play('GAIN', 5, [25, 95, 74, 66]),
      formation('B'), pkg('A'), play('GAIN', 7, [25, 95, 74, 66]),
    ]);
    expect(find(stats, 'A', 25)).toMatchObject({ yards: 5 });
    expect(find(stats, 'B', 25)).toMatchObject({ yards: 7 });
    const order = stats.pokemon.map((p) => `${p.team}:${p.speciesId}`);
    expect(order).toEqual([...order].sort((x, y) => {
      const [tx, sx] = x.split(':');
      const [ty, sy] = y.split(':');
      return tx === ty ? Number(sx) - Number(sy) : tx < ty ? -1 : 1;
    }));
  });

  it('numa partida real, os TDs creditados batem com os eventos TOUCHDOWN', () => {
    const created = createMatch(electricTeam('A'), electricTeam('B'), 7);
    let state = created.state;
    const all: GameEvent[] = [...created.events];
    for (let i = 0; i < 5000 && state.phase !== 'MATCH_END'; i++) {
      const r = step(state, { type: 'TIMEOUT' });
      state = r.state;
      all.push(...r.events);
    }
    expect(state.phase).toBe('MATCH_END');
    const stats = computeStats(all);
    for (const team of ['A', 'B'] as const) {
      const tds = all.filter((e) => e.t === 'TOUCHDOWN' && e.team === team).length;
      expect(stats.pokemon.filter((p) => p.team === team).reduce((s, p) => s + p.touchdowns, 0)).toBe(tds);
    }
    expect(stats.pokemon.every((p) => p.plays > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/protocol/test/stats.test.ts`
Expected: FAIL — `computeStats is not a function`, porque o import resolve mas o export ainda não existe.

- [ ] **Step 3: Implementar**

`packages/protocol/src/stats.ts`:
```ts
import type { GameEvent, Lineup, PlayOutcome, TeamKey } from '@pfl/engine';
import type { MatchStats, PokemonMatchStats } from './messages';

/**
 * Estatísticas de fim de jogo, derivadas só dos eventos do motor. Convenções:
 * - plays: vezes como ator (offActors/defActors de cada PLAY), por (time, espécie).
 * - Ator de habilidade: o primeiro de offActors cuja vaga, na lineup do FORMATION mais recente, é RB/WR1-3/TE/FB;
 *   se não houver, o QB da lineup.
 * - yards por Pokémon: só jardas de GAIN, creditadas ao ator de habilidade. Sack não é creditado a nenhum Pokémon.
 * - yards[K]: GAIN + SACK (negativo) com K no ataque, com as jardas brutas do motor (num TD contam além da linha de gol).
 * - touchdowns: TOUCHDOWN creditado ao ator de habilidade do PLAY anterior (a conversão de 2 não é TD).
 * - turnovers[K]: turnovers cometidos por K (interceptação/fumble). Turnover on downs não conta.
 * - sacks[K]: sacks feitos pela defesa de K.
 */
const SKILL_SLOT = /^(RB|WR\d|TE|FB)$/;

function skillActor(outcome: PlayOutcome, lineup: Lineup): number | null {
  const slotOf = new Map<number, string>();
  for (const [slot, id] of Object.entries(lineup)) if (id !== undefined) slotOf.set(id, slot);
  const skill = outcome.offActors.find((id) => SKILL_SLOT.test(slotOf.get(id) ?? ''));
  return skill ?? lineup.QB ?? null;
}

export function computeStats(events: readonly GameEvent[]): MatchStats {
  const byKey = new Map<string, PokemonMatchStats>();
  const entry = (team: TeamKey, speciesId: number): PokemonMatchStats => {
    const key = `${team}:${speciesId}`;
    let e = byKey.get(key);
    if (!e) {
      e = { speciesId, team, plays: 0, yards: 0, touchdowns: 0 };
      byKey.set(key, e);
    }
    return e;
  };
  const yards: Record<TeamKey, number> = { A: 0, B: 0 };
  const turnovers: Record<TeamKey, number> = { A: 0, B: 0 };
  const sacks: Record<TeamKey, number> = { A: 0, B: 0 };
  let offense: TeamKey | null = null;
  let defense: TeamKey | null = null;
  let lineup: Lineup = {};
  let lastSkill: { team: TeamKey; id: number } | null = null;

  for (const ev of events) {
    switch (ev.t) {
      case 'FORMATION':
        offense = ev.team;
        defense = ev.team === 'A' ? 'B' : 'A';
        lineup = ev.lineup;
        lastSkill = null;
        break;
      case 'PLAY': {
        if (!offense || !defense) break;
        const o = ev.outcome;
        for (const id of o.offActors) entry(offense, id).plays += 1;
        for (const id of o.defActors) entry(defense, id).plays += 1;
        const skill = skillActor(o, lineup);
        lastSkill = skill === null ? null : { team: offense, id: skill };
        if (o.kind === 'GAIN' || o.kind === 'SACK') yards[offense] += o.yards;
        if (o.kind === 'GAIN' && skill !== null) entry(offense, skill).yards += o.yards;
        if (o.kind === 'SACK') sacks[defense] += 1;
        break;
      }
      case 'TURNOVER':
        if (offense) turnovers[offense] += 1;
        break;
      case 'TOUCHDOWN':
        if (lastSkill && lastSkill.team === ev.team) entry(lastSkill.team, lastSkill.id).touchdowns += 1;
        break;
      default:
        break;
    }
  }

  const pokemon = [...byKey.values()].sort((a, b) =>
    a.team === b.team ? a.speciesId - b.speciesId : a.team < b.team ? -1 : 1,
  );
  return { pokemon, yards, turnovers, sacks };
}
```

Substituir `packages/protocol/src/index.ts` por:
```ts
export * from './messages';
export * from './codec';
export * from './stats';
```

- [ ] **Step 4: Rodar os testes e o typecheck**

Run: `npx vitest run packages/protocol && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/protocol
git commit -m "feat(protocol): computeStats a partir dos eventos do motor"
```

---

### Task 4: Pacote do servidor — tempos, códigos de sala e parse de payloads

**Files:**
- Create: `apps/server/package.json`, `apps/server/src/timings.ts`, `apps/server/src/codes.ts`, `apps/server/src/outgoing.ts`, `apps/server/src/parse.ts`
- Create: `apps/server/test/fixtures.ts`, `apps/server/test/helpers.ts`
- Test: `apps/server/test/timings.test.ts`, `apps/server/test/codes.test.ts`, `apps/server/test/parse.test.ts`

**Interfaces:**
- Consumes: `PHASE_SECONDS`, `RESULT_ANIMATION_MS`, `RECONNECT_GRACE_MS`, `BOTH_DISCONNECTED_CLOSE_MS`, `ROOM_CODE_ALPHABET`, `ROOM_CODE_LENGTH`, `ServerToClientEvents` (Task 2); `FORMATIONS`, `PACKAGES`, `Action`, `FormationId`, `PackageId`, `Phase`, `Team`, `TeamKey` (motor).
- Produces:
  - `TimedPhase = Exclude<Phase, 'MATCH_END'>`
  - `Timings { phaseMs: Record<TimedPhase, number>; resultAnimationMs: number; reconnectGraceMs: number; bothDisconnectedCloseMs: number }`
  - `TimingsInput` (tudo opcional, `phaseMs` parcial), `DEFAULT_TIMINGS: Timings`, `resolveTimings(input?: TimingsInput): Timings`
  - `Scheduler { now(): number; schedule(ms: number, fn: () => void): () => void }` (`schedule` devolve a função que cancela), `realScheduler: Scheduler`
  - `generateRoomCode(random: () => number, isTaken: (code: string) => boolean): string`, `normalizeRoomCode(input: unknown): string | null`
  - `Outgoing` (union `{ event; payload }` de todos os eventos servidor → cliente), `Send = (to: TeamKey, msg: Outgoing) => void`
  - `PlayRequest` (union com `kind: 'formation' | 'package' | 'card' | 'conversion' | 'depth'`, sempre com `turnId`), `PlayEvent`, `parsePlay(event: PlayEvent, payload: unknown): PlayRequest | null`, `toAction(team: TeamKey, req: PlayRequest): Action`
  - Testes: `electricTeam(name?)` (cópia do Plano 1) e `recorder()`

- [ ] **Step 1: Criar o pacote e instalar as dependências**

`apps/server/package.json`:
```json
{
  "name": "@pfl/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "start": "tsx src/main.ts"
  },
  "dependencies": {
    "@pfl/engine": "*",
    "@pfl/protocol": "*"
  }
}
```

Run:
```bash
npm install
npm install socket.io -w @pfl/server
npm install -D socket.io-client -w @pfl/server
```
Expected: `apps/server/package.json` ganha `socket.io` em `dependencies` e `socket.io-client` em `devDependencies`; `package-lock.json` é atualizado; sem erros.

- [ ] **Step 2: Criar a fixture e o helper de testes**

`apps/server/test/fixtures.ts` (cópia literal da fixture do Plano 1; o servidor não importa arquivos de teste de outro pacote):
```ts
import type { Team } from '@pfl/engine';

/**
 * Time válido de teste (custo 72, abaixo do teto de 120).
 * 25 Pikachu, 26 Raichu, 100 Voltorb, 81 Magnemite, 125 Electabuzz, 74 Geodude, 95 Onix, 66 Machop,
 * 19 Rattata, 16 Pidgey, 21 Spearow, 50 Diglett, 54 Psyduck, 63 Abra, 10 Caterpie, 13 Weedle; especialista 129 Magikarp.
 */
export function electricTeam(name = 'Kanto Thunder'): Team {
  return {
    name,
    roster: [25, 26, 100, 81, 125, 74, 95, 66, 19, 16, 21, 50, 54, 63, 10, 13],
    specialist: 129,
    depth: {
      QB: [63, 54],
      OL1: [95, 66, 19],
      OL2: [74, 19, 66],
      OL3: [66, 50, 74],
      RB: [25, 50, 19],
      WR1: [26, 100, 13],
      WR2: [125, 10, 16],
      WR3: [100, 13, 21],
      TE: [81, 54],
      FB: [19, 66],
      DL1: [95, 74, 19],
      DL2: [74, 66, 50],
      DL3: [50, 19, 95],
      LB1: [66, 21, 16],
      LB2: [21, 16],
      CB1: [26, 10, 100],
      CB2: [100, 13, 125],
      CB3: [13, 10],
      S1: [63, 16, 54],
      S2: [16, 54],
    },
    keepOnField: [],
    offenseDeck: [
      'electric_thunder_screen', 'electric_thunder_screen',
      'normal_tackle', 'normal_tackle',
      'fighting_submission', 'fighting_submission',
      'ground_earthquake', 'ground_earthquake',
      'rock_avalanche', 'rock_avalanche',
      'bug_quick_bite', 'bug_quick_bite',
    ],
    defenseDeck: [
      'electric_paralysis', 'electric_paralysis',
      'normal_wall', 'normal_wall',
      'fighting_low_kick', 'fighting_low_kick',
      'ground_dig', 'ground_dig',
      'bug_string_shot', 'bug_string_shot',
      'psychic_foresight', 'psychic_foresight',
    ],
  };
}
```

`apps/server/test/helpers.ts`:
```ts
import type { TeamKey } from '@pfl/engine';
import type { Outgoing } from '../src/outgoing';

export type PayloadOf<E extends Outgoing['event']> = Extract<Outgoing, { event: E }>['payload'];
export interface Sent {
  to: TeamKey;
  msg: Outgoing;
}

/** Grava as mensagens que a sala/sessão envia, para os testes inspecionarem. */
export function recorder() {
  const sent: Sent[] = [];
  const all = <E extends Outgoing['event']>(to: TeamKey, event: E): PayloadOf<E>[] =>
    sent.filter((s) => s.to === to && s.msg.event === event).map((s) => s.msg.payload as PayloadOf<E>);
  return {
    sent,
    send: (to: TeamKey, msg: Outgoing): void => {
      sent.push({ to, msg });
    },
    /** nomes dos eventos recebidos por um jogador, em ordem */
    events: (to: TeamKey): string[] => sent.filter((s) => s.to === to).map((s) => s.msg.event),
    all,
    last: <E extends Outgoing['event']>(to: TeamKey, event: E): PayloadOf<E> | undefined => all(to, event).at(-1),
    clear: (): void => {
      sent.length = 0;
    },
  };
}
```

- [ ] **Step 3: Escrever os testes (devem falhar)**

`apps/server/test/timings.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TIMINGS, realScheduler, resolveTimings } from '../src/timings';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('timings', () => {
  it('os padrões vêm das constantes do protocolo', () => {
    expect(DEFAULT_TIMINGS).toEqual({
      phaseMs: { FORMATION: 5000, PACKAGE: 4000, PLAYCALL: 8000, CONVERSION: 8000 },
      resultAnimationMs: 4500,
      reconnectGraceMs: 60_000,
      bothDisconnectedCloseMs: 300_000,
    });
  });

  it('resolveTimings mescla valores parciais', () => {
    const t = resolveTimings({ phaseMs: { PACKAGE: 150 }, resultAnimationMs: 0 });
    expect(t.phaseMs).toEqual({ FORMATION: 5000, PACKAGE: 150, PLAYCALL: 8000, CONVERSION: 8000 });
    expect(t.resultAnimationMs).toBe(0);
    expect(t.reconnectGraceMs).toBe(60_000);
    expect(resolveTimings()).toEqual(DEFAULT_TIMINGS);
  });
});

describe('realScheduler', () => {
  it('usa o relógio e os timers globais (falsificáveis nos testes)', () => {
    expect(realScheduler.now()).toBe(1_000_000);
    const fn = vi.fn();
    realScheduler.schedule(100, fn);
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('a função devolvida cancela o timer', () => {
    const fn = vi.fn();
    const cancel = realScheduler.schedule(100, fn);
    cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });
});
```

`apps/server/test/codes.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { generateRoomCode, normalizeRoomCode } from '../src/codes';

const sequence = (values: number[]): (() => number) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('generateRoomCode', () => {
  it('gera 6 letras do alfabeto sem I/O', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateRoomCode(Math.random, () => false)).toMatch(/^[A-HJ-NP-Z]{6}$/);
    }
  });

  it('é determinístico para o mesmo random', () => {
    expect(generateRoomCode(sequence([0]), () => false)).toBe('AAAAAA');
    expect(generateRoomCode(sequence([0.999999]), () => false)).toBe('ZZZZZZ');
  });

  it('tenta de novo quando o código já existe', () => {
    const taken = new Set(['AAAAAA']);
    expect(generateRoomCode(sequence([0, 0, 0, 0, 0, 0, 0.999999, 0.999999, 0.999999, 0.999999, 0.999999, 0.999999]), (c) => taken.has(c))).toBe('ZZZZZZ');
  });

  it('não quebra se random devolver 1', () => {
    expect(generateRoomCode(() => 1, () => false)).toMatch(/^[A-HJ-NP-Z]{6}$/);
  });
});

describe('normalizeRoomCode', () => {
  it('aceita minúsculas e espaços nas pontas', () => {
    expect(normalizeRoomCode('  abcdef ')).toBe('ABCDEF');
  });

  it('rejeita tamanho errado, letras I/O, dígitos e não-strings', () => {
    for (const bad of ['ABCDE', 'ABCDEFG', 'ABCDEI', 'ABCDEO', 'ABC123', '', 123, null, undefined, {}]) {
      expect(normalizeRoomCode(bad)).toBeNull();
    }
  });
});
```

`apps/server/test/parse.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parsePlay, toAction } from '../src/parse';

describe('parsePlay', () => {
  it('aceita payloads válidos', () => {
    expect(parsePlay('play:formation', { turnId: 3, formation: 'SPREAD' })).toEqual({ kind: 'formation', turnId: 3, formation: 'SPREAD' });
    expect(parsePlay('play:package', { turnId: 3, package: 'DIME' })).toEqual({ kind: 'package', turnId: 3, package: 'DIME' });
    expect(parsePlay('play:card', { turnId: 3, cardId: 'basic_run' })).toEqual({ kind: 'card', turnId: 3, cardId: 'basic_run' });
    expect(parsePlay('play:conversion', { turnId: 3, choice: 'TWO' })).toEqual({ kind: 'conversion', turnId: 3, choice: 'TWO' });
    expect(parsePlay('team:depth', { turnId: 3, depth: { QB: [1] }, keepOnField: [] })).toEqual({
      kind: 'depth', turnId: 3, depth: { QB: [1] }, keepOnField: [],
    });
  });

  it('rejeita payloads malformados ou maliciosos', () => {
    const cases: [Parameters<typeof parsePlay>[0], unknown][] = [
      ['play:formation', null],
      ['play:formation', 'PISTOL'],
      ['play:formation', [1, 'PISTOL']],
      ['play:formation', { formation: 'PISTOL' }],
      ['play:formation', { turnId: '3', formation: 'PISTOL' }],
      ['play:formation', { turnId: 1.5, formation: 'PISTOL' }],
      ['play:formation', { turnId: 3, formation: 'constructor' }],
      ['play:formation', { turnId: 3, formation: '__proto__' }],
      ['play:formation', { turnId: 3, formation: 'pistol' }],
      ['play:package', { turnId: 3, package: 'toString' }],
      ['play:card', { turnId: 3, cardId: 42 }],
      ['play:card', { turnId: 3, cardId: 'x'.repeat(65) }],
      ['play:conversion', { turnId: 3, choice: 'THREE' }],
      ['team:depth', { turnId: 3, depth: [], keepOnField: [] }],
      ['team:depth', { turnId: 3, depth: { QB: [1] } }],
      ['team:depth', { turnId: 3, depth: null, keepOnField: [] }],
    ];
    for (const [event, payload] of cases) expect(parsePlay(event, payload)).toBeNull();
  });
});

describe('toAction', () => {
  it('o time vem sempre da vaga do socket, nunca do payload', () => {
    expect(toAction('B', { kind: 'formation', turnId: 1, formation: 'PISTOL' })).toEqual({ type: 'FORMATION', team: 'B', formation: 'PISTOL' });
    expect(toAction('A', { kind: 'package', turnId: 1, package: 'BASE' })).toEqual({ type: 'PACKAGE', team: 'A', package: 'BASE' });
    expect(toAction('A', { kind: 'card', turnId: 1, cardId: 'punt' })).toEqual({ type: 'CARD', team: 'A', cardId: 'punt' });
    expect(toAction('A', { kind: 'conversion', turnId: 1, choice: 'PAT' })).toEqual({ type: 'CONVERSION', team: 'A', choice: 'PAT' });
    expect(toAction('B', { kind: 'depth', turnId: 1, depth: { QB: [1] }, keepOnField: [2] })).toEqual({
      type: 'SET_DEPTH', team: 'B', depth: { QB: [1] }, keepOnField: [2],
    });
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `npx vitest run apps/server`
Expected: FAIL — `Failed to resolve import "../src/timings"` (e o mesmo para `codes` e `parse`).

- [ ] **Step 5: Implementar**

`apps/server/src/timings.ts`:
```ts
import type { Phase } from '@pfl/engine';
import { BOTH_DISCONNECTED_CLOSE_MS, PHASE_SECONDS, RECONNECT_GRACE_MS, RESULT_ANIMATION_MS } from '@pfl/protocol';

export type TimedPhase = Exclude<Phase, 'MATCH_END'>;

export interface Timings {
  phaseMs: Record<TimedPhase, number>;
  resultAnimationMs: number;
  reconnectGraceMs: number;
  bothDisconnectedCloseMs: number;
}

export interface TimingsInput {
  phaseMs?: Partial<Record<TimedPhase, number>>;
  resultAnimationMs?: number;
  reconnectGraceMs?: number;
  bothDisconnectedCloseMs?: number;
}

export const DEFAULT_TIMINGS: Timings = {
  phaseMs: {
    FORMATION: PHASE_SECONDS.FORMATION * 1000,
    PACKAGE: PHASE_SECONDS.PACKAGE * 1000,
    PLAYCALL: PHASE_SECONDS.PLAYCALL * 1000,
    CONVERSION: PHASE_SECONDS.CONVERSION * 1000,
  },
  resultAnimationMs: RESULT_ANIMATION_MS,
  reconnectGraceMs: RECONNECT_GRACE_MS,
  bothDisconnectedCloseMs: BOTH_DISCONNECTED_CLOSE_MS,
};

export function resolveTimings(input: TimingsInput = {}): Timings {
  return {
    phaseMs: { ...DEFAULT_TIMINGS.phaseMs, ...input.phaseMs },
    resultAnimationMs: input.resultAnimationMs ?? DEFAULT_TIMINGS.resultAnimationMs,
    reconnectGraceMs: input.reconnectGraceMs ?? DEFAULT_TIMINGS.reconnectGraceMs,
    bothDisconnectedCloseMs: input.bothDisconnectedCloseMs ?? DEFAULT_TIMINGS.bothDisconnectedCloseMs,
  };
}

/** Relógio + timers injetáveis. `schedule` devolve a função que cancela o timer. */
export interface Scheduler {
  now(): number;
  schedule(ms: number, fn: () => void): () => void;
}

/** Usa Date.now/setTimeout globais no momento da chamada, então funciona com vi.useFakeTimers(). */
export const realScheduler: Scheduler = {
  now: () => Date.now(),
  schedule: (ms, fn) => {
    const handle = setTimeout(fn, ms);
    return () => clearTimeout(handle);
  },
};
```

`apps/server/src/codes.ts`:
```ts
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@pfl/protocol';

const MAX_ATTEMPTS = 1000;

/** Código de 6 letras (A–Z sem I/O). O servidor pode usar Math.random; o motor, não. */
export function generateRoomCode(random: () => number, isTaken: (code: string) => boolean): string {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      const index = Math.floor(random() * ROOM_CODE_ALPHABET.length) % ROOM_CODE_ALPHABET.length;
      code += ROOM_CODE_ALPHABET[index];
    }
    if (!isTaken(code)) return code;
  }
  throw new Error('Não foi possível gerar um código de sala livre');
}

export function normalizeRoomCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const code = input.trim().toUpperCase();
  if (code.length !== ROOM_CODE_LENGTH) return null;
  return [...code].every((c) => ROOM_CODE_ALPHABET.includes(c)) ? code : null;
}
```

`apps/server/src/outgoing.ts`:
```ts
import type { TeamKey } from '@pfl/engine';
import type { ServerToClientEvents } from '@pfl/protocol';

/** Uma mensagem servidor → cliente: o nome do evento e o payload tipado. */
export type Outgoing = {
  [E in keyof ServerToClientEvents]: { event: E; payload: Parameters<ServerToClientEvents[E]>[0] };
}[keyof ServerToClientEvents];

export type Send = (to: TeamKey, msg: Outgoing) => void;
```

`apps/server/src/parse.ts`:
```ts
import { FORMATIONS, PACKAGES, type Action, type FormationId, type PackageId, type Team, type TeamKey } from '@pfl/engine';

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
      return isRecord(depth) && Array.isArray(keepOnField)
        ? { kind: 'depth', turnId, depth: depth as Team['depth'], keepOnField: keepOnField as number[] }
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
```

- [ ] **Step 6: Rodar os testes e o typecheck**

Run: `npx vitest run apps/server && npm run typecheck`
Expected: PASS; typecheck sem erros.

- [ ] **Step 7: Commit**

```bash
git add apps/server package.json package-lock.json
git commit -m "feat(server): pacote do servidor com tempos, códigos de sala e parse de payloads"
```

---
### Task 5: `MatchSession` — motor, timers, TIMEOUT e mensagens por jogador

**Files:**
- Create: `apps/server/src/match-session.ts`
- Test: `apps/server/test/match-session.test.ts`

**Interfaces:**
- Consumes:
  - Motor: `createMatch`, `step`, `playerView`, `EngineError`, `Action`, `GameEvent`, `MatchState`, `StepResult`, `Team`, `TeamKey`.
  - Protocolo: `computeStats`, `EndMessage`, `ErrorCode`.
  - Task 4: `Scheduler`, `Timings`, `TimedPhase`, `Send`, `PlayRequest`, `toAction`.
- Produces:
  ```ts
  interface SessionDeps {
    scheduler: Scheduler;
    timings: Timings;
    send: Send;                            // a Room filtra quem está desconectado
    isAbsent: (key: TeamKey) => boolean;   // tolerância de reconexão esgotada
    onEnd: (end: EndMessage) => void;
  }
  class MatchSession {
    constructor(teams: Record<TeamKey, Team>, seed: number, deps: SessionDeps); // lança EngineError('INVALID_TEAM') se algum time for inválido
    readonly seed: number;
    get state(): MatchState;
    get actions(): readonly Action[];
    get events(): readonly GameEvent[];
    get deadline(): number;      // epoch ms do deadline efetivo da etapa atual
    get finished(): boolean;
    get paused(): boolean;
    start(): void;               // envia o primeiro match:phase
    handle(key: TeamKey, req: PlayRequest): void;
    sendCurrent(key: TeamKey): void;   // match:phase atual, ou match:end se acabou
    pause(): void;
    resume(): void;
    refreshAbsence(): void;      // reprograma o timer quando a ausência de alguém muda
    dispose(): void;
  }
  ```
- Regras (ver "Regras de mensagens" na File Structure):
  - O deadline de uma etapa é `agora + atraso + phaseMs[fase]`, onde o atraso é `resultAnimationMs` depois de um `match:result` com eventos e 0 nos outros casos.
  - Se todos que ainda precisam agir estão ausentes, o deadline efetivo vira o início da etapa.
  - `handle` aplica antes qualquer TIMEOUT vencido (`agora ≥ deadline`). Só então compara o `turnId` e chama o motor.

- [ ] **Step 1: Escrever o teste (deve falhar)**

`apps/server/test/match-session.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { replay, type Team, type TeamKey } from '@pfl/engine';
import { computeStats, type EndMessage } from '@pfl/protocol';
import { MatchSession } from '../src/match-session';
import { realScheduler, resolveTimings, type TimingsInput } from '../src/timings';
import { electricTeam } from './fixtures';
import { recorder } from './helpers';

const T0 = 1_000_000;
const KEYS = ['A', 'B'] as const;
const teams = (): Record<TeamKey, Team> => ({ A: electricTeam('A'), B: electricTeam('B') });

function setup(opts: { absent?: TeamKey[]; timings?: TimingsInput } = {}) {
  const rec = recorder();
  const absent = new Set<TeamKey>(opts.absent ?? []);
  const ends: EndMessage[] = [];
  const session = new MatchSession(teams(), 42, {
    scheduler: realScheduler,
    timings: resolveTimings(opts.timings),
    send: rec.send,
    isAbsent: (k) => absent.has(k),
    onEnd: (e) => {
      ends.push(e);
    },
  });
  return { session, rec, absent, ends };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('início e loop da jogada', () => {
  it('envia FORMATION aos dois, com deadline de 5 s e a visão de cada um', () => {
    const { session, rec } = setup();
    session.start();
    for (const k of KEYS) {
      const phase = rec.last(k, 'match:phase')!;
      expect(phase.phase).toBe('FORMATION');
      expect(phase.turnId).toBe(session.state.turnId);
      expect(phase.deadline).toBe(T0 + 5000);
      expect(phase.view.you).toBe(k);
      expect(phase.view.canEditDepth).toBe(true);
    }
    expect(rec.last('A', 'match:phase')!.view.side).toBe('offense');
    expect(rec.last('B', 'match:phase')!.view.side).toBe('defense');
  });

  it('segue a ordem do contrato num snap completo', () => {
    const { session, rec } = setup();
    session.start();
    const turnId = session.state.turnId;
    session.handle('A', { kind: 'formation', turnId, formation: 'PISTOL' });
    session.handle('B', { kind: 'package', turnId, package: 'BASE' });
    session.handle('A', { kind: 'card', turnId, cardId: 'basic_run' });
    session.handle('B', { kind: 'card', turnId, cardId: 'basic_defense' });
    expect(rec.events('A')).toEqual([
      'match:phase', // FORMATION
      'match:reveal', // evento FORMATION
      'match:phase', // PACKAGE
      'match:reveal', // evento PACKAGE
      'match:phase', // PLAYCALL
      'match:phase', // PLAYCALL de novo: A escolheu (mesmo turnId/fase, visão atualizada)
      'match:result',
      'match:phase', // próximo snap
    ]);
    const [formationReveal, packageReveal] = rec.all('B', 'match:reveal');
    expect(formationReveal.events.map((e) => e.t)).toEqual(['FORMATION']);
    expect(packageReveal.events.map((e) => e.t)).toEqual(['PACKAGE']);
    const result = rec.last('B', 'match:result')!;
    expect(result.turnId).toBe(turnId);
    expect(result.events.map((e) => e.t)).toEqual(expect.arrayContaining(['CARDS', 'PLAY']));
    expect(result.view.you).toBe('B');
    const next = rec.last('A', 'match:phase')!;
    expect(next.turnId).toBeGreaterThan(turnId);
    expect(next.deadline).toBe(T0 + 4500 + 5000);
  });

  it('quando um lado escolhe a carta, o outro vê só que ele escolheu', () => {
    const { session, rec } = setup();
    session.start();
    const turnId = session.state.turnId;
    session.handle('A', { kind: 'formation', turnId, formation: 'PISTOL' });
    session.handle('B', { kind: 'package', turnId, package: 'BASE' });
    session.handle('A', { kind: 'card', turnId, cardId: 'basic_pass' });
    const phaseB = rec.last('B', 'match:phase')!;
    expect(phaseB.phase).toBe('PLAYCALL');
    expect(phaseB.deadline).toBe(T0 + 8000);
    expect(phaseB.view.opponentHasChosen).toBe(true);
    expect(JSON.stringify(phaseB)).not.toContain('basic_pass');
    expect(rec.last('A', 'match:phase')!.view.yourCard).toBe('basic_pass');
  });
});

describe('ações inválidas', () => {
  it('turnId antigo: STALE_TURN e reenvio do match:phase atual', () => {
    const { session, rec } = setup();
    session.start();
    rec.clear();
    session.handle('A', { kind: 'formation', turnId: session.state.turnId + 1, formation: 'PISTOL' });
    expect(rec.events('A')).toEqual(['error', 'match:phase']);
    expect(rec.last('A', 'error')!.code).toBe('STALE_TURN');
    expect(rec.events('B')).toEqual([]);
    expect(session.actions).toEqual([]);
  });

  it('ação do time errado: ENGINE_ERROR com o código do motor, estado intacto', () => {
    const { session, rec } = setup();
    session.start();
    const before = structuredClone(session.state);
    session.handle('B', { kind: 'formation', turnId: session.state.turnId, formation: 'PISTOL' });
    expect(rec.last('B', 'error')).toEqual({ code: 'ENGINE_ERROR', message: 'WRONG_TEAM' });
    expect(session.state).toEqual(before);
    expect(session.actions).toEqual([]);
  });

  it('carta repetida: ALREADY_CHOSEN', () => {
    const { session, rec } = setup();
    session.start();
    const turnId = session.state.turnId;
    session.handle('A', { kind: 'formation', turnId, formation: 'PISTOL' });
    session.handle('B', { kind: 'package', turnId, package: 'BASE' });
    session.handle('A', { kind: 'card', turnId, cardId: 'basic_run' });
    session.handle('A', { kind: 'card', turnId, cardId: 'basic_pass' });
    expect(rec.last('A', 'error')!.message).toMatch(/ALREADY_CHOSEN/);
    expect(session.actions).toHaveLength(3);
  });
});

describe('timers e padrões de timeout', () => {
  it('o servidor aplica TIMEOUT quando o deadline expira', () => {
    const { session, rec } = setup();
    session.start();
    vi.advanceTimersByTime(4999);
    expect(rec.all('B', 'match:reveal')).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(rec.last('B', 'match:reveal')!.events[0]).toMatchObject({ t: 'FORMATION', formation: 'PISTOL' });
    expect(session.actions).toEqual([{ type: 'TIMEOUT' }]);
    expect(rec.last('B', 'match:phase')!.deadline).toBe(T0 + 5000 + 4000);
  });

  it('ação que chega depois do deadline, antes do timer disparar: o padrão vale e a ação é rejeitada', () => {
    const { session, rec } = setup();
    session.start();
    const turnId = session.state.turnId;
    vi.setSystemTime(T0 + 5001); // o relógio passou do deadline, mas o callback do timer ainda não rodou
    session.handle('A', { kind: 'formation', turnId, formation: 'HEAVY' });
    expect(rec.all('B', 'match:reveal')).toHaveLength(1);
    expect(rec.last('B', 'match:reveal')!.events[0]).toMatchObject({ t: 'FORMATION', formation: 'PISTOL' });
    expect(rec.last('A', 'error')).toMatchObject({ code: 'ENGINE_ERROR', message: expect.stringMatching(/WRONG_PHASE/) });
    expect(session.actions).toEqual([{ type: 'TIMEOUT' }]);
    vi.advanceTimersByTime(0);
    expect(rec.all('B', 'match:reveal')).toHaveLength(1); // o timer antigo não dispara um segundo TIMEOUT
  });

  it('com a tolerância esgotada, a etapa de quem está ausente expira assim que começa', () => {
    const { session, rec } = setup({ absent: ['A'] });
    session.start();
    expect(rec.last('B', 'match:phase')!.deadline).toBe(T0);
    vi.advanceTimersByTime(1);
    expect(rec.last('B', 'match:reveal')!.events[0]).toMatchObject({ t: 'FORMATION', formation: 'PISTOL' });
    const turnId = session.state.turnId;
    const pkg = rec.last('B', 'match:phase')!;
    expect(pkg.phase).toBe('PACKAGE');
    expect(pkg.deadline).toBe(T0 + 4000); // B está presente: timer normal (o TIMEOUT disparou em T0)
    session.handle('B', { kind: 'package', turnId, package: 'NICKEL' });
    expect(rec.last('B', 'match:phase')!.deadline).toBe(T0 + 1 + 8000); // PLAYCALL: B ainda precisa agir
    session.handle('B', { kind: 'card', turnId, cardId: 'basic_defense' });
    expect(rec.last('B', 'match:phase')!.deadline).toBe(T0 + 1); // falta só A, que está ausente
    vi.advanceTimersByTime(1);
    expect(rec.last('B', 'match:result')!.events.find((e) => e.t === 'CARDS')).toMatchObject({
      offense: 'basic_run',
      defense: 'basic_defense',
    });
  });

  it('refreshAbsence antecipa o deadline e avisa os dois', () => {
    const { session, rec, absent } = setup();
    session.start();
    vi.advanceTimersByTime(1000);
    absent.add('A');
    session.refreshAbsence();
    expect(rec.last('B', 'match:phase')!.deadline).toBe(T0 + 1000);
    vi.advanceTimersByTime(1);
    expect(rec.all('B', 'match:reveal')).toHaveLength(1);
  });

  it('pause congela o timer; resume continua com o tempo restante', () => {
    const { session, rec } = setup();
    session.start();
    vi.advanceTimersByTime(2000);
    session.pause();
    expect(session.paused).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(session.actions).toEqual([]);
    session.resume();
    expect(session.paused).toBe(false);
    expect(rec.last('A', 'match:phase')!.deadline).toBe(T0 + 62_000 + 3000);
    vi.advanceTimersByTime(2999);
    expect(session.actions).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(session.actions).toEqual([{ type: 'TIMEOUT' }]);
  });
});

describe('ajuste do depth chart (team:depth)', () => {
  it('aceita no primeiro snap, confirma reenviando a fase só para quem pediu e entra no log', () => {
    const { session, rec } = setup();
    session.start();
    const turnId = session.state.turnId;
    const depth = { ...electricTeam().depth, QB: [54, 63] };
    rec.clear();
    session.handle('A', { kind: 'depth', turnId, depth, keepOnField: [25] });
    expect(rec.events('A')).toEqual(['match:phase']);
    expect(rec.last('A', 'match:phase')!.deadline).toBe(T0 + 5000);
    expect(rec.events('B')).toEqual([]);
    expect(session.actions).toEqual([{ type: 'SET_DEPTH', team: 'A', depth, keepOnField: [25] }]);
    session.handle('A', { kind: 'formation', turnId, formation: 'PISTOL' });
    expect(rec.last('B', 'match:reveal')!.events[0]).toMatchObject({ t: 'FORMATION', lineup: { QB: 54 } });
  });

  it('depth inválido → INVALID_DEPTH; depois da formação → DEPTH_LOCKED', () => {
    const { session, rec } = setup();
    session.start();
    const turnId = session.state.turnId;
    session.handle('A', { kind: 'depth', turnId, depth: { ...electricTeam().depth, QB: [150] }, keepOnField: [] });
    expect(rec.last('A', 'error')!.message).toMatch(/INVALID_DEPTH/);
    session.handle('A', { kind: 'formation', turnId, formation: 'PISTOL' });
    session.handle('B', { kind: 'depth', turnId, depth: electricTeam().depth, keepOnField: [] });
    expect(rec.last('B', 'error')!.message).toMatch(/DEPTH_LOCKED/);
    expect(session.actions).toHaveLength(1);
  });
});

describe('fim de partida', () => {
  it('uma partida só de timeouts termina com match:end, stats e replay reproduzível', () => {
    const { session, rec, ends } = setup({ timings: { resultAnimationMs: 0 } });
    session.start();
    for (let i = 0; i < 10_000 && !session.finished; i++) vi.advanceTimersToNextTimer();
    expect(session.finished).toBe(true);
    expect(ends).toHaveLength(1);
    const end = ends[0];
    expect(end.score).toEqual(session.state.score);
    expect(end.score.A).not.toBe(end.score.B);
    expect(end.replay.seed).toBe(42);
    expect(end.replay.teams).toEqual(teams());
    expect(end.replay.actions.every((a) => a.type === 'TIMEOUT')).toBe(true);
    const replayed = replay(end.replay.teams.A, end.replay.teams.B, end.replay.seed, end.replay.actions);
    expect(replayed.state).toEqual(session.state);
    expect(end.stats).toEqual(computeStats(replayed.events));
    for (const k of KEYS) {
      expect(rec.events(k).at(-1)).toBe('match:end');
      expect(rec.events(k).at(-2)).toBe('match:result');
      expect(rec.last(k, 'match:end')).toEqual(end);
    }
  });

  it('depois do fim, ações recebem STALE_TURN e o match:end é reenviado; resync também', () => {
    const { session, rec } = setup({ timings: { resultAnimationMs: 0 } });
    session.start();
    for (let i = 0; i < 10_000 && !session.finished; i++) vi.advanceTimersToNextTimer();
    rec.clear();
    session.handle('A', { kind: 'formation', turnId: 1, formation: 'PISTOL' });
    expect(rec.events('A')).toEqual(['error', 'match:end']);
    session.sendCurrent('B');
    expect(rec.events('B')).toEqual(['match:end']);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/server/test/match-session.test.ts`
Expected: FAIL — `Failed to resolve import "../src/match-session"`.

- [ ] **Step 3: Implementar**

`apps/server/src/match-session.ts`:
```ts
import {
  EngineError, createMatch, playerView, step,
  type Action, type GameEvent, type MatchState, type StepResult, type Team, type TeamKey,
} from '@pfl/engine';
import { computeStats, type EndMessage, type ErrorCode } from '@pfl/protocol';
import type { Send } from './outgoing';
import { toAction, type PlayRequest } from './parse';
import type { Scheduler, TimedPhase, Timings } from './timings';

const KEYS: readonly TeamKey[] = ['A', 'B'];
const other = (k: TeamKey): TeamKey => (k === 'A' ? 'B' : 'A');

export interface SessionDeps {
  scheduler: Scheduler;
  timings: Timings;
  /** A Room filtra quem está desconectado. */
  send: Send;
  /** Tolerância de reconexão esgotada. */
  isAbsent: (key: TeamKey) => boolean;
  onEnd: (end: EndMessage) => void;
}

/**
 * Uma partida em andamento: o servidor é a autoridade (spec 7.1).
 * Guarda o estado do motor, o log de ações (replay) e os timers de etapa, e projeta a visão de cada jogador.
 */
export class MatchSession {
  private current: MatchState;
  private readonly log: Action[] = [];
  private readonly history: GameEvent[];
  private readonly teams: Record<TeamKey, Team>;
  /** muda a cada timer programado; um callback de timer antigo não faz nada */
  private phaseSeq = 0;
  /** início da etapa (depois da folga de animação) */
  private phaseStartsAt = 0;
  /** deadline cheio da etapa */
  private fullDeadline = 0;
  /** deadline efetivo: o cheio, ou o início da etapa se todos que faltam agir estão ausentes */
  private deadlineAt = 0;
  private cancelTimer: (() => void) | null = null;
  private pausedOffsets: { start: number; full: number } | null = null;
  private endMessage: EndMessage | null = null;

  constructor(teams: Record<TeamKey, Team>, readonly seed: number, private readonly deps: SessionDeps) {
    this.teams = structuredClone(teams);
    const created = createMatch(this.teams.A, this.teams.B, seed);
    this.current = created.state;
    this.history = [...created.events];
  }

  get state(): MatchState {
    return this.current;
  }
  get actions(): readonly Action[] {
    return this.log;
  }
  get events(): readonly GameEvent[] {
    return this.history;
  }
  get deadline(): number {
    return this.deadlineAt;
  }
  get finished(): boolean {
    return this.endMessage !== null;
  }
  get paused(): boolean {
    return this.pausedOffsets !== null;
  }

  start(): void {
    this.enterPhase(0);
  }

  handle(key: TeamKey, req: PlayRequest): void {
    if (this.pausedOffsets) return;
    this.expireIfDue();
    if (req.turnId !== this.current.turnId) {
      this.error(key, 'STALE_TURN', `turnId ${req.turnId} não é o turno atual (${this.current.turnId})`);
      this.sendCurrent(key);
      return;
    }
    this.apply(toAction(key, req), key);
  }

  sendCurrent(key: TeamKey): void {
    if (this.endMessage) {
      this.deps.send(key, { event: 'match:end', payload: this.endMessage });
      return;
    }
    const s = this.current;
    this.deps.send(key, {
      event: 'match:phase',
      payload: { turnId: s.turnId, phase: s.phase, deadline: this.deadlineAt, view: playerView(s, key) },
    });
  }

  pause(): void {
    if (this.endMessage || this.pausedOffsets) return;
    const now = this.deps.scheduler.now();
    this.pausedOffsets = {
      start: Math.max(0, this.phaseStartsAt - now),
      full: Math.max(0, this.fullDeadline - now),
    };
    this.clearTimer();
  }

  resume(): void {
    if (!this.pausedOffsets) return;
    const now = this.deps.scheduler.now();
    this.phaseStartsAt = now + this.pausedOffsets.start;
    this.fullDeadline = now + this.pausedOffsets.full;
    this.pausedOffsets = null;
    this.armTimer();
    for (const k of KEYS) this.sendCurrent(k);
  }

  refreshAbsence(): void {
    if (this.endMessage || this.pausedOffsets) return;
    const before = this.deadlineAt;
    this.armTimer();
    if (this.deadlineAt !== before) for (const k of KEYS) this.sendCurrent(k);
  }

  dispose(): void {
    this.clearTimer();
  }

  private apply(action: Action, from: TeamKey | null): void {
    const prev = this.current;
    let result: StepResult;
    try {
      result = step(prev, action);
    } catch (err) {
      if (!(err instanceof EngineError)) console.error('[pfl] erro inesperado do motor', err);
      if (from) this.error(from, 'ENGINE_ERROR', err instanceof EngineError ? err.message : 'Ação inválida');
      return;
    }
    this.current = result.state;
    this.log.push(action);
    this.history.push(...result.events);
    this.dispatch(prev, action, result.events, from);
  }

  private dispatch(prev: MatchState, action: Action, events: GameEvent[], from: TeamKey | null): void {
    const s = this.current;
    if (action.type === 'SET_DEPTH') {
      // confirmação: mesma etapa e mesmo deadline, só para quem pediu
      if (from) this.sendCurrent(from);
      return;
    }
    if (s.phase === 'MATCH_END') {
      this.clearTimer();
      this.sendResult(prev.turnId, events);
      this.finish();
      return;
    }
    if (s.turnId === prev.turnId && s.phase === prev.phase) {
      // PLAYCALL: um lado escolheu; o outro passa a ver opponentHasChosen
      this.armTimer();
      for (const k of KEYS) this.sendCurrent(k);
      return;
    }
    if (s.turnId === prev.turnId) {
      // FORMATION → PACKAGE ou PACKAGE → PLAYCALL
      for (const k of KEYS) this.deps.send(k, { event: 'match:reveal', payload: { turnId: prev.turnId, events } });
      this.enterPhase(0);
      return;
    }
    // jogada resolvida ou conversão
    this.sendResult(prev.turnId, events);
    this.enterPhase(events.length > 0 ? this.deps.timings.resultAnimationMs : 0);
  }

  private sendResult(turnId: number, events: GameEvent[]): void {
    for (const k of KEYS) {
      this.deps.send(k, { event: 'match:result', payload: { turnId, events, view: playerView(this.current, k) } });
    }
  }

  private enterPhase(delayMs: number): void {
    const now = this.deps.scheduler.now();
    this.phaseStartsAt = now + delayMs;
    this.fullDeadline = this.phaseStartsAt + this.deps.timings.phaseMs[this.current.phase as TimedPhase];
    this.armTimer();
    for (const k of KEYS) this.sendCurrent(k);
  }

  /** Quem ainda precisa agir na etapa atual. */
  private pendingActors(): TeamKey[] {
    const s = this.current;
    const defense = other(s.offense);
    switch (s.phase) {
      case 'FORMATION':
      case 'CONVERSION':
        return [s.offense];
      case 'PACKAGE':
        return [defense];
      case 'PLAYCALL':
        return [...(s.cards.offense === null ? [s.offense] : []), ...(s.cards.defense === null ? [defense] : [])];
      default:
        return [];
    }
  }

  private armTimer(): void {
    this.clearTimer();
    if (this.endMessage || this.pausedOffsets) return;
    const now = this.deps.scheduler.now();
    const pending = this.pendingActors();
    const allAbsent = pending.length > 0 && pending.every((k) => this.deps.isAbsent(k));
    this.deadlineAt = allAbsent ? Math.min(this.fullDeadline, Math.max(this.phaseStartsAt, now)) : this.fullDeadline;
    const seq = this.phaseSeq;
    this.cancelTimer = this.deps.scheduler.schedule(Math.max(0, this.deadlineAt - now), () => this.onDeadline(seq));
  }

  private clearTimer(): void {
    this.cancelTimer?.();
    this.cancelTimer = null;
    this.phaseSeq += 1;
  }

  private onDeadline(seq: number): void {
    if (seq !== this.phaseSeq || this.endMessage || this.pausedOffsets) return;
    this.cancelTimer = null;
    this.apply({ type: 'TIMEOUT' }, null);
  }

  /** Corrida entre a ação e o timer: se o deadline já passou, o padrão vale primeiro. */
  private expireIfDue(): void {
    if (this.endMessage || this.pausedOffsets) return;
    if (this.deps.scheduler.now() >= this.deadlineAt) this.onDeadline(this.phaseSeq);
  }

  private finish(): void {
    const s = this.current;
    this.endMessage = {
      score: { ...s.score },
      stats: computeStats(this.history),
      replay: { seed: this.seed, teams: structuredClone(this.teams), actions: structuredClone(this.log) },
    };
    for (const k of KEYS) this.deps.send(k, { event: 'match:end', payload: this.endMessage });
    this.deps.onEnd(this.endMessage);
  }

  private error(to: TeamKey, code: ErrorCode, message: string): void {
    this.deps.send(to, { event: 'error', payload: { code, message } });
  }
}
```

Observação sobre `phaseSeq`: `clearTimer` incrementa o contador e `armTimer` captura o valor depois dele. Assim, um callback agendado antes de qualquer reprogramação, ou uma chamada vinda de `expireIfDue` com o contador antigo, é ignorado. `expireIfDue` passa o valor atual, que ainda é o do timer vigente.

- [ ] **Step 4: Rodar os testes e o typecheck**

Run: `npx vitest run apps/server/test/match-session.test.ts && npm run typecheck`
Expected: PASS. Se o teste "segue a ordem do contrato" falhar porque o snap terminou em TD (próxima etapa CONVERSION, com deadline `T0 + 4500 + 8000`), a seed 42 mudou de comportamento no motor. Investigue o motor; não troque a seed para esconder o problema.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/match-session.ts apps/server/test/match-session.test.ts
git commit -m "feat(server): MatchSession com timers, padrões de timeout e visão por jogador"
```

---
### Task 6: `Room` — vagas, tokens, lobby e desconexão

**Files:**
- Create: `apps/server/src/room.ts`
- Test: `apps/server/test/room.test.ts`

**Interfaces:**
- Consumes:
  - Motor: `validateTeam`, `Team`, `TeamError`, `TeamKey`.
  - Protocolo: `decodeTeam`, `ErrorCode`, `RoomState`, `RoomStatus`.
  - Task 4: `Scheduler`, `Timings`, `Outgoing`, `Send`, `PlayRequest`.
  - Task 5: `MatchSession`.
- Produces:
  ```ts
  interface RoomDeps {
    scheduler: Scheduler;
    timings: Timings;
    random: () => number;        // seed da partida
    newToken: () => string;      // token de reconexão
    send: Send;                  // só é chamado para vagas conectadas
    onClose: () => void;
  }
  class Room {
    constructor(code: string, deps: RoomDeps);
    readonly code: string;
    get status(): RoomStatus;
    get session(): MatchSession | null;
    get isClosed(): boolean;
    connectionOf(key: TeamKey): string | null;
    tokenOf(key: TeamKey): string | null;
    claimSeat(token?: unknown): { key: TeamKey; token: string } | null;   // null = sala cheia (ROOM_FULL)
    connect(key: TeamKey, connId: string): string | null;                // devolve a conexão anterior, que deve ser derrubada
    disconnect(key: TeamKey, connId: string): void;                      // ignora connId que não é o atual
    submitTeam(key: TeamKey, teamCode: unknown): void;
    setReady(key: TeamKey, ready: unknown): void;
    play(key: TeamKey, req: PlayRequest): void;
    resync(key: TeamKey): void;                                          // room:state + match:phase/match:end
    close(): void;
  }
  ```
- Política de conexão:
  - **Lobby (`WAITING`):** a sala fecha `bothDisconnectedCloseMs` depois de ficar sem ninguém conectado. A vaga desconectada continua reservada pelo token.
  - **Partida (`IN_MATCH`) com um desconectado:** os timers seguem. Depois de `reconnectGraceMs`, ele vira "ausente" (`MatchSession.refreshAbsence`).
  - **Partida com os dois desconectados:** `PAUSED`. Os timers de etapa e de tolerância param, e a sala fecha depois de `bothDisconnectedCloseMs`. Quem volta retoma a partida; quem continua fora recebe o restante da tolerância.
  - **Partida encerrada (`FINISHED`):** a sala fecha `bothDisconnectedCloseMs` depois do fim, mesmo com gente conectada. Até lá, `resync` reenvia o `match:end`.

- [ ] **Step 1: Escrever o teste (deve falhar)**

`apps/server/test/room.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeTeam } from '@pfl/protocol';
import { Room } from '../src/room';
import { realScheduler, resolveTimings, type TimingsInput } from '../src/timings';
import { electricTeam } from './fixtures';
import { recorder } from './helpers';

const T0 = 1_000_000;

function makeRoom(timings?: TimingsInput) {
  const rec = recorder();
  let closed = 0;
  let tokens = 0;
  const room = new Room('ABCDEF', {
    scheduler: realScheduler,
    timings: resolveTimings(timings),
    random: () => 0.5,
    newToken: () => `tok-${++tokens}`,
    send: rec.send,
    onClose: () => {
      closed += 1;
    },
  });
  return { room, rec, closedCount: () => closed };
}

/** Sala com os dois conectados, times válidos e prontos: a partida já começou. */
function started(timings?: TimingsInput) {
  const h = makeRoom(timings);
  const a = h.room.claimSeat()!;
  const b = h.room.claimSeat()!;
  h.room.connect('A', 'conn-a');
  h.room.connect('B', 'conn-b');
  h.room.submitTeam('A', encodeTeam(electricTeam('Raio')));
  h.room.submitTeam('B', encodeTeam(electricTeam('Trovão')));
  h.room.setReady('A', true);
  h.room.setReady('B', true);
  return { ...h, tokenA: a.token, tokenB: b.token };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('vagas e tokens', () => {
  it('A, depois B; o terceiro cliente fica de fora', () => {
    const { room } = makeRoom();
    expect(room.claimSeat()).toEqual({ key: 'A', token: 'tok-1' });
    expect(room.claimSeat()).toEqual({ key: 'B', token: 'tok-2' });
    expect(room.claimSeat()).toBeNull();
  });

  it('o token devolve a mesma vaga; token de outra sala ou que não é string não dá acesso', () => {
    const { room } = makeRoom();
    const a = room.claimSeat()!;
    room.claimSeat();
    expect(room.claimSeat(a.token)).toEqual(a);
    expect(room.claimSeat('token-de-outra-sala')).toBeNull();
    expect(room.claimSeat(42)).toBeNull();
    expect(room.tokenOf('A')).toBe(a.token);
    expect(room.tokenOf('B')).toBe('tok-2');
  });

  it('com a partida em andamento, só volta quem tem o token', () => {
    const { room, tokenB } = started();
    expect(room.status).toBe('IN_MATCH');
    expect(room.claimSeat()).toBeNull();
    expect(room.claimSeat(tokenB)).toEqual({ key: 'B', token: tokenB });
  });
});

describe('lobby', () => {
  it('room:state traz a visão de cada jogador', () => {
    const { room, rec } = makeRoom();
    room.claimSeat();
    room.connect('A', 'conn-a');
    expect(rec.last('A', 'room:state')).toEqual({
      code: 'ABCDEF',
      you: 'A',
      status: 'WAITING',
      players: [{ key: 'A', connected: true, ready: false, teamName: null, teamErrors: [] }],
    });
    room.claimSeat();
    room.connect('B', 'conn-b');
    expect(rec.last('A', 'room:state')!.players).toHaveLength(2);
    expect(rec.last('B', 'room:state')!.you).toBe('B');
  });

  it('código de time ilegível: INVALID_TEAM_CODE e MALFORMED_TEAM no room:state', () => {
    const { room, rec } = makeRoom();
    room.claimSeat();
    room.connect('A', 'conn-a');
    room.submitTeam('A', '%%%');
    expect(rec.last('A', 'error')!.code).toBe('INVALID_TEAM_CODE');
    expect(rec.last('A', 'room:state')!.players[0]).toMatchObject({ teamName: null, teamErrors: [{ code: 'MALFORMED_TEAM' }] });
    room.submitTeam('A', 12345);
    expect(rec.all('A', 'error')).toHaveLength(2);
  });

  it('time inválido: lista de motivos no room:state, com o nome do time', () => {
    const { room, rec } = makeRoom();
    room.claimSeat();
    room.connect('A', 'conn-a');
    const team = electricTeam('Fraco');
    room.submitTeam('A', encodeTeam({ ...team, roster: team.roster.slice(1) }));
    const player = rec.last('A', 'room:state')!.players[0];
    expect(player.teamName).toBe('Fraco');
    expect(player.teamErrors.map((e) => e.code)).toContain('ROSTER_SIZE');
    expect(rec.all('A', 'error')).toEqual([]);
  });

  it('time válido: sem erros; pronto sem time válido dá TEAM_INVALID', () => {
    const { room, rec } = makeRoom();
    room.claimSeat();
    room.connect('A', 'conn-a');
    room.setReady('A', true);
    expect(rec.last('A', 'error')!.code).toBe('TEAM_INVALID');
    room.submitTeam('A', encodeTeam(electricTeam('Raio')));
    expect(rec.last('A', 'room:state')!.players[0]).toMatchObject({ teamName: 'Raio', teamErrors: [], ready: false });
    room.setReady('A', true);
    expect(rec.last('A', 'room:state')!.players[0].ready).toBe(true);
    room.setReady('A', 'sim');
    expect(rec.last('A', 'room:state')!.players[0].ready).toBe(false);
  });

  it('reenviar o time tira o pronto', () => {
    const { room, rec } = makeRoom();
    room.claimSeat();
    room.connect('A', 'conn-a');
    room.submitTeam('A', encodeTeam(electricTeam('Raio')));
    room.setReady('A', true);
    room.submitTeam('A', encodeTeam(electricTeam('Raio 2')));
    expect(rec.last('A', 'room:state')!.players[0]).toMatchObject({ teamName: 'Raio 2', ready: false });
  });

  it('a partida começa quando os dois estão prontos e válidos, com seed gerada pelo servidor', () => {
    const { room, rec } = started();
    expect(room.status).toBe('IN_MATCH');
    expect(rec.last('A', 'room:state')!.status).toBe('IN_MATCH');
    expect(room.session!.seed).toBe(Math.floor(0.5 * 0x7fffffff));
    expect(room.session!.state.teams.A.team.name).toBe('Raio');
    expect(room.session!.state.teams.B.team.name).toBe('Trovão');
    for (const k of ['A', 'B'] as const) expect(rec.last(k, 'match:phase')!.phase).toBe('FORMATION');
  });

  it('não começa com alguém desconectado; começa quando ele volta', () => {
    const { room } = makeRoom();
    room.claimSeat();
    room.claimSeat();
    room.connect('A', 'conn-a');
    room.connect('B', 'conn-b');
    room.submitTeam('A', encodeTeam(electricTeam('Raio')));
    room.submitTeam('B', encodeTeam(electricTeam('Trovão')));
    room.setReady('A', true);
    room.disconnect('A', 'conn-a');
    room.setReady('B', true);
    expect(room.status).toBe('WAITING');
    room.connect('A', 'conn-a2');
    expect(room.status).toBe('IN_MATCH');
  });

  it('NOT_READY: time ou pronto com a partida em andamento, jogada antes da partida', () => {
    const lobby = makeRoom();
    lobby.room.claimSeat();
    lobby.room.connect('A', 'conn-a');
    lobby.room.play('A', { kind: 'formation', turnId: 1, formation: 'PISTOL' });
    expect(lobby.rec.last('A', 'error')!.code).toBe('NOT_READY');

    const { room, rec } = started();
    room.submitTeam('A', encodeTeam(electricTeam('Outro')));
    expect(rec.last('A', 'error')!.code).toBe('NOT_READY');
    room.setReady('B', false);
    expect(rec.last('B', 'error')!.code).toBe('NOT_READY');
  });

  it('play encaminha para a partida', () => {
    const { room, rec } = started();
    room.play('A', { kind: 'formation', turnId: room.session!.state.turnId, formation: 'SPREAD' });
    expect(rec.last('B', 'match:reveal')!.events[0]).toMatchObject({ t: 'FORMATION', formation: 'SPREAD' });
  });
});

describe('desconexão e reconexão', () => {
  it('com um desconectado, os timers seguem e o padrão é aplicado', () => {
    const { room, rec } = started();
    room.disconnect('A', 'conn-a');
    expect(room.status).toBe('IN_MATCH');
    expect(rec.last('B', 'room:state')!.players.find((p) => p.key === 'A')!.connected).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(rec.last('B', 'match:reveal')!.events[0]).toMatchObject({ t: 'FORMATION', formation: 'PISTOL' });
  });

  it('depois da tolerância, a etapa do desconectado expira assim que começa', () => {
    const { room, rec } = started({ reconnectGraceMs: 100 });
    room.disconnect('A', 'conn-a');
    vi.advanceTimersByTime(100);
    expect(rec.all('B', 'match:phase').some((p) => p.phase === 'FORMATION' && p.deadline === T0 + 100)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(rec.last('B', 'match:reveal')!.events[0]).toMatchObject({ t: 'FORMATION', formation: 'PISTOL' });
  });

  it('reconectar com o token devolve a vaga e a visão atual e cancela a tolerância', () => {
    const { room, rec, tokenA } = started({ reconnectGraceMs: 100 });
    room.disconnect('A', 'conn-a');
    vi.advanceTimersByTime(50);
    expect(room.claimSeat(tokenA)).toEqual({ key: 'A', token: tokenA });
    expect(room.connect('A', 'conn-a2')).toBeNull();
    const phase = rec.last('A', 'match:phase')!;
    expect(phase.view.you).toBe('A');
    expect(phase.phase).toBe('FORMATION');
    expect(phase.deadline).toBe(T0 + 5000);
    expect(rec.last('B', 'room:state')!.players.every((p) => p.connected)).toBe(true);
    vi.advanceTimersByTime(100);
    expect(room.session!.actions).toEqual([]); // A não ficou ausente: o deadline de 5 s continua valendo
  });

  it('troca de conexão: devolve a anterior e ignora o disconnect atrasado do socket antigo', () => {
    const { room, rec } = started();
    expect(room.connect('A', 'conn-a2')).toBe('conn-a');
    room.disconnect('A', 'conn-a');
    expect(room.connectionOf('A')).toBe('conn-a2');
    expect(rec.last('B', 'room:state')!.players.every((p) => p.connected)).toBe(true);
    room.disconnect('B', 'conn-b');
    expect(room.status).toBe('IN_MATCH'); // A continua conectado pelo socket novo: não pausa
  });

  it('os dois desconectados: PAUSED com timers parados; quem volta retoma com o tempo restante', () => {
    const { room, rec } = started();
    vi.advanceTimersByTime(2000);
    room.disconnect('A', 'conn-a');
    room.disconnect('B', 'conn-b');
    expect(room.status).toBe('PAUSED');
    vi.advanceTimersByTime(60_000);
    expect(room.session!.actions).toEqual([]);
    room.connect('A', 'conn-a2');
    expect(room.status).toBe('IN_MATCH');
    expect(rec.last('A', 'room:state')!.status).toBe('IN_MATCH');
    expect(rec.last('A', 'match:phase')!.deadline).toBe(T0 + 62_000 + 3000);
  });

  it('ao retomar, quem continua desconectado recebe o restante da tolerância', () => {
    const { room, rec } = started({ reconnectGraceMs: 100 });
    room.disconnect('A', 'conn-a');
    room.disconnect('B', 'conn-b');
    room.connect('A', 'conn-a2');
    room.play('A', { kind: 'formation', turnId: room.session!.state.turnId, formation: 'SPREAD' });
    expect(rec.last('A', 'match:phase')!.phase).toBe('PACKAGE');
    vi.advanceTimersByTime(100);
    vi.advanceTimersByTime(1);
    expect(rec.all('A', 'match:reveal').map((r) => r.events[0]?.t)).toEqual(['FORMATION', 'PACKAGE']);
  });

  it('resync reenvia room:state e a etapa atual', () => {
    const { room, rec } = started();
    rec.clear();
    room.resync('B');
    expect(rec.events('B')).toEqual(['room:state', 'match:phase']);
  });
});

describe('salas abandonadas', () => {
  it('lobby sem ninguém conectado fecha depois de 5 min', () => {
    const { room, closedCount } = makeRoom();
    room.claimSeat();
    room.connect('A', 'conn-a');
    room.disconnect('A', 'conn-a');
    vi.advanceTimersByTime(299_999);
    expect(closedCount()).toBe(0);
    vi.advanceTimersByTime(1);
    expect(closedCount()).toBe(1);
    expect(room.isClosed).toBe(true);
    expect(room.claimSeat('tok-1')).toBeNull();
  });

  it('quem volta ao lobby antes dos 5 min cancela o fechamento', () => {
    const { room, closedCount } = makeRoom();
    room.claimSeat();
    room.connect('A', 'conn-a');
    room.disconnect('A', 'conn-a');
    vi.advanceTimersByTime(100_000);
    room.connect('A', 'conn-a2');
    vi.advanceTimersByTime(300_000);
    expect(closedCount()).toBe(0);
  });

  it('partida pausada fecha depois de 5 min e não deixa timers para trás', () => {
    const { room, closedCount } = started();
    room.disconnect('A', 'conn-a');
    room.disconnect('B', 'conn-b');
    vi.advanceTimersByTime(300_000);
    expect(closedCount()).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('partida encerrada: FINISHED, match:end no resync e fechamento 5 min depois do fim', () => {
    const { room, rec, closedCount } = started({ resultAnimationMs: 0 });
    for (let i = 0; i < 10_000 && room.status === 'IN_MATCH'; i++) vi.advanceTimersToNextTimer();
    expect(room.status).toBe('FINISHED');
    expect(rec.last('A', 'room:state')!.status).toBe('FINISHED');
    expect(rec.last('B', 'match:end')).toBeDefined();
    rec.clear();
    room.resync('A');
    expect(rec.events('A')).toEqual(['room:state', 'match:end']);
    room.disconnect('A', 'conn-a');
    room.connect('A', 'conn-a2'); // reconectar não adia o fechamento
    expect(rec.last('A', 'match:end')).toBeDefined();
    vi.advanceTimersByTime(300_000);
    expect(closedCount()).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/server/test/room.test.ts`
Expected: FAIL — `Failed to resolve import "../src/room"`.

- [ ] **Step 3: Implementar**

`apps/server/src/room.ts`:
```ts
import { validateTeam, type Team, type TeamError, type TeamKey } from '@pfl/engine';
import { decodeTeam, type ErrorCode, type RoomState, type RoomStatus } from '@pfl/protocol';
import { MatchSession } from './match-session';
import type { Outgoing, Send } from './outgoing';
import type { PlayRequest } from './parse';
import type { Scheduler, Timings } from './timings';

const KEYS: readonly TeamKey[] = ['A', 'B'];
const TEAM_NAME_MAX = 40;
const SEED_RANGE = 0x7fffffff;

interface Seat {
  key: TeamKey;
  token: string;
  connId: string | null;
  /** tolerância de reconexão esgotada */
  absent: boolean;
  ready: boolean;
  /** só guarda time válido */
  team: Team | null;
  teamName: string | null;
  teamErrors: TeamError[];
  cancelGrace: (() => void) | null;
  graceEndsAt: number | null;
  /** tolerância restante, guardada enquanto a sala está pausada */
  graceRemaining: number | null;
}

export interface RoomDeps {
  scheduler: Scheduler;
  timings: Timings;
  /** seed da partida (o servidor pode usar Math.random; o motor, não) */
  random: () => number;
  newToken: () => string;
  /** só é chamado para vagas conectadas */
  send: Send;
  onClose: () => void;
}

/** Sala em memória (spec 7.1/8): duas vagas com token, lobby, partida e política de desconexão. */
export class Room {
  private readonly seats: Partial<Record<TeamKey, Seat>> = {};
  private roomStatus: RoomStatus = 'WAITING';
  private matchSession: MatchSession | null = null;
  private cancelClose: (() => void) | null = null;
  private closed = false;

  constructor(readonly code: string, private readonly deps: RoomDeps) {}

  get status(): RoomStatus {
    return this.roomStatus;
  }
  get session(): MatchSession | null {
    return this.matchSession;
  }
  get isClosed(): boolean {
    return this.closed;
  }
  connectionOf(key: TeamKey): string | null {
    return this.seats[key]?.connId ?? null;
  }
  tokenOf(key: TeamKey): string | null {
    return this.seats[key]?.token ?? null;
  }

  /** Token da própria sala → a mesma vaga. Sem token (ou com token alheio) → vaga livre no lobby, ou null (cheia). */
  claimSeat(token?: unknown): { key: TeamKey; token: string } | null {
    if (this.closed) return null;
    if (typeof token === 'string') {
      const seat = this.seatList().find((s) => s.token === token);
      if (seat) return { key: seat.key, token: seat.token };
    }
    if (this.roomStatus !== 'WAITING') return null;
    const key = KEYS.find((k) => !this.seats[k]);
    if (!key) return null;
    const seat: Seat = {
      key,
      token: this.deps.newToken(),
      connId: null,
      absent: false,
      ready: false,
      team: null,
      teamName: null,
      teamErrors: [],
      cancelGrace: null,
      graceEndsAt: null,
      graceRemaining: null,
    };
    this.seats[key] = seat;
    return { key, token: seat.token };
  }

  connect(key: TeamKey, connId: string): string | null {
    const seat = this.seats[key];
    if (this.closed || !seat) return null;
    const previous = seat.connId;
    seat.connId = connId;
    seat.absent = false;
    this.clearGrace(seat);
    if (this.roomStatus !== 'FINISHED') this.clearCloseTimer();
    const wasPaused = this.roomStatus === 'PAUSED';
    if (wasPaused) this.roomStatus = 'IN_MATCH';
    this.broadcastState();
    if (wasPaused) {
      this.resumeGraces();
      this.matchSession?.resume();
    } else if (this.matchSession) {
      this.matchSession.refreshAbsence();
      this.matchSession.sendCurrent(key);
    }
    this.tryStart();
    return previous !== null && previous !== connId ? previous : null;
  }

  disconnect(key: TeamKey, connId: string): void {
    const seat = this.seats[key];
    if (this.closed || !seat || seat.connId !== connId) return; // socket antigo depois de uma troca de conexão
    seat.connId = null;
    const nobody = this.seatList().every((s) => s.connId === null);
    if (this.roomStatus === 'IN_MATCH') {
      if (nobody) {
        this.roomStatus = 'PAUSED';
        this.pauseGraces();
        seat.graceRemaining = seat.absent ? null : this.deps.timings.reconnectGraceMs;
        this.matchSession?.pause();
        this.scheduleClose();
      } else {
        this.startGrace(seat, this.deps.timings.reconnectGraceMs);
      }
    } else if (this.roomStatus === 'WAITING' && nobody) {
      this.scheduleClose();
    }
    this.broadcastState();
  }

  submitTeam(key: TeamKey, teamCode: unknown): void {
    const seat = this.seats[key];
    if (this.closed || !seat) return;
    if (this.roomStatus !== 'WAITING') return this.error(key, 'NOT_READY', 'A partida já começou');
    seat.ready = false;
    const decoded = typeof teamCode === 'string' ? decodeTeam(teamCode) : null;
    if (decoded === null) {
      seat.team = null;
      seat.teamName = null;
      seat.teamErrors = [{ code: 'MALFORMED_TEAM' }];
      this.error(key, 'INVALID_TEAM_CODE', 'Código de time ilegível');
    } else {
      const errors = validateTeam(decoded);
      const name =
        typeof decoded === 'object' && typeof (decoded as Record<string, unknown>).name === 'string'
          ? ((decoded as Record<string, unknown>).name as string).slice(0, TEAM_NAME_MAX)
          : null;
      seat.team = errors.length === 0 ? (decoded as Team) : null;
      seat.teamName = name;
      seat.teamErrors = errors;
    }
    this.broadcastState();
  }

  setReady(key: TeamKey, ready: unknown): void {
    const seat = this.seats[key];
    if (this.closed || !seat) return;
    if (this.roomStatus !== 'WAITING') return this.error(key, 'NOT_READY', 'A partida já começou');
    const wants = ready === true;
    if (wants && !seat.team) return this.error(key, 'TEAM_INVALID', 'Envie um time válido antes de ficar pronto');
    seat.ready = wants;
    this.broadcastState();
    this.tryStart();
  }

  play(key: TeamKey, req: PlayRequest): void {
    if (this.closed || !this.seats[key]) return;
    if (!this.matchSession) return this.error(key, 'NOT_READY', 'A partida ainda não começou');
    this.matchSession.handle(key, req);
  }

  resync(key: TeamKey): void {
    if (this.closed || !this.seats[key]) return;
    this.sendState(key);
    this.matchSession?.sendCurrent(key);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.clearCloseTimer();
    for (const s of this.seatList()) this.clearGrace(s);
    this.matchSession?.dispose();
    this.deps.onClose();
  }

  private seatList(): Seat[] {
    return KEYS.flatMap((k) => {
      const s = this.seats[k];
      return s ? [s] : [];
    });
  }

  private sendTo(to: TeamKey, msg: Outgoing): void {
    const seat = this.seats[to];
    if (seat && seat.connId !== null) this.deps.send(to, msg);
  }

  private error(to: TeamKey, code: ErrorCode, message: string): void {
    this.sendTo(to, { event: 'error', payload: { code, message } });
  }

  private stateFor(you: TeamKey): RoomState {
    return {
      code: this.code,
      you,
      status: this.roomStatus,
      players: this.seatList().map((s) => ({
        key: s.key,
        connected: s.connId !== null,
        ready: s.ready,
        teamName: s.teamName,
        teamErrors: s.teamErrors,
      })),
    };
  }

  private sendState(key: TeamKey): void {
    this.sendTo(key, { event: 'room:state', payload: this.stateFor(key) });
  }

  private broadcastState(): void {
    for (const s of this.seatList()) this.sendState(s.key);
  }

  private tryStart(): void {
    if (this.closed || this.roomStatus !== 'WAITING') return;
    const a = this.seats.A;
    const b = this.seats.B;
    if (!a || !b || !a.ready || !b.ready || !a.team || !b.team || a.connId === null || b.connId === null) return;
    const seed = Math.floor(this.deps.random() * SEED_RANGE);
    this.matchSession = new MatchSession({ A: a.team, B: b.team }, seed, {
      scheduler: this.deps.scheduler,
      timings: this.deps.timings,
      send: (to, msg) => this.sendTo(to, msg),
      isAbsent: (k) => this.seats[k]?.absent ?? false,
      onEnd: () => this.onMatchEnd(),
    });
    this.roomStatus = 'IN_MATCH';
    this.broadcastState();
    this.matchSession.start();
  }

  private onMatchEnd(): void {
    this.roomStatus = 'FINISHED';
    for (const s of this.seatList()) this.clearGrace(s);
    this.broadcastState();
    this.scheduleClose();
  }

  private startGrace(seat: Seat, ms: number): void {
    this.clearGrace(seat);
    seat.graceEndsAt = this.deps.scheduler.now() + ms;
    seat.cancelGrace = this.deps.scheduler.schedule(ms, () => {
      seat.cancelGrace = null;
      seat.graceEndsAt = null;
      seat.absent = true;
      this.matchSession?.refreshAbsence();
    });
  }

  private clearGrace(seat: Seat): void {
    seat.cancelGrace?.();
    seat.cancelGrace = null;
    seat.graceEndsAt = null;
    seat.graceRemaining = null;
  }

  private pauseGraces(): void {
    const now = this.deps.scheduler.now();
    for (const s of this.seatList()) {
      if (s.cancelGrace && s.graceEndsAt !== null) {
        const remaining = Math.max(0, s.graceEndsAt - now);
        s.cancelGrace();
        s.cancelGrace = null;
        s.graceEndsAt = null;
        s.graceRemaining = remaining;
      }
    }
  }

  private resumeGraces(): void {
    for (const s of this.seatList()) {
      if (s.connId === null && s.graceRemaining !== null) {
        const ms = s.graceRemaining;
        this.startGrace(s, ms);
      }
    }
  }

  private scheduleClose(): void {
    this.clearCloseTimer();
    this.cancelClose = this.deps.scheduler.schedule(this.deps.timings.bothDisconnectedCloseMs, () => {
      this.cancelClose = null;
      this.close();
    });
  }

  private clearCloseTimer(): void {
    this.cancelClose?.();
    this.cancelClose = null;
  }
}
```

- [ ] **Step 4: Rodar os testes e o typecheck**

Run: `npx vitest run apps/server/test/room.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/room.ts apps/server/test/room.test.ts
git commit -m "feat(server): Room com vagas, tokens, lobby e política de desconexão"
```

---
### Task 7: `RoomManager`, camada Socket.io e `npm run dev:server`

**Files:**
- Create: `apps/server/src/rooms.ts`, `apps/server/src/server.ts`, `apps/server/src/main.ts`, `apps/server/src/index.ts`
- Modify: `package.json` (raiz): script `dev:server`
- Test: `apps/server/test/rooms.test.ts`, `apps/server/test/integration.test.ts`

**Interfaces:**
- Consumes: `Room`, `RoomDeps` (Task 6); `generateRoomCode`, `normalizeRoomCode`, `parsePlay`, `PlayEvent`, `Outgoing`, `Scheduler`, `realScheduler`, `TimingsInput`, `resolveTimings`, `Timings` (Task 4); `ClientToServerEvents`, `ServerToClientEvents`, `ErrorCode`, `Ack`, `encodeTeam`, `computeStats`, `EndMessage` (Tasks 2 e 3); `replay` (motor).
- Produces:
  ```ts
  interface RoomManagerDeps {
    scheduler: Scheduler; timings: Timings; random: () => number; newToken: () => string;
    send: (code: string, to: TeamKey, msg: Outgoing) => void;
    onRoomClosed?: (code: string) => void;
  }
  type JoinResult =
    | { ok: true; room: Room; key: TeamKey; token: string }
    | { ok: false; code: 'ROOM_NOT_FOUND' | 'ROOM_FULL' };
  class RoomManager {
    constructor(deps: RoomManagerDeps);
    create(): { room: Room; key: TeamKey; token: string };
    join(rawCode: unknown, token?: unknown): JoinResult;
    get(code: string): Room | undefined;
    get size(): number;
    closeAll(): void;
  }
  interface PflServerOptions {
    port?: number;               // padrão 0 (porta livre); main.ts usa 3001
    host?: string;
    timings?: TimingsInput;      // timers curtos nos testes
    scheduler?: Scheduler;       // relógio/timers injetáveis
    random?: () => number;       // códigos de sala e seed
    newToken?: () => string;
    corsOrigin?: string | string[] | boolean;  // padrão true (reflete a origem: Vite em 5173)
  }
  interface PflServer { port: number; io: PflIo; rooms: RoomManager; close(): Promise<void> }
  function createPflServer(options?: PflServerOptions): Promise<PflServer>;
  ```
  Em vez de um `now?` solto, `createPflServer` recebe `scheduler?: Scheduler`. Assim o relógio e os timers vêm da mesma fonte; um `now` injetado com `setTimeout` real ficaria dessincronizado.

- [ ] **Step 1: Escrever os testes (devem falhar)**

`apps/server/test/rooms.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { RoomManager } from '../src/rooms';
import { realScheduler, resolveTimings } from '../src/timings';

const manager = () => {
  let n = 0;
  return new RoomManager({
    scheduler: realScheduler,
    timings: resolveTimings(),
    random: Math.random,
    newToken: () => `tok-${++n}`,
    send: () => {},
  });
};

describe('RoomManager', () => {
  it('cria salas com código de 6 letras sem I/O; o criador fica com a vaga A', () => {
    const m = manager();
    const { room, key, token } = m.create();
    expect(room.code).toMatch(/^[A-HJ-NP-Z]{6}$/);
    expect(key).toBe('A');
    expect(token).toBe('tok-1');
    expect(m.get(room.code)).toBe(room);
    expect(m.size).toBe(1);
    m.closeAll();
  });

  it('entra pelo código sem diferenciar maiúsculas; a segunda vaga é B', () => {
    const m = manager();
    const { room } = m.create();
    const joined = m.join(` ${room.code.toLowerCase()} `);
    expect(joined).toMatchObject({ ok: true, key: 'B' });
    m.closeAll();
  });

  it('ROOM_NOT_FOUND para código inexistente ou malformado; ROOM_FULL para o terceiro', () => {
    const m = manager();
    const { room } = m.create();
    m.join(room.code);
    const missing = room.code === 'ZZZZZZ' ? 'YYYYYY' : 'ZZZZZZ';
    expect(m.join(missing)).toEqual({ ok: false, code: 'ROOM_NOT_FOUND' });
    expect(m.join(123)).toEqual({ ok: false, code: 'ROOM_NOT_FOUND' });
    expect(m.join(room.code)).toEqual({ ok: false, code: 'ROOM_FULL' });
    m.closeAll();
  });

  it('token de outra sala não dá vaga numa sala cheia', () => {
    const m = manager();
    const first = m.create();
    m.join(first.room.code);
    const other = m.create();
    expect(m.join(first.room.code, other.token)).toEqual({ ok: false, code: 'ROOM_FULL' });
    m.closeAll();
  });

  it('a sala fechada sai do mapa e o código deixa de existir', () => {
    const closed: string[] = [];
    let n = 0;
    const m = new RoomManager({
      scheduler: realScheduler,
      timings: resolveTimings(),
      random: Math.random,
      newToken: () => `tok-${++n}`,
      send: () => {},
      onRoomClosed: (code) => closed.push(code),
    });
    const { room } = m.create();
    room.close();
    expect(m.get(room.code)).toBeUndefined();
    expect(m.join(room.code)).toEqual({ ok: false, code: 'ROOM_NOT_FOUND' });
    expect(closed).toEqual([room.code]);
  });
});
```

`apps/server/test/integration.test.ts`:
```ts
import { afterEach, describe, expect, it } from 'vitest';
import { io as connectClient, type Socket } from 'socket.io-client';
import { replay } from '@pfl/engine';
import {
  computeStats, encodeTeam,
  type ClientToServerEvents, type EndMessage, type PhaseMessage, type RoomState, type ServerToClientEvents,
} from '@pfl/protocol';
import { createPflServer, type PflServer } from '../src/server';
import type { TimingsInput } from '../src/timings';
import { electricTeam } from './fixtures';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
interface Received {
  event: string;
  payload: any;
}

let server: PflServer | null = null;
const clients: ClientSocket[] = [];

afterEach(async () => {
  for (const c of clients.splice(0)) c.disconnect();
  await server?.close();
  server = null;
});

function client(): ClientSocket {
  const socket: ClientSocket = connectClient(`http://localhost:${server!.port}`, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
  clients.push(socket);
  return socket;
}

function record(socket: ClientSocket): Received[] {
  const log: Received[] = [];
  socket.onAny((event: string, payload: unknown) => {
    log.push({ event, payload });
  });
  return log;
}

async function waitFor<T>(fn: () => T | undefined, timeoutMs = 5000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = fn();
    if (value !== undefined) return value;
    if (Date.now() - started > timeoutMs) throw new Error('waitFor: tempo esgotado');
    await new Promise((r) => setTimeout(r, 5));
  }
}

const lastOf = (log: Received[], event: string): Received | undefined => [...log].reverse().find((m) => m.event === event);

/**
 * Bot que joga sozinho. Trata match:phase como estado idempotente por (turnId, phase):
 * age no máximo uma vez por etapa, mesmo que o servidor reenvie a mesma etapa.
 */
function autoPlay(socket: ClientSocket, opts: { skipFirstPackage?: boolean } = {}): void {
  const done = new Set<string>();
  let skippedPackage = false;
  socket.on('match:phase', (m: PhaseMessage) => {
    const key = `${m.turnId}:${m.phase}`;
    if (done.has(key)) return;
    const v = m.view;
    if (m.phase === 'FORMATION' && v.side === 'offense') {
      done.add(key);
      socket.emit('play:formation', { turnId: m.turnId, formation: 'PISTOL' });
    } else if (m.phase === 'PACKAGE' && v.side === 'defense') {
      done.add(key);
      if (opts.skipFirstPackage && !skippedPackage) {
        skippedPackage = true; // deixa o servidor aplicar o padrão (Base)
        return;
      }
      socket.emit('play:package', { turnId: m.turnId, package: 'BASE' });
    } else if (m.phase === 'PLAYCALL' && v.yourCard === null && v.playable.length > 0) {
      done.add(key);
      socket.emit('play:card', { turnId: m.turnId, cardId: v.playable[m.turnId % v.playable.length] });
    } else if (m.phase === 'CONVERSION' && v.side === 'offense') {
      done.add(key);
      socket.emit('play:conversion', { turnId: m.turnId, choice: 'PAT' });
    }
  });
}

interface Lobby {
  a: ClientSocket;
  b: ClientSocket;
  logA: Received[];
  logB: Received[];
  code: string;
  tokenA: string;
  tokenB: string;
}

/** Sobe o servidor, cria a sala com A, entra com B, envia os times e marca pronto. Volta com a partida começada. */
async function lobby(timings: TimingsInput, setup: (a: ClientSocket, b: ClientSocket) => void = () => {}): Promise<Lobby> {
  server = await createPflServer({ port: 0, timings });
  const a = client();
  const b = client();
  const logA = record(a);
  const logB = record(b);
  setup(a, b);
  const created = await a.emitWithAck('room:create');
  if (!created.ok) throw new Error(created.error.message);
  const joined = await b.emitWithAck('room:join', { code: created.data.code });
  if (!joined.ok) throw new Error(joined.error.message);
  a.emit('team:submit', { teamCode: encodeTeam(electricTeam('Raio')) });
  b.emit('team:submit', { teamCode: encodeTeam(electricTeam('Trovão')) });
  a.emit('room:ready', { ready: true });
  b.emit('room:ready', { ready: true });
  await waitFor(() => logA.find((m) => m.event === 'match:phase'));
  await waitFor(() => logB.find((m) => m.event === 'match:phase'));
  return { a, b, logA, logB, code: created.data.code, tokenA: created.data.token, tokenB: joined.data.token };
}

describe('servidor Socket.io (integração)', () => {
  it('cria a sala com código de 6 letras e devolve vaga e token', async () => {
    server = await createPflServer({ port: 0 });
    const a = client();
    const res = await a.emitWithAck('room:create');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.code).toMatch(/^[A-HJ-NP-Z]{6}$/);
    expect(res.data.you).toBe('A');
    expect(res.data.token.length).toBeGreaterThan(10);
  });

  it('partida completa com 2 clientes, incluindo timeout aplicado pelo servidor e reconexão com token', async () => {
    // B deixa o primeiro pacote expirar (500 ms); os bots respondem em milissegundos no resto da partida
    const { a, logA, logB, code, tokenA } = await lobby({ resultAnimationMs: 0, phaseMs: { PACKAGE: 500 } }, (a, b) => {
      autoPlay(a);
      autoPlay(b, { skipFirstPackage: true });
    });
    await waitFor(() => logA.find((m) => m.event === 'match:result'));
    // ordem do contrato no primeiro snap (o pacote saiu por timeout)
    const firstSnap = logA.filter((m) => m.event.startsWith('match:')).slice(0, 5);
    expect(firstSnap.map((m) => m.event)).toEqual(['match:phase', 'match:reveal', 'match:phase', 'match:reveal', 'match:phase']);
    expect(firstSnap.map((m) => m.payload.phase).filter(Boolean)).toEqual(['FORMATION', 'PACKAGE', 'PLAYCALL']);
    expect(firstSnap[3].payload.events[0]).toMatchObject({ t: 'PACKAGE', package: 'BASE' });

    // A cai no meio da partida e volta com o token num socket novo
    a.disconnect();
    const a2 = client();
    const logA2 = record(a2);
    autoPlay(a2);
    const res = await a2.emitWithAck('room:join', { code, token: tokenA });
    expect(res).toEqual({ ok: true, data: { code, you: 'A', token: tokenA } });

    const endA = await waitFor(() => logA2.find((m) => m.event === 'match:end'), 25_000);
    const endB = await waitFor(() => logB.find((m) => m.event === 'match:end'), 25_000);
    const end = endA.payload as EndMessage;
    expect(endB.payload).toEqual(end);
    expect(end.score.A).not.toBe(end.score.B);
    expect(end.replay.actions[1]).toEqual({ type: 'TIMEOUT' }); // FORMATION de A, depois o pacote expirado de B
    const replayed = replay(end.replay.teams.A, end.replay.teams.B, end.replay.seed, end.replay.actions);
    expect(replayed.state.phase).toBe('MATCH_END');
    expect(replayed.state.score).toEqual(end.score);
    expect(end.stats).toEqual(computeStats(replayed.events));
    expect(logA2.filter((m) => m.event === 'error')).toEqual([]);
    expect(logB.filter((m) => m.event === 'error')).toEqual([]);
    // match:end substitui o último match:phase
    const lastMatchEvents = logA2.filter((m) => m.event.startsWith('match:')).slice(-2).map((m) => m.event);
    expect(lastMatchEvents).toEqual(['match:result', 'match:end']);
    // a visão enviada nunca carrega o estado interno do motor
    for (const m of [...logA, ...logA2, ...logB].filter((x) => x.event === 'match:phase')) {
      expect(m.payload.view).not.toHaveProperty('teams');
      expect(m.payload.view).not.toHaveProperty('rng');
    }
  }, 30_000);

  it('o servidor aplica o padrão quando o timer da etapa expira (pacote → Base)', async () => {
    const { logB } = await lobby(
      { resultAnimationMs: 0, phaseMs: { FORMATION: 5000, PACKAGE: 150, PLAYCALL: 5000, CONVERSION: 5000 } },
      (a) => {
        a.on('match:phase', (m: PhaseMessage) => {
          if (m.phase === 'FORMATION' && m.view.side === 'offense') a.emit('play:formation', { turnId: m.turnId, formation: 'SPREAD' });
        });
      },
    );
    const reveal = await waitFor(() =>
      logB.find((m) => m.event === 'match:reveal' && m.payload.events[0]?.t === 'PACKAGE'),
    );
    expect(reveal.payload.events[0]).toMatchObject({ t: 'PACKAGE', team: 'B', package: 'BASE' });
    expect(logB.find((m) => m.event === 'match:reveal')!.payload.events[0]).toMatchObject({ formation: 'SPREAD' });
  });

  it('reconexão com token: mesma vaga, visão atual e partida continua', async () => {
    const { a, logB, code, tokenA } = await lobby({ resultAnimationMs: 0, phaseMs: { FORMATION: 10_000 } });
    a.disconnect();
    await waitFor(() => {
      const state = lastOf(logB, 'room:state')?.payload as RoomState | undefined;
      return state?.players.some((p) => p.key === 'A' && !p.connected) ? state : undefined;
    });
    const a2 = client();
    const logA2 = record(a2);
    const res = await a2.emitWithAck('room:join', { code: code.toLowerCase(), token: tokenA });
    expect(res).toEqual({ ok: true, data: { code, you: 'A', token: tokenA } });
    const phase = await waitFor(() => logA2.find((m) => m.event === 'match:phase'));
    expect(phase.payload.view.you).toBe('A');
    expect(phase.payload.phase).toBe('FORMATION');
    await waitFor(() => {
      const state = lastOf(logB, 'room:state')?.payload as RoomState | undefined;
      return state?.players.every((p) => p.connected) ? state : undefined;
    });
    a2.emit('play:formation', { turnId: phase.payload.turnId, formation: 'HEAVY' });
    const reveal = await waitFor(() => logB.find((m) => m.event === 'match:reveal'));
    expect(reveal.payload.events[0]).toMatchObject({ t: 'FORMATION', formation: 'HEAVY' });
  });

  it('segunda conexão com o mesmo token derruba a primeira', async () => {
    const { a, code, tokenA, logB } = await lobby({ phaseMs: { FORMATION: 10_000 } });
    let kicked = false;
    a.on('disconnect', () => {
      kicked = true;
    });
    const a2 = client();
    const res = await a2.emitWithAck('room:join', { code, token: tokenA });
    expect(res.ok).toBe(true);
    await waitFor(() => (kicked ? true : undefined));
    await new Promise((r) => setTimeout(r, 50));
    const state = lastOf(logB, 'room:state')!.payload as RoomState;
    expect(state.status).toBe('IN_MATCH');
    expect(state.players.every((p) => p.connected)).toBe(true);
  });

  it('terceiro cliente, código inexistente e token de outra sala', async () => {
    const { code } = await lobby({});
    const c = client();
    expect(await c.emitWithAck('room:join', { code })).toEqual({ ok: false, error: { code: 'ROOM_FULL', message: 'Sala cheia' } });
    expect(await c.emitWithAck('room:join', { code: '!!' })).toMatchObject({ ok: false, error: { code: 'ROOM_NOT_FOUND' } });
    const other = await c.emitWithAck('room:create');
    if (!other.ok) throw new Error(other.error.message);
    const d = client();
    expect(await d.emitWithAck('room:join', { code, token: other.data.token })).toMatchObject({
      ok: false,
      error: { code: 'ROOM_FULL' },
    });
  });

  it('payloads maliciosos e eventos fora de hora geram error sem derrubar o servidor', async () => {
    const { a, logA } = await lobby({ phaseMs: { FORMATION: 10_000 } });
    const lone = client();
    const logLone = record(lone);
    lone.emit('play:card', { turnId: 1, cardId: 'basic_run' });
    await waitFor(() => logLone.find((m) => m.event === 'error' && m.payload.code === 'NOT_IN_ROOM'));

    const phase = logA.find((m) => m.event === 'match:phase')!.payload as PhaseMessage;
    a.emit('play:formation', { turnId: phase.turnId, formation: 'constructor' } as never);
    a.emit('play:formation', { turnId: 'x' } as never);
    a.emit('play:package', { turnId: phase.turnId, package: 'BASE' }); // A está no ataque: fora de vez
    a.emit('play:formation', { turnId: phase.turnId + 5, formation: 'PISTOL' });
    await waitFor(() => (logA.filter((m) => m.event === 'error').length >= 4 ? true : undefined));
    expect(logA.filter((m) => m.event === 'error').map((m) => m.payload.code)).toEqual([
      'ENGINE_ERROR',
      'ENGINE_ERROR',
      'ENGINE_ERROR',
      'STALE_TURN',
    ]);

    a.emit('play:formation', { turnId: phase.turnId, formation: 'DOUBLE' });
    const reveal = await waitFor(() => logA.find((m) => m.event === 'match:reveal'));
    expect(reveal.payload.events[0]).toMatchObject({ formation: 'DOUBLE' });
  });

  it('match:resync reenvia room:state e a etapa atual', async () => {
    const { a, logA } = await lobby({ phaseMs: { FORMATION: 10_000 } });
    const before = logA.length;
    a.emit('match:resync');
    await waitFor(() => (logA.slice(before).some((m) => m.event === 'match:phase') ? true : undefined));
    expect(logA.slice(before).map((m) => m.event)).toEqual(['room:state', 'match:phase']);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/server/test/rooms.test.ts apps/server/test/integration.test.ts`
Expected: FAIL — `Failed to resolve import "../src/rooms"` e `"../src/server"`.

- [ ] **Step 3: Implementar o `RoomManager`**

`apps/server/src/rooms.ts`:
```ts
import type { TeamKey } from '@pfl/engine';
import { generateRoomCode, normalizeRoomCode } from './codes';
import type { Outgoing } from './outgoing';
import { Room } from './room';
import type { Scheduler, Timings } from './timings';

export interface RoomManagerDeps {
  scheduler: Scheduler;
  timings: Timings;
  random: () => number;
  newToken: () => string;
  send: (code: string, to: TeamKey, msg: Outgoing) => void;
  onRoomClosed?: (code: string) => void;
}

export type JoinResult =
  | { ok: true; room: Room; key: TeamKey; token: string }
  | { ok: false; code: 'ROOM_NOT_FOUND' | 'ROOM_FULL' };

/** Salas em memória por código (spec 8: perdidas se o servidor reiniciar). */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  constructor(private readonly deps: RoomManagerDeps) {}

  create(): { room: Room; key: TeamKey; token: string } {
    const code = generateRoomCode(this.deps.random, (c) => this.rooms.has(c));
    const room = new Room(code, {
      scheduler: this.deps.scheduler,
      timings: this.deps.timings,
      random: this.deps.random,
      newToken: this.deps.newToken,
      send: (to, msg) => this.deps.send(code, to, msg),
      onClose: () => {
        this.rooms.delete(code);
        this.deps.onRoomClosed?.(code);
      },
    });
    this.rooms.set(code, room);
    const seat = room.claimSeat();
    if (!seat) throw new Error('Sala nova sem vaga livre');
    return { room, ...seat };
  }

  join(rawCode: unknown, token?: unknown): JoinResult {
    const code = normalizeRoomCode(rawCode);
    const room = code ? this.rooms.get(code) : undefined;
    if (!room) return { ok: false, code: 'ROOM_NOT_FOUND' };
    const seat = room.claimSeat(token);
    return seat ? { ok: true, room, ...seat } : { ok: false, code: 'ROOM_FULL' };
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  get size(): number {
    return this.rooms.size;
  }

  closeAll(): void {
    for (const room of [...this.rooms.values()]) room.close();
  }
}
```

- [ ] **Step 4: Implementar a camada Socket.io, o ponto de entrada e o índice**

`apps/server/src/server.ts`:
```ts
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server, type Socket } from 'socket.io';
import type { TeamKey } from '@pfl/engine';
import type { Ack, ClientToServerEvents, ErrorCode, ServerToClientEvents } from '@pfl/protocol';
import { normalizeRoomCode } from './codes';
import type { Outgoing } from './outgoing';
import { parsePlay, type PlayEvent } from './parse';
import type { Room } from './room';
import { RoomManager } from './rooms';
import { realScheduler, resolveTimings, type Scheduler, type TimingsInput } from './timings';

interface SocketData {
  code: string | null;
  key: TeamKey | null;
}
export type PflIo = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type PflSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type SeatAck = Ack<{ code: string; you: TeamKey; token: string }>;

export interface PflServerOptions {
  /** padrão 0 (porta livre); main.ts usa 3001 */
  port?: number;
  host?: string;
  /** timers curtos nos testes */
  timings?: TimingsInput;
  /** relógio e timers injetáveis */
  scheduler?: Scheduler;
  /** códigos de sala e seed da partida */
  random?: () => number;
  newToken?: () => string;
  /** padrão true: reflete a origem (o cliente Vite roda em outra porta) */
  corsOrigin?: string | string[] | boolean;
}

export interface PflServer {
  port: number;
  io: PflIo;
  rooms: RoomManager;
  close(): Promise<void>;
}

function deliver(socket: PflSocket, msg: Outgoing): void {
  (socket.emit as unknown as (event: string, payload: unknown) => boolean).call(socket, msg.event, msg.payload);
}

const field = (payload: unknown, name: string): unknown =>
  typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>)[name] : undefined;

export async function createPflServer(options: PflServerOptions = {}): Promise<PflServer> {
  const httpServer = createServer();
  const io: PflIo = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
    cors: { origin: options.corsOrigin ?? true },
  });

  const rooms: RoomManager = new RoomManager({
    scheduler: options.scheduler ?? realScheduler,
    timings: resolveTimings(options.timings),
    random: options.random ?? Math.random,
    newToken: options.newToken ?? randomUUID,
    send: (code, to, msg) => {
      const connId = rooms.get(code)?.connectionOf(to);
      const socket = connId ? io.sockets.sockets.get(connId) : undefined;
      if (socket) deliver(socket, msg);
    },
    onRoomClosed: (code) => {
      for (const socket of io.sockets.sockets.values()) {
        if (socket.data.code === code) {
          socket.data.code = null;
          socket.data.key = null;
        }
      }
    },
  });

  io.on('connection', (socket: PflSocket) => {
    socket.data.code = null;
    socket.data.key = null;

    const fail = (code: ErrorCode, message: string): void => {
      socket.emit('error', { code, message });
    };
    /** Nenhum handler pode derrubar o processo. */
    const guard =
      <A extends unknown[]>(fn: (...args: A) => void) =>
      (...args: A): void => {
        try {
          fn(...args);
        } catch (err) {
          console.error('[pfl] erro no handler', err);
          fail('ENGINE_ERROR', 'Erro interno');
        }
      };
    const current = (): { room: Room; key: TeamKey } | null => {
      const room = socket.data.code ? rooms.get(socket.data.code) : undefined;
      return room && socket.data.key ? { room, key: socket.data.key } : null;
    };
    const bound = (): { room: Room; key: TeamKey } | null => {
      const b = current();
      if (!b) fail('NOT_IN_ROOM', 'Entre numa sala primeiro');
      return b;
    };
    const leave = (): void => {
      const b = current();
      if (b) b.room.disconnect(b.key, socket.id);
      socket.data.code = null;
      socket.data.key = null;
    };
    const bind = (room: Room, key: TeamKey): void => {
      socket.data.code = room.code;
      socket.data.key = key;
      const previous = room.connect(key, socket.id);
      if (previous && previous !== socket.id) io.sockets.sockets.get(previous)?.disconnect(true);
    };
    const play = (event: PlayEvent, payload: unknown): void => {
      const b = bound();
      if (!b) return;
      const req = parsePlay(event, payload);
      if (!req) return fail('ENGINE_ERROR', `Payload inválido em ${event}`);
      b.room.play(b.key, req);
    };

    socket.on(
      'room:create',
      guard((ack: unknown) => {
        if (typeof ack !== 'function') return;
        leave();
        const { room, key, token } = rooms.create();
        (ack as SeatAck)({ ok: true, data: { code: room.code, you: key, token } });
        bind(room, key);
      }),
    );

    socket.on(
      'room:join',
      guard((payload: unknown, ack: unknown) => {
        if (typeof ack !== 'function') return;
        const reply = ack as SeatAck;
        const here = current();
        if (here && normalizeRoomCode(field(payload, 'code')) === here.room.code) {
          // já está nesta sala: devolve a própria vaga em vez de ocupar a outra
          reply({ ok: true, data: { code: here.room.code, you: here.key, token: here.room.tokenOf(here.key) ?? '' } });
          here.room.resync(here.key);
          return;
        }
        const result = rooms.join(field(payload, 'code'), field(payload, 'token'));
        if (!result.ok) {
          const message = result.code === 'ROOM_FULL' ? 'Sala cheia' : 'Sala não encontrada';
          reply({ ok: false, error: { code: result.code, message } });
          return;
        }
        leave();
        reply({ ok: true, data: { code: result.room.code, you: result.key, token: result.token } });
        bind(result.room, result.key);
      }),
    );

    socket.on(
      'team:submit',
      guard((payload: unknown) => {
        const b = bound();
        if (b) b.room.submitTeam(b.key, field(payload, 'teamCode'));
      }),
    );
    socket.on(
      'room:ready',
      guard((payload: unknown) => {
        const b = bound();
        if (b) b.room.setReady(b.key, field(payload, 'ready'));
      }),
    );
    socket.on('play:formation', guard((payload: unknown) => play('play:formation', payload)));
    socket.on('play:package', guard((payload: unknown) => play('play:package', payload)));
    socket.on('play:card', guard((payload: unknown) => play('play:card', payload)));
    socket.on('play:conversion', guard((payload: unknown) => play('play:conversion', payload)));
    socket.on('team:depth', guard((payload: unknown) => play('team:depth', payload)));
    socket.on(
      'match:resync',
      guard(() => {
        const b = bound();
        if (b) b.room.resync(b.key);
      }),
    );
    socket.on('disconnect', () => {
      try {
        leave();
      } catch (err) {
        console.error('[pfl] erro ao desconectar', err);
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    if (options.host) httpServer.listen(options.port ?? 0, options.host, () => resolve());
    else httpServer.listen(options.port ?? 0, () => resolve());
  });
  const port = (httpServer.address() as AddressInfo).port;

  return {
    port,
    io,
    rooms,
    close: async () => {
      rooms.closeAll();
      await new Promise<void>((resolve) => {
        io.close(() => resolve());
      });
    },
  };
}
```

`apps/server/src/main.ts`:
```ts
import { createPflServer } from './server';

const port = Number(process.env.PORT ?? 3001);
const server = await createPflServer({ port });
console.log(`PFL server em http://localhost:${server.port}`);

const shutdown = (): void => {
  void server.close().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

`apps/server/src/index.ts`:
```ts
export * from './server';
export * from './rooms';
export * from './room';
export * from './match-session';
export * from './timings';
export * from './parse';
export * from './outgoing';
export * from './codes';
```

No `package.json` da raiz, adicionar a chave abaixo dentro de `"scripts"`, sem remover as que já existem (`test`, `typecheck`, `data:build`, e `sim`/`dev:client` se os Planos 2/4 já tiverem rodado):
```json
    "dev:server": "npm run dev -w @pfl/server"
```

- [ ] **Step 5: Rodar os testes novos**

Run: `npx vitest run apps/server/test/rooms.test.ts apps/server/test/integration.test.ts`
Expected: PASS. A partida completa leva poucos segundos: as ações saem assim que chega cada `match:phase`, `resultAnimationMs` é 0, e só o primeiro pacote espera 500 ms. Depois da queda de A, no máximo uma etapa de A espera o timer, até `a2` reconectar.
- Se o teste de partida completa estourar 30 s, procure um bot que deixou de agir: algum `match:phase` esperado não chegou, e o servidor caiu no timeout padrão de cada etapa.
- Se aparecer `TypeError: socket.emitWithAck is not a function`, o `socket.io-client` instalado é anterior à 4.6. Rode `npm install -D socket.io-client@^4.7 -w @pfl/server`.

- [ ] **Step 6: Suíte inteira e typecheck**

Run: `npm test && npm run typecheck`
Expected: todos PASS (motor, protocolo e servidor). O golden do motor continua inalterado.

- [ ] **Step 7: Smoke test do `dev:server` na porta 3001**

Run:
```bash
(npm run dev:server > /tmp/pfl-dev-server.log 2>&1 &) ; sleep 4 ; curl -s "http://localhost:3001/socket.io/?EIO=4&transport=polling" ; echo ; pkill -f "tsx watch src/main.ts"
```
Expected:
- o `curl` imprime uma linha começando com `0{"sid":`;
- `/tmp/pfl-dev-server.log` contém `PFL server em http://localhost:3001`.

Se o log mostrar erro ao importar `pokemon.json` (por exemplo, `needs an import attribute of "type: json"`), o tsx não transformou o JSON do motor. Anote o erro e reporte. Não altere o motor neste plano.

- [ ] **Step 8: Commit**

```bash
git add apps/server package.json package-lock.json
git commit -m "feat(server): Socket.io com salas por código, reconexão e dev:server na porta 3001"
```

---
## Self-Review (feito na escrita do plano)

- **Cobertura da spec e do contrato:**

  | Requisito | Task |
  |---|---|
  | Spec 2.4: timers por etapa (5/4/8 s) e folga de animação | 4 (`DEFAULT_TIMINGS`), 5 (deadlines) |
  | Spec 2.5: padrões de timeout aplicados pelo servidor | 5 (TIMEOUT no deadline e na corrida com a ação), 7 (integração) |
  | Spec 5.4: ajuste manual do depth chart com revalidação | 1 (`SET_DEPTH`), 5 (`team:depth`), 4 (`parsePlay`) |
  | Spec 5.5: código de time base64url; servidor revalida | 2 (`encodeTeam`/`decodeTeam`), 6 (`submitTeam` + `validateTeam`) |
  | Spec 6.1 (Início/Lobby): sala com código de 6 letras, entrar por código, pronto | 4 (`generateRoomCode`), 6 (lobby), 7 (`room:create`/`room:join`) |
  | Spec 7.1: servidor autoritativo, visão por jogador, replay por seed + ações | 5 (`playerView`, log de ações, `ReplayData`), 7 (replay reproduz o placar) |
  | Spec 7.2: protocolo Socket.io com `turnId` | 2 (eventos tipados), 5 (`STALE_TURN`), 7 |
  | Spec 8: ação inválida, desconexão (60 s), os dois fora (pausa, 5 min), sala inexistente/cheia, time inválido | 5, 6, 7 |
  | Spec 9: integração com 2 clientes, partida completa, timeout e reconexão | 7 |
  | Contrato 2: `SET_DEPTH`, `snapInDrive`, `canEditDepth`, `INVALID_DEPTH`/`DEPTH_LOCKED` | 1 |
  | Contrato 3: `@pfl/protocol` (constantes, tipos, eventos, codec, `computeStats`) | 2, 3 |
  | Contrato 4: `npm run dev:server` na 3001; include do Vitest com `apps/**` | 7 (script e smoke test), 2 (vitest.config) |

- **Placeholders:** nenhum. Todo passo de código traz o arquivo completo ou a edição exata, com o trecho antigo e o novo.
- **Consistência de tipos:**
  - `PlayRequest`/`toAction`/`parsePlay` (Task 4) são usados com os mesmos nomes nas Tasks 5–7.
  - `Send`/`Outgoing` (Task 4) são usados por `MatchSession` e `Room`.
  - `Timings`/`TimingsInput`/`resolveTimings`/`Scheduler`/`realScheduler` (Task 4) são usados nas Tasks 5–7.
  - `MatchSession` (Task 5) expõe `state`, `actions`, `events`, `seed`, `finished`, `paused`, `deadline`, que são os mesmos usados pela `Room` e pelos testes.
  - `Room.tokenOf`/`connectionOf` (Task 6) são usados pelo `server.ts` (Task 7).
  - Do Plano 1, os nomes são usados sem mudança: `createMatch`, `step`, `playerView`, `replay`, `validateTeam`, `EngineError`, `MatchState`, `StepResult`, `Action`, `GameEvent`, `Team`, `TeamKey`, `Phase`, `FORMATIONS`, `PACKAGES`, `Lineup`, `PlayOutcome`.
  - Os nomes do protocolo seguem o contrato à risca. A única adição é `ROOM_CODE_ALPHABET`.
- **Review Focus:** cada um dos 5 itens tem teste na task dona (listados na seção Review Focus).
- **Pendência de contrato (não resolvida aqui, só fixada por teste):** pelo contrato, `SET_DEPTH` só é aceito na FORMATION do primeiro snap. A janela da defesa fecha assim que o ataque envia a formação, então um ataque rápido tira da defesa o direito de editar no início do drive (spec 5.4). O comportamento atual está fixado no teste "DEPTH_LOCKED depois da formação, inclusive para a defesa" (Task 1). Mudar isso exige alterar o contrato, por exemplo abrindo uma janela de edição para a defesa até a fase PACKAGE.
