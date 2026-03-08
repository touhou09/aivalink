type TunnelSocket = {
  onopen?: () => void;
  onclose?: () => void;
  onmessage?: (event: { data: string }) => void;
  send: (data: string) => void;
};

type ReverseMcpTunnelOptions = {
  url: string;
  token: string;
  wsFactory?: (url: string) => TunnelSocket;
  scheduleReconnect?: (attempt: number, reconnect: () => void) => void;
};

export class ReverseMcpTunnel {
  private socket?: TunnelSocket;
  private connected = false;
  private reconnectAttempts = 0;

  constructor(private readonly options: ReverseMcpTunnelOptions) {}

  start(): void {
    const wsFactory =
      this.options.wsFactory ??
      ((url: string) => {
        const WebSocketCtor = (globalThis as { WebSocket?: new (u: string) => unknown }).WebSocket;
        if (!WebSocketCtor) {
          throw new Error("WebSocket runtime is not available");
        }
        return new WebSocketCtor(url) as TunnelSocket;
      });

    const socket = wsFactory(this.options.url);
    this.socket = socket;

    socket.onopen = () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      socket.send(JSON.stringify({ type: "register", token: this.options.token }));
    };

    socket.onclose = () => {
      this.connected = false;
      this.reconnectAttempts += 1;

      const scheduleReconnect =
        this.options.scheduleReconnect ??
        ((attempt: number, reconnect: () => void) => {
          const delayMs = Math.min(1000 * 2 ** (attempt - 1), 10000);
          setTimeout(reconnect, delayMs);
        });

      scheduleReconnect(this.reconnectAttempts, () => this.start());
    };
  }

  getHealth(): { connected: boolean; reconnectAttempts: number } {
    return {
      connected: this.connected,
      reconnectAttempts: this.reconnectAttempts,
    };
  }
}
