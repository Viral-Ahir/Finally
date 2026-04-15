"""Chat API routes."""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db import get_db
from app.market import MarketDataSource, PriceCache

from .llm import LLMResponse, call_llm

logger = logging.getLogger(__name__)


class ChatRequest(BaseModel):
    message: str


def create_chat_router(
    price_cache: PriceCache,
    market_data_source: MarketDataSource,
) -> APIRouter:
    """Create the chat API router."""

    router = APIRouter(prefix="/api", tags=["chat"])

    @router.post("/chat")
    async def chat(request: ChatRequest):
        """Send a message and get an AI response with auto-executed actions."""
        user_message = request.message.strip()
        if not user_message:
            raise HTTPException(status_code=400, detail="Message cannot be empty")

        # 1. Load portfolio context
        portfolio = await _get_portfolio_context(price_cache)

        # 2. Load watchlist context
        watchlist = await _get_watchlist_context(price_cache)

        # 3. Load recent chat history (last 20 messages)
        chat_history = await _get_chat_history(limit=20)

        # 4. Call LLM
        llm_response = await call_llm(portfolio, watchlist, chat_history, user_message)

        # 5. Auto-execute trades and watchlist changes
        executed_trades = []
        trade_errors = []
        for trade in llm_response.trades:
            result = await _execute_trade(
                ticker=trade.ticker.upper(),
                side=trade.side,
                quantity=trade.quantity,
                price_cache=price_cache,
            )
            if result.get("error"):
                trade_errors.append(result["error"])
            else:
                executed_trades.append(result)

        executed_watchlist = []
        for change in llm_response.watchlist_changes:
            ticker = change.ticker.upper()
            if change.action == "add":
                result = await _add_to_watchlist(ticker, market_data_source)
                executed_watchlist.append(result)
            elif change.action == "remove":
                result = await _remove_from_watchlist(ticker, market_data_source, price_cache)
                executed_watchlist.append(result)

        # 6. Store messages in chat_messages
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
        actions_json = json.dumps({
            "trades": [t for t in executed_trades],
            "trade_errors": trade_errors,
            "watchlist_changes": [w for w in executed_watchlist],
        })

        db = await get_db()
        try:
            # Store user message
            await db.execute(
                "INSERT INTO chat_messages (id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), "default", "user", user_message, now),
            )
            # Store assistant response
            await db.execute(
                "INSERT INTO chat_messages (id, user_id, role, content, actions, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), "default", "assistant", llm_response.message, actions_json, now),
            )
            await db.commit()
        finally:
            await db.close()

        # 7. Build response
        response = {
            "message": llm_response.message,
            "trades": executed_trades,
            "trade_errors": trade_errors,
            "watchlist_changes": executed_watchlist,
        }

        return response

    return router


async def _get_portfolio_context(price_cache: PriceCache) -> dict:
    """Load portfolio state for LLM context."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT cash_balance FROM users_profile WHERE id = ?", ("default",)
        )
        user = await cursor.fetchone()
        cash = user["cash_balance"] if user else 10000.0

        cursor = await db.execute(
            "SELECT ticker, quantity, avg_cost FROM positions WHERE user_id = ? AND quantity > 0",
            ("default",),
        )
        rows = await cursor.fetchall()

        positions = []
        total_positions_value = 0.0
        for row in rows:
            ticker = row["ticker"]
            qty = row["quantity"]
            avg_cost = row["avg_cost"]
            current_price = price_cache.get_price(ticker)
            if current_price is None:
                current_price = avg_cost

            market_value = qty * current_price
            cost_basis = qty * avg_cost
            unrealized_pnl = round(market_value - cost_basis, 2)
            pct_change = round((current_price - avg_cost) / avg_cost * 100, 2) if avg_cost > 0 else 0.0
            total_positions_value += market_value

            positions.append({
                "ticker": ticker,
                "quantity": qty,
                "avg_cost": round(avg_cost, 2),
                "current_price": round(current_price, 2),
                "unrealized_pnl": unrealized_pnl,
                "pct_change": pct_change,
            })

        return {
            "cash_balance": round(cash, 2),
            "total_value": round(cash + total_positions_value, 2),
            "positions": positions,
        }
    finally:
        await db.close()


async def _get_watchlist_context(price_cache: PriceCache) -> list[dict]:
    """Load watchlist with prices for LLM context."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT ticker FROM watchlist WHERE user_id = ? ORDER BY added_at",
            ("default",),
        )
        rows = await cursor.fetchall()

        result = []
        for row in rows:
            ticker = row["ticker"]
            update = price_cache.get(ticker)
            if update:
                result.append({
                    "ticker": ticker,
                    "price": update.price,
                    "direction": update.direction,
                })
            else:
                result.append({"ticker": ticker, "price": None, "direction": None})
        return result
    finally:
        await db.close()


async def _get_chat_history(limit: int = 20) -> list[dict]:
    """Load recent chat messages."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT role, content FROM chat_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
            ("default", limit),
        )
        rows = await cursor.fetchall()
        # Return in chronological order
        return [{"role": row["role"], "content": row["content"]} for row in reversed(rows)]
    finally:
        await db.close()


async def _execute_trade(
    ticker: str,
    side: str,
    quantity: float,
    price_cache: PriceCache,
) -> dict:
    """Execute a trade from chat. Returns trade result or error dict."""
    current_price = price_cache.get_price(ticker)
    if current_price is None:
        return {"error": f"No price available for {ticker}"}

    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT cash_balance FROM users_profile WHERE id = ?", ("default",)
        )
        user = await cursor.fetchone()
        if not user:
            return {"error": "User not found"}

        cash = user["cash_balance"]
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")

        if side == "buy":
            total_cost = quantity * current_price
            if total_cost > cash:
                return {"error": f"Insufficient cash for {ticker}. Need ${total_cost:.2f}, have ${cash:.2f}"}

            new_cash = cash - total_cost

            cursor = await db.execute(
                "SELECT quantity, avg_cost FROM positions WHERE user_id = ? AND ticker = ?",
                ("default", ticker),
            )
            existing = await cursor.fetchone()

            if existing:
                old_qty = existing["quantity"]
                old_avg = existing["avg_cost"]
                new_qty = old_qty + quantity
                new_avg = (old_qty * old_avg + quantity * current_price) / new_qty
                await db.execute(
                    "UPDATE positions SET quantity = ?, avg_cost = ?, updated_at = ? WHERE user_id = ? AND ticker = ?",
                    (new_qty, round(new_avg, 4), now, "default", ticker),
                )
            else:
                await db.execute(
                    "INSERT INTO positions (id, user_id, ticker, quantity, avg_cost, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                    (str(uuid.uuid4()), "default", ticker, quantity, current_price, now),
                )

        elif side == "sell":
            cursor = await db.execute(
                "SELECT quantity FROM positions WHERE user_id = ? AND ticker = ?",
                ("default", ticker),
            )
            existing = await cursor.fetchone()

            if not existing or existing["quantity"] < quantity:
                have = existing["quantity"] if existing else 0
                return {"error": f"Insufficient shares of {ticker}. Want to sell {quantity}, have {have}"}

            new_qty = existing["quantity"] - quantity
            new_cash = cash + quantity * current_price

            if new_qty == 0:
                await db.execute(
                    "DELETE FROM positions WHERE user_id = ? AND ticker = ?",
                    ("default", ticker),
                )
            else:
                await db.execute(
                    "UPDATE positions SET quantity = ?, updated_at = ? WHERE user_id = ? AND ticker = ?",
                    (new_qty, now, "default", ticker),
                )

        # Update cash
        await db.execute(
            "UPDATE users_profile SET cash_balance = ? WHERE id = ?",
            (round(new_cash, 2), "default"),
        )

        # Record trade
        trade_id = str(uuid.uuid4())
        await db.execute(
            "INSERT INTO trades (id, user_id, ticker, side, quantity, price, executed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (trade_id, "default", ticker, side, quantity, current_price, now),
        )

        await db.commit()

        # Record portfolio snapshot
        cursor = await db.execute(
            "SELECT cash_balance FROM users_profile WHERE id = ?", ("default",)
        )
        user = await cursor.fetchone()
        snap_cash = user["cash_balance"]
        cursor = await db.execute(
            "SELECT ticker, quantity FROM positions WHERE user_id = ? AND quantity > 0",
            ("default",),
        )
        positions = await cursor.fetchall()
        total = snap_cash
        for pos in positions:
            p = price_cache.get_price(pos["ticker"])
            if p is not None:
                total += pos["quantity"] * p

        await db.execute(
            "INSERT INTO portfolio_snapshots (id, user_id, total_value, recorded_at) VALUES (?, ?, ?, ?)",
            (str(uuid.uuid4()), "default", round(total, 2), now),
        )
        await db.commit()

        return {
            "ticker": ticker,
            "side": side,
            "quantity": quantity,
            "price": current_price,
            "executed_at": now,
        }
    finally:
        await db.close()


async def _add_to_watchlist(ticker: str, market_data_source: MarketDataSource) -> dict:
    """Add a ticker to the watchlist from chat."""
    db = await get_db()
    try:
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
        try:
            await db.execute(
                "INSERT INTO watchlist (id, user_id, ticker, added_at) VALUES (?, ?, ?, ?)",
                (str(uuid.uuid4()), "default", ticker, now),
            )
            await db.commit()
            await market_data_source.add_ticker(ticker)
            return {"ticker": ticker, "action": "add", "success": True}
        except Exception:
            return {"ticker": ticker, "action": "add", "success": True, "already_exists": True}
    finally:
        await db.close()


async def _remove_from_watchlist(
    ticker: str,
    market_data_source: MarketDataSource,
    price_cache: PriceCache,
) -> dict:
    """Remove a ticker from the watchlist from chat."""
    db = await get_db()
    try:
        await db.execute(
            "DELETE FROM watchlist WHERE user_id = ? AND ticker = ?",
            ("default", ticker),
        )
        await db.commit()
        await market_data_source.remove_ticker(ticker)
        price_cache.remove(ticker)
        return {"ticker": ticker, "action": "remove", "success": True}
    finally:
        await db.close()
