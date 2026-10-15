# Battle Rhythm, Stadium Pulse e Ace X-Factors: regras (issue #16, parte 1)

> **Data:** 2026-10-14. **Issue:** [#16](https://github.com/lucvs07/PFL/issues/16) "Perks e Stadium Pulse" (a issue não tem corpo; a fonte é o md `especifica_o_da_feature_de_x_factor_e_stadium_pulse.md`).
> **Escopo desta spec:** engine, protocolo, servidor, bot e portão de balanceamento. A apresentação (HUD, barra de pulse, aura, tremor, áudio, animações, escolha de capitão no builder) é a **Parte 2**, com spec própria.
> **Origem no backlog:** "Momentum" estava em `2026-10-12-pfl-proximos-passos-issues.md`, seção 4.

## 1. Objetivo

Adicionar uma camada de ritmo e clutch ao motor: um medidor de momentum disputado pelos dois times, pressão do estádio que penaliza o time em desvantagem e um capitão ofensivo e um defensivo por time que entram "na zona" após sequências e ganham um perk. A feature é regra real: muda o resultado das jogadas, vai no replay e é calibrada pelo simulador.

## 2. Decisões já tomadas

1. **Fatiamento:** regras primeiro (esta spec), visual depois.
2. **Capitães no `Team`** (montagem e Draft), não automáticos nem escolhidos no lobby.
3. **Timeout do técnico:** ação nova, 2 por time por partida.
4. **Telepathic Pocket** vira regra de motor: com o QB na zona, leitura `RIGHT` conta como `NEUTRAL`. Nenhuma carta do rival é revelada.
5. **Arquitetura:** módulo puro `rhythm.ts` no engine, estado em `MatchState.rhythm`, eventos no `GameEvent`. Não existe a mensagem `match:momentum_update` do md: os eventos viajam em `match:result` e o estado em `PlayerView.rhythm`.

## 3. Restrições

- **Determinismo.** `resolvePlay` continua fazendo exatamente 5 sorteios por jogada, na mesma ordem. Perks e pulse só mudam números, nunca a quantidade de sorteios.
- **Compatibilidade.** `Team.captains` é opcional. Sem ele a partida roda sem perks; momentum e pulse valem do mesmo jeito. Códigos de time antigos e times sugeridos seguem válidos.
- **Sem efeito quando neutro.** Com `PlayModifiers` neutro (sem pulse, sem perk), `resolvePlay` devolve o mesmo resultado de hoje, sorteio a sorteio.
- Convenção de lado: `TeamKey` `A`/`B`. O md fala em mandante e visitante; aqui o momentum é positivo a favor do **A** e negativo a favor do **B**.

## 4. Modelo

### 4.1 `Team.captains`

```ts
export type XFactorId =
  | 'TELEPATHIC_POCKET' | 'OVERDRIVE_BREAKTHROUGH' | 'SLIPSTREAM_SEPARATION' | 'IMMOVABLE_WALL'
  | 'INTIMIDATE_RUSH' | 'ENFORCER_STOMP' | 'ISLAND_LOCKDOWN' | 'PREDATOR_HAWK';

export interface Captain { species: number; xFactor: XFactorId }
export interface Captains { offense?: Captain; defense?: Captain }
export interface Team { /* campos atuais */ captains?: Captains }
```

Posição de cada perk (tabela única em `rhythm.ts`): `TELEPATHIC_POCKET` QB, `OVERDRIVE_BREAKTHROUGH` RB, `SLIPSTREAM_SEPARATION` WR, `IMMOVABLE_WALL` OL; `INTIMIDATE_RUSH` DL, `ENFORCER_STOMP` LB, `ISLAND_LOCKDOWN` CB, `PREDATOR_HAWK` S. TE e FB não têm perk. O capitão ofensivo usa um perk ofensivo e o defensivo um defensivo.

Cada lado é opcional: o time pode ter só um capitão (e o simulador isola um perk por vez). **Validação** (`validateTeam`): `captains` malformado ou com `xFactor` desconhecido dá `MALFORMED_TEAM`. Códigos novos, com `detail` `offense:<espécie>` ou `defense:<espécie>`:

- `CAPTAIN_NOT_IN_ROSTER`: a espécie não está no `roster`.
- `XFACTOR_POSITION_MISMATCH`: a espécie não aparece em nenhuma vaga da posição do perk no `depth`, ou o perk é do lado errado (ofensivo no slot defensivo e vice-versa).

### 4.2 `MatchState.rhythm`

```ts
export interface ZoneProgress { progress: number; inZone: boolean }
export interface RhythmState {
  /** -100 a +100: positivo a favor do A, negativo a favor do B */
  momentum: number;
  streak: { team: TeamKey | null; count: number };
  zone: Record<TeamKey, { offense: ZoneProgress; defense: ZoneProgress }>;
  /** timeouts restantes; começa em 2 */
  timeouts: Record<TeamKey, number>;
  /** o time já chamou timeout neste snap (volta a false em cada novo snap) */
  calledThisSnap: Record<TeamKey, boolean>;
}
```

`MatchConfig.rhythm?: boolean` (padrão ligado) desliga o ritmo inteiro quando é `false`: sem eventos, sem modificadores e sem `USE_TIMEOUT`. Serve de prova de regressão (o golden antigo continua valendo) e de linha de base para o simulador.

O nível do pulse é derivado, não guardado:

```ts
pulseTier(momentum): { dominant: TeamKey | null; tier: 0 | 1 | 2 }
// |m| < 50 → tier 0; 50–79 → 1; ≥ 80 → 2; dominant = quem tem o sinal a favor
```

O time **pressionado** é o adversário do dominante.

### 4.3 Eventos novos em `GameEvent`

```ts
| { t: 'MOMENTUM'; delta: number; value: number; reason: MomentumReason }
| { t: 'PULSE_TIER'; dominant: TeamKey | null; tier: 0 | 1 | 2 }
| { t: 'ZONE_ENTER'; team: TeamKey; side: 'offense' | 'defense'; species: number; xFactor: XFactorId }
| { t: 'ZONE_EXIT'; team: TeamKey; side: 'offense' | 'defense'; species: number; cause: ZoneExitCause }
| { t: 'ZONE_CLASH'; offense: number; defense: number }
| { t: 'TIMEOUT_CALLED'; team: TeamKey; remaining: number }
```

`MomentumReason`: `STREAK`, `SACK`, `LONG_CONVERSION`, `TURNOVER`, `TOUCHDOWN`, `SACK_SUFFERED`, `DOWNS`, `TIMEOUT`. `ZoneExitCause`: `NEGATIVE_PLAY`, `BIG_GAIN`, `TIMEOUT`.

`MOMENTUM` sai uma vez por motivo. `PULSE_TIER` só quando o par (dominante, nível) muda. A ordem dentro de um `step()` de jogada é: `CARDS`, `PLAY`, `MOMENTUM` na ordem da tabela 5.1, `ZONE_EXIT`, `ZONE_ENTER`, `ZONE_CLASH`, `PULSE_TIER`, e só então os eventos de campo já existentes (`FIRST_DOWN`, `TOUCHDOWN`, `TURNOVER`...). `PlayOutcome.perks?: { offense?; defense?; clash? }` registra os perks aplicados, e `PlayOutcome.read` passa a ser a leitura **efetiva** (depois do Telepathic Pocket).

## 5. Regras

### 5.1 Momentum

Cada jogada com `PlayOutcome` (corridas e passes; **não** punt, field goal, PAT nem tentativa de 2 pontos) gera variações calculadas **na ordem abaixo**. O valor final é limitado a [−100, +100] uma única vez, no fim do `step()`. "A favor de X" soma para o A e subtrai para o B.

| Ordem | Condição | Variação |
|---|---|---|
| 1 | Quem ganhou a leitura: ataque se `read = WRONG`, defesa se `read = RIGHT` | Sequência do vencedor sobe; a do outro zera. Pontos: 1ª leitura +10, 2ª +20, 3ª em diante +35, a favor do vencedor |
| 2 | `read = NEUTRAL` | Zera a sequência. Sem pontos |
| 3 | `SACK` com perda ≥ 5 jardas | +25 a favor da defesa |
| 4 | `SACK` (qualquer perda) | −30 para o ataque (sack sofrido) |
| 5 | 3ª ou 4ª descida convertida com `yardsToGo ≥ 8` | +20 a favor do ataque |
| 6 | `INTERCEPTION`, `FUMBLE` ou `TOUCHDOWN` | +40 a favor de quem ganhou a bola ou o ponto |
| 7 | `TURNOVER_ON_DOWNS` | −30 para o ataque |

Observações: o sack de 5 a 8 jardas soma +25 e −30, um swing de 55; o sack de 4 jardas só tem o −30. Ambos são valores iniciais a calibrar. Delay of Game e o `+15` do md não existem (o jogo não tem relógio de jogo); o `TIMEOUT` por estouro de timer não gera momentum.

### 5.2 Stadium Pulse

O time pressionado sofre, de acordo com o nível **calculado antes do snap**:

- **Nível 1 (|m| ≥ 50):** o tempo de `PLAYCALL` dele cai de 8 s para 6 s. É aplicado pelo servidor, só para esse jogador (seção 7). As demais fases não mudam.
- **Nível 2 (|m| ≥ 80)**, além do nível 1:
  - Corridas (`RUN_INSIDE`, `RUN_OUTSIDE`): o `edge` do pressionado é multiplicado por 0,85 se ele ataca, ou dividido por 0,85 se ele defende.
  - Passes protegidos (`SHORT_PASS`, `DEEP_PASS`, `PLAY_ACTION`): a razão de pressão `dl/ol` é multiplicada por 1/0,85 se o pressionado ataca, ou por 0,85 se defende.
  - Se o pressionado ataca em passe protegido e a razão de pressão for > 1, o risco de incompletude é multiplicado por 1,15.

A "névoa tática" e o "tremor" do md são apresentação (Parte 2).

### 5.3 Zona

Um capitão só conta na jogada em que é **ator** do lado dele (`offActors` ou `defActors`). O progresso de cada capitão só muda nas jogadas em que ele é ator: qualifica → `progress += 1` (o sack do DL soma 2); não qualifica → `progress = 0`. Ao chegar a 2, `inZone = true` e sai `ZONE_ENTER`.

| Perk | A jogada qualifica quando |
|---|---|
| QB | passe protegido ou screen completo (`GAIN`) com `read = WRONG` |
| RB | corrida (`RUN_*`) com ganho ≥ 10 jardas |
| WR | passe completo que resulta em 1st down |
| OL | a jogada é `GAIN` ou `INCOMPLETE` com ganho ≥ 0 (sack, perda e turnover não contam) |
| DL | `SACK` (progresso +2) ou corrida com ganho ≤ 2 |
| LB | `RUN_INSIDE` com ganho ≤ 3 |
| CB | `INCOMPLETE` |
| S | qualquer jogada que não seja `DEEP_PASS` completo |

**Saída da zona** (`ZONE_EXIT`, `progress = 0`), checada em toda jogada, mesmo se o capitão não for ator:

- Capitão ofensivo: `SACK`, ganho < 0 ou turnover do ataque → `NEGATIVE_PLAY`.
- Capitão defensivo: a unidade cede ganho ≥ 20 jardas ou touchdown → `BIG_GAIN`.
- Timeout do rival → `TIMEOUT` (seção 5.5).

A zona persiste entre drives. O progresso de um capitão só avança no lado em que ele joga, então um capitão defensivo fica congelado enquanto o time ataca.

### 5.4 Perks

O `PlayModifiers` que o engine passa ao `resolvePlay` tem duas partes: o fator de pulse de cada lado e, para cada capitão na zona, `{ species, xFactor }`. O `resolvePlay` aplica um perk **somente se a espécie do capitão está entre os atores do lado dele** naquela jogada.

| Perk | Efeito |
|---|---|
| Telepathic Pocket | `read = RIGHT` passa a valer `NEUTRAL` (afeta jardas, incompletude, big play e risco) |
| Overdrive Breakthrough | corrida avança no mínimo 3 jardas e ignora o `STUFF_PENALTY` (fumble não é afetado) |
| Slipstream Separation | contra carta `MAN`: `edge` ×1,15 e risco de incompletude ×0,5 |
| Immovable Wall | contra `BLITZ`: risco de sack = 0 |
| Intimidate Rush | razão de pressão ×1,3 |
| Enforcer Stomp | risco de fumble ×1,2 e fadiga dobrada no portador |
| Island Lockdown | passe em que o CB é ator: risco de incompletude ×1,5 e de interceptação ×1,5 |
| Predator Hawk | `DEEP_PASS` e `PLAY_ACTION`: `edge` do ataque ÷1,15 |

**Clash.** Se o capitão ofensivo e o defensivo estão na zona e ambos são atores, os dois perks são ignorados e sai `ZONE_CLASH`. O pulse não é afetado pelo clash.

Todos os valores desta tabela e da seção 5.2 são **pontos de partida**, calibrados na seção 8.

### 5.5 Timeout do técnico

- Ação nova: `{ type: 'USE_TIMEOUT'; team: TeamKey }`. Válida em `FORMATION` ou `PACKAGE`, por qualquer um dos times, uma vez por time por snap (`calledThisSnap`). A fase **não avança** e o timer **não é pausado**.
- Erros novos: `NO_TIMEOUTS_LEFT`, `TIMEOUT_NOT_ALLOWED` (fase errada, ou já usou neste snap).
- Efeito: `timeouts[team] -= 1`. Se o momentum favorece o **rival**, ele é cortado pela metade em direção a 0 (arredondado para 0). A sequência do rival zera. Os dois capitães do rival saem da zona (`cause: 'TIMEOUT'`). Sai `TIMEOUT_CALLED` e, se mudou, `MOMENTUM` com `reason: 'TIMEOUT'`.
- Distinto do `TIMEOUT` já existente, que é a ação padrão do estouro de timer. Esse ganha um `team?` opcional: em `PLAYCALL`, com `team`, só o padrão desse time é jogado (é o que o servidor usa no prazo curto do pulse).

## 6. Protocolo

- Mensagem nova do cliente: `play:timeout: { turnId }`. O servidor valida o `turnId` como nas demais jogadas e envia `USE_TIMEOUT` ao engine.
- `PlayerView.rhythm` (público para os dois jogadores): `momentum`, `tier`, `dominant`, `timeouts`, e a zona dos quatro capitães (`species`, `xFactor`, `progress`, `inZone`). O adversário vê tudo, como no futebol.
- `match:result` já carrega os eventos novos; o cliente não precisa de mensagem extra.
- `ReplayData` não muda: as ações guardam o `USE_TIMEOUT`, e o `Team` já inclui `captains`.

## 7. Servidor

- `play:timeout` repassa ao engine, manda `match:reveal` com os eventos (`TIMEOUT_CALLED`, `MOMENTUM`...) aos dois e reenvia a `match:phase` com a `view` atualizada, sem mudar `deadline` nem `turnId`.
- O desconto do nível 1/2 vale só no `PLAYCALL`: o `deadline` da `match:phase` do jogador pressionado é o cheio menos `PULSE_PLAYCALL_CUT_SECONDS` (2 s); o do outro não muda. Um timer próprio, no prazo curto, aplica `{ type: 'TIMEOUT', team }` só para ele. Se o outro jogador já tinha escolhido, a jogada resolve nesse momento.
- Reconexão e `match:resync` não precisam de trabalho extra: o estado vive na `PlayerView`.

## 8. Simulador, bot e balanceamento

- `packages/sim`: `assignCaptains(team)` dá a um time um capitão ofensivo e um defensivo escolhidos pelo hash do elenco (sem consumir RNG, para não mudar a geração de times); `withPerk(team, xFactor)` dá só um, para isolar o perk. `runSim({ captains: true })` aplica `assignCaptains` a todos. O bot usa `USE_TIMEOUT` (50% das vezes) quando o rival domina em nível ≥ 1, ainda tem timeout e não chamou neste snap.
- O portão `test:gate` ganha um cenário **com capitães**. Critérios (limites numéricos fixados no plano a partir dos do portão atual):
  1. Espelho: o mesmo time contra ele mesmo, ambos com capitães, fica dentro do intervalo de Wilson de 50%.
  2. Cada perk, isolado, move a taxa de vitória do time com capitães para além de um piso e abaixo de um teto, contra o mesmo time sem capitães.
  3. A taxa de partidas em que o momentum passa de 80 para algum lado fica abaixo de um teto (para o pulse não decidir sozinho).
- Os valores das seções 5.1, 5.2 e 5.4 são ajustados contra esse portão.

## 9. Testes

1. Cada linha da tabela 5.1, mais o limite [−100, 100] e a ordem de aplicação.
2. Cada gatilho e cada saída de zona da seção 5.3, incluindo a regra de que o capitão só conta se for ator.
3. Cada perk altera a probabilidade esperada, com sorteios fixos (as 5 amostras do RNG).
4. Clash: ambos na zona e atores → perks anulados, `ZONE_CLASH` emitido, pulse mantido.
5. Timeout: contagem, fase errada, uso duplo no snap, efeito em momentum, sequência e zona.
6. Determinismo: o replay de uma partida com zona e timeout reproduz o placar e os eventos.
7. Regressão: com `PlayModifiers` neutro, `resolvePlay` é idêntico ao de antes; com `MatchConfig.rhythm: false`, o golden atual (seed 2026) continua passando sem alteração. Com o ritmo ligado há um golden novo.
8. Validação de `captains` e compatibilidade com o código de time antigo.
9. Servidor: `play:timeout`, deadline reduzida só para o pressionado, `resync` com `rhythm`.

## 10. Fora de escopo (Parte 2)

Escolha de capitão no builder e no Draft; barra de pulse abaixo do placar; aura sob o capitão; tremor e áudio abafado do nível 2; névoa tática; carimbo visual do Telepathic Pocket; animação do clash; os três efeitos sonoros do md (`x_factor_activated`, `stadium_pulse_heartbeat`, `crowd_roar_swell`), a serem sintetizados no motor de áudio 8-bit existente; botão de timeout no HUD. Também fora: capitães nos times sugeridos, que entram no rebalanceamento depois.
