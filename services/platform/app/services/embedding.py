"""
Embedding Service for RAG (Retrieval-Augmented Generation)

Uses sentence-transformers for local embedding generation.
Model: all-MiniLM-L6-v2 (384 dimensions, fast, good quality)
"""

import hashlib
import re
from typing import Optional

from sentence_transformers import SentenceTransformer


class EmbeddingService:
    """텍스트 임베딩 및 청킹 서비스"""

    MODEL_NAME = "all-MiniLM-L6-v2"
    EMBEDDING_DIM = 384
    MAX_CHUNK_SIZE = 500  # characters
    CHUNK_OVERLAP = 50  # characters

    def __init__(self):
        self._model: Optional[SentenceTransformer] = None

    @property
    def model(self) -> SentenceTransformer:
        if self._model is None:
            self._model = SentenceTransformer(self.MODEL_NAME)
        return self._model

    def embed(self, text: str) -> list[float]:
        """텍스트를 벡터로 변환"""
        embedding = self.model.encode(text, convert_to_numpy=True)
        return embedding.tolist()

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """여러 텍스트를 배치로 임베딩"""
        embeddings = self.model.encode(texts, convert_to_numpy=True)
        return embeddings.tolist()

    def chunk_markdown(self, content: str) -> list[dict]:
        """
        마크다운 문서를 의미 단위로 청킹

        Returns:
            list of {content: str, metadata: dict}
        """
        chunks = []
        current_heading = None
        current_content = []

        lines = content.split("\n")

        for line in lines:
            # 헤딩 감지 (# ## ### 등)
            heading_match = re.match(r"^(#{1,6})\s+(.+)$", line)

            if heading_match:
                # 이전 섹션 저장
                if current_content:
                    chunk_text = "\n".join(current_content).strip()
                    if chunk_text:
                        chunks.extend(
                            self._split_large_chunk(chunk_text, current_heading)
                        )
                    current_content = []

                current_heading = heading_match.group(2)
                current_content.append(line)
            else:
                current_content.append(line)

        # 마지막 섹션 저장
        if current_content:
            chunk_text = "\n".join(current_content).strip()
            if chunk_text:
                chunks.extend(self._split_large_chunk(chunk_text, current_heading))

        # 인덱스 추가
        for idx, chunk in enumerate(chunks):
            chunk["chunk_index"] = idx

        return chunks

    def _split_large_chunk(
        self, text: str, heading: Optional[str]
    ) -> list[dict]:
        """큰 청크를 MAX_CHUNK_SIZE로 분할"""
        if len(text) <= self.MAX_CHUNK_SIZE:
            return [{"content": text, "metadata": {"heading": heading}}]

        chunks = []
        start = 0

        while start < len(text):
            end = start + self.MAX_CHUNK_SIZE

            # 문장 경계에서 자르기 시도
            if end < len(text):
                # 마침표, 물음표, 느낌표 찾기
                for sep in [". ", "? ", "! ", "\n\n", "\n"]:
                    last_sep = text.rfind(sep, start, end)
                    if last_sep > start:
                        end = last_sep + len(sep)
                        break

            chunk_text = text[start:end].strip()
            if chunk_text:
                chunks.append({
                    "content": chunk_text,
                    "metadata": {
                        "heading": heading,
                        "is_continuation": start > 0,
                    },
                })

            start = end - self.CHUNK_OVERLAP
            if start < 0:
                start = 0
            if start >= len(text):
                break

        return chunks

    @staticmethod
    def compute_hash(content: str) -> str:
        """문서 내용의 SHA256 해시 계산"""
        return hashlib.sha256(content.encode("utf-8")).hexdigest()


# Singleton instance
_embedding_service: Optional[EmbeddingService] = None


def get_embedding_service() -> EmbeddingService:
    """임베딩 서비스 싱글톤 반환"""
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service
