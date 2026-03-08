/**
 * AIVA Gateway Server
 * HTTP + WebSocket entry point
 * Issue #9: SessionManager lifecycle, LaneManager queue, message routing, cleanup
 * Issue #10: JWT auth for WebSocket connections, user persistence
 */

import Fastify from "fastify";
import websocket from "@fastify/websocket";
import cors from "@fastify/cors";
import { registerSecurityHooks } from "./security/middleware";
import { registerCsp } from "./security/csp";
import { nanoid } from "nanoid";
import { SessionManager } from "./session/manager";
import { LaneManager, buildLaneId } from "./lane/manager";
import { Orchestrator } from "@aivalink/orchestrator";
import {
  PostgresManager,
  UserRepository,
  MemoryRepository,
  MemoryRenderer,
  PgVectorStore,
  HttpEmbeddingProvider,
} from "@aivalink/memory";
import { handleMessage, type HandlerDeps } from "./handler";
import { verifyJwt } from "@aivalink/auth";
import { GatewayObservability, evaluateAlerts, type AlertThresholds } from "./observability";
import { ProviderRegistry } from "./inference/provider";
import { createAiServiceProvider } from "./inference/ai-service-adapter";

const env = (
  globalThis as {
    process?: { env?: Record<string, string | undefined> };
  }
).process?.env ?? {};

const PORT = Number.parseInt(env.PORT ?? "3000", 10);
const JWT_SECRET = env.JWT_SECRET ?? env.NEXTAUTH_SECRET;
const DATABASE_URL = env.DATABASE_URL ?? "postgresql://aivalink:aivalink_secret@localhost:5432/aivalink";
const CHAT_MODE = env.GATEWAY_CHAT_MODE === "orchestrator" ? "orchestrator" : "echo";
const AI_SERVICE_URL = env.AIVA_AI_SERVICE_URL ?? env.AI_SERVICE_URL ?? "http://127.0.0.1:8000";
const EMBEDDING_MODEL = env.AIVA_EMBEDDING_MODEL ?? "text-embedding-3-small";

const ALERT_THRESHOLDS: AlertThresholds = {
  maxErrorRate: Number.parseFloat(env.AIVA_ALERT_MAX_ERROR_RATE ?? "0.05"),
  maxP95LatencyMs: Number.parseFloat(env.AIVA_ALERT_MAX_P95_LATENCY_MS ?? "1800"),
  maxCostUnitsPerMinute: Number.parseFloat(env.AIVA_ALERT_MAX_COST_UNITS_PER_MIN ?? "120"),
};

export async function bootstrap() {
  const app = Fastify({ logger: true });

  await app.register(websocket);

  // CORS — env-driven allowed origins, no wildcard in production
  const rawOrigins = env.ALLOWED_ORIGINS ?? "";
  const allowedOrigins = rawOrigins
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  await app.register(cors, {
    origin: allowedOrigins.length > 0 ? allowedOrigins : ["http://localhost:3000", "http://localhost:3001"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Request-ID"],
  });

  // CSP + security headers
  registerCsp(app);

  const sessionManager = new SessionManager();
  const laneManager = new LaneManager();
  const orchestrator = new Orchestrator();
  const observability = new GatewayObservability();

  // Provider registry — ai-service adapter registered as primary in orchestrator mode
  const providerRegistry = new ProviderRegistry();
  if (CHAT_MODE === "orchestrator") {
    providerRegistry.register(createAiServiceProvider(AI_SERVICE_URL), true);
  }

  // Database + user persistence (PostgreSQL)
  const db = PostgresManager.fromUrl(DATABASE_URL);
  const userRepo = new UserRepository(db.instance);

  // pgvector for semantic search
  const vectorStore = new PgVectorStore({
    pool: db.instance,
    tableName: "memory_embeddings",
  });
  await vectorStore.ensureCollection();

  const memoryRepo = new MemoryRepository(db.instance, {
    embeddingProvider: new HttpEmbeddingProvider({
      baseUrl: AI_SERVICE_URL,
      model: EMBEDDING_MODEL,
    }),
    vectorStore,
  });
  const memoryRenderer = new MemoryRenderer(db.instance);
  const historyStore = new Map<string, Array<{ role: "user" | "assistant"; content: string }>>();

  const deps: HandlerDeps = {
    sessionManager,
    laneManager,
    orchestrator,
    chatMode: CHAT_MODE,
    memoryRepository: memoryRepo,
    memoryRenderer,
    historyStore,
    observability,
  };

  // Health check
  app.get("/health", async () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
    sessions: sessionManager.count,
  }));

  app.get("/ops/kpi", async () => {
    observability.recordSessionCount(sessionManager.count);
    return observability.snapshot();
  });

  app.get("/ops/alerts", async () => {
    observability.recordSessionCount(sessionManager.count);
    const snapshot = observability.snapshot();
    return {
      generatedAt: snapshot.generatedAt,
      alerts: evaluateAlerts(snapshot, ALERT_THRESHOLDS),
      thresholds: ALERT_THRESHOLDS,
    };
  });

  // WebSocket endpoint — requires JWT auth (Issue #10)
  app.register(async function (fastify) {
    fastify.get("/ws", { websocket: true }, (socket, req) => {
      const query = (req.query ?? {}) as Record<string, string | undefined>;
      const token =
        query.token ??
        req.headers.authorization?.replace(/^Bearer\s+/i, "");

      // Auth is optional for local/dev baseline: if JWT secret is absent, allow anonymous sessions.
      let userId = "anonymous";
      if (JWT_SECRET) {
        if (!token) {
          socket.send(
            JSON.stringify({
              version: 1,
              timestamp: new Date().toISOString(),
              type: "error",
              code: "AUTH_REQUIRED",
              message: "Authentication required",
              recoverable: false,
            }),
          );
          socket.close(4001, "AUTH_REQUIRED");
          return;
        }

        const payload = verifyJwt(token, JWT_SECRET);
        if (!payload) {
          socket.send(
            JSON.stringify({
              version: 1,
              timestamp: new Date().toISOString(),
              type: "error",
              code: "AUTH_REQUIRED",
              message: "Invalid or expired token",
              recoverable: false,
            }),
          );
          socket.close(4001, "AUTH_REQUIRED");
          return;
        }

        userId = payload.sub;

        // Persist authenticated user profile
        try {
          userRepo.upsert({
            id: payload.sub,
            email: payload.email ?? null,
            displayName: payload.name ?? "User",
            authProvider: payload.provider ?? "unknown",
            avatarUrl: payload.image ?? null,
          });
        } catch (err) {
          app.log.error({ err, userId: payload.sub }, "Failed to upsert user");
        }
      }

      const sessionId = nanoid();
      const characterId = query.characterId?.trim() || "default";
      const laneId = buildLaneId(userId, characterId);

      sessionManager.create({
        sessionId,
        userId,
        characterId,
        laneId,
        socket,
        connectedAt: new Date(),
      });

      app.log.info({ sessionId, userId, laneId }, "Session created");

      socket.on("message", (raw: unknown) => {
        const session = sessionManager.get(sessionId);
        if (!session) {
          app.log.warn({ sessionId }, "Received message for unknown session");
          return;
        }

        const message = typeof raw === "string" ? raw : raw?.toString?.() ?? "";
        handleMessage(message, session, socket, deps).catch((err) => {
          app.log.error({ err, sessionId }, "Unhandled error in message handler");
        });
      });

      socket.on("error", (err: Error) => {
        app.log.error({ err, sessionId }, "WebSocket error");
      });

      socket.on("close", () => {
        const removed = sessionManager.remove(sessionId);
        if (!removed) return;

        if (sessionManager.getByLaneId(removed.laneId).length === 0) {
          laneManager.clearQueue(removed.laneId);
          historyStore.delete(removed.laneId);
          app.log.info({ laneId: removed.laneId }, "Lane queue/history cleared (last session disconnected)");
        }

        app.log.info({ sessionId }, "Session removed on disconnect");
      });
    });
  });

  await app.listen({ port: PORT, host: "0.0.0.0" });
  app.log.info(`Gateway listening on port ${PORT}`);

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "Shutting down gateway");
    await db.close();
    await app.close();
  };
  const proc = (
    globalThis as { process?: { on?(event: string, handler: () => void): void } }
  ).process;
  proc?.on?.("SIGTERM", () => void shutdown("SIGTERM"));
  proc?.on?.("SIGINT", () => void shutdown("SIGINT"));

  return app;
}

bootstrap().catch((err) => {
  globalThis.console.error(err);
});
