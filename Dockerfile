# FinAlly — Multi-stage Docker build
# Stage 1: Build the Next.js frontend as a static export
# Stage 2: Python runtime with FastAPI serving API + static files

# ---------- Stage 1: Frontend build ----------
FROM node:20-slim AS frontend-build

WORKDIR /build/frontend

# Install dependencies first (layer caching)
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Copy source and build static export
COPY frontend/ ./
RUN npm run build

# ---------- Stage 2: Python runtime ----------
FROM python:3.12-slim AS runtime

# Install uv for fast Python dependency management
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

WORKDIR /app

# Install Python dependencies first (layer caching)
COPY backend/pyproject.toml backend/uv.lock backend/README.md ./
RUN uv sync --frozen --no-dev

# Copy backend source code
COPY backend/app ./app

# Copy frontend static export from Stage 1
COPY --from=frontend-build /build/frontend/out ./static

# Create the database directory (volume mount target)
RUN mkdir -p /app/db

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
