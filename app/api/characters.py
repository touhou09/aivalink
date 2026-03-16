import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.exceptions import AppError
from app.models.character import Character
from app.models.user import User
from app.schemas.character import (
    CharacterCreate,
    CharacterListResponse,
    CharacterResponse,
    CharacterUpdate,
)

router = APIRouter(prefix="/api/characters", tags=["characters"])

AVAILABLE_LIVE2D_MODELS = [
    {"id": "haru", "name": "Haru", "description": "Default character model"},
    {"id": "hiyori", "name": "Hiyori", "description": "Casual character model"},
    {"id": "mao", "name": "Mao", "description": "Energetic character model"},
    {"id": "natori", "name": "Natori", "description": "Professional character model"},
    {"id": "rice", "name": "Rice", "description": "Cute character model"},
]


@router.get("/", response_model=CharacterListResponse)
async def list_characters(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Character).where(Character.user_id == current_user.id).order_by(Character.created_at.desc())
    )
    characters = list(result.scalars().all())
    return CharacterListResponse(
        items=[CharacterResponse.model_validate(c) for c in characters],
        total=len(characters),
    )


@router.post("/", response_model=CharacterResponse, status_code=status.HTTP_201_CREATED)
async def create_character(
    body: CharacterCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Check name uniqueness within user
    result = await db.execute(
        select(Character).where(Character.user_id == current_user.id, Character.name == body.name)
    )
    if result.scalar_one_or_none():
        raise AppError("CHARACTER_NAME_EXISTS", "Character name already exists", 409)

    # Validate config ownership if provided
    from app.models.asr_config import ASRConfig
    from app.models.llm_config import LLMConfig
    from app.models.tts_config import TTSConfig

    for config_id, model_cls, label in [
        (body.llm_config_id, LLMConfig, "LLM config"),
        (body.tts_config_id, TTSConfig, "TTS config"),
        (body.asr_config_id, ASRConfig, "ASR config"),
    ]:
        if config_id:
            res = await db.execute(select(model_cls).where(model_cls.id == config_id))
            cfg = res.scalar_one_or_none()
            if not cfg or cfg.user_id != current_user.id:
                raise AppError("CONFIG_NOT_FOUND", f"{label} not found", 404)

    character = Character(
        id=uuid.uuid4(),
        user_id=current_user.id,
        name=body.name,
        persona_prompt=body.persona_prompt,
        live2d_model_id=body.live2d_model_id,
        emotion_map=body.emotion_map,
        llm_config_id=body.llm_config_id,
        tts_config_id=body.tts_config_id,
        asr_config_id=body.asr_config_id,
        language=body.language,
    )
    db.add(character)
    await db.flush()
    await db.refresh(character)
    return CharacterResponse.model_validate(character)


@router.get("/live2d-models")
async def list_live2d_models():
    return AVAILABLE_LIVE2D_MODELS


@router.get("/{character_id}", response_model=CharacterResponse)
async def get_character(
    character_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Character).where(Character.id == character_id, Character.user_id == current_user.id)
    )
    character = result.scalar_one_or_none()
    if not character:
        raise AppError("CHARACTER_NOT_FOUND", "Character not found", 404)
    return CharacterResponse.model_validate(character)


@router.put("/{character_id}", response_model=CharacterResponse)
async def update_character(
    character_id: uuid.UUID,
    body: CharacterUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Character).where(Character.id == character_id, Character.user_id == current_user.id)
    )
    character = result.scalar_one_or_none()
    if not character:
        raise AppError("CHARACTER_NOT_FOUND", "Character not found", 404)

    # Check name uniqueness if name is being updated
    if body.name is not None and body.name != character.name:
        name_check = await db.execute(
            select(Character).where(
                Character.user_id == current_user.id,
                Character.name == body.name,
                Character.id != character_id,
            )
        )
        if name_check.scalar_one_or_none():
            raise AppError("CHARACTER_NAME_EXISTS", "Character name already exists", 409)

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(character, key, value)

    await db.flush()
    await db.refresh(character)
    return CharacterResponse.model_validate(character)


@router.delete("/{character_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_character(
    character_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Character).where(Character.id == character_id, Character.user_id == current_user.id)
    )
    character = result.scalar_one_or_none()
    if not character:
        raise AppError("CHARACTER_NOT_FOUND", "Character not found", 404)

    await db.delete(character)
    await db.flush()
    return None
