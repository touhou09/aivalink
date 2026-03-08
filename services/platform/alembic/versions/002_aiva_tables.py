"""Add Aiva tables (characters, sessions, messages, memories, energy, tasks, billing)

Revision ID: 002_aiva_tables
Revises: 001_initial
Create Date: 2026-03-08
"""
from alembic import op
import sqlalchemy as sa

revision = "002_aiva_tables"
down_revision = "001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- Characters (Aiva) ---
    op.create_table(
        "characters",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("user_id", sa.Text(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("persona_prompt", sa.Text(), nullable=False),
        sa.Column("live2d_model", sa.Text(), nullable=True),
        sa.Column("tts_engine", sa.Text(), server_default="edge-tts"),
        sa.Column("tts_config", sa.Text(), server_default="{}"),
        sa.Column("emotion_map", sa.Text(), server_default="{}"),
        sa.Column("heartbeat", sa.Text(), server_default="{}"),
        sa.Column("agent_config", sa.Text(), server_default="{}"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )
    op.create_index("idx_characters_user", "characters", ["user_id"])

    # --- Gateway Sessions (Aiva) ---
    op.create_table(
        "gateway_sessions",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("user_id", sa.Text(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("character_id", sa.Text(), sa.ForeignKey("characters.id"), nullable=False),
        sa.Column("device_id", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.create_index("idx_gateway_sessions_user", "gateway_sessions", ["user_id"])

    # --- Messages (Aiva) ---
    op.create_table(
        "gateway_messages",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("session_id", sa.Text(), sa.ForeignKey("gateway_sessions.id"), nullable=False),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("character_id", sa.Text(), nullable=False),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("emotion", sa.Text(), nullable=True),
        sa.Column("model_used", sa.Text(), nullable=True),
        sa.Column("token_input", sa.Integer(), server_default="0"),
        sa.Column("token_output", sa.Integer(), server_default="0"),
        sa.Column("energy_cost", sa.Integer(), server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.CheckConstraint("role IN ('user', 'assistant', 'system')", name="ck_gateway_messages_role"),
    )
    op.create_index("idx_gateway_messages_session", "gateway_messages", ["session_id"])
    op.create_index("idx_gateway_messages_created", "gateway_messages", ["created_at"])

    # --- Memories ---
    op.create_table(
        "memories",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("character_id", sa.Text(), nullable=False),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("importance", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("strength", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("privacy_tag", sa.Text(), nullable=False, server_default="'#public'"),
        sa.Column("last_accessed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.CheckConstraint("type IN ('daily_log', 'long_term', 'user_context')", name="ck_memories_type"),
        sa.CheckConstraint("importance BETWEEN 1 AND 10", name="ck_memories_importance"),
    )
    op.create_index("idx_memories_user_char", "memories", ["user_id", "character_id"])
    op.create_index("idx_memories_importance", "memories", ["importance"])

    # --- Energy Transactions ---
    op.create_table(
        "energy_transactions",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("user_id", sa.Text(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("balance_after", sa.Integer(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("reference_id", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )
    op.create_index("idx_energy_user", "energy_transactions", ["user_id"])

    # --- Tasks ---
    op.create_table(
        "agent_tasks",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("session_id", sa.Text(), nullable=True),
        sa.Column("parent_task_id", sa.Text(), sa.ForeignKey("agent_tasks.id"), nullable=True),
        sa.Column("agent_role", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), nullable=False, server_default="'pending'"),
        sa.Column("instruction", sa.Text(), nullable=False),
        sa.Column("result", sa.Text(), nullable=True),
        sa.Column("approval_status", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled')",
            name="ck_agent_tasks_status",
        ),
        sa.CheckConstraint(
            "approval_status IN ('pending', 'approved', 'rejected')",
            name="ck_agent_tasks_approval",
        ),
    )
    op.create_index("idx_agent_tasks_user", "agent_tasks", ["user_id"])
    op.create_index("idx_agent_tasks_status", "agent_tasks", ["status"])

    # --- Audit Logs ---
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("user_id", sa.Text(), nullable=True),
        sa.Column("device_id", sa.Text(), nullable=True),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("target", sa.Text(), nullable=True),
        sa.Column("result", sa.Text(), nullable=True),
        sa.Column("agent_id", sa.Text(), nullable=True),
        sa.Column("ip_address", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )
    op.create_index("idx_audit_user", "audit_logs", ["user_id"])
    op.create_index("idx_audit_action", "audit_logs", ["action"])

    # --- Billing Plans ---
    op.create_table(
        "billing_plans",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("monthly_price", sa.Float(), nullable=False, server_default="0"),
        sa.Column("monthly_quota", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("overage_unit_price", sa.Float(), nullable=False, server_default="0"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )

    # --- Billing Subscriptions ---
    op.create_table(
        "billing_subscriptions",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("user_id", sa.Text(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("plan_id", sa.Text(), sa.ForeignKey("billing_plans.id"), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("current_period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.CheckConstraint(
            "status IN ('trialing', 'active', 'past_due', 'canceled')",
            name="ck_billing_subscriptions_status",
        ),
    )
    op.create_index("idx_billing_subs_user", "billing_subscriptions", ["user_id", "created_at"])

    # --- Billing Usage Records ---
    op.create_table(
        "billing_usage_records",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("user_id", sa.Text(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "subscription_id",
            sa.Text(),
            sa.ForeignKey("billing_subscriptions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("metric", sa.Text(), nullable=False),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column("unit_price", sa.Float(), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("reference_id", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )
    op.create_index("idx_billing_usage_user_created", "billing_usage_records", ["user_id", "created_at"])

    # --- Invoices ---
    op.create_table(
        "invoices",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("user_id", sa.Text(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "subscription_id",
            sa.Text(),
            sa.ForeignKey("billing_subscriptions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("subtotal", sa.Float(), nullable=False, server_default="0"),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("external_payment_id", sa.Text(), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.CheckConstraint(
            "status IN ('pending', 'paid', 'past_due', 'failed')",
            name="ck_invoices_status",
        ),
    )
    op.create_index("idx_invoices_user_created", "invoices", ["user_id", "created_at"])

    # --- Add Aiva fields to existing users table ---
    op.add_column("users", sa.Column("display_name", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("auth_provider", sa.Text(), server_default="'email'"))
    op.add_column("users", sa.Column("avatar_url", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("timezone", sa.Text(), server_default="'Asia/Seoul'"))
    op.add_column("users", sa.Column("trust_level", sa.Text(), server_default="'beginner'"))
    op.add_column("users", sa.Column("energy_balance", sa.Integer(), server_default="50"))
    op.add_column("users", sa.Column("energy_max", sa.Integer(), server_default="50"))
    op.add_column("users", sa.Column("last_energy_reset_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "last_energy_reset_at")
    op.drop_column("users", "energy_max")
    op.drop_column("users", "energy_balance")
    op.drop_column("users", "trust_level")
    op.drop_column("users", "timezone")
    op.drop_column("users", "avatar_url")
    op.drop_column("users", "auth_provider")
    op.drop_column("users", "display_name")

    op.drop_table("invoices")
    op.drop_table("billing_usage_records")
    op.drop_table("billing_subscriptions")
    op.drop_table("billing_plans")
    op.drop_table("audit_logs")
    op.drop_table("agent_tasks")
    op.drop_table("energy_transactions")
    op.drop_table("memories")
    op.drop_table("gateway_messages")
    op.drop_table("gateway_sessions")
    op.drop_table("characters")
