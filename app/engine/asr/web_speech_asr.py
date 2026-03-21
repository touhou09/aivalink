from app.engine.asr.base import BaseASR


class WebSpeechASR(BaseASR):
    """Placeholder for browser-based Web Speech API.
    Actual transcription happens in the browser."""

    def __init__(self, **kwargs):
        pass

    async def transcribe(self, audio: bytes) -> str:
        return ""  # Browser handles transcription
