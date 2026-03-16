import asyncio
import tempfile

from app.engine.asr.base import BaseASR


class FasterWhisperASR(BaseASR):
    def __init__(self, model_size: str = "base", language: str = "ko", device: str = "auto"):
        self.model_size = model_size
        self.language = language
        self.device = device
        self._model = None

    def _get_model(self):
        if self._model is None:
            from faster_whisper import WhisperModel

            compute_type = "float16" if self.device == "cuda" else "int8"
            self._model = WhisperModel(self.model_size, device=self.device, compute_type=compute_type)
        return self._model

    async def transcribe(self, audio: bytes) -> str:
        def _transcribe():
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=True) as f:
                f.write(audio)
                f.flush()
                model = self._get_model()
                segments, _ = model.transcribe(f.name, language=self.language if self.language != "auto" else None)
                return " ".join(segment.text for segment in segments).strip()

        return await asyncio.get_event_loop().run_in_executor(None, _transcribe)
