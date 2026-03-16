import uuid
from datetime import datetime

from pydantic import BaseModel, Field, model_validator


class CharacterCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    persona_prompt: str = Field(min_length=1, max_length=10000)
    live2d_model_id: str = "haru"
    language: str = "ko"
    emotion_map: dict = Field(default_factory=lambda: {"neutral": "neutral"})
    llm_config_id: uuid.UUID | None = None
    tts_config_id: uuid.UUID | None = None
    asr_config_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def validate_emotion_map(self) -> "CharacterCreate":
        if "neutral" not in self.emotion_map:
            raise ValueError("emotion_map must contain 'neutral' key")
        return self


class CharacterUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    persona_prompt: str | None = Field(None, min_length=1, max_length=10000)
    live2d_model_id: str | None = None
    language: str | None = None
    emotion_map: dict | None = None
    llm_config_id: uuid.UUID | None = None
    tts_config_id: uuid.UUID | None = None
    asr_config_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def validate_emotion_map(self) -> "CharacterUpdate":
        if self.emotion_map is not None and "neutral" not in self.emotion_map:
            raise ValueError("emotion_map must contain 'neutral' key")
        return self


class CharacterResponse(BaseModel):
    id: uuid.UUID
    name: str
    persona_prompt: str
    live2d_model_id: str
    language: str
    emotion_map: dict
    llm_config_id: uuid.UUID | None = None
    tts_config_id: uuid.UUID | None = None
    asr_config_id: uuid.UUID | None = None
    is_default: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CharacterListResponse(BaseModel):
    items: list[CharacterResponse]
    total: int
