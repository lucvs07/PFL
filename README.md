# PFL — Pokémon Football League

<!-- portfolio:pt -->
Jogo de estratégia tática por turnos, 1x1 ao vivo, que mistura futebol americano, cartas e os 151 Pokémon da 1ª geração. Motor de regras, servidor Socket.IO e cliente React + Phaser.
<!-- /portfolio:pt -->

Jogo de estratégia tática por turnos, JxJ ao vivo, que mistura futebol americano com cartas e os 151 Pokémon da 1ª geração. Dois jogadores montam times 7v7 e, em cada jogada, ataque e defesa escolhem cartas às cegas e ao mesmo tempo; o playbook de cada time vem do elenco escalado. Projeto pessoal, para jogar com amigos.

## Estrutura
- `packages/engine` — regras e simulação da partida
- `packages/protocol` — tipos e códigos de time compartilhados
- `packages/data`, `packages/sim` — dados dos Pokémon e simulador de balanceamento
- `apps/server` — servidor Socket.IO (salas e partidas)
- `apps/client` — cliente React + Phaser (Vite)

## Requisitos
Node 24+ e npm, ou apenas Docker.

## Rodar com Docker
```bash
docker compose up --build
```
Jogo em http://localhost:8080 (servidor em :3001, com `GET /health`).

## Rodar sem Docker
```bash
npm ci
npm run dev:server   # :3001
npm run dev:client   # :5173 (baixa os sprites e os GIFs animados da Pokédex antes; sem rede segue com fallback)
```
Duas abas abertas simulam dois jogadores.

## Testes
```bash
npm test             # unitários e integração
npm run test:gate    # portão de balanceamento (lento)
npm run typecheck
npm run sim          # simulador de balanceamento (CLI)
```

## Variáveis
| Variável | Onde | Padrão |
|---|---|---|
| `PORT` | servidor | 3001 |
| `CORS_ORIGIN` | servidor (origens separadas por vírgula) | qualquer origem |
| `VITE_SERVER_URL` | build do cliente | http://localhost:3001 |
| `BASE_PATH` | build do cliente | `/` |

## CI e deploy
O CI (`.github/workflows/ci.yml`) roda typecheck, testes, build e as imagens Docker em todo PR; o gate roda em push na `main`, e só com o CI verde o Render e o GitHub Pages publicam. A publicação (Render + GitHub Pages) está em [docs/DEPLOY.md](docs/DEPLOY.md).
