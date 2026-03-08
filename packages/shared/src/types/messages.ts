/**
 * AIVA WebSocket Message Types
 * Decision D12: version field + tolerant reader pattern
 */

// === Enums & Basic Types ===

export type Emotion =
  | "happy"
  | "sad"
  | "angry"
  | "surprised"
  | "neutral"
  | "thinking"
  | "embarrassed"
  | "excited"
  | "tired";

export type Tier = "free" | "plus" | "pro" | "enterprise";
export type TrustLevel = "stranger" | "acquaintance" | "friend" | "close_friend";
export type MessageRole = "user" | "assistant" | "system";

export interface Attachment {
  type: "image" | "file" | "code";
  url: string;
  mimeType: string;
  size: number;
}

export interface CharacterConfig {
  name: string;
  personaPrompt: string;
  live2dModel: string;
  ttsEngine: string;
  ttsConfig: Record<string, unknown>;
  emotionMap: Record<Emotion, string>;
}

export interface DagNode {
  id: string;
  parentId: string | null;
  agentRole: string;
  status: "pending" | "running" | "completed" | "failed";
  instruction: string;
  result?: string;
}

export interface ApprovalAction {
  type: string;
  target: string;
  description: string;
  risk: "low" | "medium" | "high";
}

export type ErrorCode =
  | "AUTH_REQUIRED"
  | "AUTH_EXPIRED"
  | "RATE_LIMITED"
  | "ENERGY_DEPLETED"
  | "PAYMENT_REQUIRED"
  | "PROVIDER_ERROR"
  | "INTERNAL_ERROR"
  | "INVALID_MESSAGE";

// === WebSocket Messages ===

interface BaseMessage {
  version: 1;
  timestamp: string; // ISO 8601
}

// Client → Server
export type ClientMessage = BaseMessage &
  (
    | { type: "chat"; content: string; attachments?: Attachment[] }
    | { type: "task_request"; intent: string; context?: Record<string, unknown> }
    | { type: "exec_approval_response"; taskId: string; approved: boolean }
    | { type: "cancel_task"; taskId: string }
    | { type: "character_update"; changes: Partial<CharacterConfig> }
    | { type: "ping" }
  );

// Server → Client
export type ServerMessage = BaseMessage &
  (
    | { type: "chat_response"; content: string; emotion: Emotion; streaming: boolean }
    | { type: "chat_chunk"; delta: string; emotion?: Emotion; done: boolean }
    | { type: "emotion_state"; emotion: Emotion; previousEmotion?: Emotion }
    | { type: "trust_level"; trustLevel: TrustLevel; conversationCount: number }
    | { type: "task_progress"; taskId: string; dag: DagNode[]; currentNode: string }
    | {
        type: "exec_approval_request";
        taskId: string;
        action: ApprovalAction;
        description: string;
      }
    | { type: "memory_update"; memoryType: "daily" | "longterm"; summary: string }
    | { type: "energy_update"; current: number; max: number; tier: Tier }
    | { type: "error"; code: ErrorCode; message: string; recoverable: boolean }
    | { type: "pong" }
  );
