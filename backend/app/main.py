"""FastAPI main application for FinAlly."""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

# Load .env from project root (parent of backend/)
_env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
load_dotenv(os.path.abspath(_env_path))

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.db import get_db, init_db
from app.market import PriceCache, create_market_data_source, create_stream_router
from app.chat import create_chat_router
from app.portfolio import create_portfolio_router
from app.watchlist import create_watchlist_router

logger = logging.getLogger(__name__)

# Shared state — initialized during lifespan
price_cache = PriceCache()
market_data_source = create_market_data_source(price_cache)
_snapshot_task: asyncio.Task | None = None


async def _get_watchlist_tickers() -> list[str]:
    """Load current watchlist tickers from the database."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT ticker FROM watchlist WHERE user_id = ?", ("default",)
        )
        rows = await cursor.fetchall()
        return [row["ticker"] for row in rows]
    finally:
        await db.close()


async def _record_portfolio_snapshot() -> None:
    """Record the current portfolio total value to portfolio_snapshots."""
    db = await get_db()
    try:
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
    finally:
        await db.close()


async def _snapshot_loop() -> None:
    """Background task: record portfolio snapshot every 30 seconds."""
    while True:
        await asyncio.sleep(30)
        try:
            await _record_portfolio_snapshot()
        except Exception:
            logger.exception("Failed to record portfolio snapshot")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle for the application."""
    global _snapshot_task

    # Initialize database
    await init_db()

    # Start market data source with watchlist tickers
    tickers = await _get_watchlist_tickers()
    await market_data_source.start(tickers)
    logger.info("Market data source started with %d tickers", len(tickers))

    # Start portfolio snapshot background task
    _snapshot_task = asyncio.create_task(_snapshot_loop(), name="snapshot-loop")

    yield

    # Shutdown
    if _snapshot_task and not _snapshot_task.done():
        _snapshot_task.cancel()
        try:
            await _snapshot_task
        except asyncio.CancelledError:
            pass

    await market_data_source.stop()
    logger.info("Application shutdown complete")


# Create the FastAPI app
app = FastAPI(
    title="FinAlly",
    description="AI-Powered Trading Workstation",
    version="0.1.0",
    lifespan=lifespan,
)

# Mount SSE streaming router
stream_router = create_stream_router(price_cache)
app.include_router(stream_router)

# Mount portfolio router
portfolio_router = create_portfolio_router(price_cache)
app.include_router(portfolio_router)

# Mount watchlist router
watchlist_router = create_watchlist_router(price_cache, market_data_source)
app.include_router(watchlist_router)

# Mount chat router
chat_router = create_chat_router(price_cache, market_data_source)
app.include_router(chat_router)


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "finally-backend"}


# Mount static files for the frontend (if the directory exists)
_static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
if os.path.isdir(_static_dir):
    app.mount("/", StaticFiles(directory=_static_dir, html=True), name="static")
