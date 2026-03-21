import asyncio
from collections.abc import AsyncIterator
from dataclasses import dataclass, field

import re

from app.engine.asr.base import BaseASR
from app.engine.emotion import analyze_emotion
from app.engine.llm.base import BaseLLM
from app.engine.sentence_splitter import split_sentences
from app.engine.tts.base import BaseTTS

EMOTION_SYSTEM_PROMPT = """Express your emotion by adding ONE tag at the END of your response. Available tags: [happy] [sad] [angry] [surprised] [neutral]
Example: "That's wonderful news! [happy]"
Always include exactly one emotion tag at the very end."""


def extract_emotion_tag(text: str) -> tuple[str, str]:
    """Extract [emotion] tag from text. Returns (clean_text, emotion)."""
    match = re.search(r'\[(happy|sad|angry|surprised|neutral)\]\s*$', text, re.IGNORECASE)
    if match:
        emotion = match.group(1).lower()
        clean = text[:match.start()].rstrip()
        return clean, emotion
    return text, ""


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
        messages = [
            {"role": "system", "content": EMOTION_SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ]

        full_text = ""
        buffer = ""

        async for token in self.llm.generate(messages):
            if self._interrupt.is_set():
                yield PipelineMessage(type="interrupted", data={"stopped_at": full_text})
                return

            full_text += token
            buffer += token

            yield PipelineMessage(type="text-chunk", data={"text": token, "is_final": False})

        # Extract emotion tag from LLM response, fallback to keyword analysis
        clean_text, tag_emotion = extract_emotion_tag(full_text)
        if tag_emotion:
            display_text = clean_text
            emotion = tag_emotion
        else:
            display_text = full_text
            emotion = analyze_emotion(full_text)

        yield PipelineMessage(type="text-complete", data={"full_text": display_text})
        emotion_data: dict = {"emotion": emotion}
        if emotion in self.emotion_map:
            em = self.emotion_map[emotion]
            if isinstance(em, dict):
                emotion_data.update({
                    "motion_group": em.get("motion_group", "Idle"),
                    "motion_index": em.get("motion_index", 0),
                    "expression": em.get("expression", ""),
                })
            elif isinstance(em, str):
                emotion_data["motion_group"] = em
        yield PipelineMessage(type="emotion", data=emotion_data)

        # TTS per sentence (use display_text which has emotion tags removed)
        sentences = split_sentences(display_text)
        # Filter out empty or punctuation-only sentences that crash TTS
        sentences = [s for s in sentences if s.strip() and any(c.isalnum() for c in s)]
        if not sentences:
            sentences = [display_text] if display_text.strip() and any(c.isalnum() for c in display_text) else []

        for i, sentence in enumerate(sentences):
            if self._interrupt.is_set():
                yield PipelineMessage(type="interrupted", data={"stopped_at": display_text})
                return

            try:
                audio_bytes = await self.tts.synthesize(sentence)
            except Exception:
                continue  # skip sentences that fail TTS
            is_final = i == len(sentences) - 1
            yield PipelineMessage(
                type="audio-chunk",
                data={"audio": audio_bytes, "sample_rate": 16000, "is_final": is_final},
            )
