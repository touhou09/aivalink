import os
import uuid
from collections.abc import AsyncGenerator

os.environ.setdefault("TEST_MODE", "true")
os.environ.setdefault("DOCKER_HOST", "unix:///Users/yuseungju/.colima/default/docker.sock")
os.environ.setdefault("TESTCONTAINERS_RYUK_DISABLED", "true")
# Provide valid test credentials so crypto/auth utils work in test environment
os.environ.setdefault("FERNET_KEY", "28x983F4MzujsJW7uZMr20OohquAcHFJ8fjqwagnKpk=")
os.environ.setdefault("JWT_SECRET_KEY", "test-jwt-secret-key-for-testing-only")

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from testcontainers.postgres import PostgresContainer

from app.core.security import create_access_token
from app.models.base import Base


# Session-scoped postgres container (sync fixture)
@pytest.fixture(scope="session")
def postgres_url():
    with PostgresContainer("postgres:16-alpine") as postgres:
        url = postgres.get_connection_url().replace("psycopg2", "asyncpg")
        yield url


# Function-scoped: engine + tables + session + rollback for test isolation
@pytest_asyncio.fixture
async def db_session(postgres_url) -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine(postgres_url)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    connection = await engine.connect()
    transaction = await connection.begin()
    session_factory = async_sessionmaker(bind=connection, class_=AsyncSession, expire_on_commit=False)
    session = session_factory()

    yield session

    await session.close()
    await transaction.rollback()
    await connection.close()

    # Drop all tables after each test for clean state
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


# Override app dependencies
@pytest_asyncio.fixture
async def client(db_session) -> AsyncGenerator[AsyncClient, None]:
    from app.api.deps import get_db
    from app.main import app

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


# Helper: create a test user in DB and return (user, token)
@pytest_asyncio.fixture
async def auth_user(db_session):
    from app.core.security import hash_password
    from app.models.user import User

    user_id = uuid.uuid4()
    user = User(
        id=user_id,
        email=f"test-{user_id.hex[:8]}@example.com",
        password_hash=hash_password("TestPass123!"),
        display_name="Test User",
        auth_provider="local",
    )
    db_session.add(user)
    await db_session.flush()
    await db_session.refresh(user)

    token = create_access_token(str(user.id), user.email)
    return user, token


# Helper function
def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
