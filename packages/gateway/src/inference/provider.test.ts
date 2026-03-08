import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ProviderRegistry,
  isRetryableError,
  type InferenceProvider,
} from "./provider";
import { toClaudePrompt, toOpenAIPrompt } from "./prompt-adapter";
import type { InferenceConfig, InferenceResult } from "@aivalink/shared";

// --- Helpers ---

function makeConfig(
  overrides?: Partial<InferenceConfig>,
): InferenceConfig {
  return {
    tier: "standard",
    maxCost: 0.1,
    timeout: 30_000,
    streaming: false,
    personaPrompt: "You are a helpful assistant.",
    ...overrides,
  };
}

function makeResult(
  overrides?: Partial<InferenceResult>,
): InferenceResult {
  return {
    content: "test response",
    model: "test-model",
    provider: "test",
    tokenUsage: { input: 10, output: 20 },
    cost: 0.001,
    latency: 100,
    ...overrides,
  };
}

function makeMockProvider(
  name: string,
  result?: InferenceResult,
): InferenceProvider & {
  complete: ReturnType<typeof vi.fn>;
  healthCheck: ReturnType<typeof vi.fn>;
} {
  return {
    name,
    complete: vi
      .fn()
      .mockResolvedValue(result ?? makeResult({ provider: name })),
    completeStream: async function* () {
      yield { delta: "test", done: true };
    },
    healthCheck: vi.fn().mockResolvedValue(true),
  };
}

function make503Error(message = "Service Unavailable"): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = 503;
  return err;
}

function makeTimeoutError(): Error & { code: string } {
  const err = new Error("connect ETIMEDOUT") as Error & { code: string };
  err.code = "ETIMEDOUT";
  return err;
}

function makeNetworkError(): Error & { code: string } {
  const err = new Error("connect ECONNRESET") as Error & { code: string };
  err.code = "ECONNRESET";
  return err;
}

// ==================== isRetryableError ====================

describe("isRetryableError", () => {
  it("returns true for 503 status", () => {
    expect(isRetryableError(make503Error())).toBe(true);
  });

  it("returns true for 529 (Anthropic overloaded) status", () => {
    const err = new Error("Overloaded") as Error & { status: number };
    err.status = 529;
    expect(isRetryableError(err)).toBe(true);
  });

  it("returns true for ETIMEDOUT code", () => {
    expect(isRetryableError(makeTimeoutError())).toBe(true);
  });

  it("returns true for ECONNRESET code", () => {
    expect(isRetryableError(makeNetworkError())).toBe(true);
  });

  it("returns true for ECONNREFUSED code", () => {
    const err = new Error("refused") as Error & { code: string };
    err.code = "ECONNREFUSED";
    expect(isRetryableError(err)).toBe(true);
  });

  it("returns true for timeout in error message", () => {
    expect(isRetryableError(new Error("Request timeout after 30s"))).toBe(true);
  });

  it("returns true for overloaded_error type", () => {
    const err = new Error("overloaded") as Error & { type: string };
    err.type = "overloaded_error";
    expect(isRetryableError(err)).toBe(true);
  });

  it("returns false for 400 status", () => {
    const err = new Error("Bad Request") as Error & { status: number };
    err.status = 400;
    expect(isRetryableError(err)).toBe(false);
  });

  it("returns false for 401 status", () => {
    const err = new Error("Unauthorized") as Error & { status: number };
    err.status = 401;
    expect(isRetryableError(err)).toBe(false);
  });

  it("returns false for generic Error without codes", () => {
    expect(isRetryableError(new Error("Something broke"))).toBe(false);
  });

  it("returns false for non-Error values", () => {
    expect(isRetryableError("string error")).toBe(false);
    expect(isRetryableError(42)).toBe(false);
    expect(isRetryableError(null)).toBe(false);
  });
});

// ==================== ProviderRegistry — failover trigger ====================

describe("ProviderRegistry", () => {
  const msgs = [{ role: "user", content: "hello" }];
  const config = makeConfig();

  describe("failover trigger", () => {
    it("returns primary result when primary succeeds", async () => {
      const primary = makeMockProvider("claude");
      const fallback = makeMockProvider("openai");
      const registry = new ProviderRegistry();
      registry.register(primary, true);
      registry.register(fallback);

      const result = await registry.complete(msgs, config);
      expect(result.provider).toBe("claude");
      expect(primary.complete).toHaveBeenCalledOnce();
      expect(fallback.complete).not.toHaveBeenCalled();
    });

    it("fails over on retryable error (503)", async () => {
      const primary = makeMockProvider("claude");
      primary.complete.mockRejectedValueOnce(make503Error());
      const fallback = makeMockProvider("openai");
      const registry = new ProviderRegistry();
      registry.register(primary, true);
      registry.register(fallback);

      const result = await registry.complete(msgs, config);
      expect(result.provider).toBe("openai");
    });

    it("fails over on retryable error (ETIMEDOUT)", async () => {
      const primary = makeMockProvider("claude");
      primary.complete.mockRejectedValueOnce(makeTimeoutError());
      const fallback = makeMockProvider("openai");
      const registry = new ProviderRegistry();
      registry.register(primary, true);
      registry.register(fallback);

      const result = await registry.complete(msgs, config);
      expect(result.provider).toBe("openai");
    });

    it("fails over on retryable error (network reset)", async () => {
      const primary = makeMockProvider("claude");
      primary.complete.mockRejectedValueOnce(makeNetworkError());
      const fallback = makeMockProvider("openai");
      const registry = new ProviderRegistry();
      registry.register(primary, true);
      registry.register(fallback);

      const result = await registry.complete(msgs, config);
      expect(result.provider).toBe("openai");
    });

    it("does NOT fail over on non-retryable error (400)", async () => {
      const primary = makeMockProvider("claude");
      const err = new Error("Bad Request") as Error & { status: number };
      err.status = 400;
      primary.complete.mockRejectedValueOnce(err);
      const fallback = makeMockProvider("openai");
      const registry = new ProviderRegistry();
      registry.register(primary, true);
      registry.register(fallback);

      await expect(registry.complete(msgs, config)).rejects.toThrow(
        "Bad Request",
      );
      expect(fallback.complete).not.toHaveBeenCalled();
    });

    it("throws when all providers fail", async () => {
      const primary = makeMockProvider("claude");
      primary.complete.mockRejectedValueOnce(make503Error());
      const fallback = makeMockProvider("openai");
      fallback.complete.mockRejectedValueOnce(new Error("OpenAI down too"));
      const registry = new ProviderRegistry();
      registry.register(primary, true);
      registry.register(fallback);

      await expect(registry.complete(msgs, config)).rejects.toThrow(
        "Service Unavailable",
      );
    });

    it("throws when no provider is registered", async () => {
      const registry = new ProviderRegistry();
      await expect(registry.complete(msgs, config)).rejects.toThrow(
        "No provider registered",
      );
    });
  });

  // ==================== failover logging ====================

  describe("failover logging", () => {
    it("logs successful failover event", async () => {
      const primary = makeMockProvider("claude");
      primary.complete.mockRejectedValueOnce(make503Error());
      const fallback = makeMockProvider("openai");
      const registry = new ProviderRegistry();
      registry.register(primary, true);
      registry.register(fallback);

      await registry.complete(msgs, config);

      expect(registry.failoverLog).toHaveLength(1);
      const event = registry.failoverLog[0];
      expect(event.fromProvider).toBe("claude");
      expect(event.toProvider).toBe("openai");
      expect(event.success).toBe(true);
      expect(event.reason).toBe("Service Unavailable");
      expect(event.errorCode).toBe("503");
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    it("logs failed failover attempt", async () => {
      const primary = makeMockProvider("claude");
      primary.complete.mockRejectedValueOnce(make503Error());
      const fallback = makeMockProvider("openai");
      fallback.complete.mockRejectedValueOnce(new Error("also down"));
      const registry = new ProviderRegistry();
      registry.register(primary, true);
      registry.register(fallback);

      await expect(registry.complete(msgs, config)).rejects.toThrow();

      expect(registry.failoverLog).toHaveLength(1);
      expect(registry.failoverLog[0].success).toBe(false);
    });

    it("records ETIMEDOUT error code in event", async () => {
      const primary = makeMockProvider("claude");
      primary.complete.mockRejectedValueOnce(makeTimeoutError());
      const fallback = makeMockProvider("openai");
      const registry = new ProviderRegistry();
      registry.register(primary, true);
      registry.register(fallback);

      await registry.complete(msgs, config);

      expect(registry.failoverLog[0].errorCode).toBe("ETIMEDOUT");
    });

    it("does not log when primary succeeds", async () => {
      const primary = makeMockProvider("claude");
      const fallback = makeMockProvider("openai");
      const registry = new ProviderRegistry();
      registry.register(primary, true);
      registry.register(fallback);

      await registry.complete(msgs, config);

      expect(registry.failoverLog).toHaveLength(0);
    });
  });

  // ==================== recovery / backoff ====================

  describe("recovery and backoff", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("resets primary state on successful call after previous failure", async () => {
      const primary = makeMockProvider("claude");
      const fallback = makeMockProvider("openai");
      const registry = new ProviderRegistry({ cooldownMs: 100 });
      registry.register(primary, true);
      registry.register(fallback);

      // First call: primary fails → failover
      primary.complete.mockRejectedValueOnce(make503Error());
      await registry.complete(msgs, config);
      expect(registry.failoverLog).toHaveLength(1);

      // Advance past cooldown
      vi.advanceTimersByTime(150);

      // Second call: primary succeeds → state reset
      primary.complete.mockResolvedValueOnce(
        makeResult({ provider: "claude" }),
      );
      const result = await registry.complete(msgs, config);
      expect(result.provider).toBe("claude");

      // Third call: primary works again (state was reset)
      primary.complete.mockResolvedValueOnce(
        makeResult({ provider: "claude" }),
      );
      const result2 = await registry.complete(msgs, config);
      expect(result2.provider).toBe("claude");
    });

    it("skips primary during cooldown and uses failover directly", async () => {
      const primary = makeMockProvider("claude");
      const fallback = makeMockProvider("openai");
      const registry = new ProviderRegistry({ cooldownMs: 60_000 });
      registry.register(primary, true);
      registry.register(fallback);

      // Primary fails → enters cooldown
      primary.complete.mockRejectedValueOnce(make503Error());
      await registry.complete(msgs, config);

      // Health check returns false during cooldown
      primary.healthCheck.mockResolvedValueOnce(false);

      // Advance only 1s (within 60s cooldown)
      vi.advanceTimersByTime(1_000);

      // Next call: primary should be skipped (health check fails)
      const result = await registry.complete(msgs, config);
      expect(result.provider).toBe("openai");
      // primary.complete should NOT have been called for second request
      // (first call = 1 from initial fail, second call should be 0 additional)
      expect(primary.complete).toHaveBeenCalledTimes(1);
    });

    it("retries primary after cooldown expires", async () => {
      const primary = makeMockProvider("claude");
      const fallback = makeMockProvider("openai");
      const registry = new ProviderRegistry({ cooldownMs: 100 });
      registry.register(primary, true);
      registry.register(fallback);

      // Primary fails → enters cooldown
      primary.complete.mockRejectedValueOnce(make503Error());
      await registry.complete(msgs, config);
      expect(fallback.complete).toHaveBeenCalledTimes(1);

      // Advance past cooldown
      vi.advanceTimersByTime(150);

      // Primary now succeeds
      primary.complete.mockResolvedValueOnce(
        makeResult({ provider: "claude" }),
      );
      const result = await registry.complete(msgs, config);
      expect(result.provider).toBe("claude");
    });

    it("recovers primary via health check during cooldown", async () => {
      const primary = makeMockProvider("claude");
      const fallback = makeMockProvider("openai");
      const registry = new ProviderRegistry({ cooldownMs: 60_000 });
      registry.register(primary, true);
      registry.register(fallback);

      // Primary fails → enters cooldown
      primary.complete.mockRejectedValueOnce(make503Error());
      await registry.complete(msgs, config);

      // Only 1s into 60s cooldown — still cooling down
      vi.advanceTimersByTime(1_000);

      // Health check passes → primary recovered
      primary.healthCheck.mockResolvedValueOnce(true);
      primary.complete.mockResolvedValueOnce(
        makeResult({ provider: "claude" }),
      );

      const result = await registry.complete(msgs, config);
      expect(result.provider).toBe("claude");
      expect(primary.healthCheck).toHaveBeenCalled();
    });

    it("stays on failover when health check throws", async () => {
      const primary = makeMockProvider("claude");
      const fallback = makeMockProvider("openai");
      const registry = new ProviderRegistry({ cooldownMs: 60_000 });
      registry.register(primary, true);
      registry.register(fallback);

      // Primary fails → enters cooldown
      primary.complete.mockRejectedValueOnce(make503Error());
      await registry.complete(msgs, config);

      vi.advanceTimersByTime(1_000);

      // Health check throws
      primary.healthCheck.mockRejectedValueOnce(new Error("unreachable"));

      const result = await registry.complete(msgs, config);
      expect(result.provider).toBe("openai");
    });
  });
});

// ==================== Prompt Adapter ====================

describe("Prompt Adapter", () => {
  describe("toClaudePrompt", () => {
    it("separates system prompt from messages", () => {
      const messages = [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi there" },
      ];
      const result = toClaudePrompt(messages, "You are helpful.");

      expect(result.system).toBe("You are helpful.");
      expect(result.messages).toEqual([
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi there" },
      ]);
    });

    it("merges inline system messages into system field", () => {
      const messages = [
        { role: "system", content: "Extra context." },
        { role: "user", content: "hello" },
      ];
      const result = toClaudePrompt(messages, "Base prompt.");

      expect(result.system).toBe("Base prompt.\n\nExtra context.");
      expect(result.messages).toEqual([{ role: "user", content: "hello" }]);
    });

    it("filters out empty system prompt parts", () => {
      const messages = [{ role: "user", content: "hello" }];
      const result = toClaudePrompt(messages, "");

      expect(result.system).toBe("");
      expect(result.messages).toEqual([{ role: "user", content: "hello" }]);
    });

    it("preserves user/assistant message order", () => {
      const messages = [
        { role: "user", content: "1" },
        { role: "assistant", content: "2" },
        { role: "user", content: "3" },
      ];
      const result = toClaudePrompt(messages, "sys");

      expect(result.messages.map((m) => m.content)).toEqual(["1", "2", "3"]);
    });
  });

  describe("toOpenAIPrompt", () => {
    it("prepends system prompt as system message", () => {
      const messages = [{ role: "user", content: "hello" }];
      const result = toOpenAIPrompt(messages, "You are helpful.");

      expect(result.messages).toEqual([
        { role: "system", content: "You are helpful." },
        { role: "user", content: "hello" },
      ]);
    });

    it("preserves all messages including inline system", () => {
      const messages = [
        { role: "system", content: "Extra" },
        { role: "user", content: "hello" },
      ];
      const result = toOpenAIPrompt(messages, "Base prompt.");

      expect(result.messages).toEqual([
        { role: "system", content: "Base prompt." },
        { role: "system", content: "Extra" },
        { role: "user", content: "hello" },
      ]);
    });

    it("omits system message when prompt is empty", () => {
      const messages = [{ role: "user", content: "hello" }];
      const result = toOpenAIPrompt(messages, "");

      expect(result.messages).toEqual([{ role: "user", content: "hello" }]);
    });

    it("preserves message order", () => {
      const messages = [
        { role: "user", content: "1" },
        { role: "assistant", content: "2" },
        { role: "user", content: "3" },
      ];
      const result = toOpenAIPrompt(messages, "sys");

      expect(result.messages).toHaveLength(4); // sys + 3
      expect(result.messages[0].role).toBe("system");
      expect(result.messages.slice(1).map((m) => m.content)).toEqual([
        "1",
        "2",
        "3",
      ]);
    });
  });
});
