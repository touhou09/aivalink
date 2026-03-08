from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.db.models import Character
from app.api.deps import DbSession, CurrentUser

router = APIRouter()


class CharacterCreate(BaseModel):
    name: str
    persona_prompt: str
    live2d_model: Optional[str] = None
    tts_engine: str = "edge-tts"
    tts_config: Optional[dict] = None
    emotion_map: Optional[dict] = None
    heartbeat: Optional[dict] = None
    agent_config: Optional[dict] = None
    is_active: bool = True


class CharacterUpdate(BaseModel):
    name: Optional[str] = None
    persona_prompt: Optional[str] = None
    live2d_model: Optional[str] = None
    tts_engine: Optional[str] = None
    tts_config: Optional[dict] = None
    emotion_map: Optional[dict] = None
    heartbeat: Optional[dict] = None
    agent_config: Optional[dict] = None
    is_active: Optional[bool] = None


class EmotionMapUpdate(BaseModel):
    emotion_map: dict


class CharacterResponse(BaseModel):
    id: str
    user_id: str
    name: str
    persona_prompt: str
    live2d_model: Optional[str]
    tts_engine: str
    tts_config: Optional[dict]
    emotion_map: Optional[dict]
    heartbeat: Optional[dict]
    agent_config: Optional[dict]
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("", response_model=list[CharacterResponse])
async def list_characters(current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(Character).where(Character.user_id == current_user.id)
    )
    return result.scalars().all()


@router.post("", response_model=CharacterResponse, status_code=status.HTTP_201_CREATED)
async def create_character(character_data: CharacterCreate, current_user: CurrentUser, db: DbSession):
    character = Character(user_id=current_user.id, **character_data.model_dump())
    db.add(character)
    await db.commit()
    await db.refresh(character)
    return character


@router.get("/{character_id}", response_model=CharacterResponse)
async def get_character(character_id: str, current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(Character).where(
            Character.id == character_id,
            Character.user_id == current_user.id,
        )
    )
    character = result.scalar_one_or_none()
    if not character:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found")
    return character


@router.put("/{character_id}", response_model=CharacterResponse)
async def update_character(
    character_id: str,
    character_data: CharacterUpdate,
    current_user: CurrentUser,
    db: DbSession,
):
    result = await db.execute(
        select(Character).where(
            Character.id == character_id, Character.user_id == current_user.id
        )
    )
    character = result.scalar_one_or_none()
    if not character:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found")

    update_data = character_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(character, field, value)

    await db.commit()
    await db.refresh(character)
    return character


@router.delete("/{character_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_character(character_id: str, current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(Character).where(
            Character.id == character_id, Character.user_id == current_user.id
        )
    )
    character = result.scalar_one_or_none()
    if not character:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found")

    await db.delete(character)
    await db.commit()


@router.put("/{character_id}/emotion-map", response_model=CharacterResponse)
async def update_emotion_map(
    character_id: str,
    emotion_data: EmotionMapUpdate,
    current_user: CurrentUser,
    db: DbSession,
):
    """Update the emotion→motion mapping for a character's Live2D configuration.

    Accepts a dict mapping emotion names to motion/expression configs:
    {
        "happy": {"motion": "TapBody", "expression": "smile"},
        "sad": {"motion": "Idle", "expression": "sad"},
        ...
    }
    """
    result = await db.execute(
        select(Character).where(
            Character.id == character_id, Character.user_id == current_user.id
        )
    )
    character = result.scalar_one_or_none()
    if not character:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found")

    character.emotion_map = emotion_data.emotion_map

    await db.commit()
    await db.refresh(character)
    return character
