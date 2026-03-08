/**
 * Gateway Security Middleware
 * Rate limiting (in-memory sliding window) + PII detection logging
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { PiiScrubber, RateLimiter } from '@aivalink/security';

export interface SecurityMiddlewareOptions {
  rateLimitPerMinute?: number;  // default 60
  enablePiiScrub?: boolean;     // default true
}

const piiScrubber = new PiiScrubber();

// Shared rate limiter instance (per-user, 1-minute sliding window)
let rateLimiter: RateLimiter;

export function getPiiScrubber(): PiiScrubber {
  return piiScrubber;
}

export function getUserId(request: FastifyRequest): string {
  // Prefer JWT-derived user ID injected by auth layer, fall back to IP
  const authHeader = request.headers.authorization;
  if (authHeader) {
    // The auth layer parses JWT upstream; here we just use the remote IP as a
    // fallback for unauthenticated or pre-auth requests.
  }
  return (request.headers['x-user-id'] as string | undefined)
    ?? request.ip
    ?? 'anonymous';
}

export function registerSecurityHooks(
  app: FastifyInstance,
  options?: SecurityMiddlewareOptions,
): void {
  const limit = options?.rateLimitPerMinute ?? 60;
  const enablePii = options?.enablePiiScrub ?? true;

  rateLimiter = new RateLimiter(limit, 60_000);

  // onRequest: rate limiting
  app.addHook('onRequest', async (request, reply) => {
    const userId = getUserId(request);
    const result = rateLimiter.check(userId);

    if (!result.allowed) {
      const retryAfterSec = result.retryAfterMs
        ? Math.ceil(result.retryAfterMs / 1000)
        : 60;
      reply.header('Retry-After', String(retryAfterSec));
      await reply.status(429).send({
        error: 'Too Many Requests',
        retryAfterSec,
      });
    }
  });

  // preHandler: PII detection logging (scrubbing happens per-message in handler.ts)
  if (enablePii) {
    app.addHook('preHandler', async (request, _reply) => {
      // Only inspect JSON body with a "content" field (e.g., REST chat endpoints)
      const body = request.body as Record<string, unknown> | undefined;
      if (body && typeof body['content'] === 'string') {
        const result = piiScrubber.scrub(body['content']);
        if (result.detected.length > 0) {
          request.log.warn(
            { piiTypes: result.detected, path: request.url },
            'PII detected in request body',
          );
        }
      }
    });
  }
}
