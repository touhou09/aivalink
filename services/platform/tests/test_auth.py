import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register_user(client: AsyncClient, test_user_data: dict):
    response = await client.post("/api/v1/auth/register", json=test_user_data)
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == test_user_data["email"]
    assert data["username"] == test_user_data["username"]
    assert "id" in data
    assert "hashed_password" not in data


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient, test_user_data: dict):
    # First registration
    await client.post("/api/v1/auth/register", json=test_user_data)

    # Duplicate email
    response = await client.post("/api/v1/auth/register", json=test_user_data)
    assert response.status_code == 400
    assert "already registered" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_register_duplicate_username(client: AsyncClient, test_user_data: dict):
    # First registration
    await client.post("/api/v1/auth/register", json=test_user_data)

    # Duplicate username
    test_user_data["email"] = "different@example.com"
    response = await client.post("/api/v1/auth/register", json=test_user_data)
    assert response.status_code == 400
    assert "already taken" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient, test_user_data: dict):
    # Register first
    await client.post("/api/v1/auth/register", json=test_user_data)

    # Login
    response = await client.post(
        "/api/v1/auth/login",
        data={
            "username": test_user_data["username"],
            "password": test_user_data["password"],
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_with_email(client: AsyncClient, test_user_data: dict):
    # Register first
    await client.post("/api/v1/auth/register", json=test_user_data)

    # Login with email
    response = await client.post(
        "/api/v1/auth/login",
        data={
            "username": test_user_data["email"],
            "password": test_user_data["password"],
        },
    )
    assert response.status_code == 200
    assert "access_token" in response.json()


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient, test_user_data: dict):
    # Register first
    await client.post("/api/v1/auth/register", json=test_user_data)

    # Login with wrong password
    response = await client.post(
        "/api/v1/auth/login",
        data={
            "username": test_user_data["username"],
            "password": "wrongpassword",
        },
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_me(client: AsyncClient, test_user_data: dict):
    # Register and login
    await client.post("/api/v1/auth/register", json=test_user_data)
    login_response = await client.post(
        "/api/v1/auth/login",
        data={
            "username": test_user_data["username"],
            "password": test_user_data["password"],
        },
    )
    token = login_response.json()["access_token"]

    # Get current user
    response = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == test_user_data["email"]
    assert data["username"] == test_user_data["username"]


@pytest.mark.asyncio
async def test_get_me_unauthorized(client: AsyncClient):
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 401
