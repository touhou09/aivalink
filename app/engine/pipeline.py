import asyncio
from collections.abc import AsyncIterator
from dataclasses import dataclass, field

from app.engine.asr.base import BaseASR
from app.engine.emotion import analyze_emotion
from app.engine.llm.base import BaseLLM
from app.engine.sentence_splitter import split_sentences
from app.engine.tts.base import BaseTTS


@dataclass
class PipelineMessage:
    type: str
    data: dict


@dataclass
class VTuberPipeline:
    asr: BaseASR
    llm: BaseLLM
    tts: BaseTTS
    character_name: str = ""
    emotion_map: dict = field(default_factory=dict)
    _interrupt: asyncio.Event = field(default_factory=asyncio.Event)

    def __post_init__(self):
        self._interrupt.clear()

    def interrupt(self) -> None:
        self._interrupt.set()

    def reset_interrupt(self) -> None:
        self._interrupt.clear()

    async def process_audio(self, audio: bytes) -> AsyncIterator[PipelineMessage]:
        text = await self.asr.transcribe(audio)
        yield PipelineMessage(type="user-transcript", data={"text": text, "is_final": True})
        async for msg in self.process_text(text):
            yield msg

    async def process_text(self, text: str) -> AsyncIterator[PipelineMessage]:
        self.reset_interrupt()
        messages = [{"role": "user", "content": text}]

        full_text = ""
        buffer = ""

        async for token in self.llm.generate(messages):
            if self._interrupt.is_set():
                yield PipelineMessage(type="interrupted", data={"stopped_at": full_text})
                return

            full_text += token
            buffer += token

            yield PipelineMessage(type="text-chunk", data={"text": token, "is_final": False})

        yield PipelineMessage(type="text-complete", data={"full_text": full_text})

        # Emotion analysis
        emotion = analyze_emotion(full_text)
        emotion_data: dict = {"emotion": emotion}
        if emotion in self.emotion_map:
            em = self.emotion_map[emotion]
            emotion_data.update({
                "motion_group": em.get("motion_group", "Idle"),
                "motion_index": em.get("motion_index", 0),
                "expression": em.get("expression", ""),
            })
        yield PipelineMessage(type="emotion", data=emotion_data)

        # TTS per sentence
        sentences = split_sentences(full_text)
        if not sentences:
            sentences = [full_text]

        for i, sentence in enumerate(sentences):
            if self._interrupt.is_set():
                yield PipelineMessage(type="interrupted", data={"stopped_at": full_text})
                return

            audio_bytes = await self.tts.synthesize(sentence)
            is_final = i == len(sentences) - 1
            yield PipelineMessage(
                type="audio-chunk",
                data={"audio": audio_bytes, "sample_rate": 16000, "is_final": is_final},
            )
