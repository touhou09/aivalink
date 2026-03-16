import uuid

import pytest

from tests.conftest import auth_headers

pytestmark = pytest.mark.asyncio

class TestASRConfigCRUD:
    async def test_create(self, client, auth_user):
        _, token = auth_user
        resp = await client.post("/api/asr-configs/", json={
            "name": "Test Whisper",
            "engine": "whisper",
            "model_size": "base",
            "language": "ko",
        }, headers=auth_headers(token))
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Test Whisper"
        assert data["engine"] == "whisper"

    async def test_list(self, client, auth_user):
        _, token = auth_user
        await client.post("/api/asr-configs/", json={
            "name": "List ASR Test",
            "engine": "whisper",
        }, headers=auth_headers(token))

        resp = await client.get("/api/asr-configs/", headers=auth_headers(token))
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    async def test_get(self, client, auth_user):
        _, token = auth_user
        create = await client.post("/api/asr-configs/", json={
            "name": "Get ASR Test",
            "engine": "whisper",
        }, headers=auth_headers(token))
        config_id = create.json()["id"]

        resp = await client.get(f"/api/asr-configs/{config_id}", headers=auth_headers(token))
        assert resp.status_code == 200

    async def test_update(self, client, auth_user):
        _, token = auth_user
        create = await client.post("/api/asr-configs/", json={
            "name": "Update ASR Test",
            "engine": "whisper",
        }, headers=auth_headers(token))
        config_id = create.json()["id"]

        resp = await client.put(f"/api/asr-configs/{config_id}", json={
            "model_size": "large",
        }, headers=auth_headers(token))
        assert resp.status_code == 200
        assert resp.json()["model_size"] == "large"

    async def test_delete(self, client, auth_user):
        _, token = auth_user
        create = await client.post("/api/asr-configs/", json={
            "name": "Delete ASR Test",
            "engine": "whisper",
        }, headers=auth_headers(token))
        config_id = create.json()["id"]

        resp = await client.delete(f"/api/asr-configs/{config_id}", headers=auth_headers(token))
        assert resp.status_code == 204

    async def test_not_found(self, client, auth_user):
        _, token = auth_user
        resp = await client.get(f"/api/asr-configs/{uuid.uuid4()}", headers=auth_headers(token))
        assert resp.status_code == 404

class TestASREngines:
    async def test_list_engines(self, client, auth_user):
        _, token = auth_user
        resp = await client.get("/api/asr-configs/engines", headers=auth_headers(token))
        assert resp.status_code == 200
        assert len(resp.json()) > 0
