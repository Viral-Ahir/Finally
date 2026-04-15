#!/usr/bin/env bash
# FinAlly — Start script for macOS/Linux
# Usage: ./scripts/start_mac.sh [--build]
set -euo pipefail

CONTAINER_NAME="finally"
IMAGE_NAME="finally"
VOLUME_NAME="finally-data"
PORT="8000"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"

# Check Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "Error: Docker is not running. Please start Docker and try again."
    exit 1
fi

# Build image if --build flag passed or image doesn't exist
if [[ "${1:-}" == "--build" ]] || ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
    echo "Building Docker image..."
    docker build -t "$IMAGE_NAME" "$PROJECT_DIR"
fi

# Stop and remove existing container (if any)
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "Stopping existing container..."
    docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
    docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true
fi

# Build the run command
RUN_ARGS="-d --name $CONTAINER_NAME -v ${VOLUME_NAME}:/app/db -p ${PORT}:8000"

if [[ -f "$ENV_FILE" ]]; then
    RUN_ARGS="$RUN_ARGS --env-file $ENV_FILE"
else
    echo "Warning: No .env file found at $ENV_FILE — running without environment variables."
    echo "Copy .env.example to .env and fill in your API keys."
fi

# Run the container
echo "Starting FinAlly..."
docker run $RUN_ARGS "$IMAGE_NAME"

echo ""
echo "FinAlly is running at http://localhost:${PORT}"
echo "To stop: ./scripts/stop_mac.sh"
