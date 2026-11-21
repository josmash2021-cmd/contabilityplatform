// ── Gastos: what the business spends, in one list, each peso counted once ──
// Pure rules shared by the server (api/expenses-router.ts) and the page (src/pages/Expenses.tsx).
// No database, no Node or browser APIs. Dates are calendar days "YYYY-MM-DD"; money is whole cents.
//
// Where an item comes from:
//   - an `expenses` row: written by hand ("Gasto en efectivo"), by a receipt photo (Recibos), or by a
//     paid vendor bill (Proveedores, reference "BILL-<id>");
//   - a bank movement (bankTransactions) that is business money out.
//
// The rule that keeps the total honest (no double counting):
//   1. Every `expenses` row counts, once.
//   2. A bank movement counts too, unless it is the same money as an expense:
//      a. linked to a bill in Por revisar ("Vincular"): the bill's expense already counts;
//      b. linked to an expense by hand (a receipt photo added to that bank charge), stored in expenseBankLinks;
//      c. matched automatically: same amount to the cent, posted from 1 day before to 5 days after the
//         expense (cards post late), and the expense went through the bank (card or Zelle; a paid bill also
//         when the vendor's name is in the bank text). One expense ↔ one movement; a name match wins, then
//         the closest day. The owner can undo a match ("No es el mismo cargo"), stored as "dismissed".
//   3. Movements that aren't business spending never count: money in, transfers between accounts, cash
//      withdrawals (cash spending is recorded as cash expenses), loan payments, the personal part of a
//      movement (Por revisar → Personal or a split's personal parts), duplicates and excluded movements.
import { RECEIPT_CATEGORIES, type ReceiptCategory } from "./receipts";
import { merchantKeyOf, nameInText } from "./reviewEngine";

// ── Categories ──
/** Receipt categories, plus the bills paid to vendors (Proveedores files them as "vendors"). */
export const SPEND_CATEGORIES = [...RECEIPT_CATEGORIES, "vendors"] as const;
export type SpendCategory = ReceiptCategory | "vendors";

const SPEND_SET = new Set<string>(SPEND_CATEGORIES);
export function isSpendCategory(v: string): v is SpendCategory {
  return SPEND_SET.has(v);
}

/** The bank's categories (api/lib/bankReview.ts) that are business spending, and where each goes. */
const BANK_TO_SPEND: Record<string, SpendCategory> = {
  business_expense: "other",
  shopping: "supplies",
  retail: "supplies",
  wholesale: "inventory",
  electronics: "tools",
  gasolina: "fuel",
  food: "meals",
  fast_food: "meals",
  coffee: "meals",
  food_delivery: "meals",
  subscription: "software",
  utilities: "utilities",
  insurance: "insurance",
  rideshare: "travel",
  medical: "other",
  zelle_sent: "other",
  other: "other",
};

/** Money out that is not spending: moving money between your accounts, taking out cash, paying a loan, personal. */
export const NOT_SPENDING_BANK_CATEGORIES: ReadonlySet<string> = new Set([
  "transfer", "transfer_income", "cash_withdrawal", "loan", "home_expense",
]);

/** The Gastos category of a bank movement's category. */
export function bankSpendCategory(bankCategory: string | null | undefined): SpendCategory {
  return BANK_TO_SPEND[(bankCategory ?? "").trim()] ?? "other";
}

/** The Gastos category of an `expenses` row (older rows may carry free text: those are "other"). */
export function expenseSpendCategory(category: string | null | undefined): SpendCategory {
  const c = (category ?? "").trim().toLowerCase();
  if (isSpendCategory(c)) return c;
  if (c in BANK_TO_SPEND) return BANK_TO_SPEND[c];
  return "other";
}

/** A bank movement is business spending when it's money out, not a duplicate or excluded, and not in a non-spending category. */
export function isBusinessSpending(row: { type: string; category: string | null; isDuplicate?: boolean | number | null; excluded?: boolean }): boolean {
  if (row.type !== "expense") return false;
  if (row.isDuplicate === true || row.isDuplicate === 1) return false;
  if (row.excluded) return false;
  return !NOT_SPENDING_BANK_CATEGORIES.has((row.category ?? "").trim());
}

// ── Money and days ──
export function toCents(v: string | number | null | undefined): number {
  const n = typeof v === "number" ? v : parseFloat(v ?? "");
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

const DAY_MS = 86_400_000;
function dayNumber(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}
export function addDays(iso: string, n: number): string {
  return new Date((dayNumber(iso) + n) * DAY_MS).toISOString().slice(0, 10);
}
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

export type YearMonth = { year: number; month: number };
const pad2 = (n: number) => String(n).padStart(2, "0");
/** First and last day of a month, both included. */
export function monthDays(m: YearMonth): { from: string; to: string } {
  const last = new Date(Date.UTC(m.year, m.month, 0)).getUTCDate();
  return { from: `${m.year}-${pad2(m.month)}-01`, to: `${m.year}-${pad2(m.month)}-${pad2(last)}` };
}
export function shiftMonth(m: YearMonth, delta: number): YearMonth {
  const i = m.year * 12 + (m.month - 1) + delta;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}
export function monthOf(iso: string): YearMonth {
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) };
}

/**
 * The days to compare with the month before. For the current month only the days so far
 * (1–21 Nov against 1–21 Oct), so a month that isn't over isn't compared with a whole one.
 */
export function comparisonRange(m: YearMonth, today: string): { from: string; to: string; partial: boolean } {
  const prev = monthDays(shiftMonth(m, -1));
  const cur = monthDays(m);
  if (today < cur.from || today > cur.to) return { ...prev, partial: false };
  const day = Number(today.slice(8, 10));
  const prevLast = Number(prev.to.slice(8, 10));
  return { from: prev.from, to: `${prev.from.slice(0, 8)}${pad2(Math.min(day, prevLast))}`, partial: true };
}

/** Whole-percent change, or null when there's nothing to compare with. */
export function pctChange(now: number, before: number): number | null {
  if (!(before > 0)) return null;
  return Math.round(((now - before) / before) * 100);
}

// ── Pairing expenses with bank movements ──
export type PayMethod = "cash" | "zelle" | "card";
/** A bank charge may post this many days before / after the expense's date. */
export const PAIR_DAYS_BEFORE = 1;
export const PAIR_DAYS_AFTER = 5;

export type PairExpense = { id: number; amountCents: number; date: string; method: PayMethod; name: string; isBill: boolean };
export type PairBank = { id: number; amountCents: number; date: string; text: string };
export type PairLink = { expenseId: number; bankTransactionId: number; status: "linked" | "dismissed" };
export type PairHow = "linked" | "bill" | "auto";

/**
 * Which bank movement is the same money as which expense (rule 2 above). Returns expense id → movement.
 * `reviewBillLinks` are Por revisar's "Vincular" on a bill, already resolved to the bill's expense.
 */
export function pairBankMovements(
  expenses: readonly PairExpense[],
  banks: readonly PairBank[],
  links: readonly PairLink[],
  reviewBillLinks: ReadonlyArray<{ expenseId: number; bankTransactionId: number }> = [],
): Map<number, { bankTransactionId: number; how: PairHow }> {
  const out = new Map<number, { bankTransactionId: number; how: PairHow }>();
  const usedBank = new Set<number>();
  const expIds = new Set(expenses.map((e) => e.id));
  const bankIds = new Set(banks.map((b) => b.id));

  // Explicit links first: what the owner said (or Por revisar linked) is never second-guessed.
  for (const l of reviewBillLinks) {
    if (!expIds.has(l.expenseId) || out.has(l.expenseId) || usedBank.has(l.bankTransactionId)) continue;
    out.set(l.expenseId, { bankTransactionId: l.bankTransactionId, how: "bill" });
    usedBank.add(l.bankTransactionId);
  }
  for (const l of links) {
    if (l.status !== "linked" || !expIds.has(l.expenseId) || out.has(l.expenseId) || usedBank.has(l.bankTransactionId)) continue;
    out.set(l.expenseId, { bankTransactionId: l.bankTransactionId, how: "linked" });
    usedBank.add(l.bankTransactionId);
  }
  // A movement linked to an expense outside the window still belongs to it.
  for (const l of links) if (l.status === "linked" && !expIds.has(l.expenseId)) usedBank.add(l.bankTransactionId);
  for (const l of reviewBillLinks) if (!expIds.has(l.expenseId)) usedBank.add(l.bankTransactionId);

  const dismissed = new Set(links.filter((l) => l.status === "dismissed").map((l) => `${l.expenseId}:${l.bankTransactionId}`));
  type Cand = { e: PairExpense; b: PairBank; byName: boolean; gap: number };
  const cands: Cand[] = [];
  for (const e of expenses) {
    if (out.has(e.id)) continue;
    for (const b of banks) {
      if (!bankIds.has(b.id) || usedBank.has(b.id) || b.amountCents !== e.amountCents) continue;
      const gap = daysBetween(e.date, b.date);
      if (gap < -PAIR_DAYS_BEFORE || gap > PAIR_DAYS_AFTER) continue;
      if (dismissed.has(`${e.id}:${b.id}`)) continue;
      const byName = nameInText(e.name, b.text);
      // Cash never goes through the bank; a paid bill only when the bank names the vendor.
      if (e.isBill ? !byName : e.method === "cash") continue;
      cands.push({ e, b, byName, gap });
    }
  }
  cands.sort((x, y) => Number(y.byName) - Number(x.byName) || Math.abs(x.gap) - Math.abs(y.gap) || x.e.id - y.e.id || x.b.id - y.b.id);
  for (const c of cands) {
    if (out.has(c.e.id) || usedBank.has(c.b.id)) continue;
    out.set(c.e.id, { bankTransactionId: c.b.id, how: "auto" });
    usedBank.add(c.b.id);
  }
  return out;
}

// ── The list ──
export type SpendSource = "manual" | "receipt" | "bill" | "bank";

/** An `expenses` row, with what the server knows about it. */
export type ExpenseIn = {
  id: number;
  description: string;
  category: string;
  subcategory: string | null;
  amount: string | number;
  paymentMethod: PayMethod;
  date: string;
  /** expenses.receipt: the receipt that created it or was added to it. */
  receiptId: number | null;
  /** True when a receipt photo created this expense (Recibos), false when the photo was added later or there's none. */
  fromReceipt: boolean;
  bill: { id: number; vendorId: number; vendorName: string; concept: string } | null;
};

/** A business-spending bank movement (already filtered with isBusinessSpending). */
export type BankIn = {
  id: number;
  name: string;
  /** Description and merchant name, for matching a vendor's name. */
  text: string;
  /** What counts: the whole movement, or its business parts when it was split. */
  amountCents: number;
  /** The movement's full amount (a receipt for the whole charge still matches a split one). */
  fullCents: number;
  date: string;
  category: string;
  reviewed: boolean;
  account: string | null;
  /** The bank account it went out of (its bank's logo stands in when the merchant has none). */
  accountId?: number | null;
  logoUrl: string | null;
};

export type SpendItem = {
  key: string;
  source: SpendSource;
  expenseId: number | null;
  bankTransactionId: number | null;
  receiptId: number | null;
  billId: number | null;
  vendorId: number | null;
  who: string;
  /** The bill's concept, or a manual expense's note line. */
  detail: string | null;
  category: SpendCategory;
  amountCents: number;
  date: string;
  method: PayMethod | null;
  /** The bank account it went out of ("Chase ••4410"), when known. */
  account: string | null;
  /** That account's id, so the screen can show its bank's original logo when the merchant has none. */
  bankAccountId: number | null;
  logoUrl: string | null;
  /** A bank movement still waiting in Por revisar. */
  inReview: boolean;
  hasReceipt: boolean;
  /** How the bank charge was matched to this expense, when it was. */
  pairedBy: PairHow | null;
};

/** Bank movements still waiting in Por revisar (not reviewed and inside its window). */
export function isInReview(b: { reviewed: boolean; date: string }, today: string, windowDays: number): boolean {
  return !b.reviewed && daysBetween(b.date, today) <= windowDays;
}

/**
 * Every expense and every business bank movement, each money movement once (rule above).
 * `reviewWindowDays`: Por revisar's window (api/lib/bankReview.ts REVIEW_WINDOW_DAYS).
 */
export function buildSpendItems(input: {
  expenses: readonly ExpenseIn[];
  banks: readonly BankIn[];
  links?: readonly PairLink[];
  reviewBillLinks?: ReadonlyArray<{ expenseId: number; bankTransactionId: number }>;
  today: string;
  reviewWindowDays: number;
}): SpendItem[] {
  const { expenses, banks, today, reviewWindowDays } = input;
  const pairInput: PairExpense[] = expenses.map((e) => ({
    id: e.id, amountCents: toCents(e.amount), date: e.date, method: e.paymentMethod,
    name: e.bill ? e.bill.vendorName : e.description, isBill: !!e.bill,
  }));
  // A movement can match an expense by its full amount or by its business part.
  const pairBanks: PairBank[] = banks.flatMap((b) => {
    const base = { id: b.id, date: b.date, text: b.text };
    return b.fullCents !== b.amountCents ? [{ ...base, amountCents: b.amountCents }, { ...base, amountCents: b.fullCents }] : [{ ...base, amountCents: b.amountCents }];
  });
  const pairs = pairBankMovements(pairInput, pairBanks, input.links ?? [], input.reviewBillLinks ?? []);
  const bankById = new Map(banks.map((b) => [b.id, b]));
  const hidden = new Set<number>();
  for (const p of pairs.values()) hidden.add(p.bankTransactionId);
  // Links to expenses outside this window still hide their movement.
  for (const l of input.links ?? []) if (l.status === "linked") hidden.add(l.bankTransactionId);
  for (const l of input.reviewBillLinks ?? []) hidden.add(l.bankTransactionId);

  const items: SpendItem[] = [];
  for (const e of expenses) {
    const pair = pairs.get(e.id) ?? null;
    const bank = pair ? bankById.get(pair.bankTransactionId) ?? null : null;
    const source: SpendSource = e.bill ? "bill" : e.fromReceipt ? "receipt" : "manual";
    items.push({
      key: `e${e.id}`,
      source,
      expenseId: e.id,
      bankTransactionId: bank?.id ?? null,
      receiptId: e.receiptId,
      billId: e.bill?.id ?? null,
      vendorId: e.bill?.vendorId ?? null,
      who: e.bill ? e.bill.vendorName || e.description : e.description,
      detail: e.bill ? e.bill.concept : null,
      category: e.bill ? "vendors" : expenseSpendCategory(e.category),
      amountCents: toCents(e.amount),
      date: e.date,
      method: e.paymentMethod,
      account: bank?.account ?? null,
      bankAccountId: bank?.accountId ?? null,
      logoUrl: bank?.logoUrl ?? null,
      inReview: false,
      hasReceipt: e.receiptId !== null,
      pairedBy: pair?.how ?? null,
    });
  }
  for (const b of banks) {
    if (hidden.has(b.id) || b.amountCents <= 0) continue;
    items.push({
      key: `b${b.id}`,
      source: "bank",
      expenseId: null,
      bankTransactionId: b.id,
      receiptId: null,
      billId: null,
      vendorId: null,
      who: b.name,
      detail: null,
      category: bankSpendCategory(b.category),
      amountCents: b.amountCents,
      date: b.date,
      method: null,
      account: b.account,
      bankAccountId: b.accountId ?? null,
      logoUrl: b.logoUrl,
      inReview: isInReview(b, today, reviewWindowDays),
      hasReceipt: false,
      pairedBy: null,
    });
  }
  return items.sort((a, b) => b.date.localeCompare(a.date) || b.amountCents - a.amountCents || a.key.localeCompare(b.key));
}

export function inRange(items: readonly SpendItem[], from: string, to: string): SpendItem[] {
  return items.filter((i) => i.date >= from && i.date <= to);
}

export type SpendTotals = {
  totalCents: number;
  count: number;
  withReceipt: number;
  byCategory: Array<{ category: SpendCategory; cents: number; count: number }>;
};

/** The month's total, how many have their receipt, and the split by category (biggest first). */
export function spendTotals(items: readonly SpendItem[]): SpendTotals {
  const by = new Map<SpendCategory, { cents: number; count: number }>();
  let total = 0, withReceipt = 0;
  for (const i of items) {
    total += i.amountCents;
    if (i.hasReceipt) withReceipt++;
    const cur = by.get(i.category) ?? { cents: 0, count: 0 };
    cur.cents += i.amountCents;
    cur.count++;
    by.set(i.category, cur);
  }
  const byCategory = [...by.entries()].map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.cents - a.cents || a.category.localeCompare(b.category));
  return { totalCents: total, count: items.length, withReceipt, byCategory };
}

// ── Charges that repeat ("Se repiten") ──
export type Recurring = { every: "week" | "twoWeeks" | "month"; nextDate: string };

const CADENCES: ReadonlyArray<{ every: Recurring["every"]; min: number; max: number; days: number; tolerance: number; minCount: number }> = [
  { every: "week", min: 6, max: 8, days: 7, tolerance: 2, minCount: 3 },
  { every: "twoWeeks", min: 13, max: 16, days: 14, tolerance: 2, minCount: 3 },
  { every: "month", min: 26, max: 35, days: 30, tolerance: 5, minCount: 2 },
];

/** Same merchant key for "SHELL OIL 57134" and "Shell": the first words, folded. */
export function recurringKeyOf(i: Pick<SpendItem, "who">): string {
  return merchantKeyOf(i.who).split(" ").slice(0, 2).join(" ");
}

/** "2026-10-16" + 1 month → "2026-11-16" (the 31st becomes the month's last day). */
export function addMonth(iso: string): string {
  const { year, month } = shiftMonth(monthOf(iso), 1);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad2(month)}-${pad2(Math.min(Number(iso.slice(8, 10)), last))}`;
}

/**
 * Charges from the same merchant at a steady rhythm (weekly, every two weeks, monthly) and a similar
 * amount (the biggest at most 25% over the smallest). Keyed by recurringKeyOf; the next date is
 * the last one plus the rhythm. Needs a few months of history to see a monthly charge twice.
 */
export function detectRecurring(items: readonly SpendItem[]): Map<string, Recurring> {
  const groups = new Map<string, SpendItem[]>();
  for (const i of items) {
    const k = recurringKeyOf(i);
    if (!k) continue;
    const g = groups.get(k) ?? [];
    g.push(i);
    groups.set(k, g);
  }
  const out = new Map<string, Recurring>();
  for (const [k, list] of groups) {
    const days = [...new Set(list.map((i) => i.date))].sort();
    if (days.length < 2) continue;
    const amounts = list.map((i) => i.amountCents).filter((n) => n > 0);
    if (!amounts.length || Math.max(...amounts) > Math.min(...amounts) * 1.25) continue;
    const gaps = days.slice(1).map((d, i) => daysBetween(days[i], d));
    const sorted = [...gaps].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const c = CADENCES.find((x) => median >= x.min && median <= x.max);
    if (!c || days.length < c.minCount) continue;
    if (gaps.some((g) => Math.abs(g - c.days) > c.tolerance + (c.every === "month" ? 1 : 0))) continue;
    const last = days[days.length - 1];
    out.set(k, { every: c.every, nextDate: c.every === "month" ? addMonth(last) : addDays(last, c.days) });
  }
  return out;
}

// ── Monthly limits per category ("Límites del mes") ──
export type LimitTone = "ok" | "near" | "over";
/** "near" from 85% of the limit, "over" past it (the prototype's colors: green, amber, red). */
export function limitState(usedCents: number, limitCents: number): { pct: number; tone: LimitTone; overPct: number } {
  if (!(limitCents > 0)) return { pct: 0, tone: "ok", overPct: 0 };
  const pct = Math.round((usedCents / limitCents) * 100);
  return { pct, tone: pct > 100 ? "over" : pct > 85 ? "near" : "ok", overPct: Math.max(0, pct - 100) };
}

// ── Journal entry numbers ──
/**
 * "GAS-20261121-M345": a hand-written expense's entry (creation day + expense id). The id can't repeat, so two
 * expenses on the same day never collide on journalEntries.entryNumber (the old count-based number always
 * came out "-0001"). The letter keeps it apart from Recibos ("-R<id>-E<id>") and Proveedores ("-B<id>-E<id>").
 */
export function manualEntryNumber(createdDay: string, expenseId: number): string {
  return `GAS-${createdDay.replace(/-/g, "")}-M${expenseId}`;
}

// ── Proveedores: the week of payments ──
export type WeekDay = { date: string; totalCents: number; count: number; vendors: string[] };

/** Today and the next six days, with the unpaid bills due each day ("Tu semana de pagos"). */
export function paymentWeek(bills: ReadonlyArray<{ dueDate: string; amount: number | string; vendorName: string; status: string }>, today: string): WeekDay[] {
  const days: WeekDay[] = Array.from({ length: 7 }, (_, i) => ({ date: addDays(today, i), totalCents: 0, count: 0, vendors: [] }));
  const byDate = new Map(days.map((d) => [d.date, d]));
  for (const b of bills) {
    if (b.status !== "unpaid") continue;
    const d = byDate.get(b.dueDate);
    if (!d) continue;
    d.totalCents += toCents(b.amount);
    d.count++;
    if (!d.vendors.includes(b.vendorName)) d.vendors.push(b.vendorName);
  }
  return days;
}
