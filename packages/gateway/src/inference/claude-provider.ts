/**
 * Claude (Anthropic) Inference Provider
 * Decision D5: Claude Sonnet as primary provider
 */

import Anthropic from "@anthropic-ai/sdk";
import type { InferenceConfig, InferenceResult } from "@aivalink/shared";
import type { InferenceProvider } from "./provider";
import { toClaudePrompt } from "./prompt-adapter";

const TIER_MODELS: Record<string, string> = {
  lite: "claude-haiku-4-5-20251001",
  standard: "claude-sonnet-4-20250514",
  premium: "claude-opus-4-20250514",
};

const COST_PER_MILLION: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4.0 },
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
  "claude-opus-4-20250514": { input: 15.0, output: 75.0 },
};

export class ClaudeProvider implements InferenceProvider {
  readonly name = "claude";
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
  }

  async complete(
    messages: Array<{ role: string; content: string }>,
    config: InferenceConfig,
  ): Promise<InferenceResult> {
    const model = TIER_MODELS[config.tier] ?? TIER_MODELS.standard;
    const prompt = toClaudePrompt(messages, config.personaPrompt);
    const start = Date.now();

    const response = await this.client.messages.create({
      model,
      max_tokens: 4096,
      system: prompt.system,
      messages: prompt.messages,
    });

    const latency = Date.now() - start;
    const content = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const rate = COST_PER_MILLION[model] ?? COST_PER_MILLION["claude-sonnet-4-20250514"];
    const cost =
      (response.usage.input_tokens * rate.input +
        response.usage.output_tokens * rate.output) /
      1_000_000;

    return {
      content,
      model: response.model,
      provider: this.name,
      tokenUsage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
      cost,
      latency,
    };
  }

  async *completeStream(
    messages: Array<{ role: string; content: string }>,
    config: InferenceConfig,
  ): AsyncIterable<{ delta: string; done: boolean }> {
    const result = await this.complete(messages, config);
    yield { delta: result.content, done: true };
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      });
      return true;
    } catch {
      return false;
    }
  }
}
