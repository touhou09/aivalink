"""Initial platform tables (users, personas, vtuber_instances, chat_sessions, chat_messages,
documents, document_chunks, notifications, subscriptions, usage_records)

Revision ID: 001_initial
Revises:
Create Date: 2026-03-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("username", sa.String(100), nullable=False, unique=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.Column(
            "subscription_tier",
            sa.Enum("free", "standard", "premium", name="subscriptiontier"),
            nullable=False,
            server_default="free",
        ),
        sa.Column("stripe_customer_id", sa.String(100), nullable=True),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    op.create_table(
        "personas",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("owner_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("avatar_url", sa.String(500), nullable=True),
        sa.Column("persona_prompt", sa.Text(), nullable=False),
        sa.Column("character_name", sa.String(100), nullable=False),
        sa.Column("live2d_model_name", sa.String(100), nullable=False, server_default="shizuku"),
        sa.Column(
            "llm_provider",
            sa.Enum("openai", "claude", "ollama", "lmstudio", "groq", "gemini", name="llmprovider"),
            nullable=False,
            server_default="ollama",
        ),
        sa.Column("llm_model", sa.String(100), nullable=False, server_default="qwen2.5:latest"),
        sa.Column("llm_api_key", sa.String(500), nullable=True),
        sa.Column(
            "tts_provider",
            sa.Enum("edge_tts", "openai_tts", "azure_tts", "kokoro", name="ttsprovider"),
            nullable=False,
            server_default="edge_tts",
        ),
        sa.Column("tts_voice", sa.String(100), nullable=False, server_default="en-US-AriaNeural"),
        sa.Column("tts_language", sa.String(10), nullable=False, server_default="en"),
        sa.Column("use_letta", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("letta_agent_id", sa.String(100), nullable=True),
        sa.Column("is_public", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("extra_config", postgresql.JSON(), nullable=True),
    )

    op.create_table(
        "vtuber_instances",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("persona_id", sa.String(36), sa.ForeignKey("personas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("container_id", sa.String(100), nullable=True),
        sa.Column("container_name", sa.String(100), nullable=True),
        sa.Column("port", sa.Integer(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("stopped", "starting", "running", "stopping", "error", name="instancestatus"),
            nullable=False,
            server_default="stopped",
        ),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("config_path", sa.String(500), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("stopped_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )

    op.create_table(
        "chat_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("persona_id", sa.String(36), sa.ForeignKey("personas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(200), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("message_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )

    op.create_table(
        "chat_messages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("session_id", sa.String(36), sa.ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("audio_url", sa.String(500), nullable=True),
        sa.Column("audio_duration", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )

    op.create_table(
        "documents",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("persona_id", sa.String(36), sa.ForeignKey("personas.id", ondelete="SET NULL"), nullable=True),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("chunk_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )

    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "document_chunks",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("document_id", sa.String(36), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", sa.Text(), nullable=False),  # vector(384) handled by pgvector
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("chunk_metadata", postgresql.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )

    op.create_table(
        "notifications",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("persona_id", sa.String(36), sa.ForeignKey("personas.id", ondelete="SET NULL"), nullable=True),
        sa.Column("document_id", sa.String(36), sa.ForeignKey("documents.id", ondelete="SET NULL"), nullable=True),
        sa.Column(
            "notification_type",
            sa.Enum(
                "proactive_insight", "document_related", "system", "reminder",
                name="notificationtype",
            ),
            nullable=False,
            server_default="proactive_insight",
        ),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("source_query", sa.Text(), nullable=True),
        sa.Column("source_url", sa.String(500), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_dismissed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("read_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_notifications_user_unread", "notifications", ["user_id", "is_read"])
    op.create_index("ix_notifications_created_at", "notifications", ["created_at"])

    op.create_table(
        "subscriptions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("stripe_subscription_id", sa.String(100), nullable=True),
        sa.Column("stripe_price_id", sa.String(100), nullable=True),
        sa.Column(
            "tier",
            sa.Enum("free", "standard", "premium", name="subscriptiontier"),
            nullable=False,
            server_default="free",
        ),
        sa.Column(
            "status",
            sa.Enum("active", "canceled", "past_due", "trialing", name="subscriptionstatus"),
            nullable=False,
            server_default="active",
        ),
        sa.Column("current_period_start", sa.DateTime(), nullable=True),
        sa.Column("current_period_end", sa.DateTime(), nullable=True),
        sa.Column("cancel_at_period_end", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )

    op.create_table(
        "usage_records",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("usage_date", sa.DateTime(), nullable=False),
        sa.Column("message_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("document_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("persona_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_usage_records_user_date", "usage_records", ["user_id", "usage_date"], unique=True)


def downgrade() -> None:
    op.drop_table("usage_records")
    op.drop_table("subscriptions")
    op.drop_table("notifications")
    op.drop_table("document_chunks")
    op.drop_table("documents")
    op.drop_table("chat_messages")
    op.drop_table("chat_sessions")
    op.drop_table("vtuber_instances")
    op.drop_table("personas")
    op.drop_table("users")
    op.execute("DROP TYPE IF EXISTS subscriptionstatus")
    op.execute("DROP TYPE IF EXISTS subscriptiontier")
    op.execute("DROP TYPE IF EXISTS notificationtype")
    op.execute("DROP TYPE IF EXISTS instancestatus")
    op.execute("DROP TYPE IF EXISTS ttsprovider")
    op.execute("DROP TYPE IF EXISTS llmprovider")
