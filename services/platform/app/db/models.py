from datetime import datetime
from typing import Optional
from uuid import uuid4

from sqlalchemy import Boolean, CheckConstraint, DateTime, Enum, Float, ForeignKey, String, Text, JSON, Integer, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from pgvector.sqlalchemy import Vector
import enum

from .database import Base


class LLMProvider(str, enum.Enum):
    OPENAI = "openai"
    CLAUDE = "claude"
    OLLAMA = "ollama"
    LMSTUDIO = "lmstudio"
    GROQ = "groq"
    GEMINI = "gemini"


class TTSProvider(str, enum.Enum):
    EDGE_TTS = "edge_tts"
    OPENAI_TTS = "openai_tts"
    AZURE_TTS = "azure_tts"
    KOKORO = "kokoro"  # WebGPU client-side


class InstanceStatus(str, enum.Enum):
    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    STOPPING = "stopping"
    ERROR = "error"


class NotificationType(str, enum.Enum):
    PROACTIVE_INSIGHT = "proactive_insight"  # Proactive Agent가 발견한 인사이트
    DOCUMENT_RELATED = "document_related"    # 업로드한 문서와 관련된 새 정보
    SYSTEM = "system"                        # 시스템 알림
    REMINDER = "reminder"                    # 사용자 정의 리마인더


class SubscriptionTier(str, enum.Enum):
    FREE = "free"
    STANDARD = "standard"
    PREMIUM = "premium"


class SubscriptionStatus(str, enum.Enum):
    ACTIVE = "active"
    CANCELED = "canceled"
    PAST_DUE = "past_due"
    TRIALING = "trialing"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Aiva fields
    display_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    auth_provider: Mapped[str] = mapped_column(String(50), default="email")
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    timezone: Mapped[str] = mapped_column(String(50), default="Asia/Seoul")
    trust_level: Mapped[str] = mapped_column(String(20), default="beginner")
    energy_balance: Mapped[int] = mapped_column(Integer, default=50)
    energy_max: Mapped[int] = mapped_column(Integer, default=50)
    last_energy_reset_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Subscription (Phase 7)
    subscription_tier: Mapped[SubscriptionTier] = mapped_column(
        Enum(SubscriptionTier), default=SubscriptionTier.FREE
    )
    stripe_customer_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Relationships
    personas: Mapped[list["Persona"]] = relationship(
        "Persona", back_populates="owner", cascade="all, delete-orphan"
    )
    characters: Mapped[list["Character"]] = relationship(
        "Character", back_populates="owner", cascade="all, delete-orphan"
    )
    documents: Mapped[list["Document"]] = relationship(
        "Document", back_populates="user", cascade="all, delete-orphan"
    )
    subscription: Mapped[Optional["Subscription"]] = relationship(
        "Subscription", back_populates="user", uselist=False
    )
    usage_records: Mapped[list["UsageRecord"]] = relationship(
        "UsageRecord", back_populates="user", cascade="all, delete-orphan"
    )
    oauth_accounts: Mapped[list["OAuthAccount"]] = relationship(
        "OAuthAccount", back_populates="user", cascade="all, delete-orphan"
    )
    agents: Mapped[list["Agent"]] = relationship(
        "Agent", back_populates="owner", cascade="all, delete-orphan"
    )


class Persona(Base):
    __tablename__ = "personas"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    owner_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Character Configuration
    persona_prompt: Mapped[str] = mapped_column(Text)
    character_name: Mapped[str] = mapped_column(String(100))
    live2d_model_name: Mapped[str] = mapped_column(String(100), default="shizuku")

    # LLM Configuration
    llm_provider: Mapped[LLMProvider] = mapped_column(
        Enum(LLMProvider), default=LLMProvider.OLLAMA
    )
    llm_model: Mapped[str] = mapped_column(String(100), default="qwen2.5:latest")
    llm_api_key: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True
    )  # Encrypted

    # TTS Configuration
    tts_provider: Mapped[TTSProvider] = mapped_column(
        Enum(TTSProvider), default=TTSProvider.EDGE_TTS
    )
    tts_voice: Mapped[str] = mapped_column(String(100), default="en-US-AriaNeural")
    tts_language: Mapped[str] = mapped_column(String(10), default="en")

    # Memory Configuration
    use_letta: Mapped[bool] = mapped_column(Boolean, default=False)
    letta_agent_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Metadata
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Extra config (JSON for flexibility)
    extra_config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # Relationships
    owner: Mapped["User"] = relationship("User", back_populates="personas")
    instances: Mapped[list["VTuberInstance"]] = relationship(
        "VTuberInstance", back_populates="persona", cascade="all, delete-orphan"
    )
    chat_sessions: Mapped[list["ChatSession"]] = relationship(
        "ChatSession", back_populates="persona", cascade="all, delete-orphan"
    )
    documents: Mapped[list["Document"]] = relationship(
        "Document", back_populates="persona"
    )


class VTuberInstance(Base):
    __tablename__ = "vtuber_instances"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    persona_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("personas.id", ondelete="CASCADE")
    )

    # Docker Container Info
    container_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    container_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    port: Mapped[Optional[int]] = mapped_column(nullable=True)

    # Status
    status: Mapped[InstanceStatus] = mapped_column(
        Enum(InstanceStatus), default=InstanceStatus.STOPPED
    )
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Config file path
    config_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Timestamps
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    stopped_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    persona: Mapped["Persona"] = relationship("Persona", back_populates="instances")


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    persona_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("personas.id", ondelete="CASCADE")
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE")
    )

    # Session metadata
    title: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Message count for quick access
    message_count: Mapped[int] = mapped_column(default=0)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    persona: Mapped["Persona"] = relationship("Persona", back_populates="chat_sessions")
    messages: Mapped[list["ChatMessage"]] = relationship(
        "ChatMessage", back_populates="session", cascade="all, delete-orphan"
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    session_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("chat_sessions.id", ondelete="CASCADE")
    )

    role: Mapped[str] = mapped_column(String(20))  # user, assistant, system
    content: Mapped[str] = mapped_column(Text)

    # Audio metadata (optional)
    audio_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    audio_duration: Mapped[Optional[float]] = mapped_column(nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    session: Mapped["ChatSession"] = relationship(
        "ChatSession", back_populates="messages"
    )


# ============================================================
# Knowledge Base Models (Phase 5.5 - Knowledge Asset)
# ============================================================

class Document(Base):
    """사용자가 업로드한 문서 (MD 파일)"""
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE")
    )
    # 특정 Persona 전용 문서 (nullable = 전체 공유)
    persona_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False), ForeignKey("personas.id", ondelete="SET NULL"), nullable=True
    )

    filename: Mapped[str] = mapped_column(String(255))
    content: Mapped[str] = mapped_column(Text)  # 원본 MD 텍스트
    content_hash: Mapped[str] = mapped_column(String(64))  # SHA256 해시 (중복 방지)

    # Metadata
    file_size: Mapped[int] = mapped_column(Integer, default=0)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="documents")
    persona: Mapped[Optional["Persona"]] = relationship("Persona", back_populates="documents")
    chunks: Mapped[list["DocumentChunk"]] = relationship(
        "DocumentChunk", back_populates="document", cascade="all, delete-orphan"
    )


class DocumentChunk(Base):
    """문서의 청크 (벡터 임베딩 포함)"""
    __tablename__ = "document_chunks"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    document_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("documents.id", ondelete="CASCADE")
    )

    content: Mapped[str] = mapped_column(Text)  # 청크 텍스트
    embedding: Mapped[list] = mapped_column(Vector(384))  # all-MiniLM-L6-v2 = 384 dims

    chunk_index: Mapped[int] = mapped_column(Integer)  # 문서 내 청크 순서
    # Chunk metadata: 헤딩, 시작/끝 위치 등
    chunk_metadata: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    document: Mapped["Document"] = relationship("Document", back_populates="chunks")

    # Index for vector similarity search (HNSW for better performance)
    __table_args__ = (
        Index(
            "ix_document_chunks_embedding_hnsw",
            embedding,
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )


# ============================================================
# Notification Models (Phase 6 - Proactive Agent)
# ============================================================

class Notification(Base):
    """선제적 알림 (Proactive Agent가 생성)"""
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE")
    )
    # 관련 Persona (nullable)
    persona_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False), ForeignKey("personas.id", ondelete="SET NULL"), nullable=True
    )
    # 관련 Document (nullable)
    document_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False), ForeignKey("documents.id", ondelete="SET NULL"), nullable=True
    )

    # Notification content
    notification_type: Mapped[NotificationType] = mapped_column(
        Enum(NotificationType), default=NotificationType.PROACTIVE_INSIGHT
    )
    title: Mapped[str] = mapped_column(String(200))
    content: Mapped[str] = mapped_column(Text)

    # Source information (what triggered this notification)
    source_query: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # 검색 쿼리
    source_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)  # 외부 소스 URL

    # Status
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    is_dismissed: Mapped[bool] = mapped_column(Boolean, default=False)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Indexes for efficient queries
    __table_args__ = (
        Index("ix_notifications_user_unread", "user_id", "is_read"),
        Index("ix_notifications_created_at", "created_at"),
    )


# ============================================================
# Subscription Models (Phase 7 - Monetization)
# ============================================================

class Subscription(Base):
    """사용자 구독 정보 (Stripe 연동)"""
    __tablename__ = "subscriptions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )

    # Stripe identifiers
    stripe_subscription_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    stripe_price_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Subscription details
    tier: Mapped[SubscriptionTier] = mapped_column(
        Enum(SubscriptionTier), default=SubscriptionTier.FREE
    )
    status: Mapped[SubscriptionStatus] = mapped_column(
        Enum(SubscriptionStatus), default=SubscriptionStatus.ACTIVE
    )

    # Billing period
    current_period_start: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    current_period_end: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, default=False)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="subscription")


class UsageRecord(Base):
    """일별 사용량 기록"""
    __tablename__ = "usage_records"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE")
    )

    # Usage date (YYYY-MM-DD)
    usage_date: Mapped[datetime] = mapped_column(DateTime)

    # Counters
    message_count: Mapped[int] = mapped_column(Integer, default=0)
    document_count: Mapped[int] = mapped_column(Integer, default=0)
    persona_count: Mapped[int] = mapped_column(Integer, default=0)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="usage_records")

    # Unique constraint: one record per user per day
    __table_args__ = (
        Index("ix_usage_records_user_date", "user_id", "usage_date", unique=True),
    )


# ============================================================
# OAuth Models
# ============================================================

class OAuthAccount(Base):
    """OAuth provider account linked to a user"""
    __tablename__ = "oauth_accounts"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE")
    )
    provider: Mapped[str] = mapped_column(String(50))
    provider_user_id: Mapped[str] = mapped_column(String(255))
    provider_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    provider_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    provider_avatar_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="oauth_accounts")

    __table_args__ = (
        Index("uq_oauth_provider_user", "provider", "provider_user_id", unique=True),
    )


# ============================================================
# Agent Models (Task 2.8 - Agent CRUD)
# ============================================================

class AgentStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    ARCHIVED = "archived"


class AgentType(str, enum.Enum):
    CUSTOM = "custom"
    CODER = "coder"
    ANALYST = "analyst"
    PM = "pm"
    REVIEW = "review"
    VIEWER = "viewer"


class Agent(Base):
    """User-defined AI agent"""
    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    agent_type: Mapped[AgentType] = mapped_column(Enum(AgentType), default=AgentType.CUSTOM)
    config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    tools: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    llm_provider: Mapped[str] = mapped_column(String(50), default="claude")
    llm_model: Mapped[str] = mapped_column(String(100), default="claude-sonnet-4-20250514")
    system_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[AgentStatus] = mapped_column(Enum(AgentStatus), default=AgentStatus.ACTIVE)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    owner: Mapped["User"] = relationship("User", back_populates="agents")


# ============================================================
# Character Models (Task 3b.2 - Live2D Emotion Mapping)
# ============================================================

class Character(Base):
    """AI Character with Live2D and emotion configuration"""
    __tablename__ = "characters"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(100))
    persona_prompt: Mapped[str] = mapped_column(Text)
    live2d_model: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    tts_engine: Mapped[str] = mapped_column(String(50), default="edge-tts")
    tts_config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    emotion_map: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    heartbeat: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    agent_config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    owner: Mapped["User"] = relationship("User", back_populates="characters")
