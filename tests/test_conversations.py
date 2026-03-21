import uuid

import pytest

from app.models.character import Character
from app.models.conversation_log import ConversationLog
from tests.conftest import auth_headers

pytestmark = pytest.mark.asyncio


async def _create_character(db_session, user_id: uuid.UUID) -> Character:
    char = Character(
        id=uuid.uuid4(),
        user_id=user_id,
        name="Test Character",
        persona_prompt="You are a test character.",
        emotion_map={"neutral": {"motion_group": "Idle", "motion_index": 0, "expression": "f00"}},
    )
    db_session.add(char)
    await db_session.flush()
    await db_session.refresh(char)
    return char


async def _create_log(db_session, user_id: uuid.UUID, character_id: uuid.UUID, role: str = "user", content: str = "Hello") -> ConversationLog:
    log = ConversationLog(
        id=uuid.uuid4(),
        user_id=user_id,
        character_id=character_id,
        role=role,
        content=content,
    )
    db_session.add(log)
    await db_session.flush()
    await db_session.refresh(log)
    return log


class TestConversations:
    async def test_list_conversations(self, client, auth_user, db_session):
        user, token = auth_user
        char = await _create_character(db_session, user.id)

        await _create_log(db_session, user.id, char.id, role="user", content="Hello")
        await _create_log(db_session, user.id, char.id, role="assistant", content="Hi there!")

        resp = await client.get(f"/api/conversations/{char.id}", headers=auth_headers(token))
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        assert {d["role"] for d in data} == {"user", "assistant"}
        assert all("id" in d for d in data)
        assert all("created_at" in d for d in data)

    async def test_list_conversations_pagination(self, client, auth_user, db_session):
        user, token = auth_user
        char = await _create_character(db_session, user.id)

        for i in range(5):
            await _create_log(db_session, user.id, char.id, content=f"Message {i}")

        resp = await client.get(
            f"/api/conversations/{char.id}",
            params={"limit": 2, "offset": 0},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2

    async def test_list_conversations_empty(self, client, auth_user, db_session):
        user, token = auth_user
        char = await _create_character(db_session, user.id)

        resp = await client.get(f"/api/conversations/{char.id}", headers=auth_headers(token))
        assert resp.status_code == 200
        assert resp.json() == []
