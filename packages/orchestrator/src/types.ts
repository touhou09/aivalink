/**
 * Orchestrator-local types for the task processing pipeline.
 */

import type { InferenceResult } from "@aivalink/shared";

/** A single message in the inference prompt. */
export interface PromptMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Request sent to the inference layer. */
export interface InferenceRequest {
  messages: PromptMessage[];
  config: {
    maxTokens: number;
    timeout: number;
  };
}

/** Injectable inference function. */
export type InferenceFn = (request: InferenceRequest) => Promise<InferenceResult>;

/** OOC post-filter hook — can rewrite assistant content after inference. */
export type OocFilterHook = (content: string) => Promise<string> | string;

/** Injectable logger interface for processing metrics. */
export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/** Dependencies injected into the Orchestrator constructor. */
export interface OrchestratorDeps {
  infer?: InferenceFn;
  logger?: Logger;
  oocFilter?: OocFilterHook;
}
