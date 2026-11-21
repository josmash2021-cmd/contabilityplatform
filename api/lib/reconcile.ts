// ── Cuadrar con tu estado de cuenta: the pure rules (no database) ──
// Used by api/reconcile-router.ts and tested in api/lib/reconcile.test.ts.
// Money is whole cents (integers) from the moment it leaves the database to the moment it goes back.
//
// Sign convention (Plaid's): a movement's plaidAmount is POSITIVE when money goes OUT of the account
// (a purchase, a payment) and NEGATIVE when it comes IN. Rows without plaidAmount (old imports) use
// `type`: income = in, expense = out. For cards and loans the balance is what's owed, so a positive
// plaidAmount (a charge) makes it bigger.

export const EDGE_DAYS = 3;
export const MAX_PERIOD_DAYS = 400;
export const STALE_SYNC_DAYS = 2;
export const MAX_CAUSE_TXS = 4;

// ── Calendar days ("YYYY-MM-DD", no time zones) ──
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

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
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

function fromDayNumber(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return fromDayNumber(dayNumber(iso) + days);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

export function utcToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// ── Money ──

/**
 * Exact cents from a DECIMAL value as MySQL returns it ("11794.21", "-15.5", "0") or a number.
 * Strings are read digit by digit, so no float rounding gets in.
 */
export function decimalToCents(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const s = typeof value === "number" ? value.toFixed(2) : value.trim();
  const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) return 0;
  const whole = Number(m[2] || "0");
  const frac = (m[3] ?? "").padEnd(3, "0");
  // Round half away from zero on the third decimal (DECIMAL(…,2) never has one; SUM results might).
  let cents = whole * 100 + Number(frac.slice(0, 2)) + (Number(frac[2]) >= 5 ? 1 : 0);
  if (m[1] === "-") cents = -cents;
  return cents === 0 ? 0 : cents;
}

/** Cents → "1234.56" / "-15.49": what goes into a DECIMAL column or a tRPC answer. */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** The balance the user typed, already normalized by the app ("11794.21", "-50", "0.5"). Null if it isn't one. */
export const STATEMENT_RE = /^-?\d{1,11}(\.\d{1,2})?$/;
export function statementToCents(value: string): number | null {
  return STATEMENT_RE.test(value) ? decimalToCents(value) : null;
}

export type MovementMoney = { plaidAmount: string | number | null; amount: string | number | null; type: string | null };

/** Money OUT of the account in cents (negative = money in), with Plaid's sign. */
export function movementOutCents(m: MovementMoney): number {
  if (m.plaidAmount !== null && m.plaidAmount !== undefined && String(m.plaidAmount).trim() !== "") return decimalToCents(m.plaidAmount);
  const abs = Math.abs(decimalToCents(m.amount));
  return m.type === "income" ? -abs : abs;
}

/**
 * What the account's balance was at the end of the statement's last day, from the balance we have now
 * and every movement dated after that day: undo each one. A bank account had MORE before money went out;
 * a card OWED LESS before it was charged.
 */
export function bookBalanceAtEnd(input: { currentCents: number; afterOutCents: number; debt: boolean }): number {
  return input.debt ? input.currentCents - input.afterOutCents : input.currentCents + input.afterOutCents;
}

/** The balance the period's own movements lead to, starting from the previous closed statement. */
export function expectedFromPrevious(input: { previousStatementCents: number; periodOutCents: number; debt: boolean }): number {
  return input.debt ? input.previousStatementCents + input.periodOutCents : input.previousStatementCents - input.periodOutCents;
}

export type Comparison = {
  matches: boolean;
  /** Which check failed: today's balance rolled back to the end date ("book"), or the period's own movements ("period"). */
  mismatch: "book" | "period" | null;
  /** Statement minus records, in cents, for the failed check (0 when it matches). */
  differenceCents: number;
};

/**
 * Cuadra al centavo when the statement's ending balance equals the records' balance at that day, and, when
 * the previous period was closed right before this one, also equals what this period's movements lead to.
 */
export function compareBalances(input: { statementCents: number; bookCents: number; fromPreviousCents: number | null }): Comparison {
  const book = input.statementCents - input.bookCents;
  if (book !== 0) return { matches: false, mismatch: "book", differenceCents: book };
  if (input.fromPreviousCents !== null) {
    const period = input.statementCents - input.fromPreviousCents;
    if (period !== 0) return { matches: false, mismatch: "period", differenceCents: period };
  }
  return { matches: true, mismatch: null, differenceCents: 0 };
}

// ── Periods ──
export type Period = { start: string; end: string };

export function overlaps(a: Period, b: Period): boolean {
  return a.start <= b.end && b.start <= a.end;
}

/** The previous calendar month, whole: the default when nothing was closed yet. */
export function lastFullMonth(today: string): Period {
  const [y, m] = today.split("-").map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const mm = String(pm).padStart(2, "0");
  return { start: `${py}-${mm}-01`, end: `${py}-${mm}-${String(daysInMonth(py, pm)).padStart(2, "0")}` };
}

/**
 * The statement after the one that ended on `previousEnd`: starts the next day and ends on the same day of
 * the next month (the last day when the month is shorter, or when the previous one ended on a month's last day).
 */
export function nextPeriod(previousEnd: string): Period {
  const [y, m, d] = previousEnd.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const lastDay = daysInMonth(ny, nm);
  const endDay = d === daysInMonth(y, m) ? lastDay : Math.min(d, lastDay);
  return { start: addDays(previousEnd, 1), end: `${ny}-${String(nm).padStart(2, "0")}-${String(endDay).padStart(2, "0")}` };
}

export type PeriodSuggestion = Period & {
  /** The statement for this period can't exist yet (it ends after today): wait for it. */
  waiting: boolean;
  /** A period that was closed and then reopened: picking it up again to fix and close it. */
  reopenedId: number | null;
};

/**
 * Which period the card starts on: a reopened one still waiting to be closed again; else the one after the
 * last closed period; else the last full month.
 */
export function suggestPeriod(input: {
  today: string;
  lastClosed: Period | null;
  reopened: Array<Period & { id: number }>;
  closed: Period[];
}): PeriodSuggestion {
  const pending = input.reopened
    .filter((r) => !input.closed.some((c) => overlaps(c, r)))
    .sort((a, b) => (a.end < b.end ? 1 : a.end > b.end ? -1 : 0))[0];
  if (pending && (!input.lastClosed || pending.end > input.lastClosed.end)) {
    return { start: pending.start, end: pending.end, waiting: false, reopenedId: pending.id };
  }
  if (input.lastClosed) {
    const next = nextPeriod(input.lastClosed.end);
    return { ...next, waiting: next.end > input.today, reopenedId: null };
  }
  return { ...lastFullMonth(input.today), waiting: false, reopenedId: null };
}

export type PeriodProblem = "badDate" | "order" | "future" | "tooLong";

export function checkPeriod(p: Period, today: string): PeriodProblem | null {
  if (!isIsoDate(p.start) || !isIsoDate(p.end)) return "badDate";
  if (p.start > p.end) return "order";
  if (p.end > today) return "future";
  if (daysBetween(p.start, p.end) + 1 > MAX_PERIOD_DAYS) return "tooLong";
  return null;
}

// ── Likely causes of a difference ──
export type Row = {
  id: number;
  date: string;
  description: string;
  outCents: number;
  reviewed: boolean;
};

/** A movement as the app shows it: amountCents is + for money in, − for money out. */
export type CauseTx = { id: number; date: string; description: string; amountCents: number; reviewed: boolean };

export type Cause =
  | { kind: "exact"; tx: CauseTx; where: "after" | "inside" | "before" }
  | { kind: "duplicates"; pairs: Array<{ a: CauseTx; b: CauseTx; isDifference: boolean }> }
  | { kind: "edge"; edge: "end" | "start"; txs: CauseTx[] }
  | { kind: "stale"; lastSyncedAt: string }
  | { kind: "unreviewed"; count: number; txs: CauseTx[] };

const toTx = (r: Row): CauseTx => ({ id: r.id, date: r.date, description: r.description, amountCents: -r.outCents, reviewed: r.reviewed });

/** "AMAZON MKTPL*2K4 #123" → "amazon mktpl k": letters only, for comparing descriptions. */
export function normalizeDescription(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]+/g, " ").trim();
}

/** Same merchant, roughly: equal once normalized, one starts with the other, or most words shared. */
export function similarDescriptions(a: string, b: string): boolean {
  const x = normalizeDescription(a);
  const y = normalizeDescription(b);
  if (!x || !y) return x === y;
  if (x === y || x.startsWith(y) || y.startsWith(x)) return true;
  const wx = new Set(x.split(" ").filter((w) => w.length > 1));
  const wy = new Set(y.split(" ").filter((w) => w.length > 1));
  if (wx.size === 0 || wy.size === 0) return false;
  let shared = 0;
  for (const w of wx) if (wy.has(w)) shared++;
  return shared / Math.min(wx.size, wy.size) >= 0.6;
}

/** Pairs of movements on the same day, for the same amount, with a similar description. */
export function findDuplicates(rows: Row[]): Array<[Row, Row]> {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    if (r.outCents === 0) continue;
    const key = `${r.date}|${r.outCents}`;
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }
  const pairs: Array<[Row, Row]> = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const used = new Set<number>();
    for (let i = 0; i < g.length; i++) {
      if (used.has(g[i].id)) continue;
      for (let j = i + 1; j < g.length; j++) {
        if (used.has(g[j].id) || !similarDescriptions(g[i].description, g[j].description)) continue;
        pairs.push([g[i], g[j]]);
        used.add(g[i].id);
        used.add(g[j].id);
        break;
      }
    }
  }
  return pairs.sort((p, q) => (p[0].date < q[0].date ? -1 : p[0].date > q[0].date ? 1 : p[0].id - q[0].id));
}

/**
 * The most likely reasons the records and the statement differ, most telling first, from the account's
 * movements dated from a few days before the period up to today.
 */
export function findCauses(input: {
  rows: Row[];
  period: Period;
  differenceCents: number;
  mismatch: "book" | "period";
  today: string;
  lastSyncedAt: string | null;
  unreviewed: { count: number; rows: Row[] };
}): Cause[] {
  const { rows, period, differenceCents: diff, mismatch } = input;
  const abs = Math.abs(diff);
  const near = (r: Row, day: string) => Math.abs(daysBetween(day, r.date)) <= EDGE_DAYS;
  // A "book" difference comes from the end date onward; a "period" one from inside the period.
  const relevant = (r: Row) => (mismatch === "book"
    ? r.date > period.end || near(r, period.end)
    : r.date >= addDays(period.start, -EDGE_DAYS) && r.date <= addDays(period.end, EDGE_DAYS));

  // Possible duplicates (a repeated movement counts twice).
  const dupes = findDuplicates(rows.filter(relevant));
  const inDupes = new Set(dupes.flatMap(([a, b]) => [a.id, b.id]));
  const dupeIsDifference = abs > 0 && dupes.some(([a]) => Math.abs(a.outCents) === abs);
  const dupeCause: Cause | null = dupes.length
    ? { kind: "duplicates", pairs: dupes.slice(0, MAX_CAUSE_TXS).map(([a, b]) => ({ a: toTx(a), b: toTx(b), isDifference: Math.abs(a.outCents) === abs })) }
    : null;

  // One movement worth exactly the difference.
  const exact: Cause[] = abs === 0 ? [] : rows
    .filter((r) => !inDupes.has(r.id) && Math.abs(r.outCents) === abs && relevant(r))
    .sort((a, b) => Math.abs(daysBetween(period.end, a.date)) - Math.abs(daysBetween(period.end, b.date)))
    .slice(0, 2)
    .map((r) => ({ kind: "exact", tx: toTx(r), where: r.date > period.end ? "after" : r.date < period.start ? "before" : "inside" }));

  // A repeated movement worth exactly the difference explains it on its own: it goes first.
  const causes: Cause[] = dupeIsDifference && dupeCause ? [dupeCause, ...exact] : [...exact, ...(dupeCause ? [dupeCause] : [])];

  // Movements around the edge that matters: the bank may date them a day or two apart from the app.
  const edgeDay = mismatch === "book" ? period.end : period.start;
  const shown = new Set([...inDupes, ...exact.flatMap((c) => (c.kind === "exact" ? [c.tx.id] : []))]);
  const edge = rows.filter((r) => near(r, edgeDay) && !shown.has(r.id))
    .sort((a, b) => Math.abs(daysBetween(edgeDay, a.date)) - Math.abs(daysBetween(edgeDay, b.date)) || a.id - b.id)
    .slice(0, MAX_CAUSE_TXS)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
  // Only when nothing above is worth exactly the difference (then the list would just be noise).
  const explained = dupeIsDifference || exact.length > 0;
  if (edge.length && !explained) causes.push({ kind: "edge", edge: mismatch === "book" ? "end" : "start", txs: edge.map(toTx) });

  // Today's balance is old: movements since then aren't in it.
  if (mismatch === "book" && input.lastSyncedAt && daysBetween(input.lastSyncedAt, input.today) > STALE_SYNC_DAYS) {
    causes.push({ kind: "stale", lastSyncedAt: input.lastSyncedAt });
  }

  // Movements of the period still waiting in Por revisar (one may not be from this account, or be repeated).
  if (input.unreviewed.count > 0) {
    causes.push({ kind: "unreviewed", count: input.unreviewed.count, txs: input.unreviewed.rows.slice(0, MAX_CAUSE_TXS).map(toTx) });
  }
  return causes;
}
