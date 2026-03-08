from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)

    # Database
    database_url: str = "postgresql+asyncpg://aivalink:aivalink_secret@localhost:5432/aivalink"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # OAuth
    google_client_id: str = ""
    google_client_secret: str = ""
    kakao_client_id: str = ""
    kakao_client_secret: str = ""
    oauth_redirect_base_url: str = "http://localhost:8000"

    # CORS
    allowed_origins: str = ""  # Comma-separated list; empty = localhost defaults

    # JWT
    jwt_secret: str = "your-super-secret-jwt-key-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 15  # Short-lived access token (15 min)
    jwt_refresh_expire_days: int = 7  # Long-lived refresh token (7 days)

    # VTuber Engine
    vtuber_engine_path: str = "/app/vtuber-engine"
    vtuber_engine_host_path: str = ""  # Host path for Docker volume mounts
    vtuber_configs_path: str = "/app/vtuber-configs"
    vtuber_configs_volume: str = "docker_vtuber_configs"  # Docker volume name
    vtuber_base_port: int = 9001
    vtuber_max_instances: int = 10

    # Docker
    docker_network: str = "aivalink-network"

    # LLM API Keys (Optional)
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    ollama_host: str = "http://host.docker.internal:11434"

    # Stripe (Phase 7 - Monetization)
    stripe_secret_key: str = ""
    stripe_publishable_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_standard_price_id: str = ""  # $9.99/month
    stripe_premium_price_id: str = ""   # $29.99/month


@lru_cache()
def get_settings() -> Settings:
    return Settings()
