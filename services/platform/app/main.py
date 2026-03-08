from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db.database import init_db
from app.db.rls import RLSMiddleware
from app.api.routes import auth, oauth, personas, instances, tts, vtuber_proxy, documents, notifications, billing, agents, memories, characters, energy
from app.services.scheduler import scheduler_service

settings = get_settings()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()

    # Start background scheduler (Proactive Agent)
    try:
        scheduler_service.start()
        logger.info("Background scheduler started")
    except Exception as e:
        logger.error(f"Failed to start scheduler: {e}")

    yield

    # Shutdown
    scheduler_service.stop()
    logger.info("Background scheduler stopped")


app = FastAPI(
    title="AivaLink Platform API",
    description="AivaLink Cloud AI Character Platform",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — origins driven by ALLOWED_ORIGINS env var (comma-separated).
# Falls back to localhost only; never wildcards in production.
_raw_origins = settings.allowed_origins
allow_origins: list[str] = (
    [o.strip() for o in _raw_origins.split(",") if o.strip()]
    if _raw_origins
    else ["http://localhost:3000", "http://localhost:3001"]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)

# RLS middleware — initialises request.state.user_id / is_admin defaults.
# Auth dependencies populate these fields before get_rls_db acquires a session.
app.add_middleware(RLSMiddleware)

# Routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(oauth.router, prefix="/api/v1/oauth", tags=["oauth"])
app.include_router(personas.router, prefix="/api/v1/personas", tags=["personas"])
app.include_router(instances.router, prefix="/api/v1/instances", tags=["instances"])
app.include_router(tts.router, prefix="/api/v1/tts", tags=["tts"])
app.include_router(documents.router, prefix="/api/v1/documents", tags=["documents"])
app.include_router(notifications.router, prefix="/api/v1/notifications", tags=["notifications"])
app.include_router(billing.router, prefix="/api/v1/billing", tags=["billing"])
app.include_router(agents.router, prefix="/api/v1/agents", tags=["agents"])
app.include_router(characters.router, prefix="/api/v1/characters", tags=["characters"])
app.include_router(memories.router, prefix="/api/v1/memories", tags=["memories"])
app.include_router(energy.router, prefix="/api/v1/energy", tags=["energy"])
app.include_router(vtuber_proxy.router, prefix="/vtuber", tags=["vtuber"])


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.get("/")
async def root():
    return {
        "name": "AivaLink Platform API",
        "version": "0.1.0",
        "docs": "/docs",
    }
