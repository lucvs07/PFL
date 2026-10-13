# PFL — Diagnóstico e próximas issues

> **Data:** 2026-10-12. **Base:** spec [2026-10-10-pfl-core-design.md](2026-10-10-pfl-core-design.md) e o estado do repositório após o PR #8.
> **Decisão do usuário:** por enquanto, o foco é **D — Experiência** e o **Draft snake ao vivo** entre dois jogadores na mesma sala. **Contas e progressão ficam de fora.**
> Cada item abaixo está escrito como issue (título, contexto, critérios de aceite) para ser copiado ao GitHub.

---

## 1. Estado atual

**Entregue:** engine completo (posses, pontuação, prorrogação, fadiga, depth chart, replay, 80 cartas: 30+30 de tipo e 10+10 de assinatura), simulador com portão de balanceamento (Wilson), servidor Socket.io (salas, timers, timeout padrão, pausa e tolerância de reconexão, `view` por jogador, limite de salas), cliente React + Phaser (início, montagem do time, lobby, partida, fim de jogo com replay), CI, Docker e deploy (Render + Pages). `npm test` (572 testes) e `npm run typecheck` passam. PR #8 aberto (identidade visual, lobby com o time do adversário, layout da partida).

**Lacunas e riscos observados**
1. Playtest P2–P20 do Plano 4 nunca fechado; o PR #8 não testou o lado da defesa, o `test:gate` nem o build de produção.
2. A spec está desatualizada: o lobby agora mostra o time do adversário (contradiz parte da ocultação de informação) e `RoomPlayer` ganhou `roster`, `lead` e `cost`.
3. Balanceamento só anotado: contribuição 74/12/12/2 contra o alvo 50/20/20/10 e temas dos times sugeridos derivados.
4. Servidor sem rate limit e sem expiração de sala ociosa.
5. Sem teste de ponta a ponta com navegador e dois jogadores.
6. Cliente sem som, animação básica, celular pouco verificado.
7. Dívidas: `computeStats` da conversão de 2 pontos, `DRIVE_START` do primeiro drive não enviado, partidas perdidas no restart do Render.

---

## 2. Em foco agora

### Épico D — Experiência

#### D1. Som e música em 8 bits
**Contexto:** não há áudio. Efeitos reforçam a revelação das cartas, o resultado da leitura (✔/·/✖), tackle, TD e fim de jogo.
**Critérios de aceite**
- Efeitos para: revelação de carta, leitura certa/neutra/errada, super efetivo, tackle, first down, TD, FG, turnover, fim de jogo.
- Música de fundo no menu/lobby e na partida, com volume e mudo persistidos em localStorage.
- Áudio só inicia após interação do usuário (política dos navegadores); sem áudio o jogo continua funcionando.
- Assets com licença compatível, registrada no repositório.

#### D2. Animações mais ricas dirigidas pelos eventos do motor
**Contexto:** a animação atual cobre snap, handoff e passe com tweens simples (FieldScene).
**Critérios de aceite**
- Animação distinta por categoria de carta (corrida por dentro/fora, passes, screen, play-action, blitz).
- Efeito visual de efetividade de tipo no CLASH (4x/2x/½x/0x).
- Destaque da revelação das cartas e do resultado da leitura.
- Respeita `prefers-reduced-motion` e não bloqueia a próxima fase.

#### D3. Polimento para celular
**Contexto:** a spec deixou o celular como "precisa caber". O PR #8 já empilha o layout abaixo de 1040 px.
**Critérios de aceite**
- Fluxo completo (início, montagem, lobby, partida, fim) utilizável em 390×800 e em paisagem.
- Alvos de toque ≥ 44 px; sem rolagem horizontal; tooltips de carta acessíveis por toque.
- Verificado em ao menos um navegador móvel real ou emulado.

#### D4. Replay compartilhável e histórico de partidas
**Contexto:** `match:end` já entrega `{ seed, actions }`.
**Critérios de aceite**
- Link/código de replay que abre o visualizador sem sala.
- Histórico local (localStorage) das últimas partidas com placar e adversário.

#### D5. Acessibilidade e feedback de interface
**Critérios de aceite:** navegação por teclado nas escolhas de formação/pacote/carta, contraste mínimo AA, estados de conexão visíveis (reconectando, pausado, servidor acordando no Render).

### Issue única: Refatoração da Room + modo Draft snake ao vivo

> **Decisão do usuário:** a refatoração da `Room` e o modo Draft entram na **mesma issue**, em etapas internas. A etapa 1 só avança com os testes existentes verdes e sem alterá-los.

**Objetivo:** além do time pré-montado, os dois jogadores de uma sala podem **montar o elenco alternadamente, ao vivo**. Sem contas: o resultado vale para a partida da sala e pode ser exportado como código de time.

#### Decisões fechadas (DR1)
| Tema | Decisão |
|---|---|
| Pool | **Exclusivo:** cada espécie só pode ir para um dos times |
| Ordem | Snake A,B,B,A,A,B,B,A… com 34 picks (17 por time); quem começa é sorteado |
| Teto de 120 pontos | **Reserva conjunta:** um pick só é aceito se, depois dele, o time ainda completa o elenco com as espécies mais baratas do pool **e** os dois times conseguem completar juntos (só 13 espécies custam até 3 pontos; checar cada time sozinho travava 10 de 30 drafts simulados) |
| Regras mantidas | 16 de linha + 1 especialista, no máximo 1 lendário, só os 151 da Gen 1 |
| Tempo por pick | **30 s**, com pick automático no timeout (maior BST disponível que respeite a reserva; empate pelo menor id) |
| Após o draft | Fase BUILD de **3 min** na tela de montagem, com elenco travado e depth chart, deck e especialista editáveis; o servidor gera uma sugestão inicial para cada jogador |
| Informação | Pool e picks dos dois lados são públicos |
| Modo | Escolhido pelo anfitrião no lobby (Pré-montado | Draft) e fixado quando o primeiro jogador marca "pronto" |

#### Etapa 1 — Refatoração da `Room` (sem mudar comportamento)
Hoje a `Room` (`apps/server/src/room.ts`, 353 linhas) mistura presença, lobby, ciclo da partida e ciclo de vida, com `if (roomStatus === ...)` espalhados.
- **`SeatRegistry`** (`seats.ts`): vagas, tokens, conexão, tolerância de reconexão e pausa/retomada das tolerâncias. Não conhece partida nem draft; expõe `absent(key)`.
- **`RoomPhase`** (interface): `start`, `handle`, `sendCurrent`, `pause`, `resume`, `refreshAbsence`, `dispose`. A `MatchSession` passa a implementá-la; a `DraftSession` entra do mesmo jeito.
- **`LobbyPhase`**: recebe e valida o time, controla o "pronto" e decide quando começar. Leva junto `normalizeTeam`.
- **`Room`**: guarda a fase atual e delega; as transições ficam numa tabela só: `LOBBY → [DRAFT → BUILD] → MATCH → FINISHED`.
- **Critério:** `room.test.ts`, `match-session.test.ts` e o teste de integração passam **sem nenhuma alteração**.

#### Etapa 2 — Engine e protocolo
- `packages/engine/src/draft.ts`: função pura e determinística. Estado: pool, picks e orçamento por time, ordem snake, índice da vez. Ações: `PICK { team, species }` e `AUTO_PICK { team }`. Validação: espécie no pool, vez, lendário, reserva conjunta de orçamento (erros via `EngineError`). Ao completar 34 picks devolve os dois elencos de 17 espécies.
- `@pfl/protocol`: `room:mode { mode }`, `draft:pick { turnId, species }`, `draft:state { turnId, order, turn, deadline, pool, picks, spent, blocked, last }`, `build:start { deadline, roster, suggested }` (início da montagem, com os 17 de cada jogador e a sugestão do servidor). `room:state` ganha `mode`; `RoomStatus` ganha `DRAFTING` e `BUILDING`.
- Reconexão e `match:resync` devolvem o `draft:state` atual.

#### Etapa 3 — Servidor
- `DraftSession` (implementa `RoomPhase`) sobre o módulo puro: timer, pick automático, pausa e reconexão (tolerância de 60 s, como na partida).
- Fase BUILD: o servidor **rejeita** qualquer time cujo elenco não seja exatamente os 17 escolhidos pelo jogador; `validateTeam` continua valendo. Sugestão inicial de depth e deck por jogador; no fim do prazo vale o que estiver salvo.
- `room:mode` só do anfitrião, só no lobby e antes de alguém marcar "pronto".

#### Etapa 4 — Cliente (ver direção de interface abaixo)
Tela de draft, fase BUILD com elenco travado, seletor de modo no lobby, estados de pausa e reconexão.

#### Etapa 5 — Bot e balanceamento (DR5)
O bot do simulador faz drafts para medir equilíbrio por ordem de pick e diferença de força entre os elencos.

#### Testes
- **Engine:** ordem snake, pool exclusivo, lendário, reserva de orçamento, pick automático determinístico, impossibilidade de completar o time, draft completo por seed.
- **Servidor:** integração com 2 clientes: draft completo, pick fora da vez, espécie repetida, timeout com pick automático, reconexão no meio, BUILD rejeitando elenco diferente do draftado.
- **Cliente:** testes de componente da tela de draft (vez, orçamento, pool) e do lobby com seletor.

#### Direção de interface do Draft
**Como foi guiada:** pelas skills `impeccable`, `frontend-design` e `design-taste-frontend`. A `impeccable` não encontrou `PRODUCT.md` nem `DESIGN.md`, mas há um sistema visual vivo em `apps/client/src/styles/tokens.css`; por ser extensão de uma tela, ele é a autoridade. A `design-taste-frontend` é voltada a landing pages: aplicam-se só as regras transversais (estados completos, contraste AA, `prefers-reduced-motion`, alvos de toque, sem cópia genérica).

**Modo:** *Operate* — o jogador completa uma tarefa sob pressão de tempo. Leitura rápida e consistência vencem expressão; a marca aparece nos detalhes.

**Sistema herdado (não reinventar):** paleta Game Boy Color, Press Start 2P em títulos/números/botões e Pixelify Sans no corpo (mín. 14 px), borda de 4 px com sombra rígida, lados `--side-offense` (vermelho) e `--side-defense` (azul), cores de tipo, componentes `Sprite`, `TypeBadge`, `Stars`, `StatBars`, `CapBar`, `Pokedex`.

**Estrutura da tela (desktop)**
```
+-----------------------------------------------------------------------+
| Sua vez · Pick 5 de 34        [██████░░░░] 18 s     Livre 41 (reserva 11)|
+----------------------------------------+------------------------------+
| POKÉDEX (filtros: tipo, custo, aptidão)| SEU ELENCO     ADVERSÁRIO    |
|  [grade dos disponíveis]               |  1 Snorlax      1 Pidgeot    |
|                                        |  2 ...          2 ...        |
|  detalhe da espécie + [Escolher]       |  vagas restantes: 13 | 13    |
+----------------------------------------+------------------------------+
```
- Abaixo de ~1040 px os blocos empilham; no celular (390 px) viram abas **Pool | Meu time | Adversário**, com a barra de vez/tempo/orçamento fixa no topo.
- A **vez** é dita em texto ("Sua vez", "Vez do adversário"), com a cor do lado como reforço, nunca como única pista.
- O **tempo** é uma barra, não só número; nos últimos 5 s ela muda de padrão (listras) além de cor.
- O **orçamento** mostra o valor livre real e a reserva exigida, para o jogador entender por que uma espécie cara está bloqueada.

**Estados da espécie na grade:** disponível; escolhida por mim; escolhida pelo adversário; inviável pelo orçamento ou lendário já usado. Cada estado tem **rótulo e marcação de forma** (risco, ícone), não só cor. Espécies bloqueadas continuam selecionáveis para leitura do detalhe, com o motivo escrito no botão desabilitado ("Passa do orçamento", "Já tem um lendário").

**Escolha em 2 passos:** clicar seleciona e abre o detalhe; o botão **Escolher** confirma. Evita pick por clique errado com o relógio correndo. Na vez do adversário a grade segue navegável, sem botão.

**Movimento:** o único momento orquestrado é o pick (sprite voa para a vaga do elenco, ~400 ms). Com `prefers-reduced-motion`, a troca é instantânea. Pick automático ganha o rótulo "Escolhido automaticamente". Se o áudio (D1) existir, um som curto marca o pick e a vez.

**Estados obrigatórios:** aguardando adversário entrar; vez do adversário; partida pausada por desconexão (com a contagem da tolerância); pick recusado (mensagem em linguagem simples e a grade volta ao estado válido); filtro sem resultado; transição para BUILD.

**Texto:** português, frase com inicial maiúscula, verbos diretos ("Escolher", não "Enviar"); o mesmo nome para a mesma ação em todo o fluxo; erros dizem o que aconteceu e como resolver, sem pedir desculpa.

**Acessibilidade:** grade navegável por teclado (setas, Enter para selecionar, atalho para escolher); `aria-live` educado anuncia mudança de vez e cada pick; foco visível; contraste AA; alvos de toque ≥ 44 px; sem rolagem horizontal em 390 px.

**Processo de design antes de codar a etapa 4:** (1) `/impeccable init` para registrar `PRODUCT.md`; (2) `/impeccable document` para gerar `DESIGN.md` a partir do sistema atual; (3) `/impeccable shape` para o plano da tela; (4) implementação; (5) uma rodada de `critique` e do detector, em desktop e mobile, e então parar.

---

## 3. Pré-requisitos e higiene (recomendados antes ou junto do foco)

| Id | Título | Resumo |
|---|---|---|
| H1 | Fechar playtest P2–P20 | Duas abas, ataque e defesa, relatório dos bugs encontrados |
| H2 | Atualizar a spec com o PR #8 | Lobby mostra o time do adversário; `RoomPlayer.roster/lead/cost`; seções 6 e 7.2 |
| H3 | Mergear o PR #8 | Rodar `npm run test:gate` e o build de produção/Docker, que o PR não rodou |
| H4 | Teste E2E com Playwright | Uma partida completa com dois jogadores; também protege o Draft |
| H5 | Rate limit e expiração de salas ociosas | Por conexão/IP; sala ociosa fecha. Necessário antes de abrir o jogo a mais amigos |

## 4. Backlog (fora do foco atual)

- **Revisar balanceamento com a interface:** contribuição 74/12/12/2 e temas dos times sugeridos (usar `packages/sim/scripts/rebalance-teams.ts`).
- **`computeStats` da conversão de 2 pontos** e **`DRIVE_START` do primeiro drive** nos clientes.
- **Observabilidade mínima:** logs estruturados e métricas de salas/partidas.
- **Modo contra bot:** o bot já existe em `packages/sim`.
- **Modo 11v11 e relógio com quartos**, **Momentum**.

## 5. Fora do escopo por decisão do usuário

- Contas de usuário e persistência de times no servidor.
- Progressão: treino, evolução, desenvolvimento de stats, temporadas e ligas.

## 6. Ordem sugerida

1. H1–H3 (fechar o que está aberto).
2. Issue única do Draft: etapa 1 (refatoração da Room) → 2 (engine e protocolo) → 3 (servidor) → 4 (cliente) → 5 (bot).
3. D1, D2 e D3 em paralelo ao Draft, por serem independentes; D4 e D5 depois.
4. H4 antes da etapa 4 do Draft terminar, para travar o fluxo; H5 antes de divulgar o link.
