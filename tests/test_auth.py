import pytest

from tests.conftest import auth_headers

pytestmark = pytest.mark.asyncio


class TestRegister:
    async def test_register_success(self, client):
        resp = await client.post("/api/auth/register", json={
            "email": "newuser@example.com",
            "password": "SecureP@ss123",
            "display_name": "New User",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["email"] == "newuser@example.com"
        assert data["display_name"] == "New User"
        assert "id" in data

    async def test_register_duplicate_email(self, client, auth_user):
        user, _ = auth_user
        resp = await client.post("/api/auth/register", json={
            "email": user.email,
            "password": "SecureP@ss123",
            "display_name": "Dup",
        })
        assert resp.status_code == 409

    async def test_register_short_password(self, client):
        resp = await client.post("/api/auth/register", json={
            "email": "short@example.com",
            "password": "short",
            "display_name": "Short",
        })
        assert resp.status_code == 422

    async def test_register_invalid_email(self, client):
        resp = await client.post("/api/auth/register", json={
            "email": "not-an-email",
            "password": "SecureP@ss123",
            "display_name": "Bad Email",
        })
        assert resp.status_code == 422


class TestLogin:
    async def test_login_success(self, client, auth_user):
        user, _ = auth_user
        resp = await client.post("/api/auth/login", json={
            "email": user.email,
            "password": "TestPass123!",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    async def test_login_wrong_password(self, client, auth_user):
        user, _ = auth_user
        resp = await client.post("/api/auth/login", json={
            "email": user.email,
            "password": "WrongPass!",
        })
        assert resp.status_code == 401

    async def test_login_nonexistent_email(self, client):
        resp = await client.post("/api/auth/login", json={
            "email": "nobody@example.com",
            "password": "Whatever123!",
        })
        assert resp.status_code == 401


class TestRefresh:
    async def test_refresh_success(self, client, auth_user):
        user, _ = auth_user
        # First login to get a refresh token
        login_resp = await client.post("/api/auth/login", json={
            "email": user.email,
            "password": "TestPass123!",
        })
        refresh_token = login_resp.json()["refresh_token"]

        resp = await client.post("/api/auth/refresh", json={
            "refresh_token": refresh_token,
        })
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    async def test_refresh_invalid_token(self, client):
        resp = await client.post("/api/auth/refresh", json={
            "refresh_token": "invalid-token",
        })
        assert resp.status_code == 401


class TestLogout:
    async def test_logout_success(self, client, auth_user):
        _, token = auth_user
        resp = await client.post(
            "/api/auth/logout",
            json={"refresh_token": "some-refresh-token"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 204


class TestGoogleOAuth:
    async def test_google_redirect(self, client):
        resp = await client.get("/api/auth/google", follow_redirects=False)
        assert resp.status_code in (302, 307)
        assert "accounts.google.com" in resp.headers.get("location", "")
