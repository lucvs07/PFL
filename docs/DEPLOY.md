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
3. Rode o workflow **Pages** (Actions → Pages → Run workflow) ou faça push na `main`.
4. O jogo abre em `https://lucvs07.github.io/PFL/`.

## Limites do plano grátis
- O servidor dorme após ~15 min sem tráfego; o primeiro acesso depois disso leva ~1 min (cold start). Abra a página e aguarde antes de chamar os amigos.
- Reiniciar ou dormir derruba as partidas em andamento (ficam só em memória).
- Confira os termos atuais do Render na página oficial; eles mudam.

## Se o cliente não conectar
- `CORS_ORIGIN` (no `render.yaml`/painel) precisa ser exatamente a origem do Pages, sem caminho: `https://lucvs07.github.io`.
- `VITE_SERVER_URL` é lida no **build**: depois de mudá-la, rode o workflow Pages de novo.
