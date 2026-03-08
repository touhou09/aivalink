"""
STT Router — Speech-to-Text via server Whisper
Fallback for clients without WebGPU support (mobile, low-end PCs).

Client-side primary: Whisper WebGPU Worker (handled by frontend)
"""

from __future__ import annotations

import os
import time

import openai
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

router = APIRouter()

MAX_FILE_SIZE = 25 * 1024 * 1024  # 25MB (OpenAI Whisper limit)


class STTResponse(BaseModel):
    text: str
    language: str | None = None
    duration_ms: int = 0


class STTInfoResponse(BaseModel):
    max_file_size_bytes: int
    supported_formats: list[str]
    default_language: str


@router.get("/info", response_model=STTInfoResponse)
async def stt_info():
    return STTInfoResponse(
        max_file_size_bytes=MAX_FILE_SIZE,
        supported_formats=["webm", "mp3", "wav", "m4a", "ogg", "flac"],
        default_language="ko",
    )


@router.post("/transcribe", response_model=STTResponse)
async def transcribe(
    audio: UploadFile = File(...),
    language: str = Form("ko"),
):
    """Transcribe audio file to text using OpenAI Whisper API."""
    content = await audio.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 25MB)")

    if not audio.filename:
        raise HTTPException(status_code=400, detail="Filename required")

    client = openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    start = time.monotonic()
    transcript = await client.audio.transcriptions.create(
        model="whisper-1",
        file=(audio.filename, content),
        language=language,
    )
    duration_ms = int((time.monotonic() - start) * 1000)

    return STTResponse(
        text=transcript.text,
        language=language,
        duration_ms=duration_ms,
    )
