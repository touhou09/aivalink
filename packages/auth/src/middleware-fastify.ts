import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyJwt } from "./jwt.js";
import type { JwtPayload } from "./types.js";

declare module "fastify" {
  interface FastifyRequest {
    jwtPayload?: JwtPayload;
  }
}

export function fastifyAuthHook(secret: string) {
  return async function authHook(request: FastifyRequest, reply: FastifyReply) {
    const token =
      (request.query as Record<string, string | undefined>)?.token ??
      request.headers.authorization?.replace(/^Bearer\s+/i, "");

    if (!token) {
      reply.code(401).send({ error: "AUTH_REQUIRED", message: "Authentication required" });
      return;
    }

    const payload = verifyJwt(token, secret);
    if (!payload) {
      reply.code(401).send({ error: "AUTH_REQUIRED", message: "Invalid or expired token" });
      return;
    }

    request.jwtPayload = payload;
  };
}
