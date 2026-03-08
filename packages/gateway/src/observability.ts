export interface AlertThresholds {
  maxErrorRate: number;
  maxP95LatencyMs: number;
  maxCostUnitsPerMinute: number;
}

export interface AlertStatus {
  id: "error_rate" | "latency_p95" | "cost_burn";
  state: "ok" | "firing";
  value: number;
  threshold: number;
}

export interface KpiSnapshot {
  generatedAt: string;
  activeSessions: number;
  chat: {
    total: number;
    failures: number;
    errorRate: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
  };
  cost: {
    totalUnits: number;
    unitsPerMinute: number;
  };
  errorsByCode: Record<string, number>;
}

interface ChatEvent {
  latencyMs: number;
  success: boolean;
  costUnits: number;
  errorCode?: string;
  ts: number;
}

const WINDOW_MS = 60_000;

export class GatewayObservability {
  private readonly events: ChatEvent[] = [];
  private activeSessions = 0;

  recordSessionCount(count: number): void {
    this.activeSessions = Math.max(0, count);
  }

  recordChatSuccess(input: { latencyMs: number; costUnits: number }): void {
    this.events.push({
      latencyMs: Math.max(0, input.latencyMs),
      success: true,
      costUnits: Math.max(0, input.costUnits),
      ts: Date.now(),
    });
    this.compact();
  }

  recordChatFailure(input: { latencyMs: number; errorCode: string }): void {
    this.events.push({
      latencyMs: Math.max(0, input.latencyMs),
      success: false,
      costUnits: 0,
      errorCode: input.errorCode,
      ts: Date.now(),
    });
    this.compact();
  }

  snapshot(): KpiSnapshot {
    this.compact();

    const total = this.events.length;
    const failures = this.events.filter((e) => !e.success).length;
    const latencies = this.events.map((e) => e.latencyMs).sort((a, b) => a - b);
    const latencySum = latencies.reduce((sum, n) => sum + n, 0);
    const p95Index = total > 0 ? Math.min(total - 1, Math.ceil(total * 0.95) - 1) : 0;
    const totalCostUnits = this.events.reduce((sum, e) => sum + e.costUnits, 0);

    const errorsByCode = this.events
      .filter((e) => e.errorCode)
      .reduce<Record<string, number>>((acc, e) => {
      const key = e.errorCode as string;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    return {
      generatedAt: new Date().toISOString(),
      activeSessions: this.activeSessions,
      chat: {
        total,
        failures,
        errorRate: total === 0 ? 0 : failures / total,
        avgLatencyMs: total === 0 ? 0 : latencySum / total,
        p95LatencyMs: total === 0 ? 0 : latencies[p95Index] ?? 0,
      },
      cost: {
        totalUnits: totalCostUnits,
        unitsPerMinute: totalCostUnits,
      },
      errorsByCode,
    };
  }

  private compact(): void {
    const cutoff = Date.now() - WINDOW_MS;
    while (this.events.length > 0 && this.events[0].ts < cutoff) {
      this.events.shift();
    }
  }
}

export function evaluateAlerts(snapshot: KpiSnapshot, thresholds: AlertThresholds): AlertStatus[] {
  return [
    {
      id: "error_rate",
      state: snapshot.chat.errorRate > thresholds.maxErrorRate ? "firing" : "ok",
      value: snapshot.chat.errorRate,
      threshold: thresholds.maxErrorRate,
    },
    {
      id: "latency_p95",
      state: snapshot.chat.p95LatencyMs > thresholds.maxP95LatencyMs ? "firing" : "ok",
      value: snapshot.chat.p95LatencyMs,
      threshold: thresholds.maxP95LatencyMs,
    },
    {
      id: "cost_burn",
      state: snapshot.cost.unitsPerMinute > thresholds.maxCostUnitsPerMinute ? "firing" : "ok",
      value: snapshot.cost.unitsPerMinute,
      threshold: thresholds.maxCostUnitsPerMinute,
    },
  ];
}
