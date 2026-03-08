"""
Chat Router — LLM inference for character conversation
Moved from Gateway's direct LLM calls to centralized ai-service.

Supports multiple providers (Anthropic, OpenAI) with failover.
"""

from __future__ import annotations

import os
import time
from enum import Enum

import anthropic
import openai
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class Provider(str, Enum):
    claude = "claude"
    openai = "openai"


class Tier(str, Enum):
    lite = "lite"
    standard = "standard"
    premium = "premium"


CLAUDE_TIER_MODELS: dict[str, str] = {
    "lite": "claude-haiku-4-5-20251001",
    "standard": "claude-sonnet-4-20250514",
    "premium": "claude-opus-4-20250514",
}

OPENAI_TIER_MODELS: dict[str, str] = {
    "lite": "gpt-4o-mini",
    "standard": "gpt-4o",
    "premium": "gpt-4o",
}

CLAUDE_COST_PER_MILLION: dict[str, dict[str, float]] = {
    "claude-haiku-4-5-20251001": {"input": 0.8, "output": 4.0},
    "claude-sonnet-4-20250514": {"input": 3.0, "output": 15.0},
    "claude-opus-4-20250514": {"input": 15.0, "output": 75.0},
}

OPENAI_COST_PER_MILLION: dict[str, dict[str, float]] = {
    "gpt-4o-mini": {"input": 0.15, "output": 0.6},
    "gpt-4o": {"input": 2.5, "output": 10.0},
}


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    provider: Provider = Provider.claude
    tier: Tier = Tier.standard
    persona_prompt: str | None = None
    max_tokens: int = 4096


class TokenUsage(BaseModel):
    input: int
    output: int


class ChatResponse(BaseModel):
    content: str
    model: str
    provider: str
    token_usage: TokenUsage
    cost: float
    latency_ms: int
    emotion: str = "neutral"


def _build_claude_messages(
    messages: list[ChatMessage], persona_prompt: str | None
) -> tuple[str, list[dict]]:
    system = ""
    api_messages = []
    for msg in messages:
        if msg.role == "system":
            system = msg.content
        else:
            api_messages.append({"role": msg.role, "content": msg.content})
    if persona_prompt and system:
        system = f"{persona_prompt}\n\n{system}"
    elif persona_prompt:
        system = persona_prompt
    return system, api_messages


def _build_openai_messages(
    messages: list[ChatMessage], persona_prompt: str | None
) -> list[dict]:
    api_messages = []
    for msg in messages:
        api_messages.append({"role": msg.role, "content": msg.content})
    if persona_prompt:
        if api_messages and api_messages[0]["role"] == "system":
            api_messages[0]["content"] = f"{persona_prompt}\n\n{api_messages[0]['content']}"
        else:
            api_messages.insert(0, {"role": "system", "content": persona_prompt})
    return api_messages


async def _call_claude(req: ChatRequest) -> ChatResponse:
    client = anthropic.AsyncAnthropic(
        api_key=os.getenv("ANTHROPIC_API_KEY"),
    )
    model = CLAUDE_TIER_MODELS.get(req.tier.value, CLAUDE_TIER_MODELS["standard"])
    system, api_messages = _build_claude_messages(req.messages, req.persona_prompt)

    start = time.monotonic()
    response = await client.messages.create(
        model=model,
        max_tokens=req.max_tokens,
        system=system if system else anthropic.NOT_GIVEN,
        messages=api_messages,
    )
    latency_ms = int((time.monotonic() - start) * 1000)

    content = "".join(
        block.text for block in response.content if block.type == "text"
    )
    rate = CLAUDE_COST_PER_MILLION.get(model, CLAUDE_COST_PER_MILLION["claude-sonnet-4-20250514"])
    cost = (
        response.usage.input_tokens * rate["input"]
        + response.usage.output_tokens * rate["output"]
    ) / 1_000_000

    return ChatResponse(
        content=content,
        model=response.model,
        provider="claude",
        token_usage=TokenUsage(
            input=response.usage.input_tokens,
            output=response.usage.output_tokens,
        ),
        cost=cost,
        latency_ms=latency_ms,
    )


async def _call_openai(req: ChatRequest) -> ChatResponse:
    client = openai.AsyncOpenAI(
        api_key=os.getenv("OPENAI_API_KEY"),
    )
    model = OPENAI_TIER_MODELS.get(req.tier.value, OPENAI_TIER_MODELS["standard"])
    api_messages = _build_openai_messages(req.messages, req.persona_prompt)

    start = time.monotonic()
    response = await client.chat.completions.create(
        model=model,
        max_tokens=req.max_tokens,
        messages=api_messages,
    )
    latency_ms = int((time.monotonic() - start) * 1000)

    choice = response.choices[0] if response.choices else None
    input_tokens = response.usage.prompt_tokens if response.usage else 0
    output_tokens = response.usage.completion_tokens if response.usage else 0
    rate = OPENAI_COST_PER_MILLION.get(model, OPENAI_COST_PER_MILLION["gpt-4o"])
    cost = (input_tokens * rate["input"] + output_tokens * rate["output"]) / 1_000_000

    return ChatResponse(
        content=choice.message.content if choice and choice.message else "",
        model=response.model,
        provider="openai",
        token_usage=TokenUsage(input=input_tokens, output=output_tokens),
        cost=cost,
        latency_ms=latency_ms,
    )


PROVIDER_FNS = {
    Provider.claude: _call_claude,
    Provider.openai: _call_openai,
}

FAILOVER_ORDER = [Provider.claude, Provider.openai]


@router.post("/completions", response_model=ChatResponse)
async def chat_completions(req: ChatRequest):
    """Call LLM with automatic failover."""
    primary = req.provider
    others = [p for p in FAILOVER_ORDER if p != primary]
    order = [primary] + others

    last_error: Exception | None = None
    for provider in order:
        try:
            req_copy = req.model_copy(update={"provider": provider})
            return await PROVIDER_FNS[provider](req_copy)
        except Exception as e:
            last_error = e
            continue

    raise HTTPException(status_code=502, detail=f"All providers failed: {last_error}")
