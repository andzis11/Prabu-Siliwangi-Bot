# Prabu Siliwangi Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY apps/prabu-siliwangi/package*.json ./apps/prabu-siliwangi/

RUN npm ci --workspace=@prabu/prabu-siliwangi --if-present

# Copy source code
COPY apps/prabu-siliwangi/src ./apps/prabu-siliwangi/src
COPY packages ./packages
COPY scripts ./scripts
COPY services ./services

# Build
RUN npm run build --workspace=@prabu/prabu-siliwangi --if-present

# Create non-root user
RUN addgroup -g 1001 -S appuser && adduser -S appuser -u 1001
USER appuser

EXPOSE 3000

CMD ["node", "apps/prabu-siliwangi/dist/index.js"]