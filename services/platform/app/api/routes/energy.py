"""
Energy API 엔드포인트 (Task 3c.1 - Energy Consumption Billing)

- 에너지 팩 목록 조회
- 에너지 잔액 조회
- 에너지 팩 구매 (Stripe Checkout)
- 일일 에너지 충전
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.api.deps import DbSession, CurrentUser
from app.services.energy import EnergyService
from app.services.payment import PaymentService

router = APIRouter()


class EnergyPackInfo(BaseModel):
    pack_id: str
    name: str
    energy_amount: int
    price: float
    price_display: str


class EnergyPurchaseRequest(BaseModel):
    pack_id: str
    success_url: str
    cancel_url: str


class EnergyPurchaseResponse(BaseModel):
    checkout_url: str


class EnergyBalanceResponse(BaseModel):
    current: int
    max: int
    tier: str
    daily_refill: int
    next_refill_at: str | None


# Energy packs available for one-time purchase
ENERGY_PACKS = [
    EnergyPackInfo(pack_id="energy_50", name="50 Energy", energy_amount=50, price=0.99, price_display="$0.99"),
    EnergyPackInfo(pack_id="energy_200", name="200 Energy", energy_amount=200, price=2.99, price_display="$2.99"),
    EnergyPackInfo(pack_id="energy_500", name="500 Energy", energy_amount=500, price=5.99, price_display="$5.99"),
]

TIER_DAILY_REFILL = {
    "free": 50,
    "standard": 200,
    "premium": 500,
}


@router.get("/packs", response_model=list[EnergyPackInfo])
async def list_energy_packs():
    """사용 가능한 에너지 팩 목록 조회"""
    return ENERGY_PACKS


@router.get("/balance", response_model=EnergyBalanceResponse)
async def get_energy_balance(user: CurrentUser):
    """현재 에너지 잔액 조회"""
    tier = user.subscription_tier.value
    return EnergyBalanceResponse(
        current=user.energy_balance,
        max=user.energy_max,
        tier=tier,
        daily_refill=TIER_DAILY_REFILL.get(tier, 50),
        next_refill_at=user.last_energy_reset_at.isoformat() if user.last_energy_reset_at else None,
    )


@router.post("/purchase", response_model=EnergyPurchaseResponse)
async def purchase_energy(request: EnergyPurchaseRequest, db: DbSession, user: CurrentUser):
    """에너지 팩 구매 - Stripe Checkout 세션 생성"""
    pack = next((p for p in ENERGY_PACKS if p.pack_id == request.pack_id), None)
    if not pack:
        raise HTTPException(status_code=400, detail="Invalid energy pack")

    payment_service = PaymentService(db)

    try:
        checkout_url = await payment_service.create_energy_checkout_session(
            user=user,
            pack_id=pack.pack_id,
            energy_amount=pack.energy_amount,
            price=pack.price,
            success_url=request.success_url,
            cancel_url=request.cancel_url,
        )
        return EnergyPurchaseResponse(checkout_url=checkout_url)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/refill")
async def daily_refill(db: DbSession, user: CurrentUser):
    """일일 에너지 충전 (스케줄러에 의해 자동 실행, 수동 트리거 가능)"""
    energy_service = EnergyService(db)

    try:
        new_balance = await energy_service.daily_refill(user.id)
        return {"success": True, "new_balance": new_balance}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
