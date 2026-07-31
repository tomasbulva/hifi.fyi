FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 4321
USER node
# Host network is required for SSDP/UPnP discovery of Sonos speakers
# Use: docker run --network host ...
CMD ["node", "server.js"]
