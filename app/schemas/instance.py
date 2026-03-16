import uuid
from datetime import datetime

from pydantic import BaseModel


class InstanceCreate(BaseModel):
    character_id: uuid.UUID


class InstanceResponse(BaseModel):
    id: uuid.UUID
    character_id: uuid.UUID
    character_name: str
    status: str
    websocket_url: str | None = None
    started_at: datetime | None = None
    stopped_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class InstanceStatusResponse(BaseModel):
    id: uuid.UUID
    status: str
    character_name: str
    websocket_url: str | None = None
    uptime_seconds: float | None = None
    started_at: datetime | None = None
