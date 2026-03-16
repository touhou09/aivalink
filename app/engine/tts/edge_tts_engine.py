import io

import edge_tts

from app.engine.tts.base import BaseTTS


class EdgeTTSEngine(BaseTTS):
    def __init__(self, voice: str = "ko-KR-SunHiNeural", rate: str = "+0%"):
        self.voice = voice
        self.rate = rate

    async def synthesize(self, text: str) -> bytes:
        communicate = edge_tts.Communicate(text, self.voice, rate=self.rate)
        buffer = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buffer.write(chunk["data"])
        return buffer.getvalue()
