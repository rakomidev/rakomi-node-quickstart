# Rakomi Node/Express quickstart — multi-stage Docker build.
#
# Build context: this directory. Multi-stage build: deps → build → runtime.
#
# Usage:
#   docker build -t rakomi-node-quickstart .
#   docker run --rm -p 3000:3000 --env-file .env rakomi-node-quickstart

# ── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# `npm install` (not `ci`) — a fresh extraction has no lockfile yet; once the public repo commits
# one, this naturally becomes a fast, reproducible `npm ci`.
RUN npm install --omit=dev --ignore-scripts && cp -R node_modules /prod_node_modules
RUN npm install --ignore-scripts

# ── Stage 2: build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Stage 3: runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Non-root user — never run the server as root.
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 quickstart

COPY --from=deps --chown=1001:1001 /prod_node_modules ./node_modules
COPY --from=build --chown=1001:1001 /app/dist ./dist
COPY --chown=1001:1001 package.json ./package.json

# No secret is ever COPYed or ARG/ENV-baked into this (or any) layer — every credential
# (RAKOMI_API_KEY, RAKOMI_CLIENT_SECRET) is supplied at `docker run` time via --env-file/-e,
# read only from process.env at boot (see src/config.ts) and never written to disk.
USER 1001
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
