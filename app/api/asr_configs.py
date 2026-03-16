import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.exceptions import AppError
from app.models.asr_config import ASRConfig
from app.models.user import User
from app.schemas.asr_config import ASRConfigCreate, ASRConfigResponse, ASRConfigUpdate

router = APIRouter(prefix="/api/asr-configs", tags=["asr-configs"])

SUPPORTED_ENGINES = [
    {
        "id": "whisper",
        "name": "OpenAI Whisper",
        "model_sizes": ["tiny", "base", "small", "medium", "large"],
    },
    {
        "id": "faster-whisper",
        "name": "Faster Whisper",
        "model_sizes": ["tiny", "base", "small", "medium", "large-v2", "large-v3"],
    },
    {
        "id": "google-stt",
        "name": "Google Cloud STT",
        "model_sizes": ["default"],
    },
    {
        "id": "custom",
        "name": "Custom ASR",
        "model_sizes": [],
    },
]


@router.get("/engines")
async def list_engines():
    return SUPPORTED_ENGINES


@router.get("/", response_model=list[ASRConfigResponse])
async def list_asr_configs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ASRConfig).where(ASRConfig.user_id == current_user.id).order_by(ASRConfig.created_at.desc())
    )
    configs = result.scalars().all()
    return [ASRConfigResponse.model_validate(c) for c in configs]


@router.post("/", response_model=ASRConfigResponse, status_code=status.HTTP_201_CREATED)
async def create_asr_config(
    body: ASRConfigCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    config = ASRConfig(
        id=uuid.uuid4(),
        user_id=current_user.id,
        name=body.name,
        engine=body.engine,
        model_size=body.model_size,
        language=body.language,
        extra_params=body.extra_params,
    )
    db.add(config)
    await db.flush()
    await db.refresh(config)
    return ASRConfigResponse.model_validate(config)


@router.get("/{config_id}", response_model=ASRConfigResponse)
async def get_asr_config(
    config_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ASRConfig).where(ASRConfig.id == config_id, ASRConfig.user_id == current_user.id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise AppError("ASR_CONFIG_NOT_FOUND", "ASR config not found", 404)
    return ASRConfigResponse.model_validate(config)


@router.put("/{config_id}", response_model=ASRConfigResponse)
async def update_asr_config(
    config_id: uuid.UUID,
    body: ASRConfigUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ASRConfig).where(ASRConfig.id == config_id, ASRConfig.user_id == current_user.id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise AppError("ASR_CONFIG_NOT_FOUND", "ASR config not found", 404)

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(config, key, value)

    await db.flush()
    await db.refresh(config)
    return ASRConfigResponse.model_validate(config)


@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_asr_config(
    config_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ASRConfig).where(ASRConfig.id == config_id, ASRConfig.user_id == current_user.id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise AppError("ASR_CONFIG_NOT_FOUND", "ASR config not found", 404)

    await db.delete(config)
    await db.flush()
    return None
