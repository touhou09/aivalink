import { describe, expect, it, vi } from "vitest";

import { WsRelay } from "./ws-relay";

type FakeSocket = {
  send: ReturnType<typeof vi.fn>;
};

describe("WsRelay", () => {
  it("relays tool calls from cloud client to local agent and returns result", () => {
    const relay = new WsRelay();
    const local = { send: vi.fn() };
    const cloud = { send: vi.fn() };

    relay.attachLocalAgent("agent-1", local);
    relay.attachCloudClient("agent-1", cloud);

    relay.handleCloudMessage(
      "agent-1",
      JSON.stringify({ type: "tool_call", requestId: "req-1", tool: "shell", args: { cmd: "uptime" } }),
    );

    expect(local.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "tool_call", requestId: "req-1", tool: "shell", args: { cmd: "uptime" } }),
    );

    relay.handleLocalMessage("agent-1", JSON.stringify({ type: "tool_result", requestId: "req-1", ok: true, data: "ok" }));

    expect(cloud.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "tool_result", requestId: "req-1", ok: true, data: "ok" }),
    );
  });

  it("returns unavailable when local agent is disconnected", () => {
    const relay = new WsRelay();
    const cloud = { send: vi.fn() };

    relay.attachCloudClient("agent-1", cloud);
    relay.handleCloudMessage("agent-1", JSON.stringify({ type: "tool_call", requestId: "req-2", tool: "shell", args: {} }));

    expect(cloud.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: "tool_result",
        requestId: "req-2",
        ok: false,
        error: "LOCAL_AGENT_UNAVAILABLE",
      }),
    );
  });

  it("blocks unauthorized tool calls via policy hook", () => {
    const relay = new WsRelay({
      authorizeToolCall: ({ tool }) => tool !== "shell",
    });
    const local = { send: vi.fn() };
    const cloud = { send: vi.fn() };

    relay.attachLocalAgent("agent-1", local);
    relay.attachCloudClient("agent-1", cloud);

    relay.handleCloudMessage(
      "agent-1",
      JSON.stringify({ type: "tool_call", requestId: "req-3", tool: "shell", args: { cmd: "whoami" } }),
    );

    expect(local.send).not.toHaveBeenCalled();
    expect(cloud.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: "tool_result",
        requestId: "req-3",
        ok: false,
        error: "TOOL_CALL_FORBIDDEN",
      }),
    );
  });

  it("reports healthy only when both local and cloud endpoints are connected", () => {
    const relay = new WsRelay();
    const local: FakeSocket = { send: vi.fn() };
    const cloud: FakeSocket = { send: vi.fn() };

    relay.attachLocalAgent("agent-1", local);
    expect(relay.getHealth("agent-1")).toEqual({ localConnected: true, cloudConnected: false, healthy: false });

    relay.attachCloudClient("agent-1", cloud);
    expect(relay.getHealth("agent-1")).toEqual({ localConnected: true, cloudConnected: true, healthy: true });

    relay.detachLocalAgent("agent-1", local);
    expect(relay.getHealth("agent-1")).toEqual({ localConnected: false, cloudConnected: true, healthy: false });
  });
});
