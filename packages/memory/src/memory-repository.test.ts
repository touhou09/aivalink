import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DatabaseManager } from "./sqlite";
import {
  MemoryRepository,
  autoScoreImportance,
  decayStrength,
} from "./memory-repository";
import { MemoryRenderer } from "./renderer";
import { tmpdir } from "os";
import { join } from "path";
import { nanoid } from "nanoid";

function makeTempDb(): DatabaseManager {
  const dbPath = join(tmpdir(), `aiva-test-${nanoid()}.db`);
  const mgr = new DatabaseManager(dbPath);
  mgr.migrate();
  return mgr;
}

const USER = "user-1";
const CHAR = "char-1";

// ==================== autoScoreImportance ====================

describe("autoScoreImportance", () => {
  it("assigns base score by type", () => {
    expect(autoScoreImportance("long_term", "some fact")).toBe(7);
    expect(autoScoreImportance("user_context", "some pref")).toBe(6);
    expect(autoScoreImportance("daily_log", "today was fine")).toBe(4);
  });

  it("boosts score for importance keywords", () => {
    expect(autoScoreImportance("daily_log", "이름은 민수입니다")).toBeGreaterThan(4);
  });

  it("boosts for preference keywords", () => {
    expect(autoScoreImportance("user_context", "I prefer cats")).toBeGreaterThan(6);
  });

  it("boosts for importance signals", () => {
    // daily_log base(4) + important(2) = 6
    const score = autoScoreImportance("daily_log", "This is very important, never forget");
    expect(score).toBeGreaterThanOrEqual(6);
  });

  it("caps at 10", () => {
    // long_term (7) + 이름 (2) + 중요 (2) + 항상 (1) = 12 → capped at 10
    const score = autoScoreImportance("long_term", "이름이 중요하니 항상 기억해");
    expect(score).toBe(10);
  });

  it("minimum is 1", () => {
    expect(autoScoreImportance("daily_log", "ok")).toBeGreaterThanOrEqual(1);
  });
});

// ==================== decayStrength ====================

describe("decayStrength", () => {
  it("returns current strength when no time has passed", () => {
    const now = new Date("2025-01-01T12:00:00Z");
    expect(decayStrength(1.0, null, "2025-01-01T12:00:00", now)).toBe(1.0);
  });

  it("decays strength over time", () => {
    const now = new Date("2025-01-01T22:00:00Z"); // 10 hours later
    const result = decayStrength(1.0, null, "2025-01-01T12:00:00", now);
    expect(result).toBeLessThan(1.0);
    expect(result).toBeGreaterThan(0);
    // e^(-0.1 * 10) ≈ 0.368
    expect(result).toBeCloseTo(0.368, 2);
  });

  it("uses lastAccessedAt when available", () => {
    const now = new Date("2025-01-01T14:00:00Z"); // 2 hours after access
    const result = decayStrength(1.0, "2025-01-01T12:00:00", "2025-01-01T00:00:00", now);
    // e^(-0.1 * 2) ≈ 0.819
    expect(result).toBeCloseTo(0.819, 2);
  });

  it("does not increase strength for negative time", () => {
    const now = new Date("2025-01-01T10:00:00Z"); // before creation
    expect(decayStrength(0.5, null, "2025-01-01T12:00:00", now)).toBe(0.5);
  });

  it("handles ISO timestamps that already have Z suffix", () => {
    const now = new Date("2025-01-01T22:00:00Z");
    const result = decayStrength(1.0, null, "2025-01-01T12:00:00Z", now);
    expect(result).toBeCloseTo(0.368, 2);
  });

  it("handles SQLite datetime format (YYYY-MM-DD HH:mm:ss)", () => {
    const now = new Date("2025-01-01T22:00:00Z");
    const result = decayStrength(1.0, "2025-01-01 12:00:00", "2025-01-01 00:00:00", now);
    // 10 hours since lastAccessedAt → e^(-0.1 * 10) ≈ 0.368
    expect(result).toBeCloseTo(0.368, 2);
  });

  it("handles ISO timestamps with timezone offset", () => {
    const now = new Date("2025-01-01T22:00:00Z");
    // +09:00 means actual UTC is 03:00:00 → 19 hours elapsed
    const result = decayStrength(1.0, null, "2025-01-01T12:00:00+09:00", now);
    expect(result).toBeCloseTo(Math.exp(-0.1 * 19), 2);
  });
});

// ==================== MemoryRepository CRUD ====================

describe("MemoryRepository", () => {
  let dbMgr: DatabaseManager;
  let repo: MemoryRepository;

  beforeEach(() => {
    dbMgr = makeTempDb();
    repo = new MemoryRepository(dbMgr.instance);
  });

  afterEach(() => {
    dbMgr.close();
  });

  describe("create", () => {
    it("creates a memory with auto-scored importance", () => {
      const mem = repo.create({
        userId: USER,
        characterId: CHAR,
        type: "long_term",
        content: "User's name is Alice",
      });

      expect(mem.id).toBeTruthy();
      expect(mem.userId).toBe(USER);
      expect(mem.characterId).toBe(CHAR);
      expect(mem.type).toBe("long_term");
      expect(mem.content).toBe("User's name is Alice");
      expect(mem.importance).toBeGreaterThanOrEqual(7); // long_term base + name keyword
      expect(mem.strength).toBe(1.0);
      expect(mem.privacyTag).toBe("#public");
      expect(mem.archived).toBe(false);
    });

    it("creates with explicit importance", () => {
      const mem = repo.create({
        userId: USER,
        characterId: CHAR,
        type: "daily_log",
        content: "had lunch",
        importance: 3,
      });
      expect(mem.importance).toBe(3);
    });

    it("creates with custom privacy tag", () => {
      const mem = repo.create({
        userId: USER,
        characterId: CHAR,
        type: "user_context",
        content: "personal info",
        privacyTag: "#private",
      });
      expect(mem.privacyTag).toBe("#private");
    });

    it("does not touch last_accessed_at on create", () => {
      const mem = repo.create({
        userId: USER,
        characterId: CHAR,
        type: "long_term",
        content: "fresh memory",
      });
      expect(mem.lastAccessedAt).toBeNull();
    });

    it("creates all three memory types", () => {
      const types = ["daily_log", "long_term", "user_context"] as const;
      for (const type of types) {
        const mem = repo.create({
          userId: USER,
          characterId: CHAR,
          type,
          content: `test ${type}`,
        });
        expect(mem.type).toBe(type);
      }
    });
  });

  describe("findById", () => {
    it("returns memory by id", () => {
      const created = repo.create({
        userId: USER,
        characterId: CHAR,
        type: "long_term",
        content: "test",
      });
      const found = repo.findById(created.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
    });

    it("returns undefined for non-existent id", () => {
      expect(repo.findById("nonexistent")).toBeUndefined();
    });

    it("resets strength on access (touch)", () => {
      const created = repo.create({
        userId: USER,
        characterId: CHAR,
        type: "daily_log",
        content: "test",
      });

      // Manually lower strength
      dbMgr.instance
        .prepare("UPDATE memories SET strength = 0.5 WHERE id = ?")
        .run(created.id);

      // findById touches → resets strength
      const found = repo.findById(created.id);
      // After touch, re-read raw to confirm
      const raw = dbMgr.instance
        .prepare("SELECT strength FROM memories WHERE id = ?")
        .get(created.id) as { strength: number };
      expect(raw.strength).toBe(1.0);
      expect(found).toBeDefined();
    });

    it("returns post-touch strength and lastAccessedAt", () => {
      const created = repo.create({
        userId: USER,
        characterId: CHAR,
        type: "daily_log",
        content: "test",
      });

      // Manually lower strength and clear lastAccessedAt
      dbMgr.instance
        .prepare("UPDATE memories SET strength = 0.3, last_accessed_at = NULL WHERE id = ?")
        .run(created.id);

      const found = repo.findById(created.id);
      expect(found!.strength).toBe(1.0);
      expect(found!.lastAccessedAt).not.toBeNull();
    });
  });

  describe("findByUserAndCharacter", () => {
    beforeEach(() => {
      repo.create({ userId: USER, characterId: CHAR, type: "long_term", content: "fact A", importance: 9 });
      repo.create({ userId: USER, characterId: CHAR, type: "daily_log", content: "log B", importance: 3 });
      repo.create({ userId: USER, characterId: CHAR, type: "user_context", content: "pref C", importance: 6 });
      repo.create({ userId: USER, characterId: CHAR, type: "long_term", content: "private D", importance: 8, privacyTag: "#private" });
    });

    it("returns all non-archived memories sorted by importance", () => {
      const results = repo.findByUserAndCharacter(USER, CHAR);
      expect(results).toHaveLength(4);
      expect(results[0].importance).toBeGreaterThanOrEqual(results[1].importance);
    });

    it("filters by type", () => {
      const results = repo.findByUserAndCharacter(USER, CHAR, { type: "long_term" });
      expect(results.every((m) => m.type === "long_term")).toBe(true);
      expect(results.length).toBe(2);
    });

    it("filters by minImportance", () => {
      const results = repo.findByUserAndCharacter(USER, CHAR, { minImportance: 7 });
      expect(results.every((m) => m.importance >= 7)).toBe(true);
    });

    it("filters by privacyTag", () => {
      const results = repo.findByUserAndCharacter(USER, CHAR, { privacyTag: "#private" });
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe("private D");
    });

    it("respects limit", () => {
      const results = repo.findByUserAndCharacter(USER, CHAR, { limit: 2 });
      expect(results).toHaveLength(2);
    });

    it("excludes archived by default", () => {
      const all = repo.findByUserAndCharacter(USER, CHAR);
      const first = all[0];
      repo.archive(first.id);
      const afterArchive = repo.findByUserAndCharacter(USER, CHAR);
      expect(afterArchive).toHaveLength(3);
    });

    it("includes archived when requested", () => {
      const all = repo.findByUserAndCharacter(USER, CHAR);
      repo.archive(all[0].id);
      const withArchived = repo.findByUserAndCharacter(USER, CHAR, { includeArchived: true });
      expect(withArchived).toHaveLength(4);
    });

    it("returns empty for unknown user", () => {
      expect(repo.findByUserAndCharacter("unknown", CHAR)).toHaveLength(0);
    });
  });

  describe("update", () => {
    it("updates content", () => {
      const mem = repo.create({ userId: USER, characterId: CHAR, type: "long_term", content: "old" });
      const updated = repo.update(mem.id, { content: "new" });
      expect(updated!.content).toBe("new");
    });

    it("updates importance", () => {
      const mem = repo.create({ userId: USER, characterId: CHAR, type: "daily_log", content: "test" });
      const updated = repo.update(mem.id, { importance: 10 });
      expect(updated!.importance).toBe(10);
    });

    it("updates privacyTag", () => {
      const mem = repo.create({ userId: USER, characterId: CHAR, type: "long_term", content: "test" });
      const updated = repo.update(mem.id, { privacyTag: "#sensitive" });
      expect(updated!.privacyTag).toBe("#sensitive");
    });

    it("returns memory when no fields to update", () => {
      const mem = repo.create({ userId: USER, characterId: CHAR, type: "long_term", content: "test" });
      const result = repo.update(mem.id, {});
      expect(result!.id).toBe(mem.id);
    });

    it("does not reset strength on update", () => {
      const mem = repo.create({ userId: USER, characterId: CHAR, type: "long_term", content: "test" });

      // Manually lower strength
      dbMgr.instance
        .prepare("UPDATE memories SET strength = 0.4 WHERE id = ?")
        .run(mem.id);

      const updated = repo.update(mem.id, { content: "updated" });
      expect(updated!.strength).toBeCloseTo(0.4, 2);
    });

    it("does not touch last_accessed_at on update", () => {
      const mem = repo.create({ userId: USER, characterId: CHAR, type: "long_term", content: "test" });

      // last_accessed_at should be null after create (not touched)
      expect(mem.lastAccessedAt).toBeNull();

      const updated = repo.update(mem.id, { content: "updated" });
      expect(updated!.lastAccessedAt).toBeNull();
    });
  });

  describe("archive", () => {
    it("archives a memory", () => {
      const mem = repo.create({ userId: USER, characterId: CHAR, type: "long_term", content: "test" });
      expect(repo.archive(mem.id)).toBe(true);

      const raw = dbMgr.instance
        .prepare("SELECT archived FROM memories WHERE id = ?")
        .get(mem.id) as { archived: number };
      expect(raw.archived).toBe(1);
    });

    it("returns false for non-existent id", () => {
      expect(repo.archive("nonexistent")).toBe(false);
    });
  });

  describe("applyDecay", () => {
    it("decays strength of old memories", () => {
      repo.create({ userId: USER, characterId: CHAR, type: "daily_log", content: "old memory" });

      // Simulate time: set created_at to 24 hours ago
      dbMgr.instance
        .prepare("UPDATE memories SET created_at = datetime('now', '-24 hours'), last_accessed_at = NULL, strength = 1.0")
        .run();

      const count = repo.applyDecay(USER, CHAR);
      expect(count).toBeGreaterThan(0);

      const rows = dbMgr.instance
        .prepare("SELECT strength FROM memories WHERE user_id = ? AND character_id = ?")
        .all(USER, CHAR) as Array<{ strength: number }>;
      expect(rows[0].strength).toBeLessThan(1.0);
    });

    it("does not decay archived memories", () => {
      const mem = repo.create({ userId: USER, characterId: CHAR, type: "daily_log", content: "archived" });
      repo.archive(mem.id);

      dbMgr.instance
        .prepare("UPDATE memories SET created_at = datetime('now', '-48 hours'), last_accessed_at = NULL")
        .run();

      const count = repo.applyDecay(USER, CHAR);
      expect(count).toBe(0);
    });

    it("skips memories with negligible strength", () => {
      repo.create({ userId: USER, characterId: CHAR, type: "daily_log", content: "fading" });

      dbMgr.instance
        .prepare("UPDATE memories SET strength = 0.005")
        .run();

      const count = repo.applyDecay(USER, CHAR);
      expect(count).toBe(0);
    });

    it("is idempotent when called twice at the same time", () => {
      repo.create({ userId: USER, characterId: CHAR, type: "daily_log", content: "test" });

      dbMgr.instance
        .prepare("UPDATE memories SET created_at = datetime('now', '-10 hours'), last_accessed_at = NULL, strength = 1.0")
        .run();

      const now = new Date();
      repo.applyDecay(USER, CHAR, now);
      const after1 = dbMgr.instance
        .prepare("SELECT strength FROM memories WHERE user_id = ? AND character_id = ?")
        .get(USER, CHAR) as { strength: number };

      repo.applyDecay(USER, CHAR, now);
      const after2 = dbMgr.instance
        .prepare("SELECT strength FROM memories WHERE user_id = ? AND character_id = ?")
        .get(USER, CHAR) as { strength: number };

      expect(after2.strength).toBeCloseTo(after1.strength, 6);
    });

    it("does not double-count decay across successive runs", () => {
      repo.create({ userId: USER, characterId: CHAR, type: "daily_log", content: "test" });

      // T0 = 2025-06-01T00:00:00Z (set via SQL below)
      dbMgr.instance
        .prepare("UPDATE memories SET created_at = '2025-06-01T00:00:00', last_accessed_at = NULL, strength = 1.0")
        .run();

      // First decay at T+10h
      const t10 = new Date("2025-06-01T10:00:00Z");
      repo.applyDecay(USER, CHAR, t10);

      // Second decay at T+20h
      const t20 = new Date("2025-06-01T20:00:00Z");
      repo.applyDecay(USER, CHAR, t20);

      const row = dbMgr.instance
        .prepare("SELECT strength FROM memories WHERE user_id = ? AND character_id = ?")
        .get(USER, CHAR) as { strength: number };

      // Correct value: exp(-0.1 * 20) ≈ 0.1353
      expect(row.strength).toBeCloseTo(Math.exp(-0.1 * 20), 4);
    });
  });
});

describe("MemoryRepository vector integration", () => {
  let dbMgr: DatabaseManager;

  beforeEach(() => {
    dbMgr = makeTempDb();
  });

  afterEach(() => {
    dbMgr.close();
  });

  it("indexes on create/update and deindexes on archive/delete", async () => {
    const embeddingProvider = {
      embed: vi.fn(async () => [0.1, 0.2]),
      embedBatch: vi.fn(async () => [[0.1, 0.2]]),
    };
    const vectorStore = {
      ensureCollection: vi.fn(async () => {}),
      deleteCollection: vi.fn(async () => {}),
      upsert: vi.fn(async () => {}),
      upsertBatch: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
      query: vi.fn(async () => []),
    };

    const repo = new MemoryRepository(dbMgr.instance, {
      embeddingProvider,
      vectorStore,
    });

    const created = await repo.createAndIndex({
      userId: USER,
      characterId: CHAR,
      type: "long_term",
      content: "likes jazz",
    });

    expect(embeddingProvider.embed).toHaveBeenCalledWith("likes jazz");
    expect(vectorStore.upsert).toHaveBeenCalled();

    await repo.updateAndIndex(created.id, { content: "likes classic jazz" });
    expect(embeddingProvider.embed).toHaveBeenCalledWith("likes classic jazz");

    await repo.archiveAndDeindex(created.id);
    await repo.deleteAndDeindex(created.id);
    expect(vectorStore.remove).toHaveBeenCalledWith(created.id);
  });

  it("supports semanticSearch and batch indexing", async () => {
    const embeddingProvider = {
      embed: vi.fn(async () => [0.2, 0.4]),
      embedBatch: vi.fn(async (texts: string[]) => texts.map(() => [0.3, 0.5])),
    };
    const vectorStore = {
      ensureCollection: vi.fn(async () => {}),
      deleteCollection: vi.fn(async () => {}),
      upsert: vi.fn(async () => {}),
      upsertBatch: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
      query: vi.fn(async () => [] as Array<{ id: string; score: number }>),
    };

    const repo = new MemoryRepository(dbMgr.instance, {
      embeddingProvider,
      vectorStore,
    });

    const mem1 = repo.create({ userId: USER, characterId: CHAR, type: "long_term", content: "works as engineer" });
    const mem2 = repo.create({ userId: USER, characterId: CHAR, type: "user_context", content: "prefers tea" });

    await repo.indexBatch([mem1, mem2]);
    expect(embeddingProvider.embedBatch).toHaveBeenCalledTimes(1);
    expect(vectorStore.upsertBatch).toHaveBeenCalledTimes(1);

    dbMgr.instance.prepare("UPDATE memories SET strength = 0.42 WHERE id = ?").run(mem2.id);

    vectorStore.query = vi.fn(async () => [{ id: mem2.id, score: 0.91 }]);
    const hits = await repo.semanticSearch(USER, CHAR, "tea preference", 3);
    expect(embeddingProvider.embed).toHaveBeenCalledWith("tea preference");
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe(mem2.id);
    expect(hits[0].similarity).toBeCloseTo(0.91, 2);

    const after = dbMgr.instance
      .prepare("SELECT strength FROM memories WHERE id = ?")
      .get(mem2.id) as { strength: number };
    expect(after.strength).toBeCloseTo(0.42, 2);

    const foreign = repo.create({
      userId: "user-other",
      characterId: "char-other",
      type: "long_term",
      content: "foreign memory",
    });
    vectorStore.query = vi.fn(async () => [{ id: foreign.id, score: 0.99 }]);
    const blocked = await repo.semanticSearch(USER, CHAR, "foreign", 3);
    expect(blocked).toHaveLength(0);
  });
});

// ==================== MemoryRenderer integration ====================

describe("MemoryRenderer integration", () => {
  let dbMgr: DatabaseManager;
  let repo: MemoryRepository;
  let renderer: MemoryRenderer;

  beforeEach(() => {
    dbMgr = makeTempDb();
    repo = new MemoryRepository(dbMgr.instance);
    renderer = new MemoryRenderer(dbMgr.instance);
  });

  afterEach(() => {
    dbMgr.close();
  });

  it("renders Core Facts from high-importance memories", () => {
    repo.create({ userId: USER, characterId: CHAR, type: "long_term", content: "User is a developer", importance: 8 });
    repo.create({ userId: USER, characterId: CHAR, type: "long_term", content: "Lives in Seoul", importance: 9 });

    const md = renderer.render(USER, CHAR);
    expect(md).toContain("## Core Facts");
    expect(md).toContain("User is a developer");
    expect(md).toContain("Lives in Seoul");
  });

  it("renders Preferences section", () => {
    repo.create({ userId: USER, characterId: CHAR, type: "user_context", content: "Prefers dark mode", importance: 6 });

    const md = renderer.render(USER, CHAR);
    expect(md).toContain("## Preferences");
    expect(md).toContain("Prefers dark mode");
  });

  it("renders Recent Context from daily logs", () => {
    repo.create({ userId: USER, characterId: CHAR, type: "daily_log", content: "Had coffee today", importance: 4 });

    const md = renderer.render(USER, CHAR);
    expect(md).toContain("## Recent Context");
    expect(md).toContain("Had coffee today");
  });

  it("excludes archived memories from rendering", () => {
    const mem = repo.create({ userId: USER, characterId: CHAR, type: "long_term", content: "Old fact", importance: 9 });
    repo.archive(mem.id);

    const md = renderer.render(USER, CHAR);
    expect(md).not.toContain("Old fact");
  });

  it("excludes low-strength memories from rendering", () => {
    repo.create({ userId: USER, characterId: CHAR, type: "long_term", content: "Fading memory", importance: 9 });
    dbMgr.instance.prepare("UPDATE memories SET strength = 0.05").run();

    const md = renderer.render(USER, CHAR);
    expect(md).not.toContain("Fading memory");
  });
});
