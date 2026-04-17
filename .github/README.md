# CI/CD Setup Guide

## GitHub Secrets Required

### Docker Hub
- `DOCKERHUB_USERNAME` - Docker Hub username
- `DOCKERHUB_TOKEN` - Docker Hub access token

### Production VPS
- `VPS_HOST` - Production server IP/hostname
- `VPS_USER` - SSH username
- `VPS_SSH_KEY` - SSH private key

### Development VPS (optional)
- `DEV_VPS_HOST` - Dev server IP/hostname
- `DEV_VPS_USER` - SSH username
- `DEV_VPS_SSH_KEY` - SSH private key

## Setting Up Secrets

1. Go to your GitHub repository
2. Navigate to Settings → Secrets and variables → Actions
3. Add the secrets above

## Workflows

### ci.yml - Main CI/CD
- Runs on push to main/develop
- Builds TypeScript and Rust
- Runs linting and tests
- Builds Docker images
- Deploys to production

### dev.yml - Development
- Runs on push to develop
- Quick build and test
- Deploys to dev server

### release.yml - Release
- Runs on git tags (v*)
- Creates GitHub release
- Builds and pushes Docker images with version
- Deploys to production

## GitHub Actions Setup

1. Fork/clone the repository
2. Add required secrets in GitHub Settings
3. Push to trigger workflows

## Local Testing

```bash
# Test Docker build locally
docker build -f services/rust-copy-engine/Dockerfile -t prabu-test services/rust-copy-engine

# Test docker-compose
docker-compose config
```
