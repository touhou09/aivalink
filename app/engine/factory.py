from app.engine.asr.base import BaseASR
from app.engine.asr.stub import StubASR
from app.engine.llm.base import BaseLLM
from app.engine.llm.stub import EchoLLM
from app.engine.tts.base import BaseTTS
from app.engine.tts.stub import SilentTTS

_ASR_REGISTRY: dict[str, type[BaseASR]] = {
    "stub": StubASR,
}

_LLM_REGISTRY: dict[str, type[BaseLLM]] = {
    "stub": EchoLLM,
}

_TTS_REGISTRY: dict[str, type[BaseTTS]] = {
    "stub": SilentTTS,
}


class ASRFactory:
    @staticmethod
    def create(engine: str, **kwargs) -> BaseASR:
        cls = _ASR_REGISTRY.get(engine)
        if cls is None:
            raise ValueError(f"Unknown ASR engine: {engine}")
        return cls(**kwargs)

    @staticmethod
    def register(engine: str, cls: type[BaseASR]) -> None:
        _ASR_REGISTRY[engine] = cls


class LLMFactory:
    @staticmethod
    def create(provider: str, **kwargs) -> BaseLLM:
        cls = _LLM_REGISTRY.get(provider)
        if cls is None:
            raise ValueError(f"Unknown LLM provider: {provider}")
        return cls(**kwargs)

    @staticmethod
    def register(provider: str, cls: type[BaseLLM]) -> None:
        _LLM_REGISTRY[provider] = cls


class TTSFactory:
    @staticmethod
    def create(engine: str, **kwargs) -> BaseTTS:
        cls = _TTS_REGISTRY.get(engine)
        if cls is None:
            raise ValueError(f"Unknown TTS engine: {engine}")
        return cls(**kwargs)

    @staticmethod
    def register(engine: str, cls: type[BaseTTS]) -> None:
        _TTS_REGISTRY[engine] = cls


def register_real_engines() -> None:
    """Register real engine implementations. Called at app startup."""
    from app.engine.llm.ollama_llm import OllamaLLM
    from app.engine.llm.openai_llm import OpenAILLM
    from app.engine.llm.openrouter_llm import OpenRouterLLM
    from app.engine.tts.edge_tts_engine import EdgeTTSEngine

    _LLM_REGISTRY["openai"] = OpenAILLM
    _LLM_REGISTRY["openrouter"] = OpenRouterLLM
    _LLM_REGISTRY["ollama"] = OllamaLLM
    _TTS_REGISTRY["edge_tts"] = EdgeTTSEngine

    from app.engine.asr.openai_whisper_asr import OpenAIWhisperASR
    from app.engine.asr.web_speech_asr import WebSpeechASR

    _ASR_REGISTRY["openai_whisper"] = OpenAIWhisperASR
    _ASR_REGISTRY["web_speech"] = WebSpeechASR

    try:
        from app.engine.asr.faster_whisper_asr import FasterWhisperASR

        _ASR_REGISTRY["faster_whisper"] = FasterWhisperASR
    except ImportError:
        pass  # faster-whisper not installed (no GPU deps)
