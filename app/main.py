import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.agents import router as agents_router
from app.api.asr_configs import router as asr_configs_router
from app.api.auth import router as auth_router
from app.api.characters import router as characters_router
from app.api.conversations import router as conversations_router
from app.api.files import router as files_router
from app.api.instances import router as instances_router
from app.api.llm_configs import router as llm_configs_router
from app.api.tts_configs import router as tts_configs_router
from app.api.users import router as users_router
from app.config import settings, validate_settings
from app.core.exceptions import AppError, app_error_handler
from app.logging_config import configure_logging
from app.mcp.server import mcp_websocket_endpoint
from app.middleware.rate_limit import limiter
from app.ws.handler import websocket_endpoint

configure_logging(debug=False)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Startup: register engines, validate settings, ensure upload directory
    from app.engine.factory import register_real_engines
    register_real_engines()
    validate_settings(settings)
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    yield
    # Shutdown: cleanup if needed


app = FastAPI(
    title="AivaLink",
    description="AI Virtual Assistant Link Platform",
    version="0.1.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# Exception handler
app.add_exception_handler(AppError, app_error_handler)

# Include routers
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(characters_router)
app.include_router(llm_configs_router)
app.include_router(tts_configs_router)
app.include_router(asr_configs_router)
app.include_router(files_router)
app.include_router(instances_router)
app.include_router(agents_router)
app.include_router(conversations_router)


# WebSocket endpoints
app.add_api_websocket_route("/client-ws/{instance_id}", websocket_endpoint)
app.add_api_websocket_route("/mcp-ws/{instance_id}", mcp_websocket_endpoint)


@app.get("/health")
async def health():
    return {"status": "ok"}
