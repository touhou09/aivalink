import type { Pool } from "pg";
import { nanoid } from "nanoid";

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";
export type InvoiceStatus = "pending" | "paid" | "past_due" | "failed";

export interface PlanInput { id: string; name: string; monthlyPrice: number; monthlyQuota: number; overageUnitPrice: number; active: boolean; }
export type BillingPlan = PlanInput;
export interface Subscription { id: string; userId: string; planId: string; status: SubscriptionStatus; currentPeriodStart: string; currentPeriodEnd: string; }
export interface UsageRecord { id: string; userId: string; subscriptionId: string; metric: string; quantity: number; unitPrice: number; amount: number; referenceId: string | null; }
export interface Invoice { id: string; userId: string; subscriptionId: string; periodStart: string; periodEnd: string; subtotal: number; status: InvoiceStatus; externalPaymentId?: string | null; paidAt?: string | null; }
export interface PaymentState { subscriptionStatus: SubscriptionStatus | "none"; latestInvoiceStatus: InvoiceStatus | "none"; requiresPayment: boolean; }

export class BillingRepository {
  constructor(private db: Pool) {}

  async upsertPlan(plan: PlanInput): Promise<BillingPlan> {
    await this.db.query(
      `INSERT INTO billing_plans (id,name,monthly_price,monthly_quota,overage_unit_price,active)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT(id) DO UPDATE SET
         name=EXCLUDED.name,
         monthly_price=EXCLUDED.monthly_price,
         monthly_quota=EXCLUDED.monthly_quota,
         overage_unit_price=EXCLUDED.overage_unit_price,
         active=EXCLUDED.active,
         updated_at=NOW()`,
      [plan.id, plan.name, plan.monthlyPrice, plan.monthlyQuota, plan.overageUnitPrice, plan.active],
    );
    return (await this.findPlanById(plan.id))!;
  }

  async findPlanById(planId: string): Promise<BillingPlan | undefined> {
    const result = await this.db.query<{
      id: string; name: string; monthly_price: number; monthly_quota: number; overage_unit_price: number; active: boolean;
    }>(
      "SELECT id,name,monthly_price,monthly_quota,overage_unit_price,active FROM billing_plans WHERE id = $1",
      [planId],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return { id: row.id, name: row.name, monthlyPrice: row.monthly_price, monthlyQuota: row.monthly_quota, overageUnitPrice: row.overage_unit_price, active: Boolean(row.active) };
  }

  async activateSubscription(userId: string, planId: string, periodStart: string, periodEnd: string): Promise<Subscription> {
    const existing = await this.getLatestSubscription(userId);
    if (existing) {
      await this.db.query(
        "UPDATE billing_subscriptions SET status='canceled', updated_at=NOW() WHERE id = $1",
        [existing.id],
      );
    }
    const id = nanoid();
    await this.db.query(
      "INSERT INTO billing_subscriptions (id,user_id,plan_id,status,current_period_start,current_period_end) VALUES ($1, $2, $3, 'active', $4, $5)",
      [id, userId, planId, periodStart, periodEnd],
    );
    return (await this.getLatestSubscription(userId))!;
  }

  async getLatestSubscription(userId: string): Promise<Subscription | undefined> {
    const result = await this.db.query<{
      id: string; user_id: string; plan_id: string; status: SubscriptionStatus; current_period_start: string; current_period_end: string;
    }>(
      "SELECT id,user_id,plan_id,status,current_period_start,current_period_end FROM billing_subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
      [userId],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return { id: row.id, userId: row.user_id, planId: row.plan_id, status: row.status, currentPeriodStart: row.current_period_start, currentPeriodEnd: row.current_period_end };
  }

  async recordUsage(userId: string, metric: string, quantity: number, referenceId?: string): Promise<UsageRecord | undefined>;
  async recordUsage(input: Omit<UsageRecord, "referenceId"> & { referenceId?: string | null }): Promise<UsageRecord>;
  async recordUsage(
    userIdOrInput: string | (Omit<UsageRecord, "referenceId"> & { referenceId?: string | null }),
    metric?: string,
    quantity?: number,
    referenceId?: string,
  ): Promise<UsageRecord | undefined> {
    if (typeof userIdOrInput === "object") {
      return this.recordUsageInput(userIdOrInput);
    }

    const userId = userIdOrInput;
    const subscription = await this.getLatestSubscription(userId);
    if (!subscription || subscription.status === "canceled") return undefined;
    const plan = await this.findPlanById(subscription.planId);
    if (!plan) return undefined;
    const normalizedQty = Math.max(0, quantity ?? 0);
    const amount = Number((normalizedQty * plan.overageUnitPrice).toFixed(8));
    const id = nanoid();
    await this.db.query(
      "INSERT INTO usage_records (id,user_id,subscription_id,metric,quantity,unit_price,amount,reference_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      [id, userId, subscription.id, metric ?? "usage", normalizedQty, plan.overageUnitPrice, amount, referenceId ?? null],
    );
    return { id, userId, subscriptionId: subscription.id, metric: metric ?? "usage", quantity: normalizedQty, unitPrice: plan.overageUnitPrice, amount, referenceId: referenceId ?? null };
  }

  async createInvoiceForPeriod(userId: string, periodStart: string, periodEnd: string): Promise<Invoice> {
    const subscription = await this.getLatestSubscription(userId);
    if (!subscription) throw new Error(`No subscription for user ${userId}`);
    const result = await this.db.query<{ subtotal: string }>(
      "SELECT COALESCE(SUM(amount),0)::text AS subtotal FROM usage_records WHERE user_id = $1 AND created_at >= $2::timestamptz AND created_at < $3::timestamptz",
      [userId, periodStart, periodEnd],
    );
    const subtotal = Number(result.rows[0]?.subtotal ?? 0);
    const id = nanoid();
    await this.db.query(
      "INSERT INTO invoices (id,user_id,subscription_id,period_start,period_end,subtotal,status) VALUES ($1, $2, $3, $4, $5, $6, 'pending')",
      [id, userId, subscription.id, periodStart, periodEnd, subtotal],
    );
    return { id, userId, subscriptionId: subscription.id, periodStart, periodEnd, subtotal, status: "pending" };
  }

  async updateInvoiceStatus(invoiceId: string, status: InvoiceStatus, paymentRef?: string): Promise<void> {
    await this.db.query(
      `UPDATE invoices
       SET status = $1,
           external_payment_id = COALESCE($2, external_payment_id),
           paid_at = CASE WHEN $3 = 'paid' THEN NOW() ELSE paid_at END,
           updated_at = NOW()
       WHERE id = $4`,
      [status, paymentRef ?? null, status, invoiceId],
    );
    const invoiceResult = await this.db.query<{ subscription_id: string }>(
      "SELECT subscription_id FROM invoices WHERE id = $1",
      [invoiceId],
    );
    const invoice = invoiceResult.rows[0];
    if (!invoice) return;
    const subStatus: SubscriptionStatus = status === "paid" || status === "pending" ? "active" : "past_due";
    await this.db.query(
      "UPDATE billing_subscriptions SET status = $1, updated_at=NOW() WHERE id = $2",
      [subStatus, invoice.subscription_id],
    );
  }

  async getPaymentState(userId: string): Promise<PaymentState> {
    const subscription = await this.getLatestSubscription(userId);
    if (!subscription) return { subscriptionStatus: "none", latestInvoiceStatus: "none", requiresPayment: false };
    const invoiceResult = await this.db.query<{ status: InvoiceStatus }>(
      "SELECT status FROM invoices WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
      [userId],
    );
    const latestInvoiceStatus = invoiceResult.rows[0]?.status ?? "none";
    return {
      subscriptionStatus: subscription.status,
      latestInvoiceStatus,
      requiresPayment: subscription.status === "past_due" || latestInvoiceStatus === "past_due" || latestInvoiceStatus === "failed",
    };
  }

  async createSubscription(input: Subscription): Promise<Subscription> {
    await this.db.query(
      "INSERT INTO billing_subscriptions (id,user_id,plan_id,status,current_period_start,current_period_end) VALUES ($1, $2, $3, $4, $5, $6)",
      [input.id, input.userId, input.planId, input.status, input.currentPeriodStart, input.currentPeriodEnd],
    );
    return input;
  }

  async recordUsageInput(input: Omit<UsageRecord, "referenceId"> & { referenceId?: string | null }): Promise<UsageRecord> {
    await this.db.query(
      "INSERT INTO usage_records (id,user_id,subscription_id,metric,quantity,unit_price,amount,reference_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      [input.id, input.userId, input.subscriptionId, input.metric, input.quantity, input.unitPrice, input.amount, input.referenceId ?? null],
    );
    return { ...input, referenceId: input.referenceId ?? null };
  }

  async listUsageBySubscription(subscriptionId: string): Promise<UsageRecord[]> {
    const result = await this.db.query<{
      id: string; user_id: string; subscription_id: string; metric: string; quantity: number; unit_price: number; amount: number; reference_id: string | null;
    }>(
      "SELECT id,user_id,subscription_id,metric,quantity,unit_price,amount,reference_id FROM usage_records WHERE subscription_id = $1 ORDER BY created_at ASC",
      [subscriptionId],
    );
    return result.rows.map((r) => ({ id: r.id, userId: r.user_id, subscriptionId: r.subscription_id, metric: r.metric, quantity: r.quantity, unitPrice: r.unit_price, amount: r.amount, referenceId: r.reference_id }));
  }

  async createInvoice(input: Invoice): Promise<Invoice> {
    await this.db.query(
      "INSERT INTO invoices (id,user_id,subscription_id,period_start,period_end,subtotal,status,external_payment_id,paid_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
      [input.id, input.userId, input.subscriptionId, input.periodStart, input.periodEnd, input.subtotal, input.status, input.externalPaymentId ?? null, input.paidAt ?? null],
    );
    return input;
  }

  async applyPaymentState(invoiceId: string, paymentRef: string, result: "success" | "past_due" | "failed"): Promise<Invoice | undefined> {
    const status: InvoiceStatus = result === "success" ? "paid" : result;
    await this.updateInvoiceStatus(invoiceId, status, paymentRef);
    const invoiceResult = await this.db.query<{
      id: string; user_id: string; subscription_id: string; period_start: string; period_end: string; subtotal: number; status: InvoiceStatus; external_payment_id: string | null; paid_at: string | null;
    }>(
      "SELECT id,user_id,subscription_id,period_start,period_end,subtotal,status,external_payment_id,paid_at FROM invoices WHERE id = $1",
      [invoiceId],
    );
    const row = invoiceResult.rows[0];
    if (!row) return undefined;
    return { id: row.id, userId: row.user_id, subscriptionId: row.subscription_id, periodStart: row.period_start, periodEnd: row.period_end, subtotal: row.subtotal, status: row.status, externalPaymentId: row.external_payment_id, paidAt: row.paid_at };
  }
}
