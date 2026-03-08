import { describe, it, expect, afterAll } from "vitest";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import WebSocket from "ws";
import { signJwt, verifyJwt } from "./jwt";

const JWT_SECRET = "ws-auth-test-secret";

function createTestServer() {
  const app = Fastify({ logger: false });

  app.register(websocket);
  app.register(async (fastify) => {
    fastify.get("/ws", { websocket: true }, (socket, req) => {
      const query = (req.query ?? {}) as Record<string, string | undefined>;
      const token =
        query.token ??
        req.headers.authorization?.replace(/^Bearer\s+/i, "");

      if (!token) {
        socket.send(
          JSON.stringify({ type: "error", code: "AUTH_REQUIRED", message: "Authentication required" }),
        );
        socket.close(4001, "AUTH_REQUIRED");
        return;
      }

      const payload = verifyJwt(token, JWT_SECRET);
      if (!payload) {
        socket.send(
          JSON.stringify({ type: "error", code: "AUTH_REQUIRED", message: "Invalid or expired token" }),
        );
        socket.close(4001, "AUTH_REQUIRED");
        return;
      }

      socket.send(JSON.stringify({ type: "authenticated", userId: payload.sub }));
    });
  });

  return app;
}

describe("WebSocket authentication", () => {
  const app = createTestServer();
  let port: number;

  afterAll(async () => {
    await app.close();
  });

  it("rejects connection without token", async () => {
    await app.listen({ port: 0 });
    const addr = app.server.address();
    port = typeof addr === "object" && addr ? addr.port : 0;

    const ws = new WebSocket(`ws://localhost:${port}/ws`);

    const { code, messages } = await new Promise<{ code: number; messages: string[] }>((resolve) => {
      const messages: string[] = [];
      ws.on("message", (data) => messages.push(data.toString()));
      ws.on("close", (code) => resolve({ code, messages }));
    });

    expect(code).toBe(4001);
    expect(messages.length).toBeGreaterThan(0);
    const err = JSON.parse(messages[0]);
    expect(err.code).toBe("AUTH_REQUIRED");
  });

  it("rejects connection with invalid token", async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws?token=invalid.jwt.token`);

    const { code, messages } = await new Promise<{ code: number; messages: string[] }>((resolve) => {
      const messages: string[] = [];
      ws.on("message", (data) => messages.push(data.toString()));
      ws.on("close", (code) => resolve({ code, messages }));
    });

    expect(code).toBe(4001);
    const err = JSON.parse(messages[0]);
    expect(err.message).toContain("Invalid");
  });

  it("rejects connection with expired token", async () => {
    const expired = signJwt({ sub: "user-1" }, JWT_SECRET, -1);
    const ws = new WebSocket(`ws://localhost:${port}/ws?token=${expired}`);

    const { code } = await new Promise<{ code: number }>((resolve) => {
      ws.on("close", (code) => resolve({ code }));
    });

    expect(code).toBe(4001);
  });

  it("accepts connection with valid token", async () => {
    const token = signJwt({ sub: "user-42", email: "test@aiva.com" }, JWT_SECRET);
    const ws = new WebSocket(`ws://localhost:${port}/ws?token=${token}`);

    const message = await new Promise<string>((resolve) => {
      ws.on("message", (data) => {
        resolve(data.toString());
        ws.close();
      });
    });

    const parsed = JSON.parse(message);
    expect(parsed.type).toBe("authenticated");
    expect(parsed.userId).toBe("user-42");
  });
});
