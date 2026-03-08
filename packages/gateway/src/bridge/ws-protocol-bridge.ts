import type { DagNode, Emotion, ServerMessage, ClientMessage } from "@aivalink/shared";

// ── VTuber Protocol ──────────────────────────────────────────────────────────

export type VTuberMessage =
  | { type: "speak"; text: string; emotion: string; motion?: string }
  | { type: "emotion_change"; emotion: string; intensity: number }
  | { type: "idle_motion"; motion: string }
  | { type: "lip_sync_start"; duration: number }
  | { type: "lip_sync_stop" }
  | { type: "status"; state: "ready" | "speaking" | "idle" };

// ── GoClaw Protocol (JSON-RPC v2) ────────────────────────────────────────────

export type GoClawMessage =
  | { jsonrpc: "2.0"; method: string; params: Record<string, unknown>; id: string }
  | { jsonrpc: "2.0"; result: unknown; id: string }
  | { jsonrpc: "2.0"; error: { code: number; message: string }; id: string };

// ── Bridge Core ───────────────────────────────────────────────────────────────

export type ProtocolType = "aiva" | "vtuber" | "goclaw";

export interface BridgeRoute {
  from: ProtocolType;
  to: ProtocolType;
  /** The message type discriminant from the source protocol */
  messageType: string;
  /** Return null to drop the message */
  transform: (msg: unknown) => unknown | null;
}

// Emotion intensity mapping: how "strong" each Aiva emotion is (0–1)
const EMOTION_INTENSITY: Record<Emotion, number> = {
  happy: 0.8,
  excited: 1.0,
  sad: 0.7,
  angry: 0.9,
  surprised: 0.85,
  embarrassed: 0.6,
  thinking: 0.4,
  tired: 0.3,
  neutral: 0.5,
};

function getIntensity(emotion: string): number {
  return EMOTION_INTENSITY[emotion as Emotion] ?? 0.5;
}

// ── Default Route Implementations ─────────────────────────────────────────────

/**
 * Aiva chat_response → VTuber speak
 * Extracts text and emotion from a ServerMessage of type "chat_response".
 */
function aivaToVtuberSpeak(msg: unknown): VTuberMessage | null {
  const m = msg as ServerMessage & { type: "chat_response" };
  if (!m || typeof m.content !== "string") return null;
  return {
    type: "speak",
    text: m.content,
    emotion: m.emotion ?? "neutral",
  };
}

/**
 * Aiva emotion_state → VTuber emotion_change
 */
function aivaToVtuberEmotionChange(msg: unknown): VTuberMessage | null {
  const m = msg as ServerMessage & { type: "emotion_state" };
  if (!m || typeof m.emotion !== "string") return null;
  return {
    type: "emotion_change",
    emotion: m.emotion,
    intensity: getIntensity(m.emotion),
  };
}

/**
 * VTuber status → Aiva: log only, no translated message.
 */
function vtuberStatusToAiva(msg: unknown): null {
  const m = msg as VTuberMessage & { type: "status" };
  console.log(`[WsProtocolBridge] VTuber status: ${m?.state}`);
  return null;
}

/**
 * Aiva task_request → GoClaw execute_task (JSON-RPC)
 */
function aivaToGoClawExecuteTask(msg: unknown): GoClawMessage | null {
  const m = msg as ClientMessage & { type: "task_request" };
  if (!m || typeof m.intent !== "string") return null;
  return {
    jsonrpc: "2.0",
    method: "execute_task",
    params: {
      intent: m.intent,
      context: m.context ?? {},
    },
    id: `task-${Date.now()}`,
  };
}

/**
 * GoClaw JSON-RPC result → Aiva task_progress
 * Only translates response objects that carry a result (not error responses).
 */
function goClawResultToAiva(msg: unknown): ServerMessage | null {
  const m = msg as Record<string, unknown>;
  if (!m || m.jsonrpc !== "2.0" || !("result" in m)) return null;

  const result = m.result as Record<string, unknown> | null;
  const taskId = typeof m.id === "string" ? m.id : "unknown";

  return {
    version: 1,
    timestamp: new Date().toISOString(),
    type: "task_progress",
    taskId,
    dag: Array.isArray(result?.dag) ? (result.dag as DagNode[]) : [],
    currentNode: typeof result?.currentNode === "string" ? result.currentNode : "",
  } as ServerMessage & { type: "task_progress" };
}

// ── WsProtocolBridge ──────────────────────────────────────────────────────────

export class WsProtocolBridge {
  private routes: BridgeRoute[] = [];

  constructor() {}

  /** Register a translation route. */
  addRoute(route: BridgeRoute): void {
    this.routes.push(route);
  }

  /**
   * Register all default Aiva↔VTuber and Aiva↔GoClaw routes.
   * Safe to call multiple times (routes are additive, not replaced).
   */
  registerDefaults(): void {
    this.addRoute({
      from: "aiva",
      to: "vtuber",
      messageType: "chat_response",
      transform: aivaToVtuberSpeak,
    });

    this.addRoute({
      from: "aiva",
      to: "vtuber",
      messageType: "emotion_state",
      transform: aivaToVtuberEmotionChange,
    });

    this.addRoute({
      from: "vtuber",
      to: "aiva",
      messageType: "status",
      transform: vtuberStatusToAiva,
    });

    this.addRoute({
      from: "aiva",
      to: "goclaw",
      messageType: "task_request",
      transform: aivaToGoClawExecuteTask,
    });

    this.addRoute({
      from: "goclaw",
      to: "aiva",
      messageType: "result",
      transform: goClawResultToAiva,
    });
  }

  /**
   * Translate a message from one protocol to another.
   *
   * The message type is detected from:
   * - Aiva / VTuber: `(msg as any).type`
   * - GoClaw: presence of `method` → "request", `result` → "result", `error` → "error"
   *
   * Returns null when no matching route is found or the transform drops the message.
   */
  translate(from: ProtocolType, to: ProtocolType, message: unknown): unknown | null {
    const messageType = resolveMessageType(from, message);
    if (messageType === null) return null;

    const route = this.routes.find(
      (r) => r.from === from && r.to === to && r.messageType === messageType,
    );
    if (!route) return null;

    return route.transform(message);
  }

  /** Return a readonly snapshot of all registered routes. */
  getRoutes(): readonly BridgeRoute[] {
    return this.routes;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveMessageType(protocol: ProtocolType, message: unknown): string | null {
  if (message === null || typeof message !== "object") return null;
  const m = message as Record<string, unknown>;

  if (protocol === "aiva" || protocol === "vtuber") {
    return typeof m.type === "string" ? m.type : null;
  }

  if (protocol === "goclaw") {
    if ("method" in m) return "request";
    if ("result" in m) return "result";
    if ("error" in m) return "error";
    return null;
  }

  return null;
}
