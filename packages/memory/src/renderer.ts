/**
 * MEMORY.md Dynamic Renderer
 * Decision D11: Not a physical file — rendered at session start
 * Queries memories with importance >= 7, renders as markdown for LLM context
 */

import type { Pool } from "pg";

interface MemoryRow {
  type: string;
  content: string;
  importance: number;
  created_at: string;
}

const MAX_RENDER_ROWS = 200;
const MAX_PINNED = 40;
const MAX_PREFERENCES = 20;
const MAX_RECENT = 5;

export class MemoryRenderer {
  constructor(private db: Pool) {}

  async render(userId: string, characterId: string): Promise<string> {
    const result = await this.db.query<MemoryRow>(
      `SELECT type, content, importance, created_at
       FROM memories
       WHERE user_id = $1 AND character_id = $2
         AND archived = false AND strength > 0.1
       ORDER BY importance DESC, created_at DESC
       LIMIT $3`,
      [userId, characterId, MAX_RENDER_ROWS],
    );
    const memories = result.rows;

    const pinned: MemoryRow[] = [];
    const preferences: MemoryRow[] = [];
    const recent: MemoryRow[] = [];

    for (const memory of memories) {
      if (memory.importance >= 7 && pinned.length < MAX_PINNED) {
        pinned.push(memory);
      }

      if (
        memory.type === "user_context" &&
        memory.importance >= 5 &&
        preferences.length < MAX_PREFERENCES
      ) {
        preferences.push(memory);
      }

      if (memory.type === "daily_log" && recent.length < MAX_RECENT) {
        recent.push(memory);
      }

      if (
        pinned.length >= MAX_PINNED &&
        preferences.length >= MAX_PREFERENCES &&
        recent.length >= MAX_RECENT
      ) {
        break;
      }
    }

    let md = "## Core Facts\n";
    for (const m of pinned) {
      md += `- ${m.content}\n`;
    }

    if (preferences.length > 0) {
      md += "\n## Preferences\n";
      for (const m of preferences) {
        md += `- ${m.content}\n`;
      }
    }

    if (recent.length > 0) {
      md += "\n## Recent Context\n";
      for (const m of recent) {
        md += `- [${m.created_at}] ${m.content}\n`;
      }
    }

    return md;
  }
}
