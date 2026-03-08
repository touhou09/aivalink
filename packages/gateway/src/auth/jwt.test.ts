import { createHmac } from "node:crypto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { signJwt, verifyJwt } from "./jwt";

const SECRET = "test-secret-key-for-jwt";

describe("signJwt / verifyJwt", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("round-trips a valid token", () => {
    const token = signJwt({ sub: "user-1", email: "a@b.com" }, SECRET);
    const payload = verifyJwt(token, SECRET);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe("user-1");
    expect(payload!.email).toBe("a@b.com");
    expect(typeof payload!.iat).toBe("number");
    expect(typeof payload!.exp).toBe("number");
  });

  it("includes all optional claims", () => {
    const token = signJwt(
      { sub: "u1", email: "e@e.com", name: "Test", image: "https://img", provider: "google" },
      SECRET,
    );
    const p = verifyJwt(token, SECRET)!;
    expect(p.name).toBe("Test");
    expect(p.image).toBe("https://img");
    expect(p.provider).toBe("google");
  });

  it("rejects token with wrong secret", () => {
    const token = signJwt({ sub: "user-1" }, SECRET);
    expect(verifyJwt(token, "wrong-secret")).toBeNull();
  });

  it("rejects expired token", () => {
    const token = signJwt({ sub: "user-1" }, SECRET, -1); // already expired
    expect(verifyJwt(token, SECRET)).toBeNull();
  });

  it("rejects tampered payload", () => {
    const token = signJwt({ sub: "user-1" }, SECRET);
    const [header, , sig] = token.split(".");
    const tampered = Buffer.from(JSON.stringify({ sub: "hacker", iat: 0, exp: 9999999999 })).toString("base64url");
    expect(verifyJwt(`${header}.${tampered}.${sig}`, SECRET)).toBeNull();
  });

  it("rejects malformed token (not 3 parts)", () => {
    expect(verifyJwt("abc.def", SECRET)).toBeNull();
    expect(verifyJwt("onlyone", SECRET)).toBeNull();
    expect(verifyJwt("", SECRET)).toBeNull();
  });

  it("rejects token with invalid base64 payload", () => {
    const token = signJwt({ sub: "user-1" }, SECRET);
    const [header, , sig] = token.split(".");
    expect(verifyJwt(`${header}.!!!invalid!!!.${sig}`, SECRET)).toBeNull();
  });

  it("rejects token without sub field", () => {
    // Manually craft a token with no sub
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({ iat: now, exp: now + 3600 })).toString("base64url");
    const sig = createHmac("sha256", SECRET).update(`${header}.${payload}`).digest("base64url");
    expect(verifyJwt(`${header}.${payload}.${sig}`, SECRET)).toBeNull();
  });

  it("respects custom expiry", () => {
    const token = signJwt({ sub: "user-1" }, SECRET, 3600);
    const p = verifyJwt(token, SECRET)!;
    expect(p.exp - p.iat).toBe(3600);
  });
});
