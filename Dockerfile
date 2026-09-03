# ── Build frontend ──
FROM node:22-alpine AS frontend-build
WORKDIR /app/player
COPY player/package*.json ./
RUN npm ci
COPY player/ ./
RUN npm run build

# ── Build server ──
FROM node:22-alpine AS server-build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npx tsc

# ── Runtime ──
FROM node:22-alpine
WORKDIR /app

# Copy server
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY --from=server-build /app/server/dist ./dist

# Copy built frontend
COPY --from=frontend-build /app/player/dist ./player/dist

# Copy favicon
COPY player/public/favicon.svg ./player/dist/

RUN mkdir -p /data

EXPOSE 4321

ENV PORT=4321
ENV DB_PATH=/data/companion.db

# No USER directive — need root for SSDP multicast (Sonos discovery)
# In Docker, use --network host for Sonos support

CMD ["node", "dist/server.js"]
