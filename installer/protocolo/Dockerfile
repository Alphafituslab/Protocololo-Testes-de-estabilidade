# ── Stage 1: Build ────────────────────────────────────────────────────────────
  FROM node:20-alpine AS builder
  RUN npm install -g pnpm@9
  WORKDIR /app
  COPY . .
  RUN pnpm install --frozen-lockfile
  RUN pnpm run typecheck:libs
  RUN pnpm --filter @workspace/api-server run build
  RUN pnpm --filter @workspace/protocolo-estabilidade run build

  # ── Stage 2: Production ───────────────────────────────────────────────────────
  FROM node:20-alpine AS production
  RUN apk add --no-cache wget
  WORKDIR /app
  COPY --from=builder /app/artifacts/api-server/dist          ./dist
  COPY --from=builder /app/artifacts/api-server/package.json  ./package.json
  RUN npm install --production --silent
  COPY --from=builder /app/artifacts/protocolo-estabilidade/dist ./frontend
  ENV NODE_ENV=production
  ENV PORT=8080
  EXPOSE 8080
  HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://localhost:8080/api/healthz || exit 1
  CMD ["node", "--enable-source-maps", "dist/index.mjs"]
  