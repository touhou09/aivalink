import { describe, expect, it } from "vitest";
import {
  GatewayObservability,
  evaluateAlerts,
  type AlertThresholds,
} from "./observability";

describe("GatewayObservability", () => {
  it("aggregates quality/cost/latency/failure KPIs", () => {
    const obs = new GatewayObservability();

    obs.recordSessionCount(4);
    obs.recordChatSuccess({ latencyMs: 120, costUnits: 3 });
    obs.recordChatSuccess({ latencyMs: 80, costUnits: 2 });
    obs.recordChatFailure({ latencyMs: 200, errorCode: "INTERNAL_ERROR" });

    const kpi = obs.snapshot();

    expect(kpi.activeSessions).toBe(4);
    expect(kpi.chat.total).toBe(3);
    expect(kpi.chat.failures).toBe(1);
    expect(kpi.chat.errorRate).toBeCloseTo(1 / 3, 4);
    expect(kpi.chat.p95LatencyMs).toBe(200);
    expect(kpi.chat.avgLatencyMs).toBeCloseTo((120 + 80 + 200) / 3, 4);
    expect(kpi.cost.totalUnits).toBe(5);
  });

  it("returns alert statuses against thresholds", () => {
    const obs = new GatewayObservability();
    const thresholds: AlertThresholds = {
      maxErrorRate: 0.1,
      maxP95LatencyMs: 150,
      maxCostUnitsPerMinute: 2,
    };

    obs.recordChatSuccess({ latencyMs: 100, costUnits: 1 });
    obs.recordChatFailure({ latencyMs: 250, errorCode: "INTERNAL_ERROR" });
    obs.recordChatFailure({ latencyMs: 220, errorCode: "INTERNAL_ERROR" });

    const alerts = evaluateAlerts(obs.snapshot(), thresholds);

    expect(alerts.find((a) => a.id === "error_rate")?.state).toBe("firing");
    expect(alerts.find((a) => a.id === "latency_p95")?.state).toBe("firing");
    expect(alerts.find((a) => a.id === "cost_burn")?.state).toBe("ok");
  });
});
