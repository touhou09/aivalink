import { describe, it, expect } from "vitest";
import { signJwt, verifyJwt } from "../jwt.js";

const SECRET = "test-secret-key-for-unit-tests";

describe("JWT", () => {
  it("signs and verifies a token", () => {
    const token = signJwt({ sub: "user-123", email: "test@example.com" }, SECRET);
    const payload = verifyJwt(token, SECRET);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe("user-123");
    expect(payload!.email).toBe("test@example.com");
  });

  it("rejects tampered tokens", () => {
    const token = signJwt({ sub: "user-123" }, SECRET);
    const tampered = token.slice(0, -5) + "XXXXX";
    expect(verifyJwt(tampered, SECRET)).toBeNull();
  });

  it("rejects expired tokens", () => {
    const token = signJwt({ sub: "user-123" }, SECRET, -1);
    expect(verifyJwt(token, SECRET)).toBeNull();
  });

  it("rejects wrong secret", () => {
    const token = signJwt({ sub: "user-123" }, SECRET);
    expect(verifyJwt(token, "wrong-secret")).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyJwt("not.a.valid.token", SECRET)).toBeNull();
    expect(verifyJwt("", SECRET)).toBeNull();
  });
});
