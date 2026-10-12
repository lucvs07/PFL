FROM node:24.21.0-alpine3.24 AS build
WORKDIR /app

# Manifestos primeiro: o npm ci só reexecuta quando as dependências mudam.
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/protocol/package.json packages/protocol/
COPY packages/data/package.json packages/data/
COPY packages/sim/package.json packages/sim/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
RUN npm ci

# Sprites em camada própria, antes do código: só baixa de novo quando o script muda (cache do Docker/CI).
# Estrito, como no Pages: se algum sprite falhar, o build falha em vez de gerar uma imagem sem eles.
COPY apps/client/scripts apps/client/scripts
RUN npm run sprites -w @pfl/client

COPY . .
ARG VITE_SERVER_URL=http://localhost:3001
ARG BASE_PATH=/
ENV VITE_SERVER_URL=$VITE_SERVER_URL BASE_PATH=$BASE_PATH
RUN npm run build:client

FROM nginx:1.31.6-alpine3.24
COPY --from=build /app/apps/client/dist /usr/share/nginx/html
EXPOSE 80
