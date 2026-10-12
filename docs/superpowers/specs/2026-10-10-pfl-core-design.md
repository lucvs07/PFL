# PFL: Pokémon Football League — GDD v2 (Núcleo Jogável)

> **Status:** design aprovado em brainstorming (2026-10-10). Substitui o `brainstorm-v1-PFL.md` ("PokéGridiron").
> **Escopo deste documento:** o **subprojeto 1 — Núcleo**: motor de partida + sistema de cartas + montagem de time + partida JxJ ao vivo entre amigos.

---

## 1. Visão Geral

| Item | Decisão |
|---|---|
| **Nome** | PFL — Pokémon Football League |
| **Gênero** | Estratégia tática por turnos JxJ, futebol americano com cartas |
| **Propósito** | Projeto pessoal / portfólio, para jogar com amigos (público fechado, sem monetização) |
| **Universo** | Os 151 Pokémon da 1ª geração, com tipagem e tabela de tipos de Kanto |
| **Ritmo** | Partida **ao vivo**, os dois jogadores online ao mesmo tempo, ~20–25 min |
| **Formato em campo** | **7v7** (formação modelada como dado, para permitir um modo 11v11 no futuro) |
| **Coração do jogo** | **Playbook gerado pelo elenco**: os Pokémon que você escala definem quais cartas/jogadas você pode ter. Ataque e defesa escolhem cartas **às cegas e simultaneamente**, depois de revelarem formação e pacote |
| **Sorte** | **Baixa**: a partida é decidida pela leitura (blefe/antecipação), depois por tipos e stats |
| **Visual** | Pixel art 2D, sprites Gen 5 Black/White (front/back) do repositório de sprites da PokéAPI, baixados no setup (decisão do usuário em 2026-10-11); dados e tipagens continuam Gen 1 |
| **Stack** | Monorepo TypeScript (npm workspaces): `engine` puro + `server` Node/Socket.io + `client` React/Phaser |

### 1.1 Roadmap de subprojetos

Cada subprojeto tem sua própria spec, plano e implementação.

1. **Núcleo (este documento)**: partida 7v7 ao vivo, cartas, teto salarial, sala por código.
2. **Contas e Draft**: persistência de usuários/times, draft snake ao vivo como modo alternativo de montagem.
3. **Progressão**: treino, evolução, desenvolvimento de stats, temporadas/ligas entre amigos.
4. **Modo 11v11 e Relógio**: formação completa, quartos com relógio e gestão de tempo, atribuição de confrontos pré-salva.
5. **Extras**: modo contra bot, Momentum (se o balanceamento pedir), polimento para celular.

---

## 2. Estrutura da Partida

### 2.1 Regras gerais

- **Posses:** **6 por time**, alternadas (configurável no motor).
- **Início de posse (posição de campo conta):**
  - **Na própria 25:** primeira posse de cada time e após o adversário pontuar (TD, FG ou safety). Funciona como um touchback, sem kickoff jogável nesta versão.
  - **Após punt:** onde a bola para, conforme a distância do punt (se passar da end zone, touchback na 25).
  - **Após turnover (interceptação/fumble) ou turnover on downs:** o novo atacante começa no ponto onde a bola ficou, com o campo invertido.
  - **Após FG errado:** o novo atacante começa no ponto do chute (ou na própria 20, o que for mais favorável a ele).
  - As prorrogações têm regra própria (abaixo).
- **Pontuação:**
  - Touchdown: **6**
  - Após TD, o atacante escolhe: **PAT** (1 ponto, chute quase automático, usa o especialista) ou **conversão de 2** (uma jogada normal a partir da linha de 3)
  - Field goal: **3**
  - Safety: **2** (a bola é derrubada na própria end zone)
- **Fim de posse:** TD, field goal (convertido ou errado), punt, turnover (interceptação/fumble), turnover on downs ou safety.
- **Fim de jogo:** quando os dois times esgotam suas posses.
- **Prorrogação (estilo universitário):** cada time tem uma posse a partir da linha de 25 do adversário. Repete até haver vencedor. A partir da 3ª prorrogação, cada posse é **apenas uma tentativa de 2 pontos**.

### 2.2 Especialista

Cada elenco designa **1 Pokémon como kicker/punter**. Ele **não ocupa vaga no 7v7**.
- O alcance e a precisão de FG/PAT dependem do **Sp. Atk**.
- A distância do punt depende de **Sp. Atk** e **Attack**.

### 2.3 Mão de cartas

- No início de cada drive, cada lado compra **5 cartas** do próprio deck (o atacante do deck de ataque, o defensor do deck de defesa).
- Após cada jogada, a carta usada vai para o descarte e o jogador compra 1. O deck é reembaralhado quando se esgota.
- **Cartas básicas** sempre disponíveis, fora da mão e do deck:
  - Ataque: *Corrida Básica*, *Passe Básico*
  - Defesa: *Defesa Base*
- **No 4º down**, o ataque tem também as opções sempre disponíveis **Punt** e **Field Goal**.

### 2.4 Loop de uma jogada (~22 s)

| Etapa | Quem | Tempo | Revelação |
|---|---|---|---|
| 1. **Formação** | Ataque | 5 s | Revelada: a defesa vê quem está em campo e em quais vagas |
| 2. **Pacote** | Defesa | 4 s | Revelado |
| 3. **Carta** | Ambos, às cegas | 8 s | As duas são reveladas juntas |
| 4. **Resolução + animação** | Servidor → clientes | ~5 s | Eventos animados |

- A **formação** determina quais cartas de ataque podem ser jogadas (os requisitos precisam ser cumpridos pelos Pokémon em campo). Revelar a formação dá à defesa informação para uma **leitura informada**.
- O **pacote** determina quais cartas de defesa podem ser jogadas, pelo mesmo critério.
- **Estimativa de duração:** ~60 jogadas × ~22 s ≈ **22 min**.

### 2.5 Padrões de timeout

Se um timer de etapa expirar, o servidor aplica o padrão:
- Formação → a última usada no drive (ou *Pistol* na primeira jogada)
- Pacote → *Base*
- Carta → a básica (no ataque, *Corrida Básica*; no 4º down, *Punt*)
- Escolha pós-TD → *PAT*

### 2.6 Máquina de estados

```
LOBBY → TEAM_SETUP → MATCH_START
  → DRIVE_START (compra de mão)
  → FORMATION → PACKAGE → PLAYCALL → RESOLVE → POST_PLAY
      POST_PLAY → FORMATION            (próximo down)
      POST_PLAY → CONVERSION → DRIVE_END (após TD)
      POST_PLAY → DRIVE_END            (FG, punt, turnover, safety, downs)
  → DRIVE_END → DRIVE_START | OVERTIME | MATCH_END
```

---

## 3. Cartas, Deck e Leitura

### 3.1 Anatomia de uma carta

```ts
interface Card {
  id: string;
  name: string;
  side: 'OFFENSE' | 'DEFENSE';
  category: OffenseCategory | DefenseCategory | 'PUNT' | 'FIELD_GOAL';
  origin: 'BASIC' | 'TYPE' | 'SIGNATURE' | 'SPECIAL';
  element: PokemonType | null;       // tipo elemental da carta (entra no confronto de tipos)
  requirements: Requirement[];
  baseYards?: number;                // sobrescreve as jardas base da categoria
}

interface Requirement {
  position: Position;                // ex.: 'RB', 'WR', 'OL'
  types?: PokemonType[];             // basta ter um deles
  species?: number[];                // espécies/linha evolutiva aceitas
  count?: number;                    // quantas vagas da posição precisam cumprir (padrão 1)
}
```

- **Atores derivados da categoria.** Quem disputa a jogada é definido pela categoria da carta (tabela de confrontos do motor, seção 4.2). Exemplo: toda Corrida por Dentro coloca RB e OL contra DL e LB. Entre os candidatos de uma posição, o motor prefere o Pokémon que cumpre o requisito da carta.
- **Perfil por categoria.** Jardas base, variância e riscos (sack, interceptação, fumble, incompleto, big play) são definidos por categoria. A carta pode sobrescrever apenas `baseYards`.

### 3.2 Categorias

- **Ataque (6):** Corrida por Dentro, Corrida por Fora, Passe Curto, Passe Longo, Screen, Play-Action
- **Defesa (5):** Contenção de Corrida, Blitz, Cobertura Homem a Homem, Zona Curta, Zona Profunda

### 3.3 Origens

1. **Básicas:** sem requisitos, sempre disponíveis (seção 2.3).
2. **De tipo (~60):** cerca de 2 de ataque e 2 de defesa para cada um dos 15 tipos.
   Exemplos: *Thunder Screen* (Screen; RB e WR Elétricos), *Rock Slide Wall* (Contenção; 3 DL Pedra/Terra), *Surf Route* (Passe Longo; QB e WR Água).
3. **Assinatura (~20):** ligadas a espécie ou linha evolutiva.
   Exemplos: *Muralha Snorlax* (Snorlax no OL), *Fly Route* (Pidgeot de WR).

> A lista completa de cartas é conteúdo, não arquitetura. O motor (Plano 1) nasce com um catálogo inicial de 35 cartas que cobre os 15 tipos e todas as categorias. O catálogo completo (~60 de tipo + ~20 assinatura) é escrito e calibrado com o simulador no Plano 2.

### 3.4 Deck

- **12 cartas de ataque + 12 de defesa**, no máximo **2 cópias** de cada carta.
- **Na montagem**, uma carta só entra no deck se o elenco consegue cumprir os requisitos dela.
- **Na partida**, uma carta só pode ser jogada se os Pokémon **em campo** (formação ou pacote atual) cumprem os requisitos. Cartas não jogáveis aparecem acinzentadas na mão.

### 3.5 Matriz de leitura

Resultado sob o ponto de vista da defesa. ✔ = leitura certa (vantagem defesa), ✖ = leitura errada (vantagem ataque), · = neutro.

|                 | C. Dentro | C. Fora | P. Curto | P. Longo | Screen | Play-Action |
|-----------------|:---------:|:-------:|:--------:|:--------:|:------:|:-----------:|
| Contenção       | ✔ | ✔ | · | ✖ | · | ✖ |
| Blitz           | ✔ | · | ✖ | ✔ | ✖ | · |
| Homem a Homem   | ✖ | ✖ | ✔ | · | ✔ | · |
| Zona Curta      | · | · | ✔ | ✖ | · | · |
| Zona Profunda   | ✖ | · | ✖ | ✔ | · | ✔ |

**Princípio de design:** cada linha e cada coluna tem **saldo zero** (número de ✔ = número de ✖), e nenhuma categoria é estritamente dominada. A Zona Curta é a opção "segura" da defesa: acerta 1 categoria, erra 1 e é neutra no resto. Os valores dos multiplicadores serão ajustados pelo simulador (seção 7.3), e um teste automatizado garante o saldo zero da matriz.

**Cartas básicas na matriz:** *Corrida Básica* conta como Corrida por Dentro, *Passe Básico* como Passe Curto e *Defesa Base* tem leitura sempre neutra.

### 3.6 Fadiga

- **Ganho:** cada vez que um Pokémon é **ator** em uma jogada, ganha **+1 de fadiga**. **QB e OL** ganham **+½**, porque participam de quase toda jogada.
- **Limiar:** **2**, ou **3** se HP base ≥ 100.
- **Recuperação:**
  - **1 nível por jogada fora de campo** (inclusive durante os drives do adversário, se ele não jogar nos dois lados).
  - **Entre drives, recupera 2 níveis.** A fadiga **não zera**. Assim, um Pokémon que joga no ataque e na defesa acumula desgaste, e o dilema entre estrelas e profundidade de elenco é preservado.
- **Substituição automática:** ao atingir o limiar, o titular é trocado pelo próximo reserva disponível no depth chart (seção 5.4).
- **Regra de retorno:** quem saiu por fadiga **só volta quando a fadiga chegar a 0**. Isso evita o vai-e-volta.
- **Penalidade:** **−10% nos stats por nível acima do limiar**. Ela só se aplica quando não há reserva disponível ou quando o jogador marca o titular como **"manter em campo"** no depth chart.
- **Parâmetros:** todos os números de fadiga (ganho, limiar, recuperação, penalidade) são parâmetros do motor, calibrados pelo simulador.

---

## 4. Tipos, Stats e Resolução

### 4.1 Dados da Gen 1 (verificado na PokéAPI em 2026-10-10)

- **Tipagem original:** `pokemon.past_types`. Uma entrada com `generation: generation-i` (ou posterior, ex.: `generation-v` para o Clefairy) indica os tipos válidos até aquela geração. Verificado: Magnemite = Elétrico puro, Clefairy = Normal.
- **Tabela de tipos:** `type.past_damage_relations` (entrada `generation-i`). Inclui o bug Fantasma → Psíquico = 0x.
  - **Decisão:** usar a tabela da Gen 1 **corrigindo o bug**: Fantasma causa **2x** em Psíquico.
- **15 tipos:** Normal, Fogo, Água, Planta, Elétrico, Gelo, Lutador, Venenoso, Terra, Voador, Psíquico, Inseto, Pedra, Fantasma, Dragão.
- **Sprites:** Gen 5 Black/White do repositório de sprites da PokéAPI (`sprites/pokemon/versions/generation-v/black-white/{id}.png` e `.../back/{id}.png`, PNG 96×96 com fundo transparente), baixados no setup. Decisão do usuário em 2026-10-11, substituindo os GBC do Yellow (o fundo branco deles aparecia como caixa). Dados e tipagens continuam Gen 1.
- **Stats:** a divisão moderna (Sp. Atk / Sp. Def) da PokéAPI. A Gen 1 tinha um único "Special", e essa diferença é aceita conscientemente.
- **Sem dependência em tempo de execução:** um script de build (`packages/data`) baixa os dados uma vez e gera JSON estático versionado (`pokemon.json`, `typechart.json`). Os sprites também são baixados no build e servidos pelo próprio client.

### 4.2 Mapeamento de stats

| Stat | Atributo | Usado em |
|---|---|---|
| HP | Fôlego | Limiar de fadiga (≥ 100 → limiar 3) |
| Attack | Força | Bloqueio de corrida, tackle, quebrar tackle, pass rush |
| Defense | Ancoragem | Proteção de passe, segurar a linha |
| Sp. Atk | Braço / Precisão | Passe do QB, chutes do especialista |
| Sp. Def | Leitura | Cobertura em zona, resistência a play-action |
| Speed | Velocidade | Rotas, cobertura homem a homem, corrida por fora, jardas após recepção |

Cada **categoria** define quais atributos dos atores se enfrentam. Exemplos:
- **Corrida por Dentro:** RB (Força + Velocidade) + OL (Força) vs DL (Ancoragem) + LB (Força)
- **Corrida por Fora:** RB (Velocidade) + WR (Força) vs CB (Velocidade) + LB (Velocidade)
- **Passe Longo:** primeiro a fase de proteção, OL (Ancoragem) vs DL (Força), que decide sack/pressão. Depois QB (Braço) + WR (Velocidade) vs CB (Velocidade) + S (Leitura)

A tabela completa categoria → atributos fica no plano de implementação, como dado do motor.

### 4.3 Pipeline de resolução

Ordem e peso-alvo na variação total do resultado (a calibrar no simulador):

1. **Leitura (~50%)**: define a faixa de resultado
   - Leitura errada da defesa (✖): jardas × **1,6**
   - Neutra (·): jardas × **1,0**
   - Leitura certa (✔): jardas × **0,4** e **riscos (sack/turnover) × 2**
2. **Tipo (~20%)**
   - O tipo da **carta de ataque** é comparado com os tipos dos **atores da defesa**, e o da **carta de defesa** com os **atores do ataque**.
   - Escala **monotônica** (corrige o v1, em que a imunidade superava o 4x):

     | Efetividade | Modificador |
     |---|---|
     | 4x | +60% |
     | 2x | +30% |
     | 1x | 0 |
     | ½x | −30% |
     | ¼x | −45% |
     | 0x | −60% |

   - **Afinidade:** cada ator do mesmo tipo da carta ganha **+10%** (inspirado no STAB).
   - Cartas sem tipo (`element: null`, como as básicas) não geram modificador de tipo.
3. **Stats (~20%)**: a razão entre o placar de atributos do ataque e o da defesa (já com fadiga) posiciona o resultado dentro da faixa.
4. **Variância (~10%)**: ±15%, com RNG semeado.

**Saídas:** jardas ganhas/perdidas, sack, passe incompleto, interceptação, fumble, big play, touchdown. Os riscos vêm do perfil da categoria da carta (seção 3.1), multiplicados pelo resultado da leitura e moderados pelo confronto de stats.

---

## 5. Montagem do Time (General Manager)

### 5.1 Elenco

- **16 Pokémon de linha + 1 especialista** (kicker/punter).
- Cada espécie aparece **no máximo uma vez por time**. Os dois times podem repetir espécies entre si.
- **No máximo 1 lendário** por time: Articuno, Zapdos, Moltres, Mewtwo, Mew.
- Qualquer estágio evolutivo é permitido.

### 5.2 Teto salarial

- **Custo** = `max(1, round((BST − 180) / 30))`, onde BST é a soma dos stats base.
  Exemplos: Magikarp = 1, Pikachu = 5, Snorlax = 12, Dragonite = 14, Mewtwo = 17.
- **Teto: 120 pontos** para os 17 Pokémon (o especialista conta).

### 5.3 Posições e aptidão

- **Sem restrição rígida:** qualquer Pokémon joga em qualquer posição.
- **Nota de aptidão de 1 a 5 estrelas** por posição, calculada pelos pesos de atributos da posição (seção 4.2). A nota serve como guia na interface e não interfere na regra.
- O mesmo Pokémon pode jogar no ataque e na defesa. O custo é a fadiga: como ela só recupera 2 níveis entre drives, jogar nos dois lados acumula desgaste (seção 3.6).

### 5.4 Formações, pacotes e depth chart

**Formações de ataque** (QB + 3 OL fixos, 3 vagas variáveis):

| Formação | Vagas variáveis |
|---|---|
| Pistol | RB, WR, WR |
| Pesada | RB, TE, WR |
| Spread | WR, WR, WR |
| Dupla | RB, FB, WR |

**Pacotes de defesa:**

| Pacote | Composição |
|---|---|
| Base | 3 DL, 1 LB, 2 CB, 1 S |
| Pesado | 3 DL, 2 LB, 1 CB, 1 S |
| Nickel | 2 DL, 1 LB, 3 CB, 1 S |
| Dime | 2 DL, 3 CB, 2 S |

**Depth chart:** para cada **vaga** (QB, OL1–3, RB, WR1–3, TE, FB, DL1–3, LB1–2, CB1–3, S1–2), uma ordem de titular e reservas. A mesma ordem vale em todas as formações/pacotes que usam aquela vaga.
- **Substituição automática** quando o titular atinge o limiar de fadiga; ele só retorna com fadiga 0.
- Opção **"manter em campo"** por Pokémon: ignora a substituição automática e aceita a penalidade de stats.
- **Ajuste manual entre drives:** o jogador pode editar o depth chart e o "manter em campo" no início de cada drive em que vai entrar em campo. O servidor revalida o time (subprojeto do servidor, Plano 3).

### 5.5 Validação e persistência

- O time é **válido** se: tem 16 + 1 Pokémon, respeita o teto, cumpre a regra de espécie única e lendário, tem depth chart completo e tem um deck de 12 + 12 com todas as cartas elegíveis.
- **Sem contas nesta versão:**
  - O time fica salvo no **localStorage**.
  - **Exportar/importar** como código de texto (JSON compactado em base64url), para compartilhar com amigos ou trocar de máquina.
- **6 times sugeridos** prontos e válidos, incluídos no client.
- O servidor **revalida** o time recebido. O client nunca é confiável.

---

## 6. Interface

### 6.1 Telas

Estilo: fonte bitmap, paleta inspirada no Game Boy Color, componentes React com visual pixel art.

1. **Início:** criar sala (gera um código de 6 letras) ou entrar com um código.
2. **Montar time:**
   - Pokédex dos 151 com filtros (tipo, custo, aptidão)
   - Barra do teto salarial
   - Editor de depth chart por vaga
   - Editor de deck mostrando as cartas liberadas pelo elenco
   - Exportar/importar código
   - Escolher um time sugerido
3. **Lobby:** cada jogador escolhe o time e marca "pronto". O servidor valida os dois times e começa a partida.
4. **Partida:** campo em Phaser, HUD e painéis em React.
5. **Fim de jogo:** placar, estatísticas por Pokémon e replay (reprodução a partir de seed + ações).

### 6.2 Tela de partida

```
+-----------------------------------------------------------------------+
| HUD: Placar | Posse 3/6 | 2nd & 6 | Bola na OWN 44 | Timer da etapa   |
+-----------------------------------------------------------------------+
|                                                      | LOG            |
|                CAMPO (Phaser, vertical)              | "Jolteon usou  |
|                                                      |  Corrida por   |
|        [CB]        [DL][DL][DL]        [CB]          |  Fora!"        |
|                    [LB]    [S]                       | "É super       |
|   ================ Linha de Scrimmage =============  |  efetivo!"     |
|        [WR]        [OL][OL][OL]        [WR]          |                |
|                        [QB]                          |                |
|                        [RB]                          |                |
+-----------------------------------------------------------------------+
| PAINEL (muda conforme a etapa):                                       |
|  FORMAÇÃO/PACOTE → 4 botões com a lista de quem entra em campo        |
|  CARTA → mão de 5 + básicas; acinzentadas se não jogáveis; tooltip    |
+-----------------------------------------------------------------------+
```

- **Sprites:** Gen 5 Black/White da PokéAPI, baixados no setup (decisão do usuário em 2026-10-11): ataque com o sprite de costas (`back`), defesa com o de frente (`front`).
- **Indicador de fadiga** sobre cada sprite.
- **Animação dirigida pelos eventos do motor:** snap → bloqueio → confronto (com efeito de tipo) → tackle/recepção/TD.
- **Revelação das cartas** com destaque visual do resultado da leitura (✔/·/✖).
- **Plataforma:** desktop primeiro. No celular a tela precisa caber, sem polimento nesta versão.

---

## 7. Arquitetura Técnica

### 7.1 Monorepo (npm workspaces)

```
pfl/
  package.json            (workspaces)
  packages/
    data/                 script de build: PokéAPI → pokemon.json, typechart.json, sprites
    engine/               TypeScript puro, zero dependências de runtime
      rng                 PRNG semeado (ex.: mulberry32)
      types               tabela de tipos + escala de modificadores
      cards               catálogo + elegibilidade (montagem e em campo)
      team                custo, validação, depth chart, aptidão
      resolve             pipeline de resolução (seção 4.3)
      match               máquina de estados: step(state, action) → { state, events }
    sim/                  CLI: N partidas bot × bot → relatório de balanceamento
  apps/
    server/               Node + Socket.io: salas em memória, timers, autoridade
    client/               Vite + React + Phaser
  docs/
```

**Princípios:**
- **O engine é uma função pura e determinística.** O mesmo `seed + log de ações` produz sempre o mesmo resultado. Isso viabiliza replay, testes golden, reprodução de bugs e simulação em massa.
- **O servidor é a autoridade:** guarda o estado, controla timers, valida ações e aplica os padrões de timeout.
- **O client só envia intenções** e anima os `events` recebidos. Não calcula resultados.
- **Ocultação de informação:** o servidor projeta uma `view` por jogador, com a própria mão completa e apenas a contagem de cartas do adversário.

### 7.2 Protocolo Socket.io

Toda ação de jogo carrega `turnId`.

**Cliente → Servidor**

| Evento | Payload |
|---|---|
| `room:create` | — |
| `room:join` | `{ code }` |
| `team:submit` | `{ teamCode }` |
| `room:ready` | — |
| `play:formation` | `{ turnId, formationId }` |
| `play:package` | `{ turnId, packageId }` |
| `play:card` | `{ turnId, cardId }` |
| `play:conversion` | `{ turnId, choice: 'PAT' \| 'TWO' }` |
| `match:resync` | — |

**Servidor → Cliente**

| Evento | Payload |
|---|---|
| `room:state` | jogadores, status de pronto, erros de validação de time |
| `match:phase` | `{ turnId, phase, deadline, view }` |
| `match:reveal` | `{ turnId, formation? , package?, cards? }` |
| `match:result` | `{ turnId, events[], view }` |
| `match:end` | `{ score, stats, replay: { seed, actions } }` |
| `error` | `{ code, message }` |

Exemplo de `events[]` (consumidos pela animação e pelo log):

```json
[
  { "t": "SNAP" },
  { "t": "HANDOFF", "from": "QB", "to": "RB" },
  { "t": "READ", "result": "WRONG" },
  { "t": "CLASH", "off": "RB", "def": "LB", "effectiveness": 2, "winner": "OFF" },
  { "t": "TACKLE", "by": "S", "atYard": 52, "gain": 8 },
  { "t": "FIRST_DOWN" }
]
```

### 7.3 Simulador de balanceamento (`packages/sim`)

- Um **bot simples** (heurística por down & distance, com aleatoriedade ponderada) joga N partidas bot × bot com times sugeridos e times aleatórios válidos.
- **Relatório:**
  - win rate por carta e por categoria
  - média e distribuição de jardas por resultado de leitura
  - taxa de acerto de leitura
  - pontos por posse
  - duração em jogadas
  - impacto observado de tipo e de stats
- **Portão de balanceamento:** nenhuma carta com win rate (das partidas em que só um dos lados a jogou) fora de **45%–55%** com significância: reprova quando o intervalo de confiança de 95% (Wilson) fica inteiro fora da faixa; fora só no ponto é aviso (decisão do usuário, 2026-10-11). Exceto as **exceções documentadas** (hoje: nenhuma; `psychic_foresight` saiu da lista em 2026-10-11 depois do rebalanceamento dos times sugeridos).
- **Pesos da seção 4.3 são informativos:** o relatório mede a participação de leitura/tipo/stats/variância, mas o portão não depende dela. Medição de 2026-10-10 com a escala antiga de tipos: leitura ~79%, tipo ~6%, stats ~13%, variância ~2%. Por isso a escala de tipos foi dobrada (decisão do usuário em 2026-10-10).

---

## 8. Tratamento de Erros

| Situação | Comportamento |
|---|---|
| Ação inválida (etapa errada, carta não jogável, `turnId` antigo) | Servidor rejeita com `error { code }`; o client faz `match:resync` |
| Desconexão de um jogador | 60 s de tolerância; o servidor aplica os padrões de timeout; ao reconectar, recebe a `view` atual |
| Desconexão dos dois jogadores | A sala pausa por 5 min e depois é encerrada |
| Reinício do servidor | As salas em memória são perdidas (aceitável nesta versão) |
| Time inválido no lobby | Rejeitado com a lista de motivos em `room:state` |
| Código de sala inexistente ou sala cheia | `error { code: 'ROOM_NOT_FOUND' \| 'ROOM_FULL' }` |

---

## 9. Testes

- **Engine (Vitest):**
  - Tabela de tipos: casos pontuais, incluindo Fantasma → Psíquico = 2x, Normal → Fantasma = 0x e tipagens Gen 1 (Magnemite, Clefairy).
  - Escala de modificadores: monotônica e limitada.
  - Propriedades da resolução: para as mesmas cartas e atores, a média de jardas com leitura ✔ é menor que com · , que é menor que com ✖.
  - Transições de campo: downs, first down, TD, conversões, FG, punt, safety, turnover, turnover on downs, fim de posses, prorrogação (incluindo a regra da 3ª OT).
  - Validação de time: teto, espécie única, lendário, especialista, deck elegível.
  - Elegibilidade de cartas por formação/pacote.
  - Matriz de leitura: saldo zero em cada linha e coluna.
  - Fadiga: ganho reduzido de QB/OL, recuperação entre drives, regra de retorno, "manter em campo".
  - Posição de campo: início após punt, turnover, turnover on downs, FG errado e pontuação.
- **Replays golden:** seed + ações fixas produzem estado final e eventos idênticos (protege o determinismo).
- **Simulador:** roda no CI como portão de balanceamento (seção 7.3), com N reduzido para velocidade.
- **Server:** teste de integração com 2 clientes Socket.io jogando uma partida completa, incluindo timeout e reconexão.
- **Client:** playtest manual nesta versão.

---

## 10. Fora do Escopo (Núcleo)

- Contas de usuário e persistência no servidor
- Draft snake ao vivo
- Treino, evolução e progressão de stats
- Modo 11v11 e relógio de jogo com quartos
- Kickoff/retorno jogável
- Momentum (reservado como ferramenta de balanceamento)
- Modo contra bot (o bot existe no simulador, então entra barato num subprojeto futuro)
- Polimento para celular

---

## 11. Mudanças em Relação ao v1

| v1 ("PokéGridiron") | v2 (PFL) |
|---|---|
| 11v11 | 7v7 (formação como dado; 11v11 é um modo futuro) |
| Só o ataque escolhe a jogada | Formação e pacote revelados + cartas às cegas e simultâneas dos dois lados |
| Resolução com 3–4 Pokémon; o resto do elenco irrelevante | Cartas exigem Pokémon em campo; fadiga força rotação; o elenco define o deck |
| Stat + d20 (sorte alta) | Leitura > tipo > stats > variância pequena |
| Imunidade +60% (maior que 4x) | Escala monotônica; imunidade é o melhor resultado defensivo |
| Tipos e tabela modernos implícitos | Tipagem e tabela da Gen 1 (bug Fantasma/Psíquico corrigido) |
| Partida aberta | 6 posses por time + prorrogação universitária; posição de campo carrega entre posses |
| Sem regras de montagem | Teto salarial por BST, 1 lendário, especialista |
