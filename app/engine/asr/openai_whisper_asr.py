import io

from openai import AsyncOpenAI

from app.engine.asr.base import BaseASR


class OpenAIWhisperASR(BaseASR):
    def __init__(self, **kwargs):
        self._client = AsyncOpenAI(api_key=kwargs.get("api_key", ""))
        self._model = kwargs.get("model", "whisper-1")
        self._language = kwargs.get("language", "en")

    async def transcribe(self, audio: bytes) -> str:
        audio_file = io.BytesIO(audio)
        audio_file.name = "audio.webm"
        response = await self._client.audio.transcriptions.create(
            model=self._model,
            file=audio_file,
            language=self._language,
        )
        return response.text
