// ── Reportes: the pure rules (periods, changes, the 12-month series, the balance sheet, the cash flow,
// who owes you and since when, the plain-language tips) ──
// Used by api/reports-router.ts and by the page (src/pages/Reports.tsx, src/components/reports/*).
// Tested in api/lib/reportBooks.test.ts. Money is added in whole cents so totals never drift.

export type DateRange = { startDate: string; endDate: string };
export type YearMonth = { year: number; month: number };

const pad = (n: number) => String(n).padStart(2, "0");

export function isoFromParts(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function partsOf(iso: string): { year: number; month: number; day: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { year: y, month: m, day: d };
}

/** The calendar day `n` days after `iso` (negative: before). */
export function addDays(iso: string, n: number): string {
  const { year, month, day } = partsOf(iso);
  const t = new Date(Date.UTC(year, month - 1, day + n));
  return isoFromParts(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** The month `n` months after year/month (negative: before). */
export function addMonths(ym: YearMonth, n: number): YearMonth {
  const i = ym.year * 12 + (ym.month - 1) + n;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}

export function monthRange(ym: YearMonth): DateRange {
  return { startDate: isoFromParts(ym.year, ym.month, 1), endDate: isoFromParts(ym.year, ym.month, daysInMonth(ym.year, ym.month)) };
}

export function yearRange(year: number): DateRange {
  return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
}

export function daysBetween(from: string, to: string): number {
  const a = partsOf(from);
  const b = partsOf(to);
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000);
}

/** The device's calendar day as YYYY-MM-DD (no UTC shift). */
export function localIso(d: Date): string {
  return isoFromParts(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

// ── The income statement's period (reports.incomeStatement) ──
/**
 * Which days reports.incomeStatement covers:
 * - year + month: that whole month;
 * - a year alone: that whole year, January 1 to December 31 (it used to stop at today's month and day,
 *   so a past year lost its last weeks);
 * - nothing: this month up to today.
 * startDate / endDate, when given, replace either end.
 */
export function statementRange(
  input: { startDate?: string; endDate?: string; year?: number; month?: number } | undefined,
  today: string,
): DateRange {
  let base: DateRange;
  if (input?.year && input.month) base = monthRange({ year: input.year, month: input.month });
  else if (input?.year) base = yearRange(input.year);
  else base = { startDate: `${today.slice(0, 8)}01`, endDate: today };
  return { startDate: input?.startDate || base.startDate, endDate: input?.endDate || base.endDate };
}

// ── The periods of the Reports page ──
export type PeriodKey = "month" | "last" | "quarter" | "year" | "today" | "week" | "pickMonth" | "pickYear";
/** How the period reads: one month, several months, a year so far, a whole year, a day, the last 7 days. */
export type PeriodKind = "month" | "months" | "ytd" | "year" | "day" | "week";

export type ReportPeriod = {
  key: PeriodKey;
  kind: PeriodKind;
  range: DateRange;
  /** The period it's compared with: the one just before, of the same length (a year so far: the same months last year). */
  prev: DateRange;
  prevKind: PeriodKind;
  /** The 12-month chart ends at this month… */
  seriesEnd: YearMonth;
  /** …and highlights these months ("YYYY-MM"). */
  highlight: string[];
};

export const ymKey = (ym: YearMonth) => `${ym.year}-${pad(ym.month)}`;

function monthsOf(range: DateRange): string[] {
  const a = partsOf(range.startDate);
  const b = partsOf(range.endDate);
  const out: string[] = [];
  for (let ym: YearMonth = { year: a.year, month: a.month }; ym.year * 12 + ym.month <= b.year * 12 + b.month; ym = addMonths(ym, 1)) out.push(ymKey(ym));
  return out;
}

export function reportPeriod(sel: { key: PeriodKey; year?: number; month?: number }, today: string): ReportPeriod {
  const t = partsOf(today);
  const thisMonth: YearMonth = { year: t.year, month: t.month };
  const make = (key: PeriodKey, kind: PeriodKind, range: DateRange, prev: DateRange, prevKind: PeriodKind = kind): ReportPeriod => {
    const end = partsOf(range.endDate);
    return { key, kind, range, prev, prevKind, seriesEnd: { year: end.year, month: end.month }, highlight: monthsOf(range) };
  };
  switch (sel.key) {
    case "last": {
      const m = addMonths(thisMonth, -1);
      return make("last", "month", monthRange(m), monthRange(addMonths(m, -1)));
    }
    case "quarter": {
      const first = addMonths(thisMonth, -2);
      return make(
        "quarter", "months",
        { startDate: monthRange(first).startDate, endDate: monthRange(thisMonth).endDate },
        { startDate: monthRange(addMonths(first, -3)).startDate, endDate: monthRange(addMonths(thisMonth, -3)).endDate },
      );
    }
    case "year":
      // This year so far (whole months), against the same months of last year.
      return make(
        "year", "ytd",
        { startDate: `${t.year}-01-01`, endDate: monthRange(thisMonth).endDate },
        { startDate: `${t.year - 1}-01-01`, endDate: monthRange({ year: t.year - 1, month: t.month }).endDate },
      );
    case "pickYear": {
      const y = sel.year && sel.year < t.year ? sel.year : t.year - 1;
      return make("pickYear", "year", yearRange(y), yearRange(y - 1));
    }
    case "pickMonth": {
      const m = { year: sel.year ?? t.year, month: sel.month ?? t.month };
      const safe = m.year * 12 + m.month > t.year * 12 + t.month ? thisMonth : m;
      return make("pickMonth", "month", monthRange(safe), monthRange(addMonths(safe, -1)));
    }
    case "today":
      return make("today", "day", { startDate: today, endDate: today }, { startDate: addDays(today, -1), endDate: addDays(today, -1) });
    case "week":
      return make("week", "week", { startDate: addDays(today, -6), endDate: today }, { startDate: addDays(today, -13), endDate: addDays(today, -7) });
    case "month":
    default:
      return make("month", "month", monthRange(thisMonth), monthRange(addMonths(thisMonth, -1)));
  }
}

// ── Change against the previous period (the KPI line "↑ 9% vs octubre") ──
export type Change = {
  /** Whole percent, always ≥ 0; null when there's nothing to compare with (the previous period was 0). */
  pct: number | null;
  dir: "up" | "down" | "same";
  /** Whether the change is good news (more money in, less money out, more profit). */
  good: boolean;
};

export function change(cur: number, prev: number, upIsGood: boolean): Change {
  const c = toCents(cur);
  const p = toCents(prev);
  const dir = c > p ? "up" : c < p ? "down" : "same";
  const good = dir === "same" ? true : upIsGood ? dir === "up" : dir === "down";
  if (p === 0) return { pct: null, dir, good };
  return { pct: Math.round((Math.abs(c - p) / Math.abs(p)) * 100), dir, good };
}

/** "63 de cada 100 dólares": the share of what came in that was left. Null without income. */
export function keptPerHundred(moneyIn: number, profit: number): number | null {
  return toCents(moneyIn) > 0 ? Math.round((profit / moneyIn) * 100) : null;
}

// ── Money ──
export type Numeric = number | string | null | undefined;

export function toNumber(v: Numeric): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}
export const toCents = (v: Numeric) => Math.round(toNumber(v) * 100);
export const fromCents = (c: number) => c / 100;
export function sumMoney(values: readonly Numeric[]): number {
  return fromCents(values.reduce<number>((s, v) => s + toCents(v), 0));
}

// ── The 12-month chart ──
export type SeriesMonth = { year: number; month: number; key: string; in: number; out: number };

/** The `n` months ending at `end`, oldest first, with what came in and went out (0 where nothing). */
export function fillSeries(
  end: YearMonth,
  sales: ReadonlyArray<{ ym: string; total: Numeric }>,
  expenses: ReadonlyArray<{ ym: string; total: Numeric }>,
  n = 12,
): SeriesMonth[] {
  const inBy = new Map<string, number>();
  const outBy = new Map<string, number>();
  for (const r of sales) inBy.set(r.ym, (inBy.get(r.ym) ?? 0) + toCents(r.total));
  for (const r of expenses) outBy.set(r.ym, (outBy.get(r.ym) ?? 0) + toCents(r.total));
  return Array.from({ length: n }, (_, i) => {
    const ym = addMonths(end, i - (n - 1));
    const key = ymKey(ym);
    return { ...ym, key, in: fromCents(inBy.get(key) ?? 0), out: fromCents(outBy.get(key) ?? 0) };
  });
}

/** What the year would end with at this pace: profit so far × 12 / months gone by. Null without data. */
export function yearPace(series: readonly SeriesMonth[], today: string): { year: number; profit: number } | null {
  const t = partsOf(today);
  const months = series.filter((m) => m.year === t.year && m.month <= t.month);
  if (months.length < t.month || t.month < 1) return null;
  const inC = months.reduce((s, m) => s + toCents(m.in), 0);
  const outC = months.reduce((s, m) => s + toCents(m.out), 0);
  if (inC === 0 && outC === 0) return null;
  const pace = ((inC - outC) / 100) * (12 / t.month);
  return { year: t.year, profit: Math.round(pace / 1000) * 1000 };
}

// ── Expense categories ──
export type CategoryAgg = { category: string | null; total: Numeric; count: Numeric };
export type CategoryLine = { category: string; total: number; count: number; prevTotal: number };

/** One line per category (blank names together), biggest first, with the previous period's amount. */
export function mergeCategories(cur: readonly CategoryAgg[], prev: readonly CategoryAgg[]): CategoryLine[] {
  const by = new Map<string, { cents: number; count: number; prevCents: number }>();
  const get = (name: string | null) => {
    const k = (name ?? "").trim();
    let a = by.get(k);
    if (!a) by.set(k, (a = { cents: 0, count: 0, prevCents: 0 }));
    return a;
  };
  for (const r of cur) { const a = get(r.category); a.cents += toCents(r.total); a.count += toNumber(r.count); }
  for (const r of prev) get(r.category).prevCents += toCents(r.total);
  return [...by.entries()]
    .filter(([, a]) => a.cents !== 0 || a.prevCents !== 0)
    .map(([category, a]) => ({ category, total: fromCents(a.cents), count: a.count, prevTotal: fromCents(a.prevCents) }))
    .sort((x, y) => y.total - x.total || y.prevTotal - x.prevTotal || x.category.localeCompare(y.category));
}

// ── Balance sheet (from the journal) ──
export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";
export type AccountTotals = { accountId: number; code: string; name: string; type: AccountType | string; debit: Numeric; credit: Numeric };
export type BalanceLine = { accountId: number | null; code: string | null; name: string; balance: number };
export type BalanceSheet = {
  assets: BalanceLine[];
  liabilities: BalanceLine[];
  equity: BalanceLine[];
  /** Income minus expenses still sitting in the income and expense accounts (no closing entry yet). Part of equity. */
  unclosedEarnings: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  totalLiabilitiesAndEquity: number;
  /** Assets − (liabilities + equity). 0 when every entry balances; anything else means an entry is off. */
  difference: number;
  balanced: boolean;
};

/**
 * Every account with a balance, in its natural side: assets debit − credit, liabilities and equity
 * credit − debit. Accounts below zero stay (an overdrawn cash account lowers the assets; dropping it
 * made the assets look bigger than they are). The period's result that hasn't been closed into
 * equity yet is shown as its own equity line, so assets = liabilities + equity.
 */
export function buildBalanceSheet(rows: readonly AccountTotals[]): BalanceSheet {
  const by = new Map<number, { code: string; name: string; type: string; cents: number }>();
  for (const r of rows) {
    const a = by.get(r.accountId) ?? { code: r.code, name: r.name, type: String(r.type), cents: 0 };
    a.cents += toCents(r.debit) - toCents(r.credit);
    by.set(r.accountId, a);
  }
  const lines = (type: string, sign: 1 | -1): Array<BalanceLine & { cents: number }> =>
    [...by.entries()]
      .filter(([, a]) => a.type === type && a.cents !== 0)
      .map(([id, a]) => ({ accountId: id, code: a.code, name: a.name, cents: sign * a.cents, balance: fromCents(sign * a.cents) }))
      .sort((x, y) => (x.code ?? "").localeCompare(y.code ?? "", "en", { numeric: true }));
  const assets = lines("asset", 1);
  const liabilities = lines("liability", -1);
  const equity = lines("equity", -1);
  const revenueCents = [...by.values()].filter((a) => a.type === "revenue").reduce((s, a) => s - a.cents, 0);
  const expenseCents = [...by.values()].filter((a) => a.type === "expense").reduce((s, a) => s + a.cents, 0);
  const unclosed = revenueCents - expenseCents;
  const sum = (xs: Array<{ cents: number }>) => xs.reduce((s, x) => s + x.cents, 0);
  const aC = sum(assets);
  const lC = sum(liabilities);
  const eC = sum(equity) + unclosed;
  const strip = (xs: Array<BalanceLine & { cents: number }>): BalanceLine[] => xs.map((l) => ({ accountId: l.accountId, code: l.code, name: l.name, balance: l.balance }));
  return {
    assets: strip(assets),
    liabilities: strip(liabilities),
    equity: strip(equity),
    unclosedEarnings: fromCents(unclosed),
    totalAssets: fromCents(aC),
    totalLiabilities: fromCents(lC),
    totalEquity: fromCents(eC),
    totalLiabilitiesAndEquity: fromCents(lC + eC),
    difference: fromCents(aC - lC - eC),
    balanced: aC === lC + eC,
  };
}

// ── Cash flow (from the journal) ──
/** Cash, bank and Zelle (1100–1149). 1150 is money a card processor or client still owes, not cash yet. */
export function isCashAccount(code: string | null | undefined): boolean {
  return /^11[0-4]\d$/.test((code ?? "").trim());
}

export type CashEntryLine = { entryId: number; code: string; type: string; debit: Numeric; credit: Numeric };
export type CashFlow = {
  opening: number;
  /** Sales collected (refunds given back come off it). */
  fromSales: number;
  /** Expenses paid (shown as a positive amount that went out). */
  expensesPaid: number;
  /** Anything else that moved cash: transfers, the owner's money, adjustments. In and out apart. */
  otherIn: number;
  otherOut: number;
  closing: number;
  /** Net change of the period (closing − opening). */
  net: number;
};

/**
 * How the cash went from `openingCents` to the end of the period. Each journal entry that touches a cash
 * account is classified by what's on its other side: revenue → sales collected, expense → expenses paid,
 * anything else → other movements. closing = opening + every entry's net cash change.
 */
export function buildCashFlow(opening: Numeric, lines: readonly CashEntryLine[]): CashFlow {
  const byEntry = new Map<number, { cash: number; revenue: boolean; expense: boolean }>();
  for (const l of lines) {
    const e = byEntry.get(l.entryId) ?? { cash: 0, revenue: false, expense: false };
    if (isCashAccount(l.code) && l.type === "asset") e.cash += toCents(l.debit) - toCents(l.credit);
    else if (l.type === "revenue") e.revenue = true;
    else if (l.type === "expense") e.expense = true;
    byEntry.set(l.entryId, e);
  }
  let sales = 0;
  let spent = 0;
  let otherIn = 0;
  let otherOut = 0;
  for (const e of byEntry.values()) {
    if (e.cash === 0) continue;
    if (e.revenue && !e.expense) sales += e.cash;
    else if (e.expense && !e.revenue) spent -= e.cash;
    else if (e.cash > 0) otherIn += e.cash;
    else otherOut -= e.cash;
  }
  const openC = toCents(opening);
  const net = sales - spent + otherIn - otherOut;
  return {
    opening: fromCents(openC),
    fromSales: fromCents(sales),
    expensesPaid: fromCents(spent),
    otherIn: fromCents(otherIn),
    otherOut: fromCents(otherOut),
    closing: fromCents(openC + net),
    net: fromCents(net),
  };
}

// ── Who owes you and since when ──
export const AGING_BUCKETS = 5; // al corriente, 1–30, 31–60, 61–90, +90 days late

export function agingBucket(dueDate: string | null, today: string): number {
  if (!dueDate) return 0;
  const late = daysBetween(dueDate, today);
  return late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : late <= 90 ? 3 : 4;
}

export type AgingInput = { client: string; balance: number; dueDate: string | null };
export type AgingRow = { client: string; buckets: number[]; total: number };

/** One row per client (most owed first), the amount in each bucket, and the totals. */
export function buildAging(items: readonly AgingInput[], today: string): { rows: AgingRow[]; totals: number[]; total: number } {
  const by = new Map<string, number[]>();
  for (const i of items) {
    const c = toCents(i.balance);
    if (c <= 0) continue;
    const b = by.get(i.client) ?? new Array<number>(AGING_BUCKETS).fill(0);
    b[agingBucket(i.dueDate, today)] += c;
    by.set(i.client, b);
  }
  const totals = new Array<number>(AGING_BUCKETS).fill(0);
  const rows = [...by.entries()].map(([client, b]) => {
    b.forEach((v, k) => { totals[k] += v; });
    return { client, buckets: b.map(fromCents), total: fromCents(b.reduce((s, v) => s + v, 0)) };
  }).sort((x, y) => y.total - x.total || x.client.localeCompare(y.client));
  return { rows, totals: totals.map(fromCents), total: fromCents(totals.reduce((s, v) => s + v, 0)) };
}

// ── Plain-language tips under "¿De dónde vino?" ──
export type NamedAmount = { name: string; total: number };
export type Tip =
  | { kind: "sales"; dir: "up" | "down"; pct: number; driver: string | null }
  | { kind: "salesNew" }
  | { kind: "expenses"; dir: "up" | "down" | "same"; pct: number | null; top: string | null }
  | { kind: "pace"; year: number; profit: number };

/**
 * Up to three tips, each from real numbers: how sales moved (and the service that moved them most),
 * how expenses moved (and the biggest category), and what the year would end with at this pace.
 */
export function buildTips(input: {
  moneyIn: number; prevIn: number; moneyOut: number; prevOut: number;
  services: readonly NamedAmount[]; prevServices: readonly NamedAmount[];
  topCategory: string | null;
  pace: { year: number; profit: number } | null;
}): Tip[] {
  const tips: Tip[] = [];
  const s = change(input.moneyIn, input.prevIn, true);
  if (s.pct !== null && s.dir !== "same") {
    const prevBy = new Map(input.prevServices.map((x) => [x.name, toCents(x.total)]));
    const names = new Set([...input.services.map((x) => x.name), ...prevBy.keys()]);
    const curBy = new Map(input.services.map((x) => [x.name, toCents(x.total)]));
    let driver: string | null = null;
    let best = 0;
    for (const n of names) {
      const d = (curBy.get(n) ?? 0) - (prevBy.get(n) ?? 0);
      const signed = s.dir === "up" ? d : -d;
      if (signed > best) { best = signed; driver = n; }
    }
    tips.push({ kind: "sales", dir: s.dir, pct: s.pct, driver });
  } else if (s.pct === null && toCents(input.moneyIn) > 0) {
    tips.push({ kind: "salesNew" });
  }
  if (toCents(input.moneyOut) > 0 || toCents(input.prevOut) > 0) {
    const e = change(input.moneyOut, input.prevOut, false);
    tips.push({ kind: "expenses", dir: e.dir, pct: e.pct, top: input.topCategory });
  }
  if (input.pace) tips.push({ kind: "pace", ...input.pace });
  return tips;
}
