"""Tests for chat API routes and LLM integration."""

import os
import tempfile
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import FastAPI

from app.db import get_db, init_db
from app.market import PriceCache
from app.chat import create_chat_router
from app.chat.llm import (
    LLMResponse,
    TradeAction,
    WatchlistChange,
    _build_context,
    _mock_response,
)


@pytest.fixture
async def app_with_chat():
    """Create a test app with chat routes in mock LLM mode."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test.db")
        os.environ["DB_PATH"] = db_path
        os.environ["LLM_MOCK"] = "true"
        await init_db()

        cache = PriceCache()
        cache.update("AAPL", 190.0)
        cache.update("GOOGL", 175.0)

        mock_source = AsyncMock()
        mock_source.add_ticker = AsyncMock()
        mock_source.remove_ticker = AsyncMock()

        test_app = FastAPI()
        test_app.include_router(create_chat_router(cache, mock_source))

        yield test_app, cache, mock_source

        os.environ.pop("DB_PATH", None)
        os.environ.pop("LLM_MOCK", None)


class TestMockResponse:
    def test_default_response_has_trade_and_watchlist(self):
        resp = _mock_response("hello")
        assert resp.message
        assert len(resp.trades) > 0
        assert len(resp.watchlist_changes) > 0

    def test_buy_keyword_triggers_buy(self):
        resp = _mock_response("buy some stocks")
        assert any(t.side == "buy" for t in resp.trades)

    def test_sell_keyword_triggers_sell(self):
        resp = _mock_response("sell my AAPL")
        assert any(t.side == "sell" for t in resp.trades)

    def test_watch_keyword_triggers_watchlist_add(self):
        resp = _mock_response("watch PYPL")
        assert any(w.action == "add" for w in resp.watchlist_changes)


class TestLLMResponseModel:
    def test_valid_response(self):
        resp = LLMResponse(
            message="Hello",
            trades=[TradeAction(ticker="AAPL", side="buy", quantity=5)],
            watchlist_changes=[WatchlistChange(ticker="PYPL", action="add")],
        )
        assert resp.message == "Hello"
        assert len(resp.trades) == 1
        assert len(resp.watchlist_changes) == 1

    def test_empty_actions(self):
        resp = LLMResponse(message="Just a message")
        assert resp.trades == []
        assert resp.watchlist_changes == []

    def test_json_roundtrip(self):
        resp = LLMResponse(
            message="Test",
            trades=[TradeAction(ticker="AAPL", side="buy", quantity=10)],
        )
        json_str = resp.model_dump_json()
        parsed = LLMResponse.model_validate_json(json_str)
        assert parsed.message == "Test"
        assert parsed.trades[0].ticker == "AAPL"


class TestBuildContext:
    def test_context_includes_cash(self):
        portfolio = {"cash_balance": 10000.0, "total_value": 10000.0, "positions": []}
        context = _build_context(portfolio, [])
        assert "$10,000.00" in context

    def test_context_includes_positions(self):
        portfolio = {
            "cash_balance": 8000.0,
            "total_value": 9900.0,
            "positions": [
                {
                    "ticker": "AAPL",
                    "quantity": 10,
                    "avg_cost": 190.0,
                    "current_price": 190.0,
                    "unrealized_pnl": 0.0,
                    "pct_change": 0.0,
                }
            ],
        }
        context = _build_context(portfolio, [])
        assert "AAPL" in context
        assert "10 shares" in context

    def test_context_includes_watchlist(self):
        portfolio = {"cash_balance": 10000.0, "total_value": 10000.0, "positions": []}
        watchlist = [{"ticker": "GOOGL", "price": 175.0, "direction": "up"}]
        context = _build_context(portfolio, watchlist)
        assert "GOOGL" in context
        assert "$175.00" in context


class TestChatEndpoint:
    async def test_chat_returns_response(self, app_with_chat):
        app, cache, _ = app_with_chat
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/chat", json={"message": "hello"}
            )
            assert resp.status_code == 200
            data = resp.json()
            assert "message" in data
            assert "trades" in data
            assert "watchlist_changes" in data

    async def test_chat_auto_executes_buy(self, app_with_chat):
        app, cache, _ = app_with_chat
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/chat", json={"message": "buy some stocks"}
            )
            data = resp.json()
            # Mock buy response buys 5 AAPL
            assert len(data["trades"]) > 0
            assert data["trades"][0]["ticker"] == "AAPL"
            assert data["trades"][0]["side"] == "buy"

    async def test_chat_auto_executes_watchlist_add(self, app_with_chat):
        app, cache, mock_source = app_with_chat
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/chat", json={"message": "watch PYPL"}
            )
            data = resp.json()
            assert len(data["watchlist_changes"]) > 0
            mock_source.add_ticker.assert_called()

    async def test_chat_stores_messages(self, app_with_chat):
        app, cache, _ = app_with_chat
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            await client.post(
                "/api/chat", json={"message": "hello"}
            )

            # Check messages were stored
            db = await get_db()
            try:
                cursor = await db.execute(
                    "SELECT role, content FROM chat_messages WHERE user_id = 'default' ORDER BY created_at"
                )
                rows = await cursor.fetchall()
                assert len(rows) == 2  # user + assistant
                assert rows[0]["role"] == "user"
                assert rows[0]["content"] == "hello"
                assert rows[1]["role"] == "assistant"
            finally:
                await db.close()

    async def test_chat_empty_message_rejected(self, app_with_chat):
        app, cache, _ = app_with_chat
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/chat", json={"message": "  "}
            )
            assert resp.status_code == 400

    async def test_chat_sell_insufficient_shares_returns_error(self, app_with_chat):
        app, cache, _ = app_with_chat
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            # sell mock tries to sell 2 AAPL, but we have none
            resp = await client.post(
                "/api/chat", json={"message": "sell my stocks"}
            )
            data = resp.json()
            assert len(data["trade_errors"]) > 0
            assert "Insufficient" in data["trade_errors"][0]
