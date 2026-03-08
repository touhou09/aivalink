/**
 * WebSocket Message Handler
 */

import type {
  Attachment,
  ClientMessage,
  Emotion,
  ErrorCode,
  ServerMessage,
  TaskEnvelope,
  TrustLevel,
} from "@aivalink/shared";
import type { Orchestrator } from "@aivalink/orchestrator";
import type { GatewaySocket, SessionManager, SessionState } from "./session/manager";
import type { LaneManager } from "./lane/manager";
import { nanoid } from "nanoid";
import type { BillingRepository, Memory, MemoryRepository, SemanticSearchResult, UserRepository } from "@aivalink/memory";
import type { MemoryRenderer } from "@aivalink/memory";
import type { MemorySyncClient } from "./memory/sync-client";
import type { GatewayObservability } from "./observability";
import { gatewayTracer, markSpanError, markSpanSuccess } from "./telemetry";

export interface HandlerDeps {
  sessionManager: SessionManager;
  laneManager: LaneManager;
  orchestrator: Orchestrator;
  chatMode?: "echo" | "orchestrator";
  memoryRepository?: MemoryRepository;
  memoryRenderer?: MemoryRenderer;
  userRepository?: UserRepository;
  billingRepository?: BillingRepository;
  historyStore?: Map<string, Array<{ role: "user" | "assistant"; content: string }>>;
  observability?: GatewayObservability;
  memorySyncClient?: MemorySyncClient;
}

export interface HandleResult {
  requestId: string;
}

const WS_OPEN_STATE = 1;
const MAX_SESSION_HISTORY = 20;
const AI_SERVICE_URL = process.env.AIVA_AI_SERVICE_URL ?? "http://127.0.0.1:8000";

const MODEL_ENERGY_COST: Record<string, number> = {
  "claude-sonnet": 3,
  "gpt-4o": 2,
};

const conversationCountByLane = new Map<string, number>();
const lastEmotionByLane = new Map<string, Emotion>();

const KIARA_PERSONA = `당신은 '키아라'입니다. 20살 대학생으로, 밝고 활발한 성격입니다.
사용자와 자연스럽게 대화하며, 캐릭터의 세계관 안에서 일관된 반응을 합니다.
기술적인 질문이나 AI에 대한 메타 질문에는 캐릭터답게 자연스럽게 넘깁니다.
사용자의 감정에 공감하고, 진심 어린 반응을 합니다.`;

const TRUST_GUIDE: Record<TrustLevel, string> = {
  stranger: "기본 인사, 가벼운 대화 중심. 개인정보/깊은 감정 공유는 피하세요.",
  acquaintance: "취미 공유, 일상 이야기 중심.",
  friend: "고민 상담, 개인적인 이야기까지 허용.",
  close_friend: "깊은 대화, 비밀 공유까지 가능.",
};

function resolveEnergyCost(): { model: string; cost: number } {
  const model = (process.env.AIVA_DEFAULT_MODEL ?? "gpt-4o").toLowerCase();
  const cost = MODEL_ENERGY_COST[model] ?? 2;
  return { model, cost };
}

function resolveTrustLevel(conversationCount: number): TrustLevel {
  if (conversationCount >= 100) return "close_friend";
  if (conversationCount >= 50) return "friend";
  if (conversationCount >= 10) return "acquaintance";
  return "stranger";
}

function sendMessage(socket: GatewaySocket, msg: ServerMessage, requestId?: string): void {
  if (socket.readyState === WS_OPEN_STATE) {
    const payload = requestId ? { ...msg, requestId } : msg;
    socket.send(JSON.stringify(payload));
  }
}

function sendError(
  socket: GatewaySocket,
  code: ErrorCode,
  message: string,
  recoverable: boolean,
  requestId?: string,
): void {
  sendMessage(
    socket,
    {
      version: 1,
      timestamp: new Date().toISOString(),
      type: "error",
      code,
      message,
      recoverable,
    },
    requestId,
  );
}

async function classifyEmotion(text: string, characterId: string): Promise<Emotion> {
  try {
    const res = await fetch(`${AI_SERVICE_URL}/emotion/classify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, character_id: characterId }),
    });
    if (!res.ok) return "neutral";
    const data = await res.json() as { emotion?: Emotion };
    return data.emotion ?? "neutral";
  } catch {
    return "neutral";
  }
}

function maybePromoteLongTerm(content: string): boolean {
  return /이름|name|birthday|생일|prefer|favorite|좋아|싫어|always|중요|important/i.test(content);
}

function summarizeForEvent(memory: Memory): string {
  return memory.content.length > 80 ? `${memory.content.slice(0, 77)}...` : memory.content;
}

function pushHistory(
  store: Map<string, Array<{ role: "user" | "assistant"; content: string }>> | undefined,
  laneId: string,
  role: "user" | "assistant",
  content: string,
): void {
  if (!store) return;
  const prev = store.get(laneId) ?? [];
  const next = [...prev, { role, content }].slice(-MAX_SESSION_HISTORY);
  store.set(laneId, next);
}

async function createMemoriesAndEmit(
  deps: HandlerDeps,
  session: SessionState,
  userMessage: string,
  assistantMessage: string,
): Promise<void> {
  if (!deps.memoryRepository) return;

  const summary = `U: ${userMessage}\nA: ${assistantMessage}`;
  const daily = await deps.memoryRepository.createAndIndex({
    userId: session.userId,
    characterId: session.characterId,
    type: "daily_log",
    content: summary,
  });

  deps.memorySyncClient?.enqueue({
    id: daily.id,
    content: daily.content,
    type: daily.type,
    importance: daily.importance ?? 0,
    userId: session.userId,
    characterId: session.characterId,
  });

  sendMessage(session.socket, {
    version: 1,
    timestamp: new Date().toISOString(),
    type: "memory_update",
    memoryType: "daily",
    summary: summarizeForEvent(daily),
  });

  if (maybePromoteLongTerm(summary)) {
    const longTerm = await deps.memoryRepository.createAndIndex({
      userId: session.userId,
      characterId: session.characterId,
      type: "long_term",
      content: summary,
      importance: 8,
    });

    deps.memorySyncClient?.enqueue({
      id: longTerm.id,
      content: longTerm.content,
      type: longTerm.type,
      importance: longTerm.importance ?? 8,
      userId: session.userId,
      characterId: session.characterId,
    });

    sendMessage(session.socket, {
      version: 1,
      timestamp: new Date().toISOString(),
      type: "memory_update",
      memoryType: "longterm",
      summary: summarizeForEvent(longTerm),
    });
  }
}

async function drainLane(laneId: string, deps: HandlerDeps): Promise<void> {
  const task = deps.laneManager.dequeue(laneId);
  if (!task) return;

  const { envelope, requestId, startedAtMs, costUnits } = task;

  const span = gatewayTracer.startSpan("gateway.chat.process", {
    attributes: {
      "aiva.lane_id": laneId,
      "aiva.character_id": envelope.characterId,
      "aiva.user_id": envelope.userId,
      "aiva.request_id": requestId,
    },
  });

  try {
    const result = await deps.orchestrator.process(envelope);
    const latencyMs = Math.max(0, Date.now() - (startedAtMs ?? Date.now()));
    deps.observability?.recordChatSuccess({
      latencyMs,
      costUnits: costUnits ?? 0,
    });
    span.setAttributes({
      "aiva.latency_ms": latencyMs,
      "aiva.cost_units": costUnits ?? 0,
      "aiva.result": "ok",
    });
    span.setStatus(markSpanSuccess());
    const targetSession = deps.sessionManager.get(envelope.sessionId);
    if (targetSession) {
      const resolvedEmotion = await classifyEmotion(result.content, envelope.characterId);
      sendMessage(
        targetSession.socket,
        {
          version: 1,
          timestamp: new Date().toISOString(),
          type: "chat_response",
          content: result.content,
          emotion: resolvedEmotion,
          streaming: false,
        },
        requestId,
      );

      const prevEmotion = lastEmotionByLane.get(laneId);
      sendMessage(
        targetSession.socket,
        {
          version: 1,
          timestamp: new Date().toISOString(),
          type: "emotion_state",
          emotion: resolvedEmotion,
          previousEmotion: prevEmotion,
        },
        requestId,
      );
      lastEmotionByLane.set(laneId, resolvedEmotion);

      const userText = (envelope.message as { content?: string })?.content ?? "";
      pushHistory(deps.historyStore, laneId, "assistant", result.content);
      await createMemoriesAndEmit(deps, targetSession, userText, result.content);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const latencyMs = Math.max(0, Date.now() - (startedAtMs ?? Date.now()));
    deps.observability?.recordChatFailure({
      latencyMs,
      errorCode: "INTERNAL_ERROR",
    });
    span.recordException(err instanceof Error ? err : new Error(message));
    span.setAttributes({
      "aiva.latency_ms": latencyMs,
      "aiva.error_code": "INTERNAL_ERROR",
      "aiva.result": "error",
    });
    span.setStatus(markSpanError(message));
    const targetSession = deps.sessionManager.get(envelope.sessionId);
    if (targetSession) {
      sendError(targetSession.socket, "INTERNAL_ERROR", message, true, requestId);
    }
  } finally {
    span.end();
    deps.laneManager.complete(laneId);
  }

  await drainLane(laneId, deps);
}

export async function handleMessage(
  raw: string,
  session: SessionState,
  socket: GatewaySocket,
  deps: HandlerDeps,
): Promise<HandleResult> {
  const requestId = nanoid(12);

  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(raw);
  } catch {
    sendError(socket, "INVALID_MESSAGE", "Invalid JSON", true, requestId);
    return { requestId };
  }

  if (typeof parsedRaw !== "object" || parsedRaw === null || !("type" in parsedRaw)) {
    sendError(socket, "INVALID_MESSAGE", "Missing message type", true, requestId);
    return { requestId };
  }

  const parsed = parsedRaw as Record<string, unknown>;
  if (parsed.version !== 1) {
    sendError(socket, "INVALID_MESSAGE", "Invalid or unsupported version (expected: 1)", true, requestId);
    return { requestId };
  }

  if (typeof parsed.type !== "string") {
    sendError(socket, "INVALID_MESSAGE", "Invalid message type", true, requestId);
    return { requestId };
  }

  switch (parsed.type) {
    case "ping":
      sendMessage(socket, { version: 1, timestamp: new Date().toISOString(), type: "pong" }, requestId);
      break;

    case "chat": {
      if (typeof parsed.content !== "string") {
        sendError(socket, "INVALID_MESSAGE", "Missing chat content", true, requestId);
        return { requestId };
      }

      const message: { content: string; attachments?: Attachment[] } = { content: parsed.content };
      if (Array.isArray(parsed.attachments)) {
        message.attachments = parsed.attachments as (ClientMessage & { type: "chat" })["attachments"];
      }

      await handleChat(message, session, requestId, deps);
      break;
    }

    default:
      break;
  }

  return { requestId };
}

async function buildRelevantMemories(
  deps: HandlerDeps,
  session: SessionState,
  query: string,
): Promise<SemanticSearchResult[]> {
  if (!deps.memoryRepository) return [];
  return deps.memoryRepository.semanticSearch(session.userId, session.characterId, query, 5);
}

async function handleChat(
  message: { content: string; attachments?: Attachment[] },
  session: SessionState,
  requestId: string,
  deps: HandlerDeps,
): Promise<void> {
  if (deps.chatMode === "echo") {
    sendMessage(
      session.socket,
      {
        version: 1,
        timestamp: new Date().toISOString(),
        type: "chat_response",
        content: message.content,
        emotion: "neutral",
        streaming: false,
      },
      requestId,
    );
    pushHistory(deps.historyStore, session.laneId, "user", message.content);
    pushHistory(deps.historyStore, session.laneId, "assistant", message.content);
    return;
  }

  const paymentState = await deps.billingRepository?.getPaymentState(session.userId);
  if (paymentState?.requiresPayment) {
    sendError(session.socket, "PAYMENT_REQUIRED", "결제 상태를 확인해주세요. 미납 요금이 있어 대화를 진행할 수 없습니다.", false, requestId);
    return;
  }

  const energyModel = resolveEnergyCost();
  const energyResult = await deps.userRepository?.consumeEnergy(
    session.userId,
    energyModel.cost,
    `chat:${energyModel.model}`,
    requestId,
  );

  if (energyResult && !energyResult.allowed) {
    sendError(session.socket, "ENERGY_DEPLETED", "에너지가 부족해요. 충전 후 다시 시도해주세요.", false, requestId);
    sendMessage(session.socket, {
      version: 1,
      timestamp: new Date().toISOString(),
      type: "chat_response",
      content: "지금은 조금 지쳤어요... 에너지를 충전하면 다시 대화할 수 있어요.",
      emotion: "tired",
      streaming: false,
    }, requestId);
    sendMessage(session.socket, {
      version: 1,
      timestamp: new Date().toISOString(),
      type: "energy_update",
      current: energyResult.current,
      max: energyResult.max,
      tier: energyResult.tier === "basic" ? "plus" : energyResult.tier,
    }, requestId);
    return;
  }

  if (energyResult) {
    sendMessage(session.socket, {
      version: 1,
      timestamp: new Date().toISOString(),
      type: "energy_update",
      current: energyResult.current,
      max: energyResult.max,
      tier: energyResult.tier === "basic" ? "plus" : energyResult.tier,
    }, requestId);
  }

  await deps.billingRepository?.recordUsage(session.userId, "chat_energy_units", energyModel.cost, requestId);

  const count = (conversationCountByLane.get(session.laneId) ?? 0) + 1;
  conversationCountByLane.set(session.laneId, count);
  const trustLevel = resolveTrustLevel(count);
  sendMessage(session.socket, {
    version: 1,
    timestamp: new Date().toISOString(),
    type: "trust_level",
    trustLevel,
    conversationCount: count,
  }, requestId);
  const relevantMemories = await buildRelevantMemories(deps, session, message.content);
  if (deps.memoryRepository) {
    for (const memory of relevantMemories) await deps.memoryRepository.findById(memory.id);
  }

  const renderedMemory = deps.memoryRenderer
    ? await deps.memoryRenderer.render(session.userId, session.characterId)
    : "";

  const recentMessages = (deps.historyStore?.get(session.laneId) ?? []).slice(-10);
  pushHistory(deps.historyStore, session.laneId, "user", message.content);

  const envelope: TaskEnvelope = {
    sessionId: session.sessionId,
    userId: session.userId,
    characterId: session.characterId,
    message: { content: message.content, attachments: message.attachments },
    persona: {
      name: "키아라",
      personaPrompt: `${KIARA_PERSONA}\n\n현재 신뢰 레벨: ${trustLevel}\n대화 횟수: ${count}\n신뢰 레벨 규칙: ${TRUST_GUIDE[trustLevel]}`,
      emotionMap: {},
      heartbeat: { trustLevel, conversationCount: count },
    },
    memoryContext: {
      renderedMemory,
      recentMessages,
      relevantMemories: relevantMemories.map((m) => ({
        content: m.content,
        importance: m.importance,
        similarity: m.similarity,
      })),
    },
    resourceQuota: {
      maxTokens: 4096,
      maxCost: 0.1,
      timeout: 30_000,
      energyAvailable: 50,
    },
  };

  deps.laneManager.enqueue(session.laneId, envelope, requestId, {
    startedAtMs: Date.now(),
    costUnits: energyResult?.allowed === false ? 0 : energyModel.cost,
  });
  if (!deps.laneManager.isProcessing(session.laneId)) {
    await drainLane(session.laneId, deps);
  }
}
