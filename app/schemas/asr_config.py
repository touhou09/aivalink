import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ASRConfigCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    engine: str = Field(min_length=1, max_length=50)
    model_size: str = Field(default="base", max_length=20)
    language: str = "ko"
    extra_params: dict = Field(default_factory=dict)


class ASRConfigUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    engine: str | None = Field(None, min_length=1, max_length=50)
    model_size: str | None = Field(None, max_length=20)
    language: str | None = None
    extra_params: dict | None = None


class ASRConfigResponse(BaseModel):
    id: uuid.UUID
    name: str
    engine: str
    model_size: str
    language: str
    extra_params: dict
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
