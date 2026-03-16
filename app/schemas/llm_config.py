import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class LLMConfigCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    provider: str = Field(min_length=1, max_length=50)
    model_name: str = Field(min_length=1, max_length=100)
    api_key: str | None = None
    base_url: str | None = Field(None, max_length=500)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(default=2048, ge=1, le=100000)
    oauth_token_id: uuid.UUID | None = None
    extra_params: dict = Field(default_factory=dict)


class LLMConfigUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    provider: str | None = Field(None, min_length=1, max_length=50)
    model_name: str | None = Field(None, min_length=1, max_length=100)
    api_key: str | None = None
    base_url: str | None = Field(None, max_length=500)
    temperature: float | None = Field(None, ge=0.0, le=2.0)
    max_tokens: int | None = Field(None, ge=1, le=100000)
    oauth_token_id: uuid.UUID | None = None
    extra_params: dict | None = None


class LLMConfigResponse(BaseModel):
    id: uuid.UUID
    name: str
    provider: str
    model_name: str
    has_api_key: bool
    base_url: str | None = None
    temperature: float
    max_tokens: int
    oauth_token_id: uuid.UUID | None = None
    extra_params: dict
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
