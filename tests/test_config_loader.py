import os
import uuid

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.engine.config_loader import load_pipeline
from app.engine.pipeline import VTuberPipeline
from app.models.asr_config import ASRConfig
from app.models.character import Character
from app.models.llm_config import LLMConfig
from app.models.tts_config import TTSConfig
from app.utils.crypto import encrypt_value

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def full_character(db_session: AsyncSession):
    """Create a character with all configs for testing."""
    user_id = uuid.uuid4()

    # Create user first
    from app.core.security import hash_password
    from app.models.user import User

    user = User(
        id=user_id,
        email=f"loader-{user_id.hex[:8]}@test.com",
        password_hash=hash_password("TestPass123!"),
        display_name="Loader Test",
        auth_provider="local",
    )
    db_session.add(user)
    await db_session.flush()

    llm = LLMConfig(
        user_id=user_id,
        name="Test LLM",
        provider="stub",
        model_name="echo",
        api_key_enc=encrypt_value("sk-test"),
    )
    db_session.add(llm)
    await db_session.flush()

    tts = TTSConfig(
        user_id=user_id,
        name="Test TTS",
        engine="stub",
        voice_name="default",
    )
    db_session.add(tts)
    await db_session.flush()

    asr = ASRConfig(
        user_id=user_id,
        name="Test ASR",
        engine="stub",
        model_size="base",
        language="ko",
    )
    db_session.add(asr)
    await db_session.flush()

    char = Character(
        user_id=user_id,
        name="Test Char",
        persona_prompt="You are a test character.",
        emotion_map={"neutral": {"motion_group": "Idle", "motion_index": 0, "expression": "f00"}},
        llm_config_id=llm.id,
        tts_config_id=tts.id,
        asr_config_id=asr.id,
    )
    db_session.add(char)
    await db_session.flush()
    await db_session.refresh(char)

    return char


class TestConfigLoader:
    async def test_load_pipeline_test_mode(self, db_session, full_character):
        os.environ["TEST_MODE"] = "true"
        try:
            # Reimport settings to pick up env change
            import app.engine.config_loader as cl
            from app.config import Settings

            original = cl.settings
            cl.settings = Settings()

            pipeline = await cl.load_pipeline(db_session, full_character.id)
            assert isinstance(pipeline, VTuberPipeline)
            assert pipeline.character_name == "Test Char"

            cl.settings = original
        finally:
            os.environ.pop("TEST_MODE", None)

    async def test_load_pipeline_stub_engines(self, db_session, full_character):
        """Stub engines are registered in factory, so loading with stub provider works."""
        pipeline = await load_pipeline(db_session, full_character.id)
        assert isinstance(pipeline, VTuberPipeline)
        assert pipeline.character_name == "Test Char"

    async def test_load_pipeline_character_not_found(self, db_session):
        from app.core.exceptions import AppError

        with pytest.raises(AppError) as exc_info:
            await load_pipeline(db_session, uuid.uuid4())
        assert exc_info.value.code == "CHARACTER_NOT_FOUND"

    async def test_load_pipeline_missing_llm(self, db_session):
        from app.core.exceptions import AppError
        from app.models.user import User

        user_id = uuid.uuid4()
        from app.core.security import hash_password

        user = User(
            id=user_id,
            email=f"noconf-{user_id.hex[:8]}@test.com",
            password_hash=hash_password("TestPass123!"),
            display_name="No Config",
            auth_provider="local",
        )
        db_session.add(user)
        await db_session.flush()

        char = Character(
            user_id=user_id,
            name="No Config Char",
            persona_prompt="Test",
            emotion_map={"neutral": {}},
        )
        db_session.add(char)
        await db_session.flush()
        await db_session.refresh(char)

        from unittest.mock import patch
        with patch.object(settings, "TEST_MODE", False):
            with pytest.raises(AppError) as exc_info:
                await load_pipeline(db_session, char.id)
            assert exc_info.value.code == "LLM_CONFIG_REQUIRED"
