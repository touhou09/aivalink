import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.agents import router as agents_router
from app.api.asr_configs import router as asr_configs_router
from app.api.auth import router as auth_router
from app.api.characters import router as characters_router
from app.api.files import router as files_router
from app.api.instances import router as instances_router
from app.api.llm_configs import router as llm_configs_router
from app.api.tts_configs import router as tts_configs_router
from app.api.users import router as users_router
from app.config import settings
from app.core.exceptions import AppError, app_error_handler
from app.mcp.server import mcp_websocket_endpoint
from app.ws.handler import websocket_endpoint


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Startup: ensure upload directory exists
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    yield
    # Shutdown: cleanup if needed


app = FastAPI(
    title="AivaLink",
    description="AI Virtual Assistant Link Platform",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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


# WebSocket endpoints
app.add_api_websocket_route("/client-ws/{instance_id}", websocket_endpoint)
app.add_api_websocket_route("/mcp-ws/{instance_id}", mcp_websocket_endpoint)


@app.get("/health")
async def health():
    return {"status": "ok"}
