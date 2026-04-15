"""Portfolio API routes."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.db import get_db
from app.market import PriceCache


class TradeRequest(BaseModel):
    ticker: str
    quantity: float = Field(gt=0)
    side: str = Field(pattern="^(buy|sell)$")


class TradeResult(BaseModel):
    id: str
    ticker: str
    side: str
    quantity: float
    price: float
    executed_at: str
    cash_balance: float


def create_portfolio_router(price_cache: PriceCache) -> APIRouter:
    """Create the portfolio API router with access to the price cache."""

    router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])

    @router.get("")
    async def get_portfolio():
        """Get current portfolio state: cash, positions, total value."""
        db = await get_db()
        try:
            cursor = await db.execute(
                "SELECT cash_balance FROM users_profile WHERE id = ?", ("default",)
            )
            user = await cursor.fetchone()
            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            cash = user["cash_balance"]

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
                    current_price = avg_cost  # fallback to avg_cost if no live price

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

            total_value = round(cash + total_positions_value, 2)

            return {
                "cash_balance": round(cash, 2),
                "total_value": total_value,
                "positions": positions,
            }
        finally:
            await db.close()

    @router.post("/trade")
    async def execute_trade(trade: TradeRequest):
        """Execute a market order (buy or sell)."""
        ticker = trade.ticker.upper()
        quantity = trade.quantity
        side = trade.side

        # Get current price
        current_price = price_cache.get_price(ticker)
        if current_price is None:
            raise HTTPException(status_code=400, detail=f"No price available for {ticker}")

        db = await get_db()
        try:
            # Get user
            cursor = await db.execute(
                "SELECT cash_balance FROM users_profile WHERE id = ?", ("default",)
            )
            user = await cursor.fetchone()
            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            cash = user["cash_balance"]
            now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")

            if side == "buy":
                total_cost = quantity * current_price
                if total_cost > cash:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Insufficient cash. Need ${total_cost:.2f}, have ${cash:.2f}",
                    )

                new_cash = cash - total_cost

                # Update or create position
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
                    raise HTTPException(
                        status_code=400,
                        detail=f"Insufficient shares. Want to sell {quantity}, have {have}",
                    )

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

            # Update cash balance
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

            # Record portfolio snapshot after trade
            await _record_snapshot_after_trade(db, price_cache)

            return TradeResult(
                id=trade_id,
                ticker=ticker,
                side=side,
                quantity=quantity,
                price=current_price,
                executed_at=now,
                cash_balance=round(new_cash, 2),
            )
        finally:
            await db.close()

    @router.get("/history")
    async def get_portfolio_history(limit: int = 500):
        """Get portfolio value snapshots over time."""
        db = await get_db()
        try:
            cursor = await db.execute(
                "SELECT total_value, recorded_at FROM portfolio_snapshots WHERE user_id = ? ORDER BY recorded_at DESC LIMIT ?",
                ("default", limit),
            )
            rows = await cursor.fetchall()
            # Return in chronological order
            return [
                {"total_value": row["total_value"], "recorded_at": row["recorded_at"]}
                for row in reversed(rows)
            ]
        finally:
            await db.close()

    return router


async def _record_snapshot_after_trade(db, price_cache: PriceCache) -> None:
    """Record a portfolio snapshot immediately after a trade."""
    cursor = await db.execute(
        "SELECT cash_balance FROM users_profile WHERE id = ?", ("default",)
    )
    user = await cursor.fetchone()
    if not user:
        return

    cash = user["cash_balance"]
    cursor = await db.execute(
        "SELECT ticker, quantity FROM positions WHERE user_id = ? AND quantity > 0",
        ("default",),
    )
    positions = await cursor.fetchall()

    total = cash
    for pos in positions:
        current_price = price_cache.get_price(pos["ticker"])
        if current_price is not None:
            total += pos["quantity"] * current_price

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    await db.execute(
        "INSERT INTO portfolio_snapshots (id, user_id, total_value, recorded_at) VALUES (?, ?, ?, ?)",
        (str(uuid.uuid4()), "default", round(total, 2), now),
    )
    await db.commit()
