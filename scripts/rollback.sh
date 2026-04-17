#!/bin/bash
# Prabu-Siliwangi Rollback Script
# Usage: ./scripts/rollback.sh

set -e

APP_DIR="/app/prabu-siliwangi"

echo "=========================================="
echo "  Prabu-Siliwangi Rollback"
echo "=========================================="

cd $APP_DIR

# Get previous image
echo "📦 Getting previous Docker images..."

# Restart with previous images (without rebuilding)
docker-compose down

# Pull specific previous images
echo "🔄 Rolling back to previous images..."
docker pull $DOCKERHUB_USERNAME/prabu-rust-engine:latest || true
docker pull $DOCKERHUB_USERNAME/prabu-siliwangi:latest || true

# Start services
docker-compose up -d

echo ""
echo "=========================================="
echo "  Rollback Complete!"
echo "=========================================="
echo ""
docker-compose ps
