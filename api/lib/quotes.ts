// ── Cotizaciones y facturas recurrentes (business Pro and Negocio): pure logic ──
// Money is added up in whole cents; calendar dates are "YYYY-MM-DD" strings and every
// date calculation runs in UTC so the server's timezone never shifts a day.
// No database or server imports: the page (src/pages/Quotes.tsx) uses this file too.

export const QUOTE_STATUSES = ["draft", "sent", "accepted", "rejected", "converted"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

/** Statuses the user sets by hand. "converted" only comes from turning the quote into a sale. */
export const MANUAL_QUOTE_STATUSES = ["draft", "sent", "accepted", "rejected"] as const;
export type ManualQuoteStatus = (typeof MANUAL_QUOTE_STATUSES)[number];

export const FREQUENCIES = ["weekly", "monthly", "quarterly", "yearly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const PAYMENT_METHODS = ["cash", "zelle", "card"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Lines per quote or recurring invoice. */
export const MAX_ITEMS = 50;
/** Whole units per line (sale lines store an integer quantity). */
export const MAX_QUANTITY = 10_000;
/** Price of one unit, in dollars. */
export const MAX_UNIT_PRICE = 1_000_000;
/** A line's amount must fit the sale lines' DECIMAL(10,2) column. */
export const MAX_LINE_CENTS = 9_999_999_999;
/** Periods one recurring invoice may create in a single run; the rest wait for the next run. */
export const MAX_CATCH_UP = 12;
/** "Today" for recurring invoices: the businesses using the app are in US Central time. */
export const BUSINESS_TIME_ZONE = "America/Chicago";

// ── Money ──

/** Dollars (number or decimal string) to whole cents, without float noise (1.005 → 101). */
export function toCents(value: number | string): number {
  const n = typeof value === "string" ? Number(value.trim()) : value;
  if (!Number.isFinite(n)) return 0;
  return Math.round(Number((n * 100).toFixed(6)));
}

/** Cents to the decimal string MySQL stores ("1234.50"). */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export type LineInput = { quantity: number; unitPrice: number | string };

export function lineTotalCents(line: LineInput): number {
  return Math.round(line.quantity) * toCents(line.unitPrice);
}

export type Totals = { subtotalCents: number; discountCents: number; totalCents: number };

/** Subtotal of the lines, the discount (never below 0 nor above the subtotal) and the total. */
export function quoteTotals(lines: readonly LineInput[], discount: number | string = 0): Totals {
  const subtotalCents = lines.reduce((sum, l) => sum + lineTotalCents(l), 0);
  const discountCents = Math.min(Math.max(toCents(discount), 0), subtotalCents);
  return { subtotalCents, discountCents, totalCents: subtotalCents - discountCents };
}

// ── Calendar dates ("YYYY-MM-DD") ──

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

type Ymd = { y: number; m: number; d: number };

function parseIso(date: string): Ymd {
  const match = ISO_RE.exec(date);
  if (!match) throw new Error(`Invalid date: ${date}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function formatYmd({ y, m, d }: Ymd): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** True for a real calendar day in "YYYY-MM-DD" form (rejects 2026-02-30). */
export function isValidIsoDate(date: string): boolean {
  const match = ISO_RE.exec(date);
  if (!match) return false;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  return y >= 1900 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

/** Days in a month (m = 1..12), leap years included. */
export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDays(date: string, days: number): string {
  const { y, m, d } = parseIso(date);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return formatYmd({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() });
}

/**
 * Moves `months` months ahead and lands on `anchorDay`, or on the month's last day when the
 * month is shorter (Jan 31 → Feb 28 → Mar 31: the anchor keeps the 31st from drifting).
 */
export function addMonthsAnchored(date: string, months: number, anchorDay: number): string {
  const { y, m } = parseIso(date);
  const index = y * 12 + (m - 1) + months;
  const ny = Math.floor(index / 12);
  const nm = (index % 12) + 1;
  return formatYmd({ y: ny, m: nm, d: Math.min(Math.max(anchorDay, 1), daysInMonth(ny, nm)) });
}

/** Day of the month a schedule is anchored to: the day of its start date. */
export function anchorDayOf(startDate: string): number {
  return parseIso(startDate).d;
}

const MONTHS_PER_PERIOD: Record<Exclude<Frequency, "weekly">, number> = { monthly: 1, quarterly: 3, yearly: 12 };

/** The period after `date`. Monthly, quarterly and yearly keep to `anchorDay` (default: the day of `date`). */
export function nextPeriodDate(date: string, frequency: Frequency, anchorDay: number = anchorDayOf(date)): string {
  if (frequency === "weekly") return addDays(date, 7);
  return addMonthsAnchored(date, MONTHS_PER_PERIOD[frequency], anchorDay);
}

export type Schedule = {
  /** First invoice date; its day of the month is the anchor. */
  startDate: string;
  /** The next period that hasn't been invoiced yet. */
  nextDate: string;
  frequency: Frequency;
  /** Last day an invoice may fall on; null = no end. */
  endDate: string | null;
};

/** True once the next period falls after the end date: nothing more will be invoiced. */
export function scheduleFinished(s: Pick<Schedule, "nextDate" | "endDate">): boolean {
  return s.endDate !== null && s.nextDate > s.endDate;
}

/**
 * The periods due by `today` (oldest first, at most `max`), the next date once they are
 * invoiced, and whether the schedule is over after them (next date past the end date).
 */
export function duePeriods(s: Schedule, today: string, max: number = MAX_CATCH_UP): { dates: string[]; next: string; finished: boolean } {
  const anchor = anchorDayOf(s.startDate);
  const dates: string[] = [];
  let d = s.nextDate;
  while (dates.length < max && d <= today && (s.endDate === null || d <= s.endDate)) {
    dates.push(d);
    d = nextPeriodDate(d, s.frequency, anchor);
  }
  return { dates, next: d, finished: scheduleFinished({ nextDate: d, endDate: s.endDate }) };
}

/**
 * First period on or after `from`, walking the schedule from its next date. Used when a
 * paused invoice is resumed: the periods that passed during the pause are skipped.
 */
export function firstPeriodOnOrAfter(s: Pick<Schedule, "startDate" | "nextDate" | "frequency">, from: string): string {
  const anchor = anchorDayOf(s.startDate);
  let d = s.nextDate;
  // A weekly schedule paused for 100 years is ~5,200 steps: the cap only guards bad data.
  for (let i = 0; d < from && i < 100_000; i++) d = nextPeriodDate(d, s.frequency, anchor);
  return d;
}

/** The calendar day in `timeZone` at instant `now` (default: the business timezone). */
export function todayInTimeZone(now: Date, timeZone: string = BUSINESS_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return formatYmd({ y: get("year"), m: get("month"), d: get("day") });
}

/** The device's local calendar day (used by the page for defaults like "valid for 15 days"). */
export function localIsoDate(now: Date): string {
  return formatYmd({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() });
}

// ── Quote status rules ──

export function canEditQuote(status: QuoteStatus): boolean {
  return status !== "converted";
}

export function canDeleteQuote(status: QuoteStatus): boolean {
  return status !== "converted";
}

/** Any hand-set status can change to another one; a converted quote is final. */
export function canSetQuoteStatus(from: QuoteStatus, to: ManualQuoteStatus): boolean {
  return from !== "converted" && from !== to;
}

/** A quote becomes a sale from draft, sent or accepted. A rejected one has to be reopened first. */
export function canConvertQuote(status: QuoteStatus): boolean {
  return status === "draft" || status === "sent" || status === "accepted";
}

/** Past its "valid until" date while still waiting for an answer. */
export function quoteExpired(validUntil: string | null, status: QuoteStatus, today: string): boolean {
  return validUntil !== null && validUntil < today && (status === "draft" || status === "sent");
}

/** "COT-0007": the user's own running number. */
export function quoteNumber(seq: number): string {
  return `COT-${String(seq).padStart(4, "0")}`;
}
