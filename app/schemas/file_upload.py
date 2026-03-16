import uuid
from datetime import datetime

from pydantic import BaseModel


class FileUploadResponse(BaseModel):
    id: uuid.UUID
    original_name: str
    file_type: str
    file_size: int
    mime_type: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
