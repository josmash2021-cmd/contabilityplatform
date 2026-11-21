// ── Category budgets (personal Pro): pure math, no database ──
// A budget is a monthly limit on one spending category. "Spent" is the sum of the month's
// expense transactions in that category, grouped exactly like the personal dashboard's
// "Gastos por categoría" (bank.getMonthData: type === "expense", keyed by category).

export type BudgetStatus = "ok" | "near" | "over";

/** From this percent of the limit on, a budget is "near" (amber). */
export const NEAR_PERCENT = 80;

/** Highest monthly limit accepted (the column is DECIMAL(12,2)). */
export const MAX_BUDGET_LIMIT = 10_000_000;

/** Category keys are database values such as "shopping" or "home_expense" (personalCategories.name is VARCHAR(50)). */
export const CATEGORY_KEY_RE = /^[a-z0-9_]{1,50}$/;

/** Money in whole cents, so comparisons don't trip on float noise (0.1 + 0.2). */
export function toCents(amount: number): number {
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function fromCents(cents: number): number {
  return cents / 100;
}

/** ok below 80% of the limit, near from 80% up to the limit itself, over once spending passes it. */
export function budgetStatus(spent: number, limit: number): BudgetStatus {
  const s = toCents(spent);
  const l = toCents(limit);
  if (l <= 0) return s > 0 ? "over" : "ok";
  if (s > l) return "over";
  if (s * 100 >= l * NEAR_PERCENT) return "near"; // whole numbers: no float rounding at the edge
  return "ok";
}

/** Whole percent of the limit used; can pass 100. A non-positive limit counts as 0%. */
export function budgetPercent(spent: number, limit: number): number {
  const l = toCents(limit);
  if (l <= 0) return 0;
  return Math.max(0, Math.round((toCents(spent) / l) * 100));
}

export type SpendingTx = {
  type?: string | null;
  category?: string | null;
  amount?: string | number | null;
};

/** Expense totals per category key, in dollars rounded to cents. Income is ignored. */
export function spendingByCategory(txs: readonly SpendingTx[]): Map<string, number> {
  const cents = new Map<string, number>();
  for (const t of txs) {
    if (t.type !== "expense") continue;
    const amount = typeof t.amount === "number" ? t.amount : parseFloat(t.amount ?? "0");
    const c = toCents(amount);
    if (c <= 0) continue;
    const key = t.category || "other";
    cents.set(key, (cents.get(key) ?? 0) + c);
  }
  const out = new Map<string, number>();
  for (const [key, c] of cents) out.set(key, fromCents(c));
  return out;
}

/**
 * A friendly starting limit for a category, from what was spent: rounded up to the next
 * $10 (under $100), $50 (under $1,000) or $100. Null when nothing was spent.
 */
export function suggestLimit(spent: number): number | null {
  if (!(spent > 0)) return null;
  const step = spent < 100 ? 10 : spent < 1000 ? 50 : 100;
  const rounded = Math.ceil(toCents(spent) / (step * 100)) * step;
  return Math.min(Math.max(rounded, step), MAX_BUDGET_LIMIT);
}

export type BudgetRow = {
  category: string;
  /** Monthly limit, or null when the category has no budget yet. */
  limit: number | null;
  spent: number;
  percent: number | null;
  status: BudgetStatus | null;
  /** limit - spent (negative once over). Null without a limit. */
  remaining: number | null;
  /** A starting limit for categories without one, from this month's spending. */
  suggestedLimit: number | null;
};

const STATUS_RANK: Record<BudgetStatus, number> = { over: 0, near: 1, ok: 2 };

/**
 * One row per category that has a limit or spending this month. Budgeted rows come first,
 * worst first (over, then near, then ok; higher percent first); then unbudgeted rows by
 * spending, biggest first.
 */
export function buildBudgetRows(limits: ReadonlyMap<string, number>, spending: ReadonlyMap<string, number>): BudgetRow[] {
  const keys = new Set<string>([...limits.keys(), ...spending.keys()]);
  const rows: BudgetRow[] = [];
  for (const category of keys) {
    const spent = spending.get(category) ?? 0;
    const limit = limits.get(category);
    if (limit !== undefined && limit > 0) {
      rows.push({
        category,
        limit,
        spent,
        percent: budgetPercent(spent, limit),
        status: budgetStatus(spent, limit),
        remaining: fromCents(toCents(limit) - toCents(spent)),
        suggestedLimit: null,
      });
    } else if (spent > 0) {
      rows.push({ category, limit: null, spent, percent: null, status: null, remaining: null, suggestedLimit: suggestLimit(spent) });
    }
  }
  return rows.sort((a, b) => {
    if (a.status && b.status) {
      return STATUS_RANK[a.status] - STATUS_RANK[b.status] || (b.percent ?? 0) - (a.percent ?? 0) || b.spent - a.spent || a.category.localeCompare(b.category);
    }
    if (a.status) return -1;
    if (b.status) return 1;
    return b.spent - a.spent || a.category.localeCompare(b.category);
  });
}

/** Budgets that need attention (near or over), worst first. */
export function budgetAlerts(rows: readonly BudgetRow[]): BudgetRow[] {
  return rows.filter((r) => r.status === "near" || r.status === "over");
}

export type BudgetTotals = { count: number; limit: number; spent: number; near: number; over: number };

/** Totals over the budgeted rows only: how many, their limits and spending, and how many need attention. */
export function budgetTotals(rows: readonly BudgetRow[]): BudgetTotals {
  let count = 0, limitCents = 0, spentCents = 0, near = 0, over = 0;
  for (const r of rows) {
    if (r.limit === null) continue;
    count++;
    limitCents += toCents(r.limit);
    spentCents += toCents(r.spent);
    if (r.status === "near") near++;
    if (r.status === "over") over++;
  }
  return { count, limit: fromCents(limitCents), spent: fromCents(spentCents), near, over };
}

// ── 2.0 Presupuestos: pace, fixed categories, month history, rollover and suggestions ──

/** Categories that charge by themselves (subscriptions, rent, bills): shown as "Fijos", no daily pace. */
export const FIXED_CATEGORIES: ReadonlySet<string> = new Set(["subscription", "rent", "renta", "insurance", "seguro", "utilities", "phone", "internet"]);
export const isFixedCategory = (category: string) => FIXED_CATEGORIES.has(category);

/** The prototype's states: no budget, over, fixed, careful (20% ahead of today's pace) or fine. */
export type PaceStatus = "none" | "over" | "fixed" | "warn" | "ok";

/** Where spending should be today if it went evenly through the month. */
export function paceTarget(limit: number, day: number, days: number): number {
  if (!(days > 0)) return limit;
  return (limit * Math.min(Math.max(day, 0), days)) / days;
}

/** "Te pasaste" over the limit; "Fijo" for fixed ones; "Cuidado" when 20% ahead of the pace; else "Bien". */
export function paceStatus(spent: number, limit: number | null, day: number, days: number, fixed: boolean): PaceStatus {
  if (limit === null || !(limit > 0)) return "none";
  if (toCents(spent) > toCents(limit)) return "over";
  if (fixed) return "fixed";
  if (spent > paceTarget(limit, day, days) * 1.2) return "warn";
  return "ok";
}

/** What the month would end at if spending kept going like this. */
export function projectMonth(spent: number, day: number, days: number): number {
  if (!(day > 0)) return spent;
  return Math.round(((spent / day) * days) * 100) / 100;
}

/** The prototype's suggestion: the average, rounded up to the next $10. */
export function roundUp10(n: number): number {
  if (!(n > 0)) return 0;
  return Math.min(Math.ceil(toCents(n) / 1000) * 10, MAX_BUDGET_LIMIT);
}

/** Months as one number: 2026-11 → 202611. */
export const ymOf = (year: number, month: number) => year * 100 + month;
export function prevYm(ym: number): number {
  const y = Math.floor(ym / 100), m = ym % 100;
  return m === 1 ? ymOf(y - 1, 12) : ymOf(y, m - 1);
}
export function ymFromDate(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return ymOf(date.getUTCFullYear(), date.getUTCMonth() + 1);
}

/** One saved change: from month `ym` on, the category's limit is `limit` (null = no budget). */
export type BudgetHistoryRow = { category: string; ym: number; limit: number | null; rollover: boolean };
/** The category's current limit and the month its row was created (for budgets set before history existed). */
export type CurrentBudget = { limit: number; createdYm: number | null };

/**
 * The limits that applied in month `ym`: for each category, the latest change at or before that month.
 * Budgets set before the history existed count from the month their category row was created.
 * So a past month keeps the limits it had, even when they change later.
 */
export function limitsForMonth(history: readonly BudgetHistoryRow[], current: ReadonlyMap<string, CurrentBudget>, ym: number): Map<string, number> {
  const latest = new Map<string, BudgetHistoryRow>();
  const hasHistory = new Set<string>();
  for (const h of history) {
    hasHistory.add(h.category);
    if (h.ym > ym) continue;
    const prev = latest.get(h.category);
    if (!prev || h.ym > prev.ym) latest.set(h.category, h);
  }
  const out = new Map<string, number>();
  for (const [category, h] of latest) if (h.limit !== null && h.limit > 0) out.set(category, h.limit);
  for (const [category, c] of current) {
    if (hasHistory.has(category) || !(c.limit > 0)) continue;
    if (c.createdYm === null || c.createdYm <= ym) out.set(category, c.limit);
  }
  return out;
}

/** Categories whose leftover of month `ym` passes to the next month. */
export function rolloverFor(history: readonly BudgetHistoryRow[], ym: number): Set<string> {
  return new Set(history.filter((h) => h.ym === ym && h.rollover).map((h) => h.category));
}

/** What passes to the next month: what was left, never a negative. */
export function carryOver(limit: number, spent: number): number {
  return Math.max(0, (toCents(limit) - toCents(spent)) / 100);
}

/**
 * Average monthly spending per category over the months that have bank data (a month before the bank
 * was connected doesn't pull the average down).
 */
export function averageSpending(months: ReadonlyArray<{ hasData: boolean; spending: ReadonlyMap<string, number> }>): { avg: Map<string, number>; used: number } {
  const used = months.filter((m) => m.hasData);
  const sums = new Map<string, number>();
  for (const m of used) for (const [k, v] of m.spending) sums.set(k, (sums.get(k) ?? 0) + toCents(v));
  const avg = new Map<string, number>();
  if (used.length === 0) return { avg, used: 0 };
  for (const [k, c] of sums) avg.set(k, Math.round(c / used.length) / 100);
  return { avg, used: used.length };
}
