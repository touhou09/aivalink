"""Add OAuth accounts table and user OAuth fields

Revision ID: 003_oauth_fields
Revises: 002_aiva_tables
Create Date: 2026-03-08
"""
from alembic import op
import sqlalchemy as sa

revision = "003_oauth_fields"
down_revision = "002_aiva_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "oauth_accounts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("provider_user_id", sa.String(255), nullable=False),
        sa.Column("provider_email", sa.String(255), nullable=True),
        sa.Column("provider_name", sa.String(255), nullable=True),
        sa.Column("provider_avatar_url", sa.String(500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
        ),
        sa.UniqueConstraint("provider", "provider_user_id", name="uq_oauth_provider_user"),
    )
    op.create_index(
        "idx_oauth_accounts_user", "oauth_accounts", ["user_id"]
    )


def downgrade() -> None:
    op.drop_table("oauth_accounts")
