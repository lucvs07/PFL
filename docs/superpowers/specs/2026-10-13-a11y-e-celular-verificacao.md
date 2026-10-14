# Verificação: acessibilidade, conexão e celular (#12 e #14)

Branch `feat/a11y-e-celular`. Spec: `2026-10-13-a11y-e-celular-design.md`. Plano: `../plans/2026-10-13-a11y-e-celular.md`.

## Como foi medido

- **Motor:** Chromium 1208 headless via `playwright-core` 1.58 (Linux), **não Safari/WebKit**. A extensão do Chrome não alcançava o `localhost` desta máquina, então o driver Playwright substituiu a janela redimensionada. Os scripts estão em `a11y-celular-verificacao/tools/` (`mobile.mjs`, `drive.mjs`, `seeded-server.mts`) e as capturas e o `report.json` em `a11y-celular-verificacao/`.
- **Celular emulado:** `isMobile` + `hasTouch` + `deviceScaleFactor: 2`, o que liga `pointer: coarse` e `hover: none`. Viewports **390×800** (retrato) e **844×390** (paisagem).
- **Servidor:** duas instâncias com semente fixa (timers normais e timers rápidos para chegar ao fim de jogo) e um cliente Vite para cada uma.
- **Auditoria:** `apps/client/scripts/layout-audit.js` (rolagem horizontal, alvos de toque < 44 px, contraste renderizado do texto).

## Comprovado em emulador

| Critério | 390×800 | 844×390 |
|---|---|---|
| Fluxo completo (início, montagem nas 5 abas, lobby, partida em formação e mão, fim) utilizável | sim | sim |
| Rolagem horizontal da página | nenhuma | nenhuma |
| Alvos de toque menores que 44 px | 0 | 0 |
| Texto abaixo de AA (4,5:1; 3:1 grande) | 0 | 0 |
| Setas movem o foco entre as opções de formação | sim (índice 0 → 1) | sim |
| Tooltip de carta por toque: 1º toque abre sem jogar; cabe na viewport | sim (folha no pé, 8..382 de 390) | sim (8..836 de 844, topo em 148) |
| "Servidor acordando" (WebSocket nunca abre) | sim, com contador | sim |
| "Reconectando" (rede cortada no meio da partida) | sim | sim |
| "Partida pausada" (adversário sai) | sim | sim |

Nota sobre o método: `screenshot({ fullPage: true })` do Playwright redefine a emulação de toque do contexto (o `hover: none` vira `false`), o que mascarou o tooltip e inflou a contagem de alvos pequenos em paisagem nas primeiras rodadas. As capturas finais usam só a viewport; o produto não tem esse comportamento.

## Desktop idêntico

Baseline numérico (posição, tamanho e fonte de cada elemento) commitado antes de qualquer mudança em `specs/desktop-baseline/` (5 telas × 1041, 1280 e 1920 px = 15 arquivos) e comparado ao final com `apps/client/scripts/diff-snapshots.mjs` (tolerância de 2 px): **15 de 15 sem diferenças**. O diff ignora só dados da partida (largura das barras de jardas, nomes e estatísticas, vitória/derrota) e o wrapper `.top-stack` (altura 0). Mudanças visuais deliberadas no desktop, todas de cor e sem mexer em layout:

- `--gbc-muted` escurece (`#6c6458` → `#5c5448`) e o texto de erro usa `--gbc-red-text` (`#a82018`): AA.
- Estrelas e `.log-effect` usam `--gbc-orange-text` (`#a04010`); texto dos tipos Veneno, Lutador, Fantasma e Dragão passa a ser claro; o número do slot vazio do elenco usa `--gbc-muted`.
- O tooltip de carta no desktop abre por hover ou por foco de teclado (`:focus-visible`), não mais por qualquer foco de clique.

## Precisa de aparelho real

Nada disso foi (nem poderia ser) verificado no emulador:

- hover preso depois do toque (o CSS agora só aplica `:hover` com `(hover: hover) and (pointer: fine)`);
- atraso de toque e sensação do `:active`;
- `safe-area` / notch e barra do navegador (`viewport-fit=cover`, `dvh`);
- teclado virtual (`interactive-widget=resizes-content`, campo do código da sala);
- toque real nos tooltips, rolagem do painel em paisagem e pull-to-refresh;
- Safari/iOS e Firefox Android (o motor testado foi só Chromium).
