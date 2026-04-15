"""Watchlist API routes."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from app.db import get_db
from app.market import MarketDataSource, PriceCache


class AddTickerRequest(BaseModel):
    ticker: str


def create_watchlist_router(
    price_cache: PriceCache,
    market_data_source: MarketDataSource,
) -> APIRouter:
    """Create the watchlist API router."""

    router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])

    @router.get("")
    async def get_watchlist():
        """Get current watchlist with live prices."""
        db = await get_db()
        try:
            cursor = await db.execute(
                "SELECT ticker, added_at FROM watchlist WHERE user_id = ? ORDER BY added_at",
                ("default",),
            )
            rows = await cursor.fetchall()

            tickers = []
            for row in rows:
                ticker = row["ticker"]
                update = price_cache.get(ticker)
                if update:
                    tickers.append({
                        "ticker": ticker,
                        "price": update.price,
                        "previous_price": update.previous_price,
                        "change": update.change,
                        "change_percent": update.change_percent,
                        "direction": update.direction,
                        "added_at": row["added_at"],
                    })
                else:
                    tickers.append({
                        "ticker": ticker,
                        "price": None,
                        "previous_price": None,
                        "change": None,
                        "change_percent": None,
                        "direction": None,
                        "added_at": row["added_at"],
                    })

            return {"tickers": tickers}
        finally:
            await db.close()

    @router.post("")
    async def add_ticker(request: AddTickerRequest):
        """Add a ticker to the watchlist."""
        ticker = request.ticker.upper().strip()
        if not ticker:
            raise HTTPException(status_code=400, detail="Ticker cannot be empty")

        db = await get_db()
        try:
            now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
            entry_id = str(uuid.uuid4())

            try:
                await db.execute(
                    "INSERT INTO watchlist (id, user_id, ticker, added_at) VALUES (?, ?, ?, ?)",
                    (entry_id, "default", ticker, now),
                )
                await db.commit()
            except Exception:
                # UNIQUE constraint violation — ticker already in watchlist
                cursor = await db.execute(
                    "SELECT ticker, added_at FROM watchlist WHERE user_id = ? AND ticker = ?",
                    ("default", ticker),
                )
                existing = await cursor.fetchone()
                if existing:
                    return {
                        "ticker": existing["ticker"],
                        "added_at": existing["added_at"],
                        "already_exists": True,
                    }
                raise

            # Tell market data source to track this ticker
            await market_data_source.add_ticker(ticker)

            return {
                "ticker": ticker,
                "added_at": now,
                "already_exists": False,
            }
        finally:
            await db.close()

    @router.delete("/{ticker}")
    async def remove_ticker(ticker: str):
        """Remove a ticker from the watchlist."""
        ticker = ticker.upper().strip()

        db = await get_db()
        try:
            cursor = await db.execute(
                "DELETE FROM watchlist WHERE user_id = ? AND ticker = ?",
                ("default", ticker),
            )
            await db.commit()

            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail=f"Ticker {ticker} not in watchlist")

            # Remove from market data source and cache
            await market_data_source.remove_ticker(ticker)
            price_cache.remove(ticker)

            return Response(status_code=204)
        finally:
            await db.close()

    return router
