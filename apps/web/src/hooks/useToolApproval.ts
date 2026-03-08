import { useCallback, useState } from "react";

export interface PendingApproval {
  taskId: string;
  toolName: string;
  description: string;
  risk: "low" | "medium" | "high";
  actionType: string;
  actionTarget: string;
}

export interface UseToolApprovalOptions {
  /** Called when the user approves a tool call. Sends exec_approval_response over WS. */
  onApprove: (taskId: string) => void;
  /** Called when the user rejects a tool call. Sends exec_approval_response over WS. */
  onReject: (taskId: string) => void;
}

export interface UseToolApprovalReturn {
  pendingApproval: PendingApproval | null;
  /** Call this when an exec_approval_request message arrives from the server */
  handleApprovalRequest: (msg: Record<string, unknown>) => void;
  approve: (taskId: string) => void;
  reject: (taskId: string) => void;
}

export function useToolApproval(options: UseToolApprovalOptions): UseToolApprovalReturn {
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);

  const handleApprovalRequest = useCallback((msg: Record<string, unknown>) => {
    const taskId = msg.taskId as string | undefined;
    const description = (msg.description as string | undefined) ?? "";
    const action = (msg.action as Record<string, unknown> | undefined) ?? {};

    if (!taskId) return;

    setPendingApproval({
      taskId,
      toolName: (action.type as string | undefined) ?? "unknown",
      description,
      risk: (action.risk as "low" | "medium" | "high" | undefined) ?? "medium",
      actionType: (action.type as string | undefined) ?? "",
      actionTarget: (action.target as string | undefined) ?? "",
    });
  }, []);

  const approve = useCallback(
    (taskId: string) => {
      setPendingApproval(null);
      options.onApprove(taskId);
    },
    [options],
  );

  const reject = useCallback(
    (taskId: string) => {
      setPendingApproval(null);
      options.onReject(taskId);
    },
    [options],
  );

  return { pendingApproval, handleApprovalRequest, approve, reject };
}
