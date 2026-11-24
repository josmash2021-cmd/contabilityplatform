// ── Recibos: the rules, without the database ──
// Shared by the server (api/receipts-router.ts) and the page (src/pages/Receipts.tsx),
// so both agree on categories, limits, the monthly cap and the totals.
// Pure TypeScript: no Node or browser APIs.
import { receiptPhotosPerMonth, type PlanTier } from "@contracts/planFeatures";

/** Business expense categories a receipt can go under (stored as these keys on the expense). */
export const RECEIPT_CATEGORIES = [
  "supplies",
  "inventory",
  "fuel",
  "vehicle",
  "meals",
  "tools",
  "office",
  "software",
  "advertising",
  "rent",
  "utilities",
  "insurance",
  "professional",
  "travel",
  "fees",
  "licenses",
  "other",
] as const;
export type ReceiptCategory = (typeof RECEIPT_CATEGORIES)[number];

/** Same choices as expenses.paymentMethod. */
export const RECEIPT_PAYMENT_METHODS = ["cash", "zelle", "card"] as const;
export type ReceiptPaymentMethod = (typeof RECEIPT_PAYMENT_METHODS)[number];

/** Highest amount for one receipt: anything above is almost surely a typo. */
export const MAX_RECEIPT_AMOUNT = 1_000_000;
export const MAX_MERCHANT_LENGTH = 120;
export const MAX_NOTES_LENGTH = 500;
/** The small preview the phone makes (JPEG, about 320 px), so the list doesn't download full photos. */
export const RECEIPT_THUMB_MAX_BYTES = 150 * 1024;
/** Months before this can't be picked. */
export const FIRST_RECEIPT_YEAR = 2000;

export function isReceiptCategory(v: string): v is ReceiptCategory {
  return (RECEIPT_CATEGORIES as readonly string[]).includes(v);
}

// ── Monthly cap ──
export type ReceiptUsage = {
  /** Receipts uploaded this calendar month. */
  used: number;
  /** Receipts allowed per month; null = no limit. */
  cap: number | null;
  /** How many more can be uploaded this month; null = no limit. */
  remaining: number | null;
  canUpload: boolean;
};

/** First instant of the calendar month (UTC), where the monthly count starts over (same as the assistant's). */
export function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Where the user stands against their plan's monthly receipt photos (Básico: 20; Pro and Negocio: no cap). */
export function receiptUsage(tier: PlanTier, used: number): ReceiptUsage {
  const n = Number.isFinite(used) ? Math.max(0, Math.floor(used)) : 0;
  const cap = receiptPhotosPerMonth(tier);
  if (cap === null) return { used: n, cap: null, remaining: null, canUpload: true };
  const remaining = Math.max(0, cap - n);
  return { used: n, cap, remaining, canUpload: remaining > 0 };
}

// ── Amounts (in cents, so sums don't drift) ──
export function toCents(amount: number | string): number {
  const n = typeof amount === "string" ? Number(amount) : amount;
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** "12.30": what goes in a DECIMAL(12,2) column. */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * Reads what someone typed in the amount box: "12", "12.5", "$1,234.56", "12,50".
 * A comma followed by one or two digits at the end is a decimal comma; any other comma separates thousands.
 * Returns the amount rounded to cents, or null when it isn't a positive amount up to MAX_RECEIPT_AMOUNT.
 */
export function parseAmount(text: string): number | null {
  let s = text.trim().replace(/[$\s]/g, "");
  if (!s) return null;
  if (s.includes(",") && !s.includes(".") && /,\d{1,2}$/.test(s) && s.split(",").length === 2) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const cents = toCents(s);
  if (cents < 1 || cents > MAX_RECEIPT_AMOUNT * 100) return null;
  return cents / 100;
}

// ── Totals for a month ──
export type CategoryTotal = { category: string; total: number; count: number };
export type ReceiptTotals = { total: number; count: number; byCategory: CategoryTotal[] };

/** The month's total and the total per category (biggest first). */
export function receiptTotals(items: ReadonlyArray<{ category: string; amount: number | string }>): ReceiptTotals {
  const byCat = new Map<string, { cents: number; count: number }>();
  let cents = 0;
  for (const it of items) {
    const c = toCents(it.amount);
    cents += c;
    const cur = byCat.get(it.category) ?? { cents: 0, count: 0 };
    cur.cents += c;
    cur.count += 1;
    byCat.set(it.category, cur);
  }
  const byCategory = [...byCat.entries()]
    .map(([category, v]) => ({ category, total: v.cents / 100, count: v.count }))
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));
  return { total: cents / 100, count: items.length, byCategory };
}

// ── Dates (always "YYYY-MM-DD" strings: a Date would shift days across time zones) ──
const pad2 = (n: number) => String(n).padStart(2, "0");

/** True for a real calendar date written as YYYY-MM-DD (e.g. not 2026-02-30). */
export function isIsoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < FIRST_RECEIPT_YEAR || y > 2100 || mo < 1 || mo > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

/** The local calendar date of `d` as YYYY-MM-DD. */
export function isoDateOf(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** First day of the month and first day of the next one: date >= start AND date < end. */
export function monthRange(year: number, month: number): { start: string; end: string } {
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  return { start: `${year}-${pad2(month)}-01`, end: `${next.y}-${pad2(next.m)}-01` };
}

export type YearMonth = { year: number; month: number };

/** The month `delta` months away (negative goes back). */
export function shiftMonth(m: YearMonth, delta: number): YearMonth {
  const i = m.year * 12 + (m.month - 1) + delta;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}

export function compareMonths(a: YearMonth, b: YearMonth): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}
