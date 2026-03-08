"""
Out-of-Character (OOC) Detection Router
Detects when user messages break character interaction boundaries
"""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class OocDetectRequest(BaseModel):
    message: str
    character_id: str
    conversation_context: list[str] | None = None


class OocDetectResponse(BaseModel):
    is_ooc: bool
    confidence: float
    category: str | None = None  # e.g., "jailbreak", "meta", "technical"


@router.post("/detect", response_model=OocDetectResponse)
async def detect_ooc(req: OocDetectRequest):
    # TODO: OOC detection logic
    # Phase 1 S2: Basic keyword + pattern matching
    # Phase 1 S4: ML-enhanced detection
    return OocDetectResponse(is_ooc=False, confidence=0.0)
