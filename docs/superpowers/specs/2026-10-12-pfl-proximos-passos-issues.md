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

### Épico Draft snake ao vivo

> **Objetivo:** como hoje os dois jogadores entram em uma sala por código e escolhem um time pré-montado, um **modo alternativo** em que os dois montam o elenco **alternadamente, ao vivo**, na própria sala. Sem contas: o resultado do draft vale para a partida da sala (pode ser exportado como código de time para o localStorage).

#### DR1. Spec do Draft (decisões a fechar antes de implementar)
Perguntas em aberto que devem ser respondidas na brainstorming/spec do Draft:
1. **Pool:** espécies **exclusivas** (cada Pokémon só pode ser escolhido por um dos dois, o que dá sentido ao draft) ou repetidas entre os times, como na regra atual de montagem?
2. **Ordem snake:** A,B,B,A,A,B,B,A… para 17 picks cada (16 de linha + 1 especialista), 34 picks no total. Quem começa: sorteio ou o anfitrião?
3. **Teto salarial (120 pontos):** continua valendo durante o draft? O que acontece se um jogador não consegue mais completar 17 Pokémon dentro do teto (regra de pick mínimo/ reserva de custo)?
4. **Lendário:** máximo de 1 por time continua valendo.
5. **Tempo por pick** (ex.: 20–30 s) e o **pick automático** no timeout (melhor custo-benefício disponível?).
6. **Depois do draft:** depth chart e deck são montados pelos jogadores na tela de montagem existente, com tempo limite? Ou há atribuição automática de padrão?
7. **Informação:** o pool e os picks de ambos são públicos (em um draft, sim).

#### DR2. Motor do draft no `engine`/`protocol`
**Critérios de aceite**
- Função pura determinística: estado do draft, ordem snake, validação de pick (pool, teto, lendário, vagas restantes), pick automático.
- Tipos e mensagens no `@pfl/protocol`: `draft:start`, `draft:pick`, `draft:state` (pool restante, picks, de quem é a vez, `deadline`).
- Testes: ordem snake, teto, lendário, impossibilidade de completar 17, timeout, determinismo por seed.

#### DR3. Servidor: fase DRAFT na sala
**Critérios de aceite**
- Novo status de sala antes de `TEAM_SETUP`, com opção de modo (Pré-montado | Draft) escolhida pelo anfitrião no lobby.
- Autoridade do servidor: valida cada pick, aplica timer e pick automático, rejeita pick fora da vez com `error`.
- Desconexão: reutiliza a tolerância de 60 s e a pausa; ao reconectar, o jogador recebe o estado atual do draft.
- Teste de integração com 2 clientes completando um draft, incluindo timeout e reconexão.

#### DR4. Cliente: tela de Draft
**Critérios de aceite**
- Pokédex com filtros (tipo, custo, aptidão) reaproveitando os componentes da montagem, mostrando disponíveis/escolhidos; vez, tempo e teto restante visíveis.
- Os dois elencos se formam ao vivo; confirmação de pick; pick automático sinalizado.
- Ao fim, segue para depth chart e deck e depois para o "pronto" do lobby.
- Elenco do draft exportável como código de time.

#### DR5. Balanceamento e bot do draft
**Critérios de aceite:** bot do simulador faz drafts para avaliar se o modo é equilibrado (win rate por ordem de pick, diferença de força entre os dois elencos).

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
2. DR1 (decidir as regras do Draft) → DR2 → DR3 → DR4 → DR5.
3. D1, D2 e D3 em paralelo ao Draft, por serem independentes; D4 e D5 depois.
4. H4 antes do DR3/DR4 terminar, para travar o fluxo; H5 antes de divulgar o link.
