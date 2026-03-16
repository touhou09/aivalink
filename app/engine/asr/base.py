from abc import ABC, abstractmethod


class BaseASR(ABC):
    @abstractmethod
    async def transcribe(self, audio: bytes) -> str:
        """Transcribe audio bytes to text."""
        ...
