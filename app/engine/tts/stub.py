import struct

from app.engine.tts.base import BaseTTS


class SilentTTS(BaseTTS):
    def __init__(self, **kwargs):
        pass

    async def synthesize(self, text: str) -> bytes:
        sample_rate = 16000
        num_samples = sample_rate  # 1 second
        data_size = num_samples * 2  # 16-bit = 2 bytes per sample
        header = struct.pack(
            "<4sI4s4sIHHIIHH4sI",
            b"RIFF",
            36 + data_size,
            b"WAVE",
            b"fmt ",
            16,
            1,
            1,
            sample_rate,
            sample_rate * 2,
            2,
            16,
            b"data",
            data_size,
        )
        return header + b"\x00" * data_size
