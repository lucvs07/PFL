# Acessibilidade, estados de conexão e polimento para celular — design

Issues #14 (épico D5) e #12 (épico D3) da spec `2026-10-12-pfl-proximos-passos-issues.md`, entregues em **uma branch** (`feat/a11y-e-celular`, base `feat/animacoes-motor`, topo da pilha #8 → #15 → #17) e **um PR**, com commits separados por camada.

## Objetivo e critérios de aceite

**#14 Acessibilidade e feedback de estado de conexão**
- Navegação por teclado nas escolhas de formação, pacote e carta.
- Contraste mínimo AA.
- Estados de conexão visíveis: reconectando, pausado e servidor acordando no Render.

**#12 Polimento para celular**
- Fluxo completo (início, montagem, lobby, partida, fim) utilizável em 390×800 e em paisagem.
- Alvos de toque ≥ 44 px, sem rolagem horizontal; tooltips de carta acessíveis por toque.
- Verificado em ao menos um navegador móvel real ou emulado.

## Fora de escopo

- Mudanças no servidor ou no protocolo.
- Redesenho visual: `apps/client/src/styles/tokens.css` e o estilo GBC continuam sendo a autoridade. Ajustes de cor só onde o contraste AA exigir.
- Novas telas ou fluxos.

## Guia de design

Skills usadas na execução: `impeccable`, `design-taste-frontend` (só as regras transversais: estados completos, contraste AA, `prefers-reduced-motion`, alvos de toque, sem cópia genérica), `frontend-design` e `mobile-native` (local, em `.agents/skills/mobile-native`, camada de plataforma: viewport, toque, scroll, safe-area).

## Arquitetura: fundação → varredura → verificação

### 1. Fundação (compartilhada pelas telas)

**Mobile-first de verdade.** O CSS atual é desktop-first (17 blocos `@media (max-width)` em 8 arquivos). Em cada arquivo o estilo-base passa a ser o do celular e o desktop é acrescentado com `@media (min-width: 720px)` e `(min-width: 1040px)` (pontos que já existem no código). Os blocos `max-width` são removidos, não somados. Paisagem de celular é tratada por `(orientation: landscape) and (max-height: 500px)`, não por largura.

**Tokens e foco** (`styles/tokens.css`, `styles/app.css`)
- `--hit-min: 44px` aplicado a todo elemento interativo (botões, abas, opções, cartas, controles de áudio).
- `:focus-visible` global, com contorno de alto contraste que funcione sobre os fundos GBC e sobre o campo Phaser.
- Contraste medido nos tokens atuais: reprovam `--gbc-muted` sobre `--gbc-panel` (4,42:1), `--gbc-red` como texto sobre `--gbc-panel` (3,85:1) e sobre o fundo `--gbc-green-3` (2,32:1) e `--gbc-muted` sobre `--gbc-green-3` (2,66:1). Correção: `--gbc-muted` escurece para `#5c5448`; texto vermelho passa a usar o novo `--gbc-red-text: #a82018` (o `--gbc-red` continua sendo cor de lado/preenchimento); texto direto sobre o fundo verde da página só em `--gbc-ink`.

**Camada de plataforma** (`index.html`, `styles/app.css`; regras da skill `mobile-native`)

Estado atual medido no cliente: 11 regras `:hover` sem `@media (hover: hover)`; `min-height: 100vh` em `app.css:51`; `index.html` sem `viewport-fit=cover` (então o `env(safe-area-inset-*)` já usado em `audio.css` vale sempre `0px`); nenhum `touch-action` nem supressão do tap-highlight.

- **Viewport:** `viewport-fit=cover` e `interactive-widget=resizes-content`. Nunca `user-scalable=no` nem `maximum-scale=1`.
- **Hover preso após o toque:** todo `:hover` passa para dentro de `@media (hover: hover) and (pointer: fine)`; o feedback de toque vem de `:active` (100–160 ms, `ease-out`, curva já usada pelo projeto).
- **Flash no toque:** `-webkit-tap-highlight-color: transparent` em `html`, junto com `:active` em todo elemento tocável.
- **Altura:** `100vh` do shell vira `100dvh`; o campo Phaser já usa `dvh`.
- **Zoom no foco (iOS):** `input, textarea, select` com 16 px mínimo (o código da sala e o campo de importação do time). Código da sala com `inputmode`/`autocapitalize="characters"`/`autocorrect="off"`.
- **Toque rápido:** `touch-action: manipulation` em botões, links e `[role=button]`.
- **Scroll:** `overscroll-behavior: none` em `html, body` (o jogo não é documento rolável); `contain` nas listas internas (pokédex, narração, elenco).
- **Seleção de texto:** `user-select: none` só em controles (botões, abas, cartas), nunca em `body`; o texto de erro e o código do time continuam selecionáveis.
- **Safe-area:** `env(safe-area-inset-*)` com fallback `0px` em HUD, barra fixa de vez/tempo/orçamento e controle de áudio.
- **`theme-color`:** o jogo é de um só esquema (GBC), então um único `theme-color`, conferido com a cor do topo da página.
- **Hardware:** a skill é explícita de que o emulador não reproduz hover preso, atraso de toque, safe-area nem teclado virtual. Por isso a verificação relata separadamente o que foi comprovado em emulador e o que **precisa de aparelho real**, em vez de declarar tudo resolvido.

**Estado de conexão** (`net/connectionState.ts`, função pura, testada em unidade)
- Entrada: `socket.connected`, se já houve conexão antes (`everConnected`), tempo desde a primeira tentativa, `room.status`, presença do adversário, prazo de tolerância.
- Saída, uma das opções:
  - `ok`;
  - `waking`: nenhuma conexão inicial após ~4 s; mostra "Servidor acordando, pode levar até 1 min" com contagem;
  - `reconnecting`: conexão perdida depois de já ter conectado;
  - `paused`: sala pausada ou adversário desconectado, com a contagem de `RECONNECT_GRACE_MS`.
- Prioridade quando mais de um vale: `waking` e `reconnecting` (meu lado) antes de `paused` (lado do adversário).
- Ping em `/health` ao abrir o app (`fetch` com `mode: 'no-cors'`, porque o handler do servidor não envia cabeçalhos CORS; a resposta opaca basta para aquecer o Render e a rejeição só significa "ainda dormindo"). Só reforça a mensagem de "acordando": o **socket é a fonte de verdade** e o ping nunca decide o estado sozinho. Sem mudança no servidor.
- `components/ConnectionBanner.tsx` renderiza o estado: `role="status"`, `aria-live="polite"`, `prefers-reduced-motion` respeitado. Substitui o aviso ad hoc de `MatchScreen` (`Adversário desconectado...`) e aparece em todas as telas, não só na partida.

**Tooltip de carta acessível por toque** (`components/CardTile.tsx`, `ui.css`)
- Hoje o tooltip só abre em `:hover`/`:focus-within`.
- Em ponteiro de toque (`(hover: none)`): primeiro toque abre o tooltip, segundo toque executa a ação, `Esc` ou toque fora fecha.
- Cartas desabilitadas continuam focáveis (`aria-disabled`) para o tooltip explicar o motivo.
- Posicionamento do tooltip revisado para nunca sair da viewport de 390 px.

**Navegação por teclado** (hook `useArrowNav`, em `app/`)
- As escolhas de formação, pacote, carta e conversão já são `<button>` nativos: Tab, Enter e Espaço funcionam. Cada clique **envia uma jogada**, então não são `radio` e não ganham `role="radiogroup"`.
- O contêiner de cada grupo vira `role="group"` com `aria-label` e o hook `useArrowNav` adiciona setas (em grade: ←/→ na linha, ↑/↓ entre linhas), `Home`/`End`, pulando itens desabilitados. Não há tabindex móvel: Tab continua passando por todos os botões, as setas são um atalho.
- Cartas não jogáveis passam de `disabled` para `aria-disabled="true"` (continuam focáveis, para o tooltip explicar o motivo) e o clique é ignorado em código.
- Foco visível: já existe `:focus-visible` global (`app.css`); só é ajustado onde não cobre (campo Phaser, abas).

### 2. Varredura por tela

Para cada tela, na ordem do fluxo: aplicar a fundação, corrigir overflow e alvos, definir o layout em retrato (390×800) e em paisagem (~800×390).

| Tela | Pontos principais |
|---|---|
| Início (`HomeScreen`) | campos e botões ≥ 44 px, teclado completo, estados `waking`/`reconnecting` ao criar/entrar na sala |
| Montagem (`BuilderScreen`, `Pokedex`, `RosterPanel`, `DeckEditor`) | abas no celular, escolha de formação/pacote por teclado, remover do elenco com alvo ≥ 44 px |
| Lobby (`LobbyScreen`) | opções de time e prontidão por teclado, prévia do adversário sem overflow |
| Partida (`MatchScreen`, `CardHand`, `LineupPicker`, `ConversionPicker`, `DepthPanel`) | HUD compacto em paisagem, mão de cartas com tooltip por toque, campo Phaser redimensionando sem cortar |
| Fim (`EndScreen`, `ReplayViewer`) | tabela de estatísticas sem rolagem horizontal, controles do replay ≥ 44 px |

Regras gerais: `viewport-fit=cover` com padding de safe-area, `dvh` no lugar de `100vh`, `overflow-x` auditado.

### 3. Verificação

- **Contraste:** script `scripts/check-contrast.mjs` calcula as razões dos pares texto/fundo definidos nos tokens e falha abaixo de 4,5:1 (3:1 para texto grande e componentes de UI). Entra no `npm test` do cliente ou como passo de CI.
- **Testes de unidade:** `connectionState` (todas as transições e prioridades), `useArrowNav` (setas em grade, Home/End, pulo de desabilitados), lógica de duplo toque do tooltip.
- **Viewport:** execução em navegador emulado (390×800 retrato e ~800×390 paisagem) com captura de tela por tela do fluxo; verificação automática de `scrollWidth <= clientWidth` e de tamanho mínimo dos alvos interativos. O resultado (capturas e checagens) é anexado ao PR. Se possível, uma passada em dispositivo real.
- **Regressão:** `npm test` e `npm run typecheck` verdes a cada commit.

## Plano de commits (um PR)

1. `feat(client/mobile)`: camada de plataforma (viewport, hover condicionado, tap-highlight, `dvh`, `touch-action`, overscroll, inputs de 16 px).
2. `feat(client/a11y)`: tokens de alvo de toque, `:focus-visible` global e ajustes de contraste nos tokens + script de contraste.
3. `feat(client/net)`: `connectionState`, ping em `/health` e `ConnectionBanner` (substitui o aviso da partida).
4. `feat(client/a11y)`: `useArrowNav` e navegação por teclado em formação, pacote, carta e conversão.
5. `feat(client/mobile)`: tooltip de carta por toque e posicionamento seguro.
6. `feat(client/mobile)`: varredura por tela (início, montagem, lobby, partida, fim) em retrato e paisagem; sem repetir a camada de plataforma.
7. `test(client)`: verificação em viewport emulado (overflow e alvos) e documentação do resultado.

Cada commit termina com a suíte e o typecheck verdes.

## Riscos

- **Conflitos com a pilha:** a branch parte do topo (#17); #8, #15 e #17 mexem em `MatchScreen` e CSS. O PR novo só deve entrar depois deles; rebase se algum mudar.
- **Contraste vs. identidade:** a paleta GBC pode reprovar em alguns pares (ex.: `--gbc-muted` sobre `--gbc-panel`). Ajustar o token mais próximo preservando o tom, e registrar cada mudança no commit.
- **Phaser em telas pequenas:** o campo é canvas; o redimensionamento e o toque nele precisam ser conferidos no emulador, não só no CSS.
- **`/health` e CORS:** o servidor não envia CORS em `/health`; por isso o ping usa `mode: 'no-cors'` e nunca lê a resposta. Se falhar, o estado `waking` continua funcionando pelo socket.
