import uuid

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import AppError
from app.engine.factory import ASRFactory, LLMFactory, TTSFactory
from app.engine.pipeline import VTuberPipeline
from app.models.asr_config import ASRConfig
from app.models.character import Character
from app.models.llm_config import LLMConfig
from app.models.tts_config import TTSConfig
from app.utils.crypto import decrypt_value

logger = structlog.get_logger(__name__)


async def load_pipeline(db: AsyncSession, character_id: uuid.UUID) -> VTuberPipeline:
    """Load a VTuberPipeline from DB config for the given character."""
    result = await db.execute(select(Character).where(Character.id == character_id))
    character = result.scalar_one_or_none()
    if not character:
        raise AppError("CHARACTER_NOT_FOUND", "Character not found", 404)

    # In test mode, use stub engines
    if settings.TEST_MODE:
        asr = ASRFactory.create("stub")
        llm = LLMFactory.create("stub")
        tts = TTSFactory.create("stub")
        return VTuberPipeline(
            asr=asr,
            llm=llm,
            tts=tts,
            character_name=character.name,
            emotion_map=character.emotion_map or {},
        )

    # Load configs from DB
    if not character.llm_config_id:
        raise AppError("LLM_CONFIG_REQUIRED", "Character must have an LLM config", 400)
    if not character.tts_config_id:
        raise AppError("TTS_CONFIG_REQUIRED", "Character must have a TTS config", 400)
    if not character.asr_config_id:
        raise AppError("ASR_CONFIG_REQUIRED", "Character must have an ASR config", 400)

    # LLM config
    llm_result = await db.execute(select(LLMConfig).where(LLMConfig.id == character.llm_config_id))
    llm_config = llm_result.scalar_one_or_none()
    if not llm_config:
        raise AppError("LLM_CONFIG_NOT_FOUND", "LLM config not found", 404)

    llm_kwargs: dict = {
        "model": llm_config.model_name,
        "temperature": llm_config.temperature or 0.7,
        "max_tokens": llm_config.max_tokens or 2048,
    }
    if llm_config.api_key_enc:
        llm_kwargs["api_key"] = decrypt_value(llm_config.api_key_enc)
    if llm_config.base_url:
        llm_kwargs["base_url"] = llm_config.base_url

    llm = LLMFactory.create(llm_config.provider, **llm_kwargs)

    # TTS config
    tts_result = await db.execute(select(TTSConfig).where(TTSConfig.id == character.tts_config_id))
    tts_config = tts_result.scalar_one_or_none()
    if not tts_config:
        raise AppError("TTS_CONFIG_NOT_FOUND", "TTS config not found", 404)

    tts_kwargs: dict = {}
    if tts_config.voice_name:
        tts_kwargs["voice"] = tts_config.voice_name
    if tts_config.speed and tts_config.speed != 1.0:
        rate_pct = int((tts_config.speed - 1.0) * 100)
        tts_kwargs["rate"] = f"{rate_pct:+d}%"

    tts = TTSFactory.create(tts_config.engine, **tts_kwargs)

    # ASR config
    asr_result = await db.execute(select(ASRConfig).where(ASRConfig.id == character.asr_config_id))
    asr_config = asr_result.scalar_one_or_none()
    if not asr_config:
        raise AppError("ASR_CONFIG_NOT_FOUND", "ASR config not found", 404)

    asr_kwargs: dict = {}
    if asr_config.model_size:
        asr_kwargs["model_size"] = asr_config.model_size
    if asr_config.language:
        asr_kwargs["language"] = asr_config.language

    asr = ASRFactory.create(asr_config.engine, **asr_kwargs)

    pipeline = VTuberPipeline(
        asr=asr,
        llm=llm,
        tts=tts,
        character_name=character.name,
        emotion_map=character.emotion_map or {},
    )
    logger.info("pipeline_loaded", character_id=str(character_id), character_name=character.name)
    return pipeline
