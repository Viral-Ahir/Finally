"""Tests for portfolio API routes."""

import os
import tempfile

import httpx
import pytest
from fastapi import FastAPI

from app.db import get_db, init_db
from app.market import PriceCache
from app.portfolio import create_portfolio_router


@pytest.fixture
async def app_with_cache():
    """Create a test app with portfolio routes and a price cache."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test.db")
        os.environ["DB_PATH"] = db_path
        await init_db()

        cache = PriceCache()
        # Seed some prices
        cache.update("AAPL", 190.0)
        cache.update("GOOGL", 175.0)
        cache.update("MSFT", 420.0)

        test_app = FastAPI()
        test_app.include_router(create_portfolio_router(cache))

        yield test_app, cache

        os.environ.pop("DB_PATH", None)


class TestGetPortfolio:
    async def test_returns_initial_state(self, app_with_cache):
        app, cache = app_with_cache
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/api/portfolio")
            assert resp.status_code == 200
            data = resp.json()
            assert data["cash_balance"] == 10000.0
            assert data["total_value"] == 10000.0
            assert data["positions"] == []

    async def test_returns_positions_after_buy(self, app_with_cache):
        app, cache = app_with_cache
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            # Buy some AAPL
            resp = await client.post(
                "/api/portfolio/trade",
                json={"ticker": "AAPL", "quantity": 10, "side": "buy"},
            )
            assert resp.status_code == 200

            # Check portfolio
            resp = await client.get("/api/portfolio")
            data = resp.json()
            assert data["cash_balance"] == 10000.0 - 10 * 190.0
            assert len(data["positions"]) == 1
            pos = data["positions"][0]
            assert pos["ticker"] == "AAPL"
            assert pos["quantity"] == 10
            assert pos["avg_cost"] == 190.0


class TestExecuteTrade:
    async def test_buy_success(self, app_with_cache):
        app, cache = app_with_cache
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/portfolio/trade",
                json={"ticker": "AAPL", "quantity": 5, "side": "buy"},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["ticker"] == "AAPL"
            assert data["side"] == "buy"
            assert data["quantity"] == 5
            assert data["price"] == 190.0
            assert data["cash_balance"] == 10000.0 - 5 * 190.0

    async def test_sell_success(self, app_with_cache):
        app, cache = app_with_cache
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            # Buy first
            await client.post(
                "/api/portfolio/trade",
                json={"ticker": "AAPL", "quantity": 10, "side": "buy"},
            )
            # Sell some
            resp = await client.post(
                "/api/portfolio/trade",
                json={"ticker": "AAPL", "quantity": 3, "side": "sell"},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["side"] == "sell"
            assert data["quantity"] == 3

    async def test_insufficient_cash(self, app_with_cache):
        app, cache = app_with_cache
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            # Try to buy more than we can afford
            resp = await client.post(
                "/api/portfolio/trade",
                json={"ticker": "AAPL", "quantity": 1000, "side": "buy"},
            )
            assert resp.status_code == 400
            assert "Insufficient cash" in resp.json()["detail"]

    async def test_insufficient_shares(self, app_with_cache):
        app, cache = app_with_cache
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/portfolio/trade",
                json={"ticker": "AAPL", "quantity": 5, "side": "sell"},
            )
            assert resp.status_code == 400
            assert "Insufficient shares" in resp.json()["detail"]

    async def test_sell_more_than_owned(self, app_with_cache):
        app, cache = app_with_cache
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            await client.post(
                "/api/portfolio/trade",
                json={"ticker": "AAPL", "quantity": 5, "side": "buy"},
            )
            resp = await client.post(
                "/api/portfolio/trade",
                json={"ticker": "AAPL", "quantity": 10, "side": "sell"},
            )
            assert resp.status_code == 400
            assert "Insufficient shares" in resp.json()["detail"]

    async def test_no_price_available(self, app_with_cache):
        app, cache = app_with_cache
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/portfolio/trade",
                json={"ticker": "UNKNOWN", "quantity": 1, "side": "buy"},
            )
            assert resp.status_code == 400
            assert "No price available" in resp.json()["detail"]

    async def test_ticker_normalized_to_uppercase(self, app_with_cache):
        app, cache = app_with_cache
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/portfolio/trade",
                json={"ticker": "aapl", "quantity": 1, "side": "buy"},
            )
            assert resp.status_code == 200
            assert resp.json()["ticker"] == "AAPL"

    async def test_position_deleted_when_fully_sold(self, app_with_cache):
        app, cache = app_with_cache
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            await client.post(
                "/api/portfolio/trade",
                json={"ticker": "AAPL", "quantity": 5, "side": "buy"},
            )
            await client.post(
                "/api/portfolio/trade",
                json={"ticker": "AAPL", "quantity": 5, "side": "sell"},
            )
            resp = await client.get("/api/portfolio")
            data = resp.json()
            assert data["positions"] == []
            assert data["cash_balance"] == 10000.0

    async def test_avg_cost_updates_on_multiple_buys(self, app_with_cache):
        app, cache = app_with_cache
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            # Buy 10 at 190
            await client.post(
                "/api/portfolio/trade",
                json={"ticker": "AAPL", "quantity": 10, "side": "buy"},
            )
            # Update price to 200
            cache.update("AAPL", 200.0)
            # Buy 10 more at 200
            await client.post(
                "/api/portfolio/trade",
                json={"ticker": "AAPL", "quantity": 10, "side": "buy"},
            )
            resp = await client.get("/api/portfolio")
            pos = resp.json()["positions"][0]
            assert pos["quantity"] == 20
            assert pos["avg_cost"] == 195.0  # (10*190 + 10*200) / 20

    async def test_trade_records_snapshot(self, app_with_cache):
        app, cache = app_with_cache
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            await client.post(
                "/api/portfolio/trade",
                json={"ticker": "AAPL", "quantity": 5, "side": "buy"},
            )
            resp = await client.get("/api/portfolio/history")
            data = resp.json()
            assert len(data) >= 1


class TestPortfolioHistory:
    async def test_empty_history(self, app_with_cache):
        app, cache = app_with_cache
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/api/portfolio/history")
            assert resp.status_code == 200
            assert resp.json() == []

    async def test_history_with_limit(self, app_with_cache):
        app, cache = app_with_cache
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            # Create some snapshots by trading
            for i in range(5):
                await client.post(
                    "/api/portfolio/trade",
                    json={"ticker": "AAPL", "quantity": 1, "side": "buy"},
                )

            resp = await client.get("/api/portfolio/history?limit=2")
            data = resp.json()
            assert len(data) == 2
