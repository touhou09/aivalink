import uuid

import pytest

from tests.conftest import auth_headers

pytestmark = pytest.mark.asyncio

class TestCharacterCRUD:
    async def test_create_character(self, client, auth_user):
        _, token = auth_user
        resp = await client.post("/api/characters/", json={
            "name": "Test Character",
            "persona_prompt": "You are a helpful AI assistant.",
            "live2d_model_id": "haru",
            "language": "ko",
            "emotion_map": {"neutral": "neutral", "happy": "happy"},
        }, headers=auth_headers(token))
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Test Character"
        assert data["live2d_model_id"] == "haru"
        assert "neutral" in data["emotion_map"]
        return data["id"]

    async def test_create_character_no_neutral_emotion(self, client, auth_user):
        _, token = auth_user
        resp = await client.post("/api/characters/", json={
            "name": "Bad Char",
            "persona_prompt": "Test",
            "emotion_map": {"happy": "happy"},
        }, headers=auth_headers(token))
        assert resp.status_code == 422

    async def test_create_character_duplicate_name(self, client, auth_user):
        _, token = auth_user
        body = {
            "name": "Duplicate Name Test",
            "persona_prompt": "Test prompt",
            "emotion_map": {"neutral": "neutral"},
        }
        resp1 = await client.post("/api/characters/", json=body, headers=auth_headers(token))
        assert resp1.status_code == 201
        resp2 = await client.post("/api/characters/", json=body, headers=auth_headers(token))
        assert resp2.status_code == 409

    async def test_list_characters(self, client, auth_user):
        _, token = auth_user
        # Create a character first
        await client.post("/api/characters/", json={
            "name": "List Test Char",
            "persona_prompt": "Test",
            "emotion_map": {"neutral": "neutral"},
        }, headers=auth_headers(token))

        resp = await client.get("/api/characters/", headers=auth_headers(token))
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert data["total"] >= 1

    async def test_get_character(self, client, auth_user):
        _, token = auth_user
        create_resp = await client.post("/api/characters/", json={
            "name": "Get Test Char",
            "persona_prompt": "Test",
            "emotion_map": {"neutral": "neutral"},
        }, headers=auth_headers(token))
        char_id = create_resp.json()["id"]

        resp = await client.get(f"/api/characters/{char_id}", headers=auth_headers(token))
        assert resp.status_code == 200
        assert resp.json()["name"] == "Get Test Char"

    async def test_get_character_not_found(self, client, auth_user):
        _, token = auth_user
        fake_id = str(uuid.uuid4())
        resp = await client.get(f"/api/characters/{fake_id}", headers=auth_headers(token))
        assert resp.status_code == 404

    async def test_update_character(self, client, auth_user):
        _, token = auth_user
        create_resp = await client.post("/api/characters/", json={
            "name": "Update Test Char",
            "persona_prompt": "Test",
            "emotion_map": {"neutral": "neutral"},
        }, headers=auth_headers(token))
        char_id = create_resp.json()["id"]

        resp = await client.put(f"/api/characters/{char_id}", json={
            "name": "Updated Char Name",
        }, headers=auth_headers(token))
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Char Name"

    async def test_delete_character(self, client, auth_user):
        _, token = auth_user
        create_resp = await client.post("/api/characters/", json={
            "name": "Delete Test Char",
            "persona_prompt": "Test",
            "emotion_map": {"neutral": "neutral"},
        }, headers=auth_headers(token))
        char_id = create_resp.json()["id"]

        resp = await client.delete(f"/api/characters/{char_id}", headers=auth_headers(token))
        assert resp.status_code == 204

        # Verify deleted
        get_resp = await client.get(f"/api/characters/{char_id}", headers=auth_headers(token))
        assert get_resp.status_code == 404

class TestCharacterOwnership:
    async def test_cannot_access_other_users_character(self, client, auth_user, db_session):
        """Create a character as one user, try to access as another"""
        _, token1 = auth_user

        # Create character as user1
        create_resp = await client.post("/api/characters/", json={
            "name": "User1 Char",
            "persona_prompt": "Test",
            "emotion_map": {"neutral": "neutral"},
        }, headers=auth_headers(token1))
        char_id = create_resp.json()["id"]

        # Create another user
        from app.core.security import create_access_token, hash_password
        from app.models.user import User
        user2_id = uuid.uuid4()
        user2 = User(
            id=user2_id,
            email=f"other-{user2_id.hex[:8]}@example.com",
            password_hash=hash_password("TestPass123!"),
            display_name="Other User",
        )
        db_session.add(user2)
        await db_session.flush()
        token2 = create_access_token(str(user2.id), user2.email)

        # Try to access user1's character as user2
        resp = await client.get(f"/api/characters/{char_id}", headers=auth_headers(token2))
        assert resp.status_code == 404

class TestLive2DModels:
    async def test_list_live2d_models(self, client, auth_user):
        _, token = auth_user
        resp = await client.get("/api/characters/live2d-models", headers=auth_headers(token))
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) > 0
        assert any(m["id"] == "haru" for m in data)
