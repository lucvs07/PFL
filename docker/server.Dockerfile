FROM node:24.21.0-alpine3.24
WORKDIR /app

# Manifestos primeiro: o npm ci só reexecuta quando as dependências mudam.
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/protocol/package.json packages/protocol/
COPY packages/data/package.json packages/data/
COPY packages/sim/package.json packages/sim/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
# Só o servidor e suas dependências de workspace; o tsx (a mesma versão da raiz) vai global.
RUN npm ci -w @pfl/server --omit=dev \
 && npm i -g "tsx@$(node -p "require('./package.json').devDependencies.tsx.replace('^','')")" \
 && npm cache clean --force

# Só o código que o servidor usa: mudanças no sim/data não invalidam esta camada.
COPY packages/engine packages/engine
COPY packages/protocol packages/protocol
COPY apps/server apps/server

ENV PORT=3001
EXPOSE 3001
USER node
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1
CMD ["tsx", "apps/server/src/main.ts"]
