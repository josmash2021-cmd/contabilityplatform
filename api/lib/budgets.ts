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
