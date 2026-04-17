#!/bin/bash
# Prabu-Siliwangi Deployment Script
# Usage: ./scripts/deploy.sh [environment]

set -e

ENV=${1:-production}
APP_DIR="/app/prabu-siliwangi"

echo "=========================================="
echo "  Prabu-Siliwangi Deployment"
echo "  Environment: $ENV"
echo "=========================================="

# Navigate to app directory
cd $APP_DIR

# Pull latest changes
echo "📥 Pulling latest changes..."
git pull origin main

# Pull Docker images
echo "📦 Pulling Docker images..."
docker-compose pull

# Build and start services
echo "🚀 Starting services..."
docker-compose up -d --build

# Cleanup
echo "🧹 Cleaning up old images..."
docker system prune -f

# Show status
echo ""
echo "=========================================="
echo "  Deployment Complete!"
echo "=========================================="
echo ""
echo "Services:"
docker-compose ps

echo ""
echo "Logs:"
docker-compose logs --tail=20

echo ""
echo "Dashboard: http://localhost:8787/dashboard"
echo "Health: http://localhost:8787/health"
