# Docker Deployment Guide

## Quick Start

### 1. Build the Rust Copy Engine Docker Image

```bash
cd services/rust-copy-engine
docker build -t prabu-rust-engine:latest .
```

### 2. Configure Environment

Copy the environment template and fill in your values:

```bash
cp .env.docker .env
```

### 3. Start Services

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| rust-copy-engine | 8787 | High-performance trading engine |
| kabayan-bot | 3000 | Telegram trading bot |
| prometheus | 9090 | Metrics collection |
| grafana | 3001 | Visualization |

## Dashboard

Access the dashboard at: http://localhost:8787/dashboard

## Individual Service Deployment

### Rust Copy Engine Only

```bash
cd services/rust-copy-engine
docker run -p 8787:8787 prabu-rust-engine:latest
```

### Full Stack

```bash
docker-compose up -d
```

## Production Deployment

For production, consider:

1. **Use a reverse proxy** (nginx, traefik)
2. **Enable SSL/TLS**
3. **Configure firewall rules**
4. **Set up monitoring**
5. **Use secrets management**

### Nginx Configuration Example

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:8787;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Health Checks

```bash
# Check service health
curl http://localhost:8787/health

# Check Prometheus targets
curl http://localhost:9090/api/v1/targets
```

## Troubleshooting

### View logs
```bash
docker-compose logs rust-copy-engine
docker-compose logs kabayan-bot
```

### Restart service
```bash
docker-compose restart rust-copy-engine
```

### Rebuild after changes
```bash
docker-compose up -d --build
```
