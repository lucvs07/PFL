FROM node:24-alpine AS build
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

COPY . .
ARG VITE_SERVER_URL=http://localhost:3001
ARG BASE_PATH=/
ENV VITE_SERVER_URL=$VITE_SERVER_URL BASE_PATH=$BASE_PATH
RUN npm run build:client

FROM nginx:alpine
COPY --from=build /app/apps/client/dist /usr/share/nginx/html
EXPOSE 80
