"""
PII Detection Router
Decision D10: Server-side PII detection (Layer 2)
Uses regex for Korean PII patterns. Audit logging via structured log output.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()
logger = logging.getLogger("ai-service.pii")


@dataclass(frozen=True)
class PiiPattern:
    name: str
    regex: re.Pattern[str]
    replacement: str


PATTERNS: tuple[PiiPattern, ...] = (
    PiiPattern(
        name="phone_kr",
        regex=re.compile(r"(?<!\d)01[016789]-?\d{3,4}-?\d{4}(?!\d)"),
        replacement="[전화번호]",
    ),
    PiiPattern(
        name="email",
        regex=re.compile(r"\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b"),
        replacement="[이메일]",
    ),
    PiiPattern(
        name="rrn",
        regex=re.compile(r"(?<!\d)\d{6}-?[1-4]\d{6}(?!\d)"),
        replacement="[주민번호]",
    ),
    PiiPattern(
        name="card",
        regex=re.compile(r"(?<!\d)\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}(?!\d)"),
        replacement="[카드번호]",
    ),
    PiiPattern(
        name="passport_kr",
        regex=re.compile(r"(?<![A-Z0-9])[MSROD]\d{8}(?![A-Z0-9])"),
        replacement="[여권번호]",
    ),
    PiiPattern(
        name="bank_account_kr",
        regex=re.compile(r"(?<!\d)\d{2,6}-\d{2,6}-\d{2,6}(?!\d)"),
        replacement="[계좌번호]",
    ),
)


class PiiScrubRequest(BaseModel):
    text: str
    language: str = "ko"
    user_id: str | None = None


class PiiScrubResponse(BaseModel):
    scrubbed_text: str
    detections: list[dict[str, Any]]


def _scrub_text(text: str) -> tuple[str, list[dict[str, Any]]]:
    scrubbed = text
    detections: list[dict[str, Any]] = []

    for pattern in PATTERNS:
        def replace_match(match: re.Match[str], p: PiiPattern = pattern) -> str:
            detections.append(
                {
                    "type": p.name,
                    "start": match.start(),
                    "end": match.end(),
                    "replacement": p.replacement,
                }
            )
            return p.replacement

        scrubbed = pattern.regex.sub(replace_match, scrubbed)

    return scrubbed, detections


@router.post("/scrub", response_model=PiiScrubResponse)
async def scrub_pii(req: PiiScrubRequest):
    scrubbed_text, detections = _scrub_text(req.text)
    if detections:
        logger.warning(
            "pii_detected",
            extra={
                "user_id": req.user_id,
                "detection_count": len(detections),
                "types": [d["type"] for d in detections],
            },
        )
    return PiiScrubResponse(scrubbed_text=scrubbed_text, detections=detections)
