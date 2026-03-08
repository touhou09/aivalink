/**
 * MCP (Model Context Protocol) types for the gateway
 */

export type RiskLevel = "low" | "medium" | "high";
export type ToolSource = "local" | "cloud";

export interface McpTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  source: ToolSource;
  riskLevel: RiskLevel;
}

export interface McpToolCallRequest {
  requestId: string;
  tool: string;
  args: Record<string, unknown>;
  userId: string;
  requiresApproval: boolean;
}

export interface McpToolCallResult {
  requestId: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}
