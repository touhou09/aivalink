from abc import ABC, abstractmethod
from collections.abc import AsyncIterator


class BaseLLM(ABC):
    @abstractmethod
    async def generate(self, messages: list[dict]) -> AsyncIterator[str]:
        """Generate streaming text response from message history."""
        ...
