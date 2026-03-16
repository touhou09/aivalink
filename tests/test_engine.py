import struct

import pytest

from app.engine.asr.stub import StubASR
from app.engine.factory import ASRFactory, LLMFactory, TTSFactory
from app.engine.llm.stub import EchoLLM
from app.engine.tts.stub import SilentTTS


@pytest.mark.asyncio
async def test_stub_asr_transcribe():
    asr = StubASR()
    result = await asr.transcribe(b"audio data")
    assert result == "Hello from stub ASR"


@pytest.mark.asyncio
async def test_echo_llm_generate():
    llm = EchoLLM()
    messages = [{"role": "user", "content": "test input"}]
    chars = []
    async for char in llm.generate(messages):
        chars.append(char)
    assert "".join(chars) == "Echo: test input"


@pytest.mark.asyncio
async def test_echo_llm_generate_empty_messages():
    llm = EchoLLM()
    chars = []
    async for char in llm.generate([]):
        chars.append(char)
    assert "".join(chars) == "Echo: "


@pytest.mark.asyncio
async def test_silent_tts_synthesize_returns_bytes():
    tts = SilentTTS()
    audio = await tts.synthesize("hello")
    assert isinstance(audio, bytes)


@pytest.mark.asyncio
async def test_silent_tts_synthesize_valid_wav_header():
    tts = SilentTTS()
    audio = await tts.synthesize("hello")
    assert audio[:4] == b"RIFF"
    assert audio[8:12] == b"WAVE"
    assert audio[12:16] == b"fmt "


@pytest.mark.asyncio
async def test_silent_tts_synthesize_correct_size():
    tts = SilentTTS()
    audio = await tts.synthesize("hello")
    sample_rate = 16000
    data_size = sample_rate * 2  # 1 second, 16-bit mono
    # 44-byte header (RIFF=8 + WAVE=4 + fmt chunk=24 + data header=8) + data
    expected_len = 44 + data_size
    assert len(audio) == expected_len


@pytest.mark.asyncio
async def test_silent_tts_synthesize_data_chunk():
    tts = SilentTTS()
    audio = await tts.synthesize("hello")
    assert audio[36:40] == b"data"
    data_size = struct.unpack_from("<I", audio, 40)[0]
    assert data_size == 16000 * 2
    assert audio[44:] == b"\x00" * data_size


def test_asr_factory_create_stub():
    asr = ASRFactory.create("stub")
    assert isinstance(asr, StubASR)


def test_llm_factory_create_stub():
    llm = LLMFactory.create("stub")
    assert isinstance(llm, EchoLLM)


def test_tts_factory_create_stub():
    tts = TTSFactory.create("stub")
    assert isinstance(tts, SilentTTS)


def test_asr_factory_unknown_raises():
    with pytest.raises(ValueError, match="Unknown ASR engine: unknown"):
        ASRFactory.create("unknown")


def test_llm_factory_unknown_raises():
    with pytest.raises(ValueError, match="Unknown LLM provider: unknown"):
        LLMFactory.create("unknown")


def test_tts_factory_unknown_raises():
    with pytest.raises(ValueError, match="Unknown TTS engine: unknown"):
        TTSFactory.create("unknown")
