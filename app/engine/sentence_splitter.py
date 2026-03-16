import re


def split_sentences(text: str) -> list[str]:
    """Split text into sentences for TTS processing.

    Handles Korean, English, and Japanese sentence boundaries.
    Splits on: . ! ? 。 ！ ？ and newlines
    """
    if not text or not text.strip():
        return []

    # Split on sentence-ending punctuation followed by whitespace or end of string
    # Also split on newlines
    parts = re.split(r"(?<=[.!?。！？])\s+|\n+", text.strip())

    # Filter empty strings and strip whitespace
    sentences = [s.strip() for s in parts if s.strip()]
    return sentences
