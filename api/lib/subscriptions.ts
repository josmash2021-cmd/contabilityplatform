// ── Suscripciones: finds charges that really repeat (pure, no database) ──
// A merchant charged twice is not a subscription. A charge counts only when:
//   · the amounts are similar (a fixed price; a known service may change its price),
//   · they come at a regular interval (every week, every month or every year),
//   · and there are enough of them (3 monthly charges, or 2 for a known service / Plaid's "subscription").
// Transfers, cash, card payments, gas stations and groceries never count, unless the name is a known
// subscription (Walmart+, Costco membership…). Used by api/subscriptions-router.ts and its tests.

import { isCarWash } from "./bankRules";

export type SubFreq = "week" | "month" | "year";

/** One bank movement, money out as a positive amount. Dates are calendar days "YYYY-MM-DD". */
export type DetectTx = {
  id?: number | string | null;
  date: string;
  description: string;
  merchantName?: string | null;
  amount: number;
  category?: string | null;
  accountId?: number | null;
  logoUrl?: string | null;
};

export type SubCharge = { date: string; amount: number };

export type DetectedSub = {
  /** Stable id of the merchant ("netflix", "acme cloud storage"). */
  key: string;
  /** Name to show ("Netflix"). */
  name: string;
  freq: SubFreq;
  /** The latest price. */
  amount: number;
  /** The charges that make up the subscription, oldest first. */
  history: SubCharge[];
  first: string;
  last: string;
  /** The next expected charge. */
  next: string;
  /** Still being charged (the last charge isn't too old for its frequency). */
  active: boolean;
  /** Paid through Apple or Google Play. */
  via: "apple" | "google" | null;
  /** A service we know is a subscription. */
  known: boolean;
  /** A video service (for "¿usas las dos?"). */
  video: boolean;
  accountId: number | null;
  logoUrl: string | null;
  /** The previous and the latest price, when the latest one went up. */
  raised: { from: number; to: number } | null;
};

/** Charges per year for each frequency. */
export const PER_YEAR: Record<SubFreq, number> = { week: 52, month: 12, year: 1 };

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function perYear(amount: number, freq: SubFreq): number {
  return round2(amount * PER_YEAR[freq]);
}

// ── Known services: [pattern on the cleaned text, key, name, video?, via] ──
type Known = [RegExp, string, string, boolean, ("apple" | "google")?];
const KNOWN: Known[] = [
  [/\bnetflix\b/, "netflix", "Netflix", true],
  [/\bspotify\b/, "spotify", "Spotify", false],
  [/\bdisney\s*(plus|\+)?|disneyplus/, "disney-plus", "Disney+", true],
  [/\bhulu\b/, "hulu", "Hulu", true],
  [/\bhbo\s*max\b|\bmax\.com\b|\bhbomax\b|\bhbo\b/, "max", "Max", true],
  [/\bparamount\b/, "paramount-plus", "Paramount+", true],
  [/\bpeacock\b/, "peacock", "Peacock", true],
  [/\byoutube\s*tv\b/, "youtube-tv", "YouTube TV", true],
  [/\byoutube\s*(premium|music)?\b|\bgoogle\s*\*\s*youtube/, "youtube-premium", "YouTube Premium", true],
  [/\bcrunchyroll\b/, "crunchyroll", "Crunchyroll", true],
  [/\bstarz\b/, "starz", "Starz", true],
  [/\bshowtime\b/, "showtime", "Showtime", true],
  [/\bapple\s*tv\b/, "apple-tv", "Apple TV+", true],
  [/\bapple\s*music\b/, "apple-music", "Apple Music", false],
  [/\bicloud\b/, "icloud", "iCloud+", false, "apple"],
  [/\bamazon\s*prime\b|\bamzn\s*prime\b|\bprime\s*video\b|\bprime\s*membership\b/, "amazon-prime", "Amazon Prime", false],
  [/\baudible\b/, "audible", "Audible", false],
  [/\bkindle\s*unlimited\b/, "kindle-unlimited", "Kindle Unlimited", false],
  [/\bapple\.com\s*\/?\s*bill\b|\bitunes\b|\bapple\s*services\b/, "app-store", "App Store", false, "apple"],
  [/\bgoogle\s*play\b|\bgoogle\s*\*/, "google-play", "Google Play", false, "google"],
  [/\bgoogle\s*one\b|\bgoogle\s*storage\b/, "google-one", "Google One", false, "google"],
  [/\b24\s*(hour|hr)\s*fitness\b/, "24-hour-fitness", "24 Hour Fitness", false],
  [/\bplanet\s*fitness\b|\bpf\s*black\s*card\b/, "planet-fitness", "Planet Fitness", false],
  [/\bla\s*fitness\b/, "la-fitness", "LA Fitness", false],
  [/\bcrunch\s*fitness\b/, "crunch-fitness", "Crunch Fitness", false],
  [/\banytime\s*fitness\b/, "anytime-fitness", "Anytime Fitness", false],
  [/\bymca\b/, "ymca", "YMCA", false],
  [/\bpeloton\b/, "peloton", "Peloton", false],
  [/\badobe\b/, "adobe", "Adobe", false],
  [/\bmicrosoft\s*365\b|\bmsft\b|\bmicrosoft\b/, "microsoft", "Microsoft 365", false],
  [/\bdropbox\b/, "dropbox", "Dropbox", false],
  [/\bopenai\b|\bchatgpt\b/, "chatgpt", "ChatGPT", false],
  [/\bsirius\s*xm\b|\bsiriusxm\b/, "siriusxm", "SiriusXM", false],
  [/\bxbox\b/, "xbox", "Xbox", false],
  [/\bplaystation\b|\bsony\s*interactive\b/, "playstation", "PlayStation Plus", false],
  [/\bnintendo\b/, "nintendo", "Nintendo", false],
  [/\bduolingo\b/, "duolingo", "Duolingo", false],
  [/\bheadspace\b/, "headspace", "Headspace", false],
  [/\bnytimes\b|\bnew\s*york\s*times\b/, "nytimes", "The New York Times", false],
  [/\bpatreon\b/, "patreon", "Patreon", false],
  [/\bwalmart\s*(\+|plus)\b/, "walmart-plus", "Walmart+", false],
  [/\bcostco\b.*\bmember|\bcostco\s*annual\b/, "costco-membership", "Costco", false],
  [/\bsam'?s\s*club\b.*\bmember/, "sams-membership", "Sam's Club", false],
  [/\bdashpass\b/, "dashpass", "DashPass", false],
  [/\buber\s*one\b/, "uber-one", "Uber One", false],
  [/\binstacart\s*\+|\binstacart\s*plus\b/, "instacart-plus", "Instacart+", false],
  [/\bverizon\b/, "verizon", "Verizon", false],
  [/\bt-?mobile\b/, "t-mobile", "T-Mobile", false],
  [/\bat\s*&\s*t\b|\batt\s*\*?\s*bill\b/, "att", "AT&T", false],
  [/\bcricket\s*wireless\b/, "cricket", "Cricket Wireless", false],
  [/\bxfinity\b|\bcomcast\b/, "xfinity", "Xfinity", false],
  [/\bspectrum\b/, "spectrum", "Spectrum", false],
  [/\bgeico\b/, "geico", "GEICO", false],
  [/\bprogressive\b/, "progressive", "Progressive", false],
  [/\bstate\s*farm\b/, "state-farm", "State Farm", false],
  [/\ballstate\b/, "allstate", "Allstate", false],
  // Car wash memberships (owner, 2026-11-24).
  [/\bmarc\s*-?\s*1\b|\bmarc1\b|\bmark\s*-?\s*1\s*car/, "marc-1", "Marc-1 Car Wash", false],
  [/\bmister\s*car\s*wash\b|\bmcw\b/, "mister-car-wash", "Mister Car Wash", false],
  [/\bquick\s*quack\b|\bdontdrivedirty\b/, "quick-quack", "Quick Quack", false],
  [/\bzips\s*(car|express)\b|\bzips\s*#?\s*\d/, "zips", "ZIPS Car Wash", false],
  [/\btake\s*5\s*car\s*wash\b/, "take-5-car-wash", "Take 5 Car Wash", false],
  [/\btommy'?s\s*express\b/, "tommys-express", "Tommy's Express", false],
  [/\bwhistle\s*express\b/, "whistle-express", "Whistle Express", false],
  [/\bclub\s*car\s*wash\b/, "club-car-wash", "Club Car Wash", false],
  [/\bmod\s*wash\b/, "modwash", "ModWash", false],
  [/\bautobell\b/, "autobell", "Autobell", false],
  [/\brocket\s*express\b/, "rocket-express", "Rocket Express", false],
  [/\bjet\s*brite\b/, "jet-brite", "Jet Brite", false],
  [/\bcrew\s*car\s*wash\b/, "crew-carwash", "Crew Carwash", false],
  [/\bmr\.?\s*clean\s*car\s*wash\b/, "mr-clean-car-wash", "Mr. Clean Car Wash", false],
  [/\bhurricane\s*express\b/, "hurricane-express-wash", "Hurricane Express", false],
  [/\btidal\s*wave\b/, "tidal-wave", "Tidal Wave Auto Spa", false],
  [/\bgoo\s*-?\s*goo\b/, "goo-goo", "Goo-Goo Express", false],
  [/\bmoo\s*moo\b/, "moo-moo", "Moo Moo Car Wash", false],
];

// Never a subscription (checked after the known services, so "Walmart+" still counts).
const EXCLUDED_CATEGORIES = new Set(["card_payment", "transfer", "transfer_income", "zelle_sent", "zelle_income", "cash_withdrawal", "cash_deposit", "deposit", "paycheck", "income", "refund", "gasolina"]);
const EXCLUDED_WORDS = [
  // money moving, not a service
  /\bzelle\b/, /\bvenmo\b/, /\bcash\s*app\b/, /\bpaypal\s*transfer\b/, /\btransfer\b/, /\bwithdrawal\b/, /\batm\b/, /\bdeposit\b/,
  /\bpayment\s*(thank\s*you|received)\b/, /\bautopay\b/, /\bepay\b/, /\bcard\s*payment\b/, /\bcredit\s*card\s*payment\b/, /\bloan\s*payment\b/, /\bpayroll\b/, /\binterest\b/, /\bfee\b/,
  // gas stations
  /\bshell\b/, /\bchevron\b/, /\bexxon\b/, /\bmobil\b/, /\bbp\b/, /\btexaco\b/, /\bcitgo\b/, /\bvalero\b/, /\bmarathon\b/, /\bspeedway\b/, /\bcircle\s*k\b/, /\bwawa\b/,
  /\bsheetz\b/, /\bquik\s*trip\b|\bqt\s*\d/, /\bracetrac\b/, /\bmurphy\s*(usa|oil)\b/, /\bsunoco\b/, /\bphillips\s*66\b/, /\bconoco\b/, /\barco\b/, /\bbuc-?ee'?s\b/,
  /\blove'?s\s*(travel|country)?\b/, /\bpilot\b/, /\bflying\s*j\b/, /\bkwik\s*trip\b/, /\bcasey'?s\b/, /\bgas\s*station\b/, /\bfuel\b/, /\bgasoline\b/,
  // groceries and big stores
  /\bwalmart\b/, /\bwal-mart\b/, /\bpublix\b/, /\bkroger\b/, /\baldi\b/, /\bh-?e-?b\b/, /\btarget\b/, /\bcostco\b/, /\bsam'?s\s*club\b/, /\bwhole\s*foods\b/,
  /\btrader\s*joe'?s\b/, /\bfood\s*lion\b/, /\bwinn-?dixie\b/, /\bsafeway\b/, /\bmeijer\b/, /\bdollar\s*(general|tree)\b/, /\bfamily\s*dollar\b/, /\bwalgreens\b/, /\bcvs\b/,
];

/** Lowercased bank text without card numbers, dates, store numbers and reference codes. */
export function cleanMerchantText(text: string): string {
  let n = ` ${text.toLowerCase()} `;
  n = n.replace(/(recurring\s+)?(purchase|payment|pos\s+purchase|pos\s+debit|debit\s+card\s+purchase|checkcard|check\s+card)\s+(authorized\s+)?(on\s+)?\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, " ");
  n = n.replace(/\b(pos|ach|debit|dbt|purchase|recurring|checkcard|visa|mc|web\s*id|ppd|ccd|id)\b[:#]?/g, " ");
  n = n.replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, " ");
  n = n.replace(/\bcard\s*(ending\s*(in)?\s*)?x*\d{4}\b/g, " ");
  n = n.replace(/\bx{2,}\d+\b/g, " ");
  n = n.replace(/\*\s*[a-z0-9]{4,}\b/g, " ");
  n = n.replace(/#\s*\d+/g, " ");
  n = n.replace(/\b[a-z]*\d[a-z\d]{5,}\b/g, " "); // reference codes like 2k4ll9x1
  n = n.replace(/\.com\b/g, ".com");
  n = n.replace(/\s\d{3,}\b/g, " "); // store numbers
  n = n.replace(/\s+\b(us|usa|ca|tx|al|fl|ga|ny|nj|wa|or|il|oh|nc|sc|tn|ms|la|az|nv|co|ut|mn|wi|mi|pa|va|md|ma|ct)\s*$/g, " ");
  return n.replace(/[^a-z0-9&+.'* -]/g, " ").replace(/\s+/g, " ").trim();
}

/** The known service behind a movement, if any. */
export function knownServiceOf(description: string, merchantName?: string | null): { key: string; name: string; video: boolean; via: "apple" | "google" | null } | null {
  const raw = [merchantName ?? "", description].map((t) => t.toLowerCase().replace(/\s+/g, " ").trim());
  const texts = [...raw, ...raw.map((t) => cleanMerchantText(t))].filter(Boolean);
  for (const [re, key, name, video, via] of KNOWN) {
    if (texts.some((t) => re.test(t))) return { key, name, video, via: via ?? null };
  }
  return null;
}

/** Restaurants, coffee and groceries: a habit, not a subscription (unless it's a known service). */
const HABIT_CATEGORIES = new Set(["food", "home_expense"]);

/** True for movements that are never a subscription (money transfers, card payments, gas, groceries…). */
export function isExcluded(tx: Pick<DetectTx, "description" | "merchantName" | "category">): boolean {
  if (tx.category && (EXCLUDED_CATEGORIES.has(tx.category) || HABIT_CATEGORIES.has(tx.category))) return true;
  const text = `${cleanMerchantText(tx.merchantName ?? "")} ${cleanMerchantText(tx.description)}`;
  // A car wash membership counts, even at a gas station ("SHELL CAR WASH").
  if (isCarWash(text)) return false;
  return EXCLUDED_WORDS.some((re) => re.test(text));
}

/** Same id for every charge of one merchant: the known service's key, else its cleaned name. */
export function merchantKeyOf(description: string, merchantName?: string | null): string {
  const known = knownServiceOf(description, merchantName);
  if (known) return known.key;
  const base = cleanMerchantText(merchantName || description).replace(/[.*']/g, "").replace(/\s+/g, " ").trim();
  return base.slice(0, 120) || description.toLowerCase().slice(0, 120);
}

/** "acme cloud storage" → "Acme Cloud Storage". */
function titleCase(s: string): string {
  return s.replace(/\b([a-z])([a-z]*)/g, (_, a: string, b: string) => a.toUpperCase() + b);
}

// ── Dates (calendar days, UTC) ──
const DAY = 86_400_000;
export function dayNum(d: string): number {
  const [y, m, dd] = d.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, dd) / DAY;
}
export function dayStr(n: number): string {
  return new Date(n * DAY).toISOString().slice(0, 10);
}
/** The same day `months` later; the 31st becomes the month's last day. */
export function addMonths(d: string, months: number): string {
  const [y, m, dd] = d.slice(0, 10).split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return dayStr(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(dd, last)) / DAY);
}
export function addPeriod(d: string, freq: SubFreq, n = 1): string {
  if (freq === "week") return dayStr(dayNum(d) + 7 * n);
  return addMonths(d, freq === "month" ? n : 12 * n);
}
export function daysBetween(a: string, b: string): number {
  return Math.round(dayNum(b) - dayNum(a));
}

/** Days a charge may be late before we stop calling the subscription active. */
const GRACE: Record<SubFreq, number> = { week: 6, month: 12, year: 30 };
/** Interval bands, in days. */
const BAND: Record<SubFreq, [number, number]> = { week: [5, 9], month: [25, 36], year: [340, 390] };

function similar(a: number, b: number, loose: boolean): boolean {
  const diff = Math.abs(a - b);
  return diff <= Math.max((loose ? 0.3 : 0.1) * Math.max(a, b), loose ? 2 : 1);
}

/**
 * The next charge after `last`, never before `today`. A charge up to a few days late shows as today;
 * one later than that is taken as skipped, and the one after is shown.
 */
export function nextCharge(last: string, freq: SubFreq, today: string): string {
  let next = addPeriod(last, freq);
  let guard = 0;
  while (daysBetween(next, today) > 0 && guard++ < 600) {
    if (daysBetween(next, today) <= 5) return today;
    next = addPeriod(next, freq);
  }
  return next;
}

/** Which frequency these intervals follow, if any (most of them must fall in the band). */
function cadenceOf(intervals: number[]): SubFreq | null {
  if (intervals.length === 0) return null;
  for (const f of ["month", "week", "year"] as SubFreq[]) {
    const [lo, hi] = BAND[f];
    // A month with no charge (e.g. 61 days) still counts for monthly when the rest are monthly.
    const fits = intervals.filter((d) => (d >= lo && d <= hi) || (f === "month" && d >= 54 && d <= 68)).length;
    const exact = intervals.filter((d) => d >= lo && d <= hi).length;
    if (exact >= 1 && fits >= Math.ceil(intervals.length * 0.75)) return f;
  }
  return null;
}

/**
 * Finds subscriptions in a person's bank movements.
 * `today` is the person's calendar day ("2026-11-21"); results are ordered by the next charge.
 * Inactive ones (charges stopped) come back with active: false so a cancelled one can still be shown.
 */
export function detectSubscriptions(txs: readonly DetectTx[], today: string): DetectedSub[] {
  const groups = new Map<string, DetectTx[]>();
  for (const tx of txs) {
    if (!(tx.amount > 0) || !/^\d{4}-\d{2}-\d{2}/.test(tx.date)) continue;
    const known = knownServiceOf(tx.description, tx.merchantName);
    if (!known && isExcluded(tx)) continue;
    const key = known ? known.key : merchantKeyOf(tx.description, tx.merchantName);
    if (!key) continue;
    const list = groups.get(key);
    if (list) list.push(tx);
    else groups.set(key, [tx]);
  }

  const out: DetectedSub[] = [];
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)); // newest first
    const latest = sorted[0];
    const known = knownServiceOf(latest.description, latest.merchantName);
    const plaidSub = list.some((t) => t.category === "subscription");
    const loose = !!known || plaidSub;

    // Walk back from the newest charge keeping the ones at a similar price (a price change is allowed:
    // each one is compared with the one after it). Same price within 3 days = the same charge twice.
    const kept: DetectTx[] = [latest];
    for (const tx of sorted.slice(1)) {
      const prev = kept[kept.length - 1];
      if (!similar(tx.amount, prev.amount, loose)) continue;
      if (daysBetween(tx.date.slice(0, 10), prev.date.slice(0, 10)) < 3) continue;
      kept.push(tx);
    }
    kept.reverse(); // oldest first
    if (kept.length < 2) continue;

    const dates = kept.map((t) => t.date.slice(0, 10));
    const intervals = dates.slice(1).map((d, i) => daysBetween(dates[i], d));
    const freq = cadenceOf(intervals);
    if (!freq) continue;

    // Enough charges for that frequency.
    const need = freq === "week" ? (loose ? 3 : 4) : freq === "month" ? (loose ? 2 : 3) : 2;
    if (kept.length < need) continue;
    // An unknown yearly charge must be the very same price both times.
    if (freq === "year" && !loose && !kept.slice(1).every((t, i) => Math.abs(t.amount - kept[i].amount) <= 0.01 * kept[i].amount)) continue;

    const last = dates[dates.length - 1];
    const lastGap = daysBetween(last, today);
    const active = lastGap <= daysBetween(last, addPeriod(last, freq)) + GRACE[freq];
    const amounts = kept.map((t) => round2(t.amount));
    const amount = amounts[amounts.length - 1];
    const before = amounts.length > 1 ? amounts[amounts.length - 2] : amount;
    const name = known?.name ?? titleCase(cleanMerchantText(latest.merchantName || latest.description).replace(/[*]/g, " ").replace(/\s+/g, " ").trim() || key);
    out.push({
      key,
      name,
      freq,
      amount,
      history: kept.map((t) => ({ date: t.date.slice(0, 10), amount: round2(t.amount) })),
      first: dates[0],
      last,
      next: nextCharge(last, freq, today),
      active,
      via: known?.via ?? null,
      known: !!known,
      video: known?.video ?? false,
      accountId: latest.accountId ?? null,
      logoUrl: [...kept].reverse().find((t) => t.logoUrl)?.logoUrl ?? null,
      raised: amount > before + 0.004 ? { from: before, to: amount } : null,
    });
  }
  return out.sort((a, b) => (a.next < b.next ? -1 : a.next > b.next ? 1 : b.amount - a.amount));
}

// ── Manual subscriptions: the next charge from the day (and month, or weekday) the person gave ──
export function manualNext(freq: SubFreq, today: string, day: number, month?: number | null, weekday?: number | null): string {
  if (freq === "week") {
    const dow = new Date(dayNum(today) * DAY).getUTCDay();
    const wd = weekday ?? 1;
    return dayStr(dayNum(today) + ((wd - dow + 7) % 7));
  }
  const [y, m] = today.split("-").map(Number);
  const clamp = (yy: number, mm: number) => Math.min(day, new Date(Date.UTC(yy, mm, 0)).getUTCDate());
  if (freq === "year") {
    const mm = (month ?? 1);
    let cand = dayStr(Date.UTC(y, mm - 1, clamp(y, mm)) / DAY);
    if (cand < today) cand = dayStr(Date.UTC(y + 1, mm - 1, clamp(y + 1, mm)) / DAY);
    return cand;
  }
  let cand = dayStr(Date.UTC(y, m - 1, clamp(y, m)) / DAY);
  if (cand < today) {
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    cand = dayStr(Date.UTC(ny, nm - 1, clamp(ny, nm)) / DAY);
  }
  return cand;
}

// ── Where to cancel: pages kept for the most common services ──
export const CANCEL_PAGES: Record<string, string> = {
  netflix: "https://www.netflix.com/cancelplan",
  spotify: "https://www.spotify.com/account/",
  "disney-plus": "https://www.disneyplus.com/account",
  "amazon-prime": "https://www.amazon.com/mc",
  hulu: "https://secure.hulu.com/account",
  "youtube-premium": "https://www.youtube.com/paid_memberships",
  "youtube-tv": "https://www.youtube.com/paid_memberships",
};
export const APPLE_SUBS_URL = "https://apps.apple.com/account/subscriptions";
export const GOOGLE_SUBS_URL = "https://play.google.com/store/account/subscriptions";

/** How to cancel: a direct page, Apple, Google Play, or step by step. */
export function cancelRoute(key: string, via: "apple" | "google" | null): { kind: "web" | "apple" | "google" | "none"; url: string | null } {
  if (via === "apple") return { kind: "apple", url: APPLE_SUBS_URL };
  if (via === "google") return { kind: "google", url: GOOGLE_SUBS_URL };
  const url = CANCEL_PAGES[key];
  return url ? { kind: "web", url } : { kind: "none", url: null };
}
