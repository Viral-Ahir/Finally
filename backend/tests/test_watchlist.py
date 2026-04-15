"""Tests for watchlist API routes."""

import os
import tempfile
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import FastAPI

from app.db import get_db, init_db
from app.market import PriceCache
from app.watchlist import create_watchlist_router


@pytest.fixture
async def app_with_watchlist():
    """Create a test app with watchlist routes."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test.db")
        os.environ["DB_PATH"] = db_path
        await init_db()

        cache = PriceCache()
        cache.update("AAPL", 190.0)
        cache.update("GOOGL", 175.0)

        mock_source = AsyncMock()
        mock_source.add_ticker = AsyncMock()
        mock_source.remove_ticker = AsyncMock()

        test_app = FastAPI()
        test_app.include_router(create_watchlist_router(cache, mock_source))

        yield test_app, cache, mock_source

        os.environ.pop("DB_PATH", None)


class TestGetWatchlist:
    async def test_returns_default_tickers(self, app_with_watchlist):
        app, cache, _ = app_with_watchlist
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/api/watchlist")
            assert resp.status_code == 200
            data = resp.json()
            tickers = [t["ticker"] for t in data["tickers"]]
            assert "AAPL" in tickers
            assert "GOOGL" in tickers
            assert len(tickers) == 10  # 10 default tickers

    async def test_returns_prices_from_cache(self, app_with_watchlist):
        app, cache, _ = app_with_watchlist
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/api/watchlist")
            data = resp.json()
            aapl = next(t for t in data["tickers"] if t["ticker"] == "AAPL")
            assert aapl["price"] == 190.0

    async def test_returns_null_for_uncached_ticker(self, app_with_watchlist):
        app, cache, _ = app_with_watchlist
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/api/watchlist")
            data = resp.json()
            # TSLA is in default watchlist but not in our cache
            tsla = next(t for t in data["tickers"] if t["ticker"] == "TSLA")
            assert tsla["price"] is None
            assert tsla["direction"] is None


class TestAddTicker:
    async def test_add_new_ticker(self, app_with_watchlist):
        app, cache, mock_source = app_with_watchlist
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/watchlist", json={"ticker": "PYPL"}
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["ticker"] == "PYPL"
            assert data["already_exists"] is False
            mock_source.add_ticker.assert_called_once_with("PYPL")

    async def test_add_duplicate_ticker(self, app_with_watchlist):
        app, cache, mock_source = app_with_watchlist
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/watchlist", json={"ticker": "AAPL"}
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["already_exists"] is True

    async def test_ticker_normalized_to_uppercase(self, app_with_watchlist):
        app, cache, mock_source = app_with_watchlist
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/watchlist", json={"ticker": "pypl"}
            )
            assert resp.status_code == 200
            assert resp.json()["ticker"] == "PYPL"

    async def test_add_empty_ticker_rejected(self, app_with_watchlist):
        app, cache, mock_source = app_with_watchlist
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/watchlist", json={"ticker": "  "}
            )
            assert resp.status_code == 400


class TestRemoveTicker:
    async def test_remove_existing_ticker(self, app_with_watchlist):
        app, cache, mock_source = app_with_watchlist
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.delete("/api/watchlist/AAPL")
            assert resp.status_code == 204
            mock_source.remove_ticker.assert_called_once_with("AAPL")

    async def test_remove_nonexistent_ticker(self, app_with_watchlist):
        app, cache, mock_source = app_with_watchlist
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.delete("/api/watchlist/UNKNOWN")
            assert resp.status_code == 404

    async def test_remove_normalizes_to_uppercase(self, app_with_watchlist):
        app, cache, mock_source = app_with_watchlist
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.delete("/api/watchlist/aapl")
            assert resp.status_code == 204
            mock_source.remove_ticker.assert_called_once_with("AAPL")

    async def test_watchlist_updated_after_remove(self, app_with_watchlist):
        app, cache, mock_source = app_with_watchlist
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            await client.delete("/api/watchlist/AAPL")
            resp = await client.get("/api/watchlist")
            tickers = [t["ticker"] for t in resp.json()["tickers"]]
            assert "AAPL" not in tickers
