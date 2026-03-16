from collections.abc import AsyncIterator

from app.engine.llm.base import BaseLLM


class EchoLLM(BaseLLM):
    def __init__(self, **kwargs):
        pass

    async def generate(self, messages: list[dict]) -> AsyncIterator[str]:
        last_msg = messages[-1]["content"] if messages else ""
        response = f"Echo: {last_msg}"
        for char in response:
            yield char
