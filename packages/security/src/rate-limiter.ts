/**
 * Rate Limiter - Sliding window counter
 * Enforces per-user message rate limits
 */

interface RateWindow {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private windows = new Map<string, RateWindow>();

  constructor(
    private maxRequests: number = 30,
    private windowMs: number = 60_000,
  ) {}

  check(userId: string): { allowed: boolean; retryAfterMs?: number } {
    const now = Date.now();
    const window = this.windows.get(userId);

    if (!window || now >= window.resetAt) {
      this.windows.set(userId, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true };
    }

    if (window.count >= this.maxRequests) {
      return { allowed: false, retryAfterMs: window.resetAt - now };
    }

    window.count++;
    return { allowed: true };
  }

  reset(userId: string): void {
    this.windows.delete(userId);
  }
}
