/**
 * Orchestrator — task processing pipeline.
 *
 * Converts TaskEnvelope → InferenceRequest, calls inference,
 * applies OOC post-filter, and logs latency metrics.
 */

import type { TaskEnvelope, InferenceResult, Emotion } from "@aivalink/shared";
import type {
  OrchestratorDeps,
  InferenceRequest,
  Logger,
  OocFilterHook,
  InferenceFn,
} from "./types";
import { buildPrompt } from "./prompt-builder";

export interface OrchestratorResult {
  content: string;
  emotion: Emotion;
}

const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

/** Default stub infer — returns empty content without throwing. */
const stubInfer: InferenceFn = async () => ({
  content: "",
  model: "stub",
  provider: "stub",
  tokenUsage: { input: 0, output: 0 },
  cost: 0,
  latency: 0,
});

export class Orchestrator {
  private readonly infer: InferenceFn;
  private readonly logger: Logger;
  private readonly oocFilter?: OocFilterHook;

  constructor(deps: OrchestratorDeps = {}) {
    this.infer = deps.infer ?? stubInfer;
    this.logger = deps.logger ?? noopLogger;
    this.oocFilter = deps.oocFilter;
  }

  /**
   * Process a TaskEnvelope through the full pipeline:
   * 1. Build prompt (persona + recent turns + current message)
   * 2. Call inference layer
   * 3. Apply OOC post-filter hook (if provided)
   * 4. Log processing latency metrics
   */
  async process(envelope: TaskEnvelope): Promise<OrchestratorResult> {
    const start = performance.now();

    // 1. Extract current user message
    const chatMessage = envelope.message as { content?: string };
    const userText = chatMessage?.content ?? "";

    // 2. Build prompt from persona + recent 10 turns + current message
    const messages = buildPrompt(
      envelope.persona,
      envelope.memoryContext,
      userText,
    );

    // 3. Create inference request from envelope
    const request: InferenceRequest = {
      messages,
      config: {
        maxTokens: envelope.resourceQuota.maxTokens,
        timeout: envelope.resourceQuota.timeout,
      },
    };

    // 4. Call inference layer
    const inferenceStart = performance.now();
    const result: InferenceResult = await this.infer(request);
    const inferenceLatencyMs = performance.now() - inferenceStart;

    this.logger.info("inference_complete", {
      inferenceLatencyMs,
      model: result.model,
      tokenUsage: result.tokenUsage,
    });

    // 5. Apply OOC post-filter hook
    let content = result.content;
    if (this.oocFilter) {
      content = await this.oocFilter(content);
    }

    // 6. Log total pipeline latency
    const totalLatencyMs = performance.now() - start;
    this.logger.info("pipeline_complete", {
      totalLatencyMs,
      inferenceLatencyMs,
    });

    return {
      content,
      emotion: result.emotion ?? "neutral",
    };
  }
}
