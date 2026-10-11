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
  | 'NOT_READY' | 'STALE_TURN' | 'ENGINE_ERROR' | 'SERVER_BUSY';
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
- **Ajustes da revisão do PR do Plano 1** (snapshot golden inalterado):
  - `nextDriveStart` sempre devolve uma linha entre 1 e 99. FG errado chutado da própria 7 ou de mais perto da própria end zone deixa o adversário na 99 (antes: ≥ 100, TD de graça).
  - `MAX_FG_DISTANCE = 70` (calibrável no Plano 2): acima disso `fieldGoalProbability` devolve 0. O piso de 5% vale só dentro do alcance.
  - No TD, a passagem para `CONVERSION` limpa formação, pacote, escalações e cartas: `PlayerView.yourCard` é `null` e `opponentHasChosen` é `false` na conversão.
  - `fillSlots(slots, depth, preferred?, fallback?)`: se a escolha gulosa falhar, tenta a ordem simples do depth chart e depois um emparelhamento completo. `validateTeam` só acusa `FORMATION_UNFILLABLE`/`PACKAGE_UNFILLABLE` quando não existe escalação. `pickLineup` usa `fillSlots` com `fallback` = o menos cansado.
  - O `Team` dentro do `MatchState` é congelado (`Object.freeze` profundo) e compartilhado entre os estados de `step`; o resto do estado continua sendo copiado. Quem precisar mudar o time (ex.: `SET_DEPTH` no Plano 3) troca `rt.team` por um objeto novo, nunca muta o atual.
- **Typecheck da raiz:** `tsconfig.json` exclui `apps/client`, e o script `typecheck` roda também `tsc -p apps/client/tsconfig.json`.

## 6. Entregas do Plano 2 (executado em 2026-10-11, branch `pfl-2-sim`)

O código é a fonte de verdade onde o texto do Plano 2 divergir (ver o aviso no topo dele).

- **Catálogo:** `CARDS` tem **85** cartas (3 básicas, 2 especiais, 60 de tipo, 20 de assinatura). Os 40 ids do Plano 1 mantêm lado, categoria, origem, elemento e requisitos; só `baseYards` de algumas cartas mudou na calibração.
- **`SUGGESTED_TEAMS`:** mesma ordem e mesmos nomes (Vermilion, Cinnabar, Cerulean, Pewter, Saffron, Celadon). **Elencos, depth charts e custos diferem da tabela do Plano 2**: os times foram rebalanceados com o simulador (confrontos entre eles de 45% a 52%). Custos atuais: 116 / 120 / 117 / 120 / 120 / 117. Planos 3 e 4 devem usar os times por índice ou nome, nunca assumir elenco ou custo.
- **`PlayOutcome`:** `readFactor`, `statFactor` e `varianceFactor` são obrigatórios; `READ_YARDS` é exportado de `resolve.ts`. Todo literal de `PlayOutcome` precisa dos três campos (os Planos 3 e 4 já os trazem).
- **`@pfl/sim`** (`packages/sim/src/index.ts`): `weightedPick`, `botAction`, `botDecide`, `actingTeams`, `randomTeam`, `buildDepth`, `usableCards`, `playMatch`, `runSim`, `MAX_SEED`, `buildReport`, `balanceGate`, `formatReport`. `botAction` decide só com `playerView` e o próprio time.
- **CLI** `npm run sim -- --games N [--seed S] [--min-sample M] [--gate]` (também `--opção=valor` e `--help`). Seed de 0 a 4294967295. Códigos de saída: 0 ok; 1 portão reprovado; 2 argumentos inválidos; 3 `--gate` sem amostra suficiente (menos de 30 cartas avaliadas); 4 erro de execução da simulação.
- **Ferramenta:** `packages/sim/scripts/rebalance-teams.ts` refaz o rebalanceamento dos times sugeridos (uso manual, fora dos testes).
- **Portão de balanceamento:** `packages/sim/test/balance-gate.gate.test.ts` (2500 partidas, seed 2026, amostra mínima 600, faixa 45–55%, ao menos 30 cartas). `GATE_EXCEPTIONS` está vazio (`psychic_foresight` entrou na faixa).
  - Roda à parte com `npm run test:gate` (cerca de 30 s); `npm test` exclui os arquivos `*.gate.test.ts` e tem só um smoke test do portão.
  - O win rate por carta conta só as partidas em que **apenas um** dos lados jogou a carta (como já era nas categorias); antes, a carta jogada pelos dois lados somava uma vitória e uma derrota e puxava o resultado para 50%.
  - **Critério estatístico:** `balanceGate` reprova só quando o intervalo de confiança de 95% (Wilson, `wilsonInterval`) fica inteiro fora da faixa. Fora só no ponto vai para `GateResult.borderline` e aparece no relatório como aviso (`~ fora, mas o IC … cruza a faixa`). Cada `GateCard` traz `ci`. O intervalo supõe partidas independentes; como uma carta se concentra em poucos times, a variância real é maior e o critério ainda é um pouco rigoroso.
  - **Recalibração de 2026-10-11** (após a contagem exclusiva): `normal_tackle` 4→5, `normal_quick_attack` 5→6, `sig_dugtrio_dig` 6→5, `sig_alakazam_teleport` 9→8, `sig_fly_route` 21→18, `flying_sky_attack` 12→11 (`baseYards`). Seeds 7, 11, 3, 99 e 2026 (6000 partidas, amostra 1000): 0 reprovadas; fora só no ponto: `bug_twineedle`, `electric_thundershock`, `flying_sky_attack`, `grass_stun_spore`, `fire_blast_fake` (todas com o IC cruzando a faixa). Snapshot golden do Plano 1 inalterado.
  - O portão é sensível a qualquer mudança que altere a ordem de consumo do RNG, mesmo sem efeito de balanceamento. Se ele ficar vermelho depois de uma mudança do engine sem relação com balanceamento, **não recalibre de imediato**: confirme com `npm run sim -- --games 6000 --seed 7 --min-sample 1000 --gate` e com as seeds 11, 3 e 99. Na calibração só `OFFENSE_PROFILES` e `baseYards` são ajustáveis (os números da spec continuam fixos).
  - Mudanças do Plano 3 no engine (`SET_DEPTH`, `snapInDrive`, `canEditDepth`) não podem consumir RNG nem alterar o fluxo das ações do bot. O snapshot golden do Plano 1 deve continuar igual.
- **Pendências conhecidas (decisão do usuário):**
  - Contribuição observada: leitura 74% / tipo 12% / stats 12% / variância 2%, contra os alvos 50/20/20/10 da spec 4.3. Não é atingível com os números fixados; a spec 7.3 já os trata como informativos.
  - Cartas que só aparecem nos times sugeridos ficam abaixo da amostra mínima e escapam do portão. O relatório as lista como aviso (por exemplo `ice_blizzard`, `sig_hitmonchan_counter`, `rock_throw_deep`, `sig_machamp_karate`, `sig_mewtwo_mind`).
  - Os temas dos times sugeridos derivaram um pouco: Cinnabar não tem carta de Lutador e Saffron tem 8 cartas Normal.

## 7. Ajustes da revisão do PR do Plano 3 (branch `pfl-3-server`)

- **`actingTeams(state)`** mudou para o `@pfl/engine` (quem precisa agir na etapa atual). O `@pfl/sim` e o servidor importam de lá; o `@pfl/sim` não o exporta mais.
- **`SET_DEPTH` e o descanso:** depois de trocar o "manter em campo", o motor recalcula `fatigue.resting` (`refreshResting`). Quem ganha a marca volta na hora; quem a perde e está no limiar passa a descansar.
- **`ErrorCode`** ganha `'SERVER_BUSY'`: `room:create` responde no Ack com esse código quando o servidor atinge o teto de salas abertas (`MAX_ROOMS = 10_000`).
- **Saída voluntária:** quem cria ou entra em outra sala sai da atual; se ela estava no lobby e fica sem ninguém conectado, fecha na hora (não espera os 5 min).
- **Vaga abandonada no lobby:** quem cai no lobby tem `RECONNECT_GRACE_MS` para voltar. Se não voltar enquanto o outro jogador espera conectado, a vaga é liberada (o token antigo deixa de valer) e `room:state` mostra só um jogador.
- **Time do código:** o servidor guarda só os campos do contrato, com `name` cortado em 40 caracteres. É esse time que vai para a partida e para `replay.teams`.
- **TIMEOUT recusado pelo motor:** cada nova tentativa reenvia `match:phase` com o deadline novo (+1 s). Depois de `MAX_TIMEOUT_RETRIES = 3` novas tentativas na mesma etapa, os dois recebem `error { code: 'ENGINE_ERROR' }` e a partida termina com o placar atual (`match:end`).
- **Reconexão:** quem volta recebe um único `match:phase`.
