import uuid

import pytest

from tests.conftest import auth_headers

pytestmark = pytest.mark.asyncio

class TestTTSConfigCRUD:
    async def test_create(self, client, auth_user):
        _, token = auth_user
        resp = await client.post("/api/tts-configs/", json={
            "name": "Test Edge TTS",
            "engine": "edge-tts",
            "voice_name": "ko-KR-SunHiNeural",
            "language": "ko",
            "speed": 1.0,
        }, headers=auth_headers(token))
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Test Edge TTS"
        assert data["engine"] == "edge-tts"

    async def test_list(self, client, auth_user):
        _, token = auth_user
        await client.post("/api/tts-configs/", json={
            "name": "List TTS Test",
            "engine": "edge-tts",
        }, headers=auth_headers(token))

        resp = await client.get("/api/tts-configs/", headers=auth_headers(token))
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    async def test_get(self, client, auth_user):
        _, token = auth_user
        create = await client.post("/api/tts-configs/", json={
            "name": "Get TTS Test",
            "engine": "edge-tts",
        }, headers=auth_headers(token))
        config_id = create.json()["id"]

        resp = await client.get(f"/api/tts-configs/{config_id}", headers=auth_headers(token))
        assert resp.status_code == 200

    async def test_update(self, client, auth_user):
        _, token = auth_user
        create = await client.post("/api/tts-configs/", json={
            "name": "Update TTS Test",
            "engine": "edge-tts",
        }, headers=auth_headers(token))
        config_id = create.json()["id"]

        resp = await client.put(f"/api/tts-configs/{config_id}", json={
            "speed": 1.5,
        }, headers=auth_headers(token))
        assert resp.status_code == 200
        assert resp.json()["speed"] == 1.5

    async def test_delete(self, client, auth_user):
        _, token = auth_user
        create = await client.post("/api/tts-configs/", json={
            "name": "Delete TTS Test",
            "engine": "edge-tts",
        }, headers=auth_headers(token))
        config_id = create.json()["id"]

        resp = await client.delete(f"/api/tts-configs/{config_id}", headers=auth_headers(token))
        assert resp.status_code == 204

    async def test_not_found(self, client, auth_user):
        _, token = auth_user
        resp = await client.get(f"/api/tts-configs/{uuid.uuid4()}", headers=auth_headers(token))
        assert resp.status_code == 404

class TestTTSEngines:
    async def test_list_engines(self, client, auth_user):
        _, token = auth_user
        resp = await client.get("/api/tts-configs/engines", headers=auth_headers(token))
        assert resp.status_code == 200
        assert len(resp.json()) > 0
