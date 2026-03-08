import { describe, it, expect, vi } from "vitest";
import { Orchestrator } from "../orchestrator";
import type { TaskEnvelope, InferenceResult } from "@aivalink/shared";
import type { InferenceFn, Logger, OocFilterHook } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEnvelope(overrides?: Partial<TaskEnvelope>): TaskEnvelope {
  return {
    sessionId: "sess-1",
    userId: "user-1",
    characterId: "char-1",
    message: { content: "Hello" },
    persona: {
      name: "Aria",
      personaPrompt: "You are Aria.",
      emotionMap: {},
      heartbeat: {},
    },
    memoryContext: {
      renderedMemory: "",
      recentMessages: [],
      relevantMemories: [],
    },
    resourceQuota: {
      maxTokens: 1024,
      maxCost: 0.01,
      timeout: 5000,
      energyAvailable: 100,
    },
    ...overrides,
  };
}

function makeInferenceResult(overrides?: Partial<InferenceResult>): InferenceResult {
  return {
    content: "Hi there!",
    model: "gpt-4",
    provider: "openai",
    tokenUsage: { input: 10, output: 5 },
    cost: 0.001,
    latency: 120,
    emotion: "happy",
    ...overrides,
  };
}

function mockInfer(result?: Partial<InferenceResult>): InferenceFn {
  return vi.fn<InferenceFn>().mockResolvedValue(makeInferenceResult(result));
}

function mockLogger(): Logger & {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
} {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Orchestrator.process", () => {
  it("converts TaskEnvelope to InferenceRequest and returns result", async () => {
    const infer = mockInfer({ content: "Response text", emotion: "happy" });
    const orchestrator = new Orchestrator({ infer });

    const result = await orchestrator.process(makeEnvelope());

    expect(result.content).toBe("Response text");
    expect(result.emotion).toBe("happy");
    expect(infer).toHaveBeenCalledOnce();
  });

  it("passes correct config from resourceQuota", async () => {
    const infer = mockInfer();
    const orchestrator = new Orchestrator({ infer });
    const envelope = makeEnvelope({
      resourceQuota: { maxTokens: 2048, maxCost: 0.05, timeout: 10000, energyAvailable: 50 },
    });

    await orchestrator.process(envelope);

    const request = (infer as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(request.config).toEqual({ maxTokens: 2048, timeout: 10000 });
  });

  it("builds prompt messages from persona + history + current message", async () => {
    const infer = mockInfer();
    const orchestrator = new Orchestrator({ infer });
    const envelope = makeEnvelope({
      message: { content: "What's up?" },
      persona: {
        name: "Aria",
        personaPrompt: "System prompt.",
        emotionMap: {},
        heartbeat: {},
      },
      memoryContext: {
        renderedMemory: "",
        recentMessages: [
          { role: "user", content: "Hi" },
          { role: "assistant", content: "Hello!" },
        ],
        relevantMemories: [],
      },
    });

    await orchestrator.process(envelope);

    const request = (infer as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(request.messages).toEqual([
      { role: "system", content: "System prompt." },
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello!" },
      { role: "user", content: "What's up?" },
    ]);
  });

  it("defaults emotion to neutral when inference returns none", async () => {
    const infer = mockInfer({ emotion: undefined });
    const orchestrator = new Orchestrator({ infer });

    const result = await orchestrator.process(makeEnvelope());

    expect(result.emotion).toBe("neutral");
  });

  it("handles missing message content gracefully", async () => {
    const infer = mockInfer();
    const orchestrator = new Orchestrator({ infer });
    const envelope = makeEnvelope({ message: {} });

    await orchestrator.process(envelope);

    const request = (infer as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const lastMessage = request.messages[request.messages.length - 1];
    expect(lastMessage).toEqual({ role: "user", content: "" });
  });
});

describe("OOC post-filter hook", () => {
  it("rewrites content when oocFilter is provided", async () => {
    const infer = mockInfer({ content: "I am an AI model, hello!" });
    const oocFilter: OocFilterHook = (content) =>
      content.replace("I am an AI model, ", "");
    const orchestrator = new Orchestrator({ infer, oocFilter });

    const result = await orchestrator.process(makeEnvelope());

    expect(result.content).toBe("hello!");
  });

  it("supports async oocFilter", async () => {
    const infer = mockInfer({ content: "raw output" });
    const oocFilter: OocFilterHook = async (content) => `filtered: ${content}`;
    const orchestrator = new Orchestrator({ infer, oocFilter });

    const result = await orchestrator.process(makeEnvelope());

    expect(result.content).toBe("filtered: raw output");
  });

  it("does not modify content when no oocFilter is provided", async () => {
    const infer = mockInfer({ content: "original content" });
    const orchestrator = new Orchestrator({ infer });

    const result = await orchestrator.process(makeEnvelope());

    expect(result.content).toBe("original content");
  });

  it("receives the raw inference content, not modified", async () => {
    const oocFilter = vi.fn<OocFilterHook>().mockReturnValue("replaced");
    const infer = mockInfer({ content: "raw from LLM" });
    const orchestrator = new Orchestrator({ infer, oocFilter });

    await orchestrator.process(makeEnvelope());

    expect(oocFilter).toHaveBeenCalledWith("raw from LLM");
  });
});

describe("metric logging", () => {
  it("logs inference_complete with latency and model info", async () => {
    const logger = mockLogger();
    const infer = mockInfer({ model: "gpt-4", tokenUsage: { input: 50, output: 20 } });
    const orchestrator = new Orchestrator({ infer, logger });

    await orchestrator.process(makeEnvelope());

    expect(logger.info).toHaveBeenCalledWith(
      "inference_complete",
      expect.objectContaining({
        inferenceLatencyMs: expect.any(Number),
        model: "gpt-4",
        tokenUsage: { input: 50, output: 20 },
      }),
    );
  });

  it("logs pipeline_complete with total and inference latency", async () => {
    const logger = mockLogger();
    const infer = mockInfer();
    const orchestrator = new Orchestrator({ infer, logger });

    await orchestrator.process(makeEnvelope());

    expect(logger.info).toHaveBeenCalledWith(
      "pipeline_complete",
      expect.objectContaining({
        totalLatencyMs: expect.any(Number),
        inferenceLatencyMs: expect.any(Number),
      }),
    );
  });

  it("reports totalLatencyMs >= inferenceLatencyMs", async () => {
    const logger = mockLogger();
    const infer = mockInfer();
    const orchestrator = new Orchestrator({ infer, logger });

    await orchestrator.process(makeEnvelope());

    const pipelineCall = (logger.info as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) => call[0] === "pipeline_complete",
    );
    const meta = pipelineCall![1] as { totalLatencyMs: number; inferenceLatencyMs: number };
    expect(meta.totalLatencyMs).toBeGreaterThanOrEqual(meta.inferenceLatencyMs);
  });

  it("does not throw when no logger is provided", async () => {
    const infer = mockInfer();
    const orchestrator = new Orchestrator({ infer });

    await expect(orchestrator.process(makeEnvelope())).resolves.not.toThrow();
  });
});

describe("backward compatibility — no-arg constructor", () => {
  it("new Orchestrator() does not throw", () => {
    expect(() => new Orchestrator()).not.toThrow();
  });

  it("new Orchestrator({}) does not throw", () => {
    expect(() => new Orchestrator({})).not.toThrow();
  });

  it("stub infer returns empty content and neutral emotion", async () => {
    const orchestrator = new Orchestrator();
    const result = await orchestrator.process(makeEnvelope());

    expect(result.content).toBe("");
    expect(result.emotion).toBe("neutral");
  });
});

describe("infer rejection behavior", () => {
  it("propagates inference rejection as-is", async () => {
    const failing: InferenceFn = () => Promise.reject(new Error("model timeout"));
    const orchestrator = new Orchestrator({ infer: failing });

    await expect(orchestrator.process(makeEnvelope())).rejects.toThrow("model timeout");
  });

  it("propagates non-Error rejections", async () => {
    const failing: InferenceFn = () => Promise.reject("string error");
    const orchestrator = new Orchestrator({ infer: failing });

    await expect(orchestrator.process(makeEnvelope())).rejects.toBe("string error");
  });
});

describe("oocFilter throw behavior", () => {
  it("propagates synchronous oocFilter errors", async () => {
    const infer = mockInfer({ content: "ok" });
    const oocFilter: OocFilterHook = () => {
      throw new Error("filter exploded");
    };
    const orchestrator = new Orchestrator({ infer, oocFilter });

    await expect(orchestrator.process(makeEnvelope())).rejects.toThrow("filter exploded");
  });

  it("propagates async oocFilter rejections", async () => {
    const infer = mockInfer({ content: "ok" });
    const oocFilter: OocFilterHook = async () => {
      throw new Error("async filter failed");
    };
    const orchestrator = new Orchestrator({ infer, oocFilter });

    await expect(orchestrator.process(makeEnvelope())).rejects.toThrow("async filter failed");
  });
});
