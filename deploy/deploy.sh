#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

echo "==> Pulling latest changes from git..."
git pull origin main || true

echo "==> Building and deploying Docker containers..."
docker compose build --pull
docker compose up -d

echo "==> Waiting for services to become healthy..."
docker compose ps

echo "==> Checking logs..."
docker compose logs --tail=30 api
docker compose logs --tail=30 web

echo "==> Deploy finished successfully!"
