// ── Proveedores y facturas por pagar: pure rules, no database ──
// Dates are calendar days as "YYYY-MM-DD" strings (never Date objects), so a bill due on
// the 5th is due on the 5th in every time zone. "Today" is the user's local day, sent by the app.

export type BillStatus = "unpaid" | "paid";
export type PaymentMethod = "cash" | "zelle" | "card";
/** Where an unpaid bill stands against today; paid bills are just "paid". */
export type BillTiming = "paid" | "overdue" | "dueToday" | "dueSoon" | "later";
/** The bill lists: what's owed, what's late, what's due within a week, what's paid, or everything. */
export type BillFilter = "unpaid" | "overdue" | "week" | "paid" | "all";

/** "Due this week" = from today through this many days ahead (today + 7 included). */
export const DUE_SOON_DAYS = 7;
/** Highest bill accepted (the column is DECIMAL(12,2)). */
export const MAX_BILL_AMOUNT = 10_000_000;
/** How far the app's "today" may be from the server's (time zones are at most ~1 day apart). */
const MAX_TODAY_DRIFT_DAYS = 2;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

/** A real calendar day written as YYYY-MM-DD (2026-02-30 is not), between 2000 and 2100. */
export function isIsoDate(value: string): boolean {
  const m = ISO_DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function dayNumber(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

function fromDayNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

/** The calendar day `days` after (or before, if negative) `iso`. */
export function addDays(iso: string, days: number): string {
  return fromDayNumber(dayNumber(iso) + days);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

/** Today in UTC: the server's fallback when the app doesn't say which day it is for the user. */
export function utcToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The day to classify bills against: the app's local "today" when it's a real date close to the
 * server's (a phone in Hawaii and the server in UTC can be a day apart), otherwise the server's.
 */
export function effectiveToday(clientToday: string | null | undefined, serverToday: string): string {
  if (!clientToday || !isIsoDate(clientToday)) return serverToday;
  return Math.abs(daysBetween(serverToday, clientToday)) <= MAX_TODAY_DRIFT_DAYS ? clientToday : serverToday;
}

/** The days counted as "this week": today through today + DUE_SOON_DAYS, both included. */
export function dueSoonRange(today: string): { from: string; to: string } {
  return { from: today, to: addDays(today, DUE_SOON_DAYS) };
}

/** Days until the bill is due: 0 today, 1 tomorrow, -3 three days late. */
export function daysUntilDue(dueDate: string, today: string): number {
  return daysBetween(today, dueDate);
}

/**
 * paid → "paid"; unpaid and due before today → "overdue"; due today → "dueToday";
 * due within the next DUE_SOON_DAYS days → "dueSoon"; later → "later".
 */
export function billTiming(bill: { status: BillStatus; dueDate: string }, today: string): BillTiming {
  if (bill.status === "paid") return "paid";
  const days = daysUntilDue(bill.dueDate, today);
  if (days < 0) return "overdue";
  if (days === 0) return "dueToday";
  if (days <= DUE_SOON_DAYS) return "dueSoon";
  return "later";
}

/** True when the bill belongs in that list. */
export function matchesFilter(bill: { status: BillStatus; dueDate: string }, filter: BillFilter, today: string): boolean {
  const timing = billTiming(bill, today);
  switch (filter) {
    case "all": return true;
    case "paid": return timing === "paid";
    case "unpaid": return timing !== "paid";
    case "overdue": return timing === "overdue";
    case "week": return timing === "dueToday" || timing === "dueSoon";
  }
}

/** Money in whole cents, so totals don't trip on float noise (0.1 + 0.2). Bad values count as 0. */
export function toCents(amount: number | string | null | undefined): number {
  const n = typeof amount === "number" ? amount : parseFloat(amount ?? "");
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/** "1234.5" → "1234.50": what goes into a DECIMAL(12,2) column. */
export function centsToDecimal(cents: number): string {
  return (cents / 100).toFixed(2);
}

export type BillForTotals = { status: BillStatus; dueDate: string; amount: number | string };

export type BillSummary = {
  unpaidTotal: number;
  unpaidCount: number;
  overdueTotal: number;
  overdueCount: number;
  /** Due from today through the next DUE_SOON_DAYS days (not overdue). */
  dueSoonTotal: number;
  dueSoonCount: number;
};

/** The cards at the top of the page: what's owed, what's late and what's due this week. Paid bills are ignored. */
export function summarizeBills(bills: readonly BillForTotals[], today: string): BillSummary {
  let unpaid = 0, overdue = 0, soon = 0;
  let unpaidCount = 0, overdueCount = 0, soonCount = 0;
  for (const b of bills) {
    const timing = billTiming(b, today);
    if (timing === "paid") continue;
    const c = toCents(b.amount);
    unpaid += c; unpaidCount++;
    if (timing === "overdue") { overdue += c; overdueCount++; }
    else if (timing === "dueToday" || timing === "dueSoon") { soon += c; soonCount++; }
  }
  return {
    unpaidTotal: fromCents(unpaid), unpaidCount,
    overdueTotal: fromCents(overdue), overdueCount,
    dueSoonTotal: fromCents(soon), dueSoonCount: soonCount,
  };
}

export type VendorBalance = { unpaidTotal: number; unpaidCount: number; overdueCount: number };

/** What is owed to each vendor (by vendorId), and how many of those bills are late. */
export function balancesByVendor(bills: ReadonlyArray<BillForTotals & { vendorId: number }>, today: string): Map<number, VendorBalance> {
  const acc = new Map<number, { cents: number; count: number; overdue: number }>();
  for (const b of bills) {
    const timing = billTiming(b, today);
    if (timing === "paid") continue;
    const cur = acc.get(b.vendorId) ?? { cents: 0, count: 0, overdue: 0 };
    cur.cents += toCents(b.amount);
    cur.count++;
    if (timing === "overdue") cur.overdue++;
    acc.set(b.vendorId, cur);
  }
  const out = new Map<number, VendorBalance>();
  for (const [id, v] of acc) out.set(id, { unpaidTotal: fromCents(v.cents), unpaidCount: v.count, overdueCount: v.overdue });
  return out;
}

/** Trims and collapses spaces; "" becomes null. Used for names, phones and notes. */
export function cleanText(value: string | null | undefined): string | null {
  const s = (value ?? "").replace(/\s+/g, " ").trim();
  return s ? s : null;
}

/** Same vendor name, ignoring case, accents and extra spaces ("José  Pérez" = "jose perez"). */
export function sameVendorName(a: string, b: string): boolean {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  return norm(a) === norm(b);
}

function clip(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

/** The category the expense of a paid bill is filed under (the vendor's name goes in subcategory). */
export const VENDOR_EXPENSE_CATEGORY = "vendors";

export type ExpenseValues = {
  description: string;
  category: string;
  subcategory: string;
  amount: string;
  paymentMethod: PaymentMethod;
  /** The payment day, YYYY-MM-DD (written to the DATE column as is). */
  date: string;
  reference: string;
  notes: string | null;
};

/**
 * The expense recorded when a bill is paid: the same row expenses.create would write, with the
 * vendor's name in front of the concept and "BILL-<bill id>" as the expense's reference (the journal
 * entry carries "EXP-<expense id>", like expenses.create's).
 */
export function expenseFromBill(
  bill: { id: number; description: string; amount: number | string; notes?: string | null },
  vendorName: string,
  paidDate: string,
  method: PaymentMethod,
): ExpenseValues {
  const vendor = cleanText(vendorName) ?? "";
  const concept = cleanText(bill.description) ?? "";
  return {
    description: clip(vendor ? `${vendor} · ${concept}` : concept, 255),
    category: VENDOR_EXPENSE_CATEGORY,
    subcategory: clip(vendor, 100),
    amount: centsToDecimal(toCents(bill.amount)),
    paymentMethod: method,
    date: paidDate,
    reference: `BILL-${bill.id}`,
    notes: cleanText(bill.notes),
  };
}

/**
 * Journal entry number for a paid bill's expense: "GAS-20261121-B12-E345" (creation day, bill, expense).
 * expenses.create numbers every entry "GAS-<day>-0001" (it counts entries created after "now"), which the
 * unique index on journalEntries.entryNumber rejects from the second expense of the day; bill + expense ids
 * can't repeat, and the letters keep them apart from Recibos' "GAS-<day>-R<id>-E<id>".
 */
export function vendorEntryNumber(createdDay: string, billId: number, expenseId: number): string {
  return `GAS-${createdDay.replace(/-/g, "")}-B${billId}-E${expenseId}`;
}

/** The journal entry reference of an expense, as expenses.create writes it. */
export function expenseEntryReference(expenseId: number): string {
  return `EXP-${expenseId}`;
}

/** Every reference an expense's journal entries can carry: ours / expenses.create (EXP-<id>) and the accounting repair's (exp_<id>). */
export function expenseEntryReferences(expenseId: number): string[] {
  return [expenseEntryReference(expenseId), `exp_${expenseId}`];
}
