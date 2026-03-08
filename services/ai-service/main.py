"""
AivaLink AI Service - FastAPI
Centralized AI inference service: LLM chat, TTS, STT, embedding, emotion, OOC, PII.
Internal service (port 8000, not exposed externally).
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from routers import chat, tts, stt, embedding, emotion, ooc, pii


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: load models, warm caches
    yield
    # Shutdown: cleanup


app = FastAPI(
    title="AivaLink AI Service",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(chat.router, prefix="/chat", tags=["chat"])
app.include_router(tts.router, prefix="/tts", tags=["tts"])
app.include_router(stt.router, prefix="/stt", tags=["stt"])
app.include_router(pii.router, prefix="/pii", tags=["pii"])
app.include_router(embedding.router, prefix="/embedding", tags=["embedding"])
app.include_router(emotion.router, prefix="/emotion", tags=["emotion"])
app.include_router(ooc.router, prefix="/ooc", tags=["ooc"])


@app.get("/health")
async def health():
    return {"status": "ok"}
