"""
Notification API 테스트 (Phase 6 - Proactive Agent)
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


class TestNotificationsList:
    """알림 목록 조회 테스트"""

    @pytest.mark.asyncio
    async def test_list_notifications_empty(
        self, client: AsyncClient, auth_headers: dict
    ):
        """빈 알림 목록 조회"""
        response = await client.get(
            "/api/v1/notifications",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["items"] == []
        assert data["total"] == 0
        assert data["unread_count"] == 0

    @pytest.mark.asyncio
    async def test_list_notifications_unauthorized(self, client: AsyncClient):
        """인증 없이 알림 조회 시 401"""
        response = await client.get("/api/v1/notifications")
        assert response.status_code == 401


class TestUnreadCount:
    """읽지 않은 알림 개수 테스트"""

    @pytest.mark.asyncio
    async def test_get_unread_count(
        self, client: AsyncClient, auth_headers: dict
    ):
        """읽지 않은 알림 개수 조회"""
        response = await client.get(
            "/api/v1/notifications/unread-count",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "unread_count" in data
        assert data["unread_count"] == 0


class TestMarkAllRead:
    """모두 읽음 처리 테스트"""

    @pytest.mark.asyncio
    async def test_mark_all_read(
        self, client: AsyncClient, auth_headers: dict
    ):
        """모든 알림 읽음 처리"""
        response = await client.post(
            "/api/v1/notifications/mark-all-read",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "marked_count" in data


class TestTriggerAnalysis:
    """수동 분석 트리거 테스트"""

    @pytest.mark.asyncio
    async def test_trigger_analysis(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Proactive 분석 트리거"""
        response = await client.post(
            "/api/v1/notifications/trigger-analysis",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "notifications_created" in data
        assert "message" in data
