from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.db.models import Persona, LLMProvider, TTSProvider
from app.api.deps import DbSession, CurrentUser

router = APIRouter()


class PersonaCreate(BaseModel):
    name: str
    description: Optional[str] = None
    avatar_url: Optional[str] = None
    persona_prompt: str
    character_name: str
    live2d_model_name: str = "shizuku"
    llm_provider: LLMProvider = LLMProvider.OLLAMA
    llm_model: str = "qwen2.5:latest"
    llm_api_key: Optional[str] = None
    tts_provider: TTSProvider = TTSProvider.EDGE_TTS
    tts_voice: str = "en-US-AriaNeural"
    tts_language: str = "en"
    use_letta: bool = False
    is_public: bool = False
    extra_config: Optional[dict] = None


class PersonaUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    avatar_url: Optional[str] = None
    persona_prompt: Optional[str] = None
    character_name: Optional[str] = None
    live2d_model_name: Optional[str] = None
    llm_provider: Optional[LLMProvider] = None
    llm_model: Optional[str] = None
    llm_api_key: Optional[str] = None
    tts_provider: Optional[TTSProvider] = None
    tts_voice: Optional[str] = None
    tts_language: Optional[str] = None
    use_letta: Optional[bool] = None
    is_public: Optional[bool] = None
    extra_config: Optional[dict] = None


class PersonaResponse(BaseModel):
    id: str
    owner_id: str
    name: str
    description: Optional[str]
    avatar_url: Optional[str]
    persona_prompt: str
    character_name: str
    live2d_model_name: str
    llm_provider: LLMProvider
    llm_model: str
    tts_provider: TTSProvider
    tts_voice: str
    tts_language: str
    use_letta: bool
    is_public: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


@router.get("", response_model=list[PersonaResponse])
async def list_personas(current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(Persona).where(Persona.owner_id == current_user.id)
    )
    return result.scalars().all()


@router.post("", response_model=PersonaResponse, status_code=status.HTTP_201_CREATED)
async def create_persona(
    persona_data: PersonaCreate, current_user: CurrentUser, db: DbSession
):
    persona = Persona(owner_id=current_user.id, **persona_data.model_dump())
    db.add(persona)
    await db.commit()
    await db.refresh(persona)
    return persona


@router.get("/{persona_id}", response_model=PersonaResponse)
async def get_persona(persona_id: str, current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(Persona).where(
            Persona.id == persona_id,
            (Persona.owner_id == current_user.id) | (Persona.is_public == True),
        )
    )
    persona = result.scalar_one_or_none()
    if not persona:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Persona not found"
        )
    return persona


@router.put("/{persona_id}", response_model=PersonaResponse)
async def update_persona(
    persona_id: str,
    persona_data: PersonaUpdate,
    current_user: CurrentUser,
    db: DbSession,
):
    result = await db.execute(
        select(Persona).where(
            Persona.id == persona_id, Persona.owner_id == current_user.id
        )
    )
    persona = result.scalar_one_or_none()
    if not persona:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Persona not found"
        )

    update_data = persona_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(persona, field, value)

    await db.commit()
    await db.refresh(persona)
    return persona


@router.delete("/{persona_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_persona(persona_id: str, current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(Persona).where(
            Persona.id == persona_id, Persona.owner_id == current_user.id
        )
    )
    persona = result.scalar_one_or_none()
    if not persona:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Persona not found"
        )

    await db.delete(persona)
    await db.commit()
