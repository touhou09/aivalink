import redis.asyncio as aioredis
import structlog

from app.config import settings

logger = structlog.get_logger(__name__)

_redis_client: aioredis.Redis | None = None


async def _get_redis() -> aioredis.Redis | None:
    global _redis_client
    if _redis_client is None:
        try:
            _redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            await _redis_client.ping()
        except Exception:
            logger.warning("redis_unavailable", url=settings.REDIS_URL)
            _redis_client = None
    return _redis_client


async def redis_set_instance(instance_id: str, data: dict) -> None:
    r = await _get_redis()
    if r:
        try:
            await r.hset(f"aivalink:instances:{instance_id}", mapping=data)
        except Exception:
            logger.warning("redis_write_failed", instance_id=instance_id)


async def redis_del_instance(instance_id: str) -> None:
    r = await _get_redis()
    if r:
        try:
            await r.delete(f"aivalink:instances:{instance_id}")
        except Exception:
            pass


async def redis_get_instance(instance_id: str) -> dict | None:
    r = await _get_redis()
    if r:
        try:
            data = await r.hgetall(f"aivalink:instances:{instance_id}")
            return data if data else None
        except Exception:
            return None
    return None
