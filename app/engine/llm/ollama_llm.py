from app.engine.llm.openai_llm import OpenAILLM


class OllamaLLM(OpenAILLM):
    """Ollama LLM - uses OpenAI-compatible API with local Ollama endpoint."""

    def __init__(self, **kwargs):
        kwargs.setdefault("base_url", "http://localhost:11434/v1")
        kwargs.setdefault("api_key", "ollama")  # Ollama doesn't need a real key
        super().__init__(**kwargs)
