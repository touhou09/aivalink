import asyncio
import uuid
from datetime import UTC, datetime

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import AppError
from app.instance_manager.redis_store import redis_del_instance, redis_set_instance
from app.models.character import Character
from app.models.instance import Instance

logger = structlog.get_logger(__name__)


class InstanceManager:
    """Manages VTuber instances. For Phase 2, instances run in-process."""

    _pipelines: dict[uuid.UUID, object] = {}  # instance_id -> VTuberPipeline
    _tasks: dict[uuid.UUID, asyncio.Task] = {}  # instance_id -> background task

    @classmethod
    async def start(cls, db: AsyncSession, user_id: uuid.UUID, character_id: uuid.UUID) -> Instance:
        # Check character exists and belongs to user
        result = await db.execute(
            select(Character).where(Character.id == character_id, Character.user_id == user_id)
        )
        character = result.scalar_one_or_none()
        if not character:
            raise AppError("CHARACTER_NOT_FOUND", "Character not found", 404)

        # Validate required configs
        if not character.llm_config_id:
            raise AppError("LLM_CONFIG_REQUIRED", "Character must have an LLM config", 400)
        if not character.tts_config_id:
            raise AppError("TTS_CONFIG_REQUIRED", "Character must have a TTS config", 400)
        if not character.asr_config_id:
            raise AppError("ASR_CONFIG_REQUIRED", "Character must have an ASR config", 400)

        # Check concurrent instance limit
        result = await db.execute(
            select(Instance).where(
                Instance.user_id == user_id,
                Instance.status.in_(["pending", "starting", "running"]),
            )
        )
        active_instances = result.scalars().all()
        if len(active_instances) >= settings.MAX_INSTANCES_PER_USER:
            raise AppError("INSTANCE_LIMIT_EXCEEDED", "Maximum concurrent instances reached", 429)

        # Create instance record
        instance = Instance(
            user_id=user_id,
            character_id=character_id,
            status="running",
            started_at=datetime.now(UTC),
        )
        db.add(instance)
        await db.flush()
        await db.refresh(instance)

        await redis_set_instance(
            str(instance.id),
            {
                "user_id": str(user_id),
                "character_id": str(character_id),
                "status": "running",
                "started_at": datetime.now(UTC).isoformat(),
            },
        )

        logger.info("instance_started", instance_id=str(instance.id), user_id=str(user_id), character_id=str(character_id))
        return instance

    @classmethod
    async def stop(cls, db: AsyncSession, user_id: uuid.UUID, instance_id: uuid.UUID) -> Instance:
        result = await db.execute(
            select(Instance).where(Instance.id == instance_id, Instance.user_id == user_id)
        )
        instance = result.scalar_one_or_none()
        if not instance:
            raise AppError("INSTANCE_NOT_FOUND", "Instance not found", 404)

        if instance.status in ("stopped", "stopping"):
            raise AppError("INSTANCE_ALREADY_STOPPED", "Instance is already stopped", 400)

        instance.status = "stopped"
        instance.stopped_at = datetime.now(UTC)

        # Clean up pipeline if exists
        if instance_id in cls._pipelines:
            del cls._pipelines[instance_id]
        if instance_id in cls._tasks:
            cls._tasks[instance_id].cancel()
            del cls._tasks[instance_id]

        await redis_del_instance(str(instance_id))

        await db.flush()
        await db.refresh(instance)

        logger.info("instance_stopped", instance_id=str(instance_id), user_id=str(user_id))
        return instance

    @classmethod
    async def get_status(cls, db: AsyncSession, user_id: uuid.UUID, instance_id: uuid.UUID) -> Instance:
        result = await db.execute(
            select(Instance).where(Instance.id == instance_id, Instance.user_id == user_id)
        )
        instance = result.scalar_one_or_none()
        if not instance:
            raise AppError("INSTANCE_NOT_FOUND", "Instance not found", 404)
        return instance

    @classmethod
    async def list_instances(cls, db: AsyncSession, user_id: uuid.UUID) -> list[Instance]:
        result = await db.execute(
            select(Instance).where(Instance.user_id == user_id).order_by(Instance.created_at.desc())
        )
        return list(result.scalars().all())
