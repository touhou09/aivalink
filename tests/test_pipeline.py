import pytest

from app.engine.asr.stub import StubASR
from app.engine.llm.stub import EchoLLM
from app.engine.pipeline import VTuberPipeline
from app.engine.tts.stub import SilentTTS

pytestmark = pytest.mark.asyncio


class TestPipeline:
    def _make_pipeline(self):
        return VTuberPipeline(
            asr=StubASR(),
            llm=EchoLLM(),
            tts=SilentTTS(),
            character_name="Test",
            emotion_map={
                "neutral": {"motion_group": "Idle", "motion_index": 0, "expression": "f00"},
                "happy": {"motion_group": "TapBody", "motion_index": 0, "expression": "f01"},
            },
        )

    async def test_process_text_yields_messages(self):
        pipeline = self._make_pipeline()
        messages = []
        async for msg in pipeline.process_text("hello"):
            messages.append(msg)

        types = [m.type for m in messages]
        assert "text-chunk" in types
        assert "text-complete" in types
        assert "emotion" in types
        assert "audio-chunk" in types

    async def test_process_text_complete_has_full_text(self):
        pipeline = self._make_pipeline()
        complete_msgs = []
        async for msg in pipeline.process_text("hello"):
            if msg.type == "text-complete":
                complete_msgs.append(msg)

        assert len(complete_msgs) == 1
        assert "Echo: hello" in complete_msgs[0].data["full_text"]

    async def test_process_text_emotion_is_neutral(self):
        pipeline = self._make_pipeline()
        emotions = []
        async for msg in pipeline.process_text("hello"):
            if msg.type == "emotion":
                emotions.append(msg)

        assert len(emotions) == 1
        assert emotions[0].data["emotion"] == "neutral"

    async def test_process_text_audio_chunk_is_bytes(self):
        pipeline = self._make_pipeline()
        audio_chunks = []
        async for msg in pipeline.process_text("hello"):
            if msg.type == "audio-chunk":
                audio_chunks.append(msg)

        assert len(audio_chunks) >= 1
        assert isinstance(audio_chunks[-1].data["audio"], bytes)
        assert audio_chunks[-1].data["is_final"] is True

    async def test_process_audio_includes_transcript(self):
        pipeline = self._make_pipeline()
        messages = []
        async for msg in pipeline.process_audio(b"fake audio"):
            messages.append(msg)

        types = [m.type for m in messages]
        assert "user-transcript" in types
        transcript = next(m for m in messages if m.type == "user-transcript")
        assert transcript.data["text"] == "Hello from stub ASR"

    async def test_interrupt_stops_generation(self):
        pipeline = self._make_pipeline()
        messages = []
        async for msg in pipeline.process_text("hello"):
            messages.append(msg)
            if msg.type == "text-complete":
                pipeline.interrupt()

        types = [m.type for m in messages]
        assert "interrupted" in types
