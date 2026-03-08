import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { join } from "path";
import { tmpdir } from "os";

import { DatabaseManager } from "./sqlite";
import { UserRepository } from "./user-repository";
import { BillingRepository } from "./billing-repository";

function makeTempDb(): DatabaseManager {
  const dbPath = join(tmpdir(), `aiva-billing-${nanoid()}.db`);
  const mgr = new DatabaseManager(dbPath);
  mgr.migrate();
  return mgr;
}

describe("BillingRepository", () => {
  let dbMgr: DatabaseManager;
  let users: UserRepository;
  let billing: BillingRepository;

  beforeEach(() => {
    dbMgr = makeTempDb();
    users = new UserRepository(dbMgr.instance);
    billing = new BillingRepository(dbMgr.instance);

    users.create({
      id: "u-1",
      email: "u@example.com",
      displayName: "Billing User",
      authProvider: "google",
      avatarUrl: null,
    });
  });

  afterEach(() => {
    dbMgr.close();
  });

  it("tracks billing lifecycle from plan/subscription to invoice payment", () => {
    billing.upsertPlan({
      id: "pro",
      name: "Pro",
      monthlyPrice: 12900,
      monthlyQuota: 100_000,
      overageUnitPrice: 120,
      active: true,
    });

    const plan = billing.findPlanById("pro");
    expect(plan?.name).toBe("Pro");

    const sub = billing.activateSubscription(
      "u-1",
      "pro",
      "2026-03-01T00:00:00.000Z",
      "2026-03-31T23:59:59.999Z",
    );
    expect(sub.status).toBe("active");

    const usage = billing.recordUsage("u-1", "tokens", 60_000, "req-1");
    expect(usage?.subscriptionId).toBe(sub.id);
    expect(usage?.amount).toBe(7_200_000);

    const invoice = billing.createInvoiceForPeriod(
      "u-1",
      "1970-01-01T00:00:00.000Z",
      "2999-01-01T00:00:00.000Z",
    );
    expect(invoice.status).toBe("pending");
    expect(invoice.subtotal).toBeGreaterThan(0);

    billing.updateInvoiceStatus(invoice.id, "paid", "pay_1");

    const state = billing.getPaymentState("u-1");
    expect(state.subscriptionStatus).toBe("active");
    expect(state.latestInvoiceStatus).toBe("paid");
    expect(state.requiresPayment).toBe(false);
  });
});
