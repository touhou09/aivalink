-- Migration 004: Performance indexes for memory hot paths (Issue #23)

-- Renderer / list path: filter by user+character+active+strength and sort by importance/created_at.
CREATE INDEX IF NOT EXISTS idx_memories_render_hot
  ON memories(user_id, character_id, archived, importance DESC, created_at DESC)
  WHERE archived = 0 AND strength > 0.1;

-- Repository query path with optional type filters.
CREATE INDEX IF NOT EXISTS idx_memories_user_char_type_created
  ON memories(user_id, character_id, type, created_at DESC)
  WHERE archived = 0;
