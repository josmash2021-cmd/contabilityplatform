// ── Por revisar: the pure rules behind the screen (no database, no server imports) ──
// How each bank movement is grouped, why, what it matches, and how splits and rules are checked.
// The API (api/review-router.ts, api/lib/reviewStore.ts) feeds it rows; the client imports the types.
//
// Confidence rule (shown to the owner as "why" lines built from these facts):
//   1. "Coincide con algo que ya tienes" (kind "match"): a pending sale, a day's cash sales or an unpaid bill
//      with the exact amount (to the cent), see matchReceivable / matchCashSales / matchBill.
//   2. "Listos para aprobar" (kind "ready", tag "Seguro"):
//        - one of the owner's rules matches the description ("Regla: Shell → Gasolina"), or
//        - the owner reviewed the same merchant at least HISTORY_SURE times and at least HISTORY_SHARE of
//          those went to one category ("Lo clasificaste así 12 veces"), or
//        - it's one leg of a transfer between two of the owner's accounts (see detectTransfers).
//   3. "Necesitan tu respuesta" (kind "ask"):
//        - a possible duplicate (same account, amount and merchant within 3 days): "¿Es un duplicado?",
//        - a store that sells both business and home goods, over SPLIT_MIN_CENTS: "¿Dividir la compra?",
//        - subscriptions, food, health and the like: "¿Del negocio o personal?",
//        - everything else, where only the bank's keywords picked the category (tag "Revisa"), or the
//          owner's history is mixed or has a single movement.
import { bankDirection, directionOf, type MoneyType } from "./bankReview";
import { trustedMerchantName } from "./brand";

// ── Thresholds ──
/** Reviewed this many times (or more) with one category → "Seguro". */
export const HISTORY_SURE = 2;
/** …and at least this share of them in that category. */
export const HISTORY_SHARE = 0.8;
/** Transfers and duplicates: the two movements are at most this many days apart. */
export const PAIR_DAYS = 3;
/** Cash deposits look this many days back for the cash sales they hold. */
export const CASH_DAYS_BACK = 3;
/** Mixed stores ask to split only from this amount up (cents). */
export const SPLIT_MIN_CENTS = 7500;
/** Most cash sales of one window tried when looking for the ones a deposit holds (2^n combinations). */
export const CASH_SUBSET_MAX = 14;
/** A rule's text: at least 2 characters, at most 60. */
export const RULE_PATTERN_MIN = 2;
export const RULE_PATTERN_MAX = 60;
/** At most this many parts in one split. */
export const SPLIT_MAX_PARTS = 8;

// ── Money and days ──
/** Dollars → integer cents, so sums never drift ("248.60" → 24860). */
export function toCents(v: string | number | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Days between two YYYY-MM-DD days (b − a). */
export function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function addDay(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

// ── Text ──
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Payment processors that put the real merchant after a "*" ("SQ *JOE'S CAFE"). */
const PROCESSORS = new Set(["sq", "tst", "sp", "pp", "paypal", "ppl", "py", "ck", "in", "dd", "doordash", "ubr", "pos"]);
/** Bank boilerplate after the merchant ("SEGUROS DEL VALLE AUTOPAY"). */
const TRAILING = new Set(["autopay", "auto", "pay", "payment", "pmt", "ach", "debit", "credit", "online", "purchase", "pos", "recurring", "web", "ppd", "des", "id", "conf", "ref"]);
/** Bank boilerplate in front of the merchant. */
const LEADING = /^(?:(?:pos|debit|card|checkcard|check card|visa|recurring|purchase|purchases|authorized|auth|on|ach|web|dda|withdrawal|bill|payment|pmt)\b[\s\d/:-]*)+/;

/**
 * The merchant a movement is from, as a stable key: Plaid's merchant name when it has one, else the bank
 * description up to the first word with a digit or "#" (store numbers, phone numbers, references).
 * "THE HOME DEPOT #4821 HOUSTON TX" → "home depot"; "SHELL OIL 57134 HOUSTON" → "shell oil";
 * "ZELLE FROM CARLOS RUIZ CONF# 88412" → "zelle from carlos ruiz"; "AMZN MKTP US*2K4LD0" → "amzn mktp us".
 */
export function merchantKeyOf(description: string | null | undefined, merchantName?: string | null): string {
  const desc = (description ?? "").trim();
  const name = (merchantName ?? "").trim();
  const source = name && fold(name) !== fold(desc) ? name : desc;
  let s = fold(source).replace(LEADING, "").trim();
  const star = s.indexOf("*");
  if (star > 0) {
    const head = s.slice(0, star).trim();
    const tail = s.slice(star + 1).trim();
    s = PROCESSORS.has(head) && tail ? tail : head;
  }
  const words: string[] = [];
  for (const w of s.split(/\s+/)) {
    if (!w) continue;
    if (/[\d#•]/.test(w)) break;
    const clean = w.replace(/[^a-z&'.-]/g, "").replace(/^[.'-]+|[.'-]+$/g, "");
    if (clean) words.push(clean);
    if (words.length === 4) break;
  }
  if (words[0] === "the" && words.length > 1) words.shift();
  while (words.length > 1 && TRAILING.has(words[words.length - 1])) words.pop();
  return words.join(" ").slice(0, 60);
}

/** Well-known names the bank abbreviates. Only the written name, never a logo. */
const KNOWN_NAMES: Array<[RegExp, string]> = [
  [/^(amzn|amazon)\b/, "Amazon"], [/^costco\b/, "Costco"], [/^(wal-?mart|wm supercenter)\b/, "Walmart"],
  [/^target\b/, "Target"], [/^home depot\b/, "Home Depot"], [/^lowe'?s\b/, "Lowe's"], [/^shell\b/, "Shell"],
  [/^chevron\b/, "Chevron"], [/^exxon/, "Exxon"], [/^netflix/, "Netflix"], [/^spotify\b/, "Spotify"],
  [/^uber\b/, "Uber"], [/^lyft\b/, "Lyft"], [/^starbucks\b/, "Starbucks"], [/^mcdonald'?s\b/, "McDonald's"],
  [/^sams? club\b|^sam's club\b/, "Sam's Club"], [/^autozone\b/, "AutoZone"], [/^office depot\b/, "Office Depot"],
  [/^apple\b/, "Apple"], [/^temu\b/, "Temu"], [/^doordash\b/, "DoorDash"], [/^t-?mobile\b/, "T-Mobile"], [/^paypal\b/, "PayPal"],
  [/^venmo\b/, "Venmo"], [/^(cash app|cashapp|sq cash)\b/, "Cash App"], [/^walgreens\b/, "Walgreens"], [/^cvs\b/, "CVS"],
  [/^at&?t\b/, "AT&T"], [/^verizon\b/, "Verizon"], [/^google\b/, "Google"], [/^microsoft\b/, "Microsoft"], [/^taco bell\b/, "Taco Bell"],
  [/^chick-?fil-?a\b/, "Chick-fil-A"], [/^dollar general\b/, "Dollar General"], [/^dollar tree\b/, "Dollar Tree"], [/^publix\b/, "Publix"],
  [/^kroger\b/, "Kroger"], [/^instacart\b/, "Instacart"], [/^grubhub\b/, "Grubhub"], [/^lyft\b/, "Lyft"],
  // Cards, loans and bills (owner, 2026-11-24): the brand, without "MOBILE PMT", "FINANCE RENT", "CO BILL PAY".
  [/^capital ?one\b/, "Capital One"], [/^discover\b/, "Discover"], [/^(amex|american express)\b/, "American Express"],
  [/^chase (credit|card|crd)\b/, "Chase"], [/^(synchrony|syncb)\b/, "Synchrony"], [/^credit ?one\b/, "Credit One"], [/^mission ?lane\b/, "Mission Lane"],
  [/^upstart\b/, "Upstart"], [/^affirm\b/, "Affirm"], [/^klarna\b/, "Klarna"], [/^afterpay\b/, "Afterpay"], [/^advance america\b/, "Advance America"],
  [/^one ?main\b/, "OneMain"], [/^earnin\b/, "EarnIn"], [/^(flex|getflex)\b/, "Flex"], [/^(alabama power|al power)\b/, "Alabama Power"],
  [/^(blue ?cross|bcbs)\b/, "Blue Cross Blue Shield"], [/^spectrum\b/, "Spectrum"], [/^cricket\b/, "Cricket"], [/^zaxby'?s\b/, "Zaxby's"],
  [/^waffle house\b/, "Waffle House"], [/^raising cane'?s\b/, "Raising Cane's"],
  // Car washes whose bank text starts with a number or a code.
  [/^marc ?-? ?1\b|^marc1\b/, "Marc-1 Car Wash"], [/^mcw\b/, "Mister Car Wash"], [/^zips (car|express)\b|^zips ?#? ?\d/, "ZIPS Car Wash"],
  // The card's own line for a payment it received.
  [/^(?:(?:autopay|automatic|internet|online|mobile|electronic) )?(?:payment|pymt|pmt)?\s*-?\s*thank(?: you)?(?:[- ]mobile)?$/, "Payment - Thank You"],
];

/** US state codes banks add after the merchant ("TEMU.COM MA"): where it was processed, not part of the name. */
const US_STATES = new Set("al ak az ar ca co ct de fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy dc".split(" "));

/** "apple.combill ca" → "apple", "temu.com ma" → "temu": a web address is the name, and the state goes. */
function tidyKey(key: string): string {
  const words = key.split(" ").map((w) => w.replace(/\.(?:com|net|org|co|us|io|app)\S*$/, "")).filter(Boolean);
  while (words.length > 1 && US_STATES.has(words[words.length - 1])) words.pop();
  return words.join(" ");
}

const LOWER_WORDS = new Set(["de", "del", "la", "las", "los", "y", "of", "and"]);
const titleCase = (s: string) => s.split(" ").map((w, i) => (i > 0 && LOWER_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");

/** The name shown in bold: Plaid's merchant name, else a readable version of the description's merchant. */
export function displayNameOf(description: string | null | undefined, merchantName?: string | null): string {
  const desc = (description ?? "").trim();
  // Plaid's merchant name only when it doesn't contradict the bank's text ("ATS ALABASTER AL" saved as AT&T).
  const name = (desc ? trustedMerchantName(merchantName, desc) ?? "" : (merchantName ?? "")).trim();
  const readable = (text: string) => {
    const key = tidyKey(merchantKeyOf(text));
    const zelle = /^zelle (?:payment )?(?:from|to) (.+)$/.exec(key);
    if (zelle) return `Zelle · ${titleCase(zelle[1])}`;
    const whole = fold(text);
    for (const [re, label] of KNOWN_NAMES) if (re.test(key) || re.test(whole)) return label;
    return key ? titleCase(key) : text;
  };
  // Plaid's merchant name ("Amazon") is shown as is. An all-lowercase one is what the old sync cut from the
  // bank's text (it dropped words like "credit": "PROVISIONAL CREDIT …" became "provisional"), so the full
  // bank text is read instead.
  if (name && fold(name) !== fold(desc) && name !== name.toLowerCase()) return name;
  return readable(desc) || readable(name);
}

/** Significant words of a person or company name ("Grupo Delta S.A. de C.V." → grupo, delta). */
const NAME_STOP = new Set(["sa", "de", "cv", "del", "la", "las", "los", "el", "llc", "inc", "co", "corp", "ltd", "y", "and", "the", "s.a."]);
export function nameTokens(name: string | null | undefined): string[] {
  return fold(name ?? "").split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !NAME_STOP.has(w));
}

/** True when every significant word of the name is in the text (so "Carlos Ruiz" is in "ZELLE FROM CARLOS RUIZ"). */
export function nameInText(name: string | null | undefined, text: string | null | undefined): boolean {
  const tokens = nameTokens(name);
  if (tokens.length === 0) return false;
  const words = new Set(fold(text ?? "").split(/[^a-z0-9]+/).filter(Boolean));
  return tokens.every((t) => words.has(t));
}

// ── Rules ("Siempre que diga X → categoría Y") ──
export type Rule = { id: number; pattern: string; category: string };

/** A rule's text as stored and compared: trimmed, single spaces. */
export function cleanPattern(p: string): string {
  return p.replace(/\s+/g, " ").trim().slice(0, RULE_PATTERN_MAX);
}

/** What a rule looks at: the description and Plaid's merchant name (the SQL in reviewStore.ts does the same). */
export function ruleHaystack(description: string | null | undefined, merchantName?: string | null): string {
  return `${description ?? ""} | ${merchantName ?? ""}`.toLowerCase();
}

export function ruleMatches(pattern: string, description: string | null | undefined, merchantName?: string | null): boolean {
  const p = cleanPattern(pattern).toLowerCase();
  return p.length >= RULE_PATTERN_MIN && ruleHaystack(description, merchantName).includes(p);
}

/** A rule only applies when its category fits the way the money went (a Shell refund isn't "Gasolina"). */
export function categoryFits(category: string, type: MoneyType): boolean {
  const dir = directionOf(category);
  return dir === "both" || (dir === "in") === (type === "income");
}

/** The rule for a movement: the longest matching text wins (more specific), then the oldest rule. */
export function findRule<R extends Rule>(rules: readonly R[], row: { description: string; merchantName?: string | null; type: MoneyType }): R | null {
  let best: R | null = null;
  for (const r of rules) {
    if (!categoryFits(r.category, row.type) || !ruleMatches(r.pattern, row.description, row.merchantName)) continue;
    if (!best || cleanPattern(r.pattern).length > cleanPattern(best.pattern).length || (cleanPattern(r.pattern).length === cleanPattern(best.pattern).length && r.id < best.id)) best = r;
  }
  return best;
}

/**
 * The text to offer for a new rule from a movement: the shown name when the description contains it
 * ("Shell"), else the merchant key, which always comes from the description ("zelle from carlos ruiz").
 */
export function rulePatternFor(description: string, merchantName?: string | null): string {
  const shown = displayNameOf(description, merchantName);
  if (ruleMatches(shown, description, merchantName)) return cleanPattern(shown);
  const key = merchantKeyOf(description, merchantName);
  if (ruleMatches(key, description, merchantName)) return cleanPattern(key);
  return cleanPattern(merchantKeyOf(description));
}

// ── History ("Lo clasificaste así 12 veces") ──
export type HistoryRow = { description: string; merchantName?: string | null; category: string; type: MoneyType };
export type History = Map<string, Map<string, number>>;

/** Reviewed movements counted per merchant and category (split and excluded ones are left out by the caller). */
export function buildHistory(rows: readonly HistoryRow[]): History {
  const h: History = new Map();
  for (const r of rows) {
    const key = merchantKeyOf(r.description, r.merchantName);
    if (!key) continue;
    const byCat = h.get(key) ?? new Map<string, number>();
    byCat.set(r.category, (byCat.get(r.category) ?? 0) + 1);
    h.set(key, byCat);
  }
  return h;
}

/** The owner's usual category for this merchant (only ones that fit the direction), with how many times and of how many. */
export function historyFor(h: History, key: string, type: MoneyType): { category: string; n: number; total: number } | null {
  const byCat = h.get(key);
  if (!byCat) return null;
  let total = 0;
  let best: { category: string; n: number } | null = null;
  for (const [category, n] of byCat) {
    if (!categoryFits(category, type)) continue;
    total += n;
    if (!best || n > best.n) best = { category, n };
  }
  return best ? { ...best, total } : null;
}

/** The owner's most used categories for one direction ("Tus categorías más usadas"), most used first. */
export function topCategories(h: History, type: MoneyType, limit = 6): string[] {
  const counts = new Map<string, number>();
  for (const byCat of h.values()) for (const [c, n] of byCat) if (categoryFits(c, type) && directionOf(c) !== "both") counts.set(c, (counts.get(c) ?? 0) + n);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([c]) => c);
}

// ── Movements as the engine sees them ──
export type EngineRow = {
  id: number;
  /** YYYY-MM-DD */
  date: string;
  description: string;
  merchantName: string | null;
  type: MoneyType;
  category: string;
  /** Always positive. */
  amountCents: number;
  plaidAmount: string | number | null;
  importedFrom: string | null;
  bankAccountId: number | null;
  reviewed: boolean;
};

/** Plaid's sign when the bank gave one (positive = money out), else from the type. */
export function signedCents(r: Pick<EngineRow, "amountCents" | "plaidAmount" | "importedFrom" | "type">): number {
  const dir = bankDirection(r.plaidAmount, r.importedFrom) ?? r.type;
  return dir === "income" ? -r.amountCents : r.amountCents;
}

// ── Transfers between the owner's own accounts ──
/** At least one of the two descriptions has to read like a transfer or card payment. */
const TRANSFER_WORDS = /\b(transfer|xfer|trnsfr|tfr|to sav|from sav|to chk|from chk|online banking|mobile banking|internal|payment thank you|thank you payment|autopay|auto pay|card payment|credit card|crd|epay|e-payment|from share|to share)\b/i;

export type TransferLeg = { otherId: number; otherAccountId: number; otherDate: string; direction: "to" | "from" };

/**
 * Transfers between two of the owner's accounts: the same amount, opposite signs, two different accounts,
 * at most PAIR_DAYS apart, and at least one description that reads like a transfer. Each movement pairs
 * at most once (closest day first). Only pairs with at least one pending movement are returned, keyed by
 * each pending leg.
 */
export function detectTransfers(rows: readonly EngineRow[]): Map<number, TransferLeg> {
  const out = new Map<number, TransferLeg>();
  const used = new Set<number>();
  const pending = rows.filter((r) => !r.reviewed && r.bankAccountId !== null).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  for (const r of pending) {
    if (used.has(r.id)) continue;
    const s = signedCents(r);
    let best: EngineRow | null = null;
    for (const o of rows) {
      if (o.id === r.id || used.has(o.id) || o.bankAccountId === null || o.bankAccountId === r.bankAccountId) continue;
      if (signedCents(o) !== -s) continue;
      const gap = Math.abs(dayDiff(r.date, o.date));
      if (gap > PAIR_DAYS) continue;
      if (!TRANSFER_WORDS.test(r.description) && !TRANSFER_WORDS.test(o.description)) continue;
      if (!best || gap < Math.abs(dayDiff(r.date, best.date)) || (gap === Math.abs(dayDiff(r.date, best.date)) && o.id < best.id)) best = o;
    }
    if (!best) continue;
    used.add(r.id);
    used.add(best.id);
    out.set(r.id, { otherId: best.id, otherAccountId: best.bankAccountId as number, otherDate: best.date, direction: s > 0 ? "to" : "from" });
    if (!best.reviewed) out.set(best.id, { otherId: r.id, otherAccountId: r.bankAccountId as number, otherDate: r.date, direction: s > 0 ? "from" : "to" });
  }
  return out;
}

// ── Possible duplicates ──
/**
 * A pending movement that repeats another one: same account, same signed amount, same merchant, at most
 * PAIR_DAYS apart (a charge that first showed as pending and then again as posted, or a statement
 * imported twice). Never decided alone: the owner answers. The later one (by id) is the one asked about.
 */
export function detectDuplicates(rows: readonly EngineRow[], skip: ReadonlySet<number> = new Set()): Map<number, { otherId: number; otherDate: string }> {
  const out = new Map<number, { otherId: number; otherDate: string }>();
  const byGroup = new Map<string, EngineRow[]>();
  for (const r of rows) {
    if (skip.has(r.id) || r.bankAccountId === null) continue;
    const key = merchantKeyOf(r.description, r.merchantName);
    if (!key) continue;
    const g = `${r.bankAccountId}|${signedCents(r)}|${key}`;
    const list = byGroup.get(g) ?? [];
    list.push(r);
    byGroup.set(g, list);
  }
  for (const list of byGroup.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.id - b.id);
    const taken = new Set<number>();
    for (let i = 1; i < list.length; i++) {
      const r = list[i];
      if (r.reviewed) continue;
      const other = list.slice(0, i).find((o) => !taken.has(o.id) && Math.abs(dayDiff(o.date, r.date)) <= PAIR_DAYS);
      if (!other) continue;
      taken.add(other.id);
      taken.add(r.id);
      out.set(r.id, { otherId: other.id, otherDate: other.date });
    }
  }
  return out;
}

// ── Matching with what the app already has ──
export type Receivable = { saleId: number; invoiceNumber: string; customerName: string | null; totalCents: number; day: string; quoteNumber: string | null };
export type CashSale = { saleId: number; totalCents: number; day: string };
export type OpenBill = { billId: number; vendorName: string; description: string; amountCents: number; dueDate: string };

export type Match =
  | { type: "sale"; saleId: number; invoiceNumber: string; customerName: string | null; quoteNumber: string | null; byName: boolean }
  | { type: "cash"; saleIds: number[]; amounts: number[]; day: string }
  | { type: "bill"; billId: number; vendorName: string; dueDate: string; description: string };

/** Was this suggestion turned down with "No es esto"? Keys look like "sale:12", "cash:40", "bill:7". */
export type Dismissed = ReadonlySet<string>;
export const dismissKey = (type: "sale" | "cash" | "bill", id: number) => `${type}:${id}`;

/** The bank names who sent the money ("ZELLE FROM X", "TRANSFER FROM X", "DEPOSITO DE X"). */
const PAYER_NAMED = /\b(from|de)\s+[a-z]{2,}/i;

/**
 * Money in ↔ a sale waiting to be paid (quotes and recurring invoices): the exact amount, created no later
 * than PAIR_DAYS after the deposit. The client's name in the description makes it certain; without it,
 * only a single sale with that amount is suggested, and only when the bank doesn't name another payer.
 */
export function matchReceivable(row: EngineRow, list: readonly Receivable[], used: ReadonlySet<number>, dismissed: Dismissed): Match | null {
  if (signedCents(row) >= 0) return null;
  const same = list.filter((s) => s.totalCents === row.amountCents && !used.has(s.saleId) && !dismissed.has(dismissKey("sale", s.saleId)) && dayDiff(s.day, row.date) >= -PAIR_DAYS);
  if (same.length === 0) return null;
  const named = same.filter((s) => nameInText(s.customerName, `${row.description} ${row.merchantName ?? ""}`));
  // By amount alone only when the bank doesn't name someone else as the payer ("ZELLE FROM ANA TORRES").
  const namesPayer = PAYER_NAMED.test(row.description);
  const pick = named[0] ?? (same.length === 1 && !namesPayer ? same[0] : null);
  if (!pick) return null;
  return { type: "sale", saleId: pick.saleId, invoiceNumber: pick.invoiceNumber, customerName: pick.customerName, quoteNumber: pick.quoteNumber, byName: named.length > 0 };
}

const CASH_DEPOSIT_WORDS = /\b(cash dep|cash deposit|branch deposit|atm deposit|teller deposit|deposit at|counter deposit|deposito en efectivo)\b/i;

/** Looks like cash taken to the bank (not a Zelle, transfer or check). */
export function isCashDeposit(row: Pick<EngineRow, "category" | "description">): boolean {
  if (/zelle|transfer|xfer|mobile deposit|check|ach/i.test(row.description)) return false;
  return row.category === "cash_deposit" || CASH_DEPOSIT_WORDS.test(row.description);
}

/** Indexes (ascending) of a set of amounts that adds up to the target exactly, fewest first; null when none. */
export function subsetSum(amounts: readonly number[], target: number, max = CASH_SUBSET_MAX): number[] | null {
  const n = Math.min(amounts.length, max);
  if (n === 0 || target <= 0) return null;
  let best: number[] | null = null;
  for (let mask = 1; mask < 1 << n; mask++) {
    let sum = 0;
    const picked: number[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) { sum += amounts[i]; picked.push(i); }
    if (sum === target && (!best || picked.length < best.length)) best = picked;
  }
  return best;
}

/**
 * A cash deposit ↔ the cash sales it holds: the sales of one day (the deposit's day or up to CASH_DAYS_BACK
 * before, closest first) whose totals add up to the deposit exactly. Sales already linked to another
 * deposit, or turned down for this one, are left out.
 */
export function matchCashSales(row: EngineRow, sales: readonly CashSale[], used: ReadonlySet<number>, dismissed: Dismissed): Match | null {
  if (signedCents(row) >= 0 || !isCashDeposit(row)) return null;
  for (let back = 0; back <= CASH_DAYS_BACK; back++) {
    const day = addDay(row.date, -back);
    const daySales = sales.filter((s) => s.day === day && !used.has(s.saleId) && !dismissed.has(dismissKey("cash", s.saleId)))
      .sort((a, b) => a.saleId - b.saleId);
    if (daySales.length === 0) continue;
    const idx = subsetSum(daySales.map((s) => s.totalCents), row.amountCents);
    if (!idx) continue;
    const picked = idx.map((i) => daySales[i]);
    return { type: "cash", saleIds: picked.map((s) => s.saleId), amounts: picked.map((s) => s.totalCents / 100), day };
  }
  return null;
}

/** Money out ↔ an unpaid bill: the vendor's name in the description and the exact amount (earliest due first). */
export function matchBill(row: EngineRow, bills: readonly OpenBill[], used: ReadonlySet<number>, dismissed: Dismissed): Match | null {
  if (signedCents(row) <= 0) return null;
  const text = `${row.description} ${row.merchantName ?? ""}`;
  const pick = bills
    .filter((b) => b.amountCents === row.amountCents && !used.has(b.billId) && !dismissed.has(dismissKey("bill", b.billId)) && nameInText(b.vendorName, text))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.billId - b.billId)[0];
  return pick ? { type: "bill", billId: pick.billId, vendorName: pick.vendorName, dueDate: pick.dueDate, description: pick.description } : null;
}

// ── Grouping ──
export type Kind = "match" | "ready" | "ask";
export type Ask = "bizpersonal" | "split" | "duplicate";
export type Why =
  | { code: "rule"; pattern: string; category: string }
  | { code: "history"; n: number }
  | { code: "historyMixed"; n: number; total: number }
  | { code: "keyword" }
  | { code: "transfer"; direction: "to" | "from"; otherAccountId: number; date: string }
  | { code: "duplicate"; date: string }
  | { code: "bizpersonal" }
  | { code: "split" }
  | { code: "matchSale"; byName: boolean; invoiceNumber: string; customer: string | null }
  | { code: "matchCash"; amounts: number[]; day: string }
  | { code: "matchBill"; vendor: string; due: string };

export type Verdict = { kind: Kind; ask: Ask | null; conf: "high" | "mid"; category: string; why: Why; ruleId: number | null };

/** Stores that sell both business and home goods: a big purchase there may need splitting. */
const MIXED_STORES = /^(costco|sam'?s club|sams club|walmart|wal-mart|target|bj'?s|kroger|h-e-b|heb|publix|meijer)\b/;
/** Categories that are often personal for a small business owner. */
const OFTEN_PERSONAL = new Set(["subscription", "food", "fast_food", "coffee", "food_delivery", "medical", "home_expense", "rideshare"]);
const STREAMING = /\b(netflix|spotify|hulu|disney|hbo|max\.com|paramount|peacock|youtube premium|apple music|prime video)\b/i;

/** The money-out category to keep when the owner says "Negocio" for something that read as personal. */
export function businessCategoryFor(category: string): string {
  return category === "home_expense" ? "business_expense" : category;
}
/** Where personal spending goes (it doesn't count as a business expense). */
export const PERSONAL_CATEGORY = "home_expense";
/** Transfers between the owner's accounts. */
export const transferCategory = (type: MoneyType) => (type === "income" ? "transfer_income" : "transfer");

export type Signals = {
  rules: readonly Rule[];
  history: History;
  transfers: ReadonlyMap<number, TransferLeg>;
  duplicates: ReadonlyMap<number, { otherId: number; otherDate: string }>;
  matches: ReadonlyMap<number, Match>;
};

/** Decides the group, the tag, the suggested category and the "why" of one pending movement. */
export function classify(row: EngineRow, s: Signals): Verdict {
  const match = s.matches.get(row.id);
  if (match) {
    const why: Why = match.type === "sale"
      ? { code: "matchSale", byName: match.byName, invoiceNumber: match.invoiceNumber, customer: match.customerName }
      : match.type === "cash" ? { code: "matchCash", amounts: match.amounts, day: match.day }
        : { code: "matchBill", vendor: match.vendorName, due: match.dueDate };
    const category = match.type === "cash" ? "cash_deposit" : row.category;
    return { kind: "match", ask: null, conf: "high", category, why, ruleId: null };
  }
  const leg = s.transfers.get(row.id);
  if (leg) return { kind: "ready", ask: null, conf: "high", category: transferCategory(row.type), why: { code: "transfer", direction: leg.direction, otherAccountId: leg.otherAccountId, date: leg.otherDate }, ruleId: null };
  const dup = s.duplicates.get(row.id);
  if (dup) return { kind: "ask", ask: "duplicate", conf: "mid", category: row.category, why: { code: "duplicate", date: dup.otherDate }, ruleId: null };

  const rule = findRule(s.rules, row);
  if (rule) return { kind: "ready", ask: null, conf: "high", category: rule.category, why: { code: "rule", pattern: cleanPattern(rule.pattern), category: rule.category }, ruleId: rule.id };

  const key = merchantKeyOf(row.description, row.merchantName);
  const past = key ? historyFor(s.history, key, row.type) : null;
  if (past && past.n >= HISTORY_SURE && past.n / past.total >= HISTORY_SHARE) {
    return { kind: "ready", ask: null, conf: "high", category: past.category, why: { code: "history", n: past.n }, ruleId: null };
  }
  if (past) return { kind: "ask", ask: null, conf: "mid", category: past.category, why: { code: "historyMixed", n: past.n, total: past.total }, ruleId: null };

  if (row.type === "expense" && row.amountCents >= SPLIT_MIN_CENTS && MIXED_STORES.test(key)) {
    return { kind: "ask", ask: "split", conf: "mid", category: row.category, why: { code: "split" }, ruleId: null };
  }
  if (row.type === "expense" && (OFTEN_PERSONAL.has(row.category) || STREAMING.test(row.description))) {
    return { kind: "ask", ask: "bizpersonal", conf: "mid", category: row.category, why: { code: "bizpersonal" }, ruleId: null };
  }
  return { kind: "ask", ask: null, conf: "mid", category: row.category, why: { code: "keyword" }, ruleId: null };
}

// ── Splits ──
export type SplitPart = { category: string; amountCents: number };

/** Problems with a split, or null when it's fine: 2+ parts, each more than $0, adding up to the movement. */
export function splitProblem(parts: readonly SplitPart[], totalCents: number): "parts" | "zero" | "sum" | null {
  if (parts.length < 2 || parts.length > SPLIT_MAX_PARTS) return "parts";
  if (parts.some((p) => !Number.isInteger(p.amountCents) || p.amountCents <= 0)) return "zero";
  if (parts.reduce((a, p) => a + p.amountCents, 0) !== totalCents) return "sum";
  return null;
}

/**
 * The single category the movement itself keeps after a split (what every older report reads): the largest
 * business part, or the personal category when every part is personal. The movement keeps its full amount,
 * so totals over bank movements still count it exactly once.
 */
export function mainCategoryOf(parts: readonly SplitPart[]): string {
  const business = parts.filter((p) => p.category !== PERSONAL_CATEGORY);
  if (business.length === 0) return PERSONAL_CATEGORY;
  return [...business].sort((a, b) => b.amountCents - a.amountCents)[0].category;
}

/**
 * Category totals for a set of movements, with each split movement counted by its parts instead of its
 * own category. The parts add up to the movement, so the grand total never changes: nothing counts twice.
 */
export function categoryTotals(rows: ReadonlyArray<{ id: number; category: string; amountCents: number }>, splits: ReadonlyMap<number, readonly SplitPart[]>): Map<string, number> {
  const out = new Map<string, number>();
  const add = (c: string, n: number) => out.set(c, (out.get(c) ?? 0) + n);
  for (const r of rows) {
    const parts = splits.get(r.id);
    if (parts && parts.length) for (const p of parts) add(p.category, p.amountCents);
    else add(r.category, r.amountCents);
  }
  return out;
}
