#!/bin/bash
# Prabu-Siliwangi Server Setup Script
# Run this once on a new VPS

set -e

echo "=========================================="
echo "  Prabu-Siliwangi Server Setup"
echo "=========================================="

# Update system
echo "📦 Updating system..."
apt update && apt upgrade -y

# Install Docker
echo "🐳 Installing Docker..."
curl -fsSL https://get.docker.com | sh
usermod -aG docker $USER

# Install Docker Compose
echo "📦 Installing Docker Compose..."
curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Create app directory
echo "📁 Creating app directory..."
mkdir -p /app/prabu-siliwangi
cd /app/prabu-siliwangi

# Clone repository (replace with your repo)
echo "📥 Cloning repository..."
git clone https://github.com/yourusername/Prabu-Siliwangi.git .

# Copy environment file
echo "⚙️ Setting up environment..."
cp .env.docker .env

# Create data directory
echo "📁 Creating data directory..."
mkdir -p data logs

# Set permissions
echo "🔐 Setting permissions..."
chmod +x scripts/*.sh

# Pull images
echo "📦 Pulling Docker images..."
docker-compose pull

echo ""
echo "=========================================="
echo "  Server Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Edit .env with your credentials"
echo "2. Run: docker-compose up -d"
echo "3. Check: docker-compose ps"
echo "4. View logs: docker-compose logs -f"
