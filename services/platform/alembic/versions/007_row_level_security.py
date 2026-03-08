"""Enable Row-Level Security for multi-tenant isolation

Revision ID: 007_row_level_security
Revises: 005_energy_packs
Create Date: 2026-03-08
"""
from alembic import op

revision = "007_row_level_security"
down_revision = "005_energy_packs"
branch_labels = None
depends_on = None

# Tables that have a direct user_id column
_USER_ID_TABLES = [
    "chat_sessions",
    "documents",
    "agents",
    "characters",
    "energy_purchases",
    "notifications",
    "usage_records",
    "subscriptions",
]

# personas uses owner_id instead of user_id
_OWNER_ID_TABLES = [
    "personas",
]


def upgrade() -> None:
    conn = op.get_bind()

    # ------------------------------------------------------------------ #
    # 1. Enable RLS on every target table                                  #
    # ------------------------------------------------------------------ #
    for table in _USER_ID_TABLES + _OWNER_ID_TABLES:
        conn.execute(
            op.inline_literal(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")
        )
        # FORCE RLS applies the policy even to the table owner
        conn.execute(
            op.inline_literal(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY;")
        )

    # ------------------------------------------------------------------ #
    # 2. User isolation policies (user_id column)                          #
    # ------------------------------------------------------------------ #
    for table in _USER_ID_TABLES:
        # SELECT
        conn.execute(op.inline_literal(
            f"CREATE POLICY {table}_user_select ON {table} "
            f"FOR SELECT "
            f"USING (user_id = current_setting('app.current_user_id', TRUE));"
        ))
        # INSERT
        conn.execute(op.inline_literal(
            f"CREATE POLICY {table}_user_insert ON {table} "
            f"FOR INSERT "
            f"WITH CHECK (user_id = current_setting('app.current_user_id', TRUE));"
        ))
        # UPDATE
        conn.execute(op.inline_literal(
            f"CREATE POLICY {table}_user_update ON {table} "
            f"FOR UPDATE "
            f"USING (user_id = current_setting('app.current_user_id', TRUE)) "
            f"WITH CHECK (user_id = current_setting('app.current_user_id', TRUE));"
        ))
        # DELETE
        conn.execute(op.inline_literal(
            f"CREATE POLICY {table}_user_delete ON {table} "
            f"FOR DELETE "
            f"USING (user_id = current_setting('app.current_user_id', TRUE));"
        ))

    # ------------------------------------------------------------------ #
    # 3. personas uses owner_id                                            #
    # ------------------------------------------------------------------ #
    for table in _OWNER_ID_TABLES:
        conn.execute(op.inline_literal(
            f"CREATE POLICY {table}_user_select ON {table} "
            f"FOR SELECT "
            f"USING (owner_id = current_setting('app.current_user_id', TRUE) OR is_public = TRUE);"
        ))
        conn.execute(op.inline_literal(
            f"CREATE POLICY {table}_user_insert ON {table} "
            f"FOR INSERT "
            f"WITH CHECK (owner_id = current_setting('app.current_user_id', TRUE));"
        ))
        conn.execute(op.inline_literal(
            f"CREATE POLICY {table}_user_update ON {table} "
            f"FOR UPDATE "
            f"USING (owner_id = current_setting('app.current_user_id', TRUE)) "
            f"WITH CHECK (owner_id = current_setting('app.current_user_id', TRUE));"
        ))
        conn.execute(op.inline_literal(
            f"CREATE POLICY {table}_user_delete ON {table} "
            f"FOR DELETE "
            f"USING (owner_id = current_setting('app.current_user_id', TRUE));"
        ))

    # ------------------------------------------------------------------ #
    # 4. chat_messages: no direct user_id; isolate via chat_sessions join  #
    # ------------------------------------------------------------------ #
    conn.execute(op.inline_literal(
        "ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;"
    ))
    conn.execute(op.inline_literal(
        "ALTER TABLE chat_messages FORCE ROW LEVEL SECURITY;"
    ))
    conn.execute(op.inline_literal(
        "CREATE POLICY chat_messages_user_select ON chat_messages "
        "FOR SELECT "
        "USING (EXISTS ("
        "  SELECT 1 FROM chat_sessions s "
        "  WHERE s.id = chat_messages.session_id "
        "  AND s.user_id = current_setting('app.current_user_id', TRUE)"
        "));"
    ))
    conn.execute(op.inline_literal(
        "CREATE POLICY chat_messages_user_insert ON chat_messages "
        "FOR INSERT "
        "WITH CHECK (EXISTS ("
        "  SELECT 1 FROM chat_sessions s "
        "  WHERE s.id = chat_messages.session_id "
        "  AND s.user_id = current_setting('app.current_user_id', TRUE)"
        "));"
    ))
    conn.execute(op.inline_literal(
        "CREATE POLICY chat_messages_user_update ON chat_messages "
        "FOR UPDATE "
        "USING (EXISTS ("
        "  SELECT 1 FROM chat_sessions s "
        "  WHERE s.id = chat_messages.session_id "
        "  AND s.user_id = current_setting('app.current_user_id', TRUE)"
        ")) "
        "WITH CHECK (EXISTS ("
        "  SELECT 1 FROM chat_sessions s "
        "  WHERE s.id = chat_messages.session_id "
        "  AND s.user_id = current_setting('app.current_user_id', TRUE)"
        "));"
    ))
    conn.execute(op.inline_literal(
        "CREATE POLICY chat_messages_user_delete ON chat_messages "
        "FOR DELETE "
        "USING (EXISTS ("
        "  SELECT 1 FROM chat_sessions s "
        "  WHERE s.id = chat_messages.session_id "
        "  AND s.user_id = current_setting('app.current_user_id', TRUE)"
        "));"
    ))

    # ------------------------------------------------------------------ #
    # 5. Admin bypass policies (service role skips RLS)                    #
    #    current_setting returns '' when unset — admins set 'app.is_admin' #
    # ------------------------------------------------------------------ #
    all_tables = _USER_ID_TABLES + _OWNER_ID_TABLES + ["chat_messages"]
    for table in all_tables:
        conn.execute(op.inline_literal(
            f"CREATE POLICY {table}_admin_bypass ON {table} "
            f"AS PERMISSIVE "
            f"FOR ALL "
            f"USING (current_setting('app.is_admin', TRUE) = 'true');"
        ))


def downgrade() -> None:
    conn = op.get_bind()

    all_tables = _USER_ID_TABLES + _OWNER_ID_TABLES + ["chat_messages"]

    for table in all_tables:
        # Drop admin bypass
        conn.execute(op.inline_literal(
            f"DROP POLICY IF EXISTS {table}_admin_bypass ON {table};"
        ))

    # Drop per-table policies
    for table in _USER_ID_TABLES:
        for action in ("select", "insert", "update", "delete"):
            conn.execute(op.inline_literal(
                f"DROP POLICY IF EXISTS {table}_user_{action} ON {table};"
            ))

    for table in _OWNER_ID_TABLES:
        for action in ("select", "insert", "update", "delete"):
            conn.execute(op.inline_literal(
                f"DROP POLICY IF EXISTS {table}_user_{action} ON {table};"
            ))

    for action in ("select", "insert", "update", "delete"):
        conn.execute(op.inline_literal(
            f"DROP POLICY IF EXISTS chat_messages_user_{action} ON chat_messages;"
        ))

    # Disable RLS
    for table in all_tables:
        conn.execute(op.inline_literal(
            f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY;"
        ))
        conn.execute(op.inline_literal(
            f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY;"
        ))
