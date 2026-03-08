import { describe, it, expect, beforeEach } from "vitest";
import { LaneManager, buildLaneId } from "./manager";
import type { TaskEnvelope } from "@aivalink/shared";

function makeEnvelope(id: string): TaskEnvelope {
  return {
    sessionId: id,
    userId: "u1",
    characterId: "kiara",
    message: { content: "hello" },
    persona: { name: "", personaPrompt: "", emotionMap: {}, heartbeat: {} },
    memoryContext: { renderedMemory: "", recentMessages: [], relevantMemories: [] },
    resourceQuota: { maxTokens: 4096, maxCost: 0.1, timeout: 30_000, energyAvailable: 50 },
  };
}

describe("LaneManager", () => {
  let lm: LaneManager;

  beforeEach(() => {
    lm = new LaneManager();
  });

  it("enqueue and dequeue FIFO with per-task requestId", () => {
    const e1 = makeEnvelope("s1");
    const e2 = makeEnvelope("s2");
    lm.enqueue("lane1", e1, "req-1");
    lm.enqueue("lane1", e2, "req-2");

    const out = lm.dequeue("lane1");
    expect(out?.envelope).toBe(e1);
    expect(out?.requestId).toBe("req-1");
  });

  it("dequeue returns undefined when lane is already processing", () => {
    lm.enqueue("lane1", makeEnvelope("s1"), "req-1");
    lm.dequeue("lane1"); // sets processing
    expect(lm.dequeue("lane1")).toBeUndefined();
  });

  it("complete unlocks and allows next dequeue with its own requestId", () => {
    lm.enqueue("lane1", makeEnvelope("s1"), "req-1");
    lm.enqueue("lane1", makeEnvelope("s2"), "req-2");
    lm.dequeue("lane1");
    lm.complete("lane1");

    const next = lm.dequeue("lane1");
    expect(next).toBeDefined();
    expect(next!.envelope.sessionId).toBe("s2");
    expect(next!.requestId).toBe("req-2");
  });

  it("complete cleans up empty lane", () => {
    lm.enqueue("lane1", makeEnvelope("s1"), "req-1");
    lm.dequeue("lane1");
    lm.complete("lane1");
    expect(lm.dequeue("lane1")).toBeUndefined();
  });

  it("clearQueue empties queue but preserves processing state", () => {
    lm.enqueue("lane1", makeEnvelope("s1"), "req-1");
    lm.enqueue("lane1", makeEnvelope("s2"), "req-2");
    lm.dequeue("lane1"); // processing s1
    lm.clearQueue("lane1");

    expect(lm.isProcessing("lane1")).toBe(true);
    lm.complete("lane1");
    expect(lm.dequeue("lane1")).toBeUndefined();
  });

  it("clearQueue deletes lane when not processing", () => {
    lm.enqueue("lane1", makeEnvelope("s1"), "req-1");
    lm.clearQueue("lane1");
    expect(lm.isProcessing("lane1")).toBe(false);
    expect(lm.dequeue("lane1")).toBeUndefined();
  });

  it("isProcessing reflects state correctly", () => {
    expect(lm.isProcessing("lane1")).toBe(false);
    lm.enqueue("lane1", makeEnvelope("s1"), "req-1");
    lm.dequeue("lane1");
    expect(lm.isProcessing("lane1")).toBe(true);
    lm.complete("lane1");
    expect(lm.isProcessing("lane1")).toBe(false);
  });

  it("preserves distinct requestIds across queued tasks", () => {
    lm.enqueue("lane1", makeEnvelope("s1"), "aaa");
    lm.enqueue("lane1", makeEnvelope("s2"), "bbb");
    lm.enqueue("lane1", makeEnvelope("s3"), "ccc");

    const t1 = lm.dequeue("lane1");
    expect(t1!.requestId).toBe("aaa");
    lm.complete("lane1");

    const t2 = lm.dequeue("lane1");
    expect(t2!.requestId).toBe("bbb");
    lm.complete("lane1");

    const t3 = lm.dequeue("lane1");
    expect(t3!.requestId).toBe("ccc");
  });
});

describe("buildLaneId", () => {
  it("builds deterministic key from userId and characterId", () => {
    expect(buildLaneId("alice", "kiara")).toBe("alice:kiara");
    expect(buildLaneId("bob", "miku")).toBe("bob:miku");
  });

  it("throws on empty userId", () => {
    expect(() => buildLaneId("", "kiara")).toThrow();
  });

  it("throws on empty characterId", () => {
    expect(() => buildLaneId("alice", "")).toThrow();
  });
});
