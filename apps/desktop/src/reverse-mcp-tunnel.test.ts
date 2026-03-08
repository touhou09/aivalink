import { describe, expect, it, vi } from "vitest";

import { ReverseMcpTunnel } from "./reverse-mcp-tunnel";

describe("ReverseMcpTunnel", () => {
  it("connects and reports healthy after websocket opens", async () => {
    const ws = {
      onopen: undefined as (() => void) | undefined,
      onclose: undefined as (() => void) | undefined,
      onmessage: undefined as ((event: { data: string }) => void) | undefined,
      send: vi.fn(),
    };

    const tunnel = new ReverseMcpTunnel({
      url: "wss://cloud.example/ws/local-agent",
      token: "secret",
      wsFactory: vi.fn().mockReturnValue(ws),
      scheduleReconnect: vi.fn(),
    });

    tunnel.start();
    ws.onopen?.();

    expect(tunnel.getHealth()).toEqual({ connected: true, reconnectAttempts: 0 });
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "register", token: "secret" }));
  });

  it("schedules reconnect when disconnected", () => {
    const ws = {
      onopen: undefined as (() => void) | undefined,
      onclose: undefined as (() => void) | undefined,
      onmessage: undefined as ((event: { data: string }) => void) | undefined,
      send: vi.fn(),
    };
    const scheduleReconnect = vi.fn();

    const tunnel = new ReverseMcpTunnel({
      url: "wss://cloud.example/ws/local-agent",
      token: "secret",
      wsFactory: vi.fn().mockReturnValue(ws),
      scheduleReconnect,
    });

    tunnel.start();
    ws.onclose?.();

    expect(tunnel.getHealth()).toEqual({ connected: false, reconnectAttempts: 1 });
    expect(scheduleReconnect).toHaveBeenCalledTimes(1);
  });
});
