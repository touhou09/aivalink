import { createHmac, timingSafeEqual } from "node:crypto";
import type { JwtPayload } from "./types.js";

export function signJwt(
  claims: Omit<JwtPayload, "iat" | "exp">,
  secret: string,
  expiresInSec = 86400,
): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({ ...claims, iat: now, exp: now + expiresInSec }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

export function verifyJwt(token: string, secret: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, payload, sig] = parts;
  const expected = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");

  const sigBuf = Buffer.from(sig, "base64url");
  const expBuf = Buffer.from(expected, "base64url");
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString(),
    ) as JwtPayload;

    if (typeof decoded.exp !== "number" || decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    if (typeof decoded.sub !== "string") {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}
