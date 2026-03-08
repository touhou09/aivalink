/**
 * OpenAI (GPT-4o) Inference Provider
 * Decision D5: GPT-4o as failover provider
 */

import OpenAI from "openai";
import type { InferenceConfig, InferenceResult } from "@aivalink/shared";
import type { InferenceProvider } from "./provider";
import { toOpenAIPrompt } from "./prompt-adapter";

const TIER_MODELS: Record<string, string> = {
  lite: "gpt-4o-mini",
  standard: "gpt-4o",
  premium: "gpt-4o",
};

const COST_PER_MILLION: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10.0 },
};

export class OpenAIProvider implements InferenceProvider {
  readonly name = "openai";
  private client: OpenAI;

  constructor(apiKey?: string) {
    this.client = new OpenAI({
      apiKey: apiKey ?? process.env.OPENAI_API_KEY,
    });
  }

  async complete(
    messages: Array<{ role: string; content: string }>,
    config: InferenceConfig,
  ): Promise<InferenceResult> {
    const model = TIER_MODELS[config.tier] ?? TIER_MODELS.standard;
    const prompt = toOpenAIPrompt(messages, config.personaPrompt);
    const start = Date.now();

    const response = await this.client.chat.completions.create({
      model,
      messages: prompt.messages,
      max_tokens: 4096,
    });

    const latency = Date.now() - start;
    const choice = response.choices[0];
    const rate = COST_PER_MILLION[model] ?? COST_PER_MILLION["gpt-4o"];
    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;
    const cost =
      (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000;

    return {
      content: choice?.message?.content ?? "",
      model: response.model,
      provider: this.name,
      tokenUsage: { input: inputTokens, output: outputTokens },
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
      await this.client.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      });
      return true;
    } catch {
      return false;
    }
  }
}
