import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.instance_manager.manager import InstanceManager
from app.models.character import Character
from app.models.user import User
from app.schemas.instance import InstanceCreate, InstanceResponse, InstanceStatusResponse

router = APIRouter(prefix="/api/instances", tags=["instances"])


def _to_response(instance, character_name: str) -> InstanceResponse:
    ws_url = f"ws://localhost:8000/client-ws/{instance.id}" if instance.status == "running" else None
    return InstanceResponse(
        id=instance.id,
        character_id=instance.character_id,
        character_name=character_name,
        status=instance.status,
        websocket_url=ws_url,
        started_at=instance.started_at,
        stopped_at=instance.stopped_at,
        created_at=instance.created_at,
    )


@router.post("", status_code=201)
async def create_instance(
    body: InstanceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InstanceResponse:
    instance = await InstanceManager.start(db, current_user.id, body.character_id)
    result = await db.execute(select(Character).where(Character.id == body.character_id))
    character = result.scalar_one()
    return _to_response(instance, character.name)


@router.get("")
async def list_instances(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[InstanceResponse]:
    instances = await InstanceManager.list_instances(db, current_user.id)
    responses = []
    for inst in instances:
        result = await db.execute(select(Character).where(Character.id == inst.character_id))
        char = result.scalar_one_or_none()
        char_name = char.name if char else "Unknown"
        responses.append(_to_response(inst, char_name))
    return responses


@router.get("/{instance_id}/status")
async def get_instance_status(
    instance_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InstanceStatusResponse:
    instance = await InstanceManager.get_status(db, current_user.id, instance_id)
    result = await db.execute(select(Character).where(Character.id == instance.character_id))
    char = result.scalar_one_or_none()

    uptime = None
    if instance.status == "running" and instance.started_at:
        uptime = (datetime.now(UTC) - instance.started_at).total_seconds()

    return InstanceStatusResponse(
        id=instance.id,
        status=instance.status,
        character_name=char.name if char else "Unknown",
        websocket_url=f"ws://localhost:8000/client-ws/{instance.id}" if instance.status == "running" else None,
        uptime_seconds=uptime,
        started_at=instance.started_at,
    )


@router.delete("/{instance_id}")
async def stop_instance(
    instance_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InstanceResponse:
    instance = await InstanceManager.stop(db, current_user.id, instance_id)
    result = await db.execute(select(Character).where(Character.id == instance.character_id))
    char = result.scalar_one_or_none()
    return _to_response(instance, char.name if char else "Unknown")
