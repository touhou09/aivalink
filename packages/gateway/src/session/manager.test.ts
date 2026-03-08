import { describe, it, expect, beforeEach } from "vitest";
import { SessionManager, type SessionState, type GatewaySocket } from "./manager";

function makeSocket(): GatewaySocket {
  return { readyState: 1, send: () => {} };
}

function makeSession(id: string, overrides?: Partial<SessionState>): SessionState {
  return {
    sessionId: id,
    userId: "u1",
    characterId: "kiara",
    laneId: "u1:kiara",
    socket: makeSocket(),
    connectedAt: new Date(),
    ...overrides,
  };
}

describe("SessionManager", () => {
  let sm: SessionManager;

  beforeEach(() => {
    sm = new SessionManager();
  });

  it("create and get", () => {
    const s = makeSession("s1");
    sm.create(s);
    expect(sm.get("s1")).toBe(s);
    expect(sm.count).toBe(1);
  });

  it("get returns undefined for missing session", () => {
    expect(sm.get("missing")).toBeUndefined();
  });

  it("getByUserId filters correctly", () => {
    sm.create(makeSession("s1", { userId: "u1" }));
    sm.create(makeSession("s2", { userId: "u2" }));
    sm.create(makeSession("s3", { userId: "u1" }));

    const results = sm.getByUserId("u1");
    expect(results).toHaveLength(2);
    expect(results.map((s) => s.sessionId).sort()).toEqual(["s1", "s3"]);
  });

  it("getByLaneId filters correctly", () => {
    sm.create(makeSession("s1", { laneId: "u1:kiara" }));
    sm.create(makeSession("s2", { laneId: "u2:kiara" }));
    sm.create(makeSession("s3", { laneId: "u1:kiara" }));

    expect(sm.getByLaneId("u1:kiara")).toHaveLength(2);
    expect(sm.getByLaneId("u2:kiara")).toHaveLength(1);
    expect(sm.getByLaneId("u3:kiara")).toHaveLength(0);
  });

  it("remove returns removed session and decrements count", () => {
    sm.create(makeSession("s1"));
    const removed = sm.remove("s1");
    expect(removed).toBeDefined();
    expect(removed!.sessionId).toBe("s1");
    expect(sm.count).toBe(0);
    expect(sm.get("s1")).toBeUndefined();
  });

  it("remove returns undefined for missing session", () => {
    expect(sm.remove("missing")).toBeUndefined();
  });

  it("count reflects number of sessions", () => {
    expect(sm.count).toBe(0);
    sm.create(makeSession("s1"));
    sm.create(makeSession("s2"));
    expect(sm.count).toBe(2);
    sm.remove("s1");
    expect(sm.count).toBe(1);
  });
});
