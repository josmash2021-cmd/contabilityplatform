// ── Bancos (business /bank): pure rules, no database ──
// Used by api/banks-router.ts and by the screen (src/components/bank/*), so keep it free of server code.
// Dates are calendar days as "YYYY-MM-DD" strings, like bank movements (api/lib/vendors.ts has the date math).
import { addDays, daysBetween, fromCents, isIsoDate, matchesFilter, toCents, type BillStatus } from "./vendors";

/** How far back the balance line and the "en 30 días" change look. */
export const CHANGE_DAYS = 30;
/** "Actualizar" on one bank brings this many days of movements. */
export const DEFAULT_SYNC_DAYS = 30;
/** The quiet refresh on arrival brings this many days of movements for every bank. */
export const QUIET_SYNC_DAYS = 7;
/** The most history a bank gives through Plaid (the app asks for 730 days when you connect). */
export const MAX_HISTORY_DAYS = 730;
/** A nickname is short: it replaces the account's name on a card. */
export const MAX_NICKNAME = 60;

/** Bank accounts hold your money; cards and loans hold what you owe. */
export type AccountKind = "cash" | "credit" | "loan";

export function accountKind(type: string | null | undefined): AccountKind {
  if (type === "credit") return "credit";
  if (type === "loan") return "loan";
  return "cash";
}

/**
 * Plaid's sign for a movement: positive = money out of a bank account (or a charge on a card),
 * negative = money in (or a payment to the card). Old rows without it fall back to their type.
 */
export function signedPlaidAmount(row: { plaidAmount: string | number | null; amount: string | number | null; type: string | null }): number {
  if (row.plaidAmount !== null && row.plaidAmount !== "" && Number.isFinite(Number(row.plaidAmount))) return Number(row.plaidAmount);
  const abs = Math.abs(Number(row.amount) || 0);
  return row.type === "income" ? -abs : abs;
}

export type SeriesTx = { date: string; plaidAmount: number };

/**
 * The balance at the end of each day of the last `days` days, rebuilt backwards from today's balance
 * and the account's movements. Returns `days + 1` points (the balance just before the window, then one
 * per day through today) and the change over the window.
 * - Bank account: money in (negative Plaid amount) raised the balance, so it's taken back out going back.
 * - Card or loan: the balance is what's owed; a charge (positive) raised it.
 * Movements dated after today (rare: time zones) count as today; older ones are outside the window.
 */
export function balanceSeries(current: number, kind: AccountKind, txs: readonly SeriesTx[], today: string, days = CHANGE_DAYS): { points: number[]; change: number } {
  const start = addDays(today, -(days - 1));
  const delta = new Array<number>(days).fill(0); // cents
  for (const tx of txs) {
    if (!isIsoDate(tx.date)) continue;
    const idx = Math.min(daysBetween(start, tx.date), days - 1);
    if (idx < 0) continue;
    const cents = toCents(tx.plaidAmount);
    delta[idx] += kind === "cash" ? -cents : cents;
  }
  const points = new Array<number>(days + 1).fill(0);
  points[days] = toCents(current);
  for (let i = days - 1; i >= 0; i--) points[i] = points[i + 1] - delta[i];
  return { points: points.map(fromCents), change: fromCents(points[days] - points[0]) };
}

export type WeekBillRow = { id: number; vendor: string; amount: number | string; dueDate: string; status: BillStatus };

/** Unpaid vendor bills due from today through the next 7 days, soonest first, and their total. */
export function weekBills(rows: readonly WeekBillRow[], today: string): { bills: Array<{ id: number; vendor: string; amount: number; dueDate: string }>; total: number } {
  const due = rows
    .filter((b) => isIsoDate(b.dueDate) && matchesFilter(b, "week", today))
    .map((b) => ({ id: b.id, vendor: b.vendor, amount: fromCents(toCents(b.amount)), dueDate: b.dueDate }))
    .sort((a, b) => (a.dueDate === b.dueDate ? b.amount - a.amount : a.dueDate < b.dueDate ? -1 : 1));
  return { bills: due, total: fromCents(due.reduce((s, b) => s + toCents(b.amount), 0)) };
}

/**
 * Some banks put the last digits in the account's name ("BUSINESS CHECKING ...2443"). The screen shows
 * the mask on its own, so drop a trailing copy of it from the name (it showed as "…2443 ··2443").
 */
export function displayAccountName(name: string | null | undefined, mask: string | null | undefined): string {
  const raw = (name ?? "").trim();
  const m = (mask ?? "").trim();
  if (!raw || !/^\w{2,8}$/.test(m)) return raw;
  const tail = new RegExp(`[\\s\\-–—:,]*[(\\[]?\\s*(?:x+|\\*+|•+|·+|\\.{2,}|…|#|-|ending in|termina en|acct|account)?\\s*${m}\\s*[)\\]]?$`, "i");
  const cleaned = raw.replace(tail, "").trim();
  return cleaned || raw;
}

/**
 * "Everyday Checking ••2443": the account's name (without the number the bank already put at its end, so it
 * isn't shown twice: "Everyday Checking ...2443") and its last 4 digits. Null when there's neither.
 */
export function accountShortLabel(bankName: string | null | undefined, accountNumber: string | null | undefined, fallback = "Banco"): string | null {
  const l4 = (accountNumber ?? "").replace(/\D/g, "").slice(-4);
  const name = displayAccountName(bankName, l4);
  if (!name && !l4) return null;
  return l4 ? `${name || fallback} ••${l4}` : name;
}

/**
 * The other account in a bank's transfer text ("ONLINE TRANSFER TO MARTINEZ TOSTA J WAY2SAVE SAVINGS XXXXXX8492 …"
 * → "Way2save Savings ••8492"), or null when the text doesn't name one.
 */
export function transferTarget(description: string | null | undefined): string | null {
  const m = /\b([a-z0-9]+)\s+(savings|checking)\b(?:\s+x*(\d{4}))?/i.exec(description ?? "");
  if (!m) return null;
  const words = `${m[1]} ${m[2]}`.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return m[3] ? `${words} ••${m[3]}` : words;
}

/** A nickname as saved: trimmed, single spaces, at most MAX_NICKNAME characters; empty means "no nickname". */
export function cleanNickname(value: string | null | undefined): string | null {
  const v = (value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NICKNAME).trim();
  return v ? v : null;
}

/** The first day to bring movements from: never before Plaid's limit, never after today. */
export function clampSince(since: string | null | undefined, today: string, fallbackDays = DEFAULT_SYNC_DAYS): string {
  const earliest = addDays(today, -MAX_HISTORY_DAYS);
  const pick = since && isIsoDate(since) ? since : addDays(today, -fallbackDays);
  if (pick < earliest) return earliest;
  if (pick > today) return today;
  return pick;
}

/** What a Plaid error means for the owner. */
export type PlaidProblem = "needs_reconnect" | "not_ready" | "gone" | "error";

const RECONNECT_CODES = new Set([
  "ITEM_LOGIN_REQUIRED", "INVALID_CREDENTIALS", "INSUFFICIENT_CREDENTIALS", "INVALID_MFA", "INVALID_UPDATED_USERNAME",
  "ITEM_LOCKED", "USER_SETUP_REQUIRED", "MFA_NOT_SUPPORTED", "NO_ACCOUNTS", "ITEM_NOT_SUPPORTED", "USER_INPUT_TIMEOUT",
  "PENDING_EXPIRATION", "ACCESS_NOT_GRANTED", "ACCESS_TOKEN_EXPIRED",
]);

export function plaidProblem(code: string | null | undefined): PlaidProblem {
  if (!code) return "error";
  if (RECONNECT_CODES.has(code)) return "needs_reconnect";
  if (code === "PRODUCT_NOT_READY") return "not_ready";
  if (code === "ITEM_NOT_FOUND" || code === "INVALID_ACCESS_TOKEN") return "gone";
  return "error";
}
