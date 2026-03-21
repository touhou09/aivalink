import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.conversation_log import ConversationLog
from app.models.user import User
from app.schemas.conversation import ConversationLogResponse

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


@router.get("/{character_id}")
async def list_conversations(
    character_id: uuid.UUID,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ConversationLogResponse]:
    result = await db.execute(
        select(ConversationLog)
        .where(
            ConversationLog.user_id == current_user.id,
            ConversationLog.character_id == character_id,
        )
        .order_by(ConversationLog.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    logs = result.scalars().all()
    return [ConversationLogResponse.model_validate(log) for log in logs]
