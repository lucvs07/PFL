# PFL — Plano 2: Simulador de Balanceamento e Conteúdo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar o catálogo de cartas (60 de tipo + 20 de assinatura), entregar 6 times sugeridos válidos e criar `packages/sim`, com o bot heurístico, o gerador de times aleatórios, o runner bot × bot, o relatório de balanceamento, a CLI `npm run sim -- --games N` e o portão de balanceamento calibrado.

**Architecture:** O conteúdo novo (cartas e times sugeridos) entra no `@pfl/engine` como dado puro. O `PlayOutcome` ganha os fatores da resolução (`readFactor`, `statFactor`, `varianceFactor`) para o relatório medir a contribuição de cada etapa. O novo workspace `@pfl/sim` só consome a API pública do engine:
- o bot decide a partir de `playerView` + os dados do próprio time, nunca do estado do adversário;
- o runner joga confrontos em pares com os lados trocados;
- o relatório agrega os eventos;
- um teste Vitest determinístico funciona como portão (spec 7.3).

**Tech Stack:** Node 24, npm workspaces, TypeScript (strict), Vitest, tsx.

**Spec:** `docs/superpowers/specs/2026-10-10-pfl-core-design.md`. **Contratos:** `docs/superpowers/plans/2026-10-10-pfl-contracts.md` (seção 1 é o que este plano produz). **Depende de:** `docs/superpowers/plans/2026-10-10-pfl-plan-1-engine.md`, executado por completo antes deste plano. Todos os nomes de arquivo, função e tipo do Plano 1 são usados como estão lá.

**Ambiente de referência:** este plano foi validado numa cópia literal do Plano 1, com os dados reais da PokéAPI. Todos os testes abaixo passaram, e os números de simulação citados vêm dessa cópia (cerca de 21 ms por partida). Se o Plano 1 tiver sido executado com qualquer diferença, os números podem mudar, mas o procedimento continua valendo.

**Pré-condição de typecheck:** o Plano 1, como está escrito, deixa 4 erros de `npm run typecheck`. Este plano espera que eles já tenham sido corrigidos na execução do Plano 1. Se aparecerem, **não mexa no código deste plano para escondê-los**: corrija na origem.
- Dois erros estão em `packages/data/scripts/build-data.ts`: `Property 'types'` e `Property 'damage_relations' does not exist`. O retorno de `earliest<T>` perde o tipo da entrada.
- Dois estão em `packages/engine/test/fatigue.test.ts`: o literal `{ levels: { 25: 2 }, resting: [25] }` é inferido com tipo estreito. Anote como `FatigueState`.

**Observação sobre "35 ids":** o catálogo do Plano 1 tem **40** cartas, divididas assim:
- 3 básicas e 2 especiais;
- 15 + 15 de tipo;
- 5 de assinatura.

Os "35" do contrato são as cartas de tipo e de assinatura. Este plano preserva as **40**: a Task 2 fixa num teste o significado de cada uma (lado, categoria, origem, elemento e requisitos).

## Global Constraints

- Node ≥ 24 e npm (workspaces). **Não usar pnpm/yarn.**
- TypeScript `strict: true`. `packages/engine` **sem dependências de runtime**.
- Determinismo: toda aleatoriedade vem de `rngNext`/`rngShuffle`. **Nunca usar `Math.random`** (nem no engine, nem no sim).
- Identificadores de código em inglês. Comentários, mensagens e nomes de cartas em português.
- "**De tipo (~60):** cerca de 2 de ataque e 2 de defesa para cada um dos 15 tipos." (spec 3.3)
- "**Assinatura (~20):** ligadas a espécie ou linha evolutiva." (spec 3.3)
- "Todos os 35 ids do Plano 1 continuam existindo, com o mesmo significado." (contracts.md, seção 1)
- "**15 tipos:** Normal, Fogo, Água, Planta, Elétrico, Gelo, Lutador, Venenoso, Terra, Voador, Psíquico, Inseto, Pedra, Fantasma, Dragão." Tipagem original: "Magnemite = Elétrico puro, Clefairy = Normal." (spec 4.1)
- "**12 cartas de ataque + 12 de defesa**, no máximo **2 cópias** de cada carta." (spec 3.4)
- "**Na montagem**, uma carta só entra no deck se o elenco consegue cumprir os requisitos dela." (spec 3.4)
- "**16 Pokémon de linha + 1 especialista**". "**No máximo 1 lendário** por time: Articuno, Zapdos, Moltres, Mewtwo, Mew." (spec 5.1)
- "**Custo** = `max(1, round((BST − 180) / 30))`". "**Teto: 120 pontos** para os 17 Pokémon (o especialista conta)." (spec 5.2)
- "**6 times sugeridos** prontos e válidos, incluídos no client." (spec 5.5)
- `export const SUGGESTED_TEAMS: readonly Team[]; // 6 times válidos (validateTeam === [])` em `packages/engine/src/teams/suggested.ts`, reexportado em `src/index.ts`. (contracts.md, seção 1)
- `export function botAction(state: MatchState, team: TeamKey, rng: number): { action: Action; rng: number };` em `packages/sim/src/bot.ts`. (contracts.md, seção 1)
- "`npm run sim -- --games N`: simulador do Plano 2" (contracts.md, seção 4)
- "Um **bot simples** (heurística por down & distance, com aleatoriedade ponderada) joga N partidas bot × bot com times sugeridos e times aleatórios válidos." (spec 7.3)
- O relatório traz (spec 7.3):
  - win rate por carta e por categoria;
  - média e distribuição de jardas por resultado de leitura;
  - taxa de acerto de leitura;
  - pontos por posse;
  - duração em jogadas;
  - impacto observado de tipo e de stats.
- "**Portão de balanceamento:** nenhuma carta com win rate (das partidas em que foi jogada) fora de **45%–55%**" (spec 7.3). "**Simulador:** roda no CI como portão de balanceamento (seção 7.3), com N reduzido para velocidade." (spec 9)
- Números **fixados pela spec**, que a calibração não pode mexer sem pedir ao usuário:
  - **Leitura:** ✖ ×1,6, · ×1,0, ✔ ×0,4 com risco ×2.
  - **Tipos:** 4x +30%, 2x +15%, 1x 0, ½x −15%, ¼x −30%, 0x −40%; afinidade +10% por ator.
  - **Variância:** ±15%.
  - **Fadiga:** +1 por ator, +½ para QB/OL; limiar 2 (3 se HP ≥ 100); −1 por jogada fora de campo; −2 entre drives; −10% por nível acima do limiar.

## Review Focus

1. **O bot lendo informação escondida.** Na fase `PLAYCALL`, `MatchState.cards.offense` já pode estar preenchido quando a defesa decide. Se o bot ler isso, a taxa de leitura e todo win rate por carta ficam sem sentido.
   - Esperado: o bot decide só com `playerView(state, team)` e os dados do próprio time.
   - Teste na Task 5: a carta da defesa é idêntica com ou sem a escolha prévia do ataque.
2. **Argumentos inválidos na CLI.** Casos: `--games` ausente, `0`, negativo, decimal, texto, ou seguido de outra flag; opção desconhecida.
   - Esperado: mensagem clara com o uso correto e código de saída 2, nunca uma simulação vazia ou um stack trace.
   - Testes na Task 9.
3. **Gerador de times aleatórios sem saída.** Um elenco sorteado pode não liberar 6 cartas distintas jogáveis de um lado.
   - Esperado: tentativas limitadas e determinísticas, depois um erro claro. Nunca loop infinito.
   - Testes na Task 6: `maxAttempts = 0` lança erro; 150 seeds geram times válidos.
4. **Partida que não termina** (prorrogações em sequência, ou um bug do bot que repete ação).
   - Esperado: o runner para em `maxSteps` e lança erro com a seed, para reproduzir. A simulação não pode travar.
   - Teste na Task 7.
5. **Time sugerido quebrado por edição de catálogo ou calibração.** Uma mudança de requisito ou de carta pode invalidar um time sugerido, ou deixar no deck uma carta que nunca fica jogável com os titulares (carta morta na mão do jogador).
   - Esperado: os 6 times seguem com `validateTeam === []` e sem cartas mortas.
   - Testes na Task 3, executados de novo em cada iteração da Task 10.

---

## File Structure

```
pfl/
  package.json                          (Modify) script "sim"
  packages/
    engine/
      src/
        model.ts                        (Modify) PlayOutcome + readFactor/statFactor/varianceFactor
        resolve.ts                      (Modify) exporta READ_YARDS e preenche os fatores
        cards/catalog.ts                (Modify) +45 cartas (catálogo completo)
        cards/categories.ts             (Modify, Task 10) calibração de OFFENSE_PROFILES
        teams/suggested.ts              (Create) SUGGESTED_TEAMS
        index.ts                        (Modify) reexporta teams/suggested
      test/
        field.test.ts                   (Modify) helper o() com os novos campos
        outcome-factors.test.ts         (Create)
        catalog-full.test.ts            (Create)
        suggested.test.ts               (Create)
    sim/
      package.json                      (Create) @pfl/sim
      src/
        pick.ts                         sorteio ponderado determinístico
        bot.ts                          botAction, botDecide, actingTeams, heurísticas
        random-team.ts                  randomTeam, buildDepth, usableCards
        runner.ts                       playMatch, runSim
        report.ts                       buildReport, balanceGate, formatReport
        cli.ts                          parseArgs, main (npm run sim)
        index.ts                        reexporta o pacote
      test/
        pick.test.ts, bot.test.ts, random-team.test.ts, runner.test.ts,
        report.test.ts, cli.test.ts, balance-gate.test.ts
```

---

### Task 1: Fatores da resolução no `PlayOutcome`

**Files:**
- Modify: `packages/engine/src/model.ts` (interface `PlayOutcome`)
- Modify: `packages/engine/src/resolve.ts` (constante `READ_YARDS` e função `make` dentro de `resolvePlay`)
- Modify: `packages/engine/test/field.test.ts` (helper `o`)
- Test: `packages/engine/test/outcome-factors.test.ts`

**Interfaces:**
- Consumes (Plano 1):
  - `resolvePlay(input: PlayInput): { outcome: PlayOutcome; rng: number }`
  - `OFFENSE_PROFILES`, `pickLineup`, `initialFatigue`, `FORMATIONS`, `PACKAGES`, `getCard`
  - fixture `electricTeam`
- Produces:
  - `PlayOutcome` com três campos novos, obrigatórios: `readFactor: number`, `statFactor: number`, `varianceFactor: number`
  - `export const READ_YARDS: Record<ReadResult, number>` em `resolve.ts`
  - Invariante: num `GAIN` sem big play, `yards === round(base × readFactor × statFactor × offTypeMult / defTypeMult × varianceFactor) − (read === 'RIGHT' ? 2 : 0)`

- [ ] **Step 1: Escrever o teste (deve falhar)**

`packages/engine/test/outcome-factors.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resolvePlay, READ_YARDS } from '../src/resolve';
import { OFFENSE_PROFILES } from '../src/cards/categories';
import { pickLineup, initialFatigue } from '../src/fatigue';
import { FORMATIONS, PACKAGES } from '../src/formations';
import { getCard } from '../src/cards/catalog';
import { electricTeam } from './fixtures';

const team = electricTeam();
const offLineup = pickLineup(FORMATIONS.PISTOL, team, initialFatigue());
const defLineup = pickLineup(PACKAGES.BASE, team, initialFatigue());
const PAIRS: [string, string][] = [
  ['basic_run', 'basic_defense'],
  ['electric_thunder_screen', 'electric_paralysis'],
  ['bug_quick_bite', 'normal_wall'],
  ['ground_earthquake', 'ground_dig'],
  ['basic_pass', 'psychic_foresight'],
];

describe('PlayOutcome expõe os fatores da resolução', () => {
  it('readFactor segue a leitura e os fatores ficam nas faixas da spec', () => {
    for (const [o, d] of PAIRS) {
      for (let seed = 1; seed <= 300; seed++) {
        const { outcome } = resolvePlay({
          offCard: getCard(o), defCard: getCard(d), offLineup, defLineup, offFatigue: {}, defFatigue: {}, rng: seed * 7919,
        });
        expect(outcome.readFactor).toBe(READ_YARDS[outcome.read]);
        expect(outcome.statFactor).toBeGreaterThanOrEqual(0.6);
        expect(outcome.statFactor).toBeLessThanOrEqual(1.4);
        const v = OFFENSE_PROFILES[getCard(o).category as keyof typeof OFFENSE_PROFILES].variance;
        expect(outcome.varianceFactor).toBeGreaterThanOrEqual(1 - v);
        expect(outcome.varianceFactor).toBeLessThanOrEqual(1 + v);
      }
    }
  });

  it('as jardas de um GAIN comum são o produto dos fatores', () => {
    let checked = 0;
    for (const [o, d] of PAIRS) {
      for (let seed = 1; seed <= 300; seed++) {
        const offCard = getCard(o);
        const { outcome } = resolvePlay({
          offCard, defCard: getCard(d), offLineup, defLineup, offFatigue: {}, defFatigue: {}, rng: seed * 104729,
        });
        if (outcome.kind !== 'GAIN' || outcome.bigPlay) continue;
        const base = offCard.baseYards ?? OFFENSE_PROFILES[offCard.category as keyof typeof OFFENSE_PROFILES].baseYards;
        const edge = (outcome.statFactor * outcome.offTypeMult) / outcome.defTypeMult;
        const expected = Math.round(base * outcome.readFactor * edge * outcome.varianceFactor) - (outcome.read === 'RIGHT' ? 2 : 0);
        expect(outcome.yards).toBe(expected);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(500);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/engine/test/outcome-factors.test.ts`
Expected: FAIL. O motivo é `READ_YARDS` não exportado: `TypeError: Cannot read properties of undefined` ou "does not provide an export named 'READ_YARDS'". Nos dois casos, `outcome.readFactor` é `undefined`.

- [ ] **Step 3: Estender `PlayOutcome`**

Em `packages/engine/src/model.ts`, substituir:
```ts
  offTypeMult: number;
  defTypeMult: number;
}
```
por:
```ts
  offTypeMult: number;
  defTypeMult: number;
  /** multiplicador da leitura aplicado às jardas (1,6 / 1,0 / 0,4) */
  readFactor: number;
  /** razão de stats ataque/defesa, já limitada a [0,6; 1,4] */
  statFactor: number;
  /** fator de variância sorteado, em [1 − v; 1 + v] */
  varianceFactor: number;
}
```

- [ ] **Step 4: Preencher os fatores em `resolve.ts`**

Em `packages/engine/src/resolve.ts`, substituir:
```ts
const READ_YARDS: Record<ReadResult, number> = { WRONG: 1.6, NEUTRAL: 1, RIGHT: 0.4 };
```
por:
```ts
export const READ_YARDS: Record<ReadResult, number> = { WRONG: 1.6, NEUTRAL: 1, RIGHT: 0.4 };
```

E substituir:
```ts
  const make = (kind: PlayKind, yards: number, bigPlay = false): PlayOutcome =>
    ({ kind, yards, bigPlay, read, offActors, defActors, offTypeMult, defTypeMult });
```
por:
```ts
  const make = (kind: PlayKind, yards: number, bigPlay = false): PlayOutcome =>
    ({
      kind, yards, bigPlay, read, offActors, defActors, offTypeMult, defTypeMult,
      readFactor: READ_YARDS[read], statFactor, varianceFactor: variance,
    });
```

- [ ] **Step 5: Atualizar o helper do teste de campo**

Os campos novos são obrigatórios, então o literal de `PlayOutcome` em `packages/engine/test/field.test.ts` deixa de compilar. Substituir:
```ts
  kind, yards, bigPlay: false, read: 'NEUTRAL', offActors: [], defActors: [], offTypeMult: 1, defTypeMult: 1,
});
```
por:
```ts
  kind, yards, bigPlay: false, read: 'NEUTRAL', offActors: [], defActors: [], offTypeMult: 1, defTypeMult: 1,
  readFactor: 1, statFactor: 1, varianceFactor: 1,
});
```

- [ ] **Step 6: Rodar a suíte e o typecheck**

Run: `npm test && npm run typecheck`
Expected:
- Tudo PASS, incluindo os 2 testes novos.
- O snapshot golden de `full-match.test.ts` **não muda**: ele guarda só placar, `turnId` e número de ações, e os sorteios não mudaram. Se mudar, pare: a ordem dos sorteios foi alterada por engano.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/model.ts packages/engine/src/resolve.ts packages/engine/test/field.test.ts packages/engine/test/outcome-factors.test.ts
git commit -m "feat(engine): PlayOutcome expõe os fatores de leitura, stats e variância"
```

---

### Task 2: Catálogo completo de cartas (60 de tipo + 20 de assinatura)

**Files:**
- Modify: `packages/engine/src/cards/catalog.ts` (acrescentar ao fim do array `CARDS`)
- Test: `packages/engine/test/catalog-full.test.ts`

**Interfaces:**
- Consumes (Plano 1):
  - `CARDS`, `getCard`, os helpers locais `offense`, `defense`, `byType` e `bySpecies` de `catalog.ts`
  - `ALL_SPECIES`, `matchesRequirement`, `POKEMON_TYPES`
- Produces:
  - `CARDS` com **85** cartas: 3 básicas, 2 especiais, 60 de tipo (2 de ataque + 2 de defesa por tipo) e 20 de assinatura (10 de cada lado). Os 45 ids novos estão no Step 3.
  - Distribuição das cartas de tipo: **5 por categoria de ataque** e **6 por categoria de defesa**.
  - As 40 cartas do Plano 1 mantêm lado, categoria, origem, elemento e requisitos. Só `baseYards` pode mudar, e só na calibração (Task 10).

**Escolhas de conteúdo:**
- Todo requisito pode ser cumprido por Pokémon reais da Gen 1. Em particular:
  - Gelo existe só em Jynx, Dewgong, Cloyster, Lapras e Articuno.
  - Fantasma só na linha do Gastly.
  - Dragão só na linha do Dratini.
  - Por isso nenhum requisito desses três tipos pede `count` maior que 1.
- Cada carta de tipo exige o próprio tipo da carta.
- As de assinatura citam linhas evolutivas inteiras quando faz sentido: Abra/Kadabra/Alakazam, Dratini/Dragonair/Dragonite, Machop/Machoke/Machamp, Gastly/Haunter/Gengar.

- [ ] **Step 1: Escrever o teste (deve falhar)**

`packages/engine/test/catalog-full.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { CARDS, getCard } from '../src/cards/catalog';
import { ALL_SPECIES } from '../src/species';
import { matchesRequirement } from '../src/cards/eligibility';
import { POKEMON_TYPES, type Card } from '../src/model';

/** As 40 cartas do Plano 1 (35 de tipo/assinatura + 5 básicas/especiais). O significado não pode mudar. */
const PLAN1_CARDS: Omit<Card, 'name' | 'baseYards'>[] = [
  { id: 'basic_run', side: 'OFFENSE', category: 'RUN_INSIDE', origin: 'BASIC', element: null, requirements: [] },
  { id: 'basic_pass', side: 'OFFENSE', category: 'SHORT_PASS', origin: 'BASIC', element: null, requirements: [] },
  { id: 'basic_defense', side: 'DEFENSE', category: 'BASE_D', origin: 'BASIC', element: null, requirements: [] },
  { id: 'punt', side: 'OFFENSE', category: 'PUNT', origin: 'SPECIAL', element: null, requirements: [] },
  { id: 'field_goal', side: 'OFFENSE', category: 'FIELD_GOAL', origin: 'SPECIAL', element: null, requirements: [] },
  { id: 'normal_tackle', side: 'OFFENSE', category: 'RUN_INSIDE', origin: 'TYPE', element: 'normal', requirements: [{ position: 'RB', types: ['normal'], count: 1 }] },
  { id: 'fire_deep', side: 'OFFENSE', category: 'DEEP_PASS', origin: 'TYPE', element: 'fire', requirements: [{ position: 'WR', types: ['fire'], count: 1 }] },
  { id: 'water_surf_route', side: 'OFFENSE', category: 'DEEP_PASS', origin: 'TYPE', element: 'water', requirements: [{ position: 'QB', types: ['water'], count: 1 }, { position: 'WR', types: ['water'], count: 1 }] },
  { id: 'grass_vine_screen', side: 'OFFENSE', category: 'SCREEN', origin: 'TYPE', element: 'grass', requirements: [{ position: 'RB', types: ['grass'], count: 1 }] },
  { id: 'electric_thunder_screen', side: 'OFFENSE', category: 'SCREEN', origin: 'TYPE', element: 'electric', requirements: [{ position: 'RB', types: ['electric'], count: 1 }, { position: 'WR', types: ['electric'], count: 1 }] },
  { id: 'ice_beam_slant', side: 'OFFENSE', category: 'SHORT_PASS', origin: 'TYPE', element: 'ice', requirements: [{ position: 'WR', types: ['ice'], count: 1 }] },
  { id: 'fighting_submission', side: 'OFFENSE', category: 'RUN_INSIDE', origin: 'TYPE', element: 'fighting', requirements: [{ position: 'RB', types: ['fighting'], count: 1 }] },
  { id: 'poison_powder_fake', side: 'OFFENSE', category: 'PLAY_ACTION', origin: 'TYPE', element: 'poison', requirements: [{ position: 'RB', types: ['poison'], count: 1 }] },
  { id: 'ground_earthquake', side: 'OFFENSE', category: 'RUN_OUTSIDE', origin: 'TYPE', element: 'ground', requirements: [{ position: 'RB', types: ['ground'], count: 1 }] },
  { id: 'flying_air_raid', side: 'OFFENSE', category: 'DEEP_PASS', origin: 'TYPE', element: 'flying', requirements: [{ position: 'WR', types: ['flying'], count: 1 }] },
  { id: 'psychic_confusion', side: 'OFFENSE', category: 'PLAY_ACTION', origin: 'TYPE', element: 'psychic', requirements: [{ position: 'QB', types: ['psychic'], count: 1 }] },
  { id: 'bug_quick_bite', side: 'OFFENSE', category: 'SHORT_PASS', origin: 'TYPE', element: 'bug', requirements: [{ position: 'WR', types: ['bug'], count: 1 }] },
  { id: 'rock_avalanche', side: 'OFFENSE', category: 'RUN_INSIDE', origin: 'TYPE', element: 'rock', requirements: [{ position: 'OL', types: ['rock'], count: 2 }] },
  { id: 'ghost_night_shade', side: 'OFFENSE', category: 'PLAY_ACTION', origin: 'TYPE', element: 'ghost', requirements: [{ position: 'WR', types: ['ghost'], count: 1 }] },
  { id: 'dragon_rage_sweep', side: 'OFFENSE', category: 'RUN_OUTSIDE', origin: 'TYPE', element: 'dragon', requirements: [{ position: 'RB', types: ['dragon'], count: 1 }] },
  { id: 'normal_wall', side: 'DEFENSE', category: 'RUN_STUFF', origin: 'TYPE', element: 'normal', requirements: [{ position: 'DL', types: ['normal'], count: 1 }] },
  { id: 'fire_crossfire', side: 'DEFENSE', category: 'BLITZ', origin: 'TYPE', element: 'fire', requirements: [{ position: 'LB', types: ['fire'], count: 1 }] },
  { id: 'water_high_tide', side: 'DEFENSE', category: 'ZONE_DEEP', origin: 'TYPE', element: 'water', requirements: [{ position: 'S', types: ['water'], count: 1 }] },
  { id: 'grass_sleep_powder', side: 'DEFENSE', category: 'ZONE_SHORT', origin: 'TYPE', element: 'grass', requirements: [{ position: 'LB', types: ['grass'], count: 1 }] },
  { id: 'electric_paralysis', side: 'DEFENSE', category: 'MAN', origin: 'TYPE', element: 'electric', requirements: [{ position: 'CB', types: ['electric'], count: 1 }] },
  { id: 'ice_blizzard', side: 'DEFENSE', category: 'ZONE_DEEP', origin: 'TYPE', element: 'ice', requirements: [{ position: 'S', types: ['ice'], count: 1 }] },
  { id: 'fighting_low_kick', side: 'DEFENSE', category: 'BLITZ', origin: 'TYPE', element: 'fighting', requirements: [{ position: 'LB', types: ['fighting'], count: 1 }] },
  { id: 'poison_toxic', side: 'DEFENSE', category: 'RUN_STUFF', origin: 'TYPE', element: 'poison', requirements: [{ position: 'DL', types: ['poison'], count: 1 }] },
  { id: 'ground_dig', side: 'DEFENSE', category: 'BLITZ', origin: 'TYPE', element: 'ground', requirements: [{ position: 'DL', types: ['ground'], count: 1 }] },
  { id: 'flying_gust', side: 'DEFENSE', category: 'MAN', origin: 'TYPE', element: 'flying', requirements: [{ position: 'CB', types: ['flying'], count: 1 }] },
  { id: 'psychic_foresight', side: 'DEFENSE', category: 'ZONE_SHORT', origin: 'TYPE', element: 'psychic', requirements: [{ position: 'S', types: ['psychic'], count: 1 }] },
  { id: 'bug_string_shot', side: 'DEFENSE', category: 'ZONE_SHORT', origin: 'TYPE', element: 'bug', requirements: [{ position: 'CB', types: ['bug'], count: 1 }] },
  { id: 'rock_slide_wall', side: 'DEFENSE', category: 'RUN_STUFF', origin: 'TYPE', element: 'rock', requirements: [{ position: 'DL', types: ['rock','ground'], count: 3 }] },
  { id: 'ghost_lick', side: 'DEFENSE', category: 'MAN', origin: 'TYPE', element: 'ghost', requirements: [{ position: 'CB', types: ['ghost'], count: 1 }] },
  { id: 'dragon_wrath', side: 'DEFENSE', category: 'BLITZ', origin: 'TYPE', element: 'dragon', requirements: [{ position: 'DL', types: ['dragon'], count: 1 }] },
];

describe('catálogo completo (Plano 2)', () => {
  it('preserva as cartas do Plano 1 com o mesmo significado', () => {
    for (const expected of PLAN1_CARDS) {
      const card = getCard(expected.id);
      expect({
        id: card.id, side: card.side, category: card.category, origin: card.origin,
        element: card.element, requirements: card.requirements,
      }).toEqual(expected);
    }
  });

  it('tem exatamente 2 cartas de ataque e 2 de defesa por tipo', () => {
    for (const t of POKEMON_TYPES) {
      expect(CARDS.filter((c) => c.origin === 'TYPE' && c.side === 'OFFENSE' && c.element === t)).toHaveLength(2);
      expect(CARDS.filter((c) => c.origin === 'TYPE' && c.side === 'DEFENSE' && c.element === t)).toHaveLength(2);
    }
    expect(CARDS.filter((c) => c.origin === 'TYPE')).toHaveLength(60);
  });

  it('tem 20 cartas de assinatura, 10 de cada lado', () => {
    const sig = CARDS.filter((c) => c.origin === 'SIGNATURE');
    expect(sig).toHaveLength(20);
    expect(sig.filter((c) => c.side === 'OFFENSE')).toHaveLength(10);
  });

  it('tem 85 cartas, ids e nomes únicos', () => {
    expect(CARDS).toHaveLength(85);
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
    expect(new Set(CARDS.map((c) => c.name)).size).toBe(CARDS.length);
  });

  it('distribui as categorias: 5 cartas de tipo por categoria de ataque e 6 por categoria de defesa', () => {
    const count = (cat: string) => CARDS.filter((c) => c.origin === 'TYPE' && c.category === cat).length;
    for (const cat of ['RUN_INSIDE', 'RUN_OUTSIDE', 'SHORT_PASS', 'DEEP_PASS', 'SCREEN', 'PLAY_ACTION']) expect(count(cat)).toBe(5);
    for (const cat of ['RUN_STUFF', 'BLITZ', 'MAN', 'ZONE_SHORT', 'ZONE_DEEP']) expect(count(cat)).toBe(6);
  });

  it('todo requisito pode ser cumprido por Pokémon reais da Gen 1 (tipagem de Kanto)', () => {
    for (const card of CARDS) {
      for (const req of card.requirements) {
        const able = ALL_SPECIES.filter((s) => matchesRequirement(s, req));
        expect(able.length, `${card.id} / ${req.position}`).toBeGreaterThanOrEqual(req.count ?? 1);
      }
    }
  });

  it('cartas de assinatura citam espécies existentes e só elas', () => {
    for (const card of CARDS.filter((c) => c.origin === 'SIGNATURE')) {
      expect(card.requirements.length).toBeGreaterThan(0);
      for (const req of card.requirements) {
        expect(req.species, card.id).toBeDefined();
        for (const id of req.species!) expect(ALL_SPECIES.some((s) => s.id === id), `${card.id}: ${id}`).toBe(true);
      }
    }
  });

  it('cartas de tipo exigem o próprio tipo da carta', () => {
    for (const card of CARDS.filter((c) => c.origin === 'TYPE')) {
      expect(card.requirements.some((r) => r.types?.includes(card.element!)), card.id).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/engine/test/catalog-full.test.ts`
Expected: FAIL nos testes de contagem. Por exemplo, `expected [ …1 item ] to have length 2` em "2 cartas por tipo" e `expected 40 to have length 85`. O teste de preservação das cartas do Plano 1 já passa.

- [ ] **Step 3: Acrescentar as 45 cartas novas**

Em `packages/engine/src/cards/catalog.ts`, logo depois da última linha do array (a carta `sig_gyarados_hyper_beam`) e antes do `];`, inserir:
```ts
  // ---- Plano 2: catálogo completo ----
  // Ataque por tipo (2ª carta de cada tipo)
  offense('normal_quick_attack', 'Ataque Rápido', 'RUN_OUTSIDE', 'normal', [byType('RB', ['normal'])]),
  offense('fire_blast_fake', 'Explosão de Fogo', 'PLAY_ACTION', 'fire', [byType('QB', ['fire'])]),
  offense('water_gun_slant', "Jato d'Água", 'SHORT_PASS', 'water', [byType('WR', ['water'])]),
  offense('grass_petal_dance', 'Dança das Pétalas', 'RUN_INSIDE', 'grass', [byType('OL', ['grass'], 2)]),
  offense('electric_thunder_bomb', 'Trovão', 'DEEP_PASS', 'electric', [byType('QB', ['electric'])]),
  offense('ice_aurora_screen', 'Raio Aurora', 'SCREEN', 'ice', [byType('RB', ['ice'])]),
  offense('fighting_rolling_kick', 'Chute Giratório', 'RUN_OUTSIDE', 'fighting', [byType('WR', ['fighting'])]),
  offense('poison_acid_screen', 'Ácido', 'SCREEN', 'poison', [byType('RB', ['poison'])]),
  offense('ground_bonemerang', 'Bumerangue de Osso', 'SHORT_PASS', 'ground', [byType('WR', ['ground'])]),
  offense('flying_sky_attack', 'Ataque do Céu', 'PLAY_ACTION', 'flying', [byType('QB', ['flying'])]),
  offense('psychic_psybeam', 'Psicorraio', 'SHORT_PASS', 'psychic', [byType('WR', ['psychic'])]),
  offense('bug_pin_missile', 'Míssil de Agulhas', 'RUN_OUTSIDE', 'bug', [byType('RB', ['bug'])]),
  offense('rock_throw_deep', 'Arremesso de Rocha', 'DEEP_PASS', 'rock', [byType('WR', ['rock'])]),
  offense('ghost_confuse_screen', 'Raio Confuso', 'SCREEN', 'ghost', [byType('RB', ['ghost'])]),
  offense('dragon_slam', 'Pancada do Dragão', 'RUN_INSIDE', 'dragon', [byType('RB', ['dragon'])]),

  // Defesa por tipo (2ª carta de cada tipo)
  defense('normal_body_slam', 'Pancada Corporal', 'BLITZ', 'normal', [byType('LB', ['normal'])]),
  defense('fire_ember', 'Brasas', 'MAN', 'fire', [byType('CB', ['fire'])]),
  defense('water_bubble', 'Bolhas', 'MAN', 'water', [byType('CB', ['water'])]),
  defense('grass_stun_spore', 'Pó Paralisante', 'ZONE_DEEP', 'grass', [byType('S', ['grass'])]),
  defense('electric_thundershock', 'Choque do Trovão', 'BLITZ', 'electric', [byType('DL', ['electric'])]),
  defense('ice_punch', 'Soco de Gelo', 'RUN_STUFF', 'ice', [byType('LB', ['ice'])]),
  defense('fighting_seismic_toss', 'Arremesso Sísmico', 'RUN_STUFF', 'fighting', [byType('DL', ['fighting'])]),
  defense('poison_gas', 'Gás Venenoso', 'ZONE_SHORT', 'poison', [byType('LB', ['poison'])]),
  defense('ground_fissure', 'Fissura', 'RUN_STUFF', 'ground', [byType('DL', ['ground'], 2)]),
  defense('flying_whirlwind', 'Remoinho', 'ZONE_DEEP', 'flying', [byType('S', ['flying'])]),
  defense('psychic_reflect', 'Reflexo', 'ZONE_DEEP', 'psychic', [byType('S', ['psychic'])]),
  defense('bug_twineedle', 'Agulha Dupla', 'ZONE_SHORT', 'bug', [byType('LB', ['bug'])]),
  defense('rock_barrier', 'Barreira de Pedras', 'ZONE_SHORT', 'rock', [byType('LB', ['rock'])]),
  defense('ghost_hypnosis', 'Hipnose', 'ZONE_DEEP', 'ghost', [byType('S', ['ghost'])]),
  defense('dragon_wrap', 'Enrolar', 'MAN', 'dragon', [byType('CB', ['dragon'])]),

  // Assinatura (15 novas; total 20)
  offense('sig_pikachu_volt', 'Choque de Pikachu', 'SCREEN', 'electric', [bySpecies('RB', [25, 26])], 'SIGNATURE', 7),
  offense('sig_machamp_karate', 'Golpe de Karatê', 'RUN_OUTSIDE', 'fighting', [bySpecies('WR', [66, 67, 68])], 'SIGNATURE', 6),
  offense('sig_dugtrio_dig', 'Cavar de Dugtrio', 'RUN_OUTSIDE', 'ground', [bySpecies('RB', [50, 51])], 'SIGNATURE', 6),
  offense('sig_alakazam_teleport', 'Teleporte', 'PLAY_ACTION', 'psychic', [bySpecies('QB', [63, 64, 65])], 'SIGNATURE', 13),
  offense('sig_onix_bind', 'Constrição de Onix', 'RUN_INSIDE', 'rock', [bySpecies('OL', [95])], 'SIGNATURE', 5),
  offense('sig_starmie_swift', 'Meteoro Estelar', 'SHORT_PASS', 'water', [bySpecies('WR', [120, 121])], 'SIGNATURE', 8),
  offense('sig_dragonite_hyper_beam', 'Hiper Raio Dragonite', 'DEEP_PASS', 'dragon', [bySpecies('WR', [147, 148, 149])], 'SIGNATURE', 20),
  defense('sig_snorlax_body_slam', 'Pancada de Snorlax', 'RUN_STUFF', 'normal', [bySpecies('DL', [143])], 'SIGNATURE'),
  defense('sig_cloyster_clamp', 'Concha Cloyster', 'RUN_STUFF', 'water', [bySpecies('DL', [90, 91])], 'SIGNATURE'),
  defense('sig_hitmonlee_kick', 'Chute Alto', 'BLITZ', 'fighting', [bySpecies('LB', [106])], 'SIGNATURE'),
  defense('sig_hitmonchan_counter', 'Contra-Ataque', 'MAN', 'fighting', [bySpecies('CB', [107])], 'SIGNATURE'),
  defense('sig_mrmime_barrier', 'Barreira Mímica', 'ZONE_SHORT', 'psychic', [bySpecies('S', [122])], 'SIGNATURE'),
  defense('sig_jynx_lovely_kiss', 'Beijo Encantado', 'ZONE_SHORT', 'ice', [bySpecies('CB', [124])], 'SIGNATURE'),
  defense('sig_gengar_dream_eater', 'Devorador de Sonhos', 'ZONE_DEEP', 'ghost', [bySpecies('S', [92, 93, 94])], 'SIGNATURE'),
  defense('sig_lapras_mist', 'Névoa de Lapras', 'ZONE_DEEP', 'ice', [bySpecies('S', [131])], 'SIGNATURE'),
```

O array continua fechando com `];` logo depois da última carta inserida (`sig_lapras_mist`).

- [ ] **Step 4: Rodar a suíte**

Run: `npm test && npm run typecheck`
Expected: PASS em tudo. Os testes do Plano 1 em `cards.test.ts` (ids únicos, ao menos 1 carta por tipo, todas as categorias) continuam passando.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/cards/catalog.ts packages/engine/test/catalog-full.test.ts
git commit -m "feat(engine): catálogo completo — 60 cartas de tipo e 20 de assinatura"
```

---

### Task 3: Seis times sugeridos

**Files:**
- Create: `packages/engine/src/teams/suggested.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/test/suggested.test.ts`

**Interfaces:**
- Consumes:
  - Plano 1: `Team`, `validateTeam`, `teamCost`, `SALARY_CAP`, `LEGENDARY_IDS`, `FORMATIONS`, `PACKAGES`, `OFFENSE_SLOTS`, `DEFENSE_SLOTS`, `pickLineup`, `initialFatigue`, `canPlay`, `getCard`
  - Task 2: cartas do catálogo completo
- Produces: `export const SUGGESTED_TEAMS: readonly Team[]` (contrato), reexportado por `@pfl/engine`. A ordem é fixa e os testes do sim dependem dela:

| # | Time | Tema | Custo |
|---|---|---|---|
| 0 | Relâmpagos de Vermilion | Elétrico/Normal/Voador | **120** |
| 1 | Chamas de Cinnabar | Fogo/Pedra/Lutador | **111** |
| 2 | Marés de Cerulean | Água/Gelo | **116** |
| 3 | Muralha de Pewter | Pedra/Terra/Lutador | **115** |
| 4 | Mentes de Saffron | Psíquico/Fantasma | **120** |
| 5 | Selva de Celadon | Planta/Venenoso/Inseto | **118** |

**Regras de montagem dos times:**
- Os custos vêm dos stats modernos da PokéAPI e da tipagem `past_types` mais antiga, com `Math.round` do JS (0,5 arredonda para cima). Exemplos: Tangela = 9, Golem = 11, Magmar = 11.
- Nenhum time usa lendário.
- Os titulares de cada lado são distintos.
- Cada vaga tem titular + 2 reservas, e as reservas priorizam quem não é titular daquele lado. Isso garante que `fillSlots` preenche todas as formações e pacotes.
- Cada deck tem 6 cartas distintas × 2 cópias, e todas ficam jogáveis com os titulares em ao menos uma formação ou pacote.

- [ ] **Step 1: Escrever o teste (deve falhar)**

`packages/engine/test/suggested.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { SUGGESTED_TEAMS } from '../src/index';
import { validateTeam, teamCost, SALARY_CAP } from '../src/team';
import { LEGENDARY_IDS } from '../src/species';
import { FORMATIONS, PACKAGES, OFFENSE_SLOTS, DEFENSE_SLOTS } from '../src/formations';
import { pickLineup, initialFatigue } from '../src/fatigue';
import { canPlay } from '../src/cards/eligibility';
import { getCard } from '../src/cards/catalog';

const EXPECTED_COST: Record<string, number> = {
  'Relâmpagos de Vermilion': 120,
  'Chamas de Cinnabar': 111,
  'Marés de Cerulean': 116,
  'Muralha de Pewter': 115,
  'Mentes de Saffron': 120,
  'Selva de Celadon': 118,
};

describe('SUGGESTED_TEAMS', () => {
  it('são 6 times com nomes únicos', () => {
    expect(SUGGESTED_TEAMS).toHaveLength(6);
    expect(new Set(SUGGESTED_TEAMS.map((t) => t.name)).size).toBe(6);
  });

  it.each(SUGGESTED_TEAMS.map((t) => [t.name, t] as const))('%s é válido', (_name, team) => {
    expect(validateTeam(team)).toEqual([]);
  });

  it('respeitam o teto com o custo documentado e no máximo 1 lendário', () => {
    for (const team of SUGGESTED_TEAMS) {
      expect(teamCost(team)).toBe(EXPECTED_COST[team.name]);
      expect(teamCost(team)).toBeLessThanOrEqual(SALARY_CAP);
      expect([...team.roster, team.specialist].filter((id) => LEGENDARY_IDS.includes(id)).length).toBeLessThanOrEqual(1);
    }
  });

  it('têm depth chart com titular e 2 reservas em todas as 20 vagas', () => {
    for (const team of SUGGESTED_TEAMS) {
      for (const slot of [...OFFENSE_SLOTS, ...DEFENSE_SLOTS]) {
        const ids = team.depth[slot] ?? [];
        expect(ids, `${team.name} ${slot}`).toHaveLength(3);
        expect(new Set(ids).size).toBe(3);
      }
    }
  });

  it('toda carta do deck é jogável com os titulares em ao menos uma formação/pacote', () => {
    for (const team of SUGGESTED_TEAMS) {
      const off = Object.values(FORMATIONS).map((f) => pickLineup(f, team, initialFatigue()));
      const def = Object.values(PACKAGES).map((p) => pickLineup(p, team, initialFatigue()));
      for (const id of team.offenseDeck) expect(off.some((l) => canPlay(getCard(id), l)), `${team.name}: ${id}`).toBe(true);
      for (const id of team.defenseDeck) expect(def.some((l) => canPlay(getCard(id), l)), `${team.name}: ${id}`).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/engine/test/suggested.test.ts`
Expected: FAIL. `SUGGESTED_TEAMS` é `undefined`: "expected undefined to have length 6", ou `TypeError` no `.map`.

- [ ] **Step 3: Criar os times**

`packages/engine/src/teams/suggested.ts`:
```ts
import type { Team } from '../model';

// Spec 5.5: 6 times sugeridos, prontos e válidos (validateTeam === []).
// Custo de cada espécie = max(1, round((BST − 180) / 30)); o total aparece no comentário de cada time.

export const SUGGESTED_TEAMS: readonly Team[] = [
  // Custo total 120/120. Elenco: 26 Raichu (10), 25 Pikachu (5), 135 Jolteon (12), 125 Electabuzz (10), 82 Magneton (10), 100 Voltorb (5), 18 Pidgeot (10), 22 Fearow (9), 128 Tauros (10), 20 Raticate (8), 95 Onix (7), 66 Machop (4), 74 Geodude (4), 52 Meowth (4), 21 Spearow (3), 84 Doduo (4).
  // Especialista: 81 Magnemite (5).
  {
    name: 'Relâmpagos de Vermilion',
    roster: [26, 25, 135, 125, 82, 100, 18, 22, 128, 20, 95, 66, 74, 52, 21, 84],
    specialist: 81,
    depth: {
      QB: [82, 22, 100],
      OL1: [95, 20, 22],
      OL2: [74, 84, 20],
      OL3: [66, 22, 21],
      RB: [25, 52, 84],
      WR1: [135, 100, 20],
      WR2: [26, 52, 100],
      WR3: [18, 22, 21],
      TE: [125, 84, 20],
      FB: [128, 84, 22],
      DL1: [128, 74, 95],
      DL2: [100, 66, 82],
      DL3: [20, 135, 74],
      LB1: [22, 135, 25],
      LB2: [84, 135, 82],
      CB1: [125, 135, 25],
      CB2: [52, 135, 25],
      CB3: [21, 95, 135],
      S1: [18, 82, 95],
      S2: [26, 25, 82],
    },
    keepOnField: [],
    offenseDeck: [
      'rock_avalanche', 'rock_avalanche',
      'electric_thunder_bomb', 'electric_thunder_bomb',
      'electric_thunder_screen', 'electric_thunder_screen',
      'sig_onix_bind', 'sig_onix_bind',
      'sig_pikachu_volt', 'sig_pikachu_volt',
      'flying_air_raid', 'flying_air_raid',
    ],
    defenseDeck: [
      'normal_wall', 'normal_wall',
      'electric_paralysis', 'electric_paralysis',
      'electric_thundershock', 'electric_thundershock',
      'flying_whirlwind', 'flying_whirlwind',
      'normal_body_slam', 'normal_body_slam',
      'flying_gust', 'flying_gust',
    ],
  },
  // Custo total 111/120. Elenco: 6 Charizard (12), 126 Magmar (11), 78 Rapidash (11), 136 Flareon (12), 58 Growlithe (6), 77 Ponyta (8), 4 Charmander (4), 37 Vulpix (4), 66 Machop (4), 56 Mankey (4), 74 Geodude (4), 95 Onix (7), 111 Rhyhorn (6), 19 Rattata (2), 16 Pidgey (2), 21 Spearow (3).
  // Especialista: 38 Ninetales (11).
  {
    name: 'Chamas de Cinnabar',
    roster: [6, 126, 78, 136, 58, 77, 4, 37, 66, 56, 74, 95, 111, 19, 16, 21],
    specialist: 38,
    depth: {
      QB: [6, 126, 4],
      OL1: [95, 126, 56],
      OL2: [74, 16, 19],
      OL3: [111, 126, 37],
      RB: [78, 56, 19],
      WR1: [77, 126, 4],
      WR2: [58, 37, 56],
      WR3: [21, 16, 19],
      TE: [136, 4, 126],
      FB: [66, 56, 16],
      DL1: [126, 78, 74],
      DL2: [136, 95, 78],
      DL3: [111, 77, 66],
      LB1: [58, 56, 78],
      LB2: [16, 77, 56],
      CB1: [4, 78, 77],
      CB2: [19, 95, 78],
      CB3: [21, 77, 56],
      S1: [6, 95, 66],
      S2: [37, 78, 77],
    },
    keepOnField: [],
    offenseDeck: [
      'fire_deep', 'fire_deep',
      'rock_avalanche', 'rock_avalanche',
      'fire_blast_fake', 'fire_blast_fake',
      'flying_sky_attack', 'flying_sky_attack',
      'sig_onix_bind', 'sig_onix_bind',
      'flying_air_raid', 'flying_air_raid',
    ],
    defenseDeck: [
      'fire_ember', 'fire_ember',
      'flying_whirlwind', 'flying_whirlwind',
      'fire_crossfire', 'fire_crossfire',
      'ground_dig', 'ground_dig',
      'flying_gust', 'flying_gust',
      'normal_body_slam', 'normal_body_slam',
    ],
  },
  // Custo total 116/120. Elenco: 9 Blastoise (12), 131 Lapras (12), 121 Starmie (11), 55 Golduck (11), 87 Dewgong (10), 90 Shellder (4), 98 Krabby (5), 124 Jynx (9), 60 Poliwag (4), 86 Seel (5), 116 Horsea (4), 118 Goldeen (5), 72 Tentacool (5), 54 Psyduck (5), 7 Squirtle (4), 129 Magikarp (1).
  // Especialista: 117 Seadra (9).
  {
    name: 'Marés de Cerulean',
    roster: [9, 131, 121, 55, 87, 90, 98, 124, 60, 86, 116, 118, 72, 54, 7, 129],
    specialist: 117,
    depth: {
      QB: [55, 131, 72],
      OL1: [9, 131, 118],
      OL2: [90, 131, 54],
      OL3: [86, 131, 118],
      RB: [87, 60, 129],
      WR1: [121, 60, 72],
      WR2: [124, 60, 129],
      WR3: [116, 54, 72],
      TE: [98, 118, 54],
      FB: [7, 131, 118],
      DL1: [90, 55, 7],
      DL2: [98, 55, 86],
      DL3: [9, 55, 124],
      LB1: [87, 124, 116],
      LB2: [54, 124, 86],
      CB1: [118, 129, 124],
      CB2: [72, 129, 55],
      CB3: [60, 124, 116],
      S1: [131, 7, 86],
      S2: [121, 7, 55],
    },
    keepOnField: [],
    offenseDeck: [
      'water_surf_route', 'water_surf_route',
      'water_gun_slant', 'water_gun_slant',
      'ice_aurora_screen', 'ice_aurora_screen',
      'psychic_psybeam', 'psychic_psybeam',
      'sig_starmie_swift', 'sig_starmie_swift',
      'ice_beam_slant', 'ice_beam_slant',
    ],
    defenseDeck: [
      'water_high_tide', 'water_high_tide',
      'water_bubble', 'water_bubble',
      'sig_cloyster_clamp', 'sig_cloyster_clamp',
      'psychic_foresight', 'psychic_foresight',
      'ice_blizzard', 'ice_blizzard',
      'sig_lapras_mist', 'sig_lapras_mist',
    ],
  },
  // Custo total 115/120. Elenco: 76 Golem (11), 95 Onix (7), 112 Rhydon (10), 142 Aerodactyl (11), 68 Machamp (11), 107 Hitmonchan (9), 106 Hitmonlee (9), 51 Dugtrio (8), 74 Geodude (4), 104 Cubone (5), 66 Machop (4), 56 Mankey (4), 27 Sandshrew (4), 50 Diglett (3), 140 Kabuto (6), 21 Spearow (3).
  // Especialista: 138 Omanyte (6).
  {
    name: 'Muralha de Pewter',
    roster: [76, 95, 112, 142, 68, 107, 106, 51, 74, 104, 66, 56, 27, 50, 140, 21],
    specialist: 138,
    depth: {
      QB: [142, 106, 107],
      OL1: [76, 27, 104],
      OL2: [95, 107, 27],
      OL3: [74, 106, 104],
      RB: [51, 56, 106],
      WR1: [68, 21, 107],
      WR2: [50, 56, 106],
      WR3: [140, 21, 107],
      TE: [112, 27, 56],
      FB: [66, 104, 27],
      DL1: [76, 68, 142],
      DL2: [112, 68, 95],
      DL3: [74, 68, 142],
      LB1: [106, 51, 142],
      LB2: [56, 51, 140],
      CB1: [107, 51, 142],
      CB2: [50, 51, 142],
      CB3: [21, 95, 51],
      S1: [104, 66, 140],
      S2: [27, 95, 142],
    },
    keepOnField: [],
    offenseDeck: [
      'rock_avalanche', 'rock_avalanche',
      'fighting_rolling_kick', 'fighting_rolling_kick',
      'flying_sky_attack', 'flying_sky_attack',
      'ground_bonemerang', 'ground_bonemerang',
      'rock_throw_deep', 'rock_throw_deep',
      'sig_machamp_karate', 'sig_machamp_karate',
    ],
    defenseDeck: [
      'ground_dig', 'ground_dig',
      'ground_fissure', 'ground_fissure',
      'sig_hitmonchan_counter', 'sig_hitmonchan_counter',
      'fighting_low_kick', 'fighting_low_kick',
      'sig_hitmonlee_kick', 'sig_hitmonlee_kick',
      'flying_gust', 'flying_gust',
    ],
  },
  // Custo total 120/120. Elenco: 65 Alakazam (11), 94 Gengar (11), 122 Mr-mime (9), 124 Jynx (9), 80 Slowbro (10), 64 Kadabra (7), 92 Gastly (4), 93 Haunter (8), 96 Drowzee (5), 79 Slowpoke (5), 102 Exeggcute (5), 108 Lickitung (7), 143 Snorlax (12), 63 Abra (4), 35 Clefairy (5), 39 Jigglypuff (3).
  // Especialista: 81 Magnemite (5).
  {
    name: 'Mentes de Saffron',
    roster: [65, 94, 122, 124, 80, 64, 92, 93, 96, 79, 102, 108, 143, 63, 35, 39],
    specialist: 81,
    depth: {
      QB: [65, 122, 93],
      OL1: [143, 35, 96],
      OL2: [80, 39, 122],
      OL3: [102, 35, 96],
      RB: [94, 92, 93],
      WR1: [64, 122, 93],
      WR2: [124, 92, 122],
      WR3: [63, 93, 92],
      TE: [108, 96, 39],
      FB: [79, 39, 35],
      DL1: [143, 80, 94],
      DL2: [108, 80, 102],
      DL3: [79, 80, 39],
      LB1: [96, 65, 94],
      LB2: [35, 65, 64],
      CB1: [124, 65, 64],
      CB2: [92, 94, 65],
      CB3: [63, 64, 94],
      S1: [122, 65, 64],
      S2: [93, 65, 94],
    },
    keepOnField: [],
    offenseDeck: [
      'psychic_confusion', 'psychic_confusion',
      'sig_snorlax_wall', 'sig_snorlax_wall',
      'psychic_psybeam', 'psychic_psybeam',
      'poison_acid_screen', 'poison_acid_screen',
      'sig_alakazam_teleport', 'sig_alakazam_teleport',
      'poison_powder_fake', 'poison_powder_fake',
    ],
    defenseDeck: [
      'normal_wall', 'normal_wall',
      'psychic_foresight', 'psychic_foresight',
      'psychic_reflect', 'psychic_reflect',
      'ghost_lick', 'ghost_lick',
      'normal_body_slam', 'normal_body_slam',
      'sig_snorlax_body_slam', 'sig_snorlax_body_slam',
    ],
  },
  // Custo total 118/120. Elenco: 3 Venusaur (12), 45 Vileplume (10), 71 Victreebel (10), 114 Tangela (9), 123 Scyther (11), 88 Grimer (5), 15 Beedrill (7), 49 Venomoth (9), 110 Weezing (10), 24 Arbok (9), 10 Caterpie (1), 43 Oddish (5), 69 Bellsprout (4), 46 Paras (4), 48 Venonat (4), 13 Weedle (1).
  // Especialista: 12 Butterfree (7).
  {
    name: 'Selva de Celadon',
    roster: [3, 45, 71, 114, 123, 88, 15, 49, 110, 24, 10, 43, 69, 46, 48, 13],
    specialist: 12,
    depth: {
      QB: [49, 45, 43],
      OL1: [3, 45, 46],
      OL2: [114, 48, 45],
      OL3: [110, 69, 46],
      RB: [15, 69, 10],
      WR1: [123, 48, 10],
      WR2: [24, 43, 48],
      WR3: [13, 69, 45],
      TE: [88, 46, 43],
      FB: [71, 45, 46],
      DL1: [88, 3, 24],
      DL2: [110, 114, 15],
      DL3: [46, 3, 24],
      LB1: [71, 49, 15],
      LB2: [69, 49, 3],
      CB1: [123, 49, 24],
      CB2: [48, 15, 3],
      CB3: [10, 13, 49],
      S1: [45, 114, 24],
      S2: [43, 15, 3],
    },
    keepOnField: [],
    offenseDeck: [
      'flying_air_raid', 'flying_air_raid',
      'bug_quick_bite', 'bug_quick_bite',
      'grass_petal_dance', 'grass_petal_dance',
      'poison_powder_fake', 'poison_powder_fake',
      'poison_acid_screen', 'poison_acid_screen',
      'bug_pin_missile', 'bug_pin_missile',
    ],
    defenseDeck: [
      'poison_toxic', 'poison_toxic',
      'flying_gust', 'flying_gust',
      'bug_string_shot', 'bug_string_shot',
      'grass_stun_spore', 'grass_stun_spore',
      'sig_scyther_blade', 'sig_scyther_blade',
      'grass_sleep_powder', 'grass_sleep_powder',
    ],
  },
];
```

Adicionar ao fim de `packages/engine/src/index.ts`:
```ts
export * from './teams/suggested';
```

- [ ] **Step 4: Rodar os testes**

Run: `npm test && npm run typecheck`
Expected: PASS.
- Se `validateTeam` acusar erro num time, imprima com `console.log(validateTeam(SUGGESTED_TEAMS[i]))` e corrija **o time**, não a regra.
- Se o custo divergir de `EXPECTED_COST`, confira `speciesCost` contra a tabela da PokéAPI antes de mudar o número.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/teams packages/engine/src/index.ts packages/engine/test/suggested.test.ts
git commit -m "feat(engine): 6 times sugeridos válidos"
```

---

### Task 4: Pacote `@pfl/sim` e sorteio ponderado

**Files:**
- Create: `packages/sim/package.json`, `packages/sim/src/pick.ts`
- Test: `packages/sim/test/pick.test.ts`

**Interfaces:**
- Consumes: `rngNext(state: number): { value: number; state: number }` (Plano 1).
- Produces: `weightedPick<T>(items: readonly T[], weights: readonly number[], rng: number): { item: T; rng: number }`. Pesos ≤ 0 nunca são escolhidos. Sem nenhum peso positivo, lança `Error` com a mensagem "nenhuma opção com peso positivo".

- [ ] **Step 1: Criar o pacote e linkar o workspace**

`packages/sim/package.json`:
```json
{
  "name": "@pfl/sim",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": {
    "@pfl/engine": "0.0.0"
  }
}
```

Run: `npm install`
Expected: sem erros; `node_modules/@pfl/sim` e `node_modules/@pfl/engine` passam a existir (links do workspace).

- [ ] **Step 2: Escrever o teste (deve falhar)**

`packages/sim/test/pick.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { weightedPick } from '../src/pick';

describe('weightedPick', () => {
  it('é determinístico e devolve o novo estado do RNG', () => {
    const a = weightedPick(['x', 'y', 'z'], [1, 2, 3], 42);
    expect(weightedPick(['x', 'y', 'z'], [1, 2, 3], 42)).toEqual(a);
    expect(a.rng).not.toBe(42);
  });

  it('nunca escolhe opção com peso zero e respeita as proporções', () => {
    const counts = { x: 0, y: 0, z: 0 };
    let rng = 1;
    for (let i = 0; i < 3000; i++) {
      const r = weightedPick(['x', 'y', 'z'] as const, [0, 1, 3], rng);
      counts[r.item]++;
      rng = r.rng;
    }
    expect(counts.x).toBe(0);
    expect(counts.z / counts.y).toBeGreaterThan(2.4);
    expect(counts.z / counts.y).toBeLessThan(3.6);
  });

  it('lança erro sem opção válida', () => {
    expect(() => weightedPick([], [], 1)).toThrow(/peso positivo/);
    expect(() => weightedPick(['a'], [0], 1)).toThrow(/peso positivo/);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run packages/sim/test/pick.test.ts`
Expected: FAIL — `Failed to resolve import "../src/pick"`.

- [ ] **Step 4: Implementar**

`packages/sim/src/pick.ts`:
```ts
import { rngNext } from '@pfl/engine';

/** Sorteio ponderado determinístico. Pesos ≤ 0 nunca são escolhidos; lança erro se nenhum peso for positivo. */
export function weightedPick<T>(items: readonly T[], weights: readonly number[], rng: number): { item: T; rng: number } {
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (items.length === 0 || total <= 0) throw new Error('weightedPick: nenhuma opção com peso positivo');
  const r = rngNext(rng);
  let target = r.value * total;
  for (let i = 0; i < items.length; i++) {
    const w = Math.max(0, weights[i]);
    if (w <= 0) continue;
    if (target < w) return { item: items[i], rng: r.state };
    target -= w;
  }
  const last = weights.map((w, i) => (w > 0 ? i : -1)).filter((i) => i >= 0).pop() as number;
  return { item: items[last], rng: r.state };
}
```

- [ ] **Step 5: Rodar os testes**

Run: `npx vitest run packages/sim/test/pick.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/sim package-lock.json
git commit -m "feat(sim): pacote @pfl/sim e sorteio ponderado determinístico"
```

---

### Task 5: Bot heurístico

**Files:**
- Create: `packages/sim/src/bot.ts`
- Test: `packages/sim/test/bot.test.ts`

**Interfaces:**
- Consumes:
  - Plano 1: `playerView`, `PlayerView`, `MatchState`, `Action`, `TeamKey`, `Team`, `FatigueState`, `FORMATIONS`, `pickLineup`, `canPlay`, `getCard`, `readResult`, `fieldGoalDistance`, `fieldGoalProbability`, `createMatch`, `step`
  - Task 3: `SUGGESTED_TEAMS`
  - Task 4: `weightedPick`
- Produces:
  - `botAction(state: MatchState, team: TeamKey, rng: number): { action: Action; rng: number }` (contrato). Lança `Error('bot: o time X não age na fase Y')` se `team` não está em `actingTeams(state)`.
  - `actingTeams(state: MatchState): TeamKey[]`:
    - `FORMATION`/`CONVERSION` → `[offense]`
    - `PACKAGE` → `[defense]`
    - `PLAYCALL` → quem ainda não escolheu carta (ataque primeiro)
    - `MATCH_END` → `[]`
  - `BotKnowledge { view: PlayerView; own: { team: Team; fatigue: FatigueState } }` e `botDecide(k: BotKnowledge, rng: number): { action: Action; rng: number }`
  - `distanceOf(yardsToGo: number): 'SHORT' | 'MEDIUM' | 'LONG'` (≤3 / ≤7 / resto)
  - `predictOffense(view: PlayerView): Record<OffenseCategory, number>` (soma 1)
  - `fourthDownDecision(view: PlayerView, specialist: number): 'GO' | 'FIELD_GOAL' | 'PUNT'`
  - `CALL_TENDENCY`

**Heurística:**
- **Formação:** peso = (1 + cartas da mão jogáveis com a escalação daquela formação) × tendência por distância. Distância curta favorece Pesada/Dupla; longa favorece Spread/Pistol.
- **Pacote:** tendência por distância, ajustada pela formação revelada. Pesada/Dupla favorecem Base/Pesado; Spread favorece Nickel/Dime.
- **Carta de ataque:** peso = tendência da categoria por distância × 1,5 se a carta for do deck.
- **4º down:**
  - última chance perdendo: FG se o déficit for ≤ 3 e a chance de FG ≥ 30%; senão vai para a jogada;
  - 4ª e ≤ 2 da própria 40 em diante: vai;
  - chance de FG ≥ 50%: FG;
  - 4ª e ≤ 4 da 60 em diante: vai;
  - senão: punt.
- **Carta de defesa:** prevê a distribuição de categorias do ataque (tendência + formação revelada) e calcula o valor esperado da leitura EV = Σ p × (✔ +1, · 0, ✖ −1). Peso = e^(2·EV) × 1,5 se a carta for do deck.
- **Conversão:** vai para 2 com 70% de chance se o déficit for 2, 5 ou 10, ou se estiver vencendo por 1; nos outros casos, 10%.

- [ ] **Step 1: Escrever o teste (deve falhar)**

`packages/sim/test/bot.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { SUGGESTED_TEAMS, createMatch, step, playerView, type Action, type MatchState, type TeamKey } from '@pfl/engine';
import { actingTeams, botAction, botDecide, distanceOf, fourthDownDecision, predictOffense } from '../src/bot';

const [VERMILION, CINNABAR] = SUGGESTED_TEAMS;
const start = (seed = 1): MatchState => createMatch(VERMILION, CINNABAR, seed).state;
const other = (k: TeamKey): TeamKey => (k === 'A' ? 'B' : 'A');

function advance(s: MatchState, ...actions: Action[]): MatchState {
  return actions.reduce((state, a) => step(state, a).state, s);
}
const toPlaycall = (s: MatchState): MatchState =>
  advance(s, { type: 'FORMATION', team: s.offense, formation: 'PISTOL' }, { type: 'PACKAGE', team: other(s.offense), package: 'BASE' });

describe('actingTeams', () => {
  it('segue a fase', () => {
    const s = start();
    expect(actingTeams(s)).toEqual(['A']);
    const pkg = advance(s, { type: 'FORMATION', team: 'A', formation: 'PISTOL' });
    expect(actingTeams(pkg)).toEqual(['B']);
    const call = toPlaycall(s);
    expect(actingTeams(call)).toEqual(['A', 'B']);
    expect(actingTeams(advance(call, { type: 'CARD', team: 'A', cardId: 'basic_run' }))).toEqual(['B']);
  });
});

describe('botAction', () => {
  it('recusa agir por um time que não precisa agir', () => {
    expect(() => botAction(start(), 'B', 1)).toThrow(/não age/);
  });

  it('sempre produz ações aceitas pelo motor (20 partidas completas)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let s = createMatch(SUGGESTED_TEAMS[seed % 6], SUGGESTED_TEAMS[(seed + 1) % 6], seed).state;
      let rng = seed * 13;
      for (let i = 0; i < 5000 && s.phase !== 'MATCH_END'; i++) {
        const d = botAction(s, actingTeams(s)[0], rng);
        rng = d.rng;
        s = step(s, d.action).state;
      }
      expect(s.phase).toBe('MATCH_END');
    }
  });

  it('não usa informação escondida: a carta da defesa não depende da carta já escolhida pelo ataque', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const call = toPlaycall(start(seed));
      const before = botAction(call, 'B', seed * 101);
      for (const cardId of ['basic_run', 'basic_pass']) {
        const after = botAction(advance(call, { type: 'CARD', team: 'A', cardId }), 'B', seed * 101);
        expect(after).toEqual(before);
      }
    }
  });

  it('é determinístico para o mesmo estado e rng', () => {
    const s = toPlaycall(start(5));
    expect(botAction(s, 'A', 77)).toEqual(botAction(s, 'A', 77));
  });
});

describe('heurística de down & distance', () => {
  it('classifica a distância', () => {
    expect(distanceOf(1)).toBe('SHORT');
    expect(distanceOf(3)).toBe('SHORT');
    expect(distanceOf(5)).toBe('MEDIUM');
    expect(distanceOf(10)).toBe('LONG');
  });

  it('prevê mais passes contra Spread e mais corridas contra Pesada', () => {
    const view = playerView(toPlaycall(start()), 'B');
    const spread = predictOffense({ ...view, formation: 'SPREAD' });
    const heavy = predictOffense({ ...view, formation: 'HEAVY' });
    expect(spread.RUN_INSIDE).toBeLessThan(heavy.RUN_INSIDE);
    expect(spread.DEEP_PASS).toBeGreaterThan(heavy.DEEP_PASS);
    expect(Object.values(spread).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it('decide o 4º down', () => {
    const view = playerView(start(), 'A');
    const at = (ballOn: number, yardsToGo: number, extra: Partial<typeof view> = {}) =>
      fourthDownDecision({ ...view, field: { down: 4, yardsToGo, ballOn }, ...extra }, 81);
    expect(at(25, 8)).toBe('PUNT');
    expect(at(50, 1)).toBe('GO');
    expect(at(80, 9)).toBe('FIELD_GOAL');
    const lastPossession = { possessions: { A: 6, B: 6 }, score: { A: 0, B: 7 } };
    expect(at(25, 8, lastPossession)).toBe('GO');
  });

  it('no 4º down escolhe a carta especial que decidiu', () => {
    const s = toPlaycall(start());
    s.field = { down: 4, yardsToGo: 9, ballOn: 20 };
    expect(botAction(s, 'A', 3).action).toEqual({ type: 'CARD', team: 'A', cardId: 'punt' });
  });

  it('a defesa escolhe pela leitura esperada: Zona Profunda mais que Contenção em 3ª e longa contra Spread', () => {
    const s = toPlaycall(start());
    s.field = { down: 3, yardsToGo: 12, ballOn: 40 };
    s.formation = 'SPREAD';
    const view = { ...playerView(s, 'B'), playable: ['basic_defense', 'water_high_tide', 'normal_wall'] };
    const k = { view, own: { team: s.teams.B.team, fatigue: s.teams.B.fatigue } };
    const counts: Record<string, number> = { basic_defense: 0, water_high_tide: 0, normal_wall: 0 };
    let rng = 9;
    for (let i = 0; i < 600; i++) {
      const d = botDecide(k, rng);
      rng = d.rng;
      if (d.action.type === 'CARD') counts[d.action.cardId]++;
    }
    expect(counts.water_high_tide).toBeGreaterThan(counts.normal_wall * 2);
    expect(counts.normal_wall).toBeGreaterThan(0); // continua imprevisível
  });

  it('vai para 2 pontos com mais frequência quando perde por 2', () => {
    const s = start();
    s.phase = 'CONVERSION';
    const rate = (score: Record<TeamKey, number>): number => {
      const k = { view: { ...playerView(s, 'A'), score }, own: { team: s.teams.A.team, fatigue: s.teams.A.fatigue } };
      let rng = 5;
      let two = 0;
      for (let i = 0; i < 400; i++) {
        const d = botDecide(k, rng);
        rng = d.rng;
        if (d.action.type === 'CONVERSION' && d.action.choice === 'TWO') two++;
      }
      return two / 400;
    };
    expect(rate({ A: 12, B: 14 })).toBeGreaterThan(0.5);
    expect(rate({ A: 13, B: 6 })).toBeLessThan(0.25);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/sim/test/bot.test.ts`
Expected: FAIL — `Failed to resolve import "../src/bot"`.

- [ ] **Step 3: Implementar**

`packages/sim/src/bot.ts`:
```ts
import {
  FORMATIONS, canPlay, fieldGoalDistance, fieldGoalProbability, getCard, pickLineup, playerView, readResult,
  type Action, type DefenseCategory, type FatigueState, type FormationId, type MatchState, type OffenseCategory,
  type PackageId, type PlayerView, type Team, type TeamKey,
} from '@pfl/engine';
import { weightedPick } from './pick';

/** O que o bot sabe: a visão pública do jogador + os dados do próprio time (nunca o estado do adversário). */
export interface BotKnowledge {
  view: PlayerView;
  own: { team: Team; fatigue: FatigueState };
}

export type Distance = 'SHORT' | 'MEDIUM' | 'LONG';

const OFFENSE_CATEGORIES: OffenseCategory[] = ['RUN_INSIDE', 'RUN_OUTSIDE', 'SHORT_PASS', 'DEEP_PASS', 'SCREEN', 'PLAY_ACTION'];
const FORMATION_IDS: FormationId[] = ['PISTOL', 'HEAVY', 'SPREAD', 'DOUBLE'];
const PACKAGE_IDS: PackageId[] = ['BASE', 'HEAVY_D', 'NICKEL', 'DIME'];

/** Tendência de chamada de jogada por distância (o bot também a usa para prever o adversário). */
export const CALL_TENDENCY: Record<Distance, Record<OffenseCategory, number>> = {
  SHORT: { RUN_INSIDE: 3, RUN_OUTSIDE: 2, SHORT_PASS: 2, DEEP_PASS: 0.5, SCREEN: 1, PLAY_ACTION: 1.5 },
  MEDIUM: { RUN_INSIDE: 2, RUN_OUTSIDE: 2, SHORT_PASS: 2.5, DEEP_PASS: 1, SCREEN: 1.5, PLAY_ACTION: 1.5 },
  LONG: { RUN_INSIDE: 1, RUN_OUTSIDE: 1, SHORT_PASS: 2, DEEP_PASS: 2.5, SCREEN: 1.5, PLAY_ACTION: 2 },
};
const FORMATION_TENDENCY: Record<Distance, Record<FormationId, number>> = {
  SHORT: { PISTOL: 1, HEAVY: 1.5, SPREAD: 0.7, DOUBLE: 1.5 },
  MEDIUM: { PISTOL: 1.2, HEAVY: 1, SPREAD: 1, DOUBLE: 1 },
  LONG: { PISTOL: 1.3, HEAVY: 0.7, SPREAD: 1.5, DOUBLE: 0.7 },
};
const PACKAGE_TENDENCY: Record<Distance, Record<PackageId, number>> = {
  SHORT: { BASE: 2, HEAVY_D: 3, NICKEL: 1, DIME: 0.5 },
  MEDIUM: { BASE: 2, HEAVY_D: 1, NICKEL: 2, DIME: 1 },
  LONG: { BASE: 1, HEAVY_D: 0.5, NICKEL: 2, DIME: 2.5 },
};
const RUNS: OffenseCategory[] = ['RUN_INSIDE', 'RUN_OUTSIDE'];
/** Peso extra para cartas do deck em relação às básicas. */
const DECK_CARD_BONUS = 1.5;
/** Quanto o valor esperado da leitura pesa na escolha da defesa (peso = e^(k·EV)). */
const READ_SHARPNESS = 2;

export function distanceOf(yardsToGo: number): Distance {
  return yardsToGo <= 3 ? 'SHORT' : yardsToGo <= 7 ? 'MEDIUM' : 'LONG';
}

/** Quais times precisam agir agora. Vazio quando a partida acabou. */
export function actingTeams(state: MatchState): TeamKey[] {
  const defense: TeamKey = state.offense === 'A' ? 'B' : 'A';
  switch (state.phase) {
    case 'FORMATION':
    case 'CONVERSION':
      return [state.offense];
    case 'PACKAGE':
      return [defense];
    case 'PLAYCALL': {
      const out: TeamKey[] = [];
      if (state.cards.offense === null) out.push(state.offense);
      if (state.cards.defense === null) out.push(defense);
      return out;
    }
    case 'MATCH_END':
      return [];
  }
}

/** Probabilidade prevista de cada categoria de ataque, dada a situação e a formação revelada. */
export function predictOffense(view: PlayerView): Record<OffenseCategory, number> {
  const base = CALL_TENDENCY[distanceOf(view.field.yardsToGo)];
  const tilt = (c: OffenseCategory): number => {
    if (view.formation === 'SPREAD') return RUNS.includes(c) ? 0.6 : 1.3;
    if (view.formation === 'HEAVY' || view.formation === 'DOUBLE') return RUNS.includes(c) ? 1.4 : 0.8;
    return 1;
  };
  const raw = OFFENSE_CATEGORIES.map((c) => base[c] * tilt(c));
  const total = raw.reduce((a, b) => a + b, 0);
  return Object.fromEntries(OFFENSE_CATEGORIES.map((c, i) => [c, raw[i] / total])) as Record<OffenseCategory, number>;
}

const readScore = { RIGHT: 1, NEUTRAL: 0, WRONG: -1 } as const;

function chooseFormation(k: BotKnowledge, rng: number): { action: Action; rng: number } {
  const { view, own } = k;
  const tendency = FORMATION_TENDENCY[distanceOf(view.field.yardsToGo)];
  const weights = FORMATION_IDS.map((f) => {
    const lineup = pickLineup(FORMATIONS[f], own.team, own.fatigue);
    const playable = view.hand.filter((id) => canPlay(getCard(id), lineup)).length;
    return (1 + playable) * tendency[f];
  });
  const r = weightedPick(FORMATION_IDS, weights, rng);
  return { action: { type: 'FORMATION', team: view.you, formation: r.item }, rng: r.rng };
}

function choosePackage(k: BotKnowledge, rng: number): { action: Action; rng: number } {
  const { view } = k;
  const tendency = PACKAGE_TENDENCY[distanceOf(view.field.yardsToGo)];
  const runHeavy = view.formation === 'HEAVY' || view.formation === 'DOUBLE';
  const weights = PACKAGE_IDS.map((p) => {
    let w = tendency[p];
    if (runHeavy && (p === 'HEAVY_D' || p === 'BASE')) w *= 1.5;
    if (view.formation === 'SPREAD' && (p === 'NICKEL' || p === 'DIME')) w *= 1.5;
    return w;
  });
  const r = weightedPick(PACKAGE_IDS, weights, rng);
  return { action: { type: 'PACKAGE', team: view.you, package: r.item }, rng: r.rng };
}

/** Decisão de 4º down: 'GO' (jogada normal), 'FIELD_GOAL' ou 'PUNT'. */
export function fourthDownDecision(view: PlayerView, specialist: number): 'GO' | 'FIELD_GOAL' | 'PUNT' {
  const { ballOn, yardsToGo } = view.field;
  const fgProb = fieldGoalProbability(fieldGoalDistance(ballOn), specialist);
  const lastChance = view.overtimeRound > 0 || view.possessions[view.you] >= view.possessionsPerTeam;
  const opponent: TeamKey = view.you === 'A' ? 'B' : 'A';
  const deficit = view.score[opponent] - view.score[view.you];
  if (lastChance && deficit > 0) {
    if (deficit <= 3 && fgProb >= 0.3) return 'FIELD_GOAL';
    return 'GO';
  }
  if (yardsToGo <= 2 && ballOn >= 40) return 'GO';
  if (fgProb >= 0.5) return 'FIELD_GOAL';
  if (yardsToGo <= 4 && ballOn >= 60) return 'GO';
  return 'PUNT';
}

function chooseOffenseCard(k: BotKnowledge, rng: number): { action: Action; rng: number } {
  const { view, own } = k;
  if (view.field.down === 4 && !view.conversionAttempt) {
    const decision = fourthDownDecision(view, own.team.specialist);
    if (decision === 'PUNT') return { action: { type: 'CARD', team: view.you, cardId: 'punt' }, rng };
    if (decision === 'FIELD_GOAL') return { action: { type: 'CARD', team: view.you, cardId: 'field_goal' }, rng };
  }
  const options = view.playable.filter((id) => id !== 'punt' && id !== 'field_goal');
  const tendency = CALL_TENDENCY[distanceOf(view.field.yardsToGo)];
  const weights = options.map((id) => {
    const card = getCard(id);
    return tendency[card.category as OffenseCategory] * (card.origin === 'BASIC' ? 1 : DECK_CARD_BONUS);
  });
  const r = weightedPick(options, weights, rng);
  return { action: { type: 'CARD', team: view.you, cardId: r.item }, rng: r.rng };
}

function chooseDefenseCard(k: BotKnowledge, rng: number): { action: Action; rng: number } {
  const { view } = k;
  const predicted = predictOffense(view);
  const options = view.playable;
  const weights = options.map((id) => {
    const card = getCard(id);
    const ev = OFFENSE_CATEGORIES.reduce(
      (sum, c) => sum + predicted[c] * readScore[readResult(card.category as DefenseCategory, c)],
      0,
    );
    return Math.exp(READ_SHARPNESS * ev) * (card.origin === 'BASIC' ? 1 : DECK_CARD_BONUS);
  });
  const r = weightedPick(options, weights, rng);
  return { action: { type: 'CARD', team: view.you, cardId: r.item }, rng: r.rng };
}

function chooseConversion(k: BotKnowledge, rng: number): { action: Action; rng: number } {
  const { view } = k;
  const opponent: TeamKey = view.you === 'A' ? 'B' : 'A';
  const deficit = view.score[opponent] - view.score[view.you];
  const twoProbability = deficit === 2 || deficit === 5 || deficit === 10 || deficit === -1 ? 0.7 : 0.1;
  const r = weightedPick(['TWO', 'PAT'] as const, [twoProbability, 1 - twoProbability], rng);
  return { action: { type: 'CONVERSION', team: view.you, choice: r.item }, rng: r.rng };
}

/** Decide a partir apenas do que o jogador sabe. */
export function botDecide(k: BotKnowledge, rng: number): { action: Action; rng: number } {
  const { view } = k;
  switch (view.phase) {
    case 'FORMATION':
      return chooseFormation(k, rng);
    case 'PACKAGE':
      return choosePackage(k, rng);
    case 'PLAYCALL':
      return view.side === 'offense' ? chooseOffenseCard(k, rng) : chooseDefenseCard(k, rng);
    case 'CONVERSION':
      return chooseConversion(k, rng);
    case 'MATCH_END':
      throw new Error('bot: a partida já terminou');
  }
}

/** Contrato (contracts.md, seção 1). Lança erro se `team` não precisa agir na fase atual. */
export function botAction(state: MatchState, team: TeamKey, rng: number): { action: Action; rng: number } {
  if (!actingTeams(state).includes(team)) throw new Error(`bot: o time ${team} não age na fase ${state.phase}`);
  const rt = state.teams[team];
  return botDecide({ view: playerView(state, team), own: { team: rt.team, fatigue: rt.fatigue } }, rng);
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run packages/sim/test/bot.test.ts && npm run typecheck`
Expected: PASS (11 testes, cerca de 1 s).

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src/bot.ts packages/sim/test/bot.test.ts
git commit -m "feat(sim): bot heurístico por down & distance, sem informação escondida"
```

---

### Task 6: Gerador de times aleatórios válidos

**Files:**
- Create: `packages/sim/src/random-team.ts`
- Test: `packages/sim/test/random-team.test.ts`

**Interfaces:**
- Consumes (Plano 1):
  - dados e regras: `ALL_SPECIES`, `LEGENDARY_IDS`, `speciesCost`, `getSpecies`, `SALARY_CAP`, `ROSTER_SIZE`, `DECK_SIZE`, `MAX_COPIES`, `POSITION_WEIGHTS`, `slotPosition`
  - formações e cartas: `OFFENSE_SLOTS`, `DEFENSE_SLOTS`, `FORMATIONS`, `PACKAGES`, `pickLineup`, `initialFatigue`, `CARDS`, `canIncludeInDeck`, `canPlay`
  - `validateTeam`, `teamCost`
  - Task 4: `weightedPick`
- Produces:
  - `RANDOM_TEAM_MAX_ATTEMPTS = 50`
  - `randomTeam(rng: number, name?: string, maxAttempts?: number): { team: Team; rng: number }`. O time sempre passa em `validateTeam`; se não conseguir, lança `Error('randomTeam: nenhum elenco válido em N tentativas')`.
  - `buildDepth(roster: readonly number[]): Team['depth']`
  - `usableCards(team, side: CardSide): Card[]`

**Regras:**
- **Elenco:** 17 espécies sorteadas com peso maior para custo perto de "orçamento restante ÷ vagas restantes". O custo mínimo das vagas que faltam fica sempre reservado, então o teto nunca estoura. No máximo 1 lendário.
- **Especialista:** o melhor Sp. Atk entre as espécies de custo ≤ 5, para não tirar uma estrela do campo.
- **Depth chart:** titulares distintos por lado, pela nota da posição (`POSITION_WEIGHTS`); 2 reservas por vaga, espalhadas.
- **Deck:** 6 cartas distintas × 2 cópias, sorteadas entre as cartas elegíveis e jogáveis com os titulares.

- [ ] **Step 1: Escrever o teste (deve falhar)**

`packages/sim/test/random-team.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { validateTeam, teamCost, SALARY_CAP, OFFENSE_SLOTS, DEFENSE_SLOTS } from '@pfl/engine';
import { randomTeam, buildDepth, usableCards } from '../src/random-team';

describe('randomTeam', () => {
  it('gera 150 times válidos e próximos do teto', () => {
    let rng = 1;
    const costs: number[] = [];
    for (let i = 0; i < 150; i++) {
      const r = randomTeam(rng, `T${i}`);
      rng = r.rng;
      expect(validateTeam(r.team), `seed índice ${i}`).toEqual([]);
      costs.push(teamCost(r.team));
    }
    expect(Math.max(...costs)).toBeLessThanOrEqual(SALARY_CAP);
    expect(costs.reduce((a, b) => a + b, 0) / costs.length).toBeGreaterThan(110);
  });

  it('desiste com erro claro em vez de travar quando não acha elenco', () => {
    expect(() => randomTeam(1, 'x', 0)).toThrow(/nenhum elenco válido em 0 tentativas/);
  });

  it('é determinístico', () => {
    expect(randomTeam(99)).toEqual(randomTeam(99));
    expect(randomTeam(99).team).not.toEqual(randomTeam(100).team);
  });

  it('só põe no deck cartas jogáveis com os titulares', () => {
    const { team } = randomTeam(7);
    const off = usableCards(team, 'OFFENSE').map((c) => c.id);
    const def = usableCards(team, 'DEFENSE').map((c) => c.id);
    for (const id of team.offenseDeck) expect(off).toContain(id);
    for (const id of team.defenseDeck) expect(def).toContain(id);
  });
});

describe('buildDepth', () => {
  it('titulares distintos em cada lado e 3 nomes por vaga', () => {
    const roster = [25, 26, 100, 81, 125, 74, 95, 66, 19, 16, 21, 50, 54, 63, 10, 13];
    const depth = buildDepth(roster);
    for (const side of [OFFENSE_SLOTS, DEFENSE_SLOTS]) {
      const starters = side.map((s) => depth[s]![0]);
      expect(new Set(starters).size).toBe(side.length);
      for (const s of side) expect(depth[s]).toHaveLength(3);
    }
    expect(depth.QB![0]).toBe(125); // Electabuzz: maior nota de QB (0,7·SpA + 0,2·SpD + 0,1·Vel = 94)
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/sim/test/random-team.test.ts`
Expected: FAIL — `Failed to resolve import "../src/random-team"`.

- [ ] **Step 3: Implementar**

`packages/sim/src/random-team.ts`:
```ts
import {
  ALL_SPECIES, CARDS, DECK_SIZE, DEFENSE_SLOTS, FORMATIONS, LEGENDARY_IDS, MAX_COPIES, OFFENSE_SLOTS, PACKAGES,
  POSITION_WEIGHTS, ROSTER_SIZE, SALARY_CAP, canIncludeInDeck, canPlay, getSpecies, initialFatigue, pickLineup,
  slotPosition, speciesCost, type Card, type CardSide, type Lineup, type SlotId, type StatKey, type Team,
} from '@pfl/engine';
import { weightedPick } from './pick';

export const RANDOM_TEAM_MAX_ATTEMPTS = 50;
const BACKUPS_PER_SLOT = 2;
const SPECIALIST_MAX_COST = 5;
/** penalidade na nota (pontos de stat) por vaga em que o Pokémon já é reserva, para espalhar a rotação */
const BACKUP_SPREAD = 15;

function positionScore(id: number, slot: SlotId): number {
  const stats = getSpecies(id).stats;
  return Object.entries(POSITION_WEIGHTS[slotPosition(slot)]).reduce((s, [k, w]) => s + stats[k as StatKey] * (w as number), 0);
}

/** 17 espécies distintas, no máximo 1 lendário, custo total ≤ teto, gastando perto do teto. */
function pickSpecies(rng: number): { ids: number[]; rng: number } {
  const ids: number[] = [];
  let budget = SALARY_CAP;
  let legendary = false;
  const total = ROSTER_SIZE + 1;
  while (ids.length < total) {
    const remainingAfter = total - ids.length - 1;
    const unused = ALL_SPECIES.filter((s) => !ids.includes(s.id) && !(legendary && LEGENDARY_IDS.includes(s.id)));
    const cheapest = unused.map((s) => speciesCost(s.id)).sort((a, b) => a - b);
    const target = budget / (total - ids.length);
    const prefix = cheapest.slice(0, remainingAfter + 1);
    const prefixSum = prefix.reduce((a, b) => a + b, 0);
    // custo mínimo para completar as vagas restantes sem contar a própria espécie
    const reserve = (cost: number): number =>
      remainingAfter === 0 ? 0 : cost <= prefix[remainingAfter - 1] ? prefixSum - cost : prefixSum - prefix[remainingAfter];
    const feasible = unused.filter((s) => speciesCost(s.id) + reserve(speciesCost(s.id)) <= budget);
    const r = weightedPick(feasible, feasible.map((s) => 1 / (1 + Math.abs(speciesCost(s.id) - target))), rng);
    rng = r.rng;
    ids.push(r.item.id);
    budget -= speciesCost(r.item.id);
    if (LEGENDARY_IDS.includes(r.item.id)) legendary = true;
  }
  return { ids, rng };
}

/** Titulares distintos por lado (pela nota da posição) e 2 reservas por vaga, priorizando quem não é titular. */
export function buildDepth(roster: readonly number[]): Team['depth'] {
  const depth: Team['depth'] = {};
  for (const side of [OFFENSE_SLOTS, DEFENSE_SLOTS] as SlotId[][]) {
    const starters = new Map<SlotId, number>();
    const used = new Set<number>();
    for (const slot of side) {
      const best = roster.filter((id) => !used.has(id)).sort((a, b) => positionScore(b, slot) - positionScore(a, slot))[0];
      starters.set(slot, best);
      used.add(best);
    }
    const backupUses = new Map<number, number>();
    for (const slot of side) {
      const starter = starters.get(slot) as number;
      // reservas: primeiro quem não é titular deste lado; quem já é reserva de outra vaga perde prioridade
      const key = (id: number): number => positionScore(id, slot) - BACKUP_SPREAD * (backupUses.get(id) ?? 0);
      const backups = roster
        .filter((id) => id !== starter)
        .sort((a, b) => Number(used.has(a)) - Number(used.has(b)) || key(b) - key(a))
        .slice(0, BACKUPS_PER_SLOT);
      for (const id of backups) backupUses.set(id, (backupUses.get(id) ?? 0) + 1);
      depth[slot] = [starter, ...backups];
    }
  }
  return depth;
}

/** Cartas elegíveis para o elenco e jogáveis com os titulares em ao menos uma formação/pacote. */
export function usableCards(team: Pick<Team, 'roster' | 'depth' | 'keepOnField'> & Partial<Team>, side: CardSide): Card[] {
  const shell = { name: '', specialist: 0, offenseDeck: [], defenseDeck: [], ...team } as Team;
  const lineups: Lineup[] = Object.values(side === 'OFFENSE' ? FORMATIONS : PACKAGES).map((slots) =>
    pickLineup(slots, shell, initialFatigue()),
  );
  return CARDS.filter(
    (c) =>
      c.side === side &&
      (c.origin === 'TYPE' || c.origin === 'SIGNATURE') &&
      canIncludeInDeck(c, team.roster) &&
      lineups.some((l) => canPlay(c, l)),
  );
}

function pickDeck(cards: Card[], rng: number): { deck: string[]; rng: number } | null {
  const distinct = DECK_SIZE / MAX_COPIES;
  if (cards.length < distinct) return null;
  const pool = [...cards];
  const chosen: string[] = [];
  for (let i = 0; i < distinct; i++) {
    const r = weightedPick(pool, pool.map(() => 1), rng);
    rng = r.rng;
    chosen.push(r.item.id, r.item.id);
    pool.splice(pool.indexOf(r.item), 1);
  }
  return { deck: chosen, rng };
}

/**
 * Time aleatório válido (validateTeam === []). Tenta até `maxAttempts` elencos;
 * se nenhum liberar 6 cartas distintas jogáveis de cada lado, lança erro (nunca entra em loop infinito).
 */
export function randomTeam(
  rng: number,
  name = 'Aleatório',
  maxAttempts = RANDOM_TEAM_MAX_ATTEMPTS,
): { team: Team; rng: number } {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const picked = pickSpecies(rng);
    rng = picked.rng;
    const all = picked.ids;
    // especialista: o melhor Sp. Atk entre os baratos (custo ≤ 5); sem nenhum barato, o mais barato
    const cheap = all.filter((id) => speciesCost(id) <= SPECIALIST_MAX_COST);
    const specialist = cheap.length
      ? [...cheap].sort((a, b) => getSpecies(b).stats.spAttack - getSpecies(a).stats.spAttack)[0]
      : [...all].sort((a, b) => speciesCost(a) - speciesCost(b))[0];
    const roster = all.filter((id) => id !== specialist);
    const depth = buildDepth(roster);
    const off = pickDeck(usableCards({ roster, depth, keepOnField: [] }, 'OFFENSE'), rng);
    if (!off) continue;
    rng = off.rng;
    const def = pickDeck(usableCards({ roster, depth, keepOnField: [] }, 'DEFENSE'), rng);
    if (!def) continue;
    rng = def.rng;
    return { team: { name, roster, specialist, depth, keepOnField: [], offenseDeck: off.deck, defenseDeck: def.deck }, rng };
  }
  throw new Error(`randomTeam: nenhum elenco válido em ${maxAttempts} tentativas`);
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run packages/sim/test/random-team.test.ts && npm run typecheck`
Expected: PASS. A média de custo fica acima de 110 (no ambiente de referência, cerca de 119).

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src/random-team.ts packages/sim/test/random-team.test.ts
git commit -m "feat(sim): gerador determinístico de times aleatórios válidos"
```

---

### Task 7: Runner de partidas bot × bot

**Files:**
- Create: `packages/sim/src/runner.ts`
- Test: `packages/sim/test/runner.test.ts`

**Interfaces:**
- Consumes:
  - Plano 1: `createMatch`, `step`, `rngNext`, `GameEvent`, `Team`, `TeamKey`
  - Task 3: `SUGGESTED_TEAMS`
  - Task 5: `actingTeams`, `botAction`
  - Task 6: `randomTeam`
- Produces:
  - `MAX_STEPS_PER_MATCH = 5000`
  - `MatchRecord { teams: Record<TeamKey, string>; score: Record<TeamKey, number>; winner: TeamKey; events: GameEvent[] }`
  - `playMatch(teamA: Team, teamB: Team, seed: number, botSeed: number, maxSteps?: number): MatchRecord`. Se não terminar, lança `Error('partida não terminou em N ações (seed S)')`.
  - `SimOptions { games: number; seed: number; suggestedEvery?: number }`
  - `runSim(options: SimOptions): MatchRecord[]`:
    - devolve exatamente `games` partidas;
    - os confrontos vêm em pares (X×Y, Y×X) com a mesma seed;
    - um a cada `suggestedEvery` (padrão 4) usa dois times sugeridos diferentes; os demais usam dois times aleatórios;
    - com `games` não inteiro ou < 1, lança `Error('games inválido: …')`.

- [ ] **Step 1: Escrever o teste (deve falhar)**

`packages/sim/test/runner.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { SUGGESTED_TEAMS } from '@pfl/engine';
import { playMatch, runSim } from '../src/runner';

describe('playMatch', () => {
  it('joga até o fim e o vencedor tem mais pontos', () => {
    const rec = playMatch(SUGGESTED_TEAMS[0], SUGGESTED_TEAMS[1], 11, 12);
    expect(rec.events.at(-1)?.t).toBe('MATCH_END');
    expect(rec.score[rec.winner]).toBeGreaterThan(rec.score[rec.winner === 'A' ? 'B' : 'A']);
    expect(rec.teams).toEqual({ A: SUGGESTED_TEAMS[0].name, B: SUGGESTED_TEAMS[1].name });
  });

  it('é determinístico', () => {
    expect(playMatch(SUGGESTED_TEAMS[2], SUGGESTED_TEAMS[3], 5, 6)).toEqual(playMatch(SUGGESTED_TEAMS[2], SUGGESTED_TEAMS[3], 5, 6));
  });

  it('lança erro em vez de travar se a partida não terminar no limite de ações', () => {
    expect(() => playMatch(SUGGESTED_TEAMS[0], SUGGESTED_TEAMS[1], 11, 12, 10)).toThrow(/não terminou em 10 ações \(seed 11\)/);
  });
});

describe('runSim', () => {
  it('joga exatamente N partidas, em pares com os lados trocados', () => {
    const recs = runSim({ games: 9, seed: 3 });
    expect(recs).toHaveLength(9);
    for (let i = 0; i + 1 < recs.length; i += 2) {
      expect(recs[i + 1].teams).toEqual({ A: recs[i].teams.B, B: recs[i].teams.A });
      expect(recs[i].teams.A).not.toBe(recs[i].teams.B);
    }
  });

  it('usa times sugeridos e aleatórios', () => {
    const names = runSim({ games: 16, seed: 4 }).flatMap((r) => [r.teams.A, r.teams.B]);
    expect(names.some((n) => SUGGESTED_TEAMS.some((t) => t.name === n))).toBe(true);
    expect(names.some((n) => n.startsWith('Aleatório'))).toBe(true);
  });

  it('rejeita número de partidas inválido', () => {
    expect(() => runSim({ games: 0, seed: 1 })).toThrow(/games inválido/);
    expect(() => runSim({ games: -3, seed: 1 })).toThrow(/games inválido/);
    expect(() => runSim({ games: 2.5, seed: 1 })).toThrow(/games inválido/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/sim/test/runner.test.ts`
Expected: FAIL — `Failed to resolve import "../src/runner"`.

- [ ] **Step 3: Implementar**

`packages/sim/src/runner.ts`:
```ts
import { SUGGESTED_TEAMS, createMatch, rngNext, step, type GameEvent, type Team, type TeamKey } from '@pfl/engine';
import { actingTeams, botAction } from './bot';
import { randomTeam } from './random-team';

export const MAX_STEPS_PER_MATCH = 5000;

export interface MatchRecord {
  teams: Record<TeamKey, string>;
  score: Record<TeamKey, number>;
  winner: TeamKey;
  events: GameEvent[];
}

/** Uma partida bot × bot. Lança erro (em vez de travar) se não terminar em `maxSteps` ações. */
export function playMatch(teamA: Team, teamB: Team, seed: number, botSeed: number, maxSteps = MAX_STEPS_PER_MATCH): MatchRecord {
  let { state, events } = createMatch(teamA, teamB, seed);
  const log: GameEvent[] = [...events];
  let rng = botSeed;
  for (let i = 0; i < maxSteps; i++) {
    if (state.phase === 'MATCH_END') {
      const winner: TeamKey = state.score.A > state.score.B ? 'A' : 'B';
      return { teams: { A: teamA.name, B: teamB.name }, score: { ...state.score }, winner, events: log };
    }
    const team = actingTeams(state)[0];
    const decision = botAction(state, team, rng);
    rng = decision.rng;
    const r = step(state, decision.action);
    state = r.state;
    log.push(...r.events);
  }
  throw new Error(`partida não terminou em ${maxSteps} ações (seed ${seed})`);
}

export interface SimOptions {
  games: number;
  seed: number;
  /** a cada quantos confrontos um usa dois times sugeridos (o resto usa times aleatórios) */
  suggestedEvery?: number;
}

/**
 * Roda `games` partidas. Os confrontos vêm em pares com os lados trocados (A/B), para que a vantagem
 * da primeira posse não contamine as estatísticas de carta. Os dois times de um confronto são sempre diferentes.
 */
export function runSim(options: SimOptions): MatchRecord[] {
  if (!Number.isInteger(options.games) || options.games < 1) throw new Error(`games inválido: ${options.games}`);
  const every = options.suggestedEvery ?? 4;
  let rng = options.seed | 0;
  const next = (): number => {
    const r = rngNext(rng);
    rng = r.state;
    return Math.floor(r.value * 2 ** 31);
  };
  const records: MatchRecord[] = [];
  for (let pair = 0; records.length < options.games; pair++) {
    let x: Team;
    let y: Team;
    if (pair % every === 0) {
      const i = next() % SUGGESTED_TEAMS.length;
      const j = (i + 1 + (next() % (SUGGESTED_TEAMS.length - 1))) % SUGGESTED_TEAMS.length;
      x = SUGGESTED_TEAMS[i];
      y = SUGGESTED_TEAMS[j];
    } else {
      const rx = randomTeam(next(), `Aleatório ${pair}a`);
      const ry = randomTeam(rx.rng, `Aleatório ${pair}b`);
      x = rx.team;
      y = ry.team;
    }
    const seed = next();
    const botSeed = next();
    records.push(playMatch(x, y, seed, botSeed));
    if (records.length < options.games) records.push(playMatch(y, x, seed, botSeed));
  }
  return records;
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run packages/sim/test/runner.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src/runner.ts packages/sim/test/runner.test.ts
git commit -m "feat(sim): runner bot × bot em pares com lados trocados"
```

---

### Task 8: Relatório de balanceamento e função do portão

**Files:**
- Create: `packages/sim/src/report.ts`
- Test: `packages/sim/test/report.test.ts`

**Interfaces:**
- Consumes:
  - Plano 1: `getCard`, `PlayOutcome`, `ReadResult`, `TeamKey`
  - Task 1: os campos `readFactor`, `statFactor` e `varianceFactor` de `PlayOutcome`
  - Task 7: `MatchRecord` e `runSim`
- Produces:
  - `WinStat { games; wins; winRate }`, `ReadStat { plays; meanYards; turnovers; buckets }`, `Factor = 'read' | 'type' | 'stats' | 'variance'`
  - `Report { matches; winRateA; cards; categories; reads; readHitRate; pointsPerPossession; playsPerMatch; contribution }`
  - `TARGET_CONTRIBUTION`: read 0,5 / type 0,2 / stats 0,2 / variance 0,1 (spec 4.3)
  - `buildReport(records: readonly MatchRecord[]): Report`
  - `GateOptions { minSample; low; high }` e `DEFAULT_GATE = { minSample: 1000, low: 0.45, high: 0.55 }`
  - `GateResult { sampled: string[]; failures: { id; games; winRate }[] }` e `balanceGate(report: Report, options?: GateOptions): GateResult`. Só avalia cartas `TYPE` e `SIGNATURE` com amostra ≥ `minSample`.
  - `formatReport(report: Report, gate: GateResult): string`

**Definições:**
- **Win rate por carta:** para cada partida e cada time, cada carta que o time jogou ao menos uma vez conta 1 jogo, e conta vitória se o time venceu.
- **Win rate por categoria:** mesma regra, aplicada às categorias das cartas jogadas.
- **Contribuição observada:** nas jogadas `GAIN` sem big play, é a variância de cada parcela, dividida pela soma das quatro variâncias:
  - `ln(readFactor)`
  - `ln(offTypeMult/defTypeMult)`
  - `ln(statFactor)`
  - `ln(varianceFactor)`
- **Impacto de tipo e de stats:** é a parcela `type` e a parcela `stats` dessa contribuição.

- [ ] **Step 1: Escrever o teste (deve falhar)**

`packages/sim/test/report.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { GameEvent, PlayOutcome } from '@pfl/engine';
import { buildReport, balanceGate, formatReport, type Report } from '../src/report';
import { runSim, type MatchRecord } from '../src/runner';

const outcome = (o: Partial<PlayOutcome>): PlayOutcome => ({
  kind: 'GAIN', yards: 5, bigPlay: false, read: 'NEUTRAL', offActors: [], defActors: [], offTypeMult: 1, defTypeMult: 1,
  readFactor: 1, statFactor: 1, varianceFactor: 1, ...o,
});

/** Partida sintética: A ataca 1 drive e joga normal_tackle; B defende com normal_wall; depois B ataca com basic_pass. */
function record(winner: 'A' | 'B'): MatchRecord {
  const events: GameEvent[] = [
    { t: 'DRIVE_START', offense: 'A', ballOn: 25, possession: 1, overtimeRound: 0 },
    { t: 'CARDS', offense: 'normal_tackle', defense: 'normal_wall', read: 'RIGHT' },
    { t: 'PLAY', outcome: outcome({ read: 'RIGHT', yards: -1, readFactor: 0.4, statFactor: 0.9, varianceFactor: 0.95 }) },
    { t: 'CARDS', offense: 'normal_tackle', defense: 'basic_defense', read: 'NEUTRAL' },
    { t: 'PLAY', outcome: outcome({ yards: 12, statFactor: 1.2, varianceFactor: 1.1, offTypeMult: 1.15 }) },
    { t: 'DRIVE_START', offense: 'B', ballOn: 25, possession: 1, overtimeRound: 0 },
    { t: 'CARDS', offense: 'basic_pass', defense: 'electric_paralysis', read: 'WRONG' },
    { t: 'PLAY', outcome: outcome({ kind: 'INTERCEPTION', read: 'WRONG', yards: 7, readFactor: 1.6 }) },
    { t: 'MATCH_END', score: winner === 'A' ? { A: 7, B: 0 } : { A: 0, B: 3 } },
  ];
  return { teams: { A: 'x', B: 'y' }, score: winner === 'A' ? { A: 7, B: 0 } : { A: 0, B: 3 }, winner, events };
}

describe('buildReport', () => {
  const report: Report = buildReport([record('A'), record('A'), record('B')]);

  it('conta win rate por carta uma vez por partida, do time que jogou', () => {
    expect(report.cards.normal_tackle).toEqual({ games: 3, wins: 2, winRate: 2 / 3 });
    expect(report.cards.normal_wall).toEqual({ games: 3, wins: 1, winRate: 1 / 3 }); // jogada por B
    expect(report.cards.electric_paralysis).toEqual({ games: 3, wins: 2, winRate: 2 / 3 }); // jogada por A
    expect(report.categories.RUN_INSIDE.games).toBe(3);
  });

  it('agrega jardas por leitura, acerto de leitura, pontos por posse e jogadas por partida', () => {
    expect(report.reads.RIGHT).toMatchObject({ plays: 3, meanYards: -1, turnovers: 0, buckets: [3, 0, 0, 0, 0] });
    expect(report.reads.NEUTRAL).toMatchObject({ plays: 3, meanYards: 12, buckets: [0, 0, 0, 3, 0] });
    expect(report.reads.WRONG).toMatchObject({ plays: 3, turnovers: 3 });
    expect(report.readHitRate).toBeCloseTo(1 / 3);
    expect(report.pointsPerPossession).toBeCloseTo((7 + 7 + 3) / 6);
    expect(report.playsPerMatch).toBe(3);
    expect(report.winRateA).toBeCloseTo(2 / 3);
  });

  it('a contribuição dos fatores soma 1', () => {
    const c = report.contribution;
    expect(c.read + c.type + c.stats + c.variance).toBeCloseTo(1);
    expect(c.read).toBeGreaterThan(0);
  });
});

describe('balanceGate', () => {
  const report = buildReport([record('A'), record('A'), record('B')]);

  it('ignora básicas e cartas sem amostra suficiente', () => {
    expect(balanceGate(report, { minSample: 4, low: 0.45, high: 0.55 }).sampled).toEqual([]);
    const gate = balanceGate(report, { minSample: 3, low: 0.45, high: 0.55 });
    expect(gate.sampled).toEqual(['electric_paralysis', 'normal_tackle', 'normal_wall']);
    expect(gate.failures.map((f) => f.id)).toEqual(['electric_paralysis', 'normal_tackle', 'normal_wall']);
  });

  it('aprova carta dentro da faixa', () => {
    const gate = balanceGate(report, { minSample: 3, low: 0.3, high: 0.7 });
    expect(gate.failures).toEqual([]);
  });
});

describe('formatReport', () => {
  it('mostra as seções do relatório e marca as cartas reprovadas', () => {
    const report = buildReport([record('A'), record('A'), record('B')]);
    const text = formatReport(report, balanceGate(report, { minSample: 3, low: 0.45, high: 0.55 }));
    for (const s of ['Acerto de leitura', 'Pontos por posse', 'Jogadas por partida', 'Contribuição observada', 'Win rate por categoria', 'Win rate por carta']) {
      expect(text).toContain(s);
    }
    expect(text).toMatch(/normal_tackle .*<-- FORA/);
    expect(text).toContain('Portão: 3 cartas com amostra suficiente, 3 fora de 45–55%');
  });
});

describe('determinismo do relatório', () => {
  it('a mesma seed gera o mesmo relatório', () => {
    expect(buildReport(runSim({ games: 6, seed: 21 }))).toEqual(buildReport(runSim({ games: 6, seed: 21 })));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/sim/test/report.test.ts`
Expected: FAIL — `Failed to resolve import "../src/report"`.

- [ ] **Step 3: Implementar**

`packages/sim/src/report.ts`:
```ts
import { getCard, type PlayOutcome, type ReadResult, type TeamKey } from '@pfl/engine';
import type { MatchRecord } from './runner';

export interface WinStat {
  games: number;
  wins: number;
  winRate: number;
}

export interface ReadStat {
  plays: number;
  /** média de jardas (GAIN/SACK; INCOMPLETE conta 0; turnovers ficam de fora) */
  meanYards: number;
  turnovers: number;
  /** distribuição: ≤0, 1–4, 5–9, 10–19, 20+ jardas */
  buckets: [number, number, number, number, number];
}

export type Factor = 'read' | 'type' | 'stats' | 'variance';

export interface Report {
  matches: number;
  winRateA: number;
  cards: Record<string, WinStat>;
  categories: Record<string, WinStat>;
  reads: Record<ReadResult, ReadStat>;
  /** fração das jogadas em que a defesa acertou a leitura (✔) */
  readHitRate: number;
  pointsPerPossession: number;
  playsPerMatch: number;
  /** participação de cada fator na variação de log(jardas) das jogadas GAIN sem big play */
  contribution: Record<Factor, number>;
}

/** Pesos-alvo da spec 4.3. */
export const TARGET_CONTRIBUTION: Record<Factor, number> = { read: 0.5, type: 0.2, stats: 0.2, variance: 0.1 };

const READS: ReadResult[] = ['RIGHT', 'NEUTRAL', 'WRONG'];

function bucketOf(yards: number): number {
  if (yards <= 0) return 0;
  if (yards <= 4) return 1;
  if (yards <= 9) return 2;
  if (yards <= 19) return 3;
  return 4;
}

function variance(xs: number[]): number {
  if (xs.length === 0) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
}

function addWin(map: Record<string, WinStat>, key: string, won: boolean): void {
  const s = (map[key] ??= { games: 0, wins: 0, winRate: 0 });
  s.games += 1;
  if (won) s.wins += 1;
}

export function buildReport(records: readonly MatchRecord[]): Report {
  const cards: Record<string, WinStat> = {};
  const categories: Record<string, WinStat> = {};
  const reads = Object.fromEntries(
    READS.map((r) => [r, { plays: 0, meanYards: 0, turnovers: 0, buckets: [0, 0, 0, 0, 0] }]),
  ) as Record<ReadResult, ReadStat>;
  const yardSums: Record<ReadResult, number> = { RIGHT: 0, NEUTRAL: 0, WRONG: 0 };
  const logs: Record<Factor, number[]> = { read: [], type: [], stats: [], variance: [] };
  let plays = 0;
  let drives = 0;
  let points = 0;
  let winsA = 0;

  for (const rec of records) {
    if (rec.winner === 'A') winsA += 1;
    points += rec.score.A + rec.score.B;
    const played: Record<TeamKey, Set<string>> = { A: new Set(), B: new Set() };
    let offense: TeamKey = 'A';
    for (const e of rec.events) {
      if (e.t === 'DRIVE_START') {
        offense = e.offense;
        drives += 1;
      } else if (e.t === 'CARDS') {
        plays += 1;
        played[offense].add(e.offense);
        played[offense === 'A' ? 'B' : 'A'].add(e.defense);
      } else if (e.t === 'PLAY') {
        const o: PlayOutcome = e.outcome;
        const stat = reads[o.read];
        stat.plays += 1;
        if (o.kind === 'INTERCEPTION' || o.kind === 'FUMBLE') {
          stat.turnovers += 1;
        } else {
          const yards = o.kind === 'INCOMPLETE' ? 0 : o.yards;
          yardSums[o.read] += yards;
          stat.buckets[bucketOf(yards)] += 1;
        }
        if (o.kind === 'GAIN' && !o.bigPlay) {
          logs.read.push(Math.log(o.readFactor));
          logs.type.push(Math.log(o.offTypeMult / o.defTypeMult));
          logs.stats.push(Math.log(o.statFactor));
          logs.variance.push(Math.log(o.varianceFactor));
        }
      }
    }
    for (const key of ['A', 'B'] as const) {
      const won = rec.winner === key;
      for (const id of played[key]) addWin(cards, id, won);
      for (const cat of new Set([...played[key]].map((id) => getCard(id).category))) addWin(categories, cat, won);
    }
  }

  for (const s of [...Object.values(cards), ...Object.values(categories)]) s.winRate = s.games ? s.wins / s.games : 0;
  for (const r of READS) {
    const counted = reads[r].plays - reads[r].turnovers;
    reads[r].meanYards = counted ? yardSums[r] / counted : 0;
  }
  const vars = { read: variance(logs.read), type: variance(logs.type), stats: variance(logs.stats), variance: variance(logs.variance) };
  const totalVar = vars.read + vars.type + vars.stats + vars.variance || 1;
  const totalPlays = READS.reduce((s, r) => s + reads[r].plays, 0);

  return {
    matches: records.length,
    winRateA: records.length ? winsA / records.length : 0,
    cards,
    categories,
    reads,
    readHitRate: totalPlays ? reads.RIGHT.plays / totalPlays : 0,
    pointsPerPossession: drives ? points / drives : 0,
    playsPerMatch: records.length ? plays / records.length : 0,
    contribution: {
      read: vars.read / totalVar,
      type: vars.type / totalVar,
      stats: vars.stats / totalVar,
      variance: vars.variance / totalVar,
    },
  };
}

export interface GateOptions {
  minSample: number;
  low: number;
  high: number;
}
/** Spec 7.3: win rate por carta (partidas em que foi jogada) entre 45% e 55%. */
export const DEFAULT_GATE: GateOptions = { minSample: 1000, low: 0.45, high: 0.55 };

export interface GateResult {
  /** cartas de deck (TYPE/SIGNATURE) com amostra ≥ minSample */
  sampled: string[];
  failures: { id: string; games: number; winRate: number }[];
}

export function balanceGate(report: Report, options: GateOptions = DEFAULT_GATE): GateResult {
  const sampled = Object.entries(report.cards)
    .filter(([id, s]) => {
      const origin = getCard(id).origin;
      return (origin === 'TYPE' || origin === 'SIGNATURE') && s.games >= options.minSample;
    })
    .map(([id]) => id)
    .sort();
  const failures = sampled
    .map((id) => ({ id, games: report.cards[id].games, winRate: report.cards[id].winRate }))
    .filter((f) => f.winRate < options.low || f.winRate > options.high);
  return { sampled, failures };
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

export function formatReport(report: Report, gate: GateResult): string {
  const lines: string[] = [];
  lines.push(`PFL — relatório de balanceamento (${report.matches} partidas)`);
  lines.push(`Win rate do time A (primeira posse): ${pct(report.winRateA)}`);
  lines.push(`Jogadas por partida: ${report.playsPerMatch.toFixed(1)}   Pontos por posse: ${report.pointsPerPossession.toFixed(2)}`);
  lines.push(`Acerto de leitura (✔): ${pct(report.readHitRate)}`);
  lines.push('');
  lines.push('Jardas por resultado de leitura (média | ≤0 / 1–4 / 5–9 / 10–19 / 20+ | turnovers)');
  for (const r of READS) {
    const s = report.reads[r];
    lines.push(`  ${r.padEnd(8)} n=${String(s.plays).padStart(6)}  média ${s.meanYards.toFixed(2).padStart(6)} | ${s.buckets.join(' / ')} | ${s.turnovers}`);
  }
  lines.push('');
  lines.push('Contribuição observada (alvo da spec 4.3)');
  for (const f of ['read', 'type', 'stats', 'variance'] as Factor[]) {
    lines.push(`  ${f.padEnd(9)} ${pct(report.contribution[f]).padStart(6)}  (alvo ${pct(TARGET_CONTRIBUTION[f])})`);
  }
  lines.push('');
  lines.push('Win rate por categoria');
  for (const [cat, s] of Object.entries(report.categories).sort()) {
    lines.push(`  ${cat.padEnd(12)} ${pct(s.winRate).padStart(6)}  (${s.games} jogos)`);
  }
  lines.push('');
  lines.push('Win rate por carta (jogos em que foi jogada)');
  for (const [id, s] of Object.entries(report.cards).sort((a, b) => b[1].winRate - a[1].winRate)) {
    const flag = gate.failures.some((f) => f.id === id) ? '  <-- FORA' : '';
    lines.push(`  ${id.padEnd(28)} ${pct(s.winRate).padStart(6)}  (${s.games} jogos)${flag}`);
  }
  lines.push('');
  lines.push(`Portão: ${gate.sampled.length} cartas com amostra suficiente, ${gate.failures.length} fora de 45–55%`);
  return lines.join('\n');
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run packages/sim/test/report.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src/report.ts packages/sim/test/report.test.ts
git commit -m "feat(sim): relatório de balanceamento e função do portão"
```

---

### Task 9: CLI `npm run sim -- --games N [--seed S]`

**Files:**
- Create: `packages/sim/src/cli.ts`, `packages/sim/src/index.ts`
- Modify: `package.json` (raiz), bloco `scripts`
- Test: `packages/sim/test/cli.test.ts`

**Interfaces:**
- Consumes:
  - Task 7: `runSim`
  - Task 8: `buildReport`, `balanceGate`, `formatReport`, `DEFAULT_GATE`
- Produces:
  - `CliOptions { games: number; seed: number; minSample: number; gate: boolean }`
  - `USAGE`
  - `parseArgs(argv: readonly string[]): CliOptions`. Lança `Error` com mensagem e uso.
  - `main(argv, out?, err?): number`. Código de saída: 0 ok; 1 portão reprovado com `--gate`; 2 argumentos inválidos.
  - Script raiz `npm run sim -- --games N [--seed S] [--min-sample M] [--gate]`. Padrões: seed 1, amostra mínima 1000.

- [ ] **Step 1: Escrever o teste (deve falhar)**

`packages/sim/test/cli.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { main, parseArgs } from '../src/cli';

describe('parseArgs', () => {
  it('lê --games, --seed, --min-sample e --gate', () => {
    expect(parseArgs(['--games', '10'])).toEqual({ games: 10, seed: 1, minSample: 1000, gate: false });
    expect(parseArgs(['--games', '4', '--seed', '0', '--min-sample', '50', '--gate'])).toEqual({ games: 4, seed: 0, minSample: 50, gate: true });
  });

  it.each([
    [[], /--games é obrigatório/],
    [['--games'], /--games precisa/],
    [['--games', '0'], /--games precisa/],
    [['--games', '-5'], /--games precisa/],
    [['--games', 'dez'], /--games precisa/],
    [['--games', '2.5'], /--games precisa/],
    [['--games', '--seed', '3'], /--games precisa/],
    [['--games', '3', '--seed', 'x'], /--seed precisa/],
    [['--games', '3', '--turbo'], /opção desconhecida/],
  ])('rejeita %j com mensagem clara', (argv, message) => {
    expect(() => parseArgs(argv as string[])).toThrow(message);
  });
});

describe('main', () => {
  it('devolve 2 e explica o uso quando os argumentos são inválidos', () => {
    const errors: string[] = [];
    expect(main(['--games', '0'], () => {}, (l) => errors.push(l))).toBe(2);
    expect(errors.join('\n')).toContain('uso: npm run sim -- --games N');
  });

  it('roda e imprime o relatório', () => {
    const out: string[] = [];
    expect(main(['--games', '4', '--seed', '2'], (l) => out.push(l))).toBe(0);
    expect(out.join('\n')).toContain('relatório de balanceamento (4 partidas)');
  });

  it('com --gate devolve 1 se alguma carta amostrada sair da faixa', () => {
    // com amostra mínima 1, quase toda carta jogada em 2 partidas tem win rate 0% ou 100%
    expect(main(['--games', '2', '--seed', '2', '--min-sample', '1', '--gate'], () => {})).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/sim/test/cli.test.ts`
Expected: FAIL — `Failed to resolve import "../src/cli"`.

- [ ] **Step 3: Implementar a CLI e o índice do pacote**

`packages/sim/src/cli.ts`:
```ts
import { pathToFileURL } from 'node:url';
import { runSim } from './runner';
import { DEFAULT_GATE, balanceGate, buildReport, formatReport } from './report';

export interface CliOptions {
  games: number;
  seed: number;
  minSample: number;
  gate: boolean;
}

export const USAGE = 'uso: npm run sim -- --games N [--seed S] [--min-sample M] [--gate]';

function positiveInt(flag: string, raw: string | undefined, allowZero = false): number {
  const n = Number(raw);
  if (raw === undefined || raw.startsWith('--') || !Number.isInteger(n) || n < (allowZero ? 0 : 1)) {
    throw new Error(`${flag} precisa de um inteiro ${allowZero ? '≥ 0' : 'positivo'} (recebido: ${raw ?? 'nada'})\n${USAGE}`);
  }
  return n;
}

export function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = { games: 0, seed: 1, minSample: DEFAULT_GATE.minSample, gate: false };
  let sawGames = false;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    switch (flag) {
      case '--games':
        options.games = positiveInt(flag, argv[++i]);
        sawGames = true;
        break;
      case '--seed':
        options.seed = positiveInt(flag, argv[++i], true);
        break;
      case '--min-sample':
        options.minSample = positiveInt(flag, argv[++i]);
        break;
      case '--gate':
        options.gate = true;
        break;
      default:
        throw new Error(`opção desconhecida: ${flag}\n${USAGE}`);
    }
  }
  if (!sawGames) throw new Error(`--games é obrigatório\n${USAGE}`);
  return options;
}

/** Devolve o código de saída: 0 ok; 1 portão reprovado (com --gate); 2 argumentos inválidos. */
export function main(argv: readonly string[], out: (line: string) => void = console.log, err: (line: string) => void = console.error): number {
  let options: CliOptions;
  try {
    options = parseArgs(argv);
  } catch (e) {
    err((e as Error).message);
    return 2;
  }
  const started = Date.now();
  const report = buildReport(runSim({ games: options.games, seed: options.seed }));
  const gate = balanceGate(report, { ...DEFAULT_GATE, minSample: options.minSample });
  out(formatReport(report, gate));
  out(`Seed ${options.seed}, amostra mínima ${options.minSample}, ${((Date.now() - started) / 1000).toFixed(1)} s`);
  return options.gate && gate.failures.length > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
```

`packages/sim/src/index.ts`:
```ts
export * from './pick';
export * from './bot';
export * from './random-team';
export * from './runner';
export * from './report';
```

No `package.json` da raiz, acrescentar ao objeto `scripts` (mantendo os que já existem):
```json
    "sim": "tsx packages/sim/src/cli.ts"
```

O script chama o `tsx` direto, sem `npm run -w`. Assim os argumentos depois de `--` chegam à CLI sem um segundo `--`.

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run packages/sim/test/cli.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Exercitar a CLI de verdade**

Run: `npm run sim -- --games 20 --seed 3`
Expected: relatório começando por `PFL — relatório de balanceamento (20 partidas)`, com as seções:
- jardas por leitura;
- contribuição;
- win rate por categoria;
- win rate por carta;
- linha `Portão: …`.

Código de saída 0.

Run: `npm run sim -- --games 0; echo "exit $?"`
Expected: `--games precisa de um inteiro positivo (recebido: 0)`, a linha de uso e `exit 2`.

Run: `npm run sim; echo "exit $?"`
Expected: `--games é obrigatório`, a linha de uso e `exit 2`.

- [ ] **Step 6: Commit**

```bash
git add package.json packages/sim/src/cli.ts packages/sim/src/index.ts packages/sim/test/cli.test.ts
git commit -m "feat(sim): CLI npm run sim -- --games N"
```

---

### Task 10: Portão de balanceamento e calibração

**Files:**
- Create: `packages/sim/test/balance-gate.test.ts`
- Modify (calibração; só os números listados como ajustáveis abaixo):
  - `packages/engine/src/cards/categories.ts` (`OFFENSE_PROFILES`)
  - `packages/engine/src/cards/catalog.ts` (`baseYards` de cartas `TYPE`/`SIGNATURE`)
  - `packages/engine/src/resolve.ts` (`STUFF_PENALTY`, `READ_INCOMPLETION`, `READ_BIG_PLAY`, faixa do `statFactor`)
- Possivelmente: `packages/engine/test/__snapshots__/full-match.test.ts.snap` (só pelo procedimento do Step 7)

**Interfaces:**
- Consumes:
  - Task 7: `runSim`
  - Task 8: `buildReport`, `balanceGate`
- Produces:
  - um teste determinístico: 2000 partidas, seed 2026, amostra mínima 600 jogos, faixa 45–55%, ao menos 30 cartas avaliadas, timeout de 300 s;
  - os valores calibrados.

**Tamanho do portão:**
- **Amostra mínima.** Com amostra n, o desvio-padrão do win rate de uma carta neutra é √(0,25/n). Com n = 600, 2σ ≈ 4,1 pontos, abaixo dos 5 pontos da faixa.
- **Número de partidas.** No ambiente de referência, 2000 partidas levam cerca de 45 s e deixam 31 a 34 cartas com ≥ 600 jogos. A exigência de ≥ 30 cartas avaliadas impede que um N pequeno demais aprove o portão por vacuidade.
- **Seed única.** Seed e N fixos tornam o teste determinístico, mas podem viciar a calibração nessa seed. Por isso o Step 6 confirma com outra seed e mais partidas pela CLI.

- [ ] **Step 1: Escrever o teste do portão**

`packages/sim/test/balance-gate.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { runSim } from '../src/runner';
import { buildReport, balanceGate } from '../src/report';

// Portão de balanceamento (spec 7.3), com N reduzido para rodar na suíte.
// N e seed fixos → resultado determinístico. Amostra mínima 600: 2σ ≈ ±4,1 pontos em torno de 50%.
const GATE_GAMES = 2000;
const GATE_SEED = 2026;
const GATE_MIN_SAMPLE = 600;
/** o portão só vale se cobrir uma parte relevante do catálogo */
const GATE_MIN_SAMPLED_CARDS = 30;

describe('portão de balanceamento', () => {
  it(
    `nenhuma carta com ≥ ${GATE_MIN_SAMPLE} jogos fica fora de 45–55% (${GATE_GAMES} partidas, seed ${GATE_SEED})`,
    () => {
      const report = buildReport(runSim({ games: GATE_GAMES, seed: GATE_SEED }));
      const gate = balanceGate(report, { minSample: GATE_MIN_SAMPLE, low: 0.45, high: 0.55 });
      expect(gate.sampled.length).toBeGreaterThanOrEqual(GATE_MIN_SAMPLED_CARDS);
      expect(gate.failures).toEqual([]);
    },
    300_000,
  );
});
```

- [ ] **Step 2: Rodar o portão e ler a linha de base**

Run: `npx vitest run packages/sim/test/balance-gate.test.ts`
Expected: FAIL em cerca de 45 s. No ambiente de referência, `gate.failures` lista 5 cartas (há 33 com amostra suficiente):

| Carta | Win rate | Jogos |
|---|---|---|
| `sig_alakazam_teleport` | 60,5% | 874 |
| `poison_acid_screen` | 56,8% | 759 |
| `poison_powder_fake` | 56,6% | 767 |
| `psychic_confusion` | 56,1% | 1521 |
| `psychic_foresight` | 55,6% | 716 |

Também perto do corte, com menos de 600 jogos: `ghost_lick` (60,6%, 576) e `psychic_reflect` (59,6%, 539).

Para o relatório completo, rode `npm run sim -- --games 2000 --seed 2026 --min-sample 600 --gate`. Na linha de base ele mostra:
- **Contribuição:** read ≈ 79%, type ≈ 6%, stats ≈ 13%, variance ≈ 2%.
- **Partida:** cerca de 75 jogadas por partida e cerca de 2,9 pontos por posse.
- **Leitura:** acerto ✔ ≈ 29%; média de jardas ✔ 0,3, · 9,0, ✖ 14,5.

- [ ] **Step 3: Conhecer o que pode e o que não pode ser mexido**

**Ajustáveis (calibração):**
- `baseYards` de qualquer carta `TYPE` ou `SIGNATURE`, incluindo as do Plano 1. O teste da Task 2 não fixa `baseYards`.
- `OFFENSE_PROFILES[cat].baseYards` e `OFFENSE_PROFILES[cat].risk.{sack, interception, fumble, incompletion, bigPlay}`.
- `STUFF_PENALTY`, `READ_INCOMPLETION` e `READ_BIG_PLAY` em `resolve.ts`.
- A faixa `clamp(…, 0.6, 1.4)` do `statFactor`, em `resolve.ts`.

**Fixados pela spec (não mexer sem pedir ao usuário):**
- `READ_YARDS` (1,6 / 1,0 / 0,4) e o risco ×2 com leitura certa (`riskMult`).
- `TYPE_SCALE` e `AFFINITY_BONUS` (0,1).
- `variance: 0.15`. Fica dentro de `OFFENSE_PROFILES`, mas é o ±15% da spec.
- Todo o objeto `FATIGUE`.
- `READ_MATRIX`.
- Custo e teto (`speciesCost`, `SALARY_CAP`) e os tamanhos de elenco e deck.
- O mapeamento categoria → atributos de `MATCHUPS` (spec 4.2).
- Número de posses.

**Também fora da calibração:**
- `specials.ts`: `PAT_PROBABILITY`, punt e FG estão fixados por `specials.test.ts` do Plano 1.
- Lado, categoria, elemento e requisitos das cartas: mudam o significado e quebram as Tasks 2 e 3.
- Parâmetros do bot e do gerador de times: ajustá-los para passar no portão esconderia o desequilíbrio em vez de corrigi-lo.

- [ ] **Step 4: Iteração 1 (medida no ambiente de referência)**

A causa comum dos desvios: cartas que exigem QB Psíquico ou Fantasma/Venenoso entram em times com QB de Sp. Atk alto, e o Play-Action (QB Braço + WR Velocidade vs S/LB Leitura) é a categoria que mais rende para eles.

Em `packages/engine/src/cards/categories.ts`, substituir:
```ts
  PLAY_ACTION: { baseYards: 12, variance: 0.15, risk: { sack: 0.1, interception: 0.03, fumble: 0, incompletion: 0.35, bigPlay: 0.08 } },
```
por:
```ts
  PLAY_ACTION: { baseYards: 10, variance: 0.15, risk: { sack: 0.1, interception: 0.03, fumble: 0, incompletion: 0.35, bigPlay: 0.08 } },
```

Em `packages/engine/src/cards/catalog.ts`, substituir:
```ts
  offense('sig_alakazam_teleport', 'Teleporte', 'PLAY_ACTION', 'psychic', [bySpecies('QB', [63, 64, 65])], 'SIGNATURE', 13),
```
por:
```ts
  offense('sig_alakazam_teleport', 'Teleporte', 'PLAY_ACTION', 'psychic', [bySpecies('QB', [63, 64, 65])], 'SIGNATURE', 11),
```

Run: `npx vitest run packages/sim/test/balance-gate.test.ts`
Expected (referência): ainda FAIL, com 3 cartas:

| Carta | Win rate | Jogos |
|---|---|---|
| `sig_alakazam_teleport` | 57,9% | 872 |
| `psychic_foresight` | 57,3% | 721 |
| `poison_powder_fake` | 55,6% | 766 |

- [ ] **Step 5: Iteração 2 (medida no ambiente de referência)**

Em `packages/engine/src/cards/catalog.ts`, substituir:
```ts
  offense('sig_alakazam_teleport', 'Teleporte', 'PLAY_ACTION', 'psychic', [bySpecies('QB', [63, 64, 65])], 'SIGNATURE', 11),
```
por:
```ts
  offense('sig_alakazam_teleport', 'Teleporte', 'PLAY_ACTION', 'psychic', [bySpecies('QB', [63, 64, 65])], 'SIGNATURE', 9),
```

E substituir:
```ts
  offense('poison_powder_fake', 'Pó Venenoso', 'PLAY_ACTION', 'poison', [byType('RB', ['poison'])]),
```
por:
```ts
  offense('poison_powder_fake', 'Pó Venenoso', 'PLAY_ACTION', 'poison', [byType('RB', ['poison'])], 'TYPE', 8),
```

Run: `npx vitest run packages/sim/test/balance-gate.test.ts`
Expected (referência): FAIL, com 2 cartas:

| Carta | Win rate | Jogos |
|---|---|---|
| `psychic_foresight` | 56,7% | 718 |
| `sig_alakazam_teleport` | 55,5% | 871 |

- [ ] **Step 6: Laço de calibração até passar**

Repita este laço até o Step 6.4 passar, ou até cair num caso de parada (Step 6.5).

**6.1 Ajustar** cada carta reprovada (uma iteração por vez):
- **Carta de ataque acima de 55%:** reduza o `baseYards` dela em 1. Se ela não tem `baseYards`, acrescente o da categoria menos 1 (`'TYPE', N` ou `'SIGNATURE', N` no fim da chamada `offense(...)`).
- **Carta de ataque abaixo de 45%:** aumente em 1.
- **Várias cartas da mesma categoria desviando no mesmo sentido:** ajuste `OFFENSE_PROFILES[cat].baseYards` em 1, em vez de carta a carta.

**6.2 Rodar o portão:**

Run: `npx vitest run packages/sim/test/balance-gate.test.ts`

**6.3 Rodar o resto da suíte:**

Run: `npx vitest run --exclude '**/balance-gate.test.ts'`
Expected: PASS. Se falhar:
- **Snapshot golden de `full-match.test.ts`:** siga o Step 7.
- **Propriedades da Task 7 do Plano 1 (✔ < · < ✖, tipo, fadiga) ou testes das Tasks 2–3:** a calibração foi longe demais. Desfaça o último ajuste.

**6.4 Confirmar** com outra seed e mais partidas, para não viciar na seed 2026:

Run: `npm run sim -- --games 6000 --seed 7 --min-sample 1000 --gate; echo "exit $?"`
Expected: `exit 0`. Se reprovar aqui e passar no portão, a carta está no limite: volte ao 6.1 com ela.

**6.5 Parar e perguntar ao usuário** quando:
- a carta reprovada é de **defesa**: não existe alavanca por carta, porque a carta só pode sobrescrever `baseYards` (spec 3.1) e a defesa não tem perfil; ou
- o desvio é de **espécie**, e não da carta: todas as cartas que exigem o mesmo tipo de Pokémon desviam no mesmo sentido, e reduzir `baseYards` 3 vezes seguidas não aproxima a carta da faixa.

Nesses casos, não force números fora da lista de ajustáveis. Mande ao usuário:
- o relatório completo;
- as cartas reprovadas;
- as opções que dependem dele:
  - (a) mudar a fórmula de custo para valorizar Sp. Atk;
  - (b) mudar os pesos de `MATCHUPS` para o QB pesar menos;
  - (c) aceitar a carta como exceção documentada.

**Situação esperada no ambiente de referência:** depois do Step 5, `sig_alakazam_teleport` volta à faixa com mais 1 ou 2 reduções. `psychic_foresight` (Previsão, Zona Curta, S Psíquico) cai no caso de parada: é uma carta de defesa, e o desvio vem da força dos Psíquicos na vaga de S.

- [ ] **Step 7: Snapshot golden do Plano 1**

`packages/engine/test/full-match.test.ts` guarda placar, `turnId` e número de ações de uma partida fixa com `electricTeam`. Ajustes em `OFFENSE_PROFILES` ou em `baseYards` de cartas do deck desse time (`electric_thunder_screen`, `normal_tackle`, `fighting_submission`, `ground_earthquake`, `rock_avalanche`, `bug_quick_bite`) mudam esse resultado. No ambiente de referência, as iterações 1 e 2 **não** o mudaram.

Se o snapshot falhar:
1. Confirme com `git diff` que só números calibráveis mudaram.
2. Atualize **só esse arquivo**: `npx vitest run packages/engine/test/full-match.test.ts -u`.
3. Rode `npx vitest run packages/engine/test/full-match.test.ts` de novo, sem `-u`, e confirme que passa.

Nunca use `-u` na suíte inteira.

- [ ] **Step 8: Contribuição observada (registrar, não perseguir)**

A spec 4.3 pede pesos-alvo de read ~50%, type ~20%, stats ~20% e variance ~10%. Com os números fixados pela spec, isso não é atingível pela métrica deste relatório:
- **Leitura:** só os multiplicadores 1,6 / 1,0 / 0,4 já produzem uma variância de log de cerca de 0,25.
- **Variância:** o ±15% produz cerca de 0,0075.
- **Resultado:** a leitura fica perto de 79% e a variância perto de 2%.

Não mexa em números fixados para perseguir esses pesos. Registre os valores do relatório final na mensagem de entrega ao usuário, como pendência de decisão dele.

- [ ] **Step 9: Rodar tudo e confirmar o determinismo**

Run: `npm test && npm run typecheck`
Expected: PASS. O portão leva cerca de 45 s.

Run: `grep -rn "Math.random" packages/engine/src packages/sim/src || echo "ok: sem Math.random"`
Expected: `ok: sem Math.random`.

- [ ] **Step 10: Commit**

Só faça o commit se o portão passou. Se parou no Step 6.5, **não faça commit** do teste do portão reprovado. Entregue ao usuário o relatório e as opções, e aguarde a decisão dele.

```bash
git add packages/sim/test/balance-gate.test.ts packages/engine/src/cards/categories.ts packages/engine/src/cards/catalog.ts packages/engine/src/resolve.ts
git add packages/engine/test/__snapshots__/full-match.test.ts.snap 2>/dev/null || true
git commit -m "balance: portão de balanceamento (spec 7.3) e calibração inicial"
```

---

## Self-Review

**Cobertura da spec e dos contratos:**

| Requisito | Task |
|---|---|
| 3.3 cartas de tipo (~60: 2 + 2 por tipo) e assinatura (~20) | 2 |
| contracts §1: os ids do Plano 1 preservados, com o mesmo significado | 2 (teste fixa as 40) |
| 4.1 tipagem Gen 1 (requisitos cumpríveis por espécies reais) | 2 |
| 3.4 deck 12 + 12, máx. 2 cópias, cartas elegíveis | 3, 6 |
| 5.1–5.2 elenco 16 + 1, teto 120, custo por BST, ≤ 1 lendário | 3, 6 |
| 5.4 depth chart completo para todas as formações/pacotes | 3, 6 |
| 5.5 seis times sugeridos válidos | 3 |
| contracts §1 `SUGGESTED_TEAMS` reexportado | 3 |
| 7.3 bot por down & distance com aleatoriedade ponderada | 5 |
| contracts §1 `botAction(state, team, rng)` | 5 |
| 7.3 times sugeridos + aleatórios válidos, N partidas | 6, 7 |
| 7.3 relatório: win rate por carta/categoria, jardas por leitura (média e distribuição), acerto de leitura, pontos por posse, jogadas por partida, impacto de tipo/stats | 1, 8 |
| contracts §4 `npm run sim -- --games N` | 9 |
| 7.3 / 9 portão 45–55% no CI com N reduzido | 10 |
| 7.3 participação próxima dos pesos-alvo | 8 (medida) e 10 Step 8 (inalcançável com os números fixados; escalado ao usuário) |

**Placeholders:** nenhum "TBD"/"TODO".
- Todo passo de código traz o arquivo ou o trecho completo.
- A Task 10 é a única com conteúdo que depende de dados. Ela traz o procedimento explícito, as duas primeiras iterações já medidas, com os números de saída, e um critério de parada.

**Consistência de tipos:**
- `PlayOutcome.readFactor`/`statFactor`/`varianceFactor` são definidos na Task 1 e lidos na Task 8.
- O helper `outcome()` de `report.test.ts` e o `o()` de `field.test.ts` preenchem os três campos.
- `actingTeams` e `botAction` são definidos na Task 5 e usados na Task 7.
- `randomTeam(rng, name, maxAttempts)` é definido na Task 6 e usado na Task 7.
- `MatchRecord` é definido na Task 7 e consumido na Task 8.
- `DEFAULT_GATE` é definido na Task 8 e usado na Task 9.
- `SUGGESTED_TEAMS` é definido na Task 3 e usado nas Tasks 5, 7 e 9. Os testes dependem da ordem dos 6 times (`[0]` Vermilion, especialista 81).
- Todos os nomes do Plano 1 (`createMatch`, `step`, `playableCards`, `playerView`, `MatchState`, `resolvePlay`, `OFFENSE_PROFILES`, `CARDS`, `validateTeam`, `speciesCost`, `rngNext`, `electricTeam`) aparecem com as assinaturas de lá.

**Review Focus:** os 5 itens têm teste na task dona:
1. Informação escondida: Task 5.
2. Argumentos da CLI: Task 9.
3. Gerador sem saída: Task 6.
4. Partida sem fim: Task 7.
5. Times sugeridos sem cartas mortas e válidos após a calibração: Tasks 3 e 10.
