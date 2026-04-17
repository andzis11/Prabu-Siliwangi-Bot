# Kabayan Bot Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY apps/kabayan-bot/package*.json ./apps/kabayan-bot/

RUN npm ci --workspace=@prabu/kabayan-bot --if-present

# Copy source code
COPY apps/kabayan-bot/src ./apps/kabayan-bot/src
COPY packages ./packages
COPY scripts ./scripts
COPY services ./services

# Build
RUN npm run build --workspace=@prabu/kabayan-bot --if-present

# Create non-root user
RUN addgroup -g 1001 -S appuser && adduser -S appuser -u 1001
USER appuser

EXPOSE 3000

CMD ["node", "apps/kabayan-bot/dist/index.js"]
