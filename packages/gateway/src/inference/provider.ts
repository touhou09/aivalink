/**
 * Inference Layer — Provider Abstraction
 * Decision D5: Claude Sonnet primary, GPT-4o failover from W5
 * Provider Registry pattern from Phase 1 W1
 *
 * Enhanced with:
 * - Retryable error detection (503/529/timeout/network)
 * - Automatic failover with event logging
 * - Recovery via cooldown expiry or health check
 */

import type { InferenceConfig, InferenceResult } from "@aivalink/shared";

export interface InferenceProvider {
  name: string;
  complete(
    messages: Array<{ role: string; content: string }>,
    config: InferenceConfig,
  ): Promise<InferenceResult>;
  completeStream(
    messages: Array<{ role: string; content: string }>,
    config: InferenceConfig,
  ): AsyncIterable<{ delta: string; done: boolean }>;
  healthCheck(): Promise<boolean>;
}

export interface FailoverEvent {
  timestamp: Date;
  fromProvider: string;
  toProvider: string;
  reason: string;
  errorCode?: string;
  success: boolean;
}

export interface ProviderRegistryOptions {
  cooldownMs?: number;
}

// --- Retryable error detection ---

const RETRYABLE_STATUS_CODES = new Set([503, 529]);
const RETRYABLE_ERROR_CODES = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "ECONNABORTED",
  "UND_ERR_CONNECT_TIMEOUT",
]);

export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const err = error as Error & {
    status?: number;
    code?: string;
    type?: string;
  };

  if (err.status !== undefined && RETRYABLE_STATUS_CODES.has(err.status))
    return true;
  if (err.code && RETRYABLE_ERROR_CODES.has(err.code)) return true;
  if (err.message.toLowerCase().includes("timeout")) return true;
  if (err.type === "overloaded_error") return true;

  return false;
}

// --- Provider Registry ---

export class ProviderRegistry {
  private providers = new Map<string, InferenceProvider>();
  private primaryProvider: string = "";
  private failoverEvents: FailoverEvent[] = [];
  private cooldownMs: number;
  private primaryFailedAt: number | null = null;
  private consecutiveFailures = 0;

  constructor(options?: ProviderRegistryOptions) {
    this.cooldownMs = options?.cooldownMs ?? 60_000;
  }

  register(provider: InferenceProvider, primary = false): void {
    this.providers.set(provider.name, provider);
    if (primary || this.providers.size === 1) {
      this.primaryProvider = provider.name;
    }
  }

  get failoverLog(): readonly FailoverEvent[] {
    return this.failoverEvents;
  }

  get primaryName(): string {
    return this.primaryProvider;
  }

  getProvider(name: string): InferenceProvider | undefined {
    return this.providers.get(name);
  }

  async complete(
    messages: Array<{ role: string; content: string }>,
    config: InferenceConfig,
  ): Promise<InferenceResult> {
    const primary = this.providers.get(this.primaryProvider);
    if (!primary) throw new Error("No provider registered");

    let primaryError: unknown = null;

    // Step 1: Attempt primary if not cooling down (or health check passes)
    if (await this.shouldAttemptPrimary(primary)) {
      try {
        const result = await primary.complete(messages, config);
        this.resetPrimaryState();
        return result;
      } catch (error) {
        if (!isRetryableError(error)) throw error;
        this.recordPrimaryFailure();
        primaryError = error;
      }
    }

    // Step 2: Failover to secondary providers
    const { reason, code } = primaryError
      ? extractErrorInfo(primaryError)
      : { reason: "primary_cooldown", code: undefined };

    for (const [name, provider] of this.providers) {
      if (name === this.primaryProvider) continue;
      try {
        const result = await provider.complete(messages, config);
        this.logFailover(this.primaryProvider, name, reason, code, true);
        return result;
      } catch {
        this.logFailover(this.primaryProvider, name, reason, code, false);
        continue;
      }
    }

    throw primaryError ?? new Error("All providers failed");
  }

  // --- Internal helpers ---

  private async shouldAttemptPrimary(
    primary: InferenceProvider,
  ): Promise<boolean> {
    if (!this.isPrimaryCoolingDown()) return true;

    // During cooldown, attempt recovery via health check
    try {
      return await primary.healthCheck();
    } catch {
      return false;
    }
  }

  private isPrimaryCoolingDown(): boolean {
    if (this.primaryFailedAt === null) return false;
    return Date.now() < this.primaryFailedAt + this.cooldownMs;
  }

  private recordPrimaryFailure(): void {
    this.primaryFailedAt = Date.now();
    this.consecutiveFailures++;
  }

  private resetPrimaryState(): void {
    this.primaryFailedAt = null;
    this.consecutiveFailures = 0;
  }

  private logFailover(
    fromProvider: string,
    toProvider: string,
    reason: string,
    errorCode: string | undefined,
    success: boolean,
  ): void {
    this.failoverEvents.push({
      timestamp: new Date(),
      fromProvider,
      toProvider,
      reason,
      errorCode,
      success,
    });
  }
}

function extractErrorInfo(error: unknown): { reason: string; code?: string } {
  if (error instanceof Error) {
    const err = error as Error & { status?: number; code?: string };
    return {
      reason: err.message,
      code: err.code ?? (err.status ? String(err.status) : undefined),
    };
  }
  return { reason: String(error) };
}
