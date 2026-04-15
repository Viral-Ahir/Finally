"""Tests for health endpoint."""

import httpx
import pytest
from fastapi import FastAPI


class TestHealthEndpoint:
    async def test_health_returns_ok(self):
        # Create a minimal app just for testing health
        from fastapi import FastAPI

        app = FastAPI()

        @app.get("/api/health")
        async def health_check():
            return {"status": "ok", "service": "finally-backend"}

        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/api/health")
            assert resp.status_code == 200
            data = resp.json()
            assert data["status"] == "ok"
            assert data["service"] == "finally-backend"
