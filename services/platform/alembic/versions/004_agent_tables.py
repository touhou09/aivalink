"""Add agent definitions table

Revision ID: 004_agent_tables
Revises: 003_oauth_fields
Create Date: 2026-03-08
"""
from alembic import op
import sqlalchemy as sa

revision = "004_agent_tables"
down_revision = "003_oauth_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agents",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("user_id", sa.Text(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("agent_type", sa.Text(), nullable=False, server_default="'custom'"),
        sa.Column("config", sa.Text(), server_default="{}"),  # JSON config
        sa.Column("tools", sa.Text(), server_default="[]"),   # JSON array of tool names
        sa.Column("llm_provider", sa.Text(), server_default="'claude'"),
        sa.Column("llm_model", sa.Text(), server_default="'claude-sonnet-4-20250514'"),
        sa.Column("system_prompt", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), nullable=False, server_default="'active'"),
        sa.Column("is_public", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.CheckConstraint(
            "status IN ('active', 'inactive', 'archived')",
            name="ck_agents_status",
        ),
        sa.CheckConstraint(
            "agent_type IN ('custom', 'coder', 'analyst', 'pm', 'review', 'viewer')",
            name="ck_agents_type",
        ),
    )
    op.create_index("idx_agents_user", "agents", ["user_id"])
    op.create_index("idx_agents_status", "agents", ["status"])


def downgrade() -> None:
    op.drop_index("idx_agents_status", "agents")
    op.drop_index("idx_agents_user", "agents")
    op.drop_table("agents")
