from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://aivalink:password@localhost:5432/aivalink"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT
    JWT_SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Encryption
    FERNET_KEY: str = ""

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/auth/google/callback"

    # File uploads
    UPLOAD_DIR: str = "./uploads"
    MAX_INSTANCES_PER_USER: int = 1

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    # Base URL
    BASE_URL: str = "http://localhost:8000"

    # Test mode
    TEST_MODE: bool = False


settings = Settings()


def validate_settings(s: Settings) -> None:
    """Validate critical settings on startup."""
    if not s.TEST_MODE:
        if not s.FERNET_KEY:
            raise ValueError("FERNET_KEY must be set in environment variables")
        if not s.JWT_SECRET_KEY:
            raise ValueError("JWT_SECRET_KEY must be set in environment variables")
