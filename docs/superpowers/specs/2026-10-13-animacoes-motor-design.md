# Animações dirigidas pelos eventos do motor (issue #11, épico D2)

> **Data:** 2026-10-13. **Issue:** [#11](https://github.com/lucvs07/PFL/issues/11). **Origem:** seção D2 de `docs/superpowers/specs/2026-10-12-pfl-proximos-passos-issues.md` (esse arquivo está na `main`, não nesta branch).
> **Base:** `feat/som-e-musica-8bit`. **Branch de trabalho:** `feat/animacoes-motor`. **Só cliente:** sem mudanças em engine, protocolo ou servidor.

## 1. Objetivo

Trocar os tweens genéricos do `FieldScene` por coreografias distintas por categoria de carta, mostrar a efetividade de tipo no CLASH com intensidade proporcional e dar destaque à revelação das cartas e da leitura. Tudo respeitando `prefers-reduced-motion` e sem atrasar a próxima fase.

## 2. Critérios de aceite (da issue)

1. Animação distinta por categoria: corrida por dentro/fora, passe curto/longo, screen, play-action, blitz.
2. Efeito visual de efetividade no CLASH: 4x, 2x, ½x (e ¼x), 0x.
3. Destaque da revelação das cartas e do resultado da leitura (✔/·/✖).
4. Respeita `prefers-reduced-motion` e não bloqueia a próxima fase.

## 3. Restrições

- A animação cabe em `TIMELINE_BUDGET_MS` (`RESULT_ANIMATION_MS - 500` = 4000 ms). `fitToBudget` continua sendo a garantia.
- O áudio (`audio/cues.ts`) lê `at` e `kind` dos passos. **Fica intocado**: nenhum cue novo, nenhuma mudança em `cuesFor`. Os novos campos nos passos são aditivos e o `switch` de `cueForStep` continua exaustivo.
- Identidade GBC pixel: Press Start 2P, paleta `--gbc-*`, `steps()` no DOM. Fora: blur, glassmorphism, curvas de "agência".
- A cena não decide nada; só apresenta o que a timeline manda (comentário de classe do `FieldScene`).

## 3.1 Skills de Phaser (locais, em `.agents/skills`)

Elas descrevem o **Phaser 4**; o cliente usa **`phaser ^3.90.0`**. Valem como referência de conceito e de API comum às duas versões. Regra do plano: só usar API que exista no 3.90.

| Skill | Uso nesta issue |
| --- | --- |
| `tweens` | `tweens.add`, `chain` (finta do play-action: handoff e depois passe), `addCounter` (progresso 0→1 para arcos), `stagger` (defensores do blitz), `yoyo`, `persist` |
| `curves-and-paths` | `Curves.QuadraticBezier` e `getPoint(t)` para o arco do passe longo e da corrida por fora, dirigido por `addCounter` (sem `PathFollower`, que roda o sprite) |
| `cameras` | `shake` e `flash` do CLASH, escalados pelo multiplicador |
| `time-and-timers` | `delayedCall` do agendamento por `at`; cancelamento já feito por `layout()` |
| `game-object-components` | `setTint`/`clearTint`, `alpha`, `setScale` no sprite do jogador |
| `groups-and-containers` | `Container` não aceita tint; ver §6 |
| `graphics-and-shapes`, `particles` | consultadas; nenhuma partícula é usada (ver rejeitados) |
| `v3-to-v4-migration`, `v4-new-features` | só para não usar API exclusiva do v4: `setTintMode`, `Filters`, `tintMode` |

## 4. Triagem das skills de movimento

Aplicada a `find-animation-opportunities`. Todo movimento nomeia um propósito e cabe no orçamento. A jogada se repete dezenas de vezes por partida, então o movimento é curto e sem bounce.

| # | Onde | Propósito | Frequência | Movimento |
| --- | --- | --- | --- | --- |
| 1 | Corrida por dentro/fora (`RUN`) | Explicação da jogada (qual carta foi usada) | Dezenas/partida | Dentro: investida reta com tremor de 1–2 px nas linhas. Fora: arco lateral. Usa `Cubic.easeOut` |
| 2 | Passes, screen, play-action (`THROW`) | Estado: distingue o tipo de passe | Dezenas/partida | Curto: reta. Longo: arco com sombra da bola no chão. Screen: QB recua, bola sai curta. Play-action: finta de handoff antes do passe |
| 3 | Blitz (`BLOCK`/`SACK`) | Estado: pressão na defesa | Dezenas/partida | Defensores cruzam a linha em vez do recuo padrão do bloqueio |
| 4 | Efetividade no CLASH | Feedback do resultado do tipo | Dezenas/partida | Intensidade do flash/shake escala com o multiplicador (ver §6) |
| 5 | Revelação das cartas (DOM) | Prevenir mudança brusca | Dezenas/partida | Entrada em `steps(3)` de 150–240 ms; as duas cartas entram juntas |
| 6 | Resultado da leitura (DOM) | Feedback | Dezenas/partida | "Carimbo" ✔/·/✖ com cor e símbolo, 150 ms, sem bounce |

**Rejeitados**
- Partículas (poeira, faíscas): decoração; o flash e o shake já carregam o feedback e partículas custariam GPU no celular.
- Animação contínua da bola ou dos sprites parados: decoração em tela funcional, sem propósito.
- Confete ou shake no `FIRST_DOWN`: ocorre muitas vezes por partida; o banner atual basta.
- Bounce/overshoot no carimbo da leitura: o jogador está decidindo e lendo; só atrasaria.
- `animate-expo`: é React Native; o cliente é web.

## 5. Mudanças no modelo da timeline (`apps/client/src/match/timeline.ts`)

Hoje `RUN` e `CLASH` não sabem a categoria. A mudança é aditiva:

- Novo tipo `PlayCategory` com as seis categorias ofensivas do motor e `BLITZ` (da carta de defesa vinda em `CARDS`). `buildTimeline` lê `defense` do evento `CARDS` e guarda a categoria da carta de defesa ao lado da ofensiva.
- Passos `SNAP`, `BLOCK`, `CLASH`, `RUN` e `THROW` ganham `category: PlayCategory`. `BLOCK` e `SACK` ganham `blitz: boolean`.
- `CLASH` troca `effect: TypeEffect | null` por `effect` com `mult: 4 | 2 | 1 | 0.5 | 0.25 | 0 | null`, mantendo `TypeEffect` como categoria derivada. `typeEffect` em `effect.ts` passa a devolver os dois (`{ effect, mult }`), usando a média já calculada.
- As durações em `D` continuam as mesmas; coreografias novas vivem dentro delas. `fitToBudget` segue sem mudança.

## 6. Coreografias no `FieldScene`

O `switch` de `runStep` vira um mapa `kind → função`; quando o passo tem categoria, a função consulta uma tabela de coreografias em um módulo novo, `apps/client/src/phaser/choreography.ts`. `PlayerSprite` passa a guardar `body` (o `Image` ou `Circle` interno), porque o jogador é um `Container` e `Container` não tem tint: o cinza do ½x/¼x e o "atravessa" do 0x atuam em `body`. Cada coreografia recebe uma interface mínima da cena (`tweens`, `time`, `cameras`, os sprites que ela precisa) e é testável com a cena falsa do `field-scene.test.ts`.

**Efetividade no CLASH**

| Mult | Visual | Texto |
| --- | --- | --- |
| 4 | flash amarelo forte + shake 0.008 + texto 14 px | É super efetivo! (×4) |
| 2 | flash amarelo + shake 0.004 | É super efetivo! |
| 1 | shake 0.002, sem texto | — |
| ½ / ¼ | `body` do atacante em cinza (`setTint(0x888888)`, depois `clearTint()`) por um instante, sem shake | Não é muito efetivo... |
| 0 | atacante "atravessa": alpha cai e volta; sem shake | Não teve efeito... |

O texto continua em todos os casos de efeito, para a leitura não depender só de cor.

**Reduced motion** (`reduced` já existe na cena): sai o movimento e entram trocas de cor/alpha. Concretamente: posições mudam sem tween, mas o tint do CLASH, o texto de efetividade e o carimbo da leitura continuam. Nada de `shake` nem `flash`. A diferença para hoje é que o `d = 0` deixava os efeitos de cor pulados; agora a informação sobrevive.

**Não bloqueia**: coreografias só agendam via `time.delayedCall`/`tweens` já cancelados por `layout()` (que faz `removeAllEvents` e `killAll`). Nenhuma delas espera um callback para liberar a fase.

## 7. Revelação e leitura (DOM)

`RevealBanner.tsx` e `match.css`:
- `reveal-drop` passa de `240ms steps(3, end)` para a mesma duração com as duas cartas entrando juntas (já é assim) e o carimbo da leitura entrando 150 ms depois, via `animation-delay`. Só `transform` e `opacity`.
- A leitura ganha classes por resultado com cor da paleta (`--read-right`, `--read-neutral`, `--read-wrong`, já existentes em `tokens.css`).
- Dentro de `@media (prefers-reduced-motion: reduce)` o carimbo aparece sem deslocamento (só `opacity`). O reset global de `app.css` já zera `animation`, então a regra da leitura sobrescreve com `animation: none` e mantém a cor.

## 8. Testes

- `timeline.test.ts`: cada categoria produz o `category` certo nos passos; blitz marca `BLOCK`/`SACK`; os seis valores de `mult`; a duração total continua `≤ TIMELINE_BUDGET_MS`.
- `field-scene.test.ts`: cada coreografia chama os tweens esperados (alvos e propriedades), e em modo `reduced` não chama `shake`/`flash`.
- `audio-cues.test.ts`: continua passando sem alteração (prova de que o áudio não foi tocado).
- Teste DOM do `RevealBanner`: classe de leitura certa por resultado.
- Verificação manual: partida local com os dois lados, `prefers-reduced-motion` ligado e desligado, e a animação a 0,25× no inspetor de animações do navegador.

## 9. Fora do escopo

Cues de áudio novos; mudanças no engine, protocolo ou servidor; polimento mobile (D3); replay compartilhável (D4); acessibilidade ampla (D5).

## 10. Riscos

- **Crescimento do `AnimStep`:** mitigado por campos aditivos e pelo `switch` exaustivo, que o compilador cobra.
- **Orçamento de 4000 ms:** coreografias mais ricas podem forçar `fitToBudget` a comprimir demais. O teste de duração máxima cobre os piores casos (passe longo com blitz e TD).
- **Sensação de movimento:** não dá para julgar só pelo código. Registrado como checagem manual.
