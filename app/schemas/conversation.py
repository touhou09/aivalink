import uuid
from datetime import datetime

from pydantic import BaseModel


class ConversationLogResponse(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    emotion: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
