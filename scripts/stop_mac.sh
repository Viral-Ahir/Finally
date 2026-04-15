#!/usr/bin/env bash
# FinAlly — Stop script for macOS/Linux
set -euo pipefail

CONTAINER_NAME="finally"

# Check Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "Error: Docker is not running."
    exit 1
fi

# Stop and remove the container (volume is preserved)
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "Stopping FinAlly..."
    docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
    docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true
    echo "FinAlly stopped. Your data is preserved in the Docker volume."
else
    echo "FinAlly is not running."
fi
