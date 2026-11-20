import { z } from "zod";

// ── Input validation for values that end up inside raw SQL ──
// Several report/dashboard queries build SQL strings by hand (sql.raw). Any
// value interpolated there MUST be restricted to a shape that cannot carry SQL.

/** Calendar date "YYYY-MM-DD" (digits and dashes only). */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha invalida (formato esperado AAAA-MM-DD)");

/** Browser timezone offset in hours (e.g. -5, 5.5). Real offsets are within ±14h. */
export const tzOffsetHours = z.number().finite().min(-14).max(14);

// ── In-memory rate limiting ──
// Good enough for a single server instance. Counters reset on restart.

type Bucket = { count: number; resetAt: number };

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private readonly max: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(max: number, windowMs: number, now: () => number = Date.now) {
    this.max = max;
    this.windowMs = windowMs;
    this.now = now;
  }

  /**
   * Records one attempt for `key` and returns false if the limit is exceeded.
   * Synchronous on purpose: callers must invoke it before any `await`, so that
   * concurrent requests (e.g. a tRPC batch) can't all pass the check at once.
   */
  consume(key: string): boolean {
    const t = this.now();
    this.sweep(t);
    const b = this.buckets.get(key);
    if (!b || t >= b.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: t + this.windowMs });
      return true;
    }
    if (b.count >= this.max) return false;
    b.count++;
    return true;
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  private sweep(t: number) {
    if (this.buckets.size < 10_000) return;
    for (const [k, b] of this.buckets) if (t >= b.resetAt) this.buckets.delete(k);
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
