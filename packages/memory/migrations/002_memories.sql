-- Migration 002: Memory system + Energy transactions
-- Decision D11: SQLite as Ground Truth

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('daily_log', 'long_term', 'user_context')),
  content TEXT NOT NULL,
  importance INTEGER NOT NULL DEFAULT 5 CHECK(importance BETWEEN 1 AND 10),
  strength REAL NOT NULL DEFAULT 1.0,
  privacy_tag TEXT NOT NULL DEFAULT '#public',
  last_accessed_at TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_memories_user_char ON memories(user_id, character_id);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
CREATE INDEX IF NOT EXISTS idx_memories_strength ON memories(strength) WHERE archived = 0;

CREATE TABLE IF NOT EXISTS energy_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason TEXT NOT NULL,
  reference_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_energy_user ON energy_transactions(user_id);
