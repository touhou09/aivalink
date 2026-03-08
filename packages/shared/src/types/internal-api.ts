/**
 * Gateway ↔ FastAPI AI Service Internal API Types
 * Decision O3: Node.js + FastAPI dual architecture
 */

import type { Emotion } from "./messages";

// POST /api/pii/scrub
export interface PiiScrubRequest {
  text: string;
  language: "ko" | "en";
}

export interface PiiEntity {
  type: string;
  original: string;
  replacement: string;
  start: number;
  end: number;
}

export interface PiiScrubResponse {
  scrubbed: string;
  entities: PiiEntity[];
}

// POST /api/embedding/generate
export interface EmbeddingRequest {
  text: string;
  model?: string; // default: text-embedding-3-small
}

export interface EmbeddingResponse {
  embedding: number[];
  dimensions: number;
  tokenCount: number;
}

// POST /api/embedding/batch
export interface BatchEmbeddingRequest {
  texts: string[];
  model?: string;
}

export interface BatchEmbeddingResponse {
  embeddings: number[][];
  dimensions: number;
  totalTokens: number;
}

// POST /api/emotion/classify
export interface EmotionClassifyRequest {
  text: string;
  personaContext?: string;
}

export interface EmotionClassifyResponse {
  emotion: Emotion;
  confidence: number;
  oocDetected: boolean;
  oocReason?: string;
}

// === Inference Layer Types (D5) ===

export interface InferenceConfig {
  tier: "lite" | "standard" | "premium";
  maxCost: number;
  timeout: number;
  streaming: boolean;
  personaPrompt: string;
  tools?: ToolDefinition[];
}

export interface InferenceResult {
  content: string;
  model: string;
  provider: string;
  tokenUsage: { input: number; output: number };
  cost: number;
  latency: number;
  emotion?: Emotion;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

// === Orchestrator Internal Types ===

export interface TaskEnvelope {
  sessionId: string;
  userId: string;
  characterId: string;
  message: unknown; // ClientMessage
  persona: PersonaSnapshot;
  memoryContext: MemoryContext;
  resourceQuota: ResourceQuota;
}

export interface PersonaSnapshot {
  name: string;
  personaPrompt: string;
  emotionMap: Record<string, string>;
  heartbeat: Record<string, unknown>;
}

export interface MemoryContext {
  renderedMemory: string; // MEMORY.md dynamic rendering (D11)
  recentMessages: Array<{ role: string; content: string }>;
  relevantMemories: Array<{ content: string; importance: number; similarity: number }>;
}

export interface ResourceQuota {
  maxTokens: number;
  maxCost: number;
  timeout: number;
  energyAvailable: number;
}

export interface SubTaskAssignment {
  taskId: string;
  parentTaskId: string;
  agentRole: "coder" | "analyst" | "pm" | "review" | "viewer";
  instruction: string;
  toolPolicy: { allow: string[]; deny: string[] };
  timeout: number;
  memoryAccess: "full" | "summary_only" | "none";
}
