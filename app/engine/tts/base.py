from abc import ABC, abstractmethod


class BaseTTS(ABC):
    @abstractmethod
    async def synthesize(self, text: str) -> bytes:
        """Synthesize text to audio bytes (WAV format)."""
        ...
