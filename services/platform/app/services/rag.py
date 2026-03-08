"""
RAG (Retrieval-Augmented Generation) Service

Provides semantic search over user documents and context formatting
for VTuber persona prompts.
"""

from typing import Optional
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Document, DocumentChunk, Persona
from app.services.embedding import get_embedding_service


class RAGService:
    """문서 검색 및 컨텍스트 생성 서비스"""

    DEFAULT_TOP_K = 5
    SIMILARITY_THRESHOLD = 0.3  # cosine similarity 최소값
    MAX_CONTEXT_LENGTH = 2000  # characters

    def __init__(self):
        self.embedding_service = get_embedding_service()

    async def search(
        self,
        db: AsyncSession,
        query: str,
        user_id: str,
        persona_id: Optional[str] = None,
        top_k: int = DEFAULT_TOP_K,
    ) -> list[dict]:
        """
        벡터 유사도 검색

        Args:
            db: 데이터베이스 세션
            query: 검색 쿼리
            user_id: 사용자 ID
            persona_id: 특정 페르소나 문서만 검색 (선택)
            top_k: 반환할 최대 결과 수

        Returns:
            list of {content, similarity, metadata, document_filename}
        """
        # 쿼리 임베딩
        query_embedding = self.embedding_service.embed(query)

        # pgvector cosine similarity 검색
        # 1 - cosine_distance = cosine_similarity
        # Note: CAST 문법 사용 (asyncpg와 ::vector 타입캐스팅 충돌 방지)
        sql = text("""
            SELECT
                dc.id,
                dc.content,
                dc.chunk_metadata,
                d.filename,
                d.persona_id,
                1 - (dc.embedding <=> CAST(:query_embedding AS vector)) as similarity
            FROM document_chunks dc
            JOIN documents d ON d.id = dc.document_id
            WHERE d.user_id = :user_id
              AND (d.persona_id IS NULL OR d.persona_id = :persona_id OR :persona_id IS NULL)
              AND 1 - (dc.embedding <=> CAST(:query_embedding AS vector)) > :threshold
            ORDER BY dc.embedding <=> CAST(:query_embedding AS vector)
            LIMIT :top_k
        """)

        result = await db.execute(
            sql,
            {
                "query_embedding": str(query_embedding),
                "user_id": user_id,
                "persona_id": persona_id,
                "threshold": self.SIMILARITY_THRESHOLD,
                "top_k": top_k,
            },
        )

        rows = result.fetchall()

        return [
            {
                "chunk_id": str(row.id),  # UUID → str
                "content": row.content,
                "similarity": float(row.similarity),
                "metadata": row.chunk_metadata,
                "document_filename": row.filename,
            }
            for row in rows
        ]

    async def get_context_for_persona(
        self,
        db: AsyncSession,
        persona: Persona,
        query: Optional[str] = None,
    ) -> str:
        """
        페르소나용 RAG 컨텍스트 생성

        query가 없으면 최근 업로드된 문서의 요약 반환
        query가 있으면 관련 청크 검색

        Args:
            db: 데이터베이스 세션
            persona: 페르소나 객체
            query: 검색 쿼리 (선택)

        Returns:
            포매팅된 컨텍스트 문자열
        """
        if query:
            # 쿼리 기반 검색
            results = await self.search(
                db=db,
                query=query,
                user_id=persona.owner_id,
                persona_id=persona.id,
                top_k=self.DEFAULT_TOP_K,
            )
        else:
            # 쿼리 없음: 전체 문서에서 랜덤하게 몇 개 청크 가져오기
            results = await self._get_recent_chunks(
                db=db,
                user_id=persona.owner_id,
                persona_id=persona.id,
                limit=3,
            )

        if not results:
            return ""

        return self._format_context(results)

    async def _get_recent_chunks(
        self,
        db: AsyncSession,
        user_id: str,
        persona_id: Optional[str],
        limit: int = 3,
    ) -> list[dict]:
        """최근 업로드된 문서의 청크 가져오기"""
        sql = text("""
            SELECT
                dc.id,
                dc.content,
                dc.chunk_metadata,
                d.filename,
                d.persona_id
            FROM document_chunks dc
            JOIN documents d ON d.id = dc.document_id
            WHERE d.user_id = :user_id
              AND (d.persona_id IS NULL OR d.persona_id = :persona_id OR :persona_id IS NULL)
            ORDER BY d.created_at DESC, dc.chunk_index ASC
            LIMIT :limit
        """)

        result = await db.execute(
            sql,
            {
                "user_id": user_id,
                "persona_id": persona_id,
                "limit": limit,
            },
        )

        rows = result.fetchall()

        return [
            {
                "chunk_id": str(row.id),  # UUID → str
                "content": row.content,
                "similarity": 1.0,  # 검색이 아니므로 1.0
                "metadata": row.chunk_metadata,
                "document_filename": row.filename,
            }
            for row in rows
        ]

    def _format_context(self, results: list[dict]) -> str:
        """검색 결과를 컨텍스트 문자열로 포매팅"""
        if not results:
            return ""

        context_parts = []
        total_length = 0

        for result in results:
            content = result["content"]

            # 최대 길이 체크
            if total_length + len(content) > self.MAX_CONTEXT_LENGTH:
                remaining = self.MAX_CONTEXT_LENGTH - total_length
                if remaining > 100:  # 너무 짧으면 생략
                    content = content[:remaining] + "..."
                else:
                    break

            metadata = result.get("metadata", {}) or {}
            heading = metadata.get("heading", "")

            if heading:
                context_parts.append(f"[{heading}]\n{content}")
            else:
                context_parts.append(content)

            total_length += len(content)

        return "\n\n---\n\n".join(context_parts)

    async def build_system_prompt_with_rag(
        self,
        db: AsyncSession,
        persona: Persona,
        user_query: Optional[str] = None,
    ) -> str:
        """
        RAG 컨텍스트가 주입된 시스템 프롬프트 생성

        Args:
            db: 데이터베이스 세션
            persona: 페르소나 객체
            user_query: 사용자 질문 (선택)

        Returns:
            강화된 시스템 프롬프트
        """
        rag_context = await self.get_context_for_persona(
            db=db,
            persona=persona,
            query=user_query,
        )

        if not rag_context:
            return persona.persona_prompt

        return f"""{persona.persona_prompt}

## 사용자에 대해 알고 있는 정보:
{rag_context}

위 정보를 자연스럽게 대화에 활용하세요. 직접 인용하지 말고 자연스럽게 녹여내세요."""


# Singleton instance
_rag_service: Optional[RAGService] = None


def get_rag_service() -> RAGService:
    """RAG 서비스 싱글톤 반환"""
    global _rag_service
    if _rag_service is None:
        _rag_service = RAGService()
    return _rag_service
