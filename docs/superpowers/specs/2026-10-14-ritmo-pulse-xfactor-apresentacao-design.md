# Battle Rhythm, Stadium Pulse e Ace X-Factors: apresentação (issue #16, parte 2)

> **Data:** 2026-10-14. **Issue:** [#16](https://github.com/lucvs07/PFL/issues/16). **Depende da Parte 1:** [regras](2026-10-14-ritmo-pulse-xfactor-regras-design.md) (engine, protocolo e servidor).
> **Escopo:** só cliente (`apps/client`), mais duas adições pequenas ao motor de áudio. Nenhuma mudança em engine, protocolo ou servidor.
> **Entrega:** um PR, aberto depois do PR da Parte 1 (ou empilhado nele).

## 1. Objetivo

Tornar legível e dramático o que a Parte 1 criou: quem domina o ritmo, quando um capitão entra na zona, quando a pressão do estádio aperta e como chamar um timeout. O jogador precisa entender o estado do jogo de relance e sentir o momento em que um capitão entra na zona.

**A coisa memorável é uma só: a entrada na zona.** Faixa de anúncio, aura sob o capitão e som metálico ascendente. Todo o resto (medidor, fichas, tremor, névoa) é silencioso, funcional e curto.

## 2. Contexto de design

- **Modo (Impeccable): Operate** na partida e no builder. É interface de decisão repetida dezenas de vezes por partida, então vale escaneabilidade e consistência; a marca vive nos detalhes (pixel, `steps()`, caixas com borda grossa).
- **Autoridade visual: o código existente.** O projeto não tem `PRODUCT.md` nem `DESIGN.md`; o Impeccable manda criar o `PRODUCT.md` com o usuário antes de superfície nova. Esta parte é **extensão** do sistema GBC (Press Start 2P, Pixelify Sans, paleta `--gbc-*`, borda de 4 px, sombra dura, `steps()`), então segue pelo código. Pendência registrada: rodar `/impeccable init` depois.
- **Taste-skill:** é feita para landing e portfólio; aqui só valem as regras que não dependem do gênero: calibrar contraste, estados completos (vazio, desabilitado, erro), sem texto copiado por IA, sem decoração sem função, zero travessão nos textos da interface, 44 px de alvo de toque. Os dials de referência: variância baixa (HUD funcional), movimento 3 de 10, densidade 6.
- **Frontend-design:** a disciplina de "gastar a ousadia num lugar só" produz a regra acima (a zona é o único espetáculo).
- **Animação:** triagem pela skill local `find-animation-opportunities` (seção 5). **GSAP não entra**, pelo mesmo motivo do spec de animações dinâmicas: o campo é Phaser, a interface é CSS, e o ganho não paga o peso. Valem os princípios da skill `animation-performance` (só `transform` e `opacity`).
- **Idioma e voz:** português, frases curtas, nomes dos X-Factors em inglês (são nomes próprios do jogo, como Blitz e Screen). Sem travessão e sem emoji na interface.

## 3. Relação com o spec de animações dinâmicas

[`2026-10-14-animacoes-dinamicas-design.md`](2026-10-14-animacoes-dinamicas-design.md) está só como documento: o código dele pode entrar antes ou depois deste. Para os dois PRs não se atropelarem:

- Tudo o que é novo aqui vive em **arquivos novos** (`rhythm/`, `phaser/zoneFx.ts`, componentes da partida e do builder). Os arquivos compartilhados (`timeline.ts`, `FieldScene.ts`, `cues.ts`, `match.css`) recebem só acréscimos pontuais.
- A **animação contínua** continua rejeitada naquele spec ("campo vivo"). A aura da zona é a **única exceção**, e o motivo é de estado: ela indica um estado que dura várias jogadas. Duas imagens que alternam a cada 360 ms, no máximo duas auras no campo, parada com `prefers-reduced-motion`.
- Se o spec de animações dinâmicas já tiver sido implementado, o hit-stop de CLASH e as partículas dele valem também para a zona; este spec não os usa nem os exige.

## 4. Critérios de aceite

1. O medidor de momentum aparece abaixo do placar, mostra o valor dos dois times, os limiares 50 e 80 e o nível do pulse, em cor **e** em texto/padrão.
2. As fichas dos capitães mostram, para cada time, o progresso (0, 1 ou 2 de 2) e, na zona, o nome do perk com a descrição.
3. A entrada na zona tem faixa de anúncio, aura animada sob o capitão e som; a saída tem aviso discreto; o clash tem faixa e som próprios.
4. O jogador pressionado vê o tempo reduzido no relógio (já vem do servidor), o tremor curto no início do `PLAYCALL` (nível 2), a névoa tática numa carta e o batimento no áudio (nível 2).
5. O timeout do técnico é um botão de dois passos, só habilitado entre as jogadas, com o efeito explicado antes de confirmar.
6. O builder ganha a aba "Capitães" e o código do time leva os capitães; os erros novos têm mensagem em português.
7. O log da partida narra pulse, zona, clash e timeout. O replay reproduz essas linhas.
8. Com `prefers-reduced-motion: reduce` nada se move (tremor, aura, faixa, transição do medidor); a informação (texto, símbolo, padrão) permanece.
9. Celular em retrato e paisagem: sem rolagem horizontal, alvos de 44 px, nada cortado; o HUD cresce no máximo uma linha de medidor e uma de fichas.
10. `npm test` e `npm run typecheck` verdes; os testes de contraste e de CSS cobrem os tokens e as animações novas; o baseline de layout do desktop é atualizado de forma deliberada (seção 14).

## 5. Triagem de movimento

Cada item passou pelo portão da skill (frequência, propósito, velocidade, função). Rejeitados no fim.

| # | Onde | Frequência | Propósito | Movimento |
| --- | --- | --- | --- | --- |
| 1 | Entrada na zona: faixa no campo e aura | Rara (poucas por partida) | Delight no tier raro e estado | Faixa 600 ms em `steps(4)`, anel de aura de 2 quadros (360 ms cada) enquanto durar a zona |
| 2 | Clash de capitães | Muito rara | Delight raro | Faixa 600 ms; nenhuma partícula |
| 3 | Preenchimento do medidor | Cada jogada | Mudança de estado sem salto | `transform: scaleX` em `steps(6)`, 300 ms, depois da animação da jogada |
| 4 | Tier do pulse sobe | Ocasional | Estado | Faixa de 500 ms ("Pressão tática", "Caldeirão hostil") |
| 5 | Tremor do nível 2 | Ocasional | Estado (hostilidade) | Uma rajada de 240 ms, ±2 px, quando o `PLAYCALL` do pressionado começa |
| 6 | Ficha do capitão entra na zona | Rara | Estado | Inversão de cor (amarelo) sem movimento |
| 7 | Botão de timeout armado | Rara | Feedback | Troca de rótulo; sem movimento |

**Rejeitados:** tremor contínuo (náusea e cansaço visual, o nível 2 pode durar muitas jogadas); partículas no medidor ou na aura (decoração; o campo já guarda o orçamento de GPU para os momentos do outro spec); números do medidor contando de um valor a outro (o jogador está lendo, não assistindo); animação de entrada das fichas (aparecem uma vez por partida); pulso contínuo do batimento na interface (o batimento é só áudio); confete na entrada da zona (ela pode acontecer várias vezes por partida).

## 6. Medidor de ritmo (`PulseGauge`)

Linha nova no HUD, **entre o placar e os segmentos** (`hud-board`, `hud-pulse`, `hud-segments`). Componente `screens/match/PulseGauge.tsx`.

```
  A  12 ░░░░░░░▓▓▓▓▓▓▓▓▓▓▓│░░░░░░░░░░░░░░░░░░░ 0  B
           50    80    0   80    50
  Pressão tática contra você: 6 s para jogar.
```

- **Trilha:** 40 células de 5 pontos, 20 para cada lado, com o zero no centro. O lado do time A cresce para a esquerda (como o placar); o do B, para a direita. Preenchimento amarelo `--pulse`; célula vazia `--gbc-border`. Os limiares 50 e 80 têm marca mais alta e grossa.
- **Números nas pontas:** valor do time A à esquerda, do B à direita, em Press Start 2P. O valor do lado perdedor é 0.
- **Nível em padrão, não só cor:** nível 1 preenchido liso; nível 2 listrado (`repeating-linear-gradient` com cortes duros, ink e amarelo). A trilha ganha borda tracejada no nível 2.
- **Texto de estado** (Pixelify Sans, linha única que pode quebrar no celular):

| Situação | Texto |
| --- | --- |
| Nível 0 | Equilíbrio. |
| Nível 1, você pressionado | Pressão tática contra você: {n} s para jogar. |
| Nível 1, adversário pressionado | Seu time pressiona: o adversário tem {n} s. |
| Nível 2, você pressionado | Caldeirão hostil contra você: corridas e pressão da linha pioram. |
| Nível 2, adversário pressionado | Caldeirão hostil contra o adversário. |

`{n}` é `PHASE_SECONDS.PLAYCALL - PULSE_PLAYCALL_CUT_SECONDS`, importado do protocolo.

- **Acessibilidade:** a trilha tem `role="meter"` (`aria-valuemin=-100`, `aria-valuemax=100`, `aria-valuenow`, `aria-valuetext` "Momentum {n} a favor de {nome}, nível {k}"). O texto de estado fica em `role="status"` e só muda quando o nível ou o dominante mudam (o `aria-live` não lê cada jogada).
- **Valor mostrado durante a animação:** o `RESULT` grava a `view` final no começo da animação. O medidor e as fichas usam o ritmo **anterior à jogada** (`animation.rhythmBefore`, guardado pelo reducer) até a animação acabar, para não adiantar o resultado. Depois, a transição de 300 ms.

## 7. Fichas dos capitães (`ZoneStrip`)

Linha abaixo do medidor, dentro do `hud`. Componente `screens/match/ZoneStrip.tsx`.

- Até 4 fichas (2 por time, só as que existem), A à esquerda e B à direita. Cada uma mostra o sprite do capitão (24 px, `Sprite`), o papel ("Ataque" ou "Defesa") e dois pontos de progresso (`●●`, `●○`, `○○`, com texto `sr-only` "progresso 1 de 2").
- **Na zona:** a ficha inverte para `--pulse` com tinta `--gbc-ink` e mostra o nome do perk.
- **Descrição:** ao passar o mouse, focar ou tocar, abre uma caixa com nome do perk, posição, gatilho e efeito (textos na seção 12). Em celular, o toque abre uma folha como a das cartas (`tapAction`); o botão da ficha tem 44 px de alto.
- **Largura estreita (< 600 px):** só sprite, papel abreviado e pontos; o nome do perk aparece na folha.
- Quando nenhum time tem capitão, a linha não é renderizada.

## 8. Campo (Phaser 3.90)

Arquivo novo `apps/client/src/phaser/zoneFx.ts` (funções puras, sem importar Phaser, no estilo de `choreography.ts`) e acréscimos pontuais ao `FieldScene.ts`.

### 8.1 Aura

- Duas texturas geradas no código (`zone-aura-0`, `zone-aura-1`, 32×32): três anéis de pixels com dither, brancos e amarelos, sem asset novo.
- A aura é filho do `Container` do capitão (índice 0, atrás do sprite), então acompanha os tweens de posição.
- Um único `time.addEvent({ delay: 360, loop: true })` alterna os dois quadros de todas as auras. Em `reduced`, sem loop: quadro fixo.
- `Stage` ganha `auras: { side: 'offense' | 'defense'; id: number }[]`, derivado de `view.rhythm.captains` (`inZone`). `addPlayer` cria a aura quando o sprite combina com um item.
- Durante a animação, o estágio é o **pré-jogada**; a aura nova aparece pelo passo `ZONE` (seção 8.2) e a antiga some por um `ZONE` de saída.

### 8.2 Passos novos da timeline (aditivos, opcionais)

| Passo | Origem | Duração | Efeito |
| --- | --- | --- | --- |
| `{ kind: 'ZONE', team, side, species, xFactor, enter: true }` | `ZONE_ENTER` | 600 ms | Faixa "NA ZONA: {espécie}" com o nome do perk em texto menor; aura aparece |
| `{ kind: 'ZONE', ..., enter: false }` | `ZONE_EXIT` | 200 ms | Aura some; sem faixa |
| `{ kind: 'ZONE_CLASH', offense, defense }` | `ZONE_CLASH` | 600 ms | Faixa "CHOQUE DE CAPITÃES" |
| `{ kind: 'PULSE', dominant, tier }` | `PULSE_TIER` com nível maior que o anterior | 500 ms | Faixa "PRESSÃO TÁTICA" ou "CALDEIRÃO HOSTIL" |

Os passos entram **depois** dos passos da jogada. `fitToBudget` continua a garantia contra estourar `TIMELINE_BUDGET_MS`; o pior caso novo (uma entrada de zona, um clash e um tier) soma 1700 ms e é coberto por teste. `audio/cues.ts` ganha os casos novos em `cueForStep` (o `switch` exaustivo obriga) e os cues da seção 11.

A faixa usa o `banner` de texto que a cena já tem (`FieldScene.banner`), com a cor do lado do capitão (`CHIP_BG`) e o contorno de tinta. Sem partícula.

## 9. Quem é pressionado

Calculado em `rhythm/viewModel.ts` a partir de `view.rhythm` e `view.you`.

- **Tremor (nível 2, você pressionado):** quando entra `PLAYCALL` (e só nele), o `.match-field` recebe a classe `hostile-shake` por 240 ms: `translateX` de ±2 px em `steps(4)`. Uma vez por turno, não repete se o componente remontar no mesmo `turnId`. Só dentro de `@media (prefers-reduced-motion: no-preference)`.
- **Névoa tática (nível ≥ 1, você pressionado):** em `PICK_CARD`, uma carta da mão que **não seja básica** tem o tooltip substituído por um bloco de estática (`░▒▓` em CSS) e o texto "Névoa tática: detalhes ocultos nesta jogada". A face da carta (nome, categoria, tipo) continua legível e a carta continua jogável. A escolhida é `turnId % cartasNaoBasicas.length`, estável entre renders. O bloco fica `aria-hidden` e o texto explicativo não.
- **Relógio:** nada a fazer; o `deadline` que o servidor manda já vem cortado (Parte 1).

## 10. Botão de timeout (`TimeoutButton`)

Na linha `.match-tools`, ao lado de "Depth chart". Componente `screens/match/TimeoutButton.tsx`.

- **Rótulo:** "Timeout (2)" com a contagem restante.
- **Dois passos:** o primeiro clique arma ("Confirmar timeout?") por 3 s; o segundo envia `play:timeout` com o `turnId` da `view`. Clicar fora ou esperar desarma.
- **Habilitado quando:** `view.phase` é `FORMATION` ou `PACKAGE`, não há animação em curso, `view.rhythm.timeouts[you] > 0` e `!view.rhythm.calledThisSnap[you]`.
- **Explicação antes de confirmar** (texto abaixo do botão, só quando armado ou em foco):

| Situação | Texto |
| --- | --- |
| Momentum favorece o adversário e há capitão dele na zona | Corta o momentum dele pela metade e tira os capitães dele da zona. |
| Só o momentum favorece o adversário | Corta o momentum dele pela metade. |
| Só há capitão dele na zona | Tira os capitães dele da zona. |
| Nada a cortar | Sem efeito agora. Guarde o timeout. |

- **Desabilitado:** o botão fica `aria-disabled` e um texto curto diz por quê ("Disponível entre as jogadas", "Sem timeouts", "Você já chamou timeout neste snap").
- Não há estado otimista: o botão só muda quando o servidor devolve a `match:phase` com `calledThisSnap` e `timeouts` novos.

## 11. Áudio

Todo som continua sintetizado (`recipes.ts`), nada de arquivo. Os nomes do md (`x_factor_activated.ogg` etc.) viram cues sintetizados.

| Cue | Quando | Receita (resumo) |
| --- | --- | --- |
| `zone-enter` | passo `ZONE` de entrada | quadrada ascendente 440 a 1760 Hz em 0,9 s + ruído metálico curto; duração total 1,4 s (limite do teste é 1,5 s) |
| `zone-exit` | passo `ZONE` de saída | duas notas descendentes curtas, 0,3 s |
| `zone-clash` | passo `ZONE_CLASH` | clash existente + acorde de duas quadradas, 0,5 s |
| `pulse-1` | passo `PULSE` nível 1 | ruído filtrado que cresce, 0,8 s (torcida) |
| `pulse-2` | passo `PULSE` nível 2 | o anterior mais grave e mais longo, 1,2 s |
| `timeout` | evento `TIMEOUT_CALLED` | dois apitos curtos, 0,35 s |
| `heartbeat` | repetição, ver abaixo | duas batidas graves (triângulas), 0,3 s |

- **Batimento:** em `useGameAudio`, enquanto o jogador está pressionado no nível 2 e o painel está em `PICK_*`, um `setInterval` de 1,2 s toca `heartbeat`. Sai ao deixar o nível 2, ao sair da etapa de escolha ou ao desmontar.
- **Música abafada:** `Audio.setDuck(factor)` novo no motor de áudio. O motor guarda `duck` (padrão 1) e `applyGains` passa a usar `music * duck`. No nível 2, pressionado, o fator é 0,55; fora disso, 1. A mudança usa o mesmo `ramp` do volume (0,03 s) para não estalar.
- O som do `timeout` e dos cues de evento sai pelo caminho que já existe: eventos de `match:reveal` e `match:result` viram `TimedCue` em `animationCues`/`revealCues`.
- `docs/AUDIO.md` ganha a lista dos cues novos.

## 12. Textos

### 12.1 Perks (`lib/perks.ts`)

| X-Factor | Posição | Gatilho (entrar na zona) | Efeito |
| --- | --- | --- | --- |
| Telepathic Pocket | QB | 2 passes completos seguidos com a defesa errando a leitura | A leitura certa da defesa vale como neutra. |
| Overdrive Breakthrough | RB | 2 corridas seguidas de 10 jardas ou mais | A corrida avança pelo menos 3 jardas e escapa da contenção. |
| Slipstream Separation | WR | 2 recepções seguidas que fazem 1st down | Contra homem a homem, mais jardas e menos passes incompletos. |
| Immovable Wall | OL | 2 jogadas seguidas sem sack e sem perda | Contra Blitz, sem sack. |
| Intimidate Rush | DL | 1 sack, ou 2 corridas contidas em até 2 jardas | A pressão da linha aumenta: mais sacks. |
| Enforcer Stomp | LB | 2 corridas por dentro contidas em até 3 jardas | Mais fumbles, e o portador cansa em dobro. |
| Island Lockdown | CB | 2 passes incompletos forçados | O passe sob a marcação dele arrisca incompletar ou ser interceptado. |
| Predator Hawk | S | 2 jogadas seguidas sem ceder passe profundo completo | O ataque rende menos em passes profundos e play-action. |

### 12.2 Narração (`match/narration.ts`)

| Evento | Linha | Tipo |
| --- | --- | --- |
| `PULSE_TIER` sobe | O estádio pressiona {time}: pressão tática. / Caldeirão hostil contra {time}! | `system` |
| `PULSE_TIER` desce a 0 | A torcida se acalma. | `system` |
| `ZONE_ENTER` | {espécie} entrou na zona! ({perk}) | `effect` |
| `ZONE_EXIT` | {espécie} saiu da zona. | `effect` |
| `ZONE_CLASH` | Choque de capitães: {ofensivo} contra {defensivo}! | `effect` |
| `TIMEOUT_CALLED` | {time} chamou timeout (restam {n}). | `system` |

`MOMENTUM` não gera linha (seria ruído a cada jogada). O nome do time vem de `names`; o da espécie, de `speciesName`.

## 13. Builder: aba "Capitães"

- **Modelo:** `TeamDraft` ganha `captains?: Captains`. `draftFromTeam`/`draftToTeam` o copiam. Nova ação `SET_CAPTAIN { side: 'offense' | 'defense'; captain: Captain | null }` no `builderReducer`. Uma função `pruneCaptains(draft)` roda no fim de qualquer mudança de elenco ou de depth chart e remove o capitão que saiu do elenco ou da posição do perk.
- **Erros:** `teamErrorMessage` ganha `CAPTAIN_NOT_IN_ROSTER` ("{nome} está como capitão, mas não está no elenco.") e `XFACTOR_POSITION_MISMATCH` ("{nome} não joga na posição do X-Factor escolhido.").
- **Tela:** `screens/builder/CaptainsEditor.tsx`, nova aba "Capitães" entre "Depth chart" e "Deck". Duas colunas no desktop (Ataque, Defesa), uma no celular.

```
  Capitão do ataque                    Capitão da defesa
  ( ) Sem capitão                      ( ) Sem capitão
  (o) Telepathic Pocket  QB            ( ) Intimidate Rush  DL
      gatilho ... efeito ...           ( ) Enforcer Stomp   LB
  ( ) Overdrive ...      RB            ( ) Island Lockdown  CB
  ...                                  ( ) Predator Hawk    S
  Quem lidera?  [sprite] Abra  [sprite] Kadabra
```

- Cada lado é um `radiogroup` (`useArrowNav`). Escolher um perk escolhe o titular da posição como capitão (o time fica válido na hora); a linha "Quem lidera?" lista as espécies do depth chart naquela posição. Sem ninguém na posição: o perk fica desabilitado com o texto "Ninguém no depth chart joga de {posição}. Monte a posição primeiro."
- Estado vazio: "Sem capitão" é o padrão e é válido; um time sem capitães joga normalmente.
- O código do time (`encodeTeam`) já inclui `captains` porque o `Team` o carrega. Nada de servidor.

## 14. Dados e organização do cliente

| Arquivo | Responsabilidade |
| --- | --- |
| `rhythm/viewModel.ts` (novo, puro) | `gaugeModel`, `pressureFor`, `foggedCardIndex`, `timeoutState`, `zoneChips` |
| `lib/perks.ts` (novo) | Nomes, posições, gatilhos e efeitos em português (seção 12.1) |
| `screens/match/PulseGauge.tsx`, `ZoneStrip.tsx`, `TimeoutButton.tsx` (novos) | Componentes da partida |
| `screens/match/Hud.tsx` | Recebe `rhythm`, `names`, `seconds` e monta o medidor e as fichas |
| `match/matchState.ts` | `Stage.auras`, `Animation.rhythmBefore`; o reducer guarda o ritmo anterior no `RESULT` |
| `match/timeline.ts`, `match/narration.ts` | Passos e linhas novos |
| `phaser/zoneFx.ts` (novo, puro), `phaser/FieldScene.ts` | Aura, faixas |
| `audio/cues.ts`, `recipes.ts`, `engine.ts`, `gameAudio.ts`, `useGameAudio.ts` | Cues, `setDuck`, batimento |
| `screens/builder/CaptainsEditor.tsx`, `builder/draft.ts`, `builderState.ts`, `derived.ts` | Capitães no builder |
| `styles/tokens.css`, `screens/match/match.css`, `screens/builder/builder.css` | Tokens e estilos |

**Tokens novos** (`tokens.css`): `--pulse: var(--gbc-yellow)`, `--pulse-ink: var(--gbc-ink)`. Nenhuma cor nova. O amarelo passa a significar "ritmo e zona" (hoje só marca a linha do 1st down, que continua dentro do campo Phaser). Texto sobre `--pulse` usa `--pulse-ink` (contraste de tinta sobre amarelo, medido em `contrast.test.ts`).

## 15. Testes e verificação

- **Puros:** `viewModel.test.ts` (modelo do medidor nas bordas 0, 49, 50, 79, 80, 100 e negativos; quem é pressionado; carta da névoa estável; estado do botão de timeout em todas as fases), `zoneFx.test.ts`, `perks.test.ts` (todo `XFactorId` tem texto).
- **Timeline e áudio:** passos `ZONE`/`ZONE_CLASH`/`PULSE` nascem dos eventos certos e só em subida de nível; o pior caso soma até 1700 ms e `fitToBudget` o encaixa; `audio-cues`/`audio-recipes` cobrem os cues novos (duração máxima 1,5 s); `setDuck` altera o ganho da música e some ao mutar; o batimento liga e desliga com o nível e a etapa.
- **Reducer:** `rhythmBefore` e `auras` no `RESULT`; `REVEAL` com `TIMEOUT_CALLED` narra sem quebrar o `seenReveals`.
- **DOM:** `PulseGauge` (valores, `role="meter"`, texto por situação), `ZoneStrip` (pontos, zona, folha de toque), `TimeoutButton` (dois passos, desarma, desabilitado por fase), `CardHand` com a névoa, `CaptainsEditor` (radiogroup, candidatos, estado vazio), `Hud` sem as linhas novas quando o ritmo está neutro e sem capitães.
- **Builder:** `builderReducer` com `SET_CAPTAIN` e `pruneCaptains`; `draftErrors` e `teamErrorMessage`; ida e volta do código do time com capitães.
- **CSS:** `css-platform` (animações só dentro de `no-preference`), `contrast` (tokens novos), `form-font-size` (campos do builder).
- **Layout:** o HUD ganha altura em todos os viewports, então o baseline numérico do desktop (`docs/superpowers/specs/desktop-baseline`) muda. O plano manda rodar `scripts/layout-snapshot.js`, conferir que **só** o HUD e o que está abaixo dele deslocaram, e regravar o baseline no mesmo commit com a justificativa. `scripts/layout-audit.js` roda em retrato, paisagem e desktop.
- **Manual (obrigatório):** uma partida local com os dois lados e capitães; forçar momentum alto pelo console do servidor de teste; `prefers-reduced-motion` ligado e desligado; animações a 0,25× no inspetor; ouvir os cues novos e o batimento.

## 16. Fora do escopo

Capitães dos times sugeridos; capitães no lobby (o `RoomPlayer` não os leva); medidor e fichas no visualizador de replay (o replay mostra as linhas novas no log, mas não o medidor); modo contra bot; partículas e confete; tremor contínuo; qualquer mudança em engine, protocolo ou servidor; cores novas fora de `--pulse`.

## 17. Riscos

- **O HUD cresce.** Mitigação: as fichas somem sem capitães e ficam só ícones em tela estreita; o baseline é regravado de propósito.
- **Aura contínua** contra a regra do spec de animações dinâmicas. Mitigação: exceção documentada (seção 3), máximo de duas auras, dois quadros, parada em `reduced`.
- **Névoa tática tira informação do jogador pressionado.** É o efeito pedido no md; fica visível (texto explicativo) e nunca esconde o nome nem impede jogar a carta.
- **Gauge adiantando o resultado.** Mitigação: `rhythmBefore` até o fim da animação.
- **Textos de gatilho podem divergir da regra** se a Parte 1 recalibrar números. Mitigação: `perks.test.ts` falha se um `XFactorId` ficar sem texto, e a revisão do PR cruza `lib/perks.ts` com `rhythm.ts`.
- **Sensação de movimento e de som só se julga rodando.** Checagem manual obrigatória.
