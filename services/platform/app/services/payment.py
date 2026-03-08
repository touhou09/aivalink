"""
Stripe Payment Service - 결제 및 구독 관리

기능:
- Checkout Session 생성
- Subscription 관리
- Webhook 처리
"""
import logging
from datetime import datetime
from typing import Optional

import stripe
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models import User, Subscription, SubscriptionTier, SubscriptionStatus

logger = logging.getLogger(__name__)
settings = get_settings()

# Stripe API 키 설정
stripe.api_key = settings.stripe_secret_key

# 가격 ID 매핑 (Stripe Dashboard에서 생성)
PRICE_IDS = {
    SubscriptionTier.STANDARD: settings.stripe_standard_price_id,
    SubscriptionTier.PREMIUM: settings.stripe_premium_price_id,
}


class PaymentService:
    """Stripe 결제 서비스"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_checkout_session(
        self,
        user: User,
        tier: SubscriptionTier,
        success_url: str,
        cancel_url: str,
    ) -> str:
        """Stripe Checkout 세션 생성"""
        if tier == SubscriptionTier.FREE:
            raise ValueError("Cannot create checkout for free tier")

        price_id = PRICE_IDS.get(tier)
        if not price_id:
            raise ValueError(f"No price configured for tier: {tier}")

        # Stripe Customer 생성 또는 조회
        customer_id = await self._ensure_customer(user)

        try:
            session = stripe.checkout.Session.create(
                customer=customer_id,
                mode="subscription",
                payment_method_types=["card"],
                line_items=[
                    {
                        "price": price_id,
                        "quantity": 1,
                    }
                ],
                success_url=success_url,
                cancel_url=cancel_url,
                metadata={
                    "user_id": user.id,
                    "tier": tier.value,
                },
            )
            return session.url
        except stripe.error.StripeError as e:
            logger.error(f"Stripe checkout error: {e}")
            raise

    async def create_portal_session(self, user: User, return_url: str) -> str:
        """Stripe Customer Portal 세션 생성 (구독 관리용)"""
        if not user.stripe_customer_id:
            raise ValueError("User has no Stripe customer ID")

        try:
            session = stripe.billing_portal.Session.create(
                customer=user.stripe_customer_id,
                return_url=return_url,
            )
            return session.url
        except stripe.error.StripeError as e:
            logger.error(f"Stripe portal error: {e}")
            raise

    async def handle_webhook_event(self, payload: bytes, sig_header: str) -> dict:
        """Stripe Webhook 이벤트 처리"""
        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, settings.stripe_webhook_secret
            )
        except ValueError as e:
            logger.error(f"Invalid payload: {e}")
            raise
        except stripe.error.SignatureVerificationError as e:
            logger.error(f"Invalid signature: {e}")
            raise

        event_type = event["type"]
        data = event["data"]["object"]

        handlers = {
            "checkout.session.completed": self._handle_checkout_completed,
            "customer.subscription.updated": self._handle_subscription_updated,
            "customer.subscription.deleted": self._handle_subscription_deleted,
            "invoice.payment_succeeded": self._handle_payment_succeeded,
            "invoice.payment_failed": self._handle_payment_failed,
        }

        handler = handlers.get(event_type)
        if handler:
            await handler(data)
            return {"handled": True, "type": event_type}

        return {"handled": False, "type": event_type}

    async def _ensure_customer(self, user: User) -> str:
        """Stripe Customer 생성 또는 기존 ID 반환"""
        if user.stripe_customer_id:
            return user.stripe_customer_id

        try:
            customer = stripe.Customer.create(
                email=user.email,
                name=user.username,
                metadata={"user_id": user.id},
            )
            user.stripe_customer_id = customer.id
            await self.db.commit()
            return customer.id
        except stripe.error.StripeError as e:
            logger.error(f"Failed to create Stripe customer: {e}")
            raise

    async def _handle_checkout_completed(self, data: dict):
        """Checkout 완료 처리"""
        user_id = data.get("metadata", {}).get("user_id")
        tier_str = data.get("metadata", {}).get("tier")
        subscription_id = data.get("subscription")

        if not user_id or not tier_str:
            logger.warning("Missing metadata in checkout session")
            return

        tier = SubscriptionTier(tier_str)

        # 사용자 조회
        stmt = select(User).where(User.id == user_id)
        result = await self.db.execute(stmt)
        user = result.scalar_one_or_none()

        if not user:
            logger.error(f"User not found: {user_id}")
            return

        # 구독 정보 업데이트
        user.subscription_tier = tier

        # Subscription 레코드 생성/업데이트
        sub_stmt = select(Subscription).where(Subscription.user_id == user_id)
        sub_result = await self.db.execute(sub_stmt)
        subscription = sub_result.scalar_one_or_none()

        if subscription:
            subscription.stripe_subscription_id = subscription_id
            subscription.tier = tier
            subscription.status = SubscriptionStatus.ACTIVE
        else:
            subscription = Subscription(
                user_id=user_id,
                stripe_subscription_id=subscription_id,
                tier=tier,
                status=SubscriptionStatus.ACTIVE,
            )
            self.db.add(subscription)

        await self.db.commit()
        logger.info(f"Subscription activated for user {user_id}: {tier}")

    async def _handle_subscription_updated(self, data: dict):
        """구독 업데이트 처리"""
        subscription_id = data.get("id")
        status = data.get("status")
        cancel_at_period_end = data.get("cancel_at_period_end", False)

        stmt = select(Subscription).where(
            Subscription.stripe_subscription_id == subscription_id
        )
        result = await self.db.execute(stmt)
        subscription = result.scalar_one_or_none()

        if subscription:
            # 상태 매핑
            status_map = {
                "active": SubscriptionStatus.ACTIVE,
                "past_due": SubscriptionStatus.PAST_DUE,
                "canceled": SubscriptionStatus.CANCELED,
                "trialing": SubscriptionStatus.TRIALING,
            }
            subscription.status = status_map.get(status, SubscriptionStatus.ACTIVE)
            subscription.cancel_at_period_end = cancel_at_period_end

            # 기간 업데이트
            if data.get("current_period_start"):
                subscription.current_period_start = datetime.fromtimestamp(
                    data["current_period_start"]
                )
            if data.get("current_period_end"):
                subscription.current_period_end = datetime.fromtimestamp(
                    data["current_period_end"]
                )

            await self.db.commit()
            logger.info(f"Subscription updated: {subscription_id}")

    async def _handle_subscription_deleted(self, data: dict):
        """구독 취소 처리"""
        subscription_id = data.get("id")

        stmt = select(Subscription).where(
            Subscription.stripe_subscription_id == subscription_id
        )
        result = await self.db.execute(stmt)
        subscription = result.scalar_one_or_none()

        if subscription:
            subscription.status = SubscriptionStatus.CANCELED

            # 사용자 티어를 Free로 다운그레이드
            user_stmt = select(User).where(User.id == subscription.user_id)
            user_result = await self.db.execute(user_stmt)
            user = user_result.scalar_one_or_none()
            if user:
                user.subscription_tier = SubscriptionTier.FREE

            await self.db.commit()
            logger.info(f"Subscription canceled: {subscription_id}")

    async def _handle_payment_succeeded(self, data: dict):
        """결제 성공 처리"""
        logger.info(f"Payment succeeded: {data.get('id')}")

    async def _handle_payment_failed(self, data: dict):
        """결제 실패 처리"""
        subscription_id = data.get("subscription")

        if subscription_id:
            stmt = select(Subscription).where(
                Subscription.stripe_subscription_id == subscription_id
            )
            result = await self.db.execute(stmt)
            subscription = result.scalar_one_or_none()

            if subscription:
                subscription.status = SubscriptionStatus.PAST_DUE
                await self.db.commit()

        logger.warning(f"Payment failed: {data.get('id')}")

    async def create_energy_checkout_session(
        self,
        user: User,
        pack_id: str,
        energy_amount: int,
        price: float,
        success_url: str,
        cancel_url: str,
    ) -> str:
        """에너지 팩 일회성 결제 Checkout 세션 생성"""
        customer_id = await self._ensure_customer(user)

        # Convert price to cents for Stripe
        unit_amount = int(price * 100)

        try:
            session = stripe.checkout.Session.create(
                customer=customer_id,
                mode="payment",
                payment_method_types=["card"],
                line_items=[
                    {
                        "price_data": {
                            "currency": "usd",
                            "unit_amount": unit_amount,
                            "product_data": {
                                "name": f"{energy_amount} Energy",
                                "description": f"Add {energy_amount} energy to your account",
                            },
                        },
                        "quantity": 1,
                    }
                ],
                success_url=success_url,
                cancel_url=cancel_url,
                metadata={
                    "user_id": user.id,
                    "pack_id": pack_id,
                    "energy_amount": energy_amount,
                    "purchase_type": "energy",
                },
            )
            return session.url
        except stripe.error.StripeError as e:
            logger.error(f"Stripe energy checkout error: {e}")
            raise
