"""
Memory Sync API

Receives high-importance memories from the gateway and stores/embeds
them as DocumentChunks for long-term RAG retrieval.
"""

from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select

from app.db.models import Document, DocumentChunk
from app.api.deps import DbSession
from app.services.embedding import get_embedding_service

router = APIRouter()

# ============================================================
# Schemas
# ============================================================

MEMORY_SYNTHETIC_FILENAME = "__gateway_memories__"


class MemoryItem(BaseModel):
    id: str
    content: str
    type: str
    importance: int
    user_id: str
    character_id: str


class MemorySyncRequest(BaseModel):
    memories: list[MemoryItem]


class MemorySyncResponse(BaseModel):
    synced: int


class MemoryChunkResponse(BaseModel):
    id: str
    content: str
    chunk_metadata: Optional[dict]


class MemoryListResponse(BaseModel):
    items: list[MemoryChunkResponse]
    total: int


# ============================================================
# Helpers
# ============================================================


async def _get_or_create_memory_document(db: DbSession, user_id: str, character_id: str) -> Document:
    """Return a synthetic Document used as a container for gateway memories."""
    filename = f"{MEMORY_SYNTHETIC_FILENAME}:{character_id}"
    result = await db.execute(
        select(Document).where(
            Document.user_id == user_id,
            Document.filename == filename,
        )
    )
    doc = result.scalar_one_or_none()
    if doc is None:
        doc = Document(
            user_id=user_id,
            filename=filename,
            content="",
            content_hash=f"{user_id}:{character_id}",
            file_size=0,
        )
        db.add(doc)
        await db.flush()
    return doc


# ============================================================
# Endpoints
# ============================================================


@router.post("/sync", response_model=MemorySyncResponse)
async def sync_memories(request: MemorySyncRequest, db: DbSession):
    """Receive memories from gateway and store/embed for RAG."""
    embedding_service = get_embedding_service()
    synced = 0

    for item in request.memories:
        # Check if this memory is already stored (idempotent by id stored in metadata)
        existing = await db.execute(
            select(DocumentChunk).where(
                DocumentChunk.chunk_metadata["gateway_memory_id"].astext == item.id
            )
        )
        if existing.scalar_one_or_none() is not None:
            continue

        doc = await _get_or_create_memory_document(db, item.user_id, item.character_id)

        embedding = embedding_service.embed(item.content)
        chunk = DocumentChunk(
            document_id=doc.id,
            content=item.content,
            embedding=embedding,
            chunk_index=0,
            chunk_metadata={
                "gateway_memory_id": item.id,
                "type": item.type,
                "importance": item.importance,
                "character_id": item.character_id,
            },
        )
        db.add(chunk)
        synced += 1

    await db.commit()
    return MemorySyncResponse(synced=synced)


@router.get("/{user_id}/{character_id}", response_model=MemoryListResponse)
async def get_memories(
    user_id: str,
    character_id: str,
    db: DbSession,
    limit: int = 20,
):
    """Get memories for a user+character pair."""
    filename = f"{MEMORY_SYNTHETIC_FILENAME}:{character_id}"
    result = await db.execute(
        select(Document).where(
            Document.user_id == user_id,
            Document.filename == filename,
        )
    )
    doc = result.scalar_one_or_none()
    if doc is None:
        return MemoryListResponse(items=[], total=0)

    chunks_result = await db.execute(
        select(DocumentChunk)
        .where(DocumentChunk.document_id == doc.id)
        .order_by(DocumentChunk.id.desc())
        .limit(limit)
    )
    chunks = chunks_result.scalars().all()

    items = [
        MemoryChunkResponse(
            id=str(chunk.id),
            content=chunk.content,
            chunk_metadata=chunk.chunk_metadata,
        )
        for chunk in chunks
    ]
    return MemoryListResponse(items=items, total=len(items))
