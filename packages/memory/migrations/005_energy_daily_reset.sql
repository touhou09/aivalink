-- Migration 005: Energy daily reset tracking

ALTER TABLE users ADD COLUMN last_energy_reset_at TEXT DEFAULT (datetime('now', 'localtime'));

UPDATE users
SET last_energy_reset_at = COALESCE(last_energy_reset_at, datetime('now', 'localtime'));
