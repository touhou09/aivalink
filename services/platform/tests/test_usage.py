"""
Usage Service 테스트 (Phase 7 - Tier Limits)
"""
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User, SubscriptionTier
from app.services.usage import UsageService, TIER_LIMITS


class TestTierLimits:
    """티어별 제한 테스트"""

    def test_free_tier_limits(self):
        """Free 티어 제한 확인"""
        limits = TIER_LIMITS[SubscriptionTier.FREE]
        assert limits.max_personas == 1
        assert limits.max_documents == 5
        assert limits.max_messages_per_day == 100
        assert limits.proactive_enabled is False

    def test_standard_tier_limits(self):
        """Standard 티어 제한 확인"""
        limits = TIER_LIMITS[SubscriptionTier.STANDARD]
        assert limits.max_personas == 3
        assert limits.max_documents == 50
        assert limits.max_messages_per_day == -1  # Unlimited
        assert limits.proactive_enabled is False

    def test_premium_tier_limits(self):
        """Premium 티어 제한 확인"""
        limits = TIER_LIMITS[SubscriptionTier.PREMIUM]
        assert limits.max_personas == -1  # Unlimited
        assert limits.max_documents == -1  # Unlimited
        assert limits.max_messages_per_day == -1  # Unlimited
        assert limits.proactive_enabled is True


class TestUsageService:
    """UsageService 테스트"""

    @pytest.mark.asyncio
    async def test_get_tier_limits(self, test_session: AsyncSession):
        """get_tier_limits 메서드 테스트"""
        service = UsageService(test_session)

        free_limits = service.get_tier_limits(SubscriptionTier.FREE)
        assert free_limits.max_personas == 1

        premium_limits = service.get_tier_limits(SubscriptionTier.PREMIUM)
        assert premium_limits.max_personas == -1

    @pytest.mark.asyncio
    async def test_get_or_create_today_record(self, test_session: AsyncSession):
        """오늘의 사용량 레코드 생성 테스트"""
        # Create a test user first
        from app.db.models import User
        import bcrypt

        hashed = bcrypt.hashpw("test".encode(), bcrypt.gensalt()).decode()
        user = User(
            email="usage_test@example.com",
            username="usage_test",
            hashed_password=hashed,
        )
        test_session.add(user)
        await test_session.commit()
        await test_session.refresh(user)

        service = UsageService(test_session)
        record = await service.get_or_create_today_record(user.id)

        assert record is not None
        assert record.user_id == user.id
        assert record.message_count == 0
        assert record.document_count == 0

    @pytest.mark.asyncio
    async def test_can_create_persona_free_tier(self, test_session: AsyncSession):
        """Free 티어 Persona 생성 가능 여부"""
        import bcrypt
        from app.db.models import User

        hashed = bcrypt.hashpw("test".encode(), bcrypt.gensalt()).decode()
        user = User(
            email="persona_test@example.com",
            username="persona_test",
            hashed_password=hashed,
            subscription_tier=SubscriptionTier.FREE,
        )
        test_session.add(user)
        await test_session.commit()
        await test_session.refresh(user)

        service = UsageService(test_session)

        # First persona should be allowed
        can_create = await service.can_create_persona(user.id)
        assert can_create is True

    @pytest.mark.asyncio
    async def test_can_use_proactive_free_tier(self, test_session: AsyncSession):
        """Free 티어는 Proactive 사용 불가"""
        import bcrypt
        from app.db.models import User

        hashed = bcrypt.hashpw("test".encode(), bcrypt.gensalt()).decode()
        user = User(
            email="proactive_test@example.com",
            username="proactive_test",
            hashed_password=hashed,
            subscription_tier=SubscriptionTier.FREE,
        )
        test_session.add(user)
        await test_session.commit()
        await test_session.refresh(user)

        service = UsageService(test_session)
        can_use = await service.can_use_proactive(user.id)
        assert can_use is False

    @pytest.mark.asyncio
    async def test_can_use_proactive_premium_tier(self, test_session: AsyncSession):
        """Premium 티어는 Proactive 사용 가능"""
        import bcrypt
        from app.db.models import User

        hashed = bcrypt.hashpw("test".encode(), bcrypt.gensalt()).decode()
        user = User(
            email="proactive_premium@example.com",
            username="proactive_premium",
            hashed_password=hashed,
            subscription_tier=SubscriptionTier.PREMIUM,
        )
        test_session.add(user)
        await test_session.commit()
        await test_session.refresh(user)

        service = UsageService(test_session)
        can_use = await service.can_use_proactive(user.id)
        assert can_use is True

    @pytest.mark.asyncio
    async def test_get_usage_summary(self, test_session: AsyncSession):
        """사용량 요약 테스트"""
        import bcrypt
        from app.db.models import User

        hashed = bcrypt.hashpw("test".encode(), bcrypt.gensalt()).decode()
        user = User(
            email="summary_test@example.com",
            username="summary_test",
            hashed_password=hashed,
            subscription_tier=SubscriptionTier.FREE,
        )
        test_session.add(user)
        await test_session.commit()
        await test_session.refresh(user)

        service = UsageService(test_session)
        summary = await service.get_usage_summary(user.id)

        assert summary["tier"] == "free"
        assert "limits" in summary
        assert "usage" in summary
        assert "remaining" in summary
        assert summary["usage"]["personas"] == 0
        assert summary["usage"]["documents"] == 0
