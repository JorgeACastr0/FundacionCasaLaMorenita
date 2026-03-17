# ══════════════════════════════════════════════════════════════════
#  Dockerfile — API Node.js  (multi-stage para imagen mínima)
#  Fundación Hogar La Morenita
# ══════════════════════════════════════════════════════════════════

# ── Stage 1: Build ─────────────────────────────────────────────
FROM node:20-alpine AS builder

# Herramientas para compilar better-sqlite3 (módulo nativo C++)
RUN apk add --no-cache python3 make g++

WORKDIR /build

# Instalar dependencias primero (aprovecha caché de capas Docker)
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev

# ── Stage 2: Runtime ───────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Solo copiamos node_modules ya compilados y el código fuente
COPY --from=builder /build/node_modules ./node_modules
COPY api/ .

# Directorios de datos (serán sobreescritos por bind mounts en prod)
RUN mkdir -p /app/db /public/uploads/gallery /public/cache

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
