"""
Billing API 테스트 (Phase 7 - Monetization)
"""
import pytest
from httpx import AsyncClient


@pytest.fixture
async def auth_headers(client: AsyncClient, test_user_data: dict) -> dict:
    """Helper to get auth headers"""
    # Register user
    await client.post("/api/v1/auth/register", json=test_user_data)

    # Login
    response = await client.post(
        "/api/v1/auth/login",
        data={
            "username": test_user_data["username"],
            "password": test_user_data["password"],
        },
    )
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


class TestPlans:
    """요금제 목록 테스트"""

    @pytest.mark.asyncio
    async def test_get_plans(self, client: AsyncClient, auth_headers: dict):
        """요금제 목록 조회"""
        response = await client.get(
            "/api/v1/billing/plans",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "plans" in data
        assert "current_tier" in data
        assert len(data["plans"]) == 3  # Free, Standard, Premium

        # Check plan structure
        for plan in data["plans"]:
            assert "tier" in plan
            assert "name" in plan
            assert "price" in plan
            assert "features" in plan
            assert "limits" in plan

    @pytest.mark.asyncio
    async def test_new_user_is_free_tier(
        self, client: AsyncClient, auth_headers: dict
    ):
        """새 사용자는 Free 티어"""
        response = await client.get(
            "/api/v1/billing/plans",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["current_tier"] == "free"

    @pytest.mark.asyncio
    async def test_get_plans_unauthorized(self, client: AsyncClient):
        """인증 없이 요금제 조회 시 401"""
        response = await client.get("/api/v1/billing/plans")
        assert response.status_code == 401


class TestUsage:
    """사용량 조회 테스트"""

    @pytest.mark.asyncio
    async def test_get_usage_summary(
        self, client: AsyncClient, auth_headers: dict
    ):
        """사용량 요약 조회"""
        response = await client.get(
            "/api/v1/billing/usage",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()

        # Check structure
        assert "tier" in data
        assert "limits" in data
        assert "usage" in data
        assert "remaining" in data

        # Check limits structure
        limits = data["limits"]
        assert "max_personas" in limits
        assert "max_documents" in limits
        assert "max_messages_per_day" in limits
        assert "proactive_enabled" in limits

        # Check usage structure
        usage = data["usage"]
        assert "personas" in usage
        assert "documents" in usage
        assert "messages_today" in usage

    @pytest.mark.asyncio
    async def test_new_user_usage_is_zero(
        self, client: AsyncClient, auth_headers: dict
    ):
        """새 사용자의 사용량은 0"""
        response = await client.get(
            "/api/v1/billing/usage",
            headers=auth_headers,
        )

        data = response.json()
        assert data["usage"]["personas"] == 0
        assert data["usage"]["documents"] == 0
        assert data["usage"]["messages_today"] == 0


class TestCheckout:
    """Checkout 세션 테스트"""

    @pytest.mark.asyncio
    async def test_checkout_free_tier_fails(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Free 티어로 checkout 시도 시 실패"""
        response = await client.post(
            "/api/v1/billing/checkout",
            headers=auth_headers,
            json={
                "tier": "free",
                "success_url": "http://localhost/success",
                "cancel_url": "http://localhost/cancel",
            },
        )

        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_checkout_invalid_tier_fails(
        self, client: AsyncClient, auth_headers: dict
    ):
        """잘못된 티어로 checkout 시도 시 실패"""
        response = await client.post(
            "/api/v1/billing/checkout",
            headers=auth_headers,
            json={
                "tier": "invalid",
                "success_url": "http://localhost/success",
                "cancel_url": "http://localhost/cancel",
            },
        )

        assert response.status_code == 400


class TestDowngrade:
    """다운그레이드 테스트"""

    @pytest.mark.asyncio
    async def test_downgrade_already_free(
        self, client: AsyncClient, auth_headers: dict
    ):
        """이미 Free 티어인 경우 다운그레이드 실패"""
        response = await client.post(
            "/api/v1/billing/downgrade",
            headers=auth_headers,
        )

        assert response.status_code == 400
