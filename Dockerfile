FROM node:22-alpine

WORKDIR /app

# better-sqlite3 precisa de build tools nativos (gyp + Python). Removidas após build pra imagem menor.
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && ln -sf python3 /usr/bin/python

# Instala deps
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

# Copia código
COPY . .

# Remove build deps
RUN apk del .build-deps

# Volume persistente pro SQLite + logs
RUN mkdir -p /data
ENV DB_PATH=/data/l2.db
ENV NODE_ENV=production
ENV PORT=3004

# Limita memória do Node pra ~512MB (VPS apertada)
ENV NODE_OPTIONS="--max-old-space-size=448"

EXPOSE 3004

VOLUME ["/data"]

# Healthcheck pro Coolify detectar app travado
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3004/api/saude || exit 1

CMD ["node", "server.js"]
