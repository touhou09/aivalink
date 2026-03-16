from app.engine.asr.base import BaseASR


class StubASR(BaseASR):
    def __init__(self, **kwargs):
        pass

    async def transcribe(self, audio: bytes) -> str:
        return "Hello from stub ASR"
