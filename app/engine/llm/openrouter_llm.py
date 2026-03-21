from openai import AsyncOpenAI

from app.engine.llm.openai_llm import OpenAILLM


class OpenRouterLLM(OpenAILLM):
    """OpenRouter LLM - uses OpenAI-compatible API with OpenRouter endpoint."""

    def __init__(self, **kwargs):
        kwargs["base_url"] = "https://openrouter.ai/api/v1"
        super().__init__(**kwargs)
        self.client = AsyncOpenAI(
            api_key=kwargs.get("api_key", ""),
            base_url="https://openrouter.ai/api/v1",
            default_headers={
                "HTTP-Referer": "https://aivalink.app",
                "X-Title": "AivaLink",
            },
        )
