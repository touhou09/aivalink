import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.exceptions import AppError
from app.models.llm_config import LLMConfig
from app.models.user import User
from app.schemas.llm_config import LLMConfigCreate, LLMConfigResponse, LLMConfigUpdate
from app.utils.crypto import encrypt_value

router = APIRouter(prefix="/api/llm-configs", tags=["llm-configs"])

SUPPORTED_PROVIDERS = [
    {
        "id": "openai",
        "name": "OpenAI",
        "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
    },
    {
        "id": "anthropic",
        "name": "Anthropic",
        "models": ["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022", "claude-opus-4-20250514"],
    },
    {
        "id": "google",
        "name": "Google",
        "models": ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
    },
    {
        "id": "ollama",
        "name": "Ollama (Local)",
        "models": ["llama3", "mistral", "codellama", "phi3"],
    },
    {
        "id": "custom",
        "name": "Custom (OpenAI-compatible)",
        "models": [],
    },
]


def _to_response(config: LLMConfig) -> LLMConfigResponse:
    return LLMConfigResponse(
        id=config.id,
        name=config.name,
        provider=config.provider,
        model_name=config.model_name,
        has_api_key=config.api_key_enc is not None,
        base_url=config.base_url,
        temperature=config.temperature,
        max_tokens=config.max_tokens,
        oauth_token_id=config.oauth_token_id,
        extra_params=config.extra_params,
        created_at=config.created_at,
        updated_at=config.updated_at,
    )


@router.get("/providers")
async def list_providers():
    return SUPPORTED_PROVIDERS


@router.get("/", response_model=list[LLMConfigResponse])
async def list_llm_configs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LLMConfig).where(LLMConfig.user_id == current_user.id).order_by(LLMConfig.created_at.desc())
    )
    configs = result.scalars().all()
    return [_to_response(c) for c in configs]


@router.post("/", response_model=LLMConfigResponse, status_code=status.HTTP_201_CREATED)
async def create_llm_config(
    body: LLMConfigCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    config = LLMConfig(
        id=uuid.uuid4(),
        user_id=current_user.id,
        name=body.name,
        provider=body.provider,
        model_name=body.model_name,
        api_key_enc=encrypt_value(body.api_key) if body.api_key else None,
        base_url=body.base_url,
        temperature=body.temperature,
        max_tokens=body.max_tokens,
        oauth_token_id=body.oauth_token_id,
        extra_params=body.extra_params,
    )
    db.add(config)
    await db.flush()
    await db.refresh(config)
    return _to_response(config)


@router.get("/{config_id}", response_model=LLMConfigResponse)
async def get_llm_config(
    config_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LLMConfig).where(LLMConfig.id == config_id, LLMConfig.user_id == current_user.id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise AppError("LLM_CONFIG_NOT_FOUND", "LLM config not found", 404)
    return _to_response(config)


@router.put("/{config_id}", response_model=LLMConfigResponse)
async def update_llm_config(
    config_id: uuid.UUID,
    body: LLMConfigUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LLMConfig).where(LLMConfig.id == config_id, LLMConfig.user_id == current_user.id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise AppError("LLM_CONFIG_NOT_FOUND", "LLM config not found", 404)

    update_data = body.model_dump(exclude_unset=True)

    # Handle api_key specially: encrypt before storing
    if "api_key" in update_data:
        api_key = update_data.pop("api_key")
        config.api_key_enc = encrypt_value(api_key) if api_key else None

    for key, value in update_data.items():
        setattr(config, key, value)

    await db.flush()
    await db.refresh(config)
    return _to_response(config)


@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_llm_config(
    config_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LLMConfig).where(LLMConfig.id == config_id, LLMConfig.user_id == current_user.id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise AppError("LLM_CONFIG_NOT_FOUND", "LLM config not found", 404)

    await db.delete(config)
    await db.flush()
    return None
