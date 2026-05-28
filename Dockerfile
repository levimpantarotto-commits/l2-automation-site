FROM node:22-alpine

WORKDIR /app

# better-sqlite3 + node-gyp precisam de build tools nativos. Removidas após build.
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && ln -sf python3 /usr/bin/python

# 1) Backend deps
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

# 2) Dashboard React deps (inclui devDeps pq precisa do Vite pra build)
COPY dashboard/package.json dashboard/package-lock.json* ./dashboard/
RUN cd dashboard && npm install --include=dev --no-audit --no-fund

# 3) Código todo
COPY . .

# 4) Build dashboard → output em public/admin/
RUN cd dashboard && npm run build && rm -rf node_modules

# 5) Limpa build deps
RUN apk del .build-deps

RUN mkdir -p /data
ENV DB_PATH=/data/l2.db
ENV NODE_ENV=production
ENV PORT=3004
ENV NODE_OPTIONS="--max-old-space-size=448"

EXPOSE 3004
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3004/api/saude || exit 1

CMD ["node", "server.js"]
