type RelaySocket = { send(data: string): void };

type EndpointState = {
  local?: RelaySocket;
  cloud?: RelaySocket;
};

type ToolCallPayload = {
  type: "tool_call";
  requestId?: string;
  tool?: string;
  args?: unknown;
};

type WsRelayOptions = {
  authorizeToolCall?: (ctx: { agentId: string; requestId: string; tool: string; args: unknown }) => boolean;
};

function safeParse(data: string): Record<string, unknown> | null {
  try {
    return JSON.parse(data) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export class WsRelay {
  private readonly endpoints = new Map<string, EndpointState>();
  private readonly authorizeToolCall: (ctx: { agentId: string; requestId: string; tool: string; args: unknown }) => boolean;

  constructor(options: WsRelayOptions = {}) {
    this.authorizeToolCall = options.authorizeToolCall ?? (() => true);
  }

  private getOrCreate(agentId: string): EndpointState {
    const current = this.endpoints.get(agentId);
    if (current) return current;
    const created: EndpointState = {};
    this.endpoints.set(agentId, created);
    return created;
  }

  attachLocalAgent(agentId: string, socket: RelaySocket): void {
    const state = this.getOrCreate(agentId);
    state.local = socket;
  }

  detachLocalAgent(agentId: string, socket: RelaySocket): void {
    const state = this.endpoints.get(agentId);
    if (!state || state.local !== socket) return;
    delete state.local;
  }

  attachCloudClient(agentId: string, socket: RelaySocket): void {
    const state = this.getOrCreate(agentId);
    state.cloud = socket;
  }

  detachCloudClient(agentId: string, socket: RelaySocket): void {
    const state = this.endpoints.get(agentId);
    if (!state || state.cloud !== socket) return;
    delete state.cloud;
  }

  handleCloudMessage(agentId: string, rawMessage: string): void {
    const state = this.getOrCreate(agentId);
    const message = safeParse(rawMessage) as ToolCallPayload | null;
    if (!message || message.type !== "tool_call") return;

    const requestId = typeof message.requestId === "string" ? message.requestId : "unknown";

    if (!state.local) {
      state.cloud?.send(
        JSON.stringify({
          type: "tool_result",
          requestId,
          ok: false,
          error: "LOCAL_AGENT_UNAVAILABLE",
        }),
      );
      return;
    }

    const tool = typeof message.tool === "string" ? message.tool : "unknown";
    if (!this.authorizeToolCall({ agentId, requestId, tool, args: message.args })) {
      state.cloud?.send(
        JSON.stringify({
          type: "tool_result",
          requestId,
          ok: false,
          error: "TOOL_CALL_FORBIDDEN",
        }),
      );
      return;
    }

    state.local.send(rawMessage);
  }

  handleLocalMessage(agentId: string, rawMessage: string): void {
    const state = this.endpoints.get(agentId);
    if (!state?.cloud) return;

    const message = safeParse(rawMessage);
    if (!message || message.type !== "tool_result") return;

    state.cloud.send(rawMessage);
  }

  getHealth(agentId: string): { localConnected: boolean; cloudConnected: boolean; healthy: boolean } {
    const state = this.endpoints.get(agentId);
    const localConnected = Boolean(state?.local);
    const cloudConnected = Boolean(state?.cloud);
    return {
      localConnected,
      cloudConnected,
      healthy: localConnected && cloudConnected,
    };
  }
}
