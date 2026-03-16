from collections.abc import AsyncIterator

from openai import AsyncOpenAI

from app.engine.llm.base import BaseLLM


class OpenAILLM(BaseLLM):
    def __init__(self, api_key: str, model: str = "gpt-4o", base_url: str | None = None, temperature: float = 0.7, max_tokens: int = 2048):
        self.client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens

    async def generate(self, messages: list[dict]) -> AsyncIterator[str]:
        stream = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=self.temperature,
            max_tokens=self.max_tokens,
            stream=True,
        )
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
