/**
 * MCP Tool Server
 * Manages tool registration, execution, and approval flows
 */

import type { McpTool, McpToolCallRequest, McpToolCallResult } from "./types";

export type { McpTool, McpToolCallRequest, McpToolCallResult };

const HIGH_RISK_TOOLS = new Set(["write_file", "execute_command"]);

export class McpServer {
  private readonly tools = new Map<string, McpTool>();
  private readonly pendingApprovals = new Map<string, {
    request: McpToolCallRequest;
    resolve: (approved: boolean) => void;
  }>();

  constructor() {
    this.registerBuiltins();
  }

  private registerBuiltins(): void {
    const builtins: McpTool[] = [
      {
        name: "read_file",
        description: "Read the contents of a file at the given path",
        parameters: {
          path: { type: "string", description: "Absolute path to the file" },
        },
        source: "local",
        riskLevel: "low",
      },
      {
        name: "write_file",
        description: "Write content to a file at the given path",
        parameters: {
          path: { type: "string", description: "Absolute path to the file" },
          content: { type: "string", description: "Content to write" },
        },
        source: "local",
        riskLevel: "high",
      },
      {
        name: "execute_command",
        description: "Run a shell command and return its output",
        parameters: {
          command: { type: "string", description: "Shell command to execute" },
          cwd: { type: "string", description: "Working directory (optional)" },
        },
        source: "local",
        riskLevel: "high",
      },
      {
        name: "web_search",
        description: "Search the web and return relevant results",
        parameters: {
          query: { type: "string", description: "Search query" },
          maxResults: { type: "number", description: "Maximum results to return (default 5)" },
        },
        source: "cloud",
        riskLevel: "low",
      },
      {
        name: "memory_query",
        description: "Query the user's stored memories for relevant context",
        parameters: {
          query: { type: "string", description: "Semantic search query" },
          limit: { type: "number", description: "Max memories to return (default 5)" },
        },
        source: "cloud",
        riskLevel: "low",
      },
    ];

    for (const tool of builtins) {
      this.tools.set(tool.name, tool);
    }
  }

  registerTool(tool: McpTool): void {
    this.tools.set(tool.name, tool);
  }

  unregisterTool(name: string): void {
    this.tools.delete(name);
  }

  listTools(): McpTool[] {
    return Array.from(this.tools.values());
  }

  requiresApproval(toolName: string): boolean {
    const tool = this.tools.get(toolName);
    if (!tool) return true; // unknown tools require approval by default
    return HIGH_RISK_TOOLS.has(toolName) || tool.riskLevel === "high";
  }

  async executeToolCall(request: McpToolCallRequest): Promise<McpToolCallResult> {
    const tool = this.tools.get(request.tool);
    if (!tool) {
      return { requestId: request.requestId, ok: false, error: `Unknown tool: ${request.tool}` };
    }

    if (request.requiresApproval) {
      const approved = await this.waitForApproval(request);
      if (!approved) {
        return { requestId: request.requestId, ok: false, error: "APPROVAL_REJECTED" };
      }
    }

    // Stub execution: real implementations would delegate to local/cloud runners
    return {
      requestId: request.requestId,
      ok: true,
      result: { message: `Tool ${request.tool} executed (stub)`, args: request.args },
    };
  }

  private waitForApproval(request: McpToolCallRequest): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.pendingApprovals.set(request.requestId, { request, resolve });
    });
  }

  resolveApproval(requestId: string, approved: boolean): void {
    const pending = this.pendingApprovals.get(requestId);
    if (!pending) return;
    this.pendingApprovals.delete(requestId);
    pending.resolve(approved);
  }

  getPendingApprovals(userId: string): McpToolCallRequest[] {
    const results: McpToolCallRequest[] = [];
    for (const { request } of this.pendingApprovals.values()) {
      if (request.userId === userId) {
        results.push(request);
      }
    }
    return results;
  }
}
