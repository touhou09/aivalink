/**
 * Orchestrator — task processing pipeline
 * Phase 1: Sequential TaskEnvelope → InferenceResult pipeline
 */

export { Orchestrator } from "./orchestrator";
export type { OrchestratorResult } from "./orchestrator";

export { buildPrompt, MAX_RECENT_TURNS } from "./prompt-builder";

export type {
  PromptMessage,
  InferenceRequest,
  InferenceFn,
  OocFilterHook,
  Logger,
  OrchestratorDeps,
} from "./types";

export { buildWorkflowTemplate, transitionWorkflow } from "./workflows";
export type {
  WorkflowTemplateType,
  WorkflowTemplate,
  WorkflowStep,
  WorkflowState,
  WorkflowEvent,
  BuildWorkflowInput,
} from "./workflows";
