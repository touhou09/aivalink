"""
Document API for Knowledge Base

Handles MD file upload, chunking, embedding, and RAG search.
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, status
from pydantic import BaseModel
from sqlalchemy import select, func

from app.db.models import Document, DocumentChunk, Persona
from app.api.deps import DbSession, CurrentUser
from app.services.embedding import get_embedding_service
from app.services.rag import get_rag_service

router = APIRouter()


# ============================================================
# Pydantic Schemas
# ============================================================

class DocumentResponse(BaseModel):
    id: str
    user_id: str
    persona_id: Optional[str]
    filename: str
    file_size: int
    chunk_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DocumentListResponse(BaseModel):
    items: list[DocumentResponse]
    total: int


class SearchRequest(BaseModel):
    query: str
    persona_id: Optional[str] = None
    top_k: int = 5


class SearchResult(BaseModel):
    chunk_id: str
    content: str
    similarity: float
    metadata: Optional[dict]
    document_filename: str


class SearchResponse(BaseModel):
    query: str
    results: list[SearchResult]


# ============================================================
# API Endpoints
# ============================================================

@router.post("", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    current_user: CurrentUser,
    db: DbSession,
    file: UploadFile = File(...),
    persona_id: Optional[str] = Form(None),
):
    """
    MD 파일 업로드

    - 파일을 읽고 SHA256 해시로 중복 검사
    - 마크다운을 청킹하고 임베딩 생성
    - 문서와 청크를 DB에 저장
    """
    # 파일 확장자 검증
    if not file.filename or not file.filename.endswith(".md"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .md (Markdown) files are supported",
        )

    # 파일 읽기
    content = await file.read()
    try:
        content_str = content.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be UTF-8 encoded",
        )

    # persona_id 검증 (제공된 경우)
    if persona_id:
        result = await db.execute(
            select(Persona).where(
                Persona.id == persona_id,
                Persona.owner_id == current_user.id,
            )
        )
        if not result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Persona not found",
            )

    embedding_service = get_embedding_service()

    # 해시 계산 및 중복 검사
    content_hash = embedding_service.compute_hash(content_str)
    result = await db.execute(
        select(Document).where(
            Document.user_id == current_user.id,
            Document.content_hash == content_hash,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Document already exists: {existing.filename}",
        )

    # 문서 생성
    document = Document(
        user_id=current_user.id,
        persona_id=persona_id,
        filename=file.filename,
        content=content_str,
        content_hash=content_hash,
        file_size=len(content),
    )
    db.add(document)
    await db.flush()  # ID 생성을 위해 flush

    # 청킹 및 임베딩
    chunks = embedding_service.chunk_markdown(content_str)
    chunk_texts = [c["content"] for c in chunks]
    embeddings = embedding_service.embed_batch(chunk_texts)

    # 청크 저장
    for chunk_data, embedding in zip(chunks, embeddings):
        chunk = DocumentChunk(
            document_id=document.id,
            content=chunk_data["content"],
            embedding=embedding,
            chunk_index=chunk_data["chunk_index"],
            chunk_metadata=chunk_data.get("metadata"),
        )
        db.add(chunk)

    document.chunk_count = len(chunks)

    await db.commit()
    await db.refresh(document)

    return document


@router.get("", response_model=DocumentListResponse)
async def list_documents(
    current_user: CurrentUser,
    db: DbSession,
    persona_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
):
    """사용자의 문서 목록 조회"""
    query = select(Document).where(Document.user_id == current_user.id)

    if persona_id:
        query = query.where(
            (Document.persona_id == persona_id) | (Document.persona_id.is_(None))
        )

    # 총 개수
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # 페이징
    query = query.order_by(Document.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    documents = result.scalars().all()

    return DocumentListResponse(items=documents, total=total)


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: str,
    current_user: CurrentUser,
    db: DbSession,
):
    """특정 문서 조회"""
    result = await db.execute(
        select(Document).where(
            Document.id == document_id,
            Document.user_id == current_user.id,
        )
    )
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )
    return document


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: str,
    current_user: CurrentUser,
    db: DbSession,
):
    """문서 삭제 (관련 청크도 cascade 삭제)"""
    result = await db.execute(
        select(Document).where(
            Document.id == document_id,
            Document.user_id == current_user.id,
        )
    )
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    await db.delete(document)
    await db.commit()


@router.post("/search", response_model=SearchResponse)
async def search_documents(
    search_request: SearchRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    """
    RAG 벡터 유사도 검색

    사용자의 문서에서 쿼리와 가장 유사한 청크를 검색합니다.
    """
    rag_service = get_rag_service()

    results = await rag_service.search(
        db=db,
        query=search_request.query,
        user_id=current_user.id,
        persona_id=search_request.persona_id,
        top_k=search_request.top_k,
    )

    return SearchResponse(
        query=search_request.query,
        results=[SearchResult(**r) for r in results],
    )


@router.get("/{document_id}/content")
async def get_document_content(
    document_id: str,
    current_user: CurrentUser,
    db: DbSession,
):
    """문서 원본 내용 조회"""
    result = await db.execute(
        select(Document).where(
            Document.id == document_id,
            Document.user_id == current_user.id,
        )
    )
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    return {
        "id": document.id,
        "filename": document.filename,
        "content": document.content,
    }
