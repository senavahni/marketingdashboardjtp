# Build context: root project  →  docker build -f frontend/Dockerfile .
FROM node:24-bookworm-slim AS build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
# Variabel VITE_* di-bake saat build (lihat .env.example)
ARG VITE_API_URL=/api/v1
ARG VITE_WS_PATH=/socket.io
ARG VITE_APP_ENV=docker
ARG VITE_FEATURE_AI_PROMPT_BLOCK=false
ENV VITE_API_URL=$VITE_API_URL VITE_WS_PATH=$VITE_WS_PATH VITE_APP_ENV=$VITE_APP_ENV VITE_FEATURE_AI_PROMPT_BLOCK=$VITE_FEATURE_AI_PROMPT_BLOCK
RUN npm run build

FROM nginx:1.29-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost/ >/dev/null || exit 1
