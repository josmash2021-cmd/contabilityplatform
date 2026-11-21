// "Para tu contador" (business Pro and Negocio): the pure parts.
// The server (api/accountant-router.ts) runs the SQL and hands the rows here; the page
// (src/pages/Accountant.tsx) uses the period helpers, and src/lib/accountantExport.ts
// turns the sheets shaped here into an Excel file.
// No imports on purpose: this file is bundled into both the server and the browser.

// ── Dates ──

/** A period of local calendar days, "YYYY-MM-DD", both ends included. */
export type DateRange = { startDate: string; endDate: string };

export type PeriodPreset = "thisMonth" | "lastMonth" | "quarter" | "year" | "custom";
export const PERIOD_PRESETS: readonly PeriodPreset[] = ["thisMonth", "lastMonth", "quarter", "year", "custom"];

/** Longest range the server accepts (two years), so one request stays reasonable. */
export const MAX_RANGE_DAYS = 731;

/** Most rows sent per section (sales, expenses, bank). Totals always cover the whole period. */
export const ROW_CAP = 2000;

const pad = (n: number) => String(n).padStart(2, "0");
const DAY_MS = 24 * 60 * 60 * 1000;

export function isoFromParts(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Days in a month (month 1-12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Year, month (1-12) and day of a real calendar date, or null ("2026-02-30" is not one). */
export function parseIsoDate(s: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1900 || year > 2999 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function isValidIsoDate(s: string): boolean {
  return parseIsoDate(s) !== null;
}

/** The device's local calendar day. */
export function localIsoDate(now: Date): string {
  return isoFromParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

const utcDay = (iso: string) => {
  const p = parseIsoDate(iso);
  return p ? Date.UTC(p.year, p.month - 1, p.day) : NaN;
};

/** Days in the range, both ends included (0 when it is not a valid range). */
export function rangeDays(r: DateRange): number {
  const days = (utcDay(r.endDate) - utcDay(r.startDate)) / DAY_MS + 1;
  return Number.isFinite(days) && days > 0 ? days : 0;
}

export type RangeProblem = "invalid" | "order" | "tooLong";

/** What is wrong with a range typed by the person, or null when it is fine. */
export function rangeProblem(r: DateRange): RangeProblem | null {
  if (!isValidIsoDate(r.startDate) || !isValidIsoDate(r.endDate)) return "invalid";
  if (r.startDate > r.endDate) return "order";
  if (rangeDays(r) > MAX_RANGE_DAYS) return "tooLong";
  return null;
}

export function monthRange(year: number, month: number): DateRange {
  return { startDate: isoFromParts(year, month, 1), endDate: isoFromParts(year, month, daysInMonth(year, month)) };
}

/** Calendar quarter (1-4): Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec. */
export function quarterRange(year: number, quarter: number): DateRange {
  const first = (quarter - 1) * 3 + 1;
  return { startDate: isoFromParts(year, first, 1), endDate: isoFromParts(year, first + 2, daysInMonth(year, first + 2)) };
}

export function yearRange(year: number): DateRange {
  return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
}

/**
 * The range for a period button. Whole calendar periods (the month, the quarter, the year
 * that contain `today`), like the month and year views of the Reports page. "custom"
 * returns the typed range, or null while it isn't valid.
 */
export function rangeForPreset(preset: PeriodPreset, today: string, custom?: DateRange): DateRange | null {
  const t = parseIsoDate(today);
  if (!t) return null;
  switch (preset) {
    case "thisMonth":
      return monthRange(t.year, t.month);
    case "lastMonth":
      return t.month === 1 ? monthRange(t.year - 1, 12) : monthRange(t.year, t.month - 1);
    case "quarter":
      return quarterRange(t.year, Math.ceil(t.month / 3));
    case "year":
      return yearRange(t.year);
    case "custom":
      return custom && rangeProblem(custom) === null ? custom : null;
  }
}

export type PeriodKind =
  | { kind: "month"; year: number; month: number }
  | { kind: "quarter"; year: number; quarter: number }
  | { kind: "year"; year: number }
  | { kind: "custom" };

const sameRange = (a: DateRange, b: DateRange) => a.startDate === b.startDate && a.endDate === b.endDate;

/** Whether the range is exactly one calendar month, quarter or year. */
export function describeRange(r: DateRange): PeriodKind {
  const s = parseIsoDate(r.startDate);
  if (!s || rangeProblem(r) !== null) return { kind: "custom" };
  if (sameRange(r, monthRange(s.year, s.month))) return { kind: "month", year: s.year, month: s.month };
  const quarter = Math.ceil(s.month / 3);
  if (sameRange(r, quarterRange(s.year, quarter))) return { kind: "quarter", year: s.year, quarter };
  if (sameRange(r, yearRange(s.year))) return { kind: "year", year: s.year };
  return { kind: "custom" };
}

/** Short tag for file names: "2026-11", "2026-Q4", "2026" or "2026-11-01_2026-11-15". */
export function periodTag(r: DateRange, quarterLetter = "Q"): string {
  const k = describeRange(r);
  if (k.kind === "month") return `${k.year}-${pad(k.month)}`;
  if (k.kind === "quarter") return `${k.year}-${quarterLetter}${k.quarter}`;
  if (k.kind === "year") return String(k.year);
  return r.startDate === r.endDate ? r.startDate : `${r.startDate}_${r.endDate}`;
}

/** "Contabilidad_2026-11.xlsx". The base name is cleaned so it is safe on any system. */
export function workbookFileName(base: string, r: DateRange, quarterLetter = "Q"): string {
  const clean = base.replace(/[^\p{L}\p{N}_-]+/gu, "_").replace(/^_+|_+$/g, "") || "Report";
  return `${clean}_${periodTag(r, quarterLetter)}.xlsx`;
}

// ── Money ──

/** What MySQL hands back: DECIMAL comes as a string, COUNT as a number. */
export type Numeric = number | string | null | undefined;

export function toNumber(v: Numeric): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : 0;
  return Number.isFinite(n) ? n : 0;
}

const toCents = (v: Numeric) => Math.round(toNumber(v) * 100);
const fromCents = (c: number) => c / 100;

/** Adds amounts in cents, so 0.1 + 0.2 is 0.3. */
export function sumMoney(values: readonly Numeric[]): number {
  return fromCents(values.reduce<number>((s, v) => s + toCents(v), 0));
}

// ── Income statement (same rules as the Reports page) ──
// Income: this user's sales with status "completed" (pending, cancelled and refunded don't
// count). Expenses: every expense this user recorded. Profit = income − expenses. Bank
// movements are shown apart and don't change the profit, as on the Reports page.

export type ExpenseCategoryAgg = { category: string | null; total: Numeric; count: Numeric };

export type ExpenseLine = { category: string; total: number; count: number; share: number };

export type IncomeStatement = {
  /** Completed sales in the period. */
  income: number;
  salesCount: number;
  /** Expenses by category, biggest first. An empty category is "". */
  expenseLines: ExpenseLine[];
  totalExpenses: number;
  expensesCount: number;
  profit: number;
  /** Profit as a fraction of income (0.25 = 25 %); null when there is no income. */
  margin: number | null;
};

export function buildIncomeStatement(input: {
  salesTotal: Numeric;
  salesCount: Numeric;
  expensesByCategory: readonly ExpenseCategoryAgg[];
}): IncomeStatement {
  // Merge categories that only differ by surrounding spaces.
  const byCategory = new Map<string, { cents: number; count: number }>();
  for (const r of input.expensesByCategory) {
    const key = (r.category ?? "").trim();
    const acc = byCategory.get(key) ?? { cents: 0, count: 0 };
    acc.cents += toCents(r.total);
    acc.count += toNumber(r.count);
    byCategory.set(key, acc);
  }
  const lines = [...byCategory.entries()].filter(([, a]) => a.count > 0 || a.cents !== 0);
  const expenseCents = lines.reduce((s, [, a]) => s + a.cents, 0);
  const incomeCents = toCents(input.salesTotal);
  const profitCents = incomeCents - expenseCents;

  const expenseLines: ExpenseLine[] = lines
    .map(([category, a]) => ({
      category,
      total: fromCents(a.cents),
      count: a.count,
      share: expenseCents > 0 ? a.cents / expenseCents : 0,
    }))
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));

  return {
    income: fromCents(incomeCents),
    salesCount: toNumber(input.salesCount),
    expenseLines,
    totalExpenses: fromCents(expenseCents),
    expensesCount: lines.reduce((s, [, a]) => s + a.count, 0),
    profit: fromCents(profitCents),
    margin: incomeCents > 0 ? profitCents / incomeCents : null,
  };
}

// ── Sales by status ──

export type StatusAgg = { status: string | null; total: Numeric; count: Numeric };

export type SalesTotals = {
  /** Every sale in the period, whatever its status. */
  count: number;
  completedCount: number;
  completedTotal: number;
  /** Pending, cancelled and refunded: listed for the accountant, not counted as income. */
  otherCount: number;
  otherTotal: number;
};

export function buildSalesTotals(rows: readonly StatusAgg[]): SalesTotals {
  let completedCents = 0;
  let otherCents = 0;
  let completedCount = 0;
  let otherCount = 0;
  for (const r of rows) {
    if (r.status === "completed") {
      completedCents += toCents(r.total);
      completedCount += toNumber(r.count);
    } else {
      otherCents += toCents(r.total);
      otherCount += toNumber(r.count);
    }
  }
  return {
    count: completedCount + otherCount,
    completedCount,
    completedTotal: fromCents(completedCents),
    otherCount,
    otherTotal: fromCents(otherCents),
  };
}

// ── Bank ──

export type BankTypeAgg = { type: string | null; total: Numeric; count: Numeric };

export type BankTotals = { count: number; moneyIn: number; moneyOut: number; net: number };

export function buildBankTotals(rows: readonly BankTypeAgg[]): BankTotals {
  let inCents = 0;
  let outCents = 0;
  let count = 0;
  for (const r of rows) {
    count += toNumber(r.count);
    if (r.type === "income") inCents += toCents(r.total);
    else if (r.type === "expense") outCents += toCents(r.total);
  }
  return { count, moneyIn: fromCents(inCents), moneyOut: fromCents(outCents), net: fromCents(inCents - outCents) };
}

// ── Row lists ──

/** Keeps the first `cap` rows. The query asks for cap + 1, so one extra row means "there is more". */
export function capRows<T>(rows: readonly T[], cap: number): { rows: T[]; truncated: boolean } {
  return { rows: rows.slice(0, cap), truncated: rows.length > cap };
}

export type SaleRow = {
  id: number;
  date: string;
  invoice: string;
  /** Customer name, or the name saved on the sale; null when there is none. */
  client: string | null;
  /** Services sold, comma separated. */
  items: string | null;
  method: string;
  total: number;
  status: string;
};

export type ExpenseRow = {
  id: number;
  date: string;
  description: string;
  category: string;
  method: string;
  amount: number;
};

export type BankRow = {
  id: number;
  date: string;
  description: string;
  category: string;
  type: "income" | "expense";
  amount: number;
  account: string | null;
};

/** What accountant.period returns. */
export type AccountantPeriod = {
  period: DateRange;
  rowCap: number;
  incomeStatement: IncomeStatement;
  sales: SalesTotals & { rows: SaleRow[]; truncated: boolean };
  expenses: { count: number; total: number; rows: ExpenseRow[]; truncated: boolean };
  bank: BankTotals & { rows: BankRow[]; truncated: boolean };
};

// ── Excel ──

/** Excel's day number for a calendar date (1900 date system), so it is stored as a real date. */
export function excelSerial(iso: string): number {
  const day = utcDay(iso);
  return Number.isFinite(day) ? Math.round((day - Date.UTC(1899, 11, 30)) / DAY_MS) : NaN;
}

/** Excel sheet names: at most 31 characters, none of : \ / ? * [ ]. */
export function safeSheetName(name: string): string {
  const clean = name.replace(/[:\\/?*[\]]/g, " ").replace(/\s+/g, " ").trim().replace(/^'+|'+$/g, "");
  return (clean || "Sheet").slice(0, 31);
}

export type SheetCell =
  | null
  | string
  | number
  | { kind: "date"; iso: string }
  | { kind: "money"; value: number }
  | { kind: "percent"; value: number };

/** Number formats written into the workbook. */
export const MONEY_FORMAT = '"$"#,##0.00';
export const PERCENT_FORMAT = "0.0%";

/** A SheetJS cell (only the fields the writer reads): numbers stay numbers, dates become date serials. */
export type XlsxCell = { t: "s" | "n"; v: string | number; z?: string };

export function toXlsxCell(cell: SheetCell, dateFormat: string): XlsxCell | null {
  if (cell === null || cell === "") return null;
  if (typeof cell === "string") return { t: "s", v: cell };
  if (typeof cell === "number") return Number.isFinite(cell) ? { t: "n", v: cell } : null;
  switch (cell.kind) {
    case "date": {
      const serial = excelSerial(cell.iso);
      return Number.isFinite(serial) ? { t: "n", v: serial, z: dateFormat } : { t: "s", v: cell.iso };
    }
    case "money":
      return { t: "n", v: cell.value, z: MONEY_FORMAT };
    case "percent":
      return { t: "n", v: cell.value, z: PERCENT_FORMAT };
  }
}

export type SheetSpec = {
  name: string;
  rows: SheetCell[][];
  /** Column widths in characters. */
  widths: number[];
  /** Header row (0-based) of the table that gets filter buttons, with its last data row. */
  filter?: { headerRow: number; lastRow: number; columns: number };
};

export type WorkbookLabels = {
  sheets: { summary: string; sales: string; expenses: string; bank: string };
  summary: {
    title: string;
    company: string;
    period: string;
    from: string;
    to: string;
    dataAsOf: string;
    statement: string;
    concept: string;
    amount: string;
    income: string;
    salesCompleted: (n: number) => string;
    totalIncome: string;
    expenses: string;
    totalExpenses: string;
    profit: string;
    margin: string;
    bank: string;
    bankIn: string;
    bankOut: string;
    bankNet: string;
    bankNote: string;
    onlyCompleted: string;
    truncated: (section: string, shown: number, total: number) => string;
  };
  sales: { date: string; invoice: string; client: string; items: string; method: string; status: string; total: string; totalCompleted: string };
  expenses: { date: string; description: string; category: string; method: string; amount: string; total: string };
  bank: { date: string; description: string; category: string; account: string; moneyIn: string; moneyOut: string; total: string };
  uncategorized: string;
  methods: Record<string, string>;
  statuses: Record<string, string>;
  bankCategories: Record<string, string>;
};

const money = (value: number): SheetCell => ({ kind: "money", value });
const day = (iso: string): SheetCell => ({ kind: "date", iso });
const labelOf = (dict: Record<string, string>, key: string) => dict[key] ?? key;

/**
 * The workbook as plain rows: a summary sheet (income statement and bank totals) and one
 * sheet per section. Amounts are numbers and dates are dates, so the accountant can sum
 * and sort them. `periodLabel` and `dataAsOf` are already formatted for the reader.
 */
export function buildWorkbookSheets(
  data: AccountantPeriod,
  labels: WorkbookLabels,
  meta: { company: string | null; periodLabel: string; dataAsOf: string },
): SheetSpec[] {
  const L = labels.summary;
  const s = data.incomeStatement;

  const summary: SheetCell[][] = [[L.title]];
  if (meta.company) summary.push([L.company, meta.company]);
  summary.push(
    [L.period, meta.periodLabel],
    [L.from, day(data.period.startDate)],
    [L.to, day(data.period.endDate)],
    [L.dataAsOf, meta.dataAsOf],
    [],
    [L.statement],
    [L.concept, L.amount],
    [L.income],
    [L.salesCompleted(s.salesCount), money(s.income)],
    [L.totalIncome, money(s.income)],
    [],
    [L.expenses],
    ...s.expenseLines.map((l): SheetCell[] => [l.category || labels.uncategorized, money(l.total)]),
    [L.totalExpenses, money(s.totalExpenses)],
    [],
    [L.profit, money(s.profit)],
  );
  if (s.margin !== null) summary.push([L.margin, { kind: "percent", value: s.margin }]);
  summary.push(
    [],
    [L.bank],
    [L.bankIn, money(data.bank.moneyIn)],
    [L.bankOut, money(data.bank.moneyOut)],
    [L.bankNet, money(data.bank.net)],
    [],
    [L.onlyCompleted],
    [L.bankNote],
  );
  const cut: Array<[string, { truncated: boolean; rows: unknown[]; count: number }]> = [
    [labels.sheets.sales, data.sales],
    [labels.sheets.expenses, data.expenses],
    [labels.sheets.bank, data.bank],
  ];
  for (const [name, section] of cut) {
    if (section.truncated) summary.push([L.truncated(name, section.rows.length, section.count)]);
  }

  const S = labels.sales;
  const sales: SheetCell[][] = [
    [S.date, S.invoice, S.client, S.items, S.method, S.status, S.total],
    ...data.sales.rows.map((r): SheetCell[] => [
      day(r.date), r.invoice, r.client ?? "", r.items ?? "", labelOf(labels.methods, r.method), labelOf(labels.statuses, r.status), money(r.total),
    ]),
    [],
    [S.totalCompleted, null, null, null, null, null, money(data.sales.completedTotal)],
  ];

  const E = labels.expenses;
  const expenses: SheetCell[][] = [
    [E.date, E.description, E.category, E.method, E.amount],
    ...data.expenses.rows.map((r): SheetCell[] => [
      day(r.date), r.description, r.category.trim() || labels.uncategorized, labelOf(labels.methods, r.method), money(r.amount),
    ]),
    [],
    [E.total, null, null, null, money(data.expenses.total)],
  ];

  const B = labels.bank;
  const bank: SheetCell[][] = [
    [B.date, B.description, B.category, B.account, B.moneyIn, B.moneyOut],
    ...data.bank.rows.map((r): SheetCell[] => [
      day(r.date), r.description, labelOf(labels.bankCategories, r.category), r.account ?? "",
      r.type === "income" ? money(r.amount) : null,
      r.type === "expense" ? money(r.amount) : null,
    ]),
    [],
    [B.total, null, null, null, money(data.bank.moneyIn), money(data.bank.moneyOut)],
  ];

  // Header on row 0, data on rows 1..n (the blank row and the total stay out of the filter).
  const table = (rows: number, columns: number) => ({ headerRow: 0, lastRow: rows, columns });
  return [
    { name: safeSheetName(labels.sheets.summary), rows: summary, widths: [44, 22] },
    { name: safeSheetName(labels.sheets.sales), rows: sales, widths: [12, 16, 28, 40, 14, 14, 14], filter: table(data.sales.rows.length, 7) },
    { name: safeSheetName(labels.sheets.expenses), rows: expenses, widths: [12, 40, 22, 14, 14], filter: table(data.expenses.rows.length, 5) },
    { name: safeSheetName(labels.sheets.bank), rows: bank, widths: [12, 44, 24, 22, 14, 14], filter: table(data.bank.rows.length, 6) },
  ];
}
