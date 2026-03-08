"""
Energy Service - 에너지 잔액 관리

기능:
- 에너지 추가 (구매, 충전)
- 에너지 소비 (AI 기능 사용 시)
- 일일 충전 (티어별)
- 잔액 조회
"""
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User, SubscriptionTier

logger = logging.getLogger(__name__)

# 티어별 일일 충전량 및 최대 잔액
TIER_ENERGY_CONFIG = {
    SubscriptionTier.FREE: {"daily_refill": 50, "max_balance": 50},
    SubscriptionTier.STANDARD: {"daily_refill": 200, "max_balance": 500},
    SubscriptionTier.PREMIUM: {"daily_refill": 500, "max_balance": 1000},
}


class EnergyService:
    """에너지 잔액 관리 서비스"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def add_energy(self, user_id: str, amount: int, reason: str) -> int:
        """에너지 추가 후 새 잔액 반환 (구매, 이벤트 등)"""
        user = await self._get_user(user_id)
        if not user:
            raise ValueError(f"User not found: {user_id}")

        config = TIER_ENERGY_CONFIG.get(user.subscription_tier, TIER_ENERGY_CONFIG[SubscriptionTier.FREE])
        new_balance = min(user.energy_balance + amount, config["max_balance"])
        user.energy_balance = new_balance
        await self.db.commit()

        logger.info(f"Energy added for user {user_id}: +{amount} ({reason}), balance={new_balance}")
        return new_balance

    async def consume_energy(self, user_id: str, amount: int, reason: str) -> tuple[bool, int]:
        """에너지 소비 - (성공 여부, 남은 잔액) 반환"""
        user = await self._get_user(user_id)
        if not user:
            return False, 0

        if user.energy_balance < amount:
            logger.info(f"Insufficient energy for user {user_id}: need={amount}, have={user.energy_balance}")
            return False, user.energy_balance

        user.energy_balance -= amount
        await self.db.commit()

        logger.info(f"Energy consumed for user {user_id}: -{amount} ({reason}), balance={user.energy_balance}")
        return True, user.energy_balance

    async def daily_refill(self, user_id: str) -> int:
        """티어 기반 일일 에너지 충전, 새 잔액 반환"""
        user = await self._get_user(user_id)
        if not user:
            raise ValueError(f"User not found: {user_id}")

        config = TIER_ENERGY_CONFIG.get(user.subscription_tier, TIER_ENERGY_CONFIG[SubscriptionTier.FREE])
        daily_amount = config["daily_refill"]
        max_balance = config["max_balance"]

        new_balance = min(user.energy_balance + daily_amount, max_balance)
        user.energy_balance = new_balance
        user.energy_max = max_balance
        user.last_energy_reset_at = datetime.utcnow()
        await self.db.commit()

        logger.info(f"Daily refill for user {user_id}: +{daily_amount}, balance={new_balance}")
        return new_balance

    async def get_balance(self, user_id: str) -> dict:
        """현재 에너지 잔액 정보 반환"""
        user = await self._get_user(user_id)
        if not user:
            return {}

        config = TIER_ENERGY_CONFIG.get(user.subscription_tier, TIER_ENERGY_CONFIG[SubscriptionTier.FREE])
        tier = user.subscription_tier.value

        return {
            "current": user.energy_balance,
            "max": user.energy_max,
            "tier": tier,
            "daily_refill": config["daily_refill"],
            "last_reset_at": user.last_energy_reset_at.isoformat() if user.last_energy_reset_at else None,
        }

    async def _get_user(self, user_id: str) -> Optional[User]:
        """사용자 조회"""
        stmt = select(User).where(User.id == user_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
