-- Migration 001: Initial schema
-- Users, Characters, Sessions, Messages

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  display_name TEXT NOT NULL,
  auth_provider TEXT NOT NULL,
  avatar_url TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Seoul',
  trust_level TEXT NOT NULL DEFAULT 'beginner',
  tier TEXT NOT NULL DEFAULT 'free',
  energy_balance INTEGER NOT NULL DEFAULT 50,
  energy_max INTEGER NOT NULL DEFAULT 50,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  persona_prompt TEXT NOT NULL,
  live2d_model TEXT,
  tts_engine TEXT DEFAULT 'edge-tts',
  tts_config TEXT DEFAULT '{}',
  emotion_map TEXT DEFAULT '{}',
  heartbeat TEXT DEFAULT '{}',
  agent_config TEXT DEFAULT '{}',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_characters_user ON characters(user_id);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  character_id TEXT NOT NULL REFERENCES characters(id),
  device_id TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active) WHERE is_active = 1;

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  user_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  emotion TEXT,
  model_used TEXT,
  token_input INTEGER DEFAULT 0,
  token_output INTEGER DEFAULT 0,
  energy_cost INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
