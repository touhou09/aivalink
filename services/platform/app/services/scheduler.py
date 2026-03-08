"""
APScheduler 기반 백그라운드 스케줄러 서비스

Proactive Agent가 주기적으로 실행되어:
1. 사용자 문서를 분석하고 관련 뉴스/정보를 검색
2. 유의미한 인사이트를 발견하면 알림 생성
"""
import logging
from contextlib import asynccontextmanager
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.db.database import AsyncSessionLocal

logger = logging.getLogger(__name__)


class SchedulerService:
    """APScheduler 기반 백그라운드 작업 스케줄러"""

    def __init__(self):
        self.scheduler: Optional[AsyncIOScheduler] = None
        self._is_running = False

    def start(self):
        """스케줄러 시작"""
        if self._is_running:
            logger.warning("Scheduler is already running")
            return

        self.scheduler = AsyncIOScheduler(
            timezone="UTC",
            job_defaults={
                "coalesce": True,  # 놓친 작업 합치기
                "max_instances": 1,  # 동시 실행 방지
                "misfire_grace_time": 60 * 5,  # 5분 유예
            }
        )

        # 작업 등록
        self._register_jobs()

        self.scheduler.start()
        self._is_running = True
        logger.info("Scheduler started successfully")

    def stop(self):
        """스케줄러 종료"""
        if self.scheduler and self._is_running:
            self.scheduler.shutdown(wait=True)
            self._is_running = False
            logger.info("Scheduler stopped")

    def _register_jobs(self):
        """정기 작업 등록"""
        if not self.scheduler:
            return

        # 1. Proactive Analysis: 매 6시간마다 실행
        self.scheduler.add_job(
            self._run_proactive_analysis,
            trigger=IntervalTrigger(hours=6),
            id="proactive_analysis",
            name="Proactive Document Analysis",
            replace_existing=True,
        )

        # 2. Daily Digest: 매일 오전 9시 (UTC 기준)
        self.scheduler.add_job(
            self._run_daily_digest,
            trigger=CronTrigger(hour=9, minute=0),
            id="daily_digest",
            name="Daily Knowledge Digest",
            replace_existing=True,
        )

        # 3. Cleanup: 매일 자정에 오래된 알림 정리
        self.scheduler.add_job(
            self._cleanup_old_notifications,
            trigger=CronTrigger(hour=0, minute=0),
            id="notification_cleanup",
            name="Notification Cleanup",
            replace_existing=True,
        )

        logger.info(f"Registered {len(self.scheduler.get_jobs())} scheduled jobs")

    async def _run_proactive_analysis(self):
        """Proactive 분석 실행"""
        from app.services.proactive import ProactiveAnalyzer

        logger.info("Starting proactive analysis job")
        try:
            async with AsyncSessionLocal() as db:
                analyzer = ProactiveAnalyzer(db)
                results = await analyzer.analyze_all_users()
                logger.info(f"Proactive analysis completed: {results}")
        except Exception as e:
            logger.exception(f"Proactive analysis failed: {e}")

    async def _run_daily_digest(self):
        """일일 요약 생성"""
        logger.info("Starting daily digest job")
        # TODO: 구현 - 사용자별 일일 인사이트 요약 알림 생성
        pass

    async def _cleanup_old_notifications(self):
        """30일 이상 된 읽은 알림 삭제"""
        from datetime import datetime, timedelta
        from sqlalchemy import delete
        from app.db.models import Notification

        logger.info("Starting notification cleanup job")
        try:
            async with AsyncSessionLocal() as db:
                cutoff_date = datetime.utcnow() - timedelta(days=30)
                stmt = delete(Notification).where(
                    Notification.is_read == True,
                    Notification.created_at < cutoff_date
                )
                result = await db.execute(stmt)
                await db.commit()
                logger.info(f"Cleaned up {result.rowcount} old notifications")
        except Exception as e:
            logger.exception(f"Notification cleanup failed: {e}")

    def trigger_job_now(self, job_id: str):
        """특정 작업을 즉시 실행"""
        if self.scheduler:
            job = self.scheduler.get_job(job_id)
            if job:
                job.modify(next_run_time=None)  # 즉시 실행
                logger.info(f"Triggered job: {job_id}")
                return True
        return False

    @property
    def is_running(self) -> bool:
        return self._is_running

    def get_jobs_info(self) -> list[dict]:
        """등록된 작업 목록 반환"""
        if not self.scheduler:
            return []

        jobs = []
        for job in self.scheduler.get_jobs():
            jobs.append({
                "id": job.id,
                "name": job.name,
                "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
                "trigger": str(job.trigger),
            })
        return jobs


# Singleton instance
scheduler_service = SchedulerService()


@asynccontextmanager
async def lifespan_scheduler():
    """FastAPI lifespan에서 사용할 컨텍스트 매니저"""
    scheduler_service.start()
    yield
    scheduler_service.stop()
