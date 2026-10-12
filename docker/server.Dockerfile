FROM node:24-alpine
WORKDIR /app
COPY . .
# só o servidor, suas dependências de workspace (engine, protocol) e o tsx da raiz
RUN npm ci -w @pfl/server --include-workspace-root
ENV PORT=3001
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1
CMD ["npx", "tsx", "apps/server/src/main.ts"]
