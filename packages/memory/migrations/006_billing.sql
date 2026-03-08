-- Migration 006: Billing plans/subscriptions/usage/invoices

CREATE TABLE IF NOT EXISTS billing_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_price REAL NOT NULL DEFAULT 0,
  monthly_quota INTEGER NOT NULL DEFAULT 0,
  overage_unit_price REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES billing_plans(id),
  status TEXT NOT NULL CHECK(status IN ('trialing', 'active', 'past_due', 'canceled')),
  current_period_start TEXT NOT NULL,
  current_period_end TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_user ON billing_subscriptions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS usage_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL REFERENCES billing_subscriptions(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  amount REAL NOT NULL,
  reference_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_usage_records_user_created ON usage_records(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_records_ref ON usage_records(reference_id);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL REFERENCES billing_subscriptions(id) ON DELETE CASCADE,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  subtotal REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('pending', 'paid', 'past_due', 'failed')),
  external_payment_id TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invoices_user_created ON invoices(user_id, created_at DESC);
