import pytest

from tests.conftest import auth_headers

pytestmark = pytest.mark.asyncio

class TestGetMe:
    async def test_get_me_success(self, client, auth_user):
        user, token = auth_user
        resp = await client.get("/api/users/me", headers=auth_headers(token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == user.email
        assert data["display_name"] == "Test User"

    async def test_get_me_no_auth(self, client):
        resp = await client.get("/api/users/me")
        assert resp.status_code in (401, 403)

    async def test_get_me_invalid_token(self, client):
        resp = await client.get("/api/users/me", headers=auth_headers("invalid-token"))
        assert resp.status_code in (401, 403)

class TestUpdateMe:
    async def test_update_display_name(self, client, auth_user):
        _, token = auth_user
        resp = await client.put("/api/users/me",
            json={"display_name": "Updated Name"},
            headers=auth_headers(token))
        assert resp.status_code == 200
        assert resp.json()["display_name"] == "Updated Name"

    async def test_update_avatar_url(self, client, auth_user):
        _, token = auth_user
        resp = await client.put("/api/users/me",
            json={"avatar_url": "https://example.com/avatar.png"},
            headers=auth_headers(token))
        assert resp.status_code == 200
        assert resp.json()["avatar_url"] == "https://example.com/avatar.png"

class TestDeleteMe:
    async def test_delete_me(self, client, auth_user):
        _, token = auth_user
        resp = await client.delete("/api/users/me", headers=auth_headers(token))
        assert resp.status_code == 204

        # After soft-delete, accessing /me should fail (user is inactive)
        resp2 = await client.get("/api/users/me", headers=auth_headers(token))
        assert resp2.status_code == 403
