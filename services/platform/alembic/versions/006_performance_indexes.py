"""Add performance indexes for DB optimization

Revision ID: 006_performance_indexes
Revises: 005_energy_packs
Create Date: 2026-03-08
"""
from alembic import op
import sqlalchemy as sa

revision = "006_performance_indexes"
down_revision = "005_energy_packs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ----------------------------------------------------------------
    # HNSW vector index on document_chunks.embedding (pgvector)
    # Uses cosine similarity ops with m=16, ef_construction=64
    # Note: the ORM-level index defined in __table_args__ covers the
    # same column, but this migration makes it explicit and idempotent.
    # ----------------------------------------------------------------
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_document_chunks_embedding_hnsw
        ON document_chunks
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
        """
    )

    # ----------------------------------------------------------------
    # B-tree indexes on frequently queried columns
    # ----------------------------------------------------------------

    # chat_sessions: user_id, persona_id, created_at
    op.create_index(
        "ix_chat_sessions_user_id",
        "chat_sessions",
        ["user_id"],
        if_not_exists=True,
    )
    op.create_index(
        "ix_chat_sessions_persona_id",
        "chat_sessions",
        ["persona_id"],
        if_not_exists=True,
    )
    op.create_index(
        "ix_chat_sessions_created_at",
        "chat_sessions",
        ["created_at"],
        if_not_exists=True,
    )

    # chat_messages: session_id + created_at (pagination)
    op.create_index(
        "ix_chat_messages_session_created",
        "chat_messages",
        ["session_id", "created_at"],
        if_not_exists=True,
    )

    # documents: user_id, persona_id, created_at
    op.create_index(
        "ix_documents_user_id",
        "documents",
        ["user_id"],
        if_not_exists=True,
    )
    op.create_index(
        "ix_documents_persona_id",
        "documents",
        ["persona_id"],
        if_not_exists=True,
    )
    op.create_index(
        "ix_documents_created_at",
        "documents",
        ["created_at"],
        if_not_exists=True,
    )

    # document_chunks: document_id
    op.create_index(
        "ix_document_chunks_document_id",
        "document_chunks",
        ["document_id"],
        if_not_exists=True,
    )

    # personas: owner_id, created_at
    op.create_index(
        "ix_personas_owner_id",
        "personas",
        ["owner_id"],
        if_not_exists=True,
    )
    op.create_index(
        "ix_personas_created_at",
        "personas",
        ["created_at"],
        if_not_exists=True,
    )

    # agents: user_id, created_at
    op.create_index(
        "ix_agents_user_id",
        "agents",
        ["user_id"],
        if_not_exists=True,
    )
    op.create_index(
        "ix_agents_created_at",
        "agents",
        ["created_at"],
        if_not_exists=True,
    )

    # ----------------------------------------------------------------
    # Partial indexes (filter on common WHERE predicates)
    # ----------------------------------------------------------------

    # Active agents only (most queries filter status = 'active')
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_agents_active_user
        ON agents (user_id, created_at)
        WHERE status = 'active'
        """
    )

    # Active chat sessions only
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_chat_sessions_active_user
        ON chat_sessions (user_id, updated_at)
        WHERE is_active = true
        """
    )

    # Unread notifications per user (hot path for notification badge)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_notifications_user_unread_partial
        ON notifications (user_id, created_at DESC)
        WHERE is_read = false AND is_dismissed = false
        """
    )

    # Active (non-canceled) subscriptions
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_subscriptions_active
        ON subscriptions (user_id)
        WHERE status = 'active'
        """
    )


def downgrade() -> None:
    # Partial indexes
    op.execute("DROP INDEX IF EXISTS ix_subscriptions_active")
    op.execute("DROP INDEX IF EXISTS ix_notifications_user_unread_partial")
    op.execute("DROP INDEX IF EXISTS ix_chat_sessions_active_user")
    op.execute("DROP INDEX IF EXISTS ix_agents_active_user")

    # B-tree indexes
    op.drop_index("ix_agents_created_at", table_name="agents", if_exists=True)
    op.drop_index("ix_agents_user_id", table_name="agents", if_exists=True)
    op.drop_index("ix_personas_created_at", table_name="personas", if_exists=True)
    op.drop_index("ix_personas_owner_id", table_name="personas", if_exists=True)
    op.drop_index("ix_document_chunks_document_id", table_name="document_chunks", if_exists=True)
    op.drop_index("ix_documents_created_at", table_name="documents", if_exists=True)
    op.drop_index("ix_documents_persona_id", table_name="documents", if_exists=True)
    op.drop_index("ix_documents_user_id", table_name="documents", if_exists=True)
    op.drop_index("ix_chat_messages_session_created", table_name="chat_messages", if_exists=True)
    op.drop_index("ix_chat_sessions_created_at", table_name="chat_sessions", if_exists=True)
    op.drop_index("ix_chat_sessions_persona_id", table_name="chat_sessions", if_exists=True)
    op.drop_index("ix_chat_sessions_user_id", table_name="chat_sessions", if_exists=True)

    # HNSW vector index
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_embedding_hnsw")
