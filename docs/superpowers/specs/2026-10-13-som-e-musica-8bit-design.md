# PFL — Som e música em 8 bits (issue D1)

> **Data:** 2026-10-13. **Base:** [2026-10-12-pfl-proximos-passos-issues.md](2026-10-12-pfl-proximos-passos-issues.md), item D1.
> **Escopo:** somente o cliente (`apps/client`). Sem mudanças no servidor, no protocolo ou no motor.

## 1. Objetivo e critérios de aceite

Dar áudio 8-bit ao jogo: efeitos que reforçam a revelação das cartas, o resultado da leitura, o confronto de tipos, o tackle, o first down, o TD, o FG, o turnover e o fim de jogo, além de música de fundo.

Critérios herdados da issue D1:
- Efeitos para: revelação de carta, leitura boa/neutra/ruim, super efetivo, tackle, first down, TD, FG, turnover e fim de jogo.
- Música no menu/lobby e na partida, com volume e mudo persistidos em localStorage.
- O áudio só inicia depois de uma interação do usuário. Sem áudio, o jogo continua funcionando.
- Assets com licença compatível, registrada no repositório.

## 2. Decisões fechadas

| Tema | Decisão |
|---|---|
| Fonte dos sons | **Síntese em código com Web Audio.** Sem arquivos de áudio, sem dependência nova |
| Disparo dos sons da jogada | **Pelos passos da linha do tempo** (`AnimStep`), com o mesmo `at` da animação |
| Música | **Duas faixas em loop** (menu/lobby e partida) mais **jingles** curtos de vitória e derrota |
| Controles | **Um controle global fixo** no shell do app: botão de mudo com popover de volume |
| Volumes | **Dois**: Música e Efeitos, mais o mudo geral |
| Arquitetura | **Núcleo puro mais motor fino**, com uma interface `AudioBackend` para testes |
| Composição | Original, feita para o projeto (sem material de terceiros) |

## 3. Arquitetura

Tudo em `apps/client/src/audio/`:

| Arquivo | Responsabilidade |
|---|---|
| `cues.ts` | Funções puras: `cuesFor(steps) → [{ at, cue }]` e os cues de revelação, leitura e interface |
| `recipes.ts` | Receita de cada cue como dados (onda, frequência ou rampa, duração, volume, envelope, ruído) |
| `scores/*.ts` | As duas faixas e os dois jingles como partituras em dados |
| `score.ts` | Parser da notação compacta de partitura |
| `synth.ts` | Transforma uma receita em nós de Web Audio |
| `sequencer.ts` | Toca uma partitura em loop, com agendamento à frente no relógio do `AudioContext` |
| `mixer.ts` | Estado `{ muted, music, sfx }`, ganhos, rampas e persistência |
| `backend.ts` | Interface `AudioBackend`, a implementação com `AudioContext` e o `FakeBackend` dos testes |
| `index.ts` | API pública (`audio`) |
| `useGameAudio.ts` | Hook que liga o estado do jogo ao áudio |
| `AudioControl.tsx` e CSS | O controle global |

Cadeia de sinal:

```
música (sequenciador) → musicGain ─┐
                                    ├→ masterGain → compressor leve → destination
efeitos (synth)       → sfxGain  ──┘
```

`masterGain` vale 0 ou 1 (mudo). O compressor leve evita estourar quando a fanfarra do TD soa junto com a música.

### 3.1 API pública

```ts
audio.unlock()                          // idempotente
audio.play(cue)                         // efeito avulso
audio.playTimeline(steps)               // agenda cuesFor(steps) pelos `at`
audio.playCues(timedCues)               // lista já montada (revelação, leitura, passos)
audio.setMusic('menu' | 'match' | null) // troca de faixa com fade
audio.playJingle('win' | 'lose')
audio.getState() / audio.setVolume(channel, v) / audio.setMuted(b)
audio.subscribe(fn)
```

No React, `useAudioState()` lê o estado com `useSyncExternalStore`. Não há Context Provider.

## 4. Catálogo de sons e mapeamento

`cuesFor` preserva o `at` de cada passo, então o som acompanha a animação mesmo depois do `fitToBudget`.

| Passo | Cue | Caráter |
|---|---|---|
| `SNAP` | `snap` | estalo curto de ruído |
| `BLOCK` | `block` | pancada grave e seca |
| `CLASH` com efeito `SUPER` / `WEAK` / `IMMUNE` / neutro | `clash-super` / `clash-weak` / `clash-immune` / `clash` | quadrada com glissando para cima, para baixo, impacto abafado e impacto neutro |
| `THROW` | `throw` | assobio que sobe rápido |
| `RUN` (`bigPlay` ou não) | `run-big` / `run` | passos em tremolo, e arpejo curto para jogada grande |
| `TACKLE` | `tackle` | ruído com queda de tom |
| `INCOMPLETE` | `incomplete` | duas notas descendo |
| `SACK` | `sack` | impacto pesado com queda |
| `TURNOVER` | `turnover` | motivo descendente em três notas |
| `KICK` com `good` verdadeiro / falso / nulo | `kick-good` / `kick-miss` / `kick` | chute, depois tom de acerto ou erro |
| `BANNER` `good` / `bad` / `info` | `banner-good` / `banner-bad` / `banner-info` | fanfarra curta, queda e blip |

- O banner `TOUCHDOWN` usa o cue próprio `td`, mais longo que `banner-good`.
- Os banners `FIRST DOWN`, `PRORROGAÇÃO` e `FIM DE JOGO` têm `tone: 'info'` e tocam `banner-info` (um blip nítido). O first down não ganha cue próprio, para `cuesFor` decidir só pelo tipo e pelo `tone` do passo e não pelo texto do banner. O jingle de fim de jogo toca depois, ao entrar na tela `END` (seção 7).
- Cues fora da timeline: `reveal`, `read-good`, `read-neutral`, `read-bad`, `turn-start`.
- Cues de interface: `ui-click`, `ui-select`, `ui-back`, `ui-error`.
- **Perspectiva da leitura:** os símbolos ✔/·/✖ são do ponto de vista da defesa. O som é "bom para mim / neutro / ruim para mim", calculado a partir de `you` e do lado que defende no turno. Os banners ficam neutros, como a timeline já os classifica.
- Cada cue tem um limite de vozes simultâneas. O mesmo cue repetido em menos de ~40 ms é descartado.
- Sem `AudioContext` ou com ele suspenso, `play()` é um no-op silencioso.

## 5. Música

### 5.1 Formato da partitura

Uma faixa é `{ bpm, steps, channels }`, onde `steps` é o comprimento do loop em semicolcheias (16 por compasso). Cada canal é `{ voice, notes }`, com as notas numa string compacta por compasso (exemplo: `"C4 . E4 . G4 . E4 ."`, `.` para pausa, `-` para sustentar). Vozes, no máximo 4 canais:

- `pulse1` (melodia) e `pulse2` (contramelodia ou arpejo): onda quadrada com ciclo de 25% ou 50%.
- `tri` (baixo): onda triangular.
- `noise` (percussão): ruído filtrado em kick, caixa e chimbal.

### 5.2 Faixas e jingles

- **Menu e lobby:** ~96 bpm, modo maior, 8 compassos. Melodia simples, baixo caminhando, percussão mínima.
- **Partida:** ~132 bpm, modo menor com virada no refrão, 8 compassos. Baixo pulsante, caixa nos tempos 2 e 4, arpejo no `pulse2`.
- **Jingles:** vitória (~2 s, escala ascendente que fecha em acorde maior) e derrota (~2 s, descendente em modo menor). Tocam uma vez: a faixa em curso faz fade-out, o jingle toca, e só no fim dele a música da tela volta.
- A música tem ganho-base baixo, para os efeitos da jogada sempre passarem por cima. Os volumes do jogador escalam acima disso.

### 5.3 Sequenciador

- A cada ~25 ms programa no relógio do `AudioContext` as notas dos próximos ~100 ms.
- Na troca de faixa, a antiga faz fade-out de ~300 ms e a nova começa. Nunca há duas faixas misturadas.
- A música pausa com a aba oculta (`visibilitychange`) e retoma ao voltar.

## 6. Estado, persistência e desbloqueio

- Estado: `{ muted, music, sfx }`, volumes de 0 a 1 em passos de 0,1. Padrão: **música 0,4, efeitos 0,7, não mudo**.
- Persistência numa chave única, `pfl.audio.v1`, por `readJson`/`writeJson` de [storage.ts](../../../apps/client/src/lib/storage.ts). Valor inválido ou storage indisponível volta ao padrão. Falha de escrita é ignorada.
- Mudanças de volume usam uma rampa de ~30 ms para não estalar.
- **Desbloqueio:** nenhum `AudioContext` na carga da página. Um listener único de `pointerdown`/`keydown` no `window` cria e retoma o contexto na primeira interação e **continua instalado**: `unlock()` é idempotente e chama `resume()` de novo se o navegador suspendeu o contexto. Antes do primeiro gesto, só `setMusic()` guarda a intenção (a música começa quando o contexto desbloqueia); efeitos e jingles chamados antes do desbloqueio, ou com a aba oculta, são descartados. Subir um volume acima de 0 também desmuta.
- Sem `window.AudioContext`, o backend é um no-op e `getState().available` é falso. O `AudioControl` então se esconde.

## 7. Ligação nas telas

Ponto de ligação: o reducer cria `animation` (com `seq`, `steps` e `startedAt`) na mensagem `match:result`, junto com a `reveal`. Esse é o instante em que os sons da jogada devem começar. **`MatchScreen` e `FieldScene` não são alterados.**

`useGameAudio(...)`, chamado em [App.tsx](../../../apps/client/src/App.tsx), faz três coisas:
1. **Música e jingle pela tela.** `HOME`, `BUILDER` e `LOBBY` tocam `menu`. `MATCH` toca `match`. Ao entrar em `END`, toca o jingle de vitória ou derrota (conforme `you` e o placar) e, depois dele, `menu` volta.
2. **Sons da jogada, por `animation.seq`.** Quando o `seq` muda, dispara `reveal` em t=0, o som da leitura em ~+250 ms e `playTimeline(steps)`. Se o instante atual já passou de `endsAt` mais uma folga, descarta tudo (resultado atrasado após reconexão não soa).
3. **Erro.** `ui-error` quando `match.lastError` ou o aviso (`notice`) mudam.

Sons de interface: um listener de `click` em captura no `document`, instalado pelo `AudioControl`, toca `ui-click` quando o alvo está dentro de `button` ou `[role=button]` não desabilitado.

Replay: [ReplayViewer.tsx](../../../apps/client/src/screens/end/ReplayViewer.tsx) ganha um `useEffect` que chama `audio.playTimeline(frame.steps)` quando o quadro muda. A revelação toca (os eventos do quadro trazem `CARDS`); a leitura não, porque o espectador do replay não tem lado.

Arquivos alterados: `App.tsx`, `ReplayViewer.tsx`, `match/timeline.ts` (o passo `RUN` ganha `big?: boolean` e o módulo exporta `TOUCHDOWN_BANNER`) e `match/matchState.ts` (exporta `revealFrom`). Os demais são novos. Nenhum desses arquivos está no diff do PR #8. `audio: { noAudio: true }` em `PhaserField.tsx` permanece, porque o áudio do Phaser é independente do nosso.

## 8. Direção de interface do controle

**Como foi guiada:** pelas skills `impeccable`, `frontend-design` e `design-taste-frontend`. Não há `PRODUCT.md` nem `DESIGN.md`, então o sistema vivo em [tokens.css](../../../apps/client/src/styles/tokens.css) e [app.css](../../../apps/client/src/styles/app.css) é a autoridade. Da `design-taste-frontend` valem só as regras transversais (estados completos, contraste AA, `prefers-reduced-motion`, alvos de toque, sem texto genérico).

**Modo:** *Operate*. Leitura imediata vale mais que expressão.

**Estrutura:** botão fixo no canto inferior direito, com popover que abre para cima.

```
                                         +---------------------------+
                                         | Som                       |
                  [ ▶))) ]  44×44        | Música    [■■■■□□□□□□]    |
                                         | Efeitos   [■■■■■■■□□□]    |
                                         +---------------------------+
```

- **Botão:** 44×44 px, no estilo `.btn` (borda de 3 px, sombra rígida, deslocamento no `:active`). Ele alterna o mudo. Os volumes abrem por um gatilho secundário ao lado, um botão com seta (▲), também com alvo de toque de pelo menos 44 px. Os dois formam um grupo (`role="group"`, `aria-label="Som"`).
- **Ícone:** alto-falante em pixel art, desenhado como retângulos a partir de um bitmap 8×8 com `shape-rendering: crispEdges`. As ondas mostram 0 a 3 arcos conforme o volume, e o mudo troca as ondas por um X. É o único toque de personalidade. Foge da regra "sem SVG feito à mão" da `design-taste-frontend` porque o projeto não tem biblioteca de ícones e um traço suave destoaria do pixel.
- **Estado sem depender só de cor:** o mudo muda o fundo para `--gbc-panel-dark` e o ícone para o X, e `aria-pressed` reflete o estado. O `aria-label` é estável ("Silenciar o som"), para o sentido não se inverter para leitores de tela.
- **Popover:** `input type="range"` nativo estilizado (trilho e marcador quadrados), rótulos "Música" e "Efeitos". Ao soltar o volume de efeitos, toca um blip de amostra. Não é modal: `aria-expanded` no gatilho, Esc fecha e devolve o foco, clique fora fecha, sem armadilha de foco. Largura `min(260px, 100vw - 32px)` em 390 px.
- **Movimento:** nenhum além do `:active`. A regra global de `prefers-reduced-motion` já cobre o resto.
- **Textos:** frase com inicial maiúscula, verbos diretos, o mesmo termo para a mesma ação em todo lugar.
- **Posição e camadas, a confirmar com captura de tela em desktop e 390 px:** o canto não pode cobrir a mão de cartas nem o painel de escolha. Se cobrir, a alternativa é o canto superior direito, abaixo do `notice-top`. O `z-index` fica abaixo do `notice-top` (50) e acima das telas.
- **Processo:** `impeccable detect` roda uma vez quando a interface estiver pronta, com captura em desktop e mobile. Depois, `/impeccable init` para registrar o `PRODUCT.md`.

## 9. Testes

| Módulo | O que se testa |
|---|---|
| `cues.ts` | Tabela passo → cue (`CLASH` com cada efeito, `KICK` com `good` verdadeiro/falso/nulo, `BANNER` de TD contra os demais, `RUN` com `bigPlay`). O `at` é preservado. Lista vazia dá lista vazia |
| `recipes.ts` | Todo cue tem receita válida (frequências e durações positivas, limite de vozes) |
| `score.ts` e `scores/*` | Pausas, sustentação e nota inválida (erro claro). Cada faixa tem os passos declarados e só as 4 vozes |
| `sequencer.ts` | Com relógio falso: agenda à frente, repete o loop sem buracos, fade-out na troca, pausa com a aba oculta e retomada |
| `mixer.ts` | Padrões, clamp de 0 a 1, mudo, persistência, leitura com valor inválido ou storage nulo, escrita que falha |
| `audio/index.ts` com `FakeBackend` | `play` antes do desbloqueio é descartado e `setMusic` só guarda a intenção, `unlock` aplica, repetição em menos de 40 ms é descartada, `playTimeline` descarta cues atrasados, sem `AudioContext` tudo é no-op |
| `useGameAudio` | A música muda com a tela. Um `seq` novo dispara reveal, leitura e timeline uma única vez. Resultado atrasado não soa. O jingle depende de `you` |
| `AudioControl` | O botão alterna o mudo (`aria-pressed`). O popover abre e fecha com Esc, devolvendo o foco. Os dois volumes persistem. Some quando `available` é falso |

Não é testável automaticamente se os sons e as melodias soam bem. O responsável ouve antes do merge, e por isso as partituras saem em commit separado.

Verificação final: `npm test`, `npm run typecheck`, build de produção e checagem manual no navegador (desbloqueio, mudo, volume persistindo após F5, controle em 390 px e em desktop).

## 10. Licença e créditos

Efeitos e música são sintetizados em código e compostos para o projeto, sem arquivos de terceiros. O repositório **não tem arquivo `LICENSE`** hoje. `docs/AUDIO.md` registra que as obras de áudio são originais do projeto e valem sob a licença que o repositório adotar, e descreve como ajustar receitas e partituras. Definir a licença do repositório fica a cargo do responsável e é independente desta issue.

## 11. Ordem de entrega

Cada item é um commit que passa nos testes. A branch parte da `main`.
1. Núcleo puro: `score`, `cues` (com os ajustes em `timeline.ts`) e `mixer`, com testes.
2. Motor: `backend` (interface, Web Audio e falso), receitas e `synth`, `sequencer` e `engine`, com testes.
3. Partituras, jingles e o singleton `audio`, em commit à parte, para audição e ajuste.
4. `AudioControl` e CSS, com testes de componente.
5. Ligação: `useGameAudio`, `App.tsx` e `ReplayViewer.tsx`.
6. `docs/AUDIO.md` e a passada final de verificação.

Os passos 1 a 4 não tocam arquivos do PR #8. O passo 5 só precisa de rebase se o #8 entrar antes, e mesmo assim `App.tsx` e `ReplayViewer.tsx` não estão no diff dele.

## 12. Fora de escopo

Música dinâmica por intensidade, sons do Draft (a spec do Draft prevê um som curto de pick, que entra quando o Draft existir), atalho de teclado para mudo e áudio no servidor.

## 13. Pontos a verificar na implementação

- Resolvido ao planejar: o lado do jogador no turno é `animation.stage.offenseTeam === room.you`, e o quadro do replay carrega os eventos `CARDS` (revelação sim; leitura não, por falta de lado).
- Confirmar na implementação que `stage.offenseTeam` é mesmo o ataque do turno que acabou de ser resolvido.
- A posição do controle contra a mão de cartas e o painel de escolha, em desktop e 390 px.
