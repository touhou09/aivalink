// JSON-RPC 2.0 base
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  params: Record<string, unknown>;
  id: string;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  result?: unknown;
  error?: JsonRpcError;
  id: string;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// GoClaw-specific methods
export type GoClawMethod =
  | "execute_task"
  | "cancel_task"
  | "get_task_status"
  | "list_tools"
  | "health";

// Task execution
export interface ExecuteTaskParams {
  taskId: string;
  instruction: string;
  tools?: string[];
  context?: Record<string, unknown>;
  timeout?: number;
}

export interface TaskStatusResult {
  taskId: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  progress?: number;
  result?: string;
  error?: string;
}

export interface ToolInfo {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
