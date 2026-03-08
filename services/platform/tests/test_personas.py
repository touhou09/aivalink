import pytest
from httpx import AsyncClient


async def get_auth_token(client: AsyncClient, user_data: dict) -> str:
    await client.post("/api/v1/auth/register", json=user_data)
    response = await client.post(
        "/api/v1/auth/login",
        data={"username": user_data["username"], "password": user_data["password"]},
    )
    return response.json()["access_token"]


@pytest.mark.asyncio
async def test_create_persona(
    client: AsyncClient, test_user_data: dict, test_persona_data: dict
):
    token = await get_auth_token(client, test_user_data)

    response = await client.post(
        "/api/v1/personas",
        json=test_persona_data,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == test_persona_data["name"]
    assert data["character_name"] == test_persona_data["character_name"]
    assert "id" in data


@pytest.mark.asyncio
async def test_list_personas(
    client: AsyncClient, test_user_data: dict, test_persona_data: dict
):
    token = await get_auth_token(client, test_user_data)

    # Create a persona
    await client.post(
        "/api/v1/personas",
        json=test_persona_data,
        headers={"Authorization": f"Bearer {token}"},
    )

    # List personas
    response = await client.get(
        "/api/v1/personas",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == test_persona_data["name"]


@pytest.mark.asyncio
async def test_get_persona(
    client: AsyncClient, test_user_data: dict, test_persona_data: dict
):
    token = await get_auth_token(client, test_user_data)

    # Create a persona
    create_response = await client.post(
        "/api/v1/personas",
        json=test_persona_data,
        headers={"Authorization": f"Bearer {token}"},
    )
    persona_id = create_response.json()["id"]

    # Get persona
    response = await client.get(
        f"/api/v1/personas/{persona_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == persona_id
    assert data["name"] == test_persona_data["name"]


@pytest.mark.asyncio
async def test_update_persona(
    client: AsyncClient, test_user_data: dict, test_persona_data: dict
):
    token = await get_auth_token(client, test_user_data)

    # Create a persona
    create_response = await client.post(
        "/api/v1/personas",
        json=test_persona_data,
        headers={"Authorization": f"Bearer {token}"},
    )
    persona_id = create_response.json()["id"]

    # Update persona
    update_data = {"name": "Updated Persona", "description": "Updated description"}
    response = await client.put(
        f"/api/v1/personas/{persona_id}",
        json=update_data,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Persona"
    assert data["description"] == "Updated description"


@pytest.mark.asyncio
async def test_delete_persona(
    client: AsyncClient, test_user_data: dict, test_persona_data: dict
):
    token = await get_auth_token(client, test_user_data)

    # Create a persona
    create_response = await client.post(
        "/api/v1/personas",
        json=test_persona_data,
        headers={"Authorization": f"Bearer {token}"},
    )
    persona_id = create_response.json()["id"]

    # Delete persona
    response = await client.delete(
        f"/api/v1/personas/{persona_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 204

    # Verify deletion
    get_response = await client.get(
        f"/api/v1/personas/{persona_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert get_response.status_code == 404


@pytest.mark.asyncio
async def test_get_persona_not_found(client: AsyncClient, test_user_data: dict):
    token = await get_auth_token(client, test_user_data)

    response = await client.get(
        "/api/v1/personas/nonexistent-id",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_persona_unauthorized(client: AsyncClient, test_persona_data: dict):
    response = await client.post("/api/v1/personas", json=test_persona_data)
    assert response.status_code == 401
