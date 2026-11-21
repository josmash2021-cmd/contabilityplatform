// ── Ventas: Cobrar, Clientes and Productos y servicios ──
// Pure helpers shared by the server (api/sales-router.ts, api/cashcount-router.ts,
// api/customers-router.ts, api/services-router.ts) and the screens (src/pages/POS.tsx,
// Customers.tsx, Services.tsx). No database, no clock: every "today" comes in as an argument.

// ── Money (whole cents, so sums never drift) ──

/** "12.5" / 12.5 → 1250. Anything that isn't a number counts as 0. */
export function toCents(value: number | string | null | undefined): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** 1250 → "12.50" (what the database's DECIMAL columns take). */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** What someone types in a money box ("$1,234.5") → cents; null when it isn't a valid amount. */
export function parseMoneyInput(text: string): number | null {
  const clean = text.replace(/[$,\s]/g, "");
  if (clean === "") return null;
  if (!/^\d*\.?\d{0,2}$/.test(clean) || clean === ".") return null;
  return toCents(clean);
}

// ── Cobrar: cash, change, split ──

export type PayMethod = "cash" | "zelle" | "card";
export type SaleMethod = PayMethod | "mixed";

/** Cash handed over vs. what's owed: the change to give back, or what's still missing. */
export function changeDue(totalCents: number, receivedCents: number | null): { changeCents: number; shortCents: number } {
  if (receivedCents === null) return { changeCents: 0, shortCents: 0 };
  const diff = receivedCents - totalCents;
  return diff >= 0 ? { changeCents: diff, shortCents: 0 } : { changeCents: 0, shortCents: -diff };
}

/** Quick "they paid with…" amounts: exact, the next $50 and the next $100 (no repeats). */
export function cashChips(totalCents: number): number[] {
  if (totalCents <= 0) return [];
  const up = (step: number) => Math.ceil(totalCents / step) * step;
  return [...new Set([totalCents, up(5000), up(10000)])];
}

export type SplitResult =
  | { ok: true; payments: Array<{ method: PayMethod; cents: number }> }
  | { ok: false; reason: "noCash" | "allCash" };

/**
 * Part in cash, the rest with another method. Both parts must be more than $0
 * (all in cash is a cash sale, not a split one).
 */
export function splitPayment(totalCents: number, cashCents: number | null, rest: Exclude<PayMethod, "cash">): SplitResult {
  if (cashCents === null || cashCents <= 0) return { ok: false, reason: "noCash" };
  if (cashCents >= totalCents) return { ok: false, reason: "allCash" };
  return { ok: true, payments: [{ method: "cash", cents: cashCents }, { method: rest, cents: totalCents - cashCents }] };
}

/** The sale's paymentMethod for a list of payments: one method, or "mixed". */
export function methodOf(payments: ReadonlyArray<{ method: PayMethod }>): SaleMethod {
  const set = new Set(payments.map((p) => p.method));
  if (set.size === 1) return [...set][0];
  return "mixed";
}

/** Payments must add up to the sale's total, to the cent. */
export function paymentsMatchTotal(payments: ReadonlyArray<{ amount: number | string }>, total: number | string): boolean {
  return payments.reduce((s, p) => s + toCents(p.amount), 0) === toCents(total);
}

// ── Cierre de caja ──

export type CountStatus = "ok" | "over" | "short";

/** Counted cash vs. what the day's sales say should be there. */
export function cashCountResult(expectedCents: number, countedCents: number): { differenceCents: number; status: CountStatus } {
  const differenceCents = countedCents - expectedCents;
  return { differenceCents, status: differenceCents === 0 ? "ok" : differenceCents > 0 ? "over" : "short" };
}

/** Money received per method; refunds given back in cash leave the drawer too. */
export function dayTotals(
  payments: ReadonlyArray<{ method: PayMethod; cents: number }>,
  refunds: ReadonlyArray<{ method: PayMethod; cents: number }> = [],
): Record<PayMethod, number> & { total: number } {
  const out = { cash: 0, zelle: 0, card: 0, total: 0 };
  for (const p of payments) out[p.method] += p.cents;
  for (const r of refunds) out[r.method] -= r.cents;
  out.total = out.cash + out.zelle + out.card;
  return out;
}

// ── Days and time zones ──

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(day: string): boolean {
  if (!DAY_RE.test(day)) return false;
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isValidTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The calendar day ("YYYY-MM-DD") an instant falls on in a time zone. */
export function dayIn(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** How far the zone's wall clock is ahead of UTC at that instant, in ms (negative in the Americas). */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return wall - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant a day starts (midnight) in a time zone, daylight saving included. */
export function startOfDayIn(day: string, timeZone: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const wallMidnight = Date.UTC(y, m - 1, d);
  let t = wallMidnight - zoneOffsetMs(new Date(wallMidnight), timeZone);
  t = wallMidnight - zoneOffsetMs(new Date(t), timeZone);
  return new Date(t);
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** [start, end) of a calendar day in a time zone. */
export function dayWindow(day: string, timeZone: string): { start: Date; end: Date } {
  return { start: startOfDayIn(day, timeZone), end: startOfDayIn(addDays(day, 1), timeZone) };
}

export function firstOfMonth(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export function firstOfYear(day: string): string {
  return `${day.slice(0, 4)}-01-01`;
}

/** Whole days from one day to another (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)));
  const b = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  return Math.round((b - a) / 86_400_000);
}

// ── Productos y servicios ──

export type ItemKind = "service" | "product";
export const LOW_STOCK = 3;

/** (price − cost) / price, as a whole percent; null without a price. */
export function marginPct(priceCents: number, costCents: number): number | null {
  if (priceCents <= 0) return null;
  return Math.round(((priceCents - costCents) / priceCents) * 100);
}

export type StockState = "untracked" | "ok" | "low" | "out";

export function stockState(trackStock: boolean, stock: number): StockState {
  if (!trackStock) return "untracked";
  if (stock <= 0) return "out";
  return stock <= LOW_STOCK ? "low" : "ok";
}

/** Units of each service in a sale (a service can be on several lines). */
export function unitsByService(items: ReadonlyArray<{ serviceId?: number | null; quantity: number }>): Map<number, number> {
  const out = new Map<number, number>();
  for (const i of items) if (i.serviceId) out.set(i.serviceId, (out.get(i.serviceId) ?? 0) + i.quantity);
  return out;
}

// ── Clientes ──

/** Days without coming back before a client counts as "Sin venir". */
export const IDLE_DAYS = 90;
/** Days to pay a pending sale that has no invoice row of its own (same as Facturas). */
export const DEFAULT_TERMS = 14;

export type MoneyMove = { kind: "payment" | "refund"; cents: number };

/** What's still owed on a pending sale: its total minus what was paid (net of refunds). */
export function balanceCents(totalCents: number, moves: readonly MoneyMove[]): number {
  const net = moves.reduce((s, m) => s + (m.kind === "payment" ? m.cents : -m.cents), 0);
  return Math.max(0, totalCents - net);
}

/** A pending sale is late the day after it was due. */
export function isLate(dueDay: string | null, today: string): boolean {
  return !!dueDay && dueDay < today;
}

export function isIdle(lastVisitDay: string | null, today: string): boolean {
  return !!lastVisitDay && daysBetween(lastVisitDay, today) >= IDLE_DAYS;
}

/** On average, how many days after the invoice date the client paid it off. Null without paid invoices. */
export function averagePayDays(paid: ReadonlyArray<{ issueDay: string; paidDay: string }>): number | null {
  if (paid.length === 0) return null;
  const sum = paid.reduce((s, p) => s + Math.max(0, daysBetween(p.issueDay, p.paidDay)), 0);
  return Math.round(sum / paid.length);
}

// ── Importing clients ──

export type ImportCandidate = { name: string; lastName?: string | null; email?: string | null; phone?: string | null };

/** Only the digits, without a leading US "1" (so "+1 (555) 210-4471" = "5552104471"). */
export function phoneDigits(phone: string | null | undefined): string {
  const d = (phone ?? "").replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
}

const fold = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export function fullNameKey(c: ImportCandidate): string {
  return fold(`${c.name} ${c.lastName ?? ""}`);
}

/**
 * The existing client a row is the same person as: same email, same phone (7+ digits),
 * or the same full name. Returns the index in `existing`, or -1.
 */
export function findDuplicate(row: ImportCandidate, existing: readonly ImportCandidate[]): number {
  const email = fold(row.email);
  const phone = phoneDigits(row.phone);
  const name = fullNameKey(row);
  for (let i = 0; i < existing.length; i++) {
    const e = existing[i];
    if (email && email === fold(e.email)) return i;
    if (phone.length >= 7 && phone === phoneDigits(e.phone)) return i;
  }
  if (!name) return -1;
  return existing.findIndex((e) => fullNameKey(e) === name);
}

/** Import fields a spreadsheet column can go to. */
export const IMPORT_FIELDS = ["name", "lastName", "fullName", "phone", "email", "address", "notes", "skip"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

/** Best guess of what a spreadsheet column is, from its header (Spanish or English). */
export function guessField(header: string): ImportField {
  const h = fold(header).replace(/[^a-z ]/g, "");
  if (/^(nombre completo|full name|cliente|client|customer)$/.test(h)) return "fullName";
  if (/^(nombre|nombres|name|first name|firstname)$/.test(h)) return "name";
  if (/^(apellido|apellidos|last name|lastname|surname)$/.test(h)) return "lastName";
  if (/(tel|phone|cel|movil|whats)/.test(h)) return "phone";
  if (/(mail|correo)/.test(h)) return "email";
  if (/(direccion|address|dir|domicilio|ciudad|city)/.test(h)) return "address";
  if (/(nota|notes|comentario)/.test(h)) return "notes";
  return "skip";
}

/** "Ana María Torres" → name "Ana María", last name "Torres". */
export function splitFullName(full: string): { name: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { name: parts[0] ?? "", lastName: "" };
  return { name: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

// ── Messages the user sends from their own phone (WhatsApp, text, email) ──

/** A wa.me link with the text ready; to a number when there is one (US numbers get the 1). */
export function whatsappLink(phone: string | null | undefined, text: string): string {
  const d = (phone ?? "").replace(/\D/g, "");
  const to = d.length === 10 ? `1${d}` : d.length >= 11 ? d : "";
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

export function mailtoLink(email: string | null | undefined, subject: string, body: string): string {
  return `mailto:${encodeURIComponent((email ?? "").trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function looksLikeEmail(v: string | null | undefined): boolean {
  return !!v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}
