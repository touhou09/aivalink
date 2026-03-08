"""Row-Level Security helpers for multi-tenant session isolation.

Usage in route dependencies:
    db: AsyncSession = Depends(get_rls_db)

This replaces the plain get_db dependency for all authenticated endpoints.
The current user's ID is set as a PostgreSQL session-local variable so that
RLS policies (WHERE user_id = current_setting('app.current_user_id')) apply
automatically to every query within that request's session.
"""
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional

from fastapi import Depends, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import AsyncSessionLocal


async def _set_rls_context(
    session: AsyncSession,
    user_id: Optional[str],
    *,
    is_admin: bool = False,
) -> None:
    """Set PostgreSQL session-local variables for RLS.

    Uses SET LOCAL so the settings are scoped to the current transaction
    and automatically cleared when the transaction ends.
    """
    if user_id:
        await session.execute(
            text("SET LOCAL app.current_user_id = :uid"),
            {"uid": user_id},
        )
    if is_admin:
        await session.execute(text("SET LOCAL app.is_admin = 'true'"))


@asynccontextmanager
async def rls_session(
    user_id: Optional[str],
    *,
    is_admin: bool = False,
) -> AsyncGenerator[AsyncSession, None]:
    """Async context manager that yields a session with RLS variables set.

    Example::

        async with rls_session(current_user.id) as db:
            result = await db.execute(select(Persona))
    """
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await _set_rls_context(session, user_id, is_admin=is_admin)
            try:
                yield session
            except Exception:
                await session.rollback()
                raise


# ---------------------------------------------------------------------------
# FastAPI dependency injection
# ---------------------------------------------------------------------------

def get_rls_db(request: Request):
    """FastAPI dependency that provides an RLS-scoped AsyncSession.

    Reads the authenticated user's ID from request.state.user_id, which must
    be populated by authentication middleware or a prior dependency before this
    dependency is invoked.

    Usage::

        @router.get("/personas")
        async def list_personas(db: AsyncSession = Depends(get_rls_db)):
            ...
    """
    return _rls_db_generator(request)


async def _rls_db_generator(request: Request) -> AsyncGenerator[AsyncSession, None]:
    user_id: Optional[str] = getattr(request.state, "user_id", None)
    is_admin: bool = getattr(request.state, "is_admin", False)

    async with AsyncSessionLocal() as session:
        async with session.begin():
            await _set_rls_context(session, user_id, is_admin=is_admin)
            try:
                yield session
            except Exception:
                await session.rollback()
                raise


# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------

class RLSMiddleware:
    """ASGI middleware that injects RLS context into request.state.

    This middleware reads the authenticated user ID from request.state.user_id
    (set by earlier auth middleware such as JWT validation) and makes it
    available for the get_rls_db dependency.

    It does NOT set the PostgreSQL variable itself — that is done lazily by
    get_rls_db when the DB session is first acquired, ensuring SET LOCAL is
    scoped to the request's transaction.

    Register in main.py AFTER authentication middleware::

        app.add_middleware(RLSMiddleware)
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            # Ensure user_id and is_admin exist on state even if auth has not
            # populated them yet; downstream auth dependencies will overwrite.
            request = Request(scope)
            if not hasattr(request.state, "user_id"):
                request.state.user_id = None
            if not hasattr(request.state, "is_admin"):
                request.state.is_admin = False
        await self.app(scope, receive, send)
