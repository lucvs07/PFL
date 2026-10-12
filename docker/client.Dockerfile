FROM node:24-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci
ARG VITE_SERVER_URL=http://localhost:3001
ARG BASE_PATH=/
ENV VITE_SERVER_URL=$VITE_SERVER_URL BASE_PATH=$BASE_PATH
RUN npm run build:client

FROM nginx:alpine
COPY --from=build /app/apps/client/dist /usr/share/nginx/html
EXPOSE 80
