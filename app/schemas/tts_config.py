import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class TTSConfigCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    engine: str = Field(min_length=1, max_length=50)
    voice_name: str | None = Field(None, max_length=100)
    voice_model_file_id: uuid.UUID | None = None
    language: str = "ko"
    speed: float = Field(default=1.0, ge=0.1, le=3.0)
    extra_params: dict = Field(default_factory=dict)


class TTSConfigUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    engine: str | None = Field(None, min_length=1, max_length=50)
    voice_name: str | None = Field(None, max_length=100)
    voice_model_file_id: uuid.UUID | None = None
    language: str | None = None
    speed: float | None = Field(None, ge=0.1, le=3.0)
    extra_params: dict | None = None


class TTSConfigResponse(BaseModel):
    id: uuid.UUID
    name: str
    engine: str
    voice_name: str | None = None
    voice_model_file_id: uuid.UUID | None = None
    language: str
    speed: float
    extra_params: dict
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
