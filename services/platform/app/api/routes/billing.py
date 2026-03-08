"""
Billing API 엔드포인트 (Phase 7 - Monetization)

- 요금제 정보 조회
- 구독 생성 (Stripe Checkout)
- 구독 관리 (Customer Portal)
- 사용량 조회
- Webhook 처리
"""
from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel
from typing import Optional

from app.api.deps import DbSession, CurrentUser
from app.db.models import SubscriptionTier
from app.services.payment import PaymentService
from app.services.usage import UsageService
from app.config import get_settings

router = APIRouter()
settings = get_settings()


class PlanInfo(BaseModel):
    tier: str
    name: str
    price: float
    price_display: str
    features: list[str]
    limits: dict


class PlansResponse(BaseModel):
    plans: list[PlanInfo]
    current_tier: str


class CheckoutRequest(BaseModel):
    tier: str
    success_url: str
    cancel_url: str


class CheckoutResponse(BaseModel):
    checkout_url: str


class PortalResponse(BaseModel):
    portal_url: str


class UsageSummaryResponse(BaseModel):
    tier: str
    limits: dict
    usage: dict
    remaining: dict


# 요금제 정보
PLANS = [
    PlanInfo(
        tier="free",
        name="Free",
        price=0,
        price_display="Free",
        features=[
            "1 Persona",
            "5 Documents",
            "100 messages per day",
            "Basic VTuber features",
        ],
        limits={
            "max_personas": 1,
            "max_documents": 5,
            "max_messages_per_day": 100,
            "proactive_enabled": False,
        },
    ),
    PlanInfo(
        tier="standard",
        name="Standard",
        price=9.99,
        price_display="$9.99/month",
        features=[
            "3 Personas",
            "50 Documents",
            "Unlimited messages",
            "Priority support",
        ],
        limits={
            "max_personas": 3,
            "max_documents": 50,
            "max_messages_per_day": -1,
            "proactive_enabled": False,
        },
    ),
    PlanInfo(
        tier="premium",
        name="Premium",
        price=29.99,
        price_display="$29.99/month",
        features=[
            "Unlimited Personas",
            "Unlimited Documents",
            "Unlimited messages",
            "Proactive Insights (AI recommendations)",
            "Priority support",
            "Early access to new features",
        ],
        limits={
            "max_personas": -1,
            "max_documents": -1,
            "max_messages_per_day": -1,
            "proactive_enabled": True,
        },
    ),
]


@router.get("/plans", response_model=PlansResponse)
async def get_plans(
    user: CurrentUser,
):
    """사용 가능한 요금제 목록 조회"""
    return PlansResponse(
        plans=PLANS,
        current_tier=user.subscription_tier.value,
    )


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(
    request: CheckoutRequest,
    db: DbSession,
    user: CurrentUser,
):
    """Stripe Checkout 세션 생성"""
    try:
        tier = SubscriptionTier(request.tier)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid tier")

    if tier == SubscriptionTier.FREE:
        raise HTTPException(status_code=400, detail="Cannot checkout for free tier")

    if user.subscription_tier == tier:
        raise HTTPException(status_code=400, detail="Already subscribed to this tier")

    payment_service = PaymentService(db)

    try:
        checkout_url = await payment_service.create_checkout_session(
            user=user,
            tier=tier,
            success_url=request.success_url,
            cancel_url=request.cancel_url,
        )
        return CheckoutResponse(checkout_url=checkout_url)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/portal", response_model=PortalResponse)
async def create_portal_session(
    db: DbSession,
    user: CurrentUser,
    return_url: str = Query(..., description="URL to return to after portal"),
):
    """Stripe Customer Portal 세션 생성 (구독 관리)"""
    if not user.stripe_customer_id:
        raise HTTPException(
            status_code=400,
            detail="No active subscription. Please subscribe first.",
        )

    payment_service = PaymentService(db)

    try:
        portal_url = await payment_service.create_portal_session(
            user=user,
            return_url=return_url,
        )
        return PortalResponse(portal_url=portal_url)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/usage", response_model=UsageSummaryResponse)
async def get_usage_summary(
    db: DbSession,
    user: CurrentUser,
):
    """현재 사용량 요약 조회"""
    usage_service = UsageService(db)
    summary = await usage_service.get_usage_summary(user.id)

    return UsageSummaryResponse(**summary)


@router.post("/webhook")
async def handle_stripe_webhook(
    request: Request,
    db: DbSession,
):
    """Stripe Webhook 처리"""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    if not sig_header:
        raise HTTPException(status_code=400, detail="Missing Stripe signature")

    payment_service = PaymentService(db)

    try:
        result = await payment_service.handle_webhook_event(payload, sig_header)
        return result
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/downgrade")
async def downgrade_to_free(
    db: DbSession,
    user: CurrentUser,
):
    """Free 티어로 다운그레이드 (구독 취소 후)"""
    if user.subscription_tier == SubscriptionTier.FREE:
        raise HTTPException(status_code=400, detail="Already on free tier")

    # Stripe Customer Portal을 통해 취소하도록 안내
    if user.stripe_customer_id:
        return {
            "message": "Please cancel your subscription through the customer portal",
            "action": "redirect_to_portal",
        }

    # Stripe 연동 없이 직접 다운그레이드 (테스트용)
    user.subscription_tier = SubscriptionTier.FREE
    await db.commit()

    return {"success": True, "new_tier": "free"}
