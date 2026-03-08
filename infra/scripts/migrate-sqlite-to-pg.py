#!/usr/bin/env python3
"""
One-time SQLite → PostgreSQL data migration script.
Reads from an Aiva SQLite database and bulk-inserts into PostgreSQL.

Usage:
  python migrate-sqlite-to-pg.py --sqlite /path/to/aiva.db --pg "postgresql://user:pass@host:5432/aivalink"
"""

import argparse
import sqlite3
import sys

import psycopg2
from psycopg2.extras import execute_values


TABLES = [
    "users",
    "characters",
    "sessions",
    "messages",
    "memories",
    "energy_transactions",
    "tasks",
    "audit_logs",
    "billing_plans",
    "billing_subscriptions",
    "usage_records",
    "invoices",
]

# Mapping from SQLite table names to PostgreSQL table names
TABLE_MAP = {
    "sessions": "gateway_sessions",
    "messages": "gateway_messages",
    "tasks": "agent_tasks",
    "usage_records": "billing_usage_records",
}

# Columns that are INTEGER booleans in SQLite → BOOLEAN in PG
BOOL_COLUMNS = {
    "characters": {"is_active"},
    "sessions": {"is_active"},
    "gateway_sessions": {"is_active"},
    "memories": {"archived"},
    "billing_plans": {"active"},
}


def migrate_table(
    sqlite_cur: sqlite3.Cursor,
    pg_conn,
    sqlite_table: str,
    pg_table: str,
) -> int:
    """Migrate a single table. Returns row count."""
    sqlite_cur.execute(f"SELECT * FROM {sqlite_table}")
    columns = [desc[0] for desc in sqlite_cur.description]
    rows = sqlite_cur.fetchall()

    if not rows:
        print(f"  {sqlite_table} → {pg_table}: 0 rows (empty)")
        return 0

    bool_cols = BOOL_COLUMNS.get(pg_table, set())
    bool_indices = [i for i, c in enumerate(columns) if c in bool_cols]

    converted_rows = []
    for row in rows:
        row_list = list(row)
        for idx in bool_indices:
            row_list[idx] = bool(row_list[idx])
        converted_rows.append(tuple(row_list))

    col_str = ", ".join(columns)
    template = "(" + ", ".join(["%s"] * len(columns)) + ")"

    with pg_conn.cursor() as pg_cur:
        execute_values(
            pg_cur,
            f"INSERT INTO {pg_table} ({col_str}) VALUES %s ON CONFLICT DO NOTHING",
            converted_rows,
            template=template,
        )

    pg_conn.commit()
    print(f"  {sqlite_table} → {pg_table}: {len(converted_rows)} rows")
    return len(converted_rows)


def verify_counts(
    sqlite_cur: sqlite3.Cursor,
    pg_conn,
    sqlite_table: str,
    pg_table: str,
) -> bool:
    """Verify row counts match."""
    sqlite_cur.execute(f"SELECT COUNT(*) FROM {sqlite_table}")
    sqlite_count = sqlite_cur.fetchone()[0]

    with pg_conn.cursor() as pg_cur:
        pg_cur.execute(f"SELECT COUNT(*) FROM {pg_table}")
        pg_count = pg_cur.fetchone()[0]

    match = sqlite_count == pg_count
    status = "OK" if match else "MISMATCH"
    print(f"  {pg_table}: SQLite={sqlite_count} PG={pg_count} [{status}]")
    return match


def main():
    parser = argparse.ArgumentParser(description="Migrate Aiva SQLite data to PostgreSQL")
    parser.add_argument("--sqlite", required=True, help="Path to SQLite database")
    parser.add_argument("--pg", required=True, help="PostgreSQL connection string")
    parser.add_argument("--dry-run", action="store_true", help="Only show what would be migrated")
    args = parser.parse_args()

    sqlite_conn = sqlite3.connect(args.sqlite)
    sqlite_cur = sqlite_conn.cursor()

    # Check which tables exist in SQLite
    sqlite_cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    existing_tables = {row[0] for row in sqlite_cur.fetchall()}

    tables_to_migrate = [t for t in TABLES if t in existing_tables]
    print(f"Tables found in SQLite: {tables_to_migrate}")

    if args.dry_run:
        for table in tables_to_migrate:
            sqlite_cur.execute(f"SELECT COUNT(*) FROM {table}")
            count = sqlite_cur.fetchone()[0]
            pg_table = TABLE_MAP.get(table, table)
            print(f"  {table} → {pg_table}: {count} rows")
        sqlite_conn.close()
        return

    pg_conn = psycopg2.connect(args.pg)

    print("\n--- Migrating ---")
    total = 0
    for table in tables_to_migrate:
        pg_table = TABLE_MAP.get(table, table)
        total += migrate_table(sqlite_cur, pg_conn, table, pg_table)

    print(f"\nTotal rows migrated: {total}")

    print("\n--- Verifying ---")
    all_ok = True
    for table in tables_to_migrate:
        pg_table = TABLE_MAP.get(table, table)
        if not verify_counts(sqlite_cur, pg_conn, table, pg_table):
            all_ok = False

    sqlite_conn.close()
    pg_conn.close()

    if all_ok:
        print("\nAll checks passed.")
    else:
        print("\nWARNING: Row count mismatches detected!")
        sys.exit(1)


if __name__ == "__main__":
    main()
