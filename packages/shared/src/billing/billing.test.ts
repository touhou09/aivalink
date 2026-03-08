import { describe, expect, it } from "vitest";

import {
  applyPaymentResult,
  calculateBillingFromUsage,
  createSubscription,
  determineAccess,
  type PlanDefinition,
  type UsageSnapshot,
} from "./billing";

const plans: PlanDefinition[] = [
  { id: "free", monthlyPriceKrw: 0, includedTokens: 1000, overagePer1kTokensKrw: 0 },
  { id: "pro", monthlyPriceKrw: 12900, includedTokens: 100000, overagePer1kTokensKrw: 120 },
];

describe("billing", () => {
  it("creates an active sandbox subscription after successful payment", () => {
    const subscription = createSubscription({
      userId: "u1",
      planId: "pro",
      provider: "sandbox",
      startedAt: "2026-03-01T00:00:00.000Z",
    });

    const updated = applyPaymentResult(subscription, {
      paymentId: "pay_1",
      success: true,
      paidAt: "2026-03-01T00:01:00.000Z",
    });

    expect(updated.status).toBe("active");
    expect(updated.lastPaymentId).toBe("pay_1");
    expect(determineAccess(updated)).toBe("allowed");
  });

  it("blocks access on failed payment", () => {
    const subscription = createSubscription({
      userId: "u1",
      planId: "pro",
      provider: "sandbox",
      startedAt: "2026-03-01T00:00:00.000Z",
    });

    const updated = applyPaymentResult(subscription, {
      paymentId: "pay_2",
      success: false,
      failedAt: "2026-03-01T00:01:00.000Z",
    });

    expect(updated.status).toBe("past_due");
    expect(determineAccess(updated)).toBe("blocked");
  });

  it("keeps usage and billing consistent for overage", () => {
    const usage: UsageSnapshot = {
      userId: "u1",
      periodStart: "2026-03-01T00:00:00.000Z",
      periodEnd: "2026-03-31T23:59:59.999Z",
      inputTokens: 120_000,
      outputTokens: 40_000,
    };

    const result = calculateBillingFromUsage(plans[1], usage);

    expect(result.totalTokens).toBe(160_000);
    expect(result.includedTokens).toBe(100_000);
    expect(result.overageTokens).toBe(60_000);
    expect(result.overageChargeKrw).toBe(7200);
    expect(result.totalChargeKrw).toBe(20100);
  });
});
