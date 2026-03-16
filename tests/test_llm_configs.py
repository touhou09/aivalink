import uuid

import pytest

from tests.conftest import auth_headers

pytestmark = pytest.mark.asyncio

class TestLLMConfigCRUD:
    async def test_create_with_api_key(self, client, auth_user):
        _, token = auth_user
        resp = await client.post("/api/llm-configs/", json={
            "name": "Test GPT-4",
            "provider": "openai",
            "model_name": "gpt-4o",
            "api_key": "sk-test-key-12345",
            "temperature": 0.7,
            "max_tokens": 2048,
        }, headers=auth_headers(token))
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Test GPT-4"
        assert data["has_api_key"] is True
        assert "api_key" not in data  # CRITICAL: api_key must NEVER appear in response
        assert "sk-test" not in str(data)  # Double check no key leakage

    async def test_create_without_api_key(self, client, auth_user):
        _, token = auth_user
        resp = await client.post("/api/llm-configs/", json={
            "name": "Test Ollama",
            "provider": "ollama",
            "model_name": "llama3",
            "base_url": "http://localhost:11434",
        }, headers=auth_headers(token))
        assert resp.status_code == 201
        assert resp.json()["has_api_key"] is False

    async def test_list_configs(self, client, auth_user):
        _, token = auth_user
        await client.post("/api/llm-configs/", json={
            "name": "List Test Config",
            "provider": "openai",
            "model_name": "gpt-4o",
        }, headers=auth_headers(token))

        resp = await client.get("/api/llm-configs/", headers=auth_headers(token))
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    async def test_get_config(self, client, auth_user):
        _, token = auth_user
        create = await client.post("/api/llm-configs/", json={
            "name": "Get Test Config",
            "provider": "openai",
            "model_name": "gpt-4o",
            "api_key": "sk-secret-key",
        }, headers=auth_headers(token))
        config_id = create.json()["id"]

        resp = await client.get(f"/api/llm-configs/{config_id}", headers=auth_headers(token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["has_api_key"] is True
        assert "api_key" not in data
        assert "sk-secret" not in str(data)

    async def test_update_config(self, client, auth_user):
        _, token = auth_user
        create = await client.post("/api/llm-configs/", json={
            "name": "Update Test",
            "provider": "openai",
            "model_name": "gpt-4o",
        }, headers=auth_headers(token))
        config_id = create.json()["id"]

        resp = await client.put(f"/api/llm-configs/{config_id}", json={
            "name": "Updated Name",
            "temperature": 0.9,
        }, headers=auth_headers(token))
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Name"
        assert resp.json()["temperature"] == 0.9

    async def test_update_api_key(self, client, auth_user):
        _, token = auth_user
        create = await client.post("/api/llm-configs/", json={
            "name": "Key Update Test",
            "provider": "openai",
            "model_name": "gpt-4o",
        }, headers=auth_headers(token))
        config_id = create.json()["id"]
        assert create.json()["has_api_key"] is False

        resp = await client.put(f"/api/llm-configs/{config_id}", json={
            "api_key": "sk-new-key",
        }, headers=auth_headers(token))
        assert resp.status_code == 200
        assert resp.json()["has_api_key"] is True

    async def test_delete_config(self, client, auth_user):
        _, token = auth_user
        create = await client.post("/api/llm-configs/", json={
            "name": "Delete Test",
            "provider": "openai",
            "model_name": "gpt-4o",
        }, headers=auth_headers(token))
        config_id = create.json()["id"]

        resp = await client.delete(f"/api/llm-configs/{config_id}", headers=auth_headers(token))
        assert resp.status_code == 204

        get_resp = await client.get(f"/api/llm-configs/{config_id}", headers=auth_headers(token))
        assert get_resp.status_code == 404

    async def test_get_not_found(self, client, auth_user):
        _, token = auth_user
        resp = await client.get(f"/api/llm-configs/{uuid.uuid4()}", headers=auth_headers(token))
        assert resp.status_code == 404

class TestLLMProviders:
    async def test_list_providers(self, client, auth_user):
        _, token = auth_user
        resp = await client.get("/api/llm-configs/providers", headers=auth_headers(token))
        assert resp.status_code == 200
        providers = resp.json()
        assert len(providers) > 0
        provider_ids = [p["id"] for p in providers]
        assert "openai" in provider_ids
