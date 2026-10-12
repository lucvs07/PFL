# Deploy da v1 (Render + GitHub Pages)

Servidor no Render (plano grátis) e cliente no GitHub Pages. Passos manuais, uma vez só:

## 1. Servidor no Render
1. Em render.com, **New → Blueprint** e aponte para este repositório (lê o `render.yaml`).
2. Aguarde o primeiro deploy e copie a URL pública (algo como `https://pfl-server.onrender.com`).
3. Confira `<URL>/health` → `ok`.

## 2. Cliente no GitHub Pages
1. No repositório: **Settings → Pages → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables → New repository variable**:
   `VITE_SERVER_URL` = a URL do Render (sem barra final).
3. O workflow **Pages** roda sozinho depois que o CI de um push na `main` passa (o Render também espera os checks). Para publicar na hora, use Actions → Pages → Run workflow.
4. O jogo abre em `https://lucvs07.github.io/PFL/`.

## O que bloqueia o deploy
- CI vermelho na `main` (testes, typecheck, build, imagens ou gate): nem o Render nem o Pages publicam.
- `VITE_SERVER_URL` ausente ou algum sprite que não baixou: o workflow Pages falha com mensagem clara, sem publicar um site quebrado. Rode de novo.

## Limites do plano grátis
- O servidor dorme após ~15 min sem tráfego; o primeiro acesso depois disso leva ~1 min (cold start). Abra a página e aguarde antes de chamar os amigos.
- Reiniciar ou dormir derruba as partidas em andamento (ficam só em memória).
- Confira os termos atuais do Render na página oficial; eles mudam.

## Se o cliente não conectar
- `CORS_ORIGIN` (no `render.yaml`/painel) precisa apontar para a origem do Pages: `https://lucvs07.github.io`. O servidor normaliza o valor (maiúsculas, porta padrão e caminho não atrapalham) e mostra no log de inicialização as origens aceitas; um valor que não é URL impede o servidor de subir. Origens diferentes são recusadas no handshake do WebSocket.
- Abra o console do navegador: se o cliente tentar conectar em `http://localhost:3001` (com bloqueio de conteúdo misto no https), a variável `VITE_SERVER_URL` não estava definida no build.
- `VITE_SERVER_URL` é lida no **build**: depois de mudá-la, rode o workflow Pages de novo.
