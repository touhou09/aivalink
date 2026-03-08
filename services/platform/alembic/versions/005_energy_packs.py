"""Add energy_purchases table

Revision ID: 005_energy_packs
Revises: 004_agent_tables
Create Date: 2026-03-08
"""
from alembic import op
import sqlalchemy as sa

revision = "005_energy_packs"
down_revision = "004_agent_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "energy_purchases",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("user_id", sa.Text(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("pack_id", sa.Text(), nullable=False),
        sa.Column("energy_amount", sa.Integer(), nullable=False),
        sa.Column("price", sa.Float(), nullable=False),
        sa.Column("stripe_payment_id", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), nullable=False, server_default="'pending'"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.CheckConstraint(
            "status IN ('pending', 'completed', 'failed', 'refunded')",
            name="ck_energy_purchases_status",
        ),
    )
    op.create_index("idx_energy_purchases_user", "energy_purchases", ["user_id"])
    op.create_index("idx_energy_purchases_status", "energy_purchases", ["status"])
    op.create_index("idx_energy_purchases_stripe", "energy_purchases", ["stripe_payment_id"])


def downgrade() -> None:
    op.drop_index("idx_energy_purchases_stripe", "energy_purchases")
    op.drop_index("idx_energy_purchases_status", "energy_purchases")
    op.drop_index("idx_energy_purchases_user", "energy_purchases")
    op.drop_table("energy_purchases")
