import uuid

import pytest

from tests.conftest import auth_headers

pytestmark = pytest.mark.asyncio


class TestInstances:
    async def _create_full_character(self, client, token):
        """Helper: create LLM, TTS, ASR configs and a character with all three linked."""
        headers = auth_headers(token)

        # Create LLM config
        llm_resp = await client.post("/api/llm-configs/", json={
            "name": "Test LLM",
            "provider": "openai",
            "model_name": "gpt-4o",
            "api_key": "sk-test-key",
        }, headers=headers)
        llm_id = llm_resp.json()["id"]

        # Create TTS config
        tts_resp = await client.post("/api/tts-configs/", json={
            "name": "Test TTS",
            "engine": "edge_tts",
            "voice_name": "ko-KR-SunHiNeural",
        }, headers=headers)
        tts_id = tts_resp.json()["id"]

        # Create ASR config
        asr_resp = await client.post("/api/asr-configs/", json={
            "name": "Test ASR",
            "engine": "faster_whisper",
            "model_size": "base",
            "language": "ko",
        }, headers=headers)
        asr_id = asr_resp.json()["id"]

        # Create character with all configs
        char_resp = await client.post("/api/characters/", json={
            "name": "Test Character",
            "persona_prompt": "You are a test character.",
            "emotion_map": {"neutral": {"motion_group": "Idle", "motion_index": 0, "expression": "f00"}},
            "llm_config_id": llm_id,
            "tts_config_id": tts_id,
            "asr_config_id": asr_id,
        }, headers=headers)
        return char_resp.json()

    async def test_create_instance(self, client, auth_user):
        user, token = auth_user
        char = await self._create_full_character(client, token)

        resp = await client.post("/api/instances", json={
            "character_id": char["id"],
        }, headers=auth_headers(token))
        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "running"
        assert data["character_name"] == "Test Character"
        assert "websocket_url" in data

    async def test_create_instance_missing_llm(self, client, auth_user):
        user, token = auth_user
        headers = auth_headers(token)

        # Create character without configs
        char_resp = await client.post("/api/characters/", json={
            "name": "No Config Char",
            "persona_prompt": "Test",
            "emotion_map": {"neutral": {"motion_group": "Idle", "motion_index": 0, "expression": "f00"}},
        }, headers=headers)
        char_id = char_resp.json()["id"]

        resp = await client.post("/api/instances", json={
            "character_id": char_id,
        }, headers=headers)
        assert resp.status_code == 400

    async def test_instance_limit(self, client, auth_user):
        user, token = auth_user
        char = await self._create_full_character(client, token)
        headers = auth_headers(token)

        # First instance
        resp1 = await client.post("/api/instances", json={"character_id": char["id"]}, headers=headers)
        assert resp1.status_code == 201

        # Second instance should fail (limit=1)
        resp2 = await client.post("/api/instances", json={"character_id": char["id"]}, headers=headers)
        assert resp2.status_code == 429

    async def test_list_instances(self, client, auth_user):
        user, token = auth_user
        char = await self._create_full_character(client, token)
        headers = auth_headers(token)

        await client.post("/api/instances", json={"character_id": char["id"]}, headers=headers)

        resp = await client.get("/api/instances", headers=headers)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    async def test_get_instance_status(self, client, auth_user):
        user, token = auth_user
        char = await self._create_full_character(client, token)
        headers = auth_headers(token)

        create_resp = await client.post("/api/instances", json={"character_id": char["id"]}, headers=headers)
        instance_id = create_resp.json()["id"]

        resp = await client.get(f"/api/instances/{instance_id}/status", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["status"] == "running"

    async def test_stop_instance(self, client, auth_user):
        user, token = auth_user
        char = await self._create_full_character(client, token)
        headers = auth_headers(token)

        create_resp = await client.post("/api/instances", json={"character_id": char["id"]}, headers=headers)
        instance_id = create_resp.json()["id"]

        resp = await client.delete(f"/api/instances/{instance_id}", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["status"] == "stopped"

    async def test_stop_already_stopped(self, client, auth_user):
        user, token = auth_user
        char = await self._create_full_character(client, token)
        headers = auth_headers(token)

        create_resp = await client.post("/api/instances", json={"character_id": char["id"]}, headers=headers)
        instance_id = create_resp.json()["id"]

        await client.delete(f"/api/instances/{instance_id}", headers=headers)
        resp2 = await client.delete(f"/api/instances/{instance_id}", headers=headers)
        assert resp2.status_code == 400

    async def test_instance_not_found(self, client, auth_user):
        user, token = auth_user
        fake_id = str(uuid.uuid4())

        resp = await client.get(f"/api/instances/{fake_id}/status", headers=auth_headers(token))
        assert resp.status_code == 404
