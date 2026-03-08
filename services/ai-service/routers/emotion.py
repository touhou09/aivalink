"""
Emotion Classification Router
Analyzes text to determine character emotion state
"""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

VALID_EMOTIONS = [
    "happy", "sad", "angry", "surprised",
    "neutral", "thinking", "embarrassed",
    "excited", "tired",
]


class EmotionClassifyRequest(BaseModel):
    text: str
    character_id: str
    context: str | None = None


class EmotionClassifyResponse(BaseModel):
    emotion: str
    confidence: float


def _keyword_classify(text: str) -> str:
    t = text.lower()

    if any(k in t for k in ["피곤", "졸려", "지쳤", "tired", "sleepy", "exhaust"]):
        return "tired"
    if any(k in t for k in ["신나", "흥분", "excited", "let's go", "가자"]):
        return "excited"
    if any(k in t for k in ["부끄", "민망", "embarrass", "수줍"]):
        return "embarrassed"
    if any(k in t for k in ["생각", "고민", "why", "how", "분석", "thinking"]):
        return "thinking"
    if any(k in t for k in ["놀라", "깜짝", "헉", "surpris", "와?"]):
        return "surprised"
    if any(k in t for k in ["화나", "짜증", "angry", "분노", "열받"]):
        return "angry"
    if any(k in t for k in ["슬퍼", "우울", "sad", "눈물", "속상"]):
        return "sad"
    if any(k in t for k in ["좋아", "행복", "기뻐", "happy", "great", "최고"]):
        return "happy"
    return "neutral"


@router.post("/classify", response_model=EmotionClassifyResponse)
async def classify_emotion(req: EmotionClassifyRequest):
    emotion = _keyword_classify(req.text)
    return EmotionClassifyResponse(emotion=emotion, confidence=0.7 if emotion != "neutral" else 0.5)
