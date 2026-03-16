import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.exceptions import AppError
from app.models.tts_config import TTSConfig
from app.models.user import User
from app.schemas.tts_config import TTSConfigCreate, TTSConfigResponse, TTSConfigUpdate

router = APIRouter(prefix="/api/tts-configs", tags=["tts-configs"])

SUPPORTED_ENGINES = [
    {
        "id": "edge-tts",
        "name": "Edge TTS",
        "voices": ["ko-KR-SunHiNeural", "ko-KR-InJoonNeural", "en-US-JennyNeural", "ja-JP-NanamiNeural"],
    },
    {
        "id": "google-tts",
        "name": "Google Cloud TTS",
        "voices": ["ko-KR-Standard-A", "ko-KR-Standard-B", "en-US-Standard-C"],
    },
    {
        "id": "rvc",
        "name": "RVC (Voice Conversion)",
        "voices": [],
    },
    {
        "id": "vits",
        "name": "VITS",
        "voices": [],
    },
    {
        "id": "custom",
        "name": "Custom TTS",
        "voices": [],
    },
]


@router.get("/engines")
async def list_engines():
    return SUPPORTED_ENGINES


@router.get("/", response_model=list[TTSConfigResponse])
async def list_tts_configs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TTSConfig).where(TTSConfig.user_id == current_user.id).order_by(TTSConfig.created_at.desc())
    )
    configs = result.scalars().all()
    return [TTSConfigResponse.model_validate(c) for c in configs]


@router.post("/", response_model=TTSConfigResponse, status_code=status.HTTP_201_CREATED)
async def create_tts_config(
    body: TTSConfigCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    config = TTSConfig(
        id=uuid.uuid4(),
        user_id=current_user.id,
        name=body.name,
        engine=body.engine,
        voice_name=body.voice_name,
        voice_model_file_id=body.voice_model_file_id,
        language=body.language,
        speed=body.speed,
        extra_params=body.extra_params,
    )
    db.add(config)
    await db.flush()
    await db.refresh(config)
    return TTSConfigResponse.model_validate(config)


@router.get("/{config_id}", response_model=TTSConfigResponse)
async def get_tts_config(
    config_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TTSConfig).where(TTSConfig.id == config_id, TTSConfig.user_id == current_user.id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise AppError("TTS_CONFIG_NOT_FOUND", "TTS config not found", 404)
    return TTSConfigResponse.model_validate(config)


@router.put("/{config_id}", response_model=TTSConfigResponse)
async def update_tts_config(
    config_id: uuid.UUID,
    body: TTSConfigUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TTSConfig).where(TTSConfig.id == config_id, TTSConfig.user_id == current_user.id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise AppError("TTS_CONFIG_NOT_FOUND", "TTS config not found", 404)

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(config, key, value)

    await db.flush()
    await db.refresh(config)
    return TTSConfigResponse.model_validate(config)


@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tts_config(
    config_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TTSConfig).where(TTSConfig.id == config_id, TTSConfig.user_id == current_user.id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise AppError("TTS_CONFIG_NOT_FOUND", "TTS config not found", 404)

    await db.delete(config)
    await db.flush()
    return None
