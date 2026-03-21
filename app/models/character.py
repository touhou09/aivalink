import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Character(Base):
    __tablename__ = "characters"
    __table_args__ = (Index("ix_characters_user_id", "user_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    persona_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    live2d_model_id: Mapped[str] = mapped_column(String(500), default="haru", nullable=False)
    emotion_map: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    llm_config_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("llm_configs.id", ondelete="SET NULL"), nullable=True
    )
    tts_config_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tts_configs.id", ondelete="SET NULL"), nullable=True
    )
    asr_config_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("asr_configs.id", ondelete="SET NULL"), nullable=True
    )
    language: Mapped[str] = mapped_column(String(10), default="ko", nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
