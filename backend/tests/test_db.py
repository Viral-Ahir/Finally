"""Tests for database initialization and seeding."""

import os
import tempfile

import pytest

from app.db.schema import DEFAULT_TICKERS


@pytest.fixture
async def temp_db():
    """Create a temporary database for testing."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test.db")
        os.environ["DB_PATH"] = db_path
        yield db_path
        os.environ.pop("DB_PATH", None)


class TestDatabaseInit:
    async def test_init_creates_tables(self, temp_db):
        from app.db import get_db, init_db

        await init_db()
        db = await get_db()
        try:
            cursor = await db.execute(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            )
            tables = [row["name"] for row in await cursor.fetchall()]
            assert "users_profile" in tables
            assert "watchlist" in tables
            assert "positions" in tables
            assert "trades" in tables
            assert "portfolio_snapshots" in tables
            assert "chat_messages" in tables
        finally:
            await db.close()

    async def test_init_seeds_default_user(self, temp_db):
        from app.db import get_db, init_db

        await init_db()
        db = await get_db()
        try:
            cursor = await db.execute(
                "SELECT id, cash_balance FROM users_profile WHERE id = 'default'"
            )
            user = await cursor.fetchone()
            assert user is not None
            assert user["id"] == "default"
            assert user["cash_balance"] == 10000.0
        finally:
            await db.close()

    async def test_init_seeds_default_watchlist(self, temp_db):
        from app.db import get_db, init_db

        await init_db()
        db = await get_db()
        try:
            cursor = await db.execute(
                "SELECT ticker FROM watchlist WHERE user_id = 'default' ORDER BY ticker"
            )
            rows = await cursor.fetchall()
            tickers = sorted([row["ticker"] for row in rows])
            assert tickers == sorted(DEFAULT_TICKERS)
        finally:
            await db.close()

    async def test_init_is_idempotent(self, temp_db):
        from app.db import get_db, init_db

        await init_db()
        await init_db()  # Should not raise or duplicate data

        db = await get_db()
        try:
            cursor = await db.execute(
                "SELECT COUNT(*) as cnt FROM users_profile"
            )
            row = await cursor.fetchone()
            assert row["cnt"] == 1

            cursor = await db.execute(
                "SELECT COUNT(*) as cnt FROM watchlist"
            )
            row = await cursor.fetchone()
            assert row["cnt"] == len(DEFAULT_TICKERS)
        finally:
            await db.close()
