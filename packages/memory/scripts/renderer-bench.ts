import Database from "better-sqlite3";
import { MemoryRenderer } from "../src/renderer";

const db = new Database(":memory:");
db.exec(`
  CREATE TABLE memories (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    character_id TEXT,
    type TEXT,
    content TEXT,
    importance INTEGER,
    strength REAL,
    privacy_tag TEXT,
    last_accessed_at TEXT,
    archived INTEGER,
    created_at TEXT
  );
  CREATE INDEX idx_memories_render_hot
    ON memories(user_id, character_id, archived, importance DESC, created_at DESC)
    WHERE archived = 0 AND strength > 0.1;
`);

const insert = db.prepare(
  "INSERT INTO memories (id,user_id,character_id,type,content,importance,strength,privacy_tag,last_accessed_at,archived,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
);

const tx = db.transaction(() => {
  for (let i = 0; i < 12000; i++) {
    const type = i % 5 === 0 ? "daily_log" : i % 4 === 0 ? "user_context" : "long_term";
    insert.run(
      `m-${i}`,
      "u1",
      "c1",
      type,
      `memory-${i}`,
      (i % 10) + 1,
      0.2 + (i % 8) * 0.1,
      "#public",
      null,
      0,
      new Date(Date.now() - i * 1000).toISOString(),
    );
  }
});
tx();

const renderer = new MemoryRenderer(db);
renderer.render("u1", "c1"); // warm up

const start = performance.now();
for (let i = 0; i < 200; i++) {
  renderer.render("u1", "c1");
}
const avg = (performance.now() - start) / 200;
console.log(`avg_render_ms=${avg.toFixed(2)}`);

db.close();
