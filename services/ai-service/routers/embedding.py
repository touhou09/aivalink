"""
Embedding Router
Decision D6: text-embedding-3-small (1536d)
Generates embeddings for memory search via ChromaDB
"""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class EmbeddingRequest(BaseModel):
    text: str
    model: str = "text-embedding-3-small"


class EmbeddingResponse(BaseModel):
    embedding: list[float]
    dimensions: int


class BatchEmbeddingRequest(BaseModel):
    texts: list[str]
    model: str = "text-embedding-3-small"


class BatchEmbeddingResponse(BaseModel):
    embeddings: list[list[float]]
    dimensions: int


@router.post("/generate", response_model=EmbeddingResponse)
async def generate_embedding(req: EmbeddingRequest):
    # TODO: Call OpenAI embedding API
    return EmbeddingResponse(embedding=[], dimensions=1536)


@router.post("/batch", response_model=BatchEmbeddingResponse)
async def batch_embeddings(req: BatchEmbeddingRequest):
    # TODO: Batch embedding generation
    return BatchEmbeddingResponse(embeddings=[], dimensions=1536)
