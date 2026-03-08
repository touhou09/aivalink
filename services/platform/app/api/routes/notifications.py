"""
알림 API 엔드포인트 (Phase 6 - Proactive Agent)

- 알림 목록 조회 (읽지 않은 알림 우선)
- 알림 읽음 처리
- 알림 삭제
- 수동 분석 트리거
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, update

from app.api.deps import DbSession, CurrentUser
from app.db.models import Notification, NotificationType

router = APIRouter()


class NotificationResponse(BaseModel):
    id: str
    notification_type: str
    title: str
    content: str
    source_url: Optional[str] = None
    is_read: bool
    created_at: datetime
    read_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse]
    total: int
    unread_count: int


class NotificationUpdate(BaseModel):
    is_read: Optional[bool] = None
    is_dismissed: Optional[bool] = None


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    db: DbSession,
    user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    unread_only: bool = Query(False),
):
    """사용자의 알림 목록 조회"""
    # 기본 쿼리
    base_query = select(Notification).where(
        Notification.user_id == user.id,
        Notification.is_dismissed == False,
    )

    if unread_only:
        base_query = base_query.where(Notification.is_read == False)

    # 읽지 않은 알림 우선, 최신순 정렬
    query = (
        base_query
        .order_by(Notification.is_read, Notification.created_at.desc())
        .offset(skip)
        .limit(limit)
    )

    result = await db.execute(query)
    notifications = result.scalars().all()

    # 전체 개수
    count_query = select(func.count()).select_from(
        base_query.subquery()
    )
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # 읽지 않은 알림 개수
    unread_query = select(func.count()).where(
        Notification.user_id == user.id,
        Notification.is_read == False,
        Notification.is_dismissed == False,
    )
    unread_result = await db.execute(unread_query)
    unread_count = unread_result.scalar() or 0

    return NotificationListResponse(
        items=[NotificationResponse.model_validate(n) for n in notifications],
        total=total,
        unread_count=unread_count,
    )


@router.get("/unread-count")
async def get_unread_count(
    db: DbSession,
    user: CurrentUser,
):
    """읽지 않은 알림 개수만 반환 (헤더 배지용)"""
    query = select(func.count()).where(
        Notification.user_id == user.id,
        Notification.is_read == False,
        Notification.is_dismissed == False,
    )
    result = await db.execute(query)
    count = result.scalar() or 0

    return {"unread_count": count}


@router.patch("/{notification_id}", response_model=NotificationResponse)
async def update_notification(
    notification_id: str,
    update_data: NotificationUpdate,
    db: DbSession,
    user: CurrentUser,
):
    """알림 업데이트 (읽음 처리 등)"""
    query = select(Notification).where(
        Notification.id == notification_id,
        Notification.user_id == user.id,
    )
    result = await db.execute(query)
    notification = result.scalar_one_or_none()

    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    if update_data.is_read is not None:
        notification.is_read = update_data.is_read
        if update_data.is_read:
            notification.read_at = datetime.utcnow()

    if update_data.is_dismissed is not None:
        notification.is_dismissed = update_data.is_dismissed

    await db.commit()
    await db.refresh(notification)

    return NotificationResponse.model_validate(notification)


@router.post("/mark-all-read")
async def mark_all_as_read(
    db: DbSession,
    user: CurrentUser,
):
    """모든 알림을 읽음으로 표시"""
    stmt = (
        update(Notification)
        .where(
            Notification.user_id == user.id,
            Notification.is_read == False,
        )
        .values(is_read=True, read_at=datetime.utcnow())
    )
    result = await db.execute(stmt)
    await db.commit()

    return {"marked_count": result.rowcount}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    db: DbSession,
    user: CurrentUser,
):
    """알림 삭제 (soft delete = dismissed)"""
    query = select(Notification).where(
        Notification.id == notification_id,
        Notification.user_id == user.id,
    )
    result = await db.execute(query)
    notification = result.scalar_one_or_none()

    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    notification.is_dismissed = True
    await db.commit()

    return {"success": True}


@router.post("/trigger-analysis")
async def trigger_proactive_analysis(
    db: DbSession,
    user: CurrentUser,
):
    """수동으로 Proactive 분석 트리거 (on-demand)"""
    from app.services.proactive import ProactiveAnalyzer

    analyzer = ProactiveAnalyzer(db)
    notifications = await analyzer.analyze_user_documents(user.id)

    return {
        "success": True,
        "notifications_created": len(notifications),
        "message": f"Analysis complete. {len(notifications)} new insights found.",
    }
