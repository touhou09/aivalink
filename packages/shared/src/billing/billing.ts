export type SubscriptionStatus = "pending" | "active" | "past_due" | "canceled";
export type AccessState = "allowed" | "blocked";

export interface PlanDefinition {
  id: string;
  monthlyPriceKrw: number;
  includedTokens: number;
  overagePer1kTokensKrw: number;
}

export interface Subscription {
  userId: string;
  planId: string;
  provider: "sandbox" | "production";
  status: SubscriptionStatus;
  startedAt: string;
  updatedAt: string;
  lastPaymentId?: string;
}

export interface UsageSnapshot {
  userId: string;
  periodStart: string;
  periodEnd: string;
  inputTokens: number;
  outputTokens: number;
}

export interface PaymentResult {
  paymentId: string;
  success: boolean;
  paidAt?: string;
  failedAt?: string;
}

export interface BillingResult {
  totalTokens: number;
  includedTokens: number;
  overageTokens: number;
  overageChargeKrw: number;
  totalChargeKrw: number;
}

export function createSubscription(params: {
  userId: string;
  planId: string;
  provider: "sandbox" | "production";
  startedAt: string;
}): Subscription {
  return {
    userId: params.userId,
    planId: params.planId,
    provider: params.provider,
    status: "pending",
    startedAt: params.startedAt,
    updatedAt: params.startedAt,
  };
}

export function applyPaymentResult(subscription: Subscription, payment: PaymentResult): Subscription {
  return {
    ...subscription,
    status: payment.success ? "active" : "past_due",
    updatedAt: payment.paidAt ?? payment.failedAt ?? subscription.updatedAt,
    lastPaymentId: payment.paymentId,
  };
}

export function determineAccess(subscription: Subscription): AccessState {
  return subscription.status === "active" ? "allowed" : "blocked";
}

export function calculateBillingFromUsage(plan: PlanDefinition, usage: UsageSnapshot): BillingResult {
  const totalTokens = usage.inputTokens + usage.outputTokens;
  const overageTokens = Math.max(0, totalTokens - plan.includedTokens);
  const overageUnits = Math.ceil(overageTokens / 1000);
  const overageChargeKrw = overageUnits * plan.overagePer1kTokensKrw;

  return {
    totalTokens,
    includedTokens: plan.includedTokens,
    overageTokens,
    overageChargeKrw,
    totalChargeKrw: plan.monthlyPriceKrw + overageChargeKrw,
  };
}
