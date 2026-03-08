import { describe, expect, it } from "vitest";
import {
  buildWorkflowTemplate,
  transitionWorkflow,
  type WorkflowState,
} from "./workflows";

describe("workflow templates", () => {
  it("creates code-generation workflow with verification + approval", () => {
    const workflow = buildWorkflowTemplate("code_generation", {
      request: "add login endpoint",
      language: "ts",
      requiresApproval: true,
    });

    expect(workflow.name).toBe("code_generation");
    expect(workflow.steps.map((s) => s.type)).toEqual([
      "plan",
      "implement",
      "verify",
      "approval",
      "deliver",
    ]);
  });

  it("creates document-analysis workflow with summarize extraction step", () => {
    const workflow = buildWorkflowTemplate("document_analysis", {
      source: "https://example.com/spec.pdf",
      question: "핵심 리스크를 알려줘",
    });

    expect(workflow.steps.map((s) => s.type)).toEqual([
      "collect",
      "extract",
      "analyze",
      "deliver",
    ]);
  });

  it("creates automation workflow with retry configuration", () => {
    const workflow = buildWorkflowTemplate("automation_template", {
      goal: "매일 리포트 생성",
    });

    const executeStep = workflow.steps.find((step) => step.type === "execute");
    expect(executeStep?.retry?.maxRetries).toBe(2);
  });
});

describe("workflow transition", () => {
  const baseState: WorkflowState = {
    status: "running",
    currentStep: "execute",
    retries: 0,
    maxRetries: 2,
    waitingApproval: false,
  };

  it("moves to waiting_approval when approval is requested", () => {
    const next = transitionWorkflow(baseState, { type: "approval_requested" });
    expect(next.status).toBe("waiting_approval");
    expect(next.waitingApproval).toBe(true);
  });

  it("retries when task fails and retry budget remains", () => {
    const next = transitionWorkflow(baseState, { type: "step_failed" });
    expect(next.status).toBe("retrying");
    expect(next.retries).toBe(1);
  });

  it("fails when retry budget is exhausted", () => {
    const exhausted: WorkflowState = { ...baseState, retries: 2 };
    const next = transitionWorkflow(exhausted, { type: "step_failed" });
    expect(next.status).toBe("failed");
  });

  it("returns to running after approval", () => {
    const waiting: WorkflowState = {
      ...baseState,
      status: "waiting_approval",
      waitingApproval: true,
    };

    const next = transitionWorkflow(waiting, { type: "approval_granted" });
    expect(next.status).toBe("running");
    expect(next.waitingApproval).toBe(false);
  });
});
