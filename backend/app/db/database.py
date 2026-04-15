"""SQLite database initialization and connection management."""

from __future__ import annotations

import logging
import os
import uuid
from pathlib import Path

import aiosqlite

from .schema import DEFAULT_TICKERS, SCHEMA_SQL

logger = logging.getLogger(__name__)

# Resolve database path: DB_PATH env var, or default relative to project root
_DEFAULT_DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "..", "db", "finally.db")
DB_PATH = os.environ.get("DB_PATH", _DEFAULT_DB_PATH)


def _resolve_db_path() -> str:
    """Resolve the database file path, creating parent directories if needed."""
    path = os.environ.get("DB_PATH", _DEFAULT_DB_PATH)
    parent = os.path.dirname(os.path.abspath(path))
    os.makedirs(parent, exist_ok=True)
    return path


async def get_db() -> aiosqlite.Connection:
    """Open and return an aiosqlite connection with WAL mode and foreign keys."""
    path = _resolve_db_path()
    db = await aiosqlite.connect(path)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    return db


async def init_db() -> None:
    """Lazily initialize the database: create tables and seed defaults if needed.

    Safe to call multiple times — uses CREATE TABLE IF NOT EXISTS and checks
    before inserting seed data.
    """
    db = await get_db()
    try:
        # Create all tables
        await db.executescript(SCHEMA_SQL)
        await db.commit()

        # Seed default user if not exists
        cursor = await db.execute(
            "SELECT id FROM users_profile WHERE id = ?", ("default",)
        )
        user = await cursor.fetchone()
        if not user:
            await db.execute(
                "INSERT INTO users_profile (id, cash_balance) VALUES (?, ?)",
                ("default", 10000.0),
            )
            logger.info("Seeded default user with $10,000 cash")

        # Seed default watchlist tickers
        cursor = await db.execute(
            "SELECT COUNT(*) as cnt FROM watchlist WHERE user_id = ?", ("default",)
        )
        row = await cursor.fetchone()
        if row["cnt"] == 0:
            for ticker in DEFAULT_TICKERS:
                await db.execute(
                    "INSERT OR IGNORE INTO watchlist (id, user_id, ticker) VALUES (?, ?, ?)",
                    (str(uuid.uuid4()), "default", ticker),
                )
            logger.info("Seeded default watchlist with %d tickers", len(DEFAULT_TICKERS))

        await db.commit()
        logger.info("Database initialized at %s", _resolve_db_path())
    finally:
        await db.close()
