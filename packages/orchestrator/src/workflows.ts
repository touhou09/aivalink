export type WorkflowTemplateType = "code_generation" | "document_analysis" | "automation_template";

export interface WorkflowStep {
  type: "plan" | "implement" | "verify" | "approval" | "deliver" | "collect" | "extract" | "analyze" | "prepare" | "execute";
  description: string;
  retry?: {
    maxRetries: number;
  };
}

export interface WorkflowTemplate {
  name: WorkflowTemplateType;
  title: string;
  steps: WorkflowStep[];
}

export interface BuildWorkflowInput {
  request?: string;
  language?: string;
  requiresApproval?: boolean;
  source?: string;
  question?: string;
  goal?: string;
}

export interface WorkflowState {
  status: "running" | "waiting_approval" | "retrying" | "failed";
  currentStep: string;
  retries: number;
  maxRetries: number;
  waitingApproval: boolean;
}

export type WorkflowEvent =
  | { type: "approval_requested" }
  | { type: "approval_granted" }
  | { type: "step_failed" };

export function buildWorkflowTemplate(type: WorkflowTemplateType, input: BuildWorkflowInput): WorkflowTemplate {
  switch (type) {
    case "code_generation":
      return {
        name: "code_generation",
        title: `${input.language ?? "code"} generation workflow`,
        steps: [
          { type: "plan", description: `Break down request: ${input.request ?? "implement feature"}` },
          { type: "implement", description: "Apply minimal code changes" },
          { type: "verify", description: "Run test and lint verification" },
          ...(input.requiresApproval
            ? [{ type: "approval", description: "Wait for human approval before delivery" } as const]
            : []),
          { type: "deliver", description: "Deliver patch + verification logs" },
        ],
      };
    case "document_analysis":
      return {
        name: "document_analysis",
        title: "document analysis workflow",
        steps: [
          { type: "collect", description: `Collect source: ${input.source ?? "unknown source"}` },
          { type: "extract", description: "Extract key text and metadata" },
          { type: "analyze", description: `Answer question: ${input.question ?? "summarize"}` },
          { type: "deliver", description: "Deliver concise analysis" },
        ],
      };
    case "automation_template":
      return {
        name: "automation_template",
        title: "automation workflow template",
        steps: [
          { type: "prepare", description: `Prepare execution context for goal: ${input.goal ?? "automation"}` },
          { type: "execute", description: "Execute automation pipeline", retry: { maxRetries: 2 } },
          { type: "approval", description: "Request approval for side-effects" },
          { type: "deliver", description: "Report run result and checklist" },
        ],
      };
  }
}

export function transitionWorkflow(state: WorkflowState, event: WorkflowEvent): WorkflowState {
  if (event.type === "approval_requested") {
    return {
      ...state,
      status: "waiting_approval",
      waitingApproval: true,
    };
  }

  if (event.type === "approval_granted") {
    return {
      ...state,
      status: "running",
      waitingApproval: false,
    };
  }

  if (state.retries < state.maxRetries) {
    return {
      ...state,
      status: "retrying",
      retries: state.retries + 1,
    };
  }

  return {
    ...state,
    status: "failed",
  };
}
