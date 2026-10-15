# Animações dinâmicas: espetáculo nos momentos raros, polimento nas jogadas comuns

> **Data:** 2026-10-14. **Base:** `main`. **Só cliente:** sem mudanças em engine, protocolo ou servidor.
> **Sucede:** [animações dirigidas pelos eventos do motor](2026-10-13-animacoes-motor-design.md) (issue #11, PR #17). Esta spec **não desfaz** as decisões daquela; ela reabre, de forma limitada, os itens que ela rejeitou (ver §3).
> **Entrega:** um único PR.

## 1. Objetivo

Deixar a partida mais dinâmica e legível mantendo a identidade Game Boy Color (`steps()`, paleta `--gbc-*`, sem blur). O movimento forte fica reservado a poucos momentos de alto impacto; as jogadas comuns (dezenas por partida) ganham só polimento curto e barato.

GSAP foi avaliado e descartado: o campo já tem o motor de tweens do Phaser e a UI é CSS. Os princípios de performance das skills de GSAP seguem valendo (animar `transform`/`opacity`, nada de `width`, limitar trabalho simultâneo).

## 2. Critérios de aceite

1. TD, troca de posse, field goal/PAT bom, ×4 no CLASH, SACK e fim de jogo/prorrogação têm efeito próprio (partículas e/ou zoom de câmera).
2. Toda jogada com CLASH ganha um hit-stop de 70 ms; todo TACKLE inclina o portador.
3. Jogadas comuns (SNAP, BLOCK, RUN, THROW, INCOMPLETE, CLASH sem ×4) **não** geram partículas nem zoom.
4. Barras de stat, mão de cartas, carta jogada, placar, down & distância e banner de leitura animam como descrito na §6.
5. HOME ↔ BUILDER usa View Transition quando houver suporte; LOBBY/MATCH/END entram com `screen-enter`.
6. Com `prefers-reduced-motion: reduce` nada se move (partículas, câmera, hit-stop, inclinação, WAAPI, View Transition, entradas); a informação (texto, cor, símbolo) permanece.
7. Nenhum efeito extrapola `TIMELINE_BUDGET_MS`; `audio/cues.ts` e seus testes ficam intocados; `npm test` e `npm run typecheck` verdes.

## 3. Decisões herdadas e o que muda

A spec anterior rejeitou partículas, animação contínua de sprites/bola e efeitos em `FIRST_DOWN`, por frequência e custo de GPU no celular. Decisão do usuário nesta rodada: **espetáculo só em momentos raros**.

| Item | Decisão |
| --- | --- |
| Partículas | Permitidas **apenas** nos momentos raros da §4.1, com teto de 24 (12 em toque). |
| Zoom/pan de câmera | Apenas TD e troca de posse. |
| Animação contínua (idle, campo vivo) | **Continua rejeitada.** |
| `FIRST_DOWN` | Continua só com o banner atual. |
| Sombra sob o jogador | **Já existe** (`addPlayer`, elipse em `FieldScene.ts`); fora do escopo. |
| `PENALTY`, `COIN_TOSS`, `HALFTIME` | **Fora do escopo.** O `GameEvent` do motor não os emite; criá-los exigiria engine, protocolo e servidor. |
| GSAP | Descartado. |

Restrições herdadas: `cues.ts` do áudio intocado (campos novos nos passos são aditivos e opcionais); `RESULT_ANIMATION_MS`/`TIMELINE_BUDGET_MS`; identidade GBC; a cena não decide nada, só apresenta o que a timeline manda.

## 4. Campo (Phaser 3.90)

### 4.1 Módulo puro `apps/client/src/phaser/fx.ts`

Sem importar Phaser, no estilo de `choreography.ts`. Uma função decide, a cena aplica:

```ts
fxFor(step: AnimStep, ctx: { reduced: boolean; coarse: boolean }): FxPlan
interface FxPlan { hitStop: number; tilt: number | null; zoom: ZoomPlan | null; burst: BurstPlan | null }
```

| Momento | Fonte | Efeito |
| --- | --- | --- |
| TD | `BANNER` com `moment: 'TD'` | confete (24) + zoom 1,12× na bola, 300 ms |
| Fim de jogo, prorrogação | `BANNER` com `moment: 'END'` | confete leve (12) |
| Troca de posse | `TURNOVER` | estilhaços vermelhos (16) + zoom 1,10× na bola, 200 ms |
| Field goal/PAT bom | `KICK` com `good === true` | faíscas amarelas (10) na bola |
| ×4 no CLASH | `CLASH` com `mult === 4` | estilhaços amarelos (16) no ponto do choque |
| SACK | `SACK` | poeira (12) no QB |

Jogadas comuns: `CLASH` (qualquer) → `hitStop: HIT_STOP_MS` (70); `TACKLE` → `tilt: 12`. Nenhum outro passo gera plano.

`ctx.reduced` devolve sempre o plano vazio. `ctx.coarse` (`(pointer: coarse)`) limita a contagem a 12. Teto absoluto `MAX_PARTICLES = 24`.

### 4.2 Timeline (`apps/client/src/match/timeline.ts`)

- Tipo novo `Moment = 'TD' | 'END'`; o passo `BANNER` ganha `moment?: Moment` (aditivo, opcional). `buildTimeline` marca `TOUCHDOWN` → `'TD'`, `MATCH_END` e `OVERTIME` → `'END'`. Nenhuma comparação de texto.
- `HIT_STOP_MS = 70` exportado. `fitToBudget` passa a usar `TIMELINE_BUDGET_MS - HIT_STOP_MS`: o hit-stop é tempo real somado ao passo, e há no máximo um CLASH por jogada.

### 4.3 Aplicação em `FieldScene.ts`

- **Textura** `fx-spark` (2×2 branca) gerada em `makeTextures`; sem asset novo.
- **Partículas:** `this.add.particles(x, y, 'fx-spark', cfg)` com `emitting: false` e `explode(count)`. O emissor entra em `transient` (destruído por `layout()`) e é destruído também por um `delayedCall(lifespan + 100)`.
- **Âncoras:** `ball` (posição da bola), `clash` (ponto médio da dupla do CLASH, já calculado em `runStep`), `qb`.
- **Câmera:** `zoomTo(scale, ms, 'Sine.easeOut')` e `pan(x, y, ms)` na âncora, com o alvo do pan preso a uma faixa central (`panTarget` em `fx.ts`: ±40 px em x, ±80 px em y) para o banner, que fica no centro do campo, não sair de quadro; `layout()` chama `resetFX()`, `setZoom(1)` e `centerOn(FIELD_WIDTH / 2, FIELD_HEIGHT / 2)`.
- **Hit-stop:** `tweens.timeScale = 0` e `time.timeScale = 0`; retoma com `setTimeout` nativo (o relógio do Phaser está parado) protegido pela `generation`. `layout()` limpa o temporizador e volta ambos a 1.
- **Inclinação:** `tweens.add({ targets: carrier.body, angle: 12, duration: d / 2, yoyo: true })`. Age no `body`, não no `container`, então não briga com o tween de posição.
- `reduced`: `fxFor` já devolve o plano vazio; nada é chamado.

## 5. Eventos que ficam de fora

Sem `PENALTY`, `COIN_TOSS` e `HALFTIME`. Se algum dia o motor passar a emiti-los, entram como novos `AnimStep` aditivos.

## 6. UI (CSS e WAAPI)

Só `transform` e `opacity`, `steps()`, uma vez por evento. O reset global de `app.css` zera `animation`/`transition` em `reduced`, mas **não** zera a WAAPI nem as view transitions; `lib/motion.ts` checa `matchMedia` por conta própria. Toda animação CSS nova fica dentro de `@media (prefers-reduced-motion: no-preference)`.

`apps/client/src/lib/motion.ts` (novo): `reducedMotion()`, `flyFrom(el, fromRect, opts)` (WAAPI; devolve a `Animation` ou `null`; não faz nada sem `Element.animate`), `rememberPick(rect)`/`takePick()` (retângulo da carta escolhida, expira em 60 s e é consumido uma vez) e `useChangeFlash(value, active)`.

| Item | Como |
| --- | --- |
| Barras de stat | `.stat-fill` com `width: 100%` e `transform: scaleX(var(--r))`, `transform-origin: left`; `@keyframes stat-grow` de `scaleX(0)` em `steps(6)`, `animation-delay: calc(var(--i) * 50ms)`. `StatBars` passa `--r` e `--i` e usa `stat:valor` no `key` de cada linha, então a animação repete quando a espécie (e portanto o valor) muda, sem tocar nos pais. |
| Mão de cartas | Entrada `translateY(8px) → 0` + `opacity` em `steps(3)`, `animation-delay: calc(var(--i) * 40ms)`. **Atenção:** o painel da mão remonta a cada turno (`ANIMATING` ↔ `PICK_CARD`), então **todas** as cartas animam a cada turno, não só as novas. Por isso o intervalo é curto (40 ms; ~300 ms no total) e a mão nunca fica bloqueada. |
| Carta jogada | `CardTile.onClick` passa a receber o `DOMRect` do tile (ou `null`); `CardHand` o guarda com `rememberPick`, o que acerta até com cartas repetidas na mão. `RevealBanner` recebe `side` e, ao montar, chama `flyFrom` na carta do próprio jogador (~240 ms, `steps(4)`). Sem retângulo, sem `Element.animate` ou em `reduced`, a carta só aparece. |
| Placar e down & distância | `useChangeFlash` aplica `is-changed` por 600 ms (`steps(2, jump-none)`, como `hud-blink`). **O `RESULT` já grava o `view` final no começo da animação**, então o HUD mostra o placar novo antes do fim da jogada; o piscar só dispara quando `animating` termina (`active = !animating`), para não entregar o resultado antes da hora. |
| Banner por leitura | Classes `reveal-right/neutral/wrong` já existem. Acerto: o símbolo pulsa em `scale` (150 ms). Erro: a carta de ataque desbota em `opacity`. Neutro: sem extra. Texto e símbolo continuam. |

## 7. Transição de telas

A tela é derivada (`screenFor`: estado do servidor + relógio de 200 ms), não de um `setState` controlável; envolver a troca numa view transition causaria risco de laço e atraso. Portanto:

| Origem | Técnica |
| --- | --- |
| HOME ↔ BUILDER (`setLocal`) | `withTransition(update)` em `app/transition.ts`: `document.startViewTransition(() => flushSync(update))` com crossfade em `steps(4)`, 200 ms, via `::view-transition-old/new(root)`. Fallback: roda `update` direto quando falta suporte ou em `reduced`. |
| LOBBY, MATCH, END | Classe `screen-enter` no `<main>` de cada tela (`opacity` + `translateY(6px)` em `steps(3)`, 180 ms). Cada tela monta ao entrar, então não precisa de `key` nem de wrapper. |
| HOME, BUILDER | **Sem** `screen-enter`: a view transition já faz o crossfade, e as duas juntas fariam o fade duas vezes. Sem suporte, a troca é instantânea (a home mantém o `home-drop` do logo). |

## 8. Testes

- `fx.test.ts` (puro): cada momento gera o plano certo; passos comuns não geram burst nem zoom; `reduced` zera; teto 24/12.
- `timeline.test.ts`: `moment` em `TD`/`END`; duração total ≤ `TIMELINE_BUDGET_MS - HIT_STOP_MS` num caso que força `fitToBudget`. `audio-cues.test.ts` passa sem edição.
- `field-scene.test.ts`: o helper de câmera falsa ganha `zoomTo`, `pan`, `resetFX`, `setZoom`, `centerOn`; `particles` entra na `scene.add` falsa; testes de partículas, zoom, hit-stop (`timeScale` 0 e volta a 1, inclusive quando `layout()` interrompe), inclinação e `reduced`.
- DOM: `StatBars` (`--r`, `--i`, `key`), `CardHand`/`CardTile` (`--i`, `onClick` com o retângulo, retângulo guardado), `useChangeFlash` com timers falsos, `RevealBanner` com `Element.animate` simulado (o jsdom não o tem), `motion.test.ts`, `transition.test.ts`.
- CSS: `css-platform`, `contrast` e `form-font-size` seguem passando; um teste novo garante que todo `@keyframes` novo só é usado dentro de `prefers-reduced-motion: no-preference`.
- Manual: `reduced` ligado e desligado; animações a 0,25× no inspetor; viewport de toque; `scripts/layout-audit.js` e `layout-snapshot.js` para provar que as classes novas não mexeram no layout.

## 9. Fora do escopo

`PENALTY`/`COIN_TOSS`/`HALFTIME`; idle e campo vivo contínuos; efeitos no `FIRST_DOWN`; GSAP; novos cues de áudio; mudanças em engine, protocolo ou servidor.

## 10. Riscos

- **Sensação de movimento:** só se julga rodando; checagem manual obrigatória.
- **Hit-stop:** congela dois relógios do Phaser; precisa ser sempre liberado (`layout()` e destruição da cena). Coberto por teste.
- **Particles do Phaser 3.90:** a API `add.particles(x, y, key, config)` é a do 3.60+; as skills locais em `.agents/skills` descrevem o Phaser 4 e não valem como referência literal (ver spec anterior §3.1).
- **View Transitions:** suporte desigual entre navegadores; o fallback instantâneo é obrigatório e testado.
- **Remontagem da mão a cada turno:** controlada pelo intervalo curto da entrada (ver §6).
