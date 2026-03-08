import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  ExecuteTaskParams,
  TaskStatusResult,
  ToolInfo,
} from './types';

export interface GoClawAdapterOptions {
  url: string;
  reconnectIntervalMs?: number;
  maxReconnectAttempts?: number;
  requestTimeoutMs?: number;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class GoClawAdapter {
  private ws: WebSocket | null = null;
  private connected = false;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private options: GoClawAdapterOptions) {}

  connect(): void {
    if (this.ws) return;

    this.ws = new WebSocket(this.options.url);

    this.ws.on('open', () => {
      this.connected = true;
      this.reconnectAttempts = 0;
    });

    this.ws.on('message', (data: WebSocket.RawData) => {
      this.handleMessage(data.toString());
    });

    this.ws.on('close', () => {
      this.connected = false;
      this.ws = null;
      this.scheduleReconnect();
    });

    this.ws.on('error', () => {
      this.connected = false;
    });
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Adapter disconnected'));
      this.pendingRequests.delete(id);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async executeTask(params: ExecuteTaskParams): Promise<TaskStatusResult> {
    return this.sendRequest('execute_task', params as unknown as Record<string, unknown>) as Promise<TaskStatusResult>;
  }

  async cancelTask(taskId: string): Promise<void> {
    await this.sendRequest('cancel_task', { taskId });
  }

  async getTaskStatus(taskId: string): Promise<TaskStatusResult> {
    return this.sendRequest('get_task_status', { taskId }) as Promise<TaskStatusResult>;
  }

  async listTools(): Promise<ToolInfo[]> {
    return this.sendRequest('list_tools', {}) as Promise<ToolInfo[]>;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.sendRequest('health', {});
      return true;
    } catch {
      return false;
    }
  }

  private sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.connected || !this.ws) {
        reject(new Error('GoClawAdapter: not connected'));
        return;
      }

      const id = randomUUID();
      const timeoutMs = this.options.requestTimeoutMs ?? 30_000;

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`GoClawAdapter: request ${id} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });

      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method,
        params,
        id,
      };

      this.ws.send(JSON.stringify(request), (err) => {
        if (err) {
          clearTimeout(timer);
          this.pendingRequests.delete(id);
          reject(err);
        }
      });
    });
  }

  private handleMessage(data: string): void {
    let response: JsonRpcResponse;
    try {
      response = JSON.parse(data) as JsonRpcResponse;
    } catch {
      return;
    }

    const pending = this.pendingRequests.get(response.id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(
        new Error(`GoClawAdapter RPC error ${response.error.code}: ${response.error.message}`)
      );
    } else {
      pending.resolve(response.result);
    }
  }

  private scheduleReconnect(): void {
    const max = this.options.maxReconnectAttempts ?? 5;
    if (this.reconnectAttempts >= max) return;

    const intervalMs = this.options.reconnectIntervalMs ?? 2_000;
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, intervalMs);
  }
}
