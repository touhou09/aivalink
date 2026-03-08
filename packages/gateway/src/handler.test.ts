import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleMessage, type HandlerDeps } from "./handler";
import { SessionManager, type SessionState, type GatewaySocket } from "./session/manager";
import { LaneManager, buildLaneId } from "./lane/manager";
import type { OrchestratorResult } from "@aivalink/orchestrator";
import type { Memory } from "@aivalink/memory";
import { nanoid } from "nanoid";

function makeSocket(): GatewaySocket & { send: ReturnType<typeof vi.fn> } {
  return { readyState: 1, send: vi.fn() };
}

function makeOrchestrator() {
  return {
    process: vi.fn().mockResolvedValue({ content: "stub response", emotion: "neutral" }),
  };
}

describe("handleMessage", () => {
  let socket: ReturnType<typeof makeSocket>;
  let session: SessionState;
  let deps: HandlerDeps;
  let sm: SessionManager;
  let lm: LaneManager;

  beforeEach(() => {
    socket = makeSocket();
    sm = new SessionManager();
    lm = new LaneManager();

    session = {
      sessionId: "s1",
      userId: "user1",
      characterId: "char1",
      laneId: buildLaneId("user1", "char1"),
      socket,
      connectedAt: new Date(),
    };
    sm.create(session);

    deps = {
      sessionManager: sm,
      laneManager: lm,
      orchestrator: makeOrchestrator() as unknown as HandlerDeps["orchestrator"],
    };
  });

  // --- Traceability ---

  it("returns a requestId for every call", async () => {
    const result = await handleMessage('{"version":1,"type":"ping"}', session, socket, deps);
    expect(result.requestId).toBeDefined();
    expect(typeof result.requestId).toBe("string");
    expect(result.requestId.length).toBeGreaterThan(0);
  });

  it("includes requestId in pong response payload", async () => {
    const result = await handleMessage('{"version":1,"type":"ping"}', session, socket, deps);
    const sent = JSON.parse(socket.send.mock.calls[0][0]);
    expect(sent.requestId).toBe(result.requestId);
  });

  it("includes requestId in error response payload", async () => {
    const result = await handleMessage("bad json!", session, socket, deps);
    const sent = JSON.parse(socket.send.mock.calls[0][0]);
    expect(sent.requestId).toBe(result.requestId);
  });

  it("includes requestId in chat_response payload", async () => {
    const result = await handleMessage('{"version":1,"type":"chat","content":"hi"}', session, socket, deps);
    const sent = socket.send.mock.calls
      .map((c) => JSON.parse(c[0]))
      .find((m) => m.type === "chat_response");
    expect(sent).toBeDefined();
    expect(sent.requestId).toBe(result.requestId);
  });

  // --- Ping / Pong ---

  it("ping returns pong with version 1", async () => {
    await handleMessage('{"version":1,"type":"ping"}', session, socket, deps);
    expect(socket.send).toHaveBeenCalledOnce();
    const sent = JSON.parse(socket.send.mock.calls[0][0]);
    expect(sent.type).toBe("pong");
    expect(sent.version).toBe(1);
  });

  // --- Chat routing ---

  it("chat routes through orchestrator and returns chat_response", async () => {
    await handleMessage('{"version":1,"type":"chat","content":"hello"}', session, socket, deps);
    const orch = deps.orchestrator as unknown as ReturnType<typeof makeOrchestrator>;
    expect(orch.process).toHaveBeenCalledOnce();
    const envelope = orch.process.mock.calls[0][0];
    expect(envelope.userId).toBe("user1");
    expect(envelope.characterId).toBe("char1");
    expect(envelope.message.content).toBe("hello");

    const sent = socket.send.mock.calls
      .map((c) => JSON.parse(c[0]))
      .find((m) => m.type === "chat_response");
    expect(sent).toBeDefined();
    expect(sent.content).toBe("stub response");
    expect(sent.emotion).toBe("neutral");
  });

  it("chat uses session laneId (not hardcoded)", async () => {
    const customSession: SessionState = {
      ...session,
      sessionId: "s2",
      userId: "alice",
      characterId: "miku",
      laneId: buildLaneId("alice", "miku"),
    };
    sm.create(customSession);

    await handleMessage('{"version":1,"type":"chat","content":"hi"}', customSession, socket, deps);
    const orch = deps.orchestrator as unknown as ReturnType<typeof makeOrchestrator>;
    const envelope = orch.process.mock.calls[0][0];
    expect(envelope.userId).toBe("alice");
    expect(envelope.characterId).toBe("miku");
  });

  it("emits energy_update when energy is consumed", async () => {
    deps.userRepository = {
      consumeEnergy: vi.fn().mockReturnValue({
        userId: "user1",
        tier: "free",
        current: 47,
        max: 50,
        lastResetAt: new Date().toISOString(),
        consumed: 3,
        allowed: true,
      }),
    } as unknown as NonNullable<HandlerDeps["userRepository"]>;

    await handleMessage('{"version":1,"type":"chat","content":"hello"}', session, socket, deps);

    const sent = socket.send.mock.calls.map((c) => JSON.parse(c[0]));
    expect(sent.some((m) => m.type === "energy_update" && m.current === 47)).toBe(true);
  });

  it("returns tired response when energy is depleted", async () => {
    deps.userRepository = {
      consumeEnergy: vi.fn().mockReturnValue({
        userId: "user1",
        tier: "free",
        current: 0,
        max: 50,
        lastResetAt: new Date().toISOString(),
        consumed: 0,
        allowed: false,
      }),
    } as unknown as NonNullable<HandlerDeps["userRepository"]>;

    await handleMessage('{"version":1,"type":"chat","content":"hello"}', session, socket, deps);

    const sent = socket.send.mock.calls.map((c) => JSON.parse(c[0]));
    expect(sent.some((m) => m.type === "error" && m.code === "ENERGY_DEPLETED")).toBe(true);
    expect(sent.some((m) => m.type === "chat_response" && m.emotion === "tired")).toBe(true);
  });

  it("blocks chat when payment is required", async () => {
    const consumeEnergy = vi.fn();
    deps.userRepository = {
      consumeEnergy,
    } as unknown as NonNullable<HandlerDeps["userRepository"]>;
    deps.billingRepository = {
      getPaymentState: vi.fn().mockReturnValue({
        subscriptionStatus: "past_due",
        latestInvoiceStatus: "failed",
        requiresPayment: true,
      }),
    } as unknown as NonNullable<HandlerDeps["billingRepository"]>;

    await handleMessage('{"version":1,"type":"chat","content":"hello"}', session, socket, deps);

    const sent = socket.send.mock.calls.map((c) => JSON.parse(c[0]));
    expect(sent.some((m) => m.type === "error" && m.code === "PAYMENT_REQUIRED")).toBe(true);
    expect(consumeEnergy).not.toHaveBeenCalled();
  });

  it("records billing usage after successful chat", async () => {
    const recordUsage = vi.fn();
    deps.userRepository = {
      consumeEnergy: vi.fn().mockReturnValue({
        userId: "user1",
        tier: "free",
        current: 47,
        max: 50,
        lastResetAt: new Date().toISOString(),
        consumed: 3,
        allowed: true,
      }),
    } as unknown as NonNullable<HandlerDeps["userRepository"]>;
    deps.billingRepository = {
      getPaymentState: vi.fn().mockReturnValue({
        subscriptionStatus: "active",
        latestInvoiceStatus: "paid",
        requiresPayment: false,
      }),
      recordUsage,
    } as unknown as NonNullable<HandlerDeps["billingRepository"]>;

    await handleMessage('{"version":1,"type":"chat","content":"hello"}', session, socket, deps);

    expect(recordUsage).toHaveBeenCalledOnce();
    expect(recordUsage).toHaveBeenCalledWith("user1", "chat_energy_units", expect.any(Number), expect.any(String));
  });

  // --- Validation ---

  it("invalid JSON sends INVALID_MESSAGE error", async () => {
    await handleMessage("not json", session, socket, deps);
    const sent = JSON.parse(socket.send.mock.calls[0][0]);
    expect(sent.type).toBe("error");
    expect(sent.code).toBe("INVALID_MESSAGE");
  });

  it("missing type field sends INVALID_MESSAGE error", async () => {
    await handleMessage('{"version":1,"foo":"bar"}', session, socket, deps);
    const sent = JSON.parse(socket.send.mock.calls[0][0]);
    expect(sent.type).toBe("error");
    expect(sent.code).toBe("INVALID_MESSAGE");
  });

  it("chat without content sends INVALID_MESSAGE error", async () => {
    await handleMessage('{"version":1,"type":"chat"}', session, socket, deps);
    const sent = JSON.parse(socket.send.mock.calls[0][0]);
    expect(sent.type).toBe("error");
    expect(sent.code).toBe("INVALID_MESSAGE");
    expect(sent.message).toContain("content");
  });

  it("unknown message types are silently ignored (D12)", async () => {
    await handleMessage('{"version":1,"type":"future_unknown"}', session, socket, deps);
    expect(socket.send).not.toHaveBeenCalled();
  });

  // --- Error handling ---

  it("orchestrator error sends INTERNAL_ERROR to client", async () => {
    const orch = deps.orchestrator as unknown as ReturnType<typeof makeOrchestrator>;
    orch.process.mockRejectedValueOnce(new Error("LLM timeout"));

    await handleMessage('{"version":1,"type":"chat","content":"hi"}', session, socket, deps);
    const sent = socket.send.mock.calls
      .map((c) => JSON.parse(c[0]))
      .find((m) => m.type === "error");
    expect(sent).toBeDefined();
    expect(sent.code).toBe("INTERNAL_ERROR");
    expect(sent.message).toContain("LLM timeout");
  });

  it("does not send to closed socket", async () => {
    socket.readyState = 3; // CLOSED
    await handleMessage('{"version":1,"type":"ping"}', session, socket, deps);
    expect(socket.send).not.toHaveBeenCalled();
  });

  // --- REGRESSION: per-task requestId in queued lane processing ---

  it("two sequential chats on same lane get distinct requestIds in responses", async () => {
    const orch = deps.orchestrator as unknown as ReturnType<typeof makeOrchestrator>;

    // First orchestrator call: return a deferred promise so we can control timing
    let resolveFirst!: (v: OrchestratorResult) => void;
    const firstCall = new Promise<OrchestratorResult>((r) => { resolveFirst = r; });
    orch.process
      .mockReturnValueOnce(firstCall)
      .mockResolvedValueOnce({ content: "resp2", emotion: "happy" });

    // msg1 enters drainLane, blocks on orchestrator
    const p1 = handleMessage('{"version":1,"type":"chat","content":"msg1"}', session, socket, deps);

    // msg2 enqueues while lane is processing msg1 — does NOT call drainLane
    const p2 = handleMessage('{"version":1,"type":"chat","content":"msg2"}', session, socket, deps);

    // p2 resolves immediately (enqueue-only, no drain)
    const r2 = await p2;

    // Now unblock msg1's orchestrator call
    resolveFirst({ content: "resp1", emotion: "neutral" });

    // p1 resolves after processing msg1 AND draining msg2
    const r1 = await p1;

    // requestIds must be distinct
    expect(r1.requestId).not.toBe(r2.requestId);

    const chatResponses = socket.send.mock.calls
      .map((c) => JSON.parse(c[0]))
      .filter((m) => m.type === "chat_response");

    expect(chatResponses).toHaveLength(2);

    const sent1 = chatResponses[0];
    const sent2 = chatResponses[1];

    // Each response carries its OWN request's requestId
    expect(sent1.requestId).toBe(r1.requestId);
    expect(sent1.content).toBe("resp1");

    expect(sent2.requestId).toBe(r2.requestId);
    expect(sent2.content).toBe("resp2");
  });

  it("records observability metrics for success and failure", async () => {
    const recordChatSuccess = vi.fn();
    const recordChatFailure = vi.fn();
    deps.observability = {
      recordSessionCount: vi.fn(),
      recordChatSuccess,
      recordChatFailure,
      snapshot: vi.fn(),
    } as unknown as NonNullable<HandlerDeps["observability"]>;

    await handleMessage('{"version":1,"type":"chat","content":"ok"}', session, socket, deps);
    expect(recordChatSuccess).toHaveBeenCalledOnce();

    const orch = deps.orchestrator as unknown as ReturnType<typeof makeOrchestrator>;
    orch.process.mockRejectedValueOnce(new Error("boom"));
    await handleMessage('{"version":1,"type":"chat","content":"fail"}', session, socket, deps);
    expect(recordChatFailure).toHaveBeenCalledOnce();
  });

  it("emits trust_level and emotion_state events", async () => {
    await handleMessage('{"version":1,"type":"chat","content":"안녕"}', session, socket, deps);
    const sentTypes = socket.send.mock.calls.map((c) => JSON.parse(c[0]).type);
    expect(sentTypes).toContain("trust_level");
    expect(sentTypes).toContain("emotion_state");
  });

  it("injects memory context and emits memory_update on save", async () => {
    const memoryRepo = {
      semanticSearch: vi.fn().mockResolvedValue([
        {
          id: "m1",
          userId: "user1",
          characterId: "char1",
          type: "long_term",
          content: "User lives in Seoul",
          importance: 8,
          strength: 0.9,
          privacyTag: "#public",
          lastAccessedAt: null,
          archived: false,
          createdAt: new Date().toISOString(),
          similarity: 0.91,
        },
      ]),
      findById: vi.fn(),
      createAndIndex: vi.fn().mockImplementation(async (input: { type: string; content: string }) => ({
        id: nanoid(),
        userId: "user1",
        characterId: "char1",
        type: input.type,
        content: input.content,
        importance: 8,
        strength: 1,
        privacyTag: "#public",
        lastAccessedAt: null,
        archived: false,
        createdAt: new Date().toISOString(),
      } as Memory)),
    };

    deps.memoryRepository = memoryRepo as unknown as NonNullable<HandlerDeps["memoryRepository"]>;
    deps.memoryRenderer = {
      render: vi.fn().mockReturnValue("## Core Facts\n- User lives in Seoul"),
    } as unknown as NonNullable<HandlerDeps["memoryRenderer"]>;
    deps.historyStore = new Map();

    await handleMessage('{"version":1,"type":"chat","content":"내 이름은 민수야"}', session, socket, deps);

    const orch = deps.orchestrator as unknown as ReturnType<typeof makeOrchestrator>;
    const envelope = orch.process.mock.calls[0][0];
    expect(envelope.memoryContext.renderedMemory).toContain("Core Facts");
    expect(envelope.memoryContext.relevantMemories).toHaveLength(1);

    const sentTypes = socket.send.mock.calls.map((c) => JSON.parse(c[0]).type);
    expect(sentTypes).toContain("chat_response");
    expect(sentTypes).toContain("memory_update");
  });
});
