"""
TTS Router — Text-to-Speech via server GPU
Supports multiple TTS backends with user-selectable models.

Client-side fallback: Kokoro-js WebGPU (handled by frontend)
"""

from __future__ import annotations

import os
import time
from enum import Enum

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter()


class TTSProvider(str, Enum):
    edge = "edge"
    openai = "openai"


class TTSRequest(BaseModel):
    text: str
    provider: TTSProvider = TTSProvider.edge
    voice: str = "ko-KR-SunHiNeural"
    speed: float = 1.0


class TTSInfoResponse(BaseModel):
    providers: list[str]
    default_provider: str
    default_voice: str


OPENAI_VOICES = {"alloy", "echo", "fable", "onyx", "nova", "shimmer"}


@router.get("/info", response_model=TTSInfoResponse)
async def tts_info():
    return TTSInfoResponse(
        providers=[p.value for p in TTSProvider],
        default_provider=TTSProvider.edge.value,
        default_voice="ko-KR-SunHiNeural",
    )


@router.post("/synthesize")
async def synthesize(req: TTSRequest):
    """Generate speech audio from text. Returns audio/mpeg stream."""
    if req.provider == TTSProvider.openai:
        return await _openai_tts(req)
    elif req.provider == TTSProvider.edge:
        return await _edge_tts(req)
    raise HTTPException(status_code=400, detail=f"Unknown provider: {req.provider}")


async def _openai_tts(req: TTSRequest) -> StreamingResponse:
    import openai

    client = openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    voice = req.voice if req.voice in OPENAI_VOICES else "nova"

    response = await client.audio.speech.create(
        model="tts-1",
        voice=voice,
        input=req.text,
        speed=req.speed,
    )

    async def stream():
        async for chunk in response.response.aiter_bytes(1024):
            yield chunk

    return StreamingResponse(stream(), media_type="audio/mpeg")


async def _edge_tts(req: TTSRequest) -> StreamingResponse:
    import edge_tts

    communicate = edge_tts.Communicate(req.text, req.voice, rate=_speed_to_rate(req.speed))

    async def stream():
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                yield chunk["data"]

    return StreamingResponse(stream(), media_type="audio/mpeg")


def _speed_to_rate(speed: float) -> str:
    pct = int((speed - 1.0) * 100)
    return f"+{pct}%" if pct >= 0 else f"{pct}%"
