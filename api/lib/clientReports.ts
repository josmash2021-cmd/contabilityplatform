// Reports by client and by service (Negocio plan): the pure parts.
// The server (api/reports-router.ts) runs the SQL and hands the grouped rows here;
// the Reports page (src/pages/Reports.tsx) uses the sorting, top-N and period helpers.
// No imports on purpose: this file is bundled into both the server and the browser.

/** What MySQL hands back for SUM/COUNT: DECIMAL comes as a string, COUNT as a number. */
export type Numeric = number | string | null | undefined;

export function toNumber(v: Numeric): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : 0;
  return Number.isFinite(n) ? n : 0;
}

const toCents = (v: Numeric) => Math.round(toNumber(v) * 100);
const fromCents = (c: number) => c / 100;

/** Part of the whole as a fraction (0.25 = 25 %). 0 when the whole is 0 or negative. */
export function shareOf(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0;
}

/** Average rounded to cents. 0 when there is nothing to divide by. */
export function averageOf(total: number, count: number): number {
  return count > 0 ? Math.round((total / count) * 100) / 100 : 0;
}

/**
 * Normalizes a sale timestamp to an ISO string. drizzle hands back Dates; a bare MySQL
 * "YYYY-MM-DD HH:MM:SS" string is read as UTC, the same way drizzle reads timestamps.
 */
export function toIsoTimestamp(v: Date | string | null | undefined): string | null {
  if (v == null || v === "") return null;
  const d = v instanceof Date
    ? v
    : new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(v) ? `${v.replace(" ", "T")}Z` : v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ── By client ──

/** One row per customer from the GROUP BY (customerId null = sales with no customer). */
export type ClientAggRow = {
  customerId: number | null;
  /** Current name in the customers table. */
  name: string | null;
  /** Name saved on the sale, used when the customer row is gone. */
  snapshotName?: string | null;
  salesCount: Numeric;
  total: Numeric;
  lastSaleAt: Date | string | null;
};

export type ClientReportRow = {
  /** Stable key for lists: "c:<id>" or "none". */
  key: string;
  /** null = "sin cliente" (sales with no customer). */
  customerId: number | null;
  name: string | null;
  salesCount: number;
  total: number;
  averageTicket: number;
  /** ISO timestamp of the latest sale in the period. */
  lastSaleAt: string | null;
  /** Fraction of the period's total (0..1). */
  share: number;
};

export type ClientReport = {
  rows: ClientReportRow[];
  totals: {
    /** Customers with at least one sale (the "sin cliente" row is not a customer). */
    customers: number;
    salesCount: number;
    total: number;
    averageTicket: number;
    /** What the sales with no customer add up to (0 when there are none). */
    noCustomerTotal: number;
  };
};

const latest = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);

export function buildClientReport(input: readonly ClientAggRow[]): ClientReport {
  // Merge defensively: one row per customer, and a single "sin cliente" row.
  const byKey = new Map<string, { customerId: number | null; name: string | null; count: number; cents: number; last: string | null }>();
  for (const r of input) {
    const key = r.customerId == null ? "none" : `c:${r.customerId}`;
    const name = r.customerId == null ? null : (r.name?.trim() || r.snapshotName?.trim() || null);
    const last = toIsoTimestamp(r.lastSaleAt);
    const acc = byKey.get(key);
    if (acc) {
      acc.count += toNumber(r.salesCount);
      acc.cents += toCents(r.total);
      acc.last = latest(acc.last, last);
      acc.name ??= name;
    } else {
      byKey.set(key, { customerId: r.customerId ?? null, name, count: toNumber(r.salesCount), cents: toCents(r.total), last });
    }
  }

  const all = [...byKey.entries()].filter(([, a]) => a.count > 0);
  const totalCents = all.reduce((s, [, a]) => s + a.cents, 0);
  const salesCount = all.reduce((s, [, a]) => s + a.count, 0);
  const total = fromCents(totalCents);

  const rows: ClientReportRow[] = all.map(([key, a]) => ({
    key,
    customerId: a.customerId,
    name: a.name,
    salesCount: a.count,
    total: fromCents(a.cents),
    averageTicket: averageOf(fromCents(a.cents), a.count),
    lastSaleAt: a.last,
    share: shareOf(a.cents, totalCents),
  }));

  return {
    rows: sortRows(rows, "total", "desc"),
    totals: {
      customers: rows.filter((r) => r.customerId != null).length,
      salesCount,
      total,
      averageTicket: averageOf(total, salesCount),
      noCustomerTotal: rows.find((r) => r.customerId == null)?.total ?? 0,
    },
  };
}

// ── By service ──

/** One row per service from the GROUP BY over the sale lines. */
export type ServiceAggRow = {
  serviceId: number | null;
  /** Current name in the services table. */
  name: string | null;
  /** Name saved on the sale line, used when the service row is gone. */
  snapshotName?: string | null;
  quantity: Numeric;
  revenue: Numeric;
  /** Distinct sales that included the service. */
  salesCount: Numeric;
};

export type ServiceReportRow = {
  key: string;
  serviceId: number | null;
  name: string | null;
  quantity: number;
  revenue: number;
  salesCount: number;
  /** Fraction of the period's service revenue (0..1). */
  share: number;
  /** Revenue per unit sold. */
  averagePrice: number;
};

export type ServiceReport = {
  rows: ServiceReportRow[];
  totals: {
    services: number;
    quantity: number;
    revenue: number;
    /** Distinct sales with at least one service line (not the sum of the rows: a sale can have several services). */
    salesCount: number;
    averagePrice: number;
  };
};

export function buildServiceReport(input: readonly ServiceAggRow[], distinctSales: Numeric): ServiceReport {
  const byKey = new Map<string, { serviceId: number | null; name: string | null; qty: number; cents: number; count: number }>();
  for (const r of input) {
    const key = r.serviceId == null ? "none" : `s:${r.serviceId}`;
    const name = r.name?.trim() || r.snapshotName?.trim() || null;
    const acc = byKey.get(key);
    if (acc) {
      acc.qty += toNumber(r.quantity);
      acc.cents += toCents(r.revenue);
      acc.count += toNumber(r.salesCount);
      acc.name ??= name;
    } else {
      byKey.set(key, { serviceId: r.serviceId ?? null, name, qty: toNumber(r.quantity), cents: toCents(r.revenue), count: toNumber(r.salesCount) });
    }
  }

  const all = [...byKey.entries()].filter(([, a]) => a.qty > 0 || a.cents !== 0);
  const totalCents = all.reduce((s, [, a]) => s + a.cents, 0);
  const quantity = all.reduce((s, [, a]) => s + a.qty, 0);
  const revenue = fromCents(totalCents);

  const rows: ServiceReportRow[] = all.map(([key, a]) => ({
    key,
    serviceId: a.serviceId,
    name: a.name,
    quantity: a.qty,
    revenue: fromCents(a.cents),
    salesCount: a.count,
    share: shareOf(a.cents, totalCents),
    averagePrice: averageOf(fromCents(a.cents), a.qty),
  }));

  return {
    rows: sortRows(rows, "revenue", "desc"),
    totals: {
      services: rows.length,
      quantity,
      revenue,
      salesCount: toNumber(distinctSales),
      averagePrice: averageOf(revenue, quantity),
    },
  };
}

// ── Sorting and highlights ──

export type SortDir = "asc" | "desc";

function compareValues(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { sensitivity: "base", numeric: true });
}

/**
 * Returns a sorted copy. Empty values (null, undefined, "") always go last, whichever
 * the direction, so "sin cliente" (no name) and missing dates never lead the list.
 * Ties keep their original order.
 */
export function sortRows<T>(rows: readonly T[], key: keyof T, dir: SortDir): T[] {
  const sign = dir === "asc" ? 1 : -1;
  const empty = (v: unknown) => v == null || v === "";
  return rows
    .map((row, i) => ({ row, i }))
    .sort((x, y) => {
      const a = x.row[key];
      const b = y.row[key];
      if (empty(a) || empty(b)) return empty(a) === empty(b) ? x.i - y.i : empty(a) ? 1 : -1;
      return compareValues(a, b) * sign || x.i - y.i;
    })
    .map((x) => x.row);
}

export type SortState<K extends string> = { key: K; dir: SortDir };

/**
 * The sort after clicking a column: the same column flips direction; a new column starts
 * A→Z for text (`textKeys`) and highest first for amounts, counts and dates.
 */
export function nextSort<K extends string>(current: SortState<K>, key: K, textKeys: readonly K[] = []): SortState<K> {
  if (current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: textKeys.includes(key) ? "asc" : "desc" };
}

/** The n rows with the highest value of `key`, skipping rows `include` rejects and rows at 0 or below. */
export function topBy<T>(rows: readonly T[], key: keyof T, n: number, include: (row: T) => boolean = () => true): T[] {
  const candidates = rows.filter((r) => include(r) && typeof r[key] === "number" && (r[key] as number) > 0);
  return sortRows(candidates, key, "desc").slice(0, Math.max(0, n));
}

// ── Period ──

export type ReportPeriod = "today" | "week" | "month" | "year";
export type DateRange = { startDate: string; endDate: string };

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The date range (local "YYYY-MM-DD", both ends included) for the Reports page period filter:
 * today and week come from the client's own dates; month and year from the month/year pickers.
 */
export function rangeForPeriod(
  period: string,
  local: { todayDate: string; weekStartDate: string },
  year: number,
  month: number,
): DateRange {
  if (period === "today") return { startDate: local.todayDate, endDate: local.todayDate };
  if (period === "week") return { startDate: local.weekStartDate, endDate: local.todayDate };
  if (period === "year") return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { startDate: `${year}-${pad(month)}-01`, endDate: `${year}-${pad(month)}-${pad(lastDay)}` };
}
