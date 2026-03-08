"""PgBouncer-aware asyncpg connection pool configuration.

When sitting behind PgBouncer in transaction-pooling mode:
- Statement-level prepared statements must be disabled (statement_cache_size=0)
  because PgBouncer does not multiplex the PostgreSQL named-statement namespace
  across clients.
- Server-side cursors should be avoided for the same reason.
- The pool min/max sizes here are per-process; tune to match PgBouncer's
  pool_size setting so the total connections to PostgreSQL stay bounded.
"""
from __future__ import annotations

import logging
import os

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlalchemy.pool import NullPool

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tuneable defaults (override via environment variables)
# ---------------------------------------------------------------------------
_POOL_MIN_SIZE: int = int(os.getenv("DB_POOL_MIN_SIZE", "2"))
_POOL_MAX_SIZE: int = int(os.getenv("DB_POOL_MAX_SIZE", "10"))
# How often (seconds) a connection is probed to verify it is still alive.
_POOL_HEALTH_CHECK_INTERVAL: int = int(os.getenv("DB_POOL_HEALTH_INTERVAL", "30"))


def build_engine(database_url: str, *, pgbouncer: bool = True) -> AsyncEngine:
    """Return a SQLAlchemy async engine tuned for the given URL.

    Parameters
    ----------
    database_url:
        Full asyncpg DSN, e.g.
        ``postgresql+asyncpg://user:pass@pgbouncer:5432/dbname``
    pgbouncer:
        When *True* (default) the engine is configured for PgBouncer
        transaction-pooling mode: prepared-statement cache is disabled and
        server-side parameters that break statement routing are suppressed.
        Set to *False* when connecting directly to PostgreSQL (e.g. in tests).
    """
    connect_args: dict = {}

    if pgbouncer:
        connect_args = {
            # Disable asyncpg's prepared-statement cache so every query is
            # sent as a simple query protocol message.  PgBouncer in
            # transaction mode cannot relay named prepared statements across
            # different backend connections.
            "statement_cache_size": 0,
            # Suppress asyncpg's startup "SET" commands that PgBouncer
            # would forward as extra protocol messages.
            "server_settings": {},
        }
        logger.info(
            "DB pool: PgBouncer mode — statement cache disabled, "
            "min=%d max=%d health_check_interval=%ds",
            _POOL_MIN_SIZE,
            _POOL_MAX_SIZE,
            _POOL_HEALTH_CHECK_INTERVAL,
        )
    else:
        logger.info(
            "DB pool: direct mode — min=%d max=%d",
            _POOL_MIN_SIZE,
            _POOL_MAX_SIZE,
        )

    engine = create_async_engine(
        database_url,
        # asyncpg pool settings
        pool_size=_POOL_MIN_SIZE,
        max_overflow=_POOL_MAX_SIZE - _POOL_MIN_SIZE,
        pool_pre_ping=True,
        pool_recycle=_POOL_HEALTH_CHECK_INTERVAL,
        connect_args=connect_args,
        # Echo SQL only when DEBUG env var is set
        echo=os.getenv("DB_ECHO", "").lower() in ("1", "true", "yes"),
    )
    return engine


def build_engine_nullpool(database_url: str, *, pgbouncer: bool = True) -> AsyncEngine:
    """Return an engine that uses NullPool (no connection reuse).

    Useful for Alembic migrations and one-shot scripts where a persistent
    pool would prevent the process from exiting cleanly.
    """
    connect_args: dict = {}
    if pgbouncer:
        connect_args = {"statement_cache_size": 0, "server_settings": {}}

    return create_async_engine(
        database_url,
        poolclass=NullPool,
        connect_args=connect_args,
        echo=os.getenv("DB_ECHO", "").lower() in ("1", "true", "yes"),
    )
