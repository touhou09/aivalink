/**
 * Content-Security-Policy middleware for the AivaLink gateway.
 * Allows self, CDN origins for Live2D assets, and WebSocket connections.
 */

import type { FastifyInstance } from "fastify";

const LIVE2D_CDN = "https://cubism.live2d.com";
const LIVE2D_SDK_CDN = "https://cdn.jsdelivr.net";

// WS origins are injected at runtime from the ALLOWED_ORIGINS env var so the
// CSP connect-src dynamically includes the same hosts.
function buildCspDirectives(wsOrigins: string[]): string {
  const connectSrc = [
    "'self'",
    "ws:",
    "wss:",
    ...wsOrigins.map((o) => o.replace(/^http/, "ws")),
  ].join(" ");

  const directives: Record<string, string> = {
    "default-src": "'self'",
    "script-src": `'self' ${LIVE2D_CDN} ${LIVE2D_SDK_CDN}`,
    "script-src-attr": "'none'",
    "style-src": `'self' ${LIVE2D_SDK_CDN}`,
    "img-src": `'self' data: blob: ${LIVE2D_CDN} ${LIVE2D_SDK_CDN}`,
    "font-src": `'self' ${LIVE2D_SDK_CDN}`,
    "connect-src": connectSrc,
    "media-src": "'self' blob:",
    "object-src": "'none'",
    "frame-ancestors": "'none'",
    "base-uri": "'self'",
    "form-action": "'self'",
    "upgrade-insecure-requests": "",
  };

  return Object.entries(directives)
    .map(([key, val]) => (val ? `${key} ${val}` : key))
    .join("; ");
}

export function registerCsp(app: FastifyInstance): void {
  const env = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env ?? {};

  const rawOrigins = env.ALLOWED_ORIGINS ?? "";
  const wsOrigins = rawOrigins
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  const cspValue = buildCspDirectives(wsOrigins);

  app.addHook("onSend", async (_request, reply) => {
    reply.header("Content-Security-Policy", cspValue);
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
  });
}
