"""
Proactive Analyzer - 사용자 문서 기반 선제적 인사이트 발견

1. 사용자 문서에서 핵심 키워드/토픽 추출
2. 외부 검색 (DuckDuckGo)으로 관련 최신 정보 검색
3. 유의미한 인사이트 발견 시 알림 생성
"""
import logging
import re
from datetime import datetime
from typing import Optional
from collections import Counter

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Document, DocumentChunk, Notification, NotificationType, User
from app.services.embedding import EmbeddingService

logger = logging.getLogger(__name__)


class ProactiveAnalyzer:
    """사용자 문서 기반 선제적 인사이트 분석기"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.embedding_service = EmbeddingService()

    async def analyze_all_users(self) -> dict:
        """모든 활성 사용자에 대해 분석 실행"""
        results = {"analyzed": 0, "notifications_created": 0, "errors": 0}

        # 문서를 가진 사용자 조회
        stmt = select(User.id).join(Document).distinct()
        result = await self.db.execute(stmt)
        user_ids = [row[0] for row in result.fetchall()]

        for user_id in user_ids:
            try:
                notifications = await self.analyze_user_documents(user_id)
                results["analyzed"] += 1
                results["notifications_created"] += len(notifications)
            except Exception as e:
                logger.error(f"Analysis failed for user {user_id}: {e}")
                results["errors"] += 1

        return results

    async def analyze_user_documents(self, user_id: str) -> list[Notification]:
        """특정 사용자의 문서 분석 및 인사이트 생성"""
        notifications = []

        # 사용자 문서 조회
        stmt = select(Document).where(Document.user_id == user_id)
        result = await self.db.execute(stmt)
        documents = result.scalars().all()

        if not documents:
            return notifications

        # 모든 문서에서 핵심 키워드 추출
        keywords = await self._extract_keywords_from_documents(documents)

        if not keywords:
            return notifications

        # 외부 검색으로 관련 정보 찾기
        search_results = await self._search_related_info(keywords[:5])  # 상위 5개 키워드만

        # 유의미한 인사이트 필터링 및 알림 생성
        for insight in search_results:
            notification = await self._create_notification_if_relevant(
                user_id=user_id,
                insight=insight,
                documents=documents,
            )
            if notification:
                notifications.append(notification)

        return notifications

    async def _extract_keywords_from_documents(
        self, documents: list[Document]
    ) -> list[str]:
        """문서들에서 핵심 키워드 추출 (TF 기반 단순 추출)"""
        all_text = " ".join(doc.content for doc in documents)

        # 간단한 키워드 추출 (정규식으로 단어 분리)
        words = re.findall(r'\b[a-zA-Z]{4,}\b', all_text.lower())

        # 불용어 제거
        stopwords = {
            'this', 'that', 'with', 'from', 'have', 'will', 'would', 'could',
            'should', 'about', 'been', 'were', 'they', 'their', 'there',
            'which', 'when', 'what', 'where', 'some', 'more', 'most', 'other',
            'than', 'then', 'also', 'only', 'just', 'like', 'into', 'over',
            'such', 'make', 'made', 'each', 'after', 'before', 'very', 'because',
        }
        words = [w for w in words if w not in stopwords]

        # 빈도 기반 정렬
        word_counts = Counter(words)
        top_keywords = [word for word, _ in word_counts.most_common(20)]

        # 기술 관련 키워드 우선 (간단한 휴리스틱)
        tech_words = {'react', 'python', 'javascript', 'typescript', 'api', 'database',
                      'kubernetes', 'docker', 'aws', 'machine', 'learning', 'model',
                      'data', 'algorithm', 'system', 'server', 'client', 'frontend',
                      'backend', 'cloud', 'security', 'performance', 'migration'}

        prioritized = sorted(
            top_keywords,
            key=lambda w: (w in tech_words, word_counts[w]),
            reverse=True
        )

        return prioritized[:10]

    async def _search_related_info(self, keywords: list[str]) -> list[dict]:
        """DuckDuckGo로 관련 정보 검색"""
        results = []

        try:
            from duckduckgo_search import DDGS

            ddgs = DDGS()

            for keyword in keywords:
                # 기술 뉴스 검색
                query = f"{keyword} latest news update 2026"
                try:
                    search_results = list(ddgs.text(query, max_results=3))
                    for r in search_results:
                        results.append({
                            "keyword": keyword,
                            "title": r.get("title", ""),
                            "body": r.get("body", ""),
                            "url": r.get("href", ""),
                        })
                except Exception as e:
                    logger.warning(f"Search failed for keyword '{keyword}': {e}")
                    continue

        except ImportError:
            logger.warning("duckduckgo-search not installed, skipping external search")
        except Exception as e:
            logger.error(f"Search service error: {e}")

        return results

    async def _create_notification_if_relevant(
        self,
        user_id: str,
        insight: dict,
        documents: list[Document],
    ) -> Optional[Notification]:
        """인사이트가 유의미하면 알림 생성"""
        # 간단한 관련성 체크: 문서 내용과 검색 결과 유사도
        insight_text = f"{insight['title']} {insight['body']}"

        # 문서 내용과 인사이트 간 키워드 오버랩 체크
        doc_text = " ".join(doc.content.lower() for doc in documents)
        insight_words = set(re.findall(r'\b[a-zA-Z]{4,}\b', insight_text.lower()))
        doc_words = set(re.findall(r'\b[a-zA-Z]{4,}\b', doc_text))

        overlap = insight_words & doc_words
        overlap_ratio = len(overlap) / max(len(insight_words), 1)

        # 20% 이상 오버랩이면 관련성 있다고 판단
        if overlap_ratio < 0.2:
            return None

        # 중복 알림 방지: 같은 URL로 이미 알림이 있는지 확인
        stmt = select(Notification).where(
            Notification.user_id == user_id,
            Notification.source_url == insight.get("url"),
        )
        result = await self.db.execute(stmt)
        if result.scalar():
            return None

        # 알림 생성
        notification = Notification(
            user_id=user_id,
            notification_type=NotificationType.PROACTIVE_INSIGHT,
            title=f"📰 {insight['keyword'].title()} 관련 새 소식",
            content=insight["title"],
            source_query=insight["keyword"],
            source_url=insight.get("url"),
        )

        self.db.add(notification)
        await self.db.commit()
        await self.db.refresh(notification)

        logger.info(f"Created notification for user {user_id}: {notification.title}")
        return notification

    async def analyze_single_document(
        self, document: Document
    ) -> list[dict]:
        """단일 문서에 대한 관련 정보 검색 (on-demand)"""
        keywords = await self._extract_keywords_from_documents([document])
        return await self._search_related_info(keywords[:3])
