from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
import asyncio
import io

router = APIRouter()


async def generate_edge_tts(text: str, voice: str) -> bytes:
    try:
        import edge_tts

        communicate = edge_tts.Communicate(text, voice)
        audio_data = io.BytesIO()

        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data.write(chunk["data"])

        audio_data.seek(0)
        return audio_data.read()
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="edge-tts package not installed",
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"TTS generation failed: {str(e)}",
        )


# Voice mapping for different languages
VOICE_MAP = {
    "en": "en-US-AriaNeural",
    "ko": "ko-KR-SunHiNeural",
    "ja": "ja-JP-NanamiNeural",
    "zh": "zh-CN-XiaoxiaoNeural",
}


@router.get("")
async def text_to_speech(
    text: str = Query(..., description="Text to synthesize"),
    voice: str = Query(None, description="Voice name"),
    lang: str = Query("en", description="Language code"),
):
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    # Use voice or fallback to language default
    final_voice = voice or VOICE_MAP.get(lang, VOICE_MAP["en"])

    audio_data = await generate_edge_tts(text, final_voice)

    return StreamingResponse(
        io.BytesIO(audio_data),
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": 'attachment; filename="speech.mp3"',
        },
    )


@router.get("/voices")
async def list_voices(lang: str = Query(None, description="Filter by language")):
    try:
        import edge_tts

        voices = await edge_tts.list_voices()

        if lang:
            voices = [v for v in voices if v["Locale"].startswith(lang)]

        return {
            "voices": [
                {
                    "name": v["ShortName"],
                    "locale": v["Locale"],
                    "gender": v["Gender"],
                }
                for v in voices
            ]
        }
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="edge-tts package not installed",
        )
