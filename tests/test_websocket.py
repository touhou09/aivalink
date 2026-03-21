"""WebSocket tests using starlette TestClient (sync, separate event loop)."""

import base64
import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.security import create_access_token, hash_password
from app.models.asr_config import ASRConfig
from app.models.base import Base
from app.models.character import Character
from app.models.instance import Instance
from app.models.llm_config import LLMConfig
from app.models.tts_config import TTSConfig
from app.models.user import User
from app.utils.crypto import encrypt_value


def _setup_ws_test_data(sync_url: str):
    """Insert test data using sync ORM session."""
    engine = create_engine(sync_url)
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine)

    with factory() as session:
        user_id = uuid.uuid4()
        user = User(
            id=user_id,
            email=f"ws-{user_id.hex[:8]}@test.com",
            password_hash=hash_password("TestPass123!"),
            display_name="WS Test",
            auth_provider="local",
        )
        session.add(user)
        session.flush()

        llm = LLMConfig(
            user_id=user_id, name="WS LLM", provider="stub",
            model_name="echo", api_key_enc=encrypt_value("sk-test"),
        )
        tts = TTSConfig(
            user_id=user_id, name="WS TTS", engine="stub",
            voice_name="default",
        )
        asr = ASRConfig(
            user_id=user_id, name="WS ASR", engine="stub",
            model_size="base", language="ko",
        )
        session.add_all([llm, tts, asr])
        session.flush()

        char = Character(
            user_id=user_id, name="WS Character",
            persona_prompt="Test persona",
            emotion_map={"neutral": {"motion_group": "Idle", "motion_index": 0, "expression": "f00"}},
            llm_config_id=llm.id, tts_config_id=tts.id, asr_config_id=asr.id,
        )
        session.add(char)
        session.flush()

        instance = Instance(
            user_id=user_id, character_id=char.id,
            status="running", started_at=datetime.now(UTC),
        )
        session.add(instance)
        session.flush()

        instance_id = instance.id
        session.commit()

    token = create_access_token(str(user_id), f"ws-{user_id.hex[:8]}@test.com")
    return {"instance_id": instance_id, "token": token, "engine": engine}


class TestWebSocket:
    @pytest.fixture(scope="class")
    def ws_env(self, postgres_url):
        """Set up WS test environment with its own sync data."""
        sync_url = postgres_url.replace("asyncpg", "psycopg2")
        data = _setup_ws_test_data(sync_url)

        async_engine = create_async_engine(postgres_url, poolclass=NullPool)
        factory = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)

        from app.ws.handler import set_session_factory
        set_session_factory(factory)

        yield {**data, "async_engine": async_engine}

        set_session_factory(None)
        import asyncio
        asyncio.get_event_loop_policy().get_event_loop()
        data["engine"].dispose()

    def _get_client(self):
        from starlette.testclient import TestClient

        from app.main import app
        return TestClient(app)

    def test_ping_pong(self, ws_env):
        instance_id = ws_env["instance_id"]
        token = ws_env["token"]

        with self._get_client() as tc:
            with tc.websocket_connect(f"/client-ws/{instance_id}?token={token}") as ws:
                data = ws.receive_json()
                assert data["type"] == "connected"
                assert data["data"]["character"]["name"] == "WS Character"

                ws.send_json({"type": "ping", "data": {}})
                pong = ws.receive_json()
                assert pong["type"] == "pong"

    def _receive_msg(self, ws):
        """Receive next message; skip binary frames, return parsed JSON."""
        while True:
            raw = ws.receive()
            if "bytes" in raw:
                continue  # binary audio frame — skip
            import json
            return json.loads(raw["text"])

    def test_text_input(self, ws_env):
        instance_id = ws_env["instance_id"]
        token = ws_env["token"]

        with self._get_client() as tc:
            with tc.websocket_connect(f"/client-ws/{instance_id}?token={token}") as ws:
                connected = ws.receive_json()
                assert connected["type"] == "connected"

                ws.send_json({"type": "text-input", "data": {"text": "hello"}})

                messages = []
                while True:
                    msg = self._receive_msg(ws)
                    messages.append(msg)
                    if msg["type"] == "audio-chunk-meta" and msg["data"].get("is_final"):
                        break

                types = [m["type"] for m in messages]
                assert "text-chunk" in types
                assert "text-complete" in types
                assert "emotion" in types
                assert "audio-chunk-meta" in types

                complete = next(m for m in messages if m["type"] == "text-complete")
                assert "Echo: hello" in complete["data"]["full_text"]

    def test_no_token_rejected(self, ws_env):
        instance_id = ws_env["instance_id"]

        with self._get_client() as tc:
            with pytest.raises(Exception):
                with tc.websocket_connect(f"/client-ws/{instance_id}") as ws:
                    ws.receive_json()

    def test_invalid_token_rejected(self, ws_env):
        instance_id = ws_env["instance_id"]

        with self._get_client() as tc:
            with pytest.raises(Exception):
                with tc.websocket_connect(f"/client-ws/{instance_id}?token=invalid") as ws:
                    ws.receive_json()

    def test_interrupt(self, ws_env):
        instance_id = ws_env["instance_id"]
        token = ws_env["token"]

        with self._get_client() as tc:
            with tc.websocket_connect(f"/client-ws/{instance_id}?token={token}") as ws:
                connected = ws.receive_json()
                assert connected["type"] == "connected"

                ws.send_json({"type": "interrupt", "data": {}})
                ws.send_json({"type": "ping", "data": {}})
                pong = ws.receive_json()
                assert pong["type"] == "pong"

    def test_audio_input(self, ws_env):
        instance_id = ws_env["instance_id"]
        token = ws_env["token"]
        audio_b64 = base64.b64encode(b"fake audio data").decode()

        with self._get_client() as tc:
            with tc.websocket_connect(f"/client-ws/{instance_id}?token={token}") as ws:
                connected = ws.receive_json()
                assert connected["type"] == "connected"

                ws.send_json({"type": "audio-input", "data": {"audio": audio_b64}})

                messages = []
                while True:
                    msg = self._receive_msg(ws)
                    messages.append(msg)
                    if msg["type"] == "audio-chunk-meta" and msg["data"].get("is_final"):
                        break

                types = [m["type"] for m in messages]
                assert "user-transcript" in types
                assert "text-chunk" in types
                assert "text-complete" in types
                assert "emotion" in types
                assert "audio-chunk-meta" in types

                transcript = next(m for m in messages if m["type"] == "user-transcript")
                assert transcript["data"]["text"] == "Hello from stub ASR"

    def test_invalid_json(self, ws_env):
        instance_id = ws_env["instance_id"]
        token = ws_env["token"]

        with self._get_client() as tc:
            with tc.websocket_connect(f"/client-ws/{instance_id}?token={token}") as ws:
                connected = ws.receive_json()
                assert connected["type"] == "connected"

                ws.send_text("not json at all")
                error = ws.receive_json()
                assert error["type"] == "error"
                assert error["data"]["code"] == "INVALID_MESSAGE"
