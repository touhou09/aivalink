/**
 * Memory CRUD Repository
 * Decision D11: PostgreSQL as Ground Truth
 *
 * - CRUD for memories (daily_log, long_term, user_context)
 * - Importance auto-scoring based on memory type and content signals
 * - Strength decay via Ebbinghaus forgetting curve
 * - Strength reset on access
 * - privacy_tag filtering
 */

import type { Pool } from "pg";
import { nanoid } from "nanoid";
import type { EmbeddingProvider, VectorStore } from "./vector";

export type MemoryType = "daily_log" | "long_term" | "user_context";

export interface Memory {
  id: string;
  userId: string;
  characterId: string;
  type: MemoryType;
  content: string;
  importance: number;
  strength: number;
  privacyTag: string;
  lastAccessedAt: string | null;
  archived: boolean;
  createdAt: string;
}

export interface CreateMemoryInput {
  userId: string;
  characterId: string;
  type: MemoryType;
  content: string;
  importance?: number;
  privacyTag?: string;
}

export interface UpdateMemoryInput {
  content?: string;
  importance?: number;
  privacyTag?: string;
}

export interface QueryMemoryOptions {
  type?: MemoryType;
  minImportance?: number;
  privacyTag?: string;
  includeArchived?: boolean;
  limit?: number;
}

// --- Importance auto-scoring ---

const TYPE_BASE_IMPORTANCE: Record<MemoryType, number> = {
  long_term: 7,
  user_context: 6,
  daily_log: 4,
};

const IMPORTANCE_KEYWORDS = [
  { pattern: /이름|name|birthday|생일/i, boost: 2 },
  { pattern: /좋아|싫어|prefer|favorite|hate/i, boost: 1 },
  { pattern: /중요|important|critical|never forget/i, boost: 2 },
  { pattern: /항상|always|remember/i, boost: 1 },
];

export function autoScoreImportance(
  type: MemoryType,
  content: string,
): number {
  let score = TYPE_BASE_IMPORTANCE[type];
  for (const { pattern, boost } of IMPORTANCE_KEYWORDS) {
    if (pattern.test(content)) {
      score += boost;
    }
  }
  return Math.min(10, Math.max(1, score));
}

// --- Strength decay (Ebbinghaus forgetting curve) ---

const DECAY_RATE = 0.1; // λ: decay constant per hour

/**
 * Parse a timestamp string as UTC.
 * Handles:
 *  - ISO 8601 with timezone: '2025-01-01T12:00:00Z', '2025-01-01T12:00:00+09:00'
 *  - ISO 8601 without timezone: '2025-01-01T12:00:00' (treated as UTC)
 *  - SQLite datetime() format: '2025-01-01 12:00:00' (treated as UTC)
 */
function parseTimestampAsUTC(ts: string): Date {
  if (/[Zz]$/.test(ts) || /[+-]\d{2}:?\d{2}$/.test(ts)) {
    return new Date(ts);
  }
  return new Date(ts.replace(" ", "T") + "Z");
}

export function decayStrength(
  currentStrength: number,
  lastAccessedAt: string | null,
  createdAt: string,
  now: Date = new Date(),
): number {
  const referenceTime = lastAccessedAt
    ? parseTimestampAsUTC(lastAccessedAt)
    : parseTimestampAsUTC(createdAt);
  const hoursElapsed =
    (now.getTime() - referenceTime.getTime()) / (1000 * 60 * 60);
  if (hoursElapsed <= 0) return currentStrength;
  return Math.exp(-DECAY_RATE * hoursElapsed);
}

// --- Repository ---

interface MemoryRow {
  id: string;
  user_id: string;
  character_id: string;
  type: string;
  content: string;
  importance: number;
  strength: number;
  privacy_tag: string;
  last_accessed_at: string | null;
  archived: boolean;
  created_at: string;
}

function rowToMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    userId: row.user_id,
    characterId: row.character_id,
    type: row.type as MemoryType,
    content: row.content,
    importance: row.importance,
    strength: row.strength,
    privacyTag: row.privacy_tag,
    lastAccessedAt: row.last_accessed_at,
    archived: Boolean(row.archived),
    createdAt: row.created_at,
  };
}

export interface SemanticSearchResult extends Memory {
  similarity: number;
}

export class MemoryRepository {
  constructor(
    private db: Pool,
    private vectorDeps?: {
      embeddingProvider: EmbeddingProvider;
      vectorStore: VectorStore;
    },
  ) {}

  async create(input: CreateMemoryInput): Promise<Memory> {
    const id = nanoid();
    const importance =
      input.importance ?? autoScoreImportance(input.type, input.content);
    const privacyTag = input.privacyTag ?? "#public";

    await this.db.query(
      `INSERT INTO memories (id, user_id, character_id, type, content, importance, strength, privacy_tag)
       VALUES ($1, $2, $3, $4, $5, $6, 1.0, $7)`,
      [id, input.userId, input.characterId, input.type, input.content, importance, privacyTag],
    );

    return (await this.findByIdRaw(id))!;
  }

  async createAndIndex(input: CreateMemoryInput): Promise<Memory> {
    const memory = await this.create(input);
    try {
      await this.upsertMemoryToVector(memory);
      return memory;
    } catch (error) {
      await this.delete(memory.id);
      throw error;
    }
  }

  async findById(id: string): Promise<Memory | undefined> {
    // Touch access → reset strength (no-op when id doesn't exist)
    const result = await this.db.query(
      "UPDATE memories SET last_accessed_at = NOW(), strength = 1.0 WHERE id = $1",
      [id],
    );
    if ((result.rowCount ?? 0) === 0) return undefined;

    return this.findByIdRaw(id);
  }

  async findByIdRaw(id: string): Promise<Memory | undefined> {
    const result = await this.db.query<MemoryRow>(
      "SELECT * FROM memories WHERE id = $1",
      [id],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return rowToMemory(row);
  }

  async findByUserAndCharacter(
    userId: string,
    characterId: string,
    options: QueryMemoryOptions = {},
  ): Promise<Memory[]> {
    const conditions = [
      "user_id = $1",
      "character_id = $2",
    ];
    const params: unknown[] = [userId, characterId];

    if (!options.includeArchived) {
      conditions.push("archived = false");
    }

    if (options.type) {
      params.push(options.type);
      conditions.push(`type = $${params.length}`);
    }

    if (options.minImportance !== undefined) {
      params.push(options.minImportance);
      conditions.push(`importance >= $${params.length}`);
    }

    if (options.privacyTag) {
      params.push(options.privacyTag);
      conditions.push(`privacy_tag = $${params.length}`);
    }

    const limit = options.limit ?? 50;
    params.push(limit);

    const sql = `
      SELECT * FROM memories
      WHERE ${conditions.join(" AND ")}
      ORDER BY importance DESC, created_at DESC
      LIMIT $${params.length}
    `;

    const result = await this.db.query<MemoryRow>(sql, params);
    return result.rows.map(rowToMemory);
  }

  async update(id: string, input: UpdateMemoryInput): Promise<Memory | undefined> {
    const sets: string[] = [];
    const params: unknown[] = [];

    if (input.content !== undefined) {
      params.push(input.content);
      sets.push(`content = $${params.length}`);
    }
    if (input.importance !== undefined) {
      params.push(input.importance);
      sets.push(`importance = $${params.length}`);
    }
    if (input.privacyTag !== undefined) {
      params.push(input.privacyTag);
      sets.push(`privacy_tag = $${params.length}`);
    }

    if (sets.length === 0) return this.findByIdRaw(id);

    params.push(id);
    await this.db.query(
      `UPDATE memories SET ${sets.join(", ")} WHERE id = $${params.length}`,
      params,
    );

    return this.findByIdRaw(id);
  }

  async updateAndIndex(id: string, input: UpdateMemoryInput): Promise<Memory | undefined> {
    const before = await this.findByIdRaw(id);
    const updated = await this.update(id, input);
    if (!updated) return updated;

    try {
      await this.upsertMemoryToVector(updated);
      return updated;
    } catch (error) {
      if (before) {
        await this.update(id, {
          content: before.content,
          importance: before.importance,
          privacyTag: before.privacyTag,
        });
      }
      throw error;
    }
  }

  async archive(id: string): Promise<boolean> {
    const result = await this.db.query(
      "UPDATE memories SET archived = true WHERE id = $1",
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async archiveAndDeindex(id: string): Promise<boolean> {
    const before = await this.findByIdRaw(id);
    const archived = await this.archive(id);
    if (!archived || !this.vectorDeps) return archived;

    try {
      await this.vectorDeps.vectorStore.remove(id);
      return true;
    } catch (error) {
      await this.db.query(
        "UPDATE memories SET archived = $1 WHERE id = $2",
        [before?.archived ?? false, id],
      );
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query(
      "DELETE FROM memories WHERE id = $1",
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async deleteAndDeindex(id: string): Promise<boolean> {
    const snapshot = await this.findByIdRaw(id);
    const deleted = await this.delete(id);
    if (!deleted || !this.vectorDeps) return deleted;

    try {
      await this.vectorDeps.vectorStore.remove(id);
      return true;
    } catch (error) {
      if (snapshot) {
        await this.db.query(
          `INSERT INTO memories
           (id, user_id, character_id, type, content, importance, strength, privacy_tag, last_accessed_at, archived, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            snapshot.id,
            snapshot.userId,
            snapshot.characterId,
            snapshot.type,
            snapshot.content,
            snapshot.importance,
            snapshot.strength,
            snapshot.privacyTag,
            snapshot.lastAccessedAt,
            snapshot.archived,
            snapshot.createdAt,
          ],
        );
      }
      throw error;
    }
  }

  async semanticSearch(
    userId: string,
    characterId: string,
    query: string,
    topK = 5,
  ): Promise<SemanticSearchResult[]> {
    if (!this.vectorDeps) return [];
    await this.vectorDeps.vectorStore.ensureCollection();
    const embedding = await this.vectorDeps.embeddingProvider.embed(query);
    const vectorHits = await this.vectorDeps.vectorStore.query({
      embedding,
      topK,
      where: { userId, characterId },
    });

    const results: SemanticSearchResult[] = [];
    for (const hit of vectorHits) {
      const memory = await this.findByIdRaw(hit.id);
      if (!memory || memory.archived) continue;
      if (memory.userId !== userId || memory.characterId !== characterId) {
        continue;
      }
      results.push({ ...memory, similarity: hit.score });
    }
    return results;
  }

  async indexBatch(memories: Memory[]): Promise<void> {
    if (!this.vectorDeps || memories.length === 0) return;
    await this.vectorDeps.vectorStore.ensureCollection();
    const embeddings = await this.vectorDeps.embeddingProvider.embedBatch(
      memories.map((m) => m.content),
    );
    await this.vectorDeps.vectorStore.upsertBatch({
      ids: memories.map((m) => m.id),
      embeddings,
      documents: memories.map((m) => m.content),
      metadatas: memories.map((m) => ({
        userId: m.userId,
        characterId: m.characterId,
        type: m.type,
        importance: m.importance,
        privacyTag: m.privacyTag,
        archived: m.archived,
      })),
    });
  }

  private async upsertMemoryToVector(memory: Memory): Promise<void> {
    if (!this.vectorDeps) return;
    await this.vectorDeps.vectorStore.ensureCollection();
    const embedding = await this.vectorDeps.embeddingProvider.embed(memory.content);
    await this.vectorDeps.vectorStore.upsert({
      id: memory.id,
      embedding,
      document: memory.content,
      metadata: {
        userId: memory.userId,
        characterId: memory.characterId,
        type: memory.type,
        importance: memory.importance,
        privacyTag: memory.privacyTag,
        archived: memory.archived,
      },
    });
  }

  /**
   * Apply strength decay to all non-archived memories for a user/character.
   * Returns count of memories updated.
   */
  async applyDecay(
    userId: string,
    characterId: string,
    now: Date = new Date(),
  ): Promise<number> {
    const result = await this.db.query<{
      id: string;
      strength: number;
      last_accessed_at: string | null;
      created_at: string;
    }>(
      `SELECT id, strength, last_accessed_at, created_at
       FROM memories
       WHERE user_id = $1 AND character_id = $2 AND archived = false AND strength > 0.01`,
      [userId, characterId],
    );

    let updated = 0;
    for (const row of result.rows) {
      const newStrength = decayStrength(
        row.strength,
        row.last_accessed_at,
        row.created_at,
        now,
      );
      if (Math.abs(newStrength - row.strength) > 0.001) {
        await this.db.query(
          "UPDATE memories SET strength = $1 WHERE id = $2",
          [newStrength, row.id],
        );
        updated++;
      }
    }
    return updated;
  }
}
