/**
 * AI-Service Inference Adapter
 * Routes completions through the centralized ai-service HTTP API
 * instead of calling LLM providers directly.
 */

import type { InferenceConfig, InferenceResult, Emotion } from "@aivalink/shared";
import type { InferenceProvider } from "./provider";

const AI_SERVICE_URL =
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.AIVA_AI_SERVICE_URL ?? "http://127.0.0.1:8000";

interface ChatRequest {
  messages: Array<{ role: string; content: string }>;
  provider: "claude" | "openai";
  tier: "lite" | "standard" | "premium";
  persona_prompt: string | null;
  max_tokens: number;
}

interface ChatResponse {
  content: string;
  model: string;
  provider: string;
  token_usage: { input: number; output: number };
  cost: number;
  latency_ms: number;
  emotion?: string;
}

export class AiServiceProvider implements InferenceProvider {
  readonly name = "ai-service";
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? AI_SERVICE_URL;
  }

  async complete(
    messages: Array<{ role: string; content: string }>,
    config: InferenceConfig,
  ): Promise<InferenceResult> {
    const body: ChatRequest = {
      messages,
      provider: "claude",
      tier: config.tier,
      persona_prompt: config.personaPrompt ?? null,
      max_tokens: 4096,
    };

    const start = Date.now();
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: config.timeout
        ? AbortSignal.timeout(config.timeout)
        : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      const err = new Error(`ai-service error ${res.status}: ${text}`) as Error & { status: number };
      err.status = res.status;
      throw err;
    }

    const data = (await res.json()) as ChatResponse;
    const latency = Date.now() - start;

    return {
      content: data.content,
      model: data.model,
      provider: this.name,
      tokenUsage: {
        input: data.token_usage.input,
        output: data.token_usage.output,
      },
      cost: data.cost,
      latency,
      emotion: (data.emotion as Emotion | undefined) ?? "neutral",
    };
  }

  async *completeStream(
    messages: Array<{ role: string; content: string }>,
    config: InferenceConfig,
  ): AsyncIterable<{ delta: string; done: boolean }> {
    // ai-service does not support streaming yet; wrap non-streaming call
    const result = await this.complete(messages, config);
    yield { delta: result.content, done: true };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }
}

export function createAiServiceProvider(baseUrl?: string): AiServiceProvider {
  return new AiServiceProvider(baseUrl);
}
