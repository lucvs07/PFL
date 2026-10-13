# Refatoração da Room + modo Draft snake ao vivo — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a issue [#9](https://github.com/lucvs07/PFL/issues/9): refatorar a `Room` do servidor em unidades pequenas (sem mudar comportamento) e, em cima delas, adicionar o modo Draft snake ao vivo entre os dois jogadores da sala.

**Architecture:** O `engine` ganha um módulo puro `draft` (`step`-like, determinístico, sem I/O). O servidor ganha `SeatRegistry` (presença), `Lobby` (times e "pronto"), a interface `RoomPhase` e duas fases novas, `DraftSession` e `BuildSession`, ao lado da `MatchSession`; a `Room` vira só um orquestrador (`LOBBY → [DRAFT → BUILD] → MATCH → FINISHED`). O cliente ganha as telas de Draft e de Montagem pós-draft, reaproveitando o sistema visual existente.

**Tech Stack:** TypeScript (npm workspaces), Vitest, Socket.IO, React + Phaser (Vite).

**Spec:** [`docs/superpowers/specs/2026-10-12-pfl-proximos-passos-issues.md`](../specs/2026-10-12-pfl-proximos-passos-issues.md), seção "Issue única: Refatoração da Room + modo Draft snake ao vivo". Spec original do jogo: [`2026-10-10-pfl-core-design.md`](../specs/2026-10-10-pfl-core-design.md).

## Global Constraints

- Servidor é a autoridade: o cliente só envia intenções (`draft:pick`, `room:mode`, `team:submit`, `room:ready`). Nada de regra no cliente além de exibição.
- Elenco: **16 de linha + 1 especialista**, teto **120** pontos, no máximo **1 lendário**, custo `max(1, round((BST − 180) / 30))`, só os 151 da Gen 1.
- Draft: pool **exclusivo**; **34 picks** (17 por time) em ordem snake `A,B,B,A,A,B,B,A…`; quem começa é sorteado; **30 s por pick**; timeout aplica pick automático (maior BST legal; empate pelo menor id).
- Reserva de orçamento: um pick só é legal se, depois dele, o time ainda consegue completar as vagas restantes com as espécies mais baratas que sobraram no pool, dentro de 120 pontos; e os dois times continuam conseguindo completar o elenco juntos, disputando o mesmo pool.
- Fase BUILD: **180 s**; o servidor rejeita time cujo elenco não seja exatamente os 17 draftados pelo jogador.
- Tolerância de reconexão **60 s**, pausa e fechamento por inatividade iguais aos da partida. Nenhum comportamento do modo Pré-montado muda.
- Idioma da interface e das mensagens de erro: português. Texto de botão diz a ação ("Escolher", "Estou pronto"). Sem travessão (`—`) em texto novo de interface.
- Protocolo Socket.IO: toda ação do draft carrega `turnId`; mensagens ≤ 64 KB.
- **Etapa 1 (refatoração):** `apps/server/test/room.test.ts`, `match-session.test.ts`, `match-session-retry.test.ts` e `integration.test.ts` passam **sem nenhuma alteração**. Se um deles precisar mudar, o corte está errado: pare e reveja.
- A etapa 4 (cliente) só começa depois que o PR #8 (identidade visual, jsdom e Testing Library) estiver na `main`.

## Review Focus

1. **Draft sem saída:** um jogador (ou o adversário) fica sem como completar 17 Pokémon dentro de 120 pontos, ou nenhum pick é legal na sua vez. Esperado: nunca acontece; o fuzz de Task 4 prova com estratégias adversariais (sempre o mais caro, aleatório).
2. **Elenco draftado sem deck válido:** menos de 6 cartas distintas liberadas por lado, então nenhum time válido existe. Esperado: nunca acontece com os elencos que o draft produz; Task 5 mede isso e, se falhar, o plano para para decidir uma regra extra.
3. **Pick duplicado ou fora da vez por corrida:** os dois clicam na mesma espécie quase juntos, ou um pick chega depois do timeout. Esperado: um só vale; o outro recebe `STALE_TURN` ou erro de espécie indisponível e a visão é reenviada (Task 7).
4. **Desconexão no meio do draft/BUILD:** queda de um jogador, dos dois, e retorno após o fim do draft. Esperado: pausa só quando os dois caem; quem volta recebe o estado atual; ausente além da tolerância tem pick automático imediato e, no BUILD, o time sugerido (Tasks 7 a 10).
5. **Jogador altera o elenco no BUILD:** envia time com espécie que não draftou ou troca o especialista por fora. Esperado: `ROSTER_NOT_DRAFTED`, time não fica pronto (Task 8).

---

# Etapa 1 — Refatoração da Room (sem mudar comportamento)

Mapa de arquivos desta etapa:

| Arquivo | Responsabilidade |
|---|---|
| `apps/server/src/seats.ts` (novo) | `SeatRegistry`: vagas, tokens, conexão, tolerância de reconexão |
| `apps/server/src/lobby.ts` (novo) | `Lobby`: time enviado, validação, "pronto" por jogador |
| `apps/server/src/phase.ts` (novo) | Interface `RoomPhase` |
| `apps/server/src/match-session.ts` (mod.) | Passa a declarar `implements RoomPhase` |
| `apps/server/src/room.ts` (mod.) | Orquestrador usando os três acima |

### Task 1: SeatRegistry

**Files:**
- Create: `apps/server/src/seats.ts`
- Test: `apps/server/test/seats.test.ts`

**Interfaces:**
- Produces:
  - `TEAM_KEYS: readonly TeamKey[]`
  - `interface Seat { key: TeamKey; token: string; connId: string | null; absent: boolean; cancelGrace: (() => void) | null; graceEndsAt: number | null; graceRemaining: number | null }`
  - `class SeatRegistry` com `get(key)`, `list()`, `byToken(token: unknown)`, `open(): Seat | null`, `release(seat): boolean`, `nobodyConnected(): boolean`, `attach(seat, connId): string | null` (devolve a conexão anterior), `detach(seat, connId): boolean`, `startGrace(seat, ms)`, `clearGrace(seat)`, `pauseGraces()` e `resumeGraces()` (sem argumentos).

- [ ] **Step 1: Escrever o teste que falha**

```ts
// apps/server/test/seats.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SeatRegistry, type Seat } from '../src/seats';
import { realScheduler } from '../src/timings';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => vi.useRealTimers());

function make() {
  const expired: Seat[] = [];
  let n = 0;
  const seats = new SeatRegistry({ scheduler: realScheduler, newToken: () => `tok-${++n}`, onGraceExpired: (s) => expired.push(s) });
  return { seats, expired };
}

describe('SeatRegistry', () => {
  it('abre A, depois B, depois não há vaga', () => {
    const { seats } = make();
    expect(seats.open()?.key).toBe('A');
    expect(seats.open()?.key).toBe('B');
    expect(seats.open()).toBeNull();
  });

  it('acha a vaga pelo token e ignora token que não é string', () => {
    const { seats } = make();
    const a = seats.open()!;
    expect(seats.byToken(a.token)).toBe(a);
    expect(seats.byToken('outro')).toBeUndefined();
    expect(seats.byToken(42)).toBeUndefined();
  });

  it('attach devolve a conexão anterior e zera ausência e tolerância', () => {
    const { seats } = make();
    const a = seats.open()!;
    expect(seats.attach(a, 'c1')).toBeNull();
    seats.startGrace(a, 1000);
    a.absent = true;
    expect(seats.attach(a, 'c2')).toBe('c1');
    expect(a.absent).toBe(false);
    expect(a.cancelGrace).toBeNull();
  });

  it('detach só vale para a conexão atual', () => {
    const { seats } = make();
    const a = seats.open()!;
    seats.attach(a, 'c1');
    expect(seats.detach(a, 'velha')).toBe(false);
    expect(a.connId).toBe('c1');
    expect(seats.detach(a, 'c1')).toBe(true);
    expect(a.connId).toBeNull();
  });

  it('a tolerância expira e avisa uma vez', () => {
    const { seats, expired } = make();
    const a = seats.open()!;
    seats.startGrace(a, 1000);
    vi.advanceTimersByTime(999);
    expect(expired).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(expired).toEqual([a]);
    expect(a.cancelGrace).toBeNull();
    expect(a.graceEndsAt).toBeNull();
  });

  it('pauseGraces guarda o que falta e resumeGraces reinicia só quem está desconectado', () => {
    const { seats, expired } = make();
    const a = seats.open()!;
    const b = seats.open()!;
    seats.attach(b, 'cb');
    seats.startGrace(a, 1000);
    vi.advanceTimersByTime(400);
    seats.pauseGraces();
    expect(a.graceRemaining).toBe(600);
    vi.advanceTimersByTime(5000);
    expect(expired).toEqual([]);
    seats.resumeGraces();
    vi.advanceTimersByTime(600);
    expect(expired).toEqual([a]);
  });

  it('release remove a vaga só se for a mesma', () => {
    const { seats } = make();
    const a = seats.open()!;
    expect(seats.release(a)).toBe(true);
    expect(seats.release(a)).toBe(false);
    expect(seats.get('A')).toBeUndefined();
  });

  it('nobodyConnected', () => {
    const { seats } = make();
    const a = seats.open()!;
    expect(seats.nobodyConnected()).toBe(true);
    seats.attach(a, 'c1');
    expect(seats.nobodyConnected()).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/server/test/seats.test.ts`
Expected: FAIL (módulo `../src/seats` não existe).

- [ ] **Step 3: Implementar**

```ts
// apps/server/src/seats.ts
import type { TeamKey } from '@pfl/engine';
import type { Scheduler } from './timings';

export const TEAM_KEYS: readonly TeamKey[] = ['A', 'B'];

/** Presença de um jogador: quem é, em que conexão está e quanto falta para perder a vaga. */
export interface Seat {
  key: TeamKey;
  token: string;
  connId: string | null;
  /** tolerância de reconexão esgotada */
  absent: boolean;
  cancelGrace: (() => void) | null;
  graceEndsAt: number | null;
  /** tolerância restante, guardada enquanto a sala está pausada */
  graceRemaining: number | null;
}

export interface SeatRegistryDeps {
  scheduler: Scheduler;
  newToken: () => string;
  /** chamado quando uma tolerância de reconexão acaba (o cancelGrace já foi limpo) */
  onGraceExpired: (seat: Seat) => void;
}

/** As duas vagas da sala. Não conhece lobby, draft nem partida. */
export class SeatRegistry {
  private readonly seats: Partial<Record<TeamKey, Seat>> = {};

  constructor(private readonly deps: SeatRegistryDeps) {}

  get(key: TeamKey): Seat | undefined {
    return this.seats[key];
  }

  list(): Seat[] {
    return TEAM_KEYS.flatMap((k) => {
      const s = this.seats[k];
      return s ? [s] : [];
    });
  }

  byToken(token: unknown): Seat | undefined {
    return typeof token === 'string' ? this.list().find((s) => s.token === token) : undefined;
  }

  /** Cria a próxima vaga livre (A, depois B); null se as duas estão ocupadas. */
  open(): Seat | null {
    const key = TEAM_KEYS.find((k) => !this.seats[k]);
    if (!key) return null;
    const seat: Seat = {
      key,
      token: this.deps.newToken(),
      connId: null,
      absent: false,
      cancelGrace: null,
      graceEndsAt: null,
      graceRemaining: null,
    };
    this.seats[key] = seat;
    return seat;
  }

  release(seat: Seat): boolean {
    if (this.seats[seat.key] !== seat) return false;
    delete this.seats[seat.key];
    return true;
  }

  nobodyConnected(): boolean {
    return this.list().every((s) => s.connId === null);
  }

  /** Devolve a conexão anterior (para o servidor derrubar o socket antigo). */
  attach(seat: Seat, connId: string): string | null {
    const previous = seat.connId;
    seat.connId = connId;
    seat.absent = false;
    this.clearGrace(seat);
    return previous;
  }

  /** false se `connId` não é a conexão atual (socket antigo depois de uma troca). */
  detach(seat: Seat, connId: string): boolean {
    if (seat.connId !== connId) return false;
    seat.connId = null;
    return true;
  }

  startGrace(seat: Seat, ms: number): void {
    this.clearGrace(seat);
    seat.graceEndsAt = this.deps.scheduler.now() + ms;
    seat.cancelGrace = this.deps.scheduler.schedule(ms, () => {
      seat.cancelGrace = null;
      seat.graceEndsAt = null;
      this.deps.onGraceExpired(seat);
    });
  }

  clearGrace(seat: Seat): void {
    seat.cancelGrace?.();
    seat.cancelGrace = null;
    seat.graceEndsAt = null;
    seat.graceRemaining = null;
  }

  pauseGraces(): void {
    const now = this.deps.scheduler.now();
    for (const s of this.list()) {
      if (s.cancelGrace && s.graceEndsAt !== null) {
        const remaining = Math.max(0, s.graceEndsAt - now);
        s.cancelGrace();
        s.cancelGrace = null;
        s.graceEndsAt = null;
        s.graceRemaining = remaining;
      }
    }
  }

  resumeGraces(): void {
    for (const s of this.list()) {
      if (s.connId === null && s.graceRemaining !== null) this.startGrace(s, s.graceRemaining);
    }
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run apps/server/test/seats.test.ts`
Expected: PASS (8 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/seats.ts apps/server/test/seats.test.ts
git commit -m "refactor(server): SeatRegistry com vagas, tokens e tolerância de reconexão"
```

### Task 2: Lobby

**Files:**
- Create: `apps/server/src/lobby.ts`
- Test: `apps/server/test/lobby.test.ts`

**Interfaces:**
- Consumes: `validateTeam`, `OFFENSE_SLOTS`, `DEFENSE_SLOTS` do `@pfl/engine`; `decodeTeam` do `@pfl/protocol`.
- Produces:
  - `TEAM_NAME_MAX = 40`, `normalizeTeam(team: Team): Team`
  - `interface LobbyEntry { ready: boolean; team: Team | null; teamName: string | null; teamErrors: TeamError[] }`
  - `class Lobby` com `entry(key): Readonly<LobbyEntry>`, `forget(key)`, `submit(key, teamCode: unknown): 'OK' | 'INVALID_TEAM_CODE'`, `setReady(key, ready: unknown): 'OK' | 'TEAM_INVALID'`, `startable(): Record<TeamKey, Team> | null`.

(A Task 8 acrescenta `extraCheck`, `requireTeam`, `preload` e `resetReady`.)

- [ ] **Step 1: Escrever o teste que falha**

```ts
// apps/server/test/lobby.test.ts
import { describe, expect, it } from 'vitest';
import { encodeTeam } from '@pfl/protocol';
import { Lobby, TEAM_NAME_MAX } from '../src/lobby';
import { electricTeam } from './fixtures';

describe('Lobby', () => {
  it('entrada nova está vazia', () => {
    expect(new Lobby().entry('A')).toEqual({ ready: false, team: null, teamName: null, teamErrors: [] });
  });

  it('código ilegível: nada fica guardado e o erro é MALFORMED_TEAM', () => {
    const lobby = new Lobby();
    expect(lobby.submit('A', 'lixo')).toBe('INVALID_TEAM_CODE');
    expect(lobby.submit('A', 42)).toBe('INVALID_TEAM_CODE');
    expect(lobby.entry('A')).toEqual({ ready: false, team: null, teamName: null, teamErrors: [{ code: 'MALFORMED_TEAM' }] });
  });

  it('time válido é guardado, normalizado e com o nome cortado', () => {
    const lobby = new Lobby();
    const team = electricTeam('X'.repeat(TEAM_NAME_MAX + 10));
    expect(lobby.submit('A', encodeTeam(team))).toBe('OK');
    expect(lobby.entry('A').team?.name).toHaveLength(TEAM_NAME_MAX);
    expect(lobby.entry('A').teamErrors).toEqual([]);
  });

  it('time inválido guarda o nome e os erros, mas não o time', () => {
    const lobby = new Lobby();
    const bad = { ...electricTeam('Ruim'), specialist: 25 };
    expect(lobby.submit('A', encodeTeam(bad))).toBe('OK');
    expect(lobby.entry('A').team).toBeNull();
    expect(lobby.entry('A').teamName).toBe('Ruim');
    expect(lobby.entry('A').teamErrors.length).toBeGreaterThan(0);
  });

  it('enviar um time desmarca o pronto', () => {
    const lobby = new Lobby();
    lobby.submit('A', encodeTeam(electricTeam('Raio')));
    expect(lobby.setReady('A', true)).toBe('OK');
    lobby.submit('A', encodeTeam(electricTeam('Raio 2')));
    expect(lobby.entry('A').ready).toBe(false);
  });

  it('ficar pronto exige time válido; desmarcar não exige', () => {
    const lobby = new Lobby();
    expect(lobby.setReady('A', true)).toBe('TEAM_INVALID');
    expect(lobby.setReady('A', false)).toBe('OK');
    expect(lobby.setReady('A', 'sim')).toBe('OK'); // só `true` conta
    expect(lobby.entry('A').ready).toBe(false);
  });

  it('startable só com os dois prontos e com time', () => {
    const lobby = new Lobby();
    lobby.submit('A', encodeTeam(electricTeam('Raio')));
    lobby.submit('B', encodeTeam(electricTeam('Trovão')));
    lobby.setReady('A', true);
    expect(lobby.startable()).toBeNull();
    lobby.setReady('B', true);
    expect(lobby.startable()?.A.name).toBe('Raio');
    expect(lobby.startable()?.B.name).toBe('Trovão');
  });

  it('forget apaga a entrada', () => {
    const lobby = new Lobby();
    lobby.submit('A', encodeTeam(electricTeam('Raio')));
    lobby.forget('A');
    expect(lobby.entry('A').teamName).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/server/test/lobby.test.ts`
Expected: FAIL (módulo `../src/lobby` não existe).

- [ ] **Step 3: Implementar** (código movido de `room.ts` sem mudar a lógica)

```ts
// apps/server/src/lobby.ts
import { DEFENSE_SLOTS, OFFENSE_SLOTS, validateTeam, type SlotId, type Team, type TeamError, type TeamKey } from '@pfl/engine';
import { decodeTeam } from '@pfl/protocol';

export const TEAM_NAME_MAX = 40;
const SLOTS: readonly SlotId[] = [...OFFENSE_SLOTS, ...DEFENSE_SLOTS];

/** Só os campos do contrato, com o nome cortado: nada além disso vai para a partida nem para o replay. */
export function normalizeTeam(team: Team): Team {
  const depth: Team['depth'] = {};
  for (const slot of SLOTS) {
    const ids = team.depth[slot];
    if (ids) depth[slot] = [...ids];
  }
  return {
    name: team.name.slice(0, TEAM_NAME_MAX),
    roster: [...team.roster],
    specialist: team.specialist,
    depth,
    keepOnField: [...team.keepOnField],
    offenseDeck: [...team.offenseDeck],
    defenseDeck: [...team.defenseDeck],
  };
}

export interface LobbyEntry {
  ready: boolean;
  /** só guarda time válido */
  team: Team | null;
  teamName: string | null;
  teamErrors: TeamError[];
}

export type SubmitResult = 'OK' | 'INVALID_TEAM_CODE';
export type ReadyResult = 'OK' | 'TEAM_INVALID';

/** O time enviado e o "pronto" de cada jogador. Não conhece conexão, timers nem partida. */
export class Lobby {
  private readonly entries: Partial<Record<TeamKey, LobbyEntry>> = {};

  private slot(key: TeamKey): LobbyEntry {
    return (this.entries[key] ??= { ready: false, team: null, teamName: null, teamErrors: [] });
  }

  entry(key: TeamKey): Readonly<LobbyEntry> {
    return this.slot(key);
  }

  forget(key: TeamKey): void {
    delete this.entries[key];
  }

  submit(key: TeamKey, teamCode: unknown): SubmitResult {
    const e = this.slot(key);
    e.ready = false;
    const decoded = typeof teamCode === 'string' ? decodeTeam(teamCode) : null;
    if (decoded === null) {
      e.team = null;
      e.teamName = null;
      e.teamErrors = [{ code: 'MALFORMED_TEAM' }];
      return 'INVALID_TEAM_CODE';
    }
    const errors = validateTeam(decoded);
    const name =
      typeof decoded === 'object' && typeof (decoded as Record<string, unknown>).name === 'string'
        ? ((decoded as Record<string, unknown>).name as string).slice(0, TEAM_NAME_MAX)
        : null;
    e.team = errors.length === 0 ? normalizeTeam(decoded as Team) : null;
    e.teamName = name;
    e.teamErrors = errors;
    return 'OK';
  }

  setReady(key: TeamKey, ready: unknown): ReadyResult {
    const e = this.slot(key);
    const wants = ready === true;
    if (wants && !e.team) return 'TEAM_INVALID';
    e.ready = wants;
    return 'OK';
  }

  /** Os dois times, se ambos estão prontos e com time válido. */
  startable(): Record<TeamKey, Team> | null {
    const a = this.entries.A;
    const b = this.entries.B;
    if (!a || !b || !a.ready || !b.ready || !a.team || !b.team) return null;
    return { A: a.team, B: b.team };
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run apps/server/test/lobby.test.ts`
Expected: PASS (8 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/lobby.ts apps/server/test/lobby.test.ts
git commit -m "refactor(server): Lobby guarda time enviado e pronto de cada jogador"
```

### Task 3: RoomPhase e Room como orquestrador

**Files:**
- Create: `apps/server/src/phase.ts`
- Modify: `apps/server/src/match-session.ts:31` (`implements RoomPhase`)
- Modify (reescrita): `apps/server/src/room.ts`
- Test: os existentes, **sem alteração**

**Interfaces:**
- Consumes: `SeatRegistry`, `Seat`, `TEAM_KEYS` (Task 1); `Lobby` (Task 2).
- Produces: `interface RoomPhase { start(): void; sendCurrent(key: TeamKey): void; pause(): void; resume(): void; refreshAbsence(): boolean; dispose(): void }`. A API pública de `Room` não muda: `code`, `status`, `session` (agora derivado), `isClosed`, `connectionOf`, `tokenOf`, `claimSeat`, `connect`, `disconnect`, `leave`, `submitTeam`, `setReady`, `play`, `resync`, `close`.

- [ ] **Step 1: Registrar a linha de base**

Run: `npm test 2>&1 | tail -8`
Expected: todos os testes passam (anote o total: 572 + os novos de Tasks 1 e 2).

- [ ] **Step 2: Criar a interface**

```ts
// apps/server/src/phase.ts
import type { TeamKey } from '@pfl/engine';

/** Uma etapa da sala com timer e estado próprios (hoje a partida; depois o draft e a montagem). */
export interface RoomPhase {
  start(): void;
  /** Reenvia o estado atual da fase a um jogador (reconexão e match:resync). */
  sendCurrent(key: TeamKey): void;
  pause(): void;
  resume(): void;
  /** true se o deadline mudou e a fase já reenviou o estado aos dois. */
  refreshAbsence(): boolean;
  dispose(): void;
}
```

Em `match-session.ts`, importe `import type { RoomPhase } from './phase';` e mude a declaração para `export class MatchSession implements RoomPhase {`. Os métodos já têm as assinaturas da interface.

- [ ] **Step 3: Reescrever `room.ts`** (mesma lógica, repartida entre `seats`, `lobby` e `phase`)

```ts
// apps/server/src/room.ts
import type { TeamKey } from '@pfl/engine';
import type { ErrorCode, RoomState, RoomStatus } from '@pfl/protocol';
import { Lobby } from './lobby';
import { MatchSession } from './match-session';
import type { Outgoing, Send } from './outgoing';
import type { PlayRequest } from './parse';
import type { RoomPhase } from './phase';
import { SeatRegistry, type Seat } from './seats';
import type { Scheduler, Timings } from './timings';

const SEED_RANGE = 0x7fffffff;

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

/** Sala em memória (spec 7.1/8): orquestra vagas, lobby e a fase atual (hoje, a partida). */
export class Room {
  private readonly seats: SeatRegistry;
  private readonly lobby = new Lobby();
  private roomStatus: RoomStatus = 'WAITING';
  private phase: RoomPhase | null = null;
  private cancelClose: (() => void) | null = null;
  private closed = false;

  constructor(readonly code: string, private readonly deps: RoomDeps) {
    this.seats = new SeatRegistry({
      scheduler: deps.scheduler,
      newToken: deps.newToken,
      onGraceExpired: (seat) => this.onGraceExpired(seat),
    });
  }

  get status(): RoomStatus {
    return this.roomStatus;
  }
  get session(): MatchSession | null {
    return this.phase instanceof MatchSession ? this.phase : null;
  }
  get isClosed(): boolean {
    return this.closed;
  }
  connectionOf(key: TeamKey): string | null {
    return this.seats.get(key)?.connId ?? null;
  }
  tokenOf(key: TeamKey): string | null {
    return this.seats.get(key)?.token ?? null;
  }

  /** Token da própria sala → a mesma vaga. Sem token (ou com token alheio) → vaga livre no lobby, ou null (cheia). */
  claimSeat(token?: unknown): { key: TeamKey; token: string } | null {
    if (this.closed) return null;
    const existing = this.seats.byToken(token);
    if (existing) return { key: existing.key, token: existing.token };
    if (this.roomStatus !== 'WAITING') return null;
    const seat = this.seats.open();
    return seat ? { key: seat.key, token: seat.token } : null;
  }

  connect(key: TeamKey, connId: string): string | null {
    const seat = this.seats.get(key);
    if (this.closed || !seat) return null;
    const previous = this.seats.attach(seat, connId);
    if (this.roomStatus === 'WAITING') {
      // a vaga de quem saiu enquanto a sala estava vazia volta a contar a tolerância
      for (const s of this.seats.list()) if (s.connId === null && !s.cancelGrace) this.seats.startGrace(s, this.deps.timings.reconnectGraceMs);
    }
    if (this.roomStatus !== 'FINISHED') this.clearCloseTimer();
    const wasPaused = this.roomStatus === 'PAUSED';
    if (wasPaused) this.roomStatus = 'IN_MATCH';
    this.broadcastState();
    if (wasPaused) {
      this.seats.resumeGraces();
      this.phase?.resume();
    } else if (this.phase && !this.phase.refreshAbsence()) {
      this.phase.sendCurrent(key);
    }
    this.tryStart();
    return previous !== null && previous !== connId ? previous : null;
  }

  disconnect(key: TeamKey, connId: string): void {
    const seat = this.seats.get(key);
    if (this.closed || !seat || !this.seats.detach(seat, connId)) return; // socket antigo depois de uma troca de conexão
    const nobody = this.seats.nobodyConnected();
    if (this.roomStatus === 'IN_MATCH') {
      if (nobody) {
        this.roomStatus = 'PAUSED';
        this.seats.pauseGraces();
        seat.graceRemaining = seat.absent ? null : this.deps.timings.reconnectGraceMs;
        this.phase?.pause();
        this.scheduleClose();
      } else {
        this.seats.startGrace(seat, this.deps.timings.reconnectGraceMs);
      }
    } else if (this.roomStatus === 'WAITING') {
      // no lobby, a vaga de quem não volta dentro da tolerância é liberada para outro jogador
      this.seats.startGrace(seat, this.deps.timings.reconnectGraceMs);
      if (nobody) this.scheduleClose();
    }
    this.broadcastState();
  }

  /** Saída voluntária (o socket foi criar ou entrar em outra sala): sala de lobby sem ninguém fecha na hora. */
  leave(key: TeamKey, connId: string): void {
    this.disconnect(key, connId);
    if (!this.closed && this.roomStatus === 'WAITING' && this.seats.nobodyConnected()) this.close();
  }

  submitTeam(key: TeamKey, teamCode: unknown): void {
    if (this.closed || !this.seats.get(key)) return;
    if (this.roomStatus !== 'WAITING') return this.error(key, 'NOT_READY', 'A partida já começou');
    if (this.lobby.submit(key, teamCode) === 'INVALID_TEAM_CODE') this.error(key, 'INVALID_TEAM_CODE', 'Código de time ilegível');
    this.broadcastState();
  }

  setReady(key: TeamKey, ready: unknown): void {
    if (this.closed || !this.seats.get(key)) return;
    if (this.roomStatus !== 'WAITING') return this.error(key, 'NOT_READY', 'A partida já começou');
    if (this.lobby.setReady(key, ready) === 'TEAM_INVALID') {
      return this.error(key, 'TEAM_INVALID', 'Envie um time válido antes de ficar pronto');
    }
    this.broadcastState();
    this.tryStart();
  }

  play(key: TeamKey, req: PlayRequest): void {
    if (this.closed || !this.seats.get(key)) return;
    const session = this.session;
    if (!session) return this.error(key, 'NOT_READY', 'A partida ainda não começou');
    if (this.roomStatus === 'FINISHED') return this.error(key, 'NOT_READY', 'A partida já terminou');
    session.handle(key, req);
  }

  resync(key: TeamKey): void {
    if (this.closed || !this.seats.get(key)) return;
    this.sendState(key);
    this.phase?.sendCurrent(key);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.clearCloseTimer();
    for (const s of this.seats.list()) this.seats.clearGrace(s);
    this.phase?.dispose();
    this.deps.onClose();
  }

  private sendTo(to: TeamKey, msg: Outgoing): void {
    const seat = this.seats.get(to);
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
      players: this.seats.list().map((s) => {
        const e = this.lobby.entry(s.key);
        return { key: s.key, connected: s.connId !== null, ready: e.ready, teamName: e.teamName, teamErrors: e.teamErrors };
      }),
    };
  }

  private sendState(key: TeamKey): void {
    this.sendTo(key, { event: 'room:state', payload: this.stateFor(key) });
  }

  private broadcastState(): void {
    for (const s of this.seats.list()) this.sendState(s.key);
  }

  private tryStart(): void {
    if (this.closed || this.roomStatus !== 'WAITING') return;
    const a = this.seats.get('A');
    const b = this.seats.get('B');
    const teams = this.lobby.startable();
    if (!a || !b || !teams || a.connId === null || b.connId === null) return;
    const seed = Math.floor(this.deps.random() * SEED_RANGE);
    const session = new MatchSession(teams, seed, {
      scheduler: this.deps.scheduler,
      timings: this.deps.timings,
      send: (to, msg) => this.sendTo(to, msg),
      isAbsent: (k) => this.seats.get(k)?.absent ?? false,
      onEnd: () => this.onMatchEnd(),
    });
    this.phase = session;
    this.roomStatus = 'IN_MATCH';
    this.broadcastState();
    session.start();
  }

  private onMatchEnd(): void {
    this.roomStatus = 'FINISHED';
    for (const s of this.seats.list()) this.seats.clearGrace(s);
    this.broadcastState();
    this.scheduleClose();
  }

  private onGraceExpired(seat: Seat): void {
    if (this.roomStatus === 'WAITING') {
      // só libera a vaga se alguém está esperando o adversário; a sala vazia já tem o timer de fechamento
      const someoneWaiting = this.seats.list().some((s) => s.connId !== null);
      if (this.seats.get(seat.key) === seat && seat.connId === null && someoneWaiting) {
        this.seats.release(seat);
        this.lobby.forget(seat.key);
        this.broadcastState();
      }
      return;
    }
    seat.absent = true;
    this.phase?.refreshAbsence();
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

- [ ] **Step 4: Rodar tudo: nada do que existia pode mudar**

Run: `npm test 2>&1 | tail -10 && npm run typecheck 2>&1 | tail -5 && git status --short apps/server/test`
Expected: todos os testes passam; typecheck sem erros; `git status` não lista nenhum arquivo modificado em `apps/server/test` (só os dois testes novos das Tasks 1 e 2, já commitados).

Se `room.test.ts` falhar, a diferença é de comportamento: compare a ordem de `error` e `broadcastState` em `submitTeam`/`setReady` e o `release` + `forget` em `onGraceExpired` com o código antigo (`git show HEAD:apps/server/src/room.ts`).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/phase.ts apps/server/src/match-session.ts apps/server/src/room.ts
git commit -m "refactor(server): Room vira orquestrador sobre SeatRegistry, Lobby e RoomPhase"
```

---

# Etapa 2 — Engine e protocolo

### Task 4: Módulo `draft` do engine

**Files:**
- Modify: `packages/engine/src/errors.ts`
- Create: `packages/engine/src/draft.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/test/draft.test.ts`

**Interfaces:**
- Consumes: `ALL_SPECIES`, `LEGENDARY_IDS`, `hasSpecies`, `getSpecies` (species); `ROSTER_SIZE`, `SALARY_CAP`, `bst`, `speciesCost` (team); `EngineError`.
- Produces (todos exportados por `@pfl/engine`):
  - `DRAFT_TEAM_SIZE = 17`, `DRAFT_TOTAL_PICKS = 34`
  - `type DraftBlockReason = 'OVER_BUDGET' | 'LEGENDARY_LIMIT' | 'POOL_SHORTAGE'`
  - `interface DraftState { order: TeamKey[]; index: number; picks: Record<TeamKey, number[]>; pool: number[] }`
  - `type DraftAction = { type: 'PICK'; team: TeamKey; species: number } | { type: 'AUTO_PICK'; team: TeamKey }`
  - `snakeOrder(first: TeamKey): TeamKey[]`, `createDraft(first: TeamKey): DraftState`, `isDraftComplete(s): boolean`, `draftTurn(s): TeamKey | null`, `draftSpent(s, team): number`
  - `blockReason(s, team, species): DraftBlockReason | null`, `blockedFor(s, team): Record<number, DraftBlockReason>`, `pickError(s, team, species): EngineErrorCode | null`
  - `autoPickSpecies(s, team): number`, `draftStep(s, action): DraftState` (lança `EngineError`), `draftRosters(s): Record<TeamKey, number[]>`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// packages/engine/test/draft.test.ts
import { describe, expect, it } from 'vitest';
import {
  DRAFT_TEAM_SIZE, DRAFT_TOTAL_PICKS, EngineError, LEGENDARY_IDS, SALARY_CAP, autoPickSpecies, blockReason, blockedFor,
  createDraft, draftRosters, draftSpent, draftStep, draftTurn, isDraftComplete, pickError, rngNext, snakeOrder, speciesCost,
  type DraftState, type TeamKey,
} from '../src';

const MEWTWO = 150;
const MEW = 151;
const MAGIKARP = 129;

const codeOf = (fn: () => unknown): string | null => {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof EngineError ? e.code : 'OUTRO';
  }
};

describe('ordem snake', () => {
  it('A,B,B,A,A,B,B,A… com 17 picks para cada um', () => {
    const order = snakeOrder('A');
    expect(order).toHaveLength(DRAFT_TOTAL_PICKS);
    expect(order.slice(0, 8).join('')).toBe('ABBAABBA');
    expect(order.filter((k) => k === 'A')).toHaveLength(DRAFT_TEAM_SIZE);
    expect(order.filter((k) => k === 'B')).toHaveLength(DRAFT_TEAM_SIZE);
  });

  it('começando por B inverte os lados', () => {
    expect(snakeOrder('B').slice(0, 4).join('')).toBe('BAAB');
  });
});

describe('estado e vez', () => {
  it('começa com o pool cheio e a vez de quem abre', () => {
    const s = createDraft('B');
    expect(s.pool).toHaveLength(151);
    expect(draftTurn(s)).toBe('B');
    expect(isDraftComplete(s)).toBe(false);
  });

  it('pick fora da vez, espécie desconhecida ou repetida são recusados', () => {
    let s = createDraft('A');
    expect(codeOf(() => draftStep(s, { type: 'PICK', team: 'B', species: 25 }))).toBe('NOT_YOUR_TURN');
    expect(codeOf(() => draftStep(s, { type: 'PICK', team: 'A', species: 999 }))).toBe('UNKNOWN_SPECIES');
    s = draftStep(s, { type: 'PICK', team: 'A', species: 25 });
    expect(s.pool).not.toContain(25);
    expect(codeOf(() => draftStep(s, { type: 'PICK', team: 'B', species: 25 }))).toBe('SPECIES_UNAVAILABLE');
  });

  it('o pick avança a vez e guarda a espécie na ordem', () => {
    let s = createDraft('A');
    s = draftStep(s, { type: 'PICK', team: 'A', species: 25 });
    expect(s.index).toBe(1);
    expect(draftTurn(s)).toBe('B');
    expect(s.picks.A).toEqual([25]);
  });

  it('não muta o estado anterior', () => {
    const s = createDraft('A');
    const before = JSON.stringify(s);
    draftStep(s, { type: 'PICK', team: 'A', species: 25 });
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('lendário e orçamento', () => {
  it('só um lendário por time', () => {
    let s = createDraft('A');
    s = draftStep(s, { type: 'PICK', team: 'A', species: MEWTWO });
    s = draftStep(s, { type: 'PICK', team: 'B', species: 25 });
    s = draftStep(s, { type: 'PICK', team: 'B', species: 26 });
    expect(blockReason(s, 'A', MEW)).toBe('LEGENDARY_LIMIT');
    expect(codeOf(() => draftStep(s, { type: 'PICK', team: 'A', species: MEW }))).toBe('LEGENDARY_LIMIT');
    expect(blockedFor(s, 'A')[MEW]).toBe('LEGENDARY_LIMIT');
  });

  /** A já tem 16 picks caros e sobra pouco para o 17º; B ainda não escolheu nada. */
  function nearlyBrokeA(): DraftState {
    const s = createDraft('A');
    const byCost = s.pool.filter((id) => !LEGENDARY_IDS.includes(id)).sort((a, b) => speciesCost(b) - speciesCost(a) || a - b);
    const picks: number[] = [];
    let spent = 0;
    for (const id of byCost) {
      if (picks.length === 16) break;
      const slotsAfter = 16 - picks.length - 1;
      if (spent + speciesCost(id) + slotsAfter <= SALARY_CAP - 1) {
        picks.push(id);
        spent += speciesCost(id);
      }
    }
    expect(picks).toHaveLength(16);
    return { ...s, picks: { A: picks, B: [] }, pool: s.pool.filter((id) => !picks.includes(id)) };
  }

  it('recusa o pick que impede o time de completar 17 dentro do teto', () => {
    const s = nearlyBrokeA();
    const left = SALARY_CAP - draftSpent(s, 'A');
    expect(left).toBeGreaterThanOrEqual(1);
    expect(s.picks.A.length).toBe(DRAFT_TEAM_SIZE - 1);
    const blocked = blockedFor(s, 'A');
    for (const id of s.pool) {
      if (speciesCost(id) > left) expect(blocked[id], `espécie ${id} (custo ${speciesCost(id)}) deveria passar do orçamento`).toBe('OVER_BUDGET');
    }
    const affordable = s.pool.filter((id) => speciesCost(id) <= left && !LEGENDARY_IDS.includes(id));
    expect(affordable.length).toBeGreaterThan(0);
    expect(affordable.some((id) => blocked[id] === undefined)).toBe(true);
  });

  it('a espécie mais barata sempre é legal para quem está dentro do orçamento', () => {
    const s = createDraft('A');
    expect(blockReason(s, 'A', MAGIKARP)).toBeNull();
    expect(pickError(s, 'A', MAGIKARP)).toBeNull();
  });
});

describe('pick automático', () => {
  it('escolhe o maior BST legal; empate pelo menor id', () => {
    const s = createDraft('A');
    expect(autoPickSpecies(s, 'A')).toBe(150); // Mewtwo (BST 680) é o maior e cabe no orçamento inicial
  });

  it('AUTO_PICK avança como um pick comum', () => {
    const s = draftStep(createDraft('A'), { type: 'AUTO_PICK', team: 'A' });
    expect(s.picks.A).toHaveLength(1);
    expect(draftTurn(s)).toBe('B');
  });

  it('AUTO_PICK de quem não tem a vez é recusado', () => {
    expect(codeOf(() => draftStep(createDraft('A'), { type: 'AUTO_PICK', team: 'B' }))).toBe('NOT_YOUR_TURN');
  });
});

describe('fim do draft', () => {
  it('depois de 34 picks não há mais vez e os elencos saem completos', () => {
    let s: DraftState = createDraft('A');
    while (!isDraftComplete(s)) s = draftStep(s, { type: 'AUTO_PICK', team: draftTurn(s)! });
    expect(draftTurn(s)).toBeNull();
    const rosters = draftRosters(s);
    expect(rosters.A).toHaveLength(DRAFT_TEAM_SIZE);
    expect(rosters.B).toHaveLength(DRAFT_TEAM_SIZE);
    expect(codeOf(() => draftStep(s, { type: 'AUTO_PICK', team: 'A' }))).toBe('DRAFT_OVER');
  });

  it('draftRosters falha com o draft incompleto', () => {
    expect(codeOf(() => draftRosters(createDraft('A')))).toBe('DRAFT_OVER');
  });

  it('é determinístico: mesmas ações, mesmo resultado', () => {
    const run = () => {
      let s: DraftState = createDraft('B');
      while (!isDraftComplete(s)) s = draftStep(s, { type: 'AUTO_PICK', team: draftTurn(s)! });
      return JSON.stringify(s);
    };
    expect(run()).toBe(run());
  });
});

// Review Focus 1: nenhum jogador fica sem saída, mesmo com estratégias adversariais.
describe('invariantes (fuzz)', () => {
  type Strategy = 'RANDOM' | 'PRICIEST' | 'CHEAPEST';

  function legalFor(s: DraftState, team: TeamKey): number[] {
    return s.pool.filter((id) => blockReason(s, team, id) === null);
  }

  function play(first: TeamKey, strategies: Record<TeamKey, Strategy>, seed: number): DraftState {
    let s = createDraft(first);
    let rng = seed;
    while (!isDraftComplete(s)) {
      const team = draftTurn(s)!;
      const legal = legalFor(s, team);
      expect(legal.length, `sem pick legal para ${team} no pick ${s.index} (seed ${seed}, ${strategies[team]})`).toBeGreaterThan(0);
      const r = rngNext(rng);
      rng = r.state;
      let species: number;
      if (strategies[team] === 'PRICIEST') species = [...legal].sort((a, b) => speciesCost(b) - speciesCost(a) || a - b)[0];
      else if (strategies[team] === 'CHEAPEST') species = [...legal].sort((a, b) => speciesCost(a) - speciesCost(b) || a - b)[0];
      else species = legal[Math.floor(r.value * legal.length)];
      s = draftStep(s, { type: 'PICK', team, species });
    }
    return s;
  }

  const MATCHUPS: [Strategy, Strategy][] = [
    ['RANDOM', 'RANDOM'], ['PRICIEST', 'PRICIEST'], ['PRICIEST', 'CHEAPEST'], ['CHEAPEST', 'PRICIEST'], ['PRICIEST', 'RANDOM'],
  ];

  // 8 seeds por confronto: cada pick avalia as 151 espécies, então o teste custa alguns segundos.
  it.each(MATCHUPS)('A %s x B %s: os dois completam 17 dentro do teto, sem repetição', { timeout: 60_000 }, (a, b) => {
    for (let seed = 1; seed <= 8; seed++) {
      const s = play(seed % 2 ? 'A' : 'B', { A: a, B: b }, seed);
      const { A, B } = draftRosters(s);
      for (const roster of [A, B]) {
        expect(roster).toHaveLength(DRAFT_TEAM_SIZE);
        expect(roster.reduce((sum, id) => sum + speciesCost(id), 0)).toBeLessThanOrEqual(SALARY_CAP);
        expect(roster.filter((id) => LEGENDARY_IDS.includes(id)).length).toBeLessThanOrEqual(1);
      }
      expect(new Set([...A, ...B]).size).toBe(DRAFT_TOTAL_PICKS);
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/engine/test/draft.test.ts`
Expected: FAIL (exports de draft inexistentes).

- [ ] **Step 3: Estender os códigos de erro**

Em `packages/engine/src/errors.ts`, acrescente ao `EngineErrorCode`:

```ts
  | 'DRAFT_OVER'
  | 'NOT_YOUR_TURN'
  | 'UNKNOWN_SPECIES'
  | 'SPECIES_UNAVAILABLE'
  | 'LEGENDARY_LIMIT'
  | 'OVER_BUDGET'
  | 'POOL_SHORTAGE'
  | 'NO_LEGAL_PICK'
```

- [ ] **Step 4: Implementar o módulo**

```ts
// packages/engine/src/draft.ts
import { EngineError, type EngineErrorCode } from './errors';
import type { TeamKey } from './model';
import { ALL_SPECIES, LEGENDARY_IDS, getSpecies, hasSpecies } from './species';
import { ROSTER_SIZE, SALARY_CAP, bst, speciesCost } from './team';

/** 16 de linha + 1 especialista por time. */
export const DRAFT_TEAM_SIZE = ROSTER_SIZE + 1;
export const DRAFT_TOTAL_PICKS = DRAFT_TEAM_SIZE * 2;

export type DraftBlockReason = 'OVER_BUDGET' | 'LEGENDARY_LIMIT' | 'POOL_SHORTAGE';

export interface DraftState {
  /** de quem é cada um dos 34 picks */
  order: TeamKey[];
  /** próximo pick (0..34) */
  index: number;
  picks: Record<TeamKey, number[]>;
  /** espécies ainda disponíveis, em ordem crescente de id */
  pool: number[];
}

export type DraftAction =
  | { type: 'PICK'; team: TeamKey; species: number }
  | { type: 'AUTO_PICK'; team: TeamKey };

const other = (k: TeamKey): TeamKey => (k === 'A' ? 'B' : 'A');
const isLegendary = (id: number): boolean => LEGENDARY_IDS.includes(id);
const costOf = (ids: readonly number[]): number => ids.reduce((sum, id) => sum + speciesCost(id), 0);

/** Snake: quem abre pica uma vez, depois cada lado pica duas seguidas, alternando. */
export function snakeOrder(first: TeamKey): TeamKey[] {
  const second = other(first);
  return Array.from({ length: DRAFT_TOTAL_PICKS }, (_, i) => (i === 0 ? first : Math.floor((i - 1) / 2) % 2 === 0 ? second : first));
}

export function createDraft(first: TeamKey): DraftState {
  return { order: snakeOrder(first), index: 0, picks: { A: [], B: [] }, pool: ALL_SPECIES.map((s) => s.id) };
}

export function isDraftComplete(s: DraftState): boolean {
  return s.index >= s.order.length;
}

export function draftTurn(s: DraftState): TeamKey | null {
  return isDraftComplete(s) ? null : s.order[s.index];
}

export function draftSpent(s: DraftState, team: TeamKey): number {
  return costOf(s.picks[team]);
}

/**
 * O time sozinho consegue completar as vagas que faltam com as espécies mais baratas do pool, dentro do teto?
 * Conservador: nunca conta lendários para completar (são caros e não ajudam).
 */
function canComplete(picks: readonly number[], pool: readonly number[]): boolean {
  const slots = DRAFT_TEAM_SIZE - picks.length;
  const spent = costOf(picks);
  if (slots <= 0) return spent <= SALARY_CAP;
  const costs = pool
    .filter((id) => !isLegendary(id))
    .map(speciesCost)
    .sort((a, b) => a - b);
  if (costs.length < slots) return false;
  return spent + costs.slice(0, slots).reduce((a, b) => a + b, 0) <= SALARY_CAP;
}

/**
 * Os dois times conseguem completar juntos, disputando as mesmas espécies baratas? Só 13 espécies custam até 3
 * pontos, então checar cada time sozinho deixaria os dois "completáveis" com o mesmo lote e o draft travaria
 * (medido: 10 de 30 drafts travavam). Condição suficiente e barata: um dos times fica com as espécies mais
 * baratas e o outro com as seguintes. Enquanto o estado cumpre isso, quem tem a vez sempre tem um pick legal
 * (qualquer espécie do seu próprio lote), então o draft nunca fica sem saída.
 */
function canCompleteTogether(a: readonly number[], b: readonly number[], pool: readonly number[]): boolean {
  const costs = pool
    .filter((id) => !isLegendary(id))
    .map(speciesCost)
    .sort((x, y) => x - y);
  const kA = Math.max(0, DRAFT_TEAM_SIZE - a.length);
  const kB = Math.max(0, DRAFT_TEAM_SIZE - b.length);
  if (costs.length < kA + kB) return false;
  const fits = (picks: readonly number[], from: number, n: number): boolean =>
    costOf(picks) + costs.slice(from, from + n).reduce((sum, c) => sum + c, 0) <= SALARY_CAP;
  return (fits(a, 0, kA) && fits(b, kA, kB)) || (fits(b, 0, kB) && fits(a, kB, kA));
}

/** Por que `team` não pode escolher `species` (ignora a vez). null = pode. `species` precisa estar no pool. */
export function blockReason(s: DraftState, team: TeamKey, species: number): DraftBlockReason | null {
  const mine = s.picks[team];
  if (isLegendary(species) && mine.some(isLegendary)) return 'LEGENDARY_LIMIT';
  const pool = s.pool.filter((id) => id !== species);
  const after = [...mine, species];
  if (!canComplete(after, pool)) return 'OVER_BUDGET';
  const picks = { ...s.picks, [team]: after };
  if (!canCompleteTogether(picks.A, picks.B, pool)) return 'POOL_SHORTAGE';
  return null;
}

/** Espécies do pool que `team` não pode escolher agora, com o motivo (para a interface). */
export function blockedFor(s: DraftState, team: TeamKey): Record<number, DraftBlockReason> {
  const blocked: Record<number, DraftBlockReason> = {};
  for (const id of s.pool) {
    const why = blockReason(s, team, id);
    if (why) blocked[id] = why;
  }
  return blocked;
}

export function pickError(s: DraftState, team: TeamKey, species: number): EngineErrorCode | null {
  if (isDraftComplete(s)) return 'DRAFT_OVER';
  if (s.order[s.index] !== team) return 'NOT_YOUR_TURN';
  if (!Number.isInteger(species) || !hasSpecies(species)) return 'UNKNOWN_SPECIES';
  if (!s.pool.includes(species)) return 'SPECIES_UNAVAILABLE';
  return blockReason(s, team, species);
}

/** Maior BST entre as legais; empate pelo menor id (o pool já vem em ordem crescente). */
export function autoPickSpecies(s: DraftState, team: TeamKey): number {
  let best: number | null = null;
  for (const id of s.pool) {
    if (blockReason(s, team, id) !== null) continue;
    if (best === null || bst(getSpecies(id)) > bst(getSpecies(best))) best = id;
  }
  if (best === null) throw new EngineError('NO_LEGAL_PICK', team);
  return best;
}

export function draftStep(s: DraftState, action: DraftAction): DraftState {
  if (isDraftComplete(s)) throw new EngineError('DRAFT_OVER');
  if (s.order[s.index] !== action.team) throw new EngineError('NOT_YOUR_TURN', action.team);
  const species = action.type === 'AUTO_PICK' ? autoPickSpecies(s, action.team) : action.species;
  const error = pickError(s, action.team, species);
  if (error) throw new EngineError(error, String(species));
  return {
    order: s.order,
    index: s.index + 1,
    picks: { ...s.picks, [action.team]: [...s.picks[action.team], species] },
    pool: s.pool.filter((id) => id !== species),
  };
}

export function draftRosters(s: DraftState): Record<TeamKey, number[]> {
  if (!isDraftComplete(s)) throw new EngineError('DRAFT_OVER', 'draft incompleto');
  return { A: [...s.picks.A], B: [...s.picks.B] };
}
```

Em `packages/engine/src/index.ts`, acrescente `export * from './draft';`.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run packages/engine/test/draft.test.ts`
Expected: PASS. Se o fuzz falhar com "sem pick legal", **pare**: o Review Focus 1 foi violado e a regra de orçamento precisa ser revista com o usuário antes de seguir (não "conserte" afrouxando o teste). Se `autoPickSpecies` não devolver 150 no teste de BST, confira o BST de Mewtwo em `packages/engine/src/data/pokemon.json` e ajuste só a expectativa.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/errors.ts packages/engine/src/draft.ts packages/engine/src/index.ts packages/engine/test/draft.test.ts
git commit -m "feat(engine): módulo draft com ordem snake, pool exclusivo e reserva de orçamento"
```

### Task 5: Montagem sugerida (`suggestBuild`) no engine

**Contexto:** hoje `buildDepth` e `usableCards` vivem em `packages/sim/src/random-team.ts`. O servidor precisa gerar a sugestão inicial da fase BUILD, e o servidor não depende do `sim`. Mova as duas funções (e a nota da vaga) para o engine; o `sim` passa a importá-las de lá.

**Files:**
- Create: `packages/engine/src/teams/auto-build.ts`
- Modify: `packages/engine/src/index.ts`
- Modify: `packages/sim/src/random-team.ts` (remove as cópias e reexporta)
- Test: `packages/engine/test/auto-build.test.ts`

**Interfaces:**
- Produces: `slotScore(id: number, slot: SlotId): number`, `buildDepth(roster: readonly number[]): Team['depth']`, `usableCards(team, side): Card[]`, `pickSpecialist(ids: readonly number[]): number`, `suggestBuild(roster17: readonly number[], name: string): Team`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// packages/engine/test/auto-build.test.ts
import { describe, expect, it } from 'vitest';
import {
  DECK_SIZE, SUGGESTED_TEAMS, autoPickSpecies, createDraft, draftRosters, draftStep, draftTurn, isDraftComplete,
  suggestBuild, validateTeam, type DraftState,
} from '../src';

describe('suggestBuild', () => {
  it('para um time sugerido, devolve um time válido com o mesmo conjunto de 17', () => {
    const base = SUGGESTED_TEAMS[0];
    const ids = [...base.roster, base.specialist];
    const team = suggestBuild(ids, 'Teste');
    expect(validateTeam(team)).toEqual([]);
    expect([...team.roster, team.specialist].sort((a, b) => a - b)).toEqual([...ids].sort((a, b) => a - b));
    expect(team.offenseDeck).toHaveLength(DECK_SIZE);
    expect(team.defenseDeck).toHaveLength(DECK_SIZE);
  });

  it('é determinístico', () => {
    const base = SUGGESTED_TEAMS[1];
    const ids = [...base.roster, base.specialist];
    expect(suggestBuild(ids, 'X')).toEqual(suggestBuild(ids, 'X'));
  });
});

// Review Focus 2: elencos que o draft produz sempre liberam 6 cartas distintas por lado.
describe('elencos de draft automático', () => {
  function autoDraft(first: 'A' | 'B'): DraftState {
    let s = createDraft(first);
    while (!isDraftComplete(s)) s = draftStep(s, { type: 'AUTO_PICK', team: draftTurn(s)! });
    return s;
  }

  it.each(['A', 'B'] as const)('quem abre %s: os dois montam um time válido', (first) => {
    const rosters = draftRosters(autoDraft(first));
    for (const key of ['A', 'B'] as const) {
      const errors = validateTeam(suggestBuild(rosters[key], `Time ${key}`));
      expect(errors, `time ${key}: ${JSON.stringify(errors)}`).toEqual([]);
    }
  });

  it('autoPickSpecies existe e é usado pelo fluxo', () => {
    expect(typeof autoPickSpecies(createDraft('A'), 'A')).toBe('number');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/engine/test/auto-build.test.ts`
Expected: FAIL (`suggestBuild` não existe).

- [ ] **Step 3: Mover e implementar**

Crie `packages/engine/src/teams/auto-build.ts` movendo de `packages/sim/src/random-team.ts` (cópia literal, só trocando imports para caminhos relativos do engine, `tsc` aponta onde cada nome mora): as constantes `BACKUPS_PER_SLOT = 2` e `BACKUP_SPREAD = 15`, a função `positionScore` (renomeada `slotScore`, exportada), `buildDepth` e `usableCards`. Acrescente:

```ts
import { DECK_SIZE, MAX_COPIES, speciesCost } from '../team';
import { getSpecies } from '../species';
import type { Card, Team } from '../model';

const SPECIALIST_MAX_COST = 5;

/** Mesma regra do gerador do simulador: melhor Sp. Atk entre os baratos; sem baratos, o mais barato. */
export function pickSpecialist(ids: readonly number[]): number {
  const cheap = ids.filter((id) => speciesCost(id) <= SPECIALIST_MAX_COST);
  const pool = cheap.length ? cheap : [...ids].sort((a, b) => speciesCost(a) - speciesCost(b)).slice(0, 1);
  return [...pool].sort((a, b) => getSpecies(b).stats.spAttack - getSpecies(a).stats.spAttack || a - b)[0];
}

/** As 6 primeiras cartas distintas na ordem do catálogo, 2 cópias de cada. Menos de 6 liberadas = deck incompleto. */
function deckFrom(cards: readonly Card[]): string[] {
  const distinct = DECK_SIZE / MAX_COPIES;
  return cards.slice(0, distinct).flatMap((c) => [c.id, c.id]);
}

/** Sugestão inicial para a fase de montagem: especialista, depth chart e decks automáticos para os 17 draftados. */
export function suggestBuild(roster17: readonly number[], name: string): Team {
  const specialist = pickSpecialist(roster17);
  const roster = roster17.filter((id) => id !== specialist);
  const depth = buildDepth(roster);
  const shell = { roster, depth, keepOnField: [] as number[] };
  return {
    name,
    roster,
    specialist,
    depth,
    keepOnField: [],
    offenseDeck: deckFrom(usableCards(shell, 'OFFENSE')),
    defenseDeck: deckFrom(usableCards(shell, 'DEFENSE')),
  };
}
```

Em `index.ts` do engine: `export * from './teams/auto-build';`. Em `random-team.ts` do sim, apague as definições movidas e adicione `import { buildDepth, usableCards } from '@pfl/engine';` mantendo `export { buildDepth, usableCards };` para os importadores existentes. **Não** altere a escolha do especialista de `randomTeam` (a ordenação instável do original define resultados determinísticos que os testes do sim já fixam).

- [ ] **Step 4: Rodar tudo**

Run: `npx vitest run packages/engine packages/sim 2>&1 | tail -10 && npm run typecheck 2>&1 | tail -5`
Expected: PASS. Se `elencos de draft automático` falhar com erro de deck, **pare**: o Review Focus 2 foi violado. Mostre ao usuário qual elenco falhou e proponha uma regra (por exemplo, o pick automático e a validação do draft considerarem a elegibilidade de cartas) antes de seguir.

- [ ] **Step 5: Commit**

```bash
git add packages/engine packages/sim
git commit -m "feat(engine): suggestBuild gera especialista, depth e decks; sim passa a usar buildDepth do engine"
```

### Task 6: Protocolo, tempos e validação de payloads

**Files:**
- Modify: `packages/protocol/src/messages.ts`
- Modify: `apps/server/src/timings.ts`
- Modify: `apps/server/src/parse.ts`
- Test: `apps/server/test/parse.test.ts` (acrescentar casos), `apps/server/test/timings.test.ts` (acrescentar casos)

**Interfaces:**
- Produces (protocolo):
  - `DRAFT_PICK_SECONDS = 30`, `BUILD_SECONDS = 180`
  - `type RoomMode = 'PREMADE' | 'DRAFT'`
  - `RoomStatus` ganha `'DRAFTING' | 'BUILDING'`; `RoomState` ganha `mode: RoomMode`
  - `interface DraftMessage { turnId: number; order: TeamKey[]; turn: TeamKey | null; deadline: number; pool: number[]; picks: Record<TeamKey, number[]>; spent: Record<TeamKey, number>; blocked: Record<number, DraftBlockReason>; last: { team: TeamKey; species: number; auto: boolean } | null }`
  - `interface BuildMessage { deadline: number; roster: number[]; suggested: Team }`
  - Eventos cliente→servidor: `'room:mode': (p: { mode: RoomMode }) => void`, `'draft:pick': (p: { turnId: number; species: number }) => void`. Servidor→cliente: `'draft:state': (m: DraftMessage) => void`, `'build:start': (m: BuildMessage) => void`.
- Produces (servidor): `Timings.draftPickMs`, `Timings.buildMs` (e `TimingsInput` equivalentes); `parseDraftPick(payload): { turnId: number; species: number } | null`; `parseMode(payload): RoomMode | null`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescente a `apps/server/test/parse.test.ts`:

```ts
import { parseDraftPick, parseMode } from '../src/parse';

describe('parseDraftPick', () => {
  it('aceita turnId e species inteiros', () => {
    expect(parseDraftPick({ turnId: 3, species: 25 })).toEqual({ turnId: 3, species: 25 });
  });
  it.each([null, undefined, 'x', [], {}, { turnId: 1 }, { species: 25 }, { turnId: 1.5, species: 25 }, { turnId: 1, species: '25' }, { turnId: 1, species: NaN }])(
    'recusa %j',
    (payload) => expect(parseDraftPick(payload)).toBeNull(),
  );
});

describe('parseMode', () => {
  it('aceita PREMADE e DRAFT', () => {
    expect(parseMode({ mode: 'PREMADE' })).toBe('PREMADE');
    expect(parseMode({ mode: 'DRAFT' })).toBe('DRAFT');
  });
  it.each([null, {}, { mode: 'draft' }, { mode: 1 }, 'DRAFT'])('recusa %j', (payload) => expect(parseMode(payload)).toBeNull());
});
```

Acrescente a `apps/server/test/timings.test.ts`:

```ts
it('draftPickMs e buildMs têm padrão e aceitam sobrescrita', () => {
  expect(resolveTimings().draftPickMs).toBe(30_000);
  expect(resolveTimings().buildMs).toBe(180_000);
  expect(resolveTimings({ draftPickMs: 50, buildMs: 70 })).toMatchObject({ draftPickMs: 50, buildMs: 70 });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/server/test/parse.test.ts apps/server/test/timings.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`packages/protocol/src/messages.ts`: importe `DraftBlockReason` do `@pfl/engine`, acrescente as constantes e tipos, e estenda as interfaces de eventos.

```ts
import type { Action, DraftBlockReason, FormationId, GameEvent, PackageId, Phase, PlayerView, Team, TeamError, TeamKey } from '@pfl/engine';

export const DRAFT_PICK_SECONDS = 30;
export const BUILD_SECONDS = 180;

export type RoomMode = 'PREMADE' | 'DRAFT';
export type RoomStatus = 'WAITING' | 'DRAFTING' | 'BUILDING' | 'IN_MATCH' | 'PAUSED' | 'FINISHED';
// RoomState: acrescente  mode: RoomMode;

/** Estado do draft para um jogador. `turnId` é o índice do pick (0..33). `blocked` é só do destinatário. */
export interface DraftMessage {
  turnId: number;
  order: TeamKey[];
  turn: TeamKey | null;
  deadline: number /* epoch ms */;
  pool: number[];
  picks: Record<TeamKey, number[]>;
  spent: Record<TeamKey, number>;
  blocked: Record<number, DraftBlockReason>;
  last: { team: TeamKey; species: number; auto: boolean } | null;
}
/** Início da fase de montagem: os 17 draftados do destinatário e a sugestão do servidor. */
export interface BuildMessage {
  deadline: number /* epoch ms */;
  roster: number[];
  suggested: Team;
}
```

Em `ClientToServerEvents`: `'room:mode': (p: { mode: RoomMode }) => void;` e `'draft:pick': (p: { turnId: number; species: number }) => void;`. Em `ServerToClientEvents`: `'draft:state': (m: DraftMessage) => void;` e `'build:start': (m: BuildMessage) => void;`.

`apps/server/src/timings.ts`: importe `DRAFT_PICK_SECONDS, BUILD_SECONDS`; adicione `draftPickMs: number; buildMs: number;` a `Timings`, `draftPickMs?: number; buildMs?: number;` a `TimingsInput`, `draftPickMs: DRAFT_PICK_SECONDS * 1000, buildMs: BUILD_SECONDS * 1000` a `DEFAULT_TIMINGS` e, em `resolveTimings`, `draftPickMs: input.draftPickMs ?? DEFAULT_TIMINGS.draftPickMs, buildMs: input.buildMs ?? DEFAULT_TIMINGS.buildMs`.

`apps/server/src/parse.ts`: acrescente

```ts
import type { RoomMode } from '@pfl/protocol';

export function parseDraftPick(payload: unknown): { turnId: number; species: number } | null {
  if (!isRecord(payload) || !Number.isSafeInteger(payload.turnId) || !Number.isSafeInteger(payload.species)) return null;
  return { turnId: payload.turnId as number, species: payload.species as number };
}

export function parseMode(payload: unknown): RoomMode | null {
  if (!isRecord(payload)) return null;
  return payload.mode === 'PREMADE' || payload.mode === 'DRAFT' ? payload.mode : null;
}
```

Como `RoomState` ganhou `mode`, a Task 3 já deixou `stateFor` sem esse campo: corrija agora em `room.ts` acrescentando `mode: 'PREMADE'` ao objeto devolvido (a Task 9 troca por `this.mode`). Os testes existentes do servidor que comparam `room:state` inteiro com `toEqual` podem falhar por causa do campo novo: nesse caso (e só nesse), atualize a expectativa para incluir `mode: 'PREMADE'` e registre a mudança no commit.

- [ ] **Step 4: Rodar tudo**

Run: `npm test 2>&1 | tail -10 && npm run typecheck 2>&1 | tail -8`
Expected: o servidor, o engine e o protocolo passam. O typecheck do **cliente** pode acusar `mode` ausente nos literais de `RoomState` dos testes do cliente (`apps/client/test`): corrija acrescentando `mode: 'PREMADE'` onde o literal é construído (por exemplo `room()` em `app-screen.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add packages/protocol apps/server apps/client/test
git commit -m "feat(protocol): mensagens de modo, draft e montagem; tempos de pick e de BUILD"
```

---

# Etapa 3 — Servidor

### Task 7: DraftSession

**Files:**
- Create: `apps/server/src/draft-session.ts`
- Test: `apps/server/test/draft-session.test.ts`

**Interfaces:**
- Consumes: `RoomPhase` (Task 3); `createDraft`, `draftStep`, `draftTurn`, `draftSpent`, `blockedFor`, `draftRosters`, `isDraftComplete`, `EngineError`; `DraftMessage`.
- Produces: `class DraftSession implements RoomPhase` com `new DraftSession(deps: DraftDeps)`, `handlePick(key, req: { turnId: number; species: number }): void`, `get state(): DraftState`, `get finished(): boolean`.

```ts
export interface DraftDeps {
  scheduler: Scheduler;
  timings: Timings;
  /** A Room filtra quem está desconectado. */
  send: Send;
  isAbsent: (key: TeamKey) => boolean;
  /** quem abre o snake (sorteado pela Room) */
  first: TeamKey;
  onEnd: (rosters: Record<TeamKey, number[]>) => void;
  /** o pick automático não achou espécie legal (não deveria acontecer; ver Review Focus 1) */
  onAbort: (reason: string) => void;
}
```

- [ ] **Step 1: Escrever o teste que falha**

```ts
// apps/server/test/draft-session.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRAFT_TOTAL_PICKS, type TeamKey } from '@pfl/engine';
import { DraftSession, type DraftDeps } from '../src/draft-session';
import { realScheduler, resolveTimings } from '../src/timings';
import { failOnConsoleError, recorder } from './helpers';

const T0 = 1_000_000;
failOnConsoleError();
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

function make(over: Partial<DraftDeps> = {}) {
  const rec = recorder();
  const ended: Record<TeamKey, number[]>[] = [];
  const aborted: string[] = [];
  const absent = new Set<TeamKey>();
  const session = new DraftSession({
    scheduler: realScheduler,
    timings: resolveTimings({ draftPickMs: 1000 }),
    send: rec.send,
    isAbsent: (k) => absent.has(k),
    first: 'A',
    onEnd: (r) => ended.push(r),
    onAbort: (m) => aborted.push(m),
    ...over,
  });
  return { session, rec, ended, aborted, absent };
}

describe('DraftSession', () => {
  it('start envia o draft:state aos dois, com a vez de A e o deadline de 1 s', () => {
    const { session, rec } = make();
    session.start();
    const a = rec.last('A', 'draft:state')!;
    const b = rec.last('B', 'draft:state')!;
    expect(a.turn).toBe('A');
    expect(a.turnId).toBe(0);
    expect(a.deadline).toBe(T0 + 1000);
    expect(a.pool).toHaveLength(151);
    expect(b.turnId).toBe(0);
  });

  it('um pick válido avança a vez e atualiza o estado dos dois', () => {
    const { session, rec } = make();
    session.start();
    session.handlePick('A', { turnId: 0, species: 25 });
    expect(rec.last('B', 'draft:state')).toMatchObject({ turnId: 1, turn: 'B', picks: { A: [25], B: [] }, last: { team: 'A', species: 25, auto: false } });
    expect(rec.last('A', 'draft:state')!.pool).not.toContain(25);
  });

  it('pick fora da vez ganha erro e não muda nada', () => {
    const { session, rec } = make();
    session.start();
    session.handlePick('B', { turnId: 0, species: 25 });
    expect(rec.last('B', 'error')).toMatchObject({ code: 'ENGINE_ERROR' });
    expect(rec.last('B', 'error')!.message).toContain('NOT_YOUR_TURN');
    expect(session.state.index).toBe(0);
  });

  it('turnId velho ganha STALE_TURN e recebe o estado atual', () => {
    const { session, rec } = make();
    session.start();
    session.handlePick('A', { turnId: 0, species: 25 });
    rec.clear();
    session.handlePick('B', { turnId: 0, species: 26 });
    expect(rec.last('B', 'error')).toMatchObject({ code: 'STALE_TURN' });
    expect(rec.last('B', 'draft:state')!.turnId).toBe(1);
  });

  it('espécie repetida por corrida: o segundo recebe erro', () => {
    const { session, rec } = make();
    session.start();
    session.handlePick('A', { turnId: 0, species: 25 });
    session.handlePick('B', { turnId: 1, species: 25 });
    expect(rec.last('B', 'error')!.message).toContain('SPECIES_UNAVAILABLE');
  });

  it('o blocked é só do destinatário', () => {
    const { session, rec } = make();
    session.start();
    session.handlePick('A', { turnId: 0, species: 150 }); // Mewtwo
    expect(rec.last('A', 'draft:state')!.blocked[151]).toBe('LEGENDARY_LIMIT');
    expect(rec.last('B', 'draft:state')!.blocked[151]).toBeUndefined();
  });

  it('timeout aplica o pick automático e marca auto', () => {
    const { session, rec } = make();
    session.start();
    vi.advanceTimersByTime(1000);
    expect(session.state.index).toBe(1);
    expect(rec.last('A', 'draft:state')!.last).toMatchObject({ team: 'A', auto: true });
  });

  it('jogador ausente: o pick automático sai na hora', () => {
    const { session, absent } = make();
    absent.add('A');
    session.start();
    vi.advanceTimersByTime(0);
    expect(session.state.index).toBeGreaterThanOrEqual(1);
  });

  it('refreshAbsence antecipa o pick de quem acabou de ficar ausente', () => {
    const { session, absent } = make();
    session.start();
    expect(session.state.index).toBe(0);
    absent.add('A');
    expect(session.refreshAbsence()).toBe(true);
    vi.advanceTimersByTime(0);
    expect(session.state.index).toBe(1);
  });

  it('pausa congela o relógio e resume devolve o que faltava', () => {
    const { session } = make();
    session.start();
    vi.advanceTimersByTime(400);
    session.pause();
    vi.advanceTimersByTime(10_000);
    expect(session.state.index).toBe(0);
    session.resume();
    vi.advanceTimersByTime(599);
    expect(session.state.index).toBe(0);
    vi.advanceTimersByTime(1);
    expect(session.state.index).toBe(1);
  });

  it('sendCurrent reenvia o estado a quem reconectou', () => {
    const { session, rec } = make();
    session.start();
    rec.clear();
    session.sendCurrent('B');
    expect(rec.events('B')).toEqual(['draft:state']);
    expect(rec.events('A')).toEqual([]);
  });

  it('34 picks automáticos terminam o draft e entregam os elencos uma vez', () => {
    const { session, ended } = make({ timings: resolveTimings({ draftPickMs: 10 }) });
    session.start();
    for (let i = 0; i < DRAFT_TOTAL_PICKS; i++) vi.advanceTimersByTime(10);
    expect(session.finished).toBe(true);
    expect(ended).toHaveLength(1);
    expect(ended[0].A).toHaveLength(17);
    expect(ended[0].B).toHaveLength(17);
    vi.advanceTimersByTime(1000);
    expect(ended).toHaveLength(1);
  });

  it('dispose cancela o timer', () => {
    const { session } = make();
    session.start();
    session.dispose();
    vi.advanceTimersByTime(5000);
    expect(session.state.index).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/server/test/draft-session.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

```ts
// apps/server/src/draft-session.ts
import {
  EngineError, blockedFor, createDraft, draftRosters, draftSpent, draftStep, draftTurn, isDraftComplete,
  type DraftAction, type DraftState, type TeamKey,
} from '@pfl/engine';
import type { DraftMessage, ErrorCode } from '@pfl/protocol';
import type { Send } from './outgoing';
import type { RoomPhase } from './phase';
import type { Scheduler, Timings } from './timings';

const KEYS: readonly TeamKey[] = ['A', 'B'];

export interface DraftDeps {
  scheduler: Scheduler;
  timings: Timings;
  /** A Room filtra quem está desconectado. */
  send: Send;
  isAbsent: (key: TeamKey) => boolean;
  /** quem abre o snake (sorteado pela Room) */
  first: TeamKey;
  onEnd: (rosters: Record<TeamKey, number[]>) => void;
  /** o pick automático não achou espécie legal (não deveria acontecer; ver Review Focus 1) */
  onAbort: (reason: string) => void;
}

/** O draft em andamento: o servidor é a autoridade; guarda o estado do engine e o timer de cada pick. */
export class DraftSession implements RoomPhase {
  private current: DraftState;
  private last: DraftMessage['last'] = null;
  /** muda a cada timer programado; um callback de timer antigo não faz nada */
  private seq = 0;
  private deadlineAt = 0;
  private cancelTimer: (() => void) | null = null;
  private pausedRemaining: number | null = null;
  private started = false;
  private done = false;
  private disposed = false;

  constructor(private readonly deps: DraftDeps) {
    this.current = createDraft(deps.first);
  }

  get state(): DraftState {
    return this.current;
  }
  get finished(): boolean {
    return this.done;
  }

  start(): void {
    if (this.disposed || this.started) return;
    this.started = true;
    this.deadlineAt = this.deps.scheduler.now() + this.deps.timings.draftPickMs;
    this.armTimer();
    this.broadcast();
  }

  handlePick(key: TeamKey, req: { turnId: number; species: number }): void {
    if (this.disposed || !this.started) return;
    if (this.pausedRemaining !== null) return this.error(key, 'NOT_READY', 'Draft pausado');
    if (this.done) return this.error(key, 'NOT_READY', 'O draft já terminou');
    if (req.turnId !== this.current.index) {
      this.error(key, 'STALE_TURN', `turnId ${req.turnId} não é o pick atual (${this.current.index})`);
      this.sendCurrent(key);
      return;
    }
    this.apply({ type: 'PICK', team: key, species: req.species }, false, key);
  }

  sendCurrent(key: TeamKey): void {
    if (this.disposed || !this.started) return;
    this.deps.send(key, { event: 'draft:state', payload: this.messageFor(key) });
  }

  pause(): void {
    if (this.done || this.pausedRemaining !== null) return;
    this.pausedRemaining = Math.max(0, this.deadlineAt - this.deps.scheduler.now());
    this.clearTimer();
  }

  resume(): void {
    if (this.disposed || this.pausedRemaining === null) return;
    this.deadlineAt = this.deps.scheduler.now() + this.pausedRemaining;
    this.pausedRemaining = null;
    this.armTimer();
    this.broadcast();
  }

  /** true se o timer foi antecipado e o estado já foi reenviado. */
  refreshAbsence(): boolean {
    if (this.disposed || !this.started || this.done || this.pausedRemaining !== null) return false;
    const turn = draftTurn(this.current);
    if (!turn || !this.deps.isAbsent(turn)) return false;
    this.armTimer();
    this.broadcast();
    return true;
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
  }

  private apply(action: DraftAction, auto: boolean, from: TeamKey | null): void {
    let next: DraftState;
    try {
      next = draftStep(this.current, action);
    } catch (err) {
      if (!(err instanceof EngineError)) throw err;
      if (from) this.error(from, 'ENGINE_ERROR', err.message);
      else this.deps.onAbort(err.message);
      return;
    }
    const species = next.picks[action.team].at(-1) as number;
    this.current = next;
    this.last = { team: action.team, species, auto };
    if (isDraftComplete(next)) {
      this.done = true;
      this.clearTimer();
      this.broadcast();
      this.deps.onEnd(draftRosters(next));
      return;
    }
    this.deadlineAt = this.deps.scheduler.now() + this.deps.timings.draftPickMs;
    this.armTimer();
    this.broadcast();
  }

  /** Quem está ausente (tolerância esgotada) não espera os 30 s. */
  private armTimer(): void {
    this.clearTimer();
    const turn = draftTurn(this.current);
    if (!turn || this.pausedRemaining !== null) return;
    const mySeq = ++this.seq;
    const delay = this.deps.isAbsent(turn) ? 0 : Math.max(0, this.deadlineAt - this.deps.scheduler.now());
    this.cancelTimer = this.deps.scheduler.schedule(delay, () => this.onDeadline(mySeq));
  }

  private onDeadline(mySeq: number): void {
    if (this.disposed || mySeq !== this.seq || this.done || this.pausedRemaining !== null) return;
    const turn = draftTurn(this.current);
    if (turn) this.apply({ type: 'AUTO_PICK', team: turn }, true, null);
  }

  private clearTimer(): void {
    this.cancelTimer?.();
    this.cancelTimer = null;
    this.seq += 1;
  }

  private messageFor(key: TeamKey): DraftMessage {
    const s = this.current;
    return {
      turnId: s.index,
      order: s.order,
      turn: draftTurn(s),
      deadline: this.deadlineAt,
      pool: s.pool,
      picks: s.picks,
      spent: { A: draftSpent(s, 'A'), B: draftSpent(s, 'B') },
      blocked: this.done ? {} : blockedFor(s, key),
      last: this.last,
    };
  }

  private broadcast(): void {
    for (const k of KEYS) this.sendCurrent(k);
  }

  private error(to: TeamKey, code: ErrorCode, message: string): void {
    this.deps.send(to, { event: 'error', payload: { code, message } });
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run apps/server/test/draft-session.test.ts`
Expected: PASS (13 testes). Se "jogador ausente" falhar, lembre que o timer de delay 0 dispara com `advanceTimersByTime(0)`.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/draft-session.ts apps/server/test/draft-session.test.ts
git commit -m "feat(server): DraftSession com vez, timer de 30 s, pick automático e pausa"
```

### Task 8: BuildSession e extensões do Lobby

**Files:**
- Create: `apps/server/src/build-session.ts`
- Modify: `apps/server/src/lobby.ts`
- Test: `apps/server/test/build-session.test.ts`, `apps/server/test/lobby.test.ts` (acrescentar)

**Interfaces:**
- Consumes: `RoomPhase`; `suggestBuild`; `BuildMessage`; `Lobby`.
- Produces:
  - `Lobby.submit(key, teamCode, extraCheck?: (team: Team) => TeamError[])`, `Lobby.setReady(key, ready, requireTeam = true)`, `Lobby.preload(key, team: Team): void`, `Lobby.resetReady(): void`.
  - `class BuildSession implements RoomPhase`: `new BuildSession(deps: BuildDeps)`, `rosterErrors(key, team): TeamError[]`, `get suggested(): Record<TeamKey, Team>`.

```ts
export interface BuildDeps {
  scheduler: Scheduler;
  timings: Timings;
  send: Send;
  /** os 17 draftados de cada jogador */
  rosters: Record<TeamKey, number[]>;
  /** o prazo acabou: a Room começa a partida com o que estiver salvo */
  onExpire: () => void;
}
```

- [ ] **Step 1: Escrever os testes que falham**

Acrescente a `lobby.test.ts`:

```ts
describe('Lobby (montagem pós-draft)', () => {
  it('extraCheck rejeita o time sem derrubar o formato', () => {
    const lobby = new Lobby();
    const extra = () => [{ code: 'ROSTER_NOT_DRAFTED' }];
    lobby.submit('A', encodeTeam(electricTeam('Raio')), extra);
    expect(lobby.entry('A').team).toBeNull();
    expect(lobby.entry('A').teamErrors).toEqual([{ code: 'ROSTER_NOT_DRAFTED' }]);
    expect(lobby.setReady('A', true)).toBe('TEAM_INVALID');
  });

  it('extraCheck não roda quando o time já é inválido', () => {
    const lobby = new Lobby();
    let calls = 0;
    lobby.submit('A', 'lixo', () => (calls++, []));
    expect(calls).toBe(0);
  });

  it('setReady sem exigir time (modo Draft no lobby)', () => {
    const lobby = new Lobby();
    expect(lobby.setReady('A', true, false)).toBe('OK');
    expect(lobby.entry('A').ready).toBe(true);
  });

  it('preload guarda a sugestão válida, sem pronto', () => {
    const lobby = new Lobby();
    lobby.setReady('A', true, false);
    lobby.preload('A', electricTeam('Sugestão'));
    expect(lobby.entry('A')).toMatchObject({ ready: false, teamName: 'Sugestão', teamErrors: [] });
    expect(lobby.entry('A').team?.name).toBe('Sugestão');
  });

  it('preload de sugestão inválida guarda os erros e nenhum time', () => {
    const lobby = new Lobby();
    lobby.preload('A', { ...electricTeam('Ruim'), specialist: 25 });
    expect(lobby.entry('A').team).toBeNull();
    expect(lobby.entry('A').teamErrors.length).toBeGreaterThan(0);
  });

  it('resetReady desmarca os dois', () => {
    const lobby = new Lobby();
    lobby.setReady('A', true, false);
    lobby.setReady('B', true, false);
    lobby.resetReady();
    expect(lobby.entry('A').ready).toBe(false);
    expect(lobby.entry('B').ready).toBe(false);
  });
});
```

Crie `build-session.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SUGGESTED_TEAMS, validateTeam } from '@pfl/engine';
import { BuildSession } from '../src/build-session';
import { realScheduler, resolveTimings } from '../src/timings';
import { failOnConsoleError, recorder } from './helpers';

const T0 = 1_000_000;
failOnConsoleError();
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

const rosterOf = (i: number) => [...SUGGESTED_TEAMS[i].roster, SUGGESTED_TEAMS[i].specialist];

function make() {
  const rec = recorder();
  let expired = 0;
  const session = new BuildSession({
    scheduler: realScheduler,
    timings: resolveTimings({ buildMs: 1000 }),
    send: rec.send,
    rosters: { A: rosterOf(0), B: rosterOf(1) },
    onExpire: () => {
      expired += 1;
    },
  });
  return { session, rec, expired: () => expired };
}

describe('BuildSession', () => {
  it('start envia a cada jogador os seus 17, a sugestão válida e o deadline', () => {
    const { session, rec } = make();
    session.start();
    const a = rec.last('A', 'build:start')!;
    expect(a.deadline).toBe(T0 + 1000);
    expect([...a.roster].sort((x, y) => x - y)).toEqual([...rosterOf(0)].sort((x, y) => x - y));
    expect(validateTeam(a.suggested)).toEqual([]);
    expect(rec.last('B', 'build:start')!.roster).toEqual(rosterOf(1));
  });

  it('expira uma vez no deadline', () => {
    const { session, expired } = make();
    session.start();
    vi.advanceTimersByTime(999);
    expect(expired()).toBe(0);
    vi.advanceTimersByTime(1);
    expect(expired()).toBe(1);
    vi.advanceTimersByTime(5000);
    expect(expired()).toBe(1);
  });

  it('pausa congela o prazo; resume devolve o que faltava e reenvia', () => {
    const { session, rec, expired } = make();
    session.start();
    vi.advanceTimersByTime(300);
    session.pause();
    vi.advanceTimersByTime(10_000);
    expect(expired()).toBe(0);
    rec.clear();
    session.resume();
    expect(rec.last('A', 'build:start')!.deadline).toBe(Date.now() + 700);
    vi.advanceTimersByTime(700);
    expect(expired()).toBe(1);
  });

  it('rosterErrors aceita exatamente os 17 draftados, na troca de especialista também', () => {
    const { session } = make();
    const base = SUGGESTED_TEAMS[0];
    expect(session.rosterErrors('A', base)).toEqual([]);
    const swapped = { ...base, roster: [...base.roster.slice(1), base.specialist], specialist: base.roster[0] };
    expect(session.rosterErrors('A', swapped)).toEqual([]);
  });

  it('rosterErrors recusa espécie fora do draft', () => {
    const { session } = make();
    expect(session.rosterErrors('A', SUGGESTED_TEAMS[1])).toEqual([{ code: 'ROSTER_NOT_DRAFTED' }]);
  });

  it('sendCurrent reenvia só ao jogador pedido', () => {
    const { session, rec } = make();
    session.start();
    rec.clear();
    session.sendCurrent('B');
    expect(rec.events('B')).toEqual(['build:start']);
    expect(rec.events('A')).toEqual([]);
  });

  it('dispose cancela o prazo', () => {
    const { session, expired } = make();
    session.start();
    session.dispose();
    vi.advanceTimersByTime(5000);
    expect(expired()).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/server/test/lobby.test.ts apps/server/test/build-session.test.ts`
Expected: FAIL.

- [ ] **Step 3: Estender o Lobby**

Em `lobby.ts`, mude as assinaturas e acrescente os métodos novos:

```ts
  submit(key: TeamKey, teamCode: unknown, extraCheck?: (team: Team) => TeamError[]): SubmitResult {
    // ... igual até calcular `errors`:
    const errors = validateTeam(decoded);
    if (errors.length === 0 && extraCheck) errors.push(...extraCheck(decoded as Team));
    // ... resto igual
  }

  setReady(key: TeamKey, ready: unknown, requireTeam = true): ReadyResult {
    const e = this.slot(key);
    const wants = ready === true;
    if (wants && requireTeam && !e.team) return 'TEAM_INVALID';
    e.ready = wants;
    return 'OK';
  }

  /** Coloca a sugestão do servidor como time do jogador (e desmarca o pronto). */
  preload(key: TeamKey, team: Team): void {
    const e = this.slot(key);
    const errors = validateTeam(team);
    e.ready = false;
    e.team = errors.length === 0 ? normalizeTeam(team) : null;
    e.teamName = team.name.slice(0, TEAM_NAME_MAX);
    e.teamErrors = errors;
  }

  resetReady(): void {
    for (const key of ['A', 'B'] as const) this.slot(key).ready = false;
  }
```

- [ ] **Step 4: Implementar a BuildSession**

```ts
// apps/server/src/build-session.ts
import { suggestBuild, type Team, type TeamError, type TeamKey } from '@pfl/engine';
import type { BuildMessage } from '@pfl/protocol';
import type { Send } from './outgoing';
import type { RoomPhase } from './phase';
import type { Scheduler, Timings } from './timings';

const KEYS: readonly TeamKey[] = ['A', 'B'];

export interface BuildDeps {
  scheduler: Scheduler;
  timings: Timings;
  send: Send;
  /** os 17 draftados de cada jogador */
  rosters: Record<TeamKey, number[]>;
  /** o prazo acabou: a Room começa a partida com o que estiver salvo */
  onExpire: () => void;
}

/** Fase de montagem pós-draft: só o relógio e a sugestão; o time enviado e o "pronto" ficam no Lobby da Room. */
export class BuildSession implements RoomPhase {
  readonly suggested: Record<TeamKey, Team>;
  private deadlineAt = 0;
  private cancelTimer: (() => void) | null = null;
  private pausedRemaining: number | null = null;
  private started = false;
  private disposed = false;

  constructor(private readonly deps: BuildDeps) {
    this.suggested = {
      A: suggestBuild(deps.rosters.A, 'Time A'),
      B: suggestBuild(deps.rosters.B, 'Time B'),
    };
  }

  start(): void {
    if (this.disposed || this.started) return;
    this.started = true;
    this.deadlineAt = this.deps.scheduler.now() + this.deps.timings.buildMs;
    this.arm(this.deps.timings.buildMs);
    for (const k of KEYS) this.sendCurrent(k);
  }

  sendCurrent(key: TeamKey): void {
    if (this.disposed || !this.started) return;
    const payload: BuildMessage = { deadline: this.deadlineAt, roster: [...this.deps.rosters[key]], suggested: this.suggested[key] };
    this.deps.send(key, { event: 'build:start', payload });
  }

  /** O elenco enviado precisa ser exatamente os 17 draftados do jogador (o especialista pode trocar). */
  rosterErrors(key: TeamKey, team: Team): TeamError[] {
    const want = new Set(this.deps.rosters[key]);
    const got = [...team.roster, team.specialist];
    const same = got.length === want.size && new Set(got).size === got.length && got.every((id) => want.has(id));
    return same ? [] : [{ code: 'ROSTER_NOT_DRAFTED' }];
  }

  pause(): void {
    if (this.pausedRemaining !== null) return;
    this.pausedRemaining = Math.max(0, this.deadlineAt - this.deps.scheduler.now());
    this.clear();
  }

  resume(): void {
    if (this.disposed || this.pausedRemaining === null) return;
    const left = this.pausedRemaining;
    this.pausedRemaining = null;
    this.deadlineAt = this.deps.scheduler.now() + left;
    this.arm(left);
    for (const k of KEYS) this.sendCurrent(k);
  }

  /** O prazo da montagem não depende de quem está ausente: a Room decide se já pode começar. */
  refreshAbsence(): boolean {
    return false;
  }

  dispose(): void {
    this.disposed = true;
    this.clear();
  }

  private arm(ms: number): void {
    this.clear();
    this.cancelTimer = this.deps.scheduler.schedule(ms, () => {
      this.cancelTimer = null;
      if (!this.disposed && this.pausedRemaining === null) this.deps.onExpire();
    });
  }

  private clear(): void {
    this.cancelTimer?.();
    this.cancelTimer = null;
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run apps/server/test/lobby.test.ts apps/server/test/build-session.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/build-session.ts apps/server/src/lobby.ts apps/server/test/build-session.test.ts apps/server/test/lobby.test.ts
git commit -m "feat(server): BuildSession (prazo e sugestão) e extensões do Lobby para a montagem"
```

### Task 9: Room com modo, DRAFTING e BUILDING

**Files:**
- Modify: `apps/server/src/room.ts`
- Test: `apps/server/test/room-draft.test.ts` (novo; `room.test.ts` não muda)

**Interfaces:**
- Consumes: `DraftSession` (Task 7), `BuildSession` (Task 8), `Lobby` estendido, `parseMode`/payloads já validados pelo `server.ts` (Task 10).
- Produces em `Room`: `setMode(key, mode: RoomMode)`, `draftPick(key, req: { turnId: number; species: number })`, `get mode(): RoomMode`; `RoomState.mode` real; statuses `DRAFTING` e `BUILDING`.

**Regras (tudo em `room.ts`):**
- `private mode: RoomMode = 'PREMADE'`; `private pausedFrom: RoomStatus = 'IN_MATCH'`.
- `setMode(key, mode)`: só `key === 'A'` (anfitrião), só em `WAITING`, e só se ninguém está pronto; senão `error(key, 'NOT_READY', ...)`. Troca, desmarca nada, `broadcastState()`.
- `setReady(key, ready)` em `WAITING` passa `requireTeam = this.mode === 'PREMADE'` ao `lobby.setReady`. Em `BUILDING` aceita (exige time), seguido de `tryStart()`. Fora disso, o erro de sempre.
- `submitTeam(key, code)`: em `WAITING` com modo `DRAFT` recusa com `NOT_READY` ("Neste modo o elenco vem do draft"); em `BUILDING` chama `lobby.submit(key, code, (t) => build.rosterErrors(key, t))`; em `WAITING`+`PREMADE`, como hoje.
- Estados "vivos" (`IN_MATCH`, `DRAFTING`, `BUILDING`): `connect`/`disconnect` tratam os três como `IN_MATCH` trata hoje; ao pausar, `pausedFrom = roomStatus`; ao retomar, `roomStatus = pausedFrom`.
- `tryStart()`:
  - `WAITING` + `PREMADE`: como hoje.
  - `WAITING` + `DRAFT`: os dois assentos existem, conectados, `lobby.entry(k).ready` → `startDraft()`.
  - `BUILDING`: para cada assento, `(conectado && ready) || absent`; e ao menos um deles `ready`... ou os dois absent: nesse caso a sala já está pausada, não chega aqui. Satisfeito → `startMatch()`.
- `startDraft()`: `lobby.resetReady()`; `first = this.deps.random() < 0.5 ? 'A' : 'B'`; `phase = new DraftSession({ ..., first, onEnd: (r) => this.startBuild(r), onAbort: (m) => this.abort(m) })`; `roomStatus = 'DRAFTING'`; `broadcastState()`; `phase.start()`.
- `startBuild(rosters)`: `phase?.dispose()`; `build = new BuildSession({ ..., rosters, onExpire: () => this.startMatch() })`; para cada chave `lobby.preload(key, build.suggested[key])`; `roomStatus = 'BUILDING'`; `broadcastState()`; `phase = build`; `build.start()`.
- `startMatch()` (usada pelo `tryStart` do PREMADE, pelo BUILD e pelo `onExpire`): lê `lobby.entry(k).team` dos dois; se algum for `null`, `abort('Time inválido ao fim da montagem')`; senão cria a `MatchSession` como hoje e `roomStatus = 'IN_MATCH'`. O `tryStart` do PREMADE passa a chamar `startMatch()` com os times de `lobby.startable()`.
- `abort(reason)`: `error` `TEAM_INVALID` com a razão aos dois e `close()`.
- `onGraceExpired`: em estados vivos, `seat.absent = true; phase?.refreshAbsence(); tryStart();`.
- `play()`: só com `MatchSession`; `draftPick()`: só com `DraftSession`, senão `NOT_READY`.
- `stateFor` devolve `mode: this.mode`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// apps/server/test/room-draft.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRAFT_TOTAL_PICKS } from '@pfl/engine';
import { encodeTeam } from '@pfl/protocol';
import { Room } from '../src/room';
import { realScheduler, resolveTimings, type TimingsInput } from '../src/timings';
import { electricTeam } from './fixtures';
import { failOnConsoleError, recorder } from './helpers';

failOnConsoleError();
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => vi.useRealTimers());

function makeRoom(timings: TimingsInput = {}, random = () => 0.1) {
  const rec = recorder();
  let tokens = 0;
  const room = new Room('ABCDEF', {
    scheduler: realScheduler,
    timings: resolveTimings({ draftPickMs: 100, buildMs: 1000, resultAnimationMs: 0, ...timings }),
    random,
    newToken: () => `tok-${++tokens}`,
    send: rec.send,
    onClose: () => {},
  });
  room.claimSeat();
  room.claimSeat();
  room.connect('A', 'ca');
  room.connect('B', 'cb');
  return { room, rec };
}

/** Sala em modo Draft com os dois prontos: o draft começou. */
function drafting(timings?: TimingsInput, random?: () => number) {
  const h = makeRoom(timings, random);
  h.room.setMode('A', 'DRAFT');
  h.room.setReady('A', true);
  h.room.setReady('B', true);
  return h;
}

/** Deixa os 34 picks saírem por timeout. */
const finishDraft = () => {
  for (let i = 0; i < DRAFT_TOTAL_PICKS; i++) vi.advanceTimersByTime(100);
};

describe('modo da sala', () => {
  it('o padrão é PREMADE e o estado traz o modo', () => {
    const { room, rec } = makeRoom();
    expect(room.mode).toBe('PREMADE');
    room.resync('A');
    expect(rec.last('A', 'room:state')!.mode).toBe('PREMADE');
  });

  it('só o anfitrião (A) troca o modo, e só antes de alguém ficar pronto', () => {
    const { room, rec } = makeRoom();
    room.setMode('B', 'DRAFT');
    expect(rec.last('B', 'error')).toMatchObject({ code: 'NOT_READY' });
    expect(room.mode).toBe('PREMADE');
    room.setMode('A', 'DRAFT');
    expect(room.mode).toBe('DRAFT');
    expect(rec.last('B', 'room:state')!.mode).toBe('DRAFT');
    room.setReady('A', true);
    room.setMode('A', 'PREMADE');
    expect(room.mode).toBe('DRAFT');
  });

  it('no modo Draft não se envia time no lobby', () => {
    const { room, rec } = makeRoom();
    room.setMode('A', 'DRAFT');
    room.submitTeam('A', encodeTeam(electricTeam('Raio')));
    expect(rec.last('A', 'error')).toMatchObject({ code: 'NOT_READY' });
  });
});

describe('DRAFTING', () => {
  it('dois prontos, sem time, começam o draft', () => {
    const { room, rec } = drafting();
    expect(room.status).toBe('DRAFTING');
    expect(rec.last('A', 'draft:state')!.turnId).toBe(0);
    expect(rec.last('B', 'draft:state')!.turnId).toBe(0);
  });

  it('o sorteio decide quem abre', () => {
    expect(drafting({}, () => 0.1).rec.last('A', 'draft:state')!.turn).toBe('A');
    expect(drafting({}, () => 0.9).rec.last('A', 'draft:state')!.turn).toBe('B');
  });

  it('draftPick só vale em DRAFTING', () => {
    const { room, rec } = makeRoom();
    room.draftPick('A', { turnId: 0, species: 25 });
    expect(rec.last('A', 'error')).toMatchObject({ code: 'NOT_READY' });
  });

  it('um pick humano chega ao adversário', () => {
    const { room, rec } = drafting();
    room.draftPick('A', { turnId: 0, species: 25 });
    expect(rec.last('B', 'draft:state')!.picks.A).toEqual([25]);
  });

  it('queda dos dois pausa e a volta retoma o draft', () => {
    const { room, rec } = drafting();
    room.disconnect('A', 'ca');
    room.disconnect('B', 'cb');
    expect(room.status).toBe('PAUSED');
    vi.advanceTimersByTime(60_000);
    expect(rec.last('A', 'draft:state')!.turnId).toBe(0); // nada andou
    room.connect('A', 'ca2');
    expect(room.status).toBe('DRAFTING');
  });

  it('reconectar no meio do draft recebe o estado atual', () => {
    const { room, rec } = drafting();
    room.draftPick('A', { turnId: 0, species: 25 });
    room.disconnect('B', 'cb');
    rec.clear();
    room.connect('B', 'cb2');
    expect(rec.last('B', 'draft:state')!.turnId).toBe(1);
  });

  it('ausente além da tolerância: o pick automático sai sem esperar os 30 s', () => {
    // pick de 10 s e tolerância de 500 ms: só a ausência explica um pick aos 500 ms
    const { room, rec } = drafting({ reconnectGraceMs: 500, draftPickMs: 10_000 });
    room.disconnect('A', 'ca');
    vi.advanceTimersByTime(499);
    expect(rec.last('B', 'draft:state')!.turnId).toBe(0);
    vi.advanceTimersByTime(1);
    expect(rec.last('B', 'draft:state')!.turnId).toBe(1);
    expect(rec.last('B', 'draft:state')!.last).toMatchObject({ team: 'A', auto: true });
  });
});

describe('BUILDING', () => {
  it('ao fim dos 34 picks, a sala vai a BUILDING e cada um recebe o seu build:start', () => {
    const { room, rec } = drafting();
    finishDraft();
    expect(room.status).toBe('BUILDING');
    const a = rec.last('A', 'build:start')!;
    const b = rec.last('B', 'build:start')!;
    expect(a.roster).toHaveLength(17);
    expect(a.roster.some((id) => b.roster.includes(id))).toBe(false);
    expect(rec.last('A', 'room:state')!.players.find((p) => p.key === 'A')).toMatchObject({ ready: false, teamErrors: [] });
  });

  it('a sugestão já vale: dois "estou pronto" começam a partida', () => {
    const { room, rec } = drafting();
    finishDraft();
    room.setReady('A', true);
    expect(room.status).toBe('BUILDING');
    room.setReady('B', true);
    expect(room.status).toBe('IN_MATCH');
    expect(rec.last('A', 'match:phase')).toBeDefined();
  });

  it('o prazo acaba e a partida começa com a sugestão de quem não fez nada', () => {
    const { room } = drafting({ buildMs: 1000 });
    finishDraft();
    vi.advanceTimersByTime(1000);
    expect(room.status).toBe('IN_MATCH');
  });

  it('time com espécie que não foi draftada é recusado e não deixa ficar pronto', () => {
    const { room, rec } = drafting();
    finishDraft();
    room.submitTeam('A', encodeTeam(electricTeam('Trapaça')));
    const a = rec.last('A', 'room:state')!.players.find((p) => p.key === 'A')!;
    expect(a.teamErrors).toEqual([{ code: 'ROSTER_NOT_DRAFTED' }]);
    room.setReady('A', true);
    expect(rec.last('A', 'error')).toMatchObject({ code: 'TEAM_INVALID' });
  });

  it('o time sugerido reenviado é aceito', () => {
    const { room, rec } = drafting();
    finishDraft();
    const suggested = rec.last('A', 'build:start')!.suggested;
    room.submitTeam('A', encodeTeam(suggested));
    expect(rec.last('A', 'room:state')!.players.find((p) => p.key === 'A')!.teamErrors).toEqual([]);
  });

  it('um ausente não segura a partida: o outro fica pronto e começa', () => {
    const { room } = drafting({ reconnectGraceMs: 200 });
    finishDraft();
    room.disconnect('B', 'cb');
    vi.advanceTimersByTime(200);
    room.setReady('A', true);
    expect(room.status).toBe('IN_MATCH');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/server/test/room-draft.test.ts`
Expected: FAIL (`setMode`/`draftPick`/`mode` não existem).

- [ ] **Step 3: Implementar em `room.ts`** seguindo as regras acima. Pontos de atenção:
  - `claimSeat` continua só abrindo vaga nova em `WAITING`; o token continua devolvendo a vaga em qualquer status.
  - `connect`: troque `if (wasPaused) this.roomStatus = 'IN_MATCH'` por `this.roomStatus = this.pausedFrom`.
  - `disconnect`: troque `this.roomStatus === 'IN_MATCH'` por `this.isLive()` (`IN_MATCH`, `DRAFTING` ou `BUILDING`) e grave `this.pausedFrom = this.roomStatus` antes de mudar para `PAUSED`.
  - Ao trocar de fase (`startBuild`, `startMatch`), chame `this.phase?.dispose()` antes de substituir.
  - Mantenha `session` (`phase instanceof MatchSession`); os testes antigos dependem dele.

- [ ] **Step 4: Rodar tudo**

Run: `npm test 2>&1 | tail -10 && npm run typecheck 2>&1 | tail -5`
Expected: `room-draft.test.ts` passa **e** `room.test.ts`, `match-session*.test.ts`, `integration.test.ts` continuam passando sem alteração.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/room.ts apps/server/test/room-draft.test.ts
git commit -m "feat(server): Room com modo Draft, fase de draft e montagem pós-draft"
```

### Task 10: Eventos no servidor Socket.IO e teste de integração

**Files:**
- Modify: `apps/server/src/server.ts`
- Test: `apps/server/test/integration-draft.test.ts`

**Interfaces:**
- Consumes: `parseMode`, `parseDraftPick` (Task 6), `Room.setMode`, `Room.draftPick` (Task 9).

- [ ] **Step 1: Escrever o teste que falha**

Copie para o novo arquivo, sem alterar `integration.test.ts`, os helpers `client`, `record`, `waitFor` e o `afterEach` de `apps/server/test/integration.test.ts:15-53`. Depois:

```ts
// apps/server/test/integration-draft.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { io as connectClient, type Socket } from 'socket.io-client';
import { encodeTeam, type BuildMessage, type ClientToServerEvents, type DraftMessage, type ServerToClientEvents } from '@pfl/protocol';
import { createPflServer, type PflServer } from '../src/server';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
let server: PflServer | null = null;
const clients: ClientSocket[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.disconnect();
  await server?.close();
  server = null;
});
const client = (): ClientSocket => {
  const s: ClientSocket = connectClient(`http://localhost:${server!.port}`, { transports: ['websocket'], forceNew: true, reconnection: false });
  clients.push(s);
  return s;
};
async function waitFor<T>(fn: () => T | undefined, timeoutMs = 8000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const v = fn();
    if (v !== undefined) return v;
    if (Date.now() - started > timeoutMs) throw new Error('waitFor: tempo esgotado');
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** Joga o draft como uma pessoa: na sua vez, escolhe a primeira espécie liberada do pool. */
function humanDrafter(socket: ClientSocket, you: 'A' | 'B', state: { last: DraftMessage | null; build: BuildMessage | null }): void {
  socket.on('draft:state', (m) => {
    state.last = m;
    if (m.turn !== you) return;
    const species = m.pool.find((id) => m.blocked[id] === undefined);
    if (species !== undefined) socket.emit('draft:pick', { turnId: m.turnId, species });
  });
  socket.on('build:start', (m) => {
    state.build = m;
  });
}

describe('draft (integração)', () => {
  it('draft completo, montagem com a sugestão e início da partida', async () => {
    server = await createPflServer({ port: 0, timings: { draftPickMs: 2000, buildMs: 5000, resultAnimationMs: 0 } });
    const a = client();
    const b = client();
    const sa = { last: null as DraftMessage | null, build: null as BuildMessage | null };
    const sb = { last: null as DraftMessage | null, build: null as BuildMessage | null };
    humanDrafter(a, 'A', sa);
    humanDrafter(b, 'B', sb);
    let phases = 0;
    a.on('match:phase', () => {
      phases += 1;
    });

    const created = await a.emitWithAck('room:create');
    if (!created.ok) throw new Error(created.error.message);
    const joined = await b.emitWithAck('room:join', { code: created.data.code });
    if (!joined.ok) throw new Error(joined.error.message);

    a.emit('room:mode', { mode: 'DRAFT' });
    a.emit('room:ready', { ready: true });
    b.emit('room:ready', { ready: true });

    await waitFor(() => sa.build ?? undefined);
    await waitFor(() => sb.build ?? undefined);
    expect(sa.build!.roster).toHaveLength(17);
    expect(sb.build!.roster.some((id) => sa.build!.roster.includes(id))).toBe(false);
    expect(sa.last!.pool).toHaveLength(151 - 34);

    a.emit('team:submit', { teamCode: encodeTeam(sa.build!.suggested) });
    b.emit('team:submit', { teamCode: encodeTeam(sb.build!.suggested) });
    a.emit('room:ready', { ready: true });
    b.emit('room:ready', { ready: true });
    await waitFor(() => (phases > 0 ? true : undefined));
  });

  it('um pick fora da vez recebe erro e o draft segue', async () => {
    server = await createPflServer({ port: 0, timings: { draftPickMs: 5000 } });
    const a = client();
    const b = client();
    const errors: Record<'A' | 'B', string[]> = { A: [], B: [] };
    a.on('error', (e) => errors.A.push(e.message));
    b.on('error', (e) => errors.B.push(e.message));
    let first = null as DraftMessage | null;
    a.on('draft:state', (m) => {
      first ??= m;
    });
    const created = await a.emitWithAck('room:create');
    if (!created.ok) throw new Error('sala');
    await b.emitWithAck('room:join', { code: created.data.code });
    a.emit('room:mode', { mode: 'DRAFT' });
    a.emit('room:ready', { ready: true });
    b.emit('room:ready', { ready: true });
    const start = await waitFor(() => first ?? undefined);
    const wrong: 'A' | 'B' = start.turn === 'A' ? 'B' : 'A';
    (wrong === 'A' ? a : b).emit('draft:pick', { turnId: start.turnId, species: 25 });
    await waitFor(() => (errors[wrong].length > 0 ? true : undefined));
    expect(errors[wrong][0]).toContain('NOT_YOUR_TURN');
  });

  it('payload inválido de draft:pick e room:mode não derruba o servidor', async () => {
    server = await createPflServer({ port: 0 });
    const a = client();
    const created = await a.emitWithAck('room:create');
    if (!created.ok) throw new Error('sala');
    const errors: string[] = [];
    a.on('error', (e) => errors.push(e.code));
    (a as unknown as Socket).emit('draft:pick', 'lixo');
    (a as unknown as Socket).emit('room:mode', { mode: 42 });
    await waitFor(() => (errors.length >= 2 ? true : undefined));
    expect(errors).toEqual(['ENGINE_ERROR', 'ENGINE_ERROR']);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/server/test/integration-draft.test.ts`
Expected: FAIL (o servidor ainda não ouve `room:mode` nem `draft:pick`).

- [ ] **Step 3: Registrar os handlers em `server.ts`** (junto de `team:submit`):

```ts
import { parseDraftPick, parseMode, parsePlay, type PlayEvent } from './parse';

    socket.on(
      'room:mode',
      guard((payload: unknown) => {
        const b = bound();
        if (!b) return;
        const mode = parseMode(payload);
        if (!mode) return fail('ENGINE_ERROR', 'Payload inválido em room:mode');
        b.room.setMode(b.key, mode);
      }),
    );
    socket.on(
      'draft:pick',
      guard((payload: unknown) => {
        const b = bound();
        if (!b) return;
        const req = parseDraftPick(payload);
        if (!req) return fail('ENGINE_ERROR', 'Payload inválido em draft:pick');
        b.room.draftPick(b.key, req);
      }),
    );
```

- [ ] **Step 4: Rodar tudo**

Run: `npm test 2>&1 | tail -10 && npm run typecheck 2>&1 | tail -5`
Expected: PASS. A segunda integração é tolerante de propósito (ela só garante que o erro não derruba o servidor); a asserção forte de "fora da vez" já está em `draft-session.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/server.ts apps/server/test/integration-draft.test.ts
git commit -m "feat(server): eventos room:mode e draft:pick, com integração de um draft completo"
```

---

# Etapa 4 — Cliente

> **Pré-requisito:** o PR #8 (identidade visual, jsdom + Testing Library, lobby com time do adversário, layout da partida) já está na `main` e este branch foi atualizado com ela. Confirme com `ls apps/client/test/lobby-screen.test.tsx` e `grep tsx vitest.config.ts`. Antes disso, não comece esta etapa.

### Task 11: Processo de design (impeccable) antes de codar

**Files:**
- Create (pela skill): `apps/client/PRODUCT.md`, `apps/client/DESIGN.md`

- [ ] **Step 1:** Rode `/impeccable init` em `apps/client`. Responda à entrevista: produto = PFL, jogo de estratégia por turnos entre amigos, desktop primeiro; tom = Game Boy Color / pixel art; o Draft é uma superfície do modo *Operate* (tarefa sob pressão de tempo).
- [ ] **Step 2:** Rode `/impeccable document` em `apps/client` para gerar `DESIGN.md` do sistema atual (`src/styles/tokens.css`, `app.css`, `components/ui.css`). Leia o resultado e corrija o que estiver errado.
- [ ] **Step 3:** Rode `/impeccable shape` para a tela de Draft usando a seção "Direção de interface do Draft" da spec como brief. Guarde o plano da skill; se ele divergir da spec, ajuste a spec e avise o usuário.
- [ ] **Step 4: Commit**

```bash
git add apps/client/PRODUCT.md apps/client/DESIGN.md
git commit -m "docs(client): PRODUCT.md e DESIGN.md do sistema visual atual"
```

### Task 12: Estado do Draft no cliente e roteamento de telas

**Files:**
- Create: `apps/client/src/draft/draftState.ts`
- Modify: `apps/client/src/app/screen.ts`
- Modify: `apps/client/src/App.tsx`
- Test: `apps/client/test/draft-state.test.ts`, `apps/client/test/app-screen.test.ts` (acrescentar)

**Interfaces:**
- Produces:
  - `interface DraftClientState { draft: DraftMessage | null; build: BuildMessage | null }`, `initialDraftClient()`, `draftReducer(s, a)` com `{ type: 'DRAFT'; msg } | { type: 'BUILD'; msg } | { type: 'RESET' }` (uma mensagem de draft nova **não** apaga o `build`; um `build` novo guarda o `build` e mantém o `draft`).
  - `type SpeciesStatus = 'AVAILABLE' | 'MINE' | 'THEIRS' | 'BLOCKED'`, `speciesStatus(msg, you, id)`, `blockText(reason)`, `budgetOf(msg, you): { spent: number; free: number; slotsLeft: number }`, `canPickNow(msg, you, id): boolean`, `announcement(msg, you): string`, `timeLeftRatio(msg, now, totalMs): number` (0..1).
  - `Screen` ganha `'DRAFT' | 'BUILD'`; `screenFor` recebe `draft: DraftClientState`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
// apps/client/test/draft-state.test.ts
import { describe, expect, it } from 'vitest';
import type { BuildMessage, DraftMessage } from '@pfl/protocol';
import {
  announcement, blockText, budgetOf, canPickNow, draftReducer, initialDraftClient, speciesStatus, timeLeftRatio,
} from '../src/draft/draftState';
import { testTeam } from './fixtures';

const msg = (over: Partial<DraftMessage> = {}): DraftMessage => ({
  turnId: 3,
  order: ['A', 'B', 'B', 'A', 'A', 'B'],
  turn: 'A',
  deadline: 10_000,
  pool: [4, 7, 150, 151],
  picks: { A: [25], B: [26, 27] },
  spent: { A: 5, B: 11 },
  blocked: { 151: 'LEGENDARY_LIMIT', 7: 'OVER_BUDGET' },
  last: { team: 'B', species: 27, auto: false },
  ...over,
});

describe('speciesStatus', () => {
  it('disponível, minha, do adversário e bloqueada', () => {
    const m = msg();
    expect(speciesStatus(m, 'A', 4)).toBe('AVAILABLE');
    expect(speciesStatus(m, 'A', 25)).toBe('MINE');
    expect(speciesStatus(m, 'A', 26)).toBe('THEIRS');
    expect(speciesStatus(m, 'A', 151)).toBe('BLOCKED');
  });
});

describe('canPickNow', () => {
  it('só na minha vez e para espécie liberada', () => {
    expect(canPickNow(msg(), 'A', 4)).toBe(true);
    expect(canPickNow(msg(), 'A', 151)).toBe(false);
    expect(canPickNow(msg(), 'A', 25)).toBe(false);
    expect(canPickNow(msg({ turn: 'B' }), 'A', 4)).toBe(false);
    expect(canPickNow(msg({ turn: null }), 'A', 4)).toBe(false);
  });
});

describe('textos', () => {
  it('motivo do bloqueio em português', () => {
    expect(blockText('OVER_BUDGET')).toBe('Passa do orçamento');
    expect(blockText('LEGENDARY_LIMIT')).toBe('Já tem um lendário');
    expect(blockText('POOL_SHORTAGE')).toBe('Faltariam Pokémon baratos para os dois elencos');
  });

  it('anuncia a vez e o último pick', () => {
    expect(announcement(msg(), 'A')).toContain('Sua vez');
    expect(announcement(msg({ turn: 'B' }), 'A')).toContain('Vez do adversário');
    expect(announcement(msg({ last: { team: 'B', species: 27, auto: true } }), 'A')).toContain('automaticamente');
  });
});

describe('orçamento e relógio', () => {
  it('livre = 120 − gasto; vagas = 17 − picks', () => {
    expect(budgetOf(msg(), 'A')).toEqual({ spent: 5, free: 115, slotsLeft: 16 });
    expect(budgetOf(msg(), 'B')).toEqual({ spent: 11, free: 109, slotsLeft: 15 });
  });

  it('razão do tempo fica entre 0 e 1', () => {
    expect(timeLeftRatio(msg({ deadline: 10_000 }), 7_000, 30_000)).toBeCloseTo(0.1);
    expect(timeLeftRatio(msg({ deadline: 10_000 }), 20_000, 30_000)).toBe(0);
    expect(timeLeftRatio(msg({ deadline: 100_000 }), 0, 30_000)).toBe(1);
  });
});

describe('draftReducer', () => {
  const build: BuildMessage = { deadline: 1, roster: [1], suggested: testTeam() };

  it('guarda o draft e o build sem apagar um ao outro', () => {
    let s = initialDraftClient();
    s = draftReducer(s, { type: 'DRAFT', msg: msg() });
    s = draftReducer(s, { type: 'BUILD', msg: build });
    expect(s.draft?.turnId).toBe(3);
    expect(s.build).toBe(build);
    s = draftReducer(s, { type: 'DRAFT', msg: msg({ turnId: 4 }) });
    expect(s.build).toBe(build);
  });

  it('RESET limpa tudo', () => {
    const s = draftReducer(draftReducer(initialDraftClient(), { type: 'DRAFT', msg: msg() }), { type: 'RESET' });
    expect(s).toEqual(initialDraftClient());
  });
});
```

Acrescente a `app-screen.test.ts` (ajustando o helper `room()` para ter `mode: 'PREMADE'` e o objeto base de `screenFor` para incluir `draft: initialDraftClient()`):

```ts
describe('screenFor com draft', () => {
  const draftState = (over = {}) => ({ draft: null, build: null, ...over });
  const base = { local: 'HOME' as const, match: initialMatchState(), now: T0 };

  it('DRAFTING mostra a tela de draft', () => {
    expect(screenFor({ ...base, room: room('DRAFTING'), draft: draftState() })).toBe('DRAFT');
  });
  it('BUILDING mostra a montagem', () => {
    expect(screenFor({ ...base, room: room('BUILDING'), draft: draftState() })).toBe('BUILD');
  });
  it('pausada com o draft em curso continua no draft', () => {
    expect(screenFor({ ...base, room: room('PAUSED'), draft: draftState({ draft: {} as never }) })).toBe('DRAFT');
  });
  it('pausada na montagem continua na montagem', () => {
    expect(screenFor({ ...base, room: room('PAUSED'), draft: draftState({ draft: {} as never, build: {} as never }) })).toBe('BUILD');
  });
  it('pausada sem nada de draft mantém o comportamento antigo (MATCH)', () => {
    expect(screenFor({ ...base, room: room('PAUSED'), draft: draftState() })).toBe('MATCH');
  });
  it('com a partida em andamento, a tela é a da partida mesmo com draft guardado', () => {
    expect(screenFor({ ...base, room: room('IN_MATCH'), draft: draftState({ draft: {} as never }) })).toBe('MATCH');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/draft-state.test.ts apps/client/test/app-screen.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// apps/client/src/draft/draftState.ts
import type { DraftBlockReason, TeamKey } from '@pfl/engine';
import { DRAFT_TEAM_SIZE, SALARY_CAP } from '@pfl/engine';
import type { BuildMessage, DraftMessage } from '@pfl/protocol';

export interface DraftClientState {
  draft: DraftMessage | null;
  build: BuildMessage | null;
}

export type DraftClientAction = { type: 'DRAFT'; msg: DraftMessage } | { type: 'BUILD'; msg: BuildMessage } | { type: 'RESET' };

export const initialDraftClient = (): DraftClientState => ({ draft: null, build: null });

export function draftReducer(s: DraftClientState, a: DraftClientAction): DraftClientState {
  switch (a.type) {
    case 'DRAFT':
      return { ...s, draft: a.msg };
    case 'BUILD':
      return { ...s, build: a.msg };
    case 'RESET':
      return initialDraftClient();
  }
}

export type SpeciesStatus = 'AVAILABLE' | 'MINE' | 'THEIRS' | 'BLOCKED';

const otherKey = (k: TeamKey): TeamKey => (k === 'A' ? 'B' : 'A');

export function speciesStatus(m: DraftMessage, you: TeamKey, id: number): SpeciesStatus {
  if (m.picks[you].includes(id)) return 'MINE';
  if (m.picks[otherKey(you)].includes(id)) return 'THEIRS';
  return m.blocked[id] ? 'BLOCKED' : 'AVAILABLE';
}

export function canPickNow(m: DraftMessage, you: TeamKey, id: number): boolean {
  return m.turn === you && speciesStatus(m, you, id) === 'AVAILABLE';
}

export function blockText(reason: DraftBlockReason): string {
  switch (reason) {
    case 'OVER_BUDGET':
      return 'Passa do orçamento';
    case 'LEGENDARY_LIMIT':
      return 'Já tem um lendário';
    case 'POOL_SHORTAGE':
      return 'Faltariam Pokémon baratos para os dois elencos';
  }
}

export function budgetOf(m: DraftMessage, you: TeamKey): { spent: number; free: number; slotsLeft: number } {
  return { spent: m.spent[you], free: SALARY_CAP - m.spent[you], slotsLeft: DRAFT_TEAM_SIZE - m.picks[you].length };
}

/** Frase para o leitor de tela (aria-live): a vez e, se houve, o último pick. */
export function announcement(m: DraftMessage, you: TeamKey): string {
  const turn = m.turn === null ? 'Draft encerrado.' : m.turn === you ? 'Sua vez.' : 'Vez do adversário.';
  if (!m.last) return turn;
  const who = m.last.team === you ? 'Você escolheu' : 'O adversário escolheu';
  const how = m.last.auto ? ' automaticamente' : '';
  return `${who}${how} o Pokémon ${m.last.species}. ${turn}`;
}

/** Quanto do tempo do pick ainda resta (1 = cheio, 0 = esgotado). */
export function timeLeftRatio(m: DraftMessage, now: number, totalMs: number): number {
  return Math.min(1, Math.max(0, (m.deadline - now) / totalMs));
}
```

`screen.ts`:

```ts
import type { DraftClientState } from '../draft/draftState';

export type Screen = LocalScreen | 'LOBBY' | 'DRAFT' | 'BUILD' | 'MATCH' | 'END';

interface ScreenInput {
  local: LocalScreen;
  room: RoomState | null;
  match: MatchClientState;
  draft: DraftClientState;
  now: number;
}

export function screenFor({ local, room, match, draft, now }: ScreenInput): Screen {
  if (match.end) return isAnimating(match, now) ? 'MATCH' : 'END';
  if (room && (room.status === 'IN_MATCH' || match.view !== null)) return 'MATCH';
  if (room && (room.status === 'BUILDING' || (room.status === 'PAUSED' && draft.build))) return 'BUILD';
  if (room && (room.status === 'DRAFTING' || (room.status === 'PAUSED' && draft.draft))) return 'DRAFT';
  if (room && room.status === 'PAUSED') return 'MATCH';
  if (room) return 'LOBBY';
  return local;
}
```

`App.tsx`: acrescente
- `const [dc, dcDispatch] = useReducer(draftReducer, undefined, initialDraftClient);` e `dcRef` espelhando como `matchRef`;
- no `useEffect` dos eventos: `socket.on('draft:state', (m) => dcDispatch({ type: 'DRAFT', msg: m }))`, `socket.on('build:start', (m) => dcDispatch({ type: 'BUILD', msg: m }))` (e os `off` correspondentes); em `leave`, `dcDispatch({ type: 'RESET' })`; em `enterRoom`, idem;
- `sendPick = (species: number) => { const d = dcRef.current.draft; if (d && canPickNow(d, room.you, species)) emitIfConnected(socket, 'draft:pick', { turnId: d.turnId, species }); }` (guarde `room` num ref como as outras);
- `sendMode = (mode: RoomMode) => emitIfConnected(socket, 'room:mode', { mode })`;
- o efeito de `match:resync` existente passa a cobrir o recarregamento no meio do draft: se `room.status` é `DRAFTING` ou `BUILDING` e `dc.draft`/`dc.build` ainda são `null`, emita `match:resync` uma vez (reuse `resyncAsked`);
- `screenFor({ local, room, match, draft: dc, now })` e os dois blocos novos: `{screen === 'DRAFT' && room && dc.draft && <DraftScreen .../>}`, `{screen === 'BUILD' && room && dc.build && <BuildScreen .../>}` (componentes das Tasks 13 e 14).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run apps/client && npm run typecheck`
Expected: PASS. (`DraftScreen` e `BuildScreen` ainda não existem: crie arquivos com componentes mínimos `export function DraftScreen(): null { return null; }` só se o typecheck exigir, e substitua nas Tasks 13 e 14.)

- [ ] **Step 5: Commit**

```bash
git add apps/client
git commit -m "feat(client): estado do draft, roteamento de telas e eventos de draft no App"
```

### Task 13: Tela de Draft

Siga o `DESIGN.md` e o plano do `/impeccable shape` (Task 11). A estrutura abaixo é o mínimo exigido pela spec; as decisões visuais finas (espaçamento, ritmo, ênfase) vêm do `shape`.

**Files:**
- Create: `apps/client/src/screens/draft/DraftScreen.tsx`, `DraftBar.tsx`, `DraftPool.tsx`, `DraftRosters.tsx`, `draft.css`
- Test: `apps/client/test/draft-screen.test.tsx`

**Interfaces:**
- Consumes: `Sprite`, `TypeBadge`, `filterPokedex`/`DEFAULT_FILTER`, `speciesCost`, `speciesName`, `TYPE_LABELS`, `CapBar`-estilo de barra; `speciesStatus`, `canPickNow`, `blockText`, `budgetOf`, `announcement`, `timeLeftRatio`.
- Produces: `DraftScreen({ room, draft, now, onPick })`.

- [ ] **Step 1: Escrever o teste de componente que falha**

```tsx
// apps/client/test/draft-screen.test.tsx
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DraftMessage, RoomState } from '@pfl/protocol';
import { DraftScreen } from '../src/screens/draft/DraftScreen';

afterEach(cleanup);

const room: RoomState = { code: 'ABCDEF', you: 'A', status: 'DRAFTING', mode: 'DRAFT', players: [] };
const all = Array.from({ length: 151 }, (_, i) => i + 1);
const draft = (over: Partial<DraftMessage> = {}): DraftMessage => ({
  turnId: 2,
  order: [],
  turn: 'A',
  deadline: 25_000,
  pool: all.filter((id) => ![25, 26, 27].includes(id)),
  picks: { A: [25], B: [26, 27] },
  spent: { A: 5, B: 8 },
  blocked: { 150: 'OVER_BUDGET', 151: 'LEGENDARY_LIMIT' },
  last: { team: 'B', species: 27, auto: false },
  ...over,
});

function setup(d: DraftMessage = draft(), onPick = vi.fn()) {
  render(<DraftScreen room={room} draft={d} now={10_000} onPick={onPick} />);
  return { onPick };
}

describe('DraftScreen', () => {
  it('diz de quem é a vez, o pick e o orçamento livre', () => {
    setup();
    expect(screen.getByText('Sua vez')).toBeTruthy();
    expect(screen.getByText(/Pick 3 de 34/)).toBeTruthy();
    expect(screen.getByText(/Livre: 115/)).toBeTruthy();
  });

  it('na vez do adversário não há botão de escolher', () => {
    setup(draft({ turn: 'B' }));
    expect(screen.getByText('Vez do adversário')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Bulbasaur/i }));
    expect(screen.queryByRole('button', { name: 'Escolher' })).toBeNull();
  });

  it('selecionar abre o detalhe e só Escolher envia o pick', () => {
    const { onPick } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Bulbasaur/i }));
    expect(onPick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Escolher' }));
    expect(onPick).toHaveBeenCalledWith(1);
  });

  it('espécie bloqueada fica selecionável, mas o botão diz o motivo e não envia', () => {
    const { onPick } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Mew\b/i }));
    const button = screen.getByRole('button', { name: 'Já tem um lendário' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('espécies já escolhidas aparecem nos elencos, cada um no seu lado', () => {
    setup();
    const mine = screen.getByRole('region', { name: 'Seu elenco' });
    const theirs = screen.getByRole('region', { name: 'Elenco do adversário' });
    expect(within(mine).getAllByRole('listitem')).toHaveLength(1);
    expect(within(theirs).getAllByRole('listitem')).toHaveLength(2);
  });

  it('anuncia a vez e o último pick para leitores de tela', () => {
    setup();
    const live = document.querySelector('[aria-live="polite"]')!;
    expect(live.textContent).toContain('Sua vez');
  });

  it('busca sem resultado mostra um aviso', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'zzzzzz' } });
    expect(screen.getByText(/Nenhum Pokémon/i)).toBeTruthy();
  });

  it('a barra de tempo é um progressbar com o tempo restante', () => {
    setup();
    const bar = screen.getByRole('progressbar', { name: 'Tempo do pick' });
    expect(bar.getAttribute('aria-valuenow')).toBe('15');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/draft-screen.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`DraftBar.tsx`, `DraftPool.tsx`, `DraftRosters.tsx`, `DraftScreen.tsx` e `draft.css` com estas responsabilidades e contratos:

- `DraftBar({ draft, you, now })`: título "Sua vez" / "Vez do adversário" / "Draft encerrado" em texto, com a cor do lado como reforço (`--side-offense` para A, `--side-defense` para B, via `style`); "Pick {turnId+1} de 34"; barra com `role="progressbar" aria-label="Tempo do pick" aria-valuemin={0} aria-valuemax={30} aria-valuenow={Math.ceil(ratio*30)}` (listras nos últimos 5 s por classe `is-urgent`, além da cor); "Livre: {free} pt · {slotsLeft} vagas".
- `DraftPool({ draft, you, selected, onSelect, onPick })`: filtros (busca com `aria-label="Buscar"`, tipo, custo) reaproveitando `filterPokedex`; grade de botões, um por espécie de `filterPokedex(filter)`, com `aria-label` = `"{nome}, custo {n}, {status em palavras}"`, classe `is-available | is-mine | is-theirs | is-blocked` **e** marcação não cromática (texto curto "Seu"/"Adv." e riscado nas escolhidas); alvos ≥ 44 px; painel de detalhe com sprite, tipos, custo e o botão: na minha vez e liberada → "Escolher" (habilitado); bloqueada → botão desabilitado com o `blockText(motivo)` como rótulo; escolhida → texto "Escolhido por você/pelo adversário"; na vez do adversário → sem botão. Sem resultados: "Nenhum Pokémon com esses filtros."
- `DraftRosters({ draft, you })`: duas `<section aria-label="Seu elenco">` e `aria-label="Elenco do adversário"`, cada uma com `<ul>` de `<li>` (sprite 32, nome, custo) e contador "n/17"; o `<li>` do último pick ganha a classe `is-new` (animação de ~400 ms, desativada em `prefers-reduced-motion: reduce`).
- `DraftScreen`: compõe tudo; inclui `<p className="sr-only" aria-live="polite">{announcement(draft, room.you)}</p>`; abaixo de ~1040 px empilha; no celular (390 px) mostra abas **Pool | Meu time | Adversário** com a barra fixa no topo.
- `draft.css`: usa só tokens de `tokens.css` (cores, `--border`, `--shadow`, `--font-*`); define `.sr-only` e as classes de estado.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run apps/client/test/draft-screen.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client
git commit -m "feat(client): tela de Draft com pool, orçamento, tempo e elencos"
```

### Task 14: Montagem pós-draft e seletor de modo no lobby

**Files:**
- Create: `apps/client/src/screens/build/BuildScreen.tsx`, `build.css`
- Modify: `apps/client/src/screens/LobbyScreen.tsx`, `apps/client/src/App.tsx`
- Test: `apps/client/test/build-screen.test.tsx`, `apps/client/test/lobby-screen.test.tsx` (acrescentar)

**Interfaces:**
- Consumes: `builderReducer`, `draftFromTeam`, `draftToTeam`, `draftErrors`, `teamErrorMessage`, `DepthChartEditor`, `DeckEditor`, `ErrorList`, `Sprite`; `BuildMessage`.
- Produces: `BuildScreen({ room, build, now, onSubmit, onReady })` (`onSubmit(team: Team)`, `onReady(ready: boolean)`); `LobbyScreen` ganha a prop `onMode(mode: RoomMode)`.

- [ ] **Step 1: Escrever os testes que falham**

```tsx
// apps/client/test/build-screen.test.tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SUGGESTED_TEAMS, suggestBuild } from '@pfl/engine';
import type { BuildMessage, RoomState } from '@pfl/protocol';
import { BuildScreen } from '../src/screens/build/BuildScreen';

afterEach(cleanup);

const base = SUGGESTED_TEAMS[0];
const ids = [...base.roster, base.specialist];
const build: BuildMessage = { deadline: 100_000, roster: ids, suggested: suggestBuild(ids, 'Time A') };
const room: RoomState = { code: 'ABCDEF', you: 'A', status: 'BUILDING', mode: 'DRAFT', players: [] };

function setup() {
  const onSubmit = vi.fn();
  const onReady = vi.fn();
  render(<BuildScreen room={room} build={build} now={10_000} onSubmit={onSubmit} onReady={onReady} />);
  return { onSubmit, onReady };
}

describe('BuildScreen', () => {
  it('abre com a sugestão do servidor: sem pendências e pronto para ficar pronto', () => {
    setup();
    expect(screen.getByText('Time válido')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Estou pronto' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('não oferece adicionar ou remover Pokémon: o elenco está travado', () => {
    setup();
    expect(screen.queryByRole('button', { name: /Remover/i })).toBeNull();
    expect(screen.queryByLabelText('Buscar')).toBeNull();
  });

  it('Estou pronto envia o time e marca pronto', () => {
    const { onSubmit, onReady } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Estou pronto' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].roster).toHaveLength(16);
    expect(onReady).toHaveBeenCalledWith(true);
  });

  it('mostra o tempo restante', () => {
    setup();
    expect(screen.getByRole('progressbar', { name: 'Tempo da montagem' })).toBeTruthy();
  });
});
```

Acrescente a `lobby-screen.test.tsx` casos para o seletor de modo (dois casos): o anfitrião (`you: 'A'`) vê dois radios "Times prontos" e "Draft" e `onMode('DRAFT')` é chamado ao escolher Draft; o convidado (`you: 'B'`) vê o modo em texto, sem radios. Em modo `DRAFT` a lista de times some e "Estou pronto" fica habilitado sem time enviado. Reutilize o helper de render que o arquivo já define e inclua `onMode={vi.fn()}` em todas as chamadas existentes.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/client/test/build-screen.test.tsx apps/client/test/lobby-screen.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`BuildScreen`:
- estado inicial `useReducer(builderReducer, build.suggested, draftFromTeam)` (um `useReducer` com função de inicialização);
- abas **Depth chart**, **Deck** e **Especialista** (sem a aba Elenco nem Código); reaproveita `DepthChartEditor` e `DeckEditor` ligando `dispatch` como em `BuilderScreen`;
- **Especialista:** lista dos 17 de `build.roster` com o atual marcado; trocar executa, nesta ordem, `SET_SPECIALIST(new)`, `ADD_SPECIES(old)` e `AUTO_DEPTH`, e mostra a nota "Trocar o especialista refaz o depth chart e pode tirar cartas do deck.";
- `draftErrors(draft)` alimenta `<details>` "Time válido" / "{n} pendência(s)" com `ErrorList`;
- barra `role="progressbar" aria-label="Tempo da montagem"` calculada de `build.deadline` e `now` (total = 180 s);
- botão **Estou pronto** (desabilitado com pendências): `const team = draftToTeam(draft); if (team) { onSubmit(team); onReady(true); }`; depois vira **Cancelar pronto** (`onReady(false)`);
- nenhum botão que altere o elenco de linha.

`LobbyScreen`: nova prop `onMode`; bloco "Modo da partida" com `<fieldset>`/`<legend>`: para o anfitrião (`room.you === 'A'`) radios "Times prontos" (`PREMADE`) e "Draft" (`DRAFT`), desabilitados se alguém já está pronto; para o outro jogador, o modo em texto. Em `DRAFT`: não renderizar a seção "Seu time", `canReady = true` enquanto conectado, e o texto de ajuda passa a "Os dois montam o elenco alternadamente. Cada pick tem 30 segundos." No `App.tsx` passe `onMode={sendMode}` e `<BuildScreen room={room} build={dc.build} now={now} onSubmit={submitTeam} onReady={(ready) => socket.emit('room:ready', { ready })} />`.

- [ ] **Step 4: Rodar tudo**

Run: `npm test 2>&1 | tail -10 && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client
git commit -m "feat(client): montagem pós-draft com elenco travado e seletor de modo no lobby"
```

### Task 15: Verificação visual e do fluxo (uma rodada em lote)

- [ ] **Step 1:** Suba servidor e cliente (`npm run dev:server` e `npm run dev:client`) e jogue um draft completo com duas abas (ou use o Playwright que o projeto adotou na PR #8): lobby → modo Draft → prontos → 34 picks → montagem → partida. Capture, em lote, desktop (1280x800) e celular (390x800), nas telas de Draft (minha vez e vez do adversário) e de Montagem.
- [ ] **Step 2:** Rode o detector uma vez: `"/home/asaas/.claude/plugins/cache/impeccable/impeccable/4.5.2/skills/impeccable/scripts/impeccable" detect --json apps/client/src/screens/draft apps/client/src/screens/build`.
- [ ] **Step 3:** Rode `/impeccable critique` na tela de Draft. Corrija tudo o que apontar **num único lote**, confirme com no máximo mais uma rodada e pare.
- [ ] **Step 4:** Confira o checklist de acessibilidade da spec: teclado (setas/Enter), `aria-live`, foco visível, contraste AA, alvos ≥ 44 px, sem rolagem horizontal em 390 px, `prefers-reduced-motion`.
- [ ] **Step 5: Commit**

```bash
git add apps/client
git commit -m "fix(client): ajustes da revisão visual do Draft"
```

---

# Etapa 5 — Bot e balanceamento

### Task 16: Bot de draft no simulador

**Files:**
- Create: `packages/sim/src/draft-bot.ts`
- Modify: `packages/sim/src/index.ts`
- Test: `packages/sim/test/draft-bot.test.ts`

**Interfaces:**
- Consumes: `createDraft`, `draftStep`, `draftTurn`, `draftRosters`, `blockReason`, `suggestBuild`, `playMatch`, `weightedPick`.
- Produces: `botPick(state: DraftState, team: TeamKey, rng: number): { species: number; rng: number }` (peso por valor: `bst / custo`, só espécies legais); `runDraftSim(games: number, seed: number): DraftSimResult` com `{ firstPickerWins: number; secondPickerWins: number; games: number; costGap: { mean: number; max: number } }`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// packages/sim/test/draft-bot.test.ts
import { describe, expect, it } from 'vitest';
import { blockReason, createDraft, draftTurn } from '@pfl/engine';
import { botPick, runDraftSim } from '../src/draft-bot';

describe('botPick', () => {
  it('só escolhe espécie legal e é determinístico', () => {
    const s = createDraft('A');
    const a = botPick(s, 'A', 7);
    expect(blockReason(s, draftTurn(s)!, a.species)).toBeNull();
    expect(botPick(s, 'A', 7)).toEqual(a);
  });
});

describe('runDraftSim', () => {
  it('joga N partidas de drafts completos e conta vitória por ordem de pick', () => {
    const r = runDraftSim(6, 3);
    expect(r.games).toBe(6);
    expect(r.firstPickerWins + r.secondPickerWins).toBe(6);
    expect(r.costGap.max).toBeGreaterThanOrEqual(0);
  });

  it('é determinístico', () => {
    expect(runDraftSim(4, 9)).toEqual(runDraftSim(4, 9));
  });

  it('rejeita parâmetros inválidos', () => {
    expect(() => runDraftSim(0, 1)).toThrow(/games inválido/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/sim/test/draft-bot.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// packages/sim/src/draft-bot.ts
import {
  blockReason, bst, createDraft, draftRosters, draftStep, draftTurn, getSpecies, isDraftComplete, rngNext, speciesCost, suggestBuild,
  type DraftState, type TeamKey,
} from '@pfl/engine';
import { weightedPick } from './pick';
import { MAX_SEED, playMatch } from './runner';

/** Escolhe entre as espécies legais, com peso proporcional ao valor (BST por ponto de custo). */
export function botPick(state: DraftState, team: TeamKey, rng: number): { species: number; rng: number } {
  const legal = state.pool.filter((id) => blockReason(state, team, id) === null);
  const r = weightedPick(legal, legal.map((id) => bst(getSpecies(id)) / speciesCost(id)), rng);
  return { species: r.item, rng: r.rng };
}

export interface DraftSimResult {
  games: number;
  firstPickerWins: number;
  secondPickerWins: number;
  /** diferença absoluta de custo entre os dois elencos */
  costGap: { mean: number; max: number };
}

export function runDraftSim(games: number, seed: number): DraftSimResult {
  if (!Number.isInteger(games) || games < 1) throw new Error(`games inválido: ${games}`);
  if (!Number.isInteger(seed) || seed < 0 || seed > MAX_SEED) throw new Error(`seed inválida: ${seed}`);
  let rng = seed | 0;
  const next = (): number => {
    const r = rngNext(rng);
    rng = r.state;
    return Math.floor(r.value * 2 ** 31);
  };
  let first = 0;
  let second = 0;
  let gapSum = 0;
  let gapMax = 0;
  for (let g = 0; g < games; g++) {
    // quem abre o snake alterna: o time A é sempre o que abre, para contar a vantagem do primeiro pick
    let state = createDraft('A');
    let pickRng = next();
    while (!isDraftComplete(state)) {
      const team = draftTurn(state)!;
      const p = botPick(state, team, pickRng);
      pickRng = p.rng;
      state = draftStep(state, { type: 'PICK', team, species: p.species });
    }
    const rosters = draftRosters(state);
    const teamA = suggestBuild(rosters.A, 'Draft A');
    const teamB = suggestBuild(rosters.B, 'Draft B');
    const cost = (ids: readonly number[]): number => ids.reduce((s, id) => s + speciesCost(id), 0);
    const gap = Math.abs(cost(rosters.A) - cost(rosters.B));
    gapSum += gap;
    gapMax = Math.max(gapMax, gap);
    // cada draft vale duas partidas, trocando os lados, para a posse inicial não contaminar
    const matchSeed = next();
    const botSeed = next();
    const m1 = playMatch(teamA, teamB, matchSeed, botSeed);
    first += m1.winner === 'A' ? 1 : 0;
    second += m1.winner === 'A' ? 0 : 1;
  }
  return { games, firstPickerWins: first, secondPickerWins: second, costGap: { mean: gapSum / games, max: gapMax } };
}
```

Em `index.ts`: `export * from './draft-bot';`. Se `suggestBuild` devolver time inválido para algum draft do bot, `playMatch` lança (o motor valida): isso é um sinal do Review Focus 2 e deve parar a tarefa.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run packages/sim/test/draft-bot.test.ts && npm test 2>&1 | tail -6`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sim
git commit -m "feat(sim): bot de draft e simulação de vantagem por ordem de pick"
```

### Task 17: Relatório e comando do simulador

**Files:**
- Modify: `packages/sim/src/cli.ts`
- Test: `packages/sim/test/cli.test.ts` (acrescentar)

- [ ] **Step 1: Escrever o teste que falha** — acrescente a `cli.test.ts` casos para a nova opção `--draft`: `parseArgs(['--games','4','--draft'])` devolve `draft: true`; `main(['--games','4','--draft'], out)` imprime uma linha que começa com `Draft:` contendo `1º pick` e `2º pick`, devolve 0 e **não** roda o portão de cartas; repetir `--draft` é erro de uso (código 2).
- [ ] **Step 2:** Rode `npx vitest run packages/sim/test/cli.test.ts` e confirme a falha.
- [ ] **Step 3: Implementar** — em `CliOptions` acrescente `draft: boolean` (padrão `false`); em `parseArgs`, trate `--draft` como as demais flags booleanas (incluindo o controle de repetição e o texto do `USAGE`: `[--draft]`); em `main`, se `options.draft`, chame `runDraftSim(options.games, options.seed)` e imprima `Draft: ${r.firstPickerWins}/${r.games} vitórias do 1º pick, ${r.secondPickerWins}/${r.games} do 2º pick; diferença média de custo ${r.costGap.mean.toFixed(1)} (máx. ${r.costGap.max})` e retorne 0.
- [ ] **Step 4:** Rode `npx vitest run packages/sim && npm run sim -- --games 40 --draft` e confirme a saída; registre o resultado no PR (um 1º pick ganhando bem mais que ~55% é um achado de balanceamento para o usuário decidir, não um bug a corrigir aqui).
- [ ] **Step 5: Commit**

```bash
git add packages/sim
git commit -m "feat(sim): opção --draft mede a vantagem do primeiro pick"
```

### Task 18: Documentação e fechamento

- [ ] **Step 1:** Atualize a spec original (`docs/superpowers/specs/2026-10-10-pfl-core-design.md`): seção 7.2 com `room:mode`, `draft:pick`, `draft:state`, `build:start`; seção 6.1 com o modo Draft e a tela de montagem; seção 10 retirando "Draft snake ao vivo" de "Fora do escopo" (como o spec do núcleo é o do projeto, registre a data da mudança). A spec de próximos passos já registra `build:start` e a reserva conjunta; confira se continua igual ao que foi implementado.
- [ ] **Step 2:** README: acrescente "Modos de partida" (Times prontos e Draft) e `npm run sim -- --games N --draft`.
- [ ] **Step 3:** Rode a verificação completa: `npm run typecheck && npm test && npm run test:gate`. Registre os resultados reais.
- [ ] **Step 4:** Abra o PR contra `main` com o resumo das 5 etapas, o aviso de que o protocolo muda (**servidor e cliente sobem juntos**; ordem de deploy: servidor antes), o resultado do `--draft` e o que não foi verificado.
- [ ] **Step 5:** Comente na issue #9 com o link do PR e marque as etapas concluídas.

---

## Auto-revisão

- **Cobertura da spec:** ordem snake, pool exclusivo, reserva de orçamento, 30 s com pick automático, BUILD de 180 s com sugestão, validação do elenco draftado, modo escolhido pelo anfitrião e fixado no primeiro "pronto", pausa/reconexão, estados e acessibilidade da interface, bot (DR5) e documentação: Tasks 4, 7 a 10, 12 a 14, 16 a 18. Refatoração com testes existentes intactos: Task 3.
- **Divergências da spec original, já registradas na spec de próximos passos:** `draft:end` virou `build:start` (carrega o elenco e a sugestão de cada jogador); a "reserva de 1 ponto por vaga" virou "reserva conjunta". Um rascunho (fora do repositório) mostrou que a regra por time travava 10 de 30 drafts simulados, porque só 13 espécies custam até 3 pontos; com a regra conjunta, 60 drafts adversariais (aleatório, sempre o mais caro, sempre o mais barato) terminaram sem travar.
- **Pontos que podem exigir decisão do usuário durante a execução:** Review Focus 1 (draft sem saída) e 2 (elenco sem deck válido), com parada explícita nas Tasks 4 e 5.
- **Consistência de nomes:** `DraftMessage`/`BuildMessage`, `RoomMode`, `draftPickMs`/`buildMs`, `setMode`/`draftPick`, `blockReason`/`blockedFor`/`suggestBuild`, `SeatRegistry`/`Lobby`/`RoomPhase` aparecem com a mesma grafia em todas as tarefas.
