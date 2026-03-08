"""
Usage Tracking Service - 사용량 추적 및 티어별 제한 확인

티어별 제한:
- Free: 1 Persona, 5 Documents, 100 messages/day
- Standard: 3 Personas, 50 Documents, Unlimited messages
- Premium: Unlimited Personas, Unlimited Documents, Unlimited messages + Proactive
"""
from datetime import datetime, date
from typing import Optional
from dataclasses import dataclass

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    User, Persona, Document, UsageRecord,
    SubscriptionTier, ChatMessage, ChatSession
)


@dataclass
class TierLimits:
    """티어별 제한 정의"""
    max_personas: int
    max_documents: int
    max_messages_per_day: int
    proactive_enabled: bool


# 티어별 제한 설정
TIER_LIMITS = {
    SubscriptionTier.FREE: TierLimits(
        max_personas=1,
        max_documents=5,
        max_messages_per_day=100,
        proactive_enabled=False,
    ),
    SubscriptionTier.STANDARD: TierLimits(
        max_personas=3,
        max_documents=50,
        max_messages_per_day=-1,  # Unlimited
        proactive_enabled=False,
    ),
    SubscriptionTier.PREMIUM: TierLimits(
        max_personas=-1,  # Unlimited
        max_documents=-1,  # Unlimited
        max_messages_per_day=-1,  # Unlimited
        proactive_enabled=True,
    ),
}


class UsageService:
    """사용량 추적 및 제한 확인 서비스"""

    def __init__(self, db: AsyncSession):
        self.db = db

    def get_tier_limits(self, tier: SubscriptionTier) -> TierLimits:
        """티어별 제한 반환"""
        return TIER_LIMITS.get(tier, TIER_LIMITS[SubscriptionTier.FREE])

    async def get_or_create_today_record(self, user_id: str) -> UsageRecord:
        """오늘의 사용량 레코드 조회 또는 생성"""
        today = datetime.combine(date.today(), datetime.min.time())

        stmt = select(UsageRecord).where(
            UsageRecord.user_id == user_id,
            UsageRecord.usage_date == today,
        )
        result = await self.db.execute(stmt)
        record = result.scalar_one_or_none()

        if not record:
            record = UsageRecord(
                user_id=user_id,
                usage_date=today,
                message_count=0,
                document_count=0,
                persona_count=0,
            )
            self.db.add(record)
            await self.db.commit()
            await self.db.refresh(record)

        return record

    async def increment_message_count(self, user_id: str) -> bool:
        """메시지 카운트 증가 (제한 체크 포함)"""
        user = await self._get_user(user_id)
        if not user:
            return False

        limits = self.get_tier_limits(user.subscription_tier)

        # Unlimited인 경우
        if limits.max_messages_per_day < 0:
            record = await self.get_or_create_today_record(user_id)
            record.message_count += 1
            await self.db.commit()
            return True

        record = await self.get_or_create_today_record(user_id)

        # 제한 체크
        if record.message_count >= limits.max_messages_per_day:
            return False

        record.message_count += 1
        await self.db.commit()
        return True

    async def can_create_persona(self, user_id: str) -> bool:
        """새 Persona 생성 가능 여부"""
        user = await self._get_user(user_id)
        if not user:
            return False

        limits = self.get_tier_limits(user.subscription_tier)

        # Unlimited인 경우
        if limits.max_personas < 0:
            return True

        # 현재 Persona 수 조회
        stmt = select(func.count()).where(Persona.owner_id == user_id)
        result = await self.db.execute(stmt)
        current_count = result.scalar() or 0

        return current_count < limits.max_personas

    async def can_upload_document(self, user_id: str) -> bool:
        """새 Document 업로드 가능 여부"""
        user = await self._get_user(user_id)
        if not user:
            return False

        limits = self.get_tier_limits(user.subscription_tier)

        # Unlimited인 경우
        if limits.max_documents < 0:
            return True

        # 현재 Document 수 조회
        stmt = select(func.count()).where(Document.user_id == user_id)
        result = await self.db.execute(stmt)
        current_count = result.scalar() or 0

        return current_count < limits.max_documents

    async def can_use_proactive(self, user_id: str) -> bool:
        """Proactive Agent 사용 가능 여부"""
        user = await self._get_user(user_id)
        if not user:
            return False

        limits = self.get_tier_limits(user.subscription_tier)
        return limits.proactive_enabled

    async def get_usage_summary(self, user_id: str) -> dict:
        """사용량 요약 반환"""
        user = await self._get_user(user_id)
        if not user:
            return {}

        limits = self.get_tier_limits(user.subscription_tier)
        today_record = await self.get_or_create_today_record(user_id)

        # 현재 Persona 수
        persona_stmt = select(func.count()).where(Persona.owner_id == user_id)
        persona_result = await self.db.execute(persona_stmt)
        persona_count = persona_result.scalar() or 0

        # 현재 Document 수
        doc_stmt = select(func.count()).where(Document.user_id == user_id)
        doc_result = await self.db.execute(doc_stmt)
        doc_count = doc_result.scalar() or 0

        return {
            "tier": user.subscription_tier.value,
            "limits": {
                "max_personas": limits.max_personas,
                "max_documents": limits.max_documents,
                "max_messages_per_day": limits.max_messages_per_day,
                "proactive_enabled": limits.proactive_enabled,
            },
            "usage": {
                "personas": persona_count,
                "documents": doc_count,
                "messages_today": today_record.message_count,
            },
            "remaining": {
                "personas": limits.max_personas - persona_count if limits.max_personas > 0 else -1,
                "documents": limits.max_documents - doc_count if limits.max_documents > 0 else -1,
                "messages_today": (
                    limits.max_messages_per_day - today_record.message_count
                    if limits.max_messages_per_day > 0 else -1
                ),
            },
        }

    async def _get_user(self, user_id: str) -> Optional[User]:
        """사용자 조회"""
        stmt = select(User).where(User.id == user_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
