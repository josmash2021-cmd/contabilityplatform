// ── Original logos: pure rules shared by the server and the browser ──
// Banks and merchants show their real logos: Plaid's institution logo, Plaid's merchant logo_url,
// or a bundled original (public/brands/banks/). Nothing here draws or invents a brand mark; without
// a real logo the app shows a neutral monogram or the category icon.
// No database or Node imports: src/components/brand/* bundles this file.

/** Health of one bank connection (Plaid item), from the last Plaid calls made for it. */
export type InstitutionStatus = "ok" | "needs_reconnect" | "error";

/** Plaid errors only the owner can fix, by logging in to the bank again (Plaid Link in update mode). */
const RECONNECT_CODES = new Set([
  "ITEM_LOGIN_REQUIRED", "INVALID_CREDENTIALS", "INSUFFICIENT_CREDENTIALS", "INVALID_MFA", "INVALID_SEND_METHOD",
  "INVALID_UPDATED_USERNAME", "ITEM_LOCKED", "PASSWORD_RESET_REQUIRED", "USER_SETUP_REQUIRED", "USER_INPUT_TIMEOUT",
  "MFA_NOT_SUPPORTED", "NO_ACCOUNTS", "ACCESS_NOT_GRANTED", "ADDITIONAL_CONSENT_REQUIRED", "PENDING_EXPIRATION",
  "PENDING_DISCONNECT", "INVALID_ACCESS_TOKEN", "ITEM_NOT_FOUND",
]);

/** Answers that say nothing about the connection itself (Plaid still preparing data, our own request rate). */
const NEUTRAL_CODES = new Set(["PRODUCT_NOT_READY", "RATE_LIMIT_EXCEEDED", "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION"]);

/**
 * What a Plaid error code means for the connection: needs the owner to reconnect, or a plain error.
 * `null` means "don't record it": no code (our own timeout or network) or a neutral answer.
 */
export function statusForError(code: string | null | undefined): Exclude<InstitutionStatus, "ok"> | null {
  const c = (code ?? "").trim().toUpperCase();
  if (!c || NEUTRAL_CODES.has(c)) return null;
  return RECONNECT_CODES.has(c) ? "needs_reconnect" : "error";
}

/** Plaid's error code from a failed SDK call (axios error with Plaid's JSON body), or null. */
export function plaidErrorCode(e: unknown): string | null {
  const err = e as { response?: { data?: { error_code?: unknown } } } | null;
  const code = err?.response?.data?.error_code;
  return typeof code === "string" && /^[A-Z0-9_]{2,64}$/.test(code) ? code : null;
}

// ── Institutions ──

/** Plaid sends the institution logo as bare base64 PNG. Returns a data URL, or null when it isn't a sane PNG. */
export function institutionLogoDataUrl(base64: string | null | undefined): string | null {
  if (typeof base64 !== "string") return null;
  const b = base64.replace(/\s+/g, "");
  // PNG files start with \x89PNG, which is "iVBORw0KGgo" in base64. 2 MB is far above any real bank logo.
  if (b.length < 16 || b.length > 2_000_000 || !b.startsWith("iVBORw0KGgo") || !/^[A-Za-z0-9+/]+=*$/.test(b)) return null;
  return `data:image/png;base64,${b}`;
}

/** Plaid's primary_color ("#d71e28") as "#D71E28"; anything else is null. */
export function normalizeColor(color: string | null | undefined): string | null {
  if (typeof color !== "string") return null;
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(color.trim());
  if (!m) return null;
  const hex = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return `#${hex.toUpperCase()}`;
}

/** Bundled originals in public/brands/banks/ (official icons), with the inner padding each one needs. */
const BUNDLED_BANKS: Array<{ match: RegExp; src: string; pad: number }> = [
  { match: /\bchase\b/i, src: "/brands/banks/chase.png", pad: 0.14 },
  { match: /\bbank\s*of\s*america\b|^bofa\b/i, src: "/brands/banks/bank-of-america.png", pad: 0.1 },
  { match: /\bwells\s*fargo\b/i, src: "/brands/banks/wells-fargo.png", pad: 0 },
];

/** The bundled original logo for an institution name ("JPMorgan Chase" → chase.png), or null. */
export function bundledBankLogo(name: string | null | undefined): { src: string; pad: number } | null {
  if (!name) return null;
  const hit = BUNDLED_BANKS.find((b) => b.match.test(name));
  return hit ? { src: hit.src, pad: hit.pad } : null;
}

// ── Monogram (neutral fallback, never a brand mark) ──

/** The first letter or digit of a name, uppercased ("Ñandú" → "Ñ", "7-Eleven" → "7"); "?" when there is none. */
export function monogram(name: string | null | undefined): string {
  const m = /[\p{L}\p{N}]/u.exec(name ?? "");
  return m ? m[0].toLocaleUpperCase("es") : "?";
}

const SLATE = { bg: "#F1F5F9", fg: "#334155" };

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c: number[]) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
function luminance(c: number[]): number {
  const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** WCAG contrast ratio between two RGB colors. */
export function contrast(a: number[], b: number[]): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/**
 * Colors for the monogram: a soft tint of the bank's color behind the letter, and the letter in that
 * color darkened until it reads (WCAG 4.5:1). Without a color: slate.
 */
export function monogramColors(color: string | null | undefined): { bg: string; fg: string } {
  const hex = normalizeColor(color);
  if (!hex) return SLATE;
  const base = rgb(hex);
  const bg = mix(base, [255, 255, 255], 0.88);
  let fg = base;
  for (let t = 0.1; contrast(fg, bg) < 4.5 && t <= 1; t += 0.1) fg = mix(base, [0, 0, 0], t);
  return { bg: toHex(bg), fg: toHex(fg) };
}

// ── The bank's own movements ──

/** What banks write on their own movements: provisional credits, fees, interest, adjustments, moving money between your accounts. */
const BANK_OWN = /\b(?:provisional|service (?:charge|fee)|(?:monthly )?(?:service|maintenance) fee|overdraft|od fee|nsf|insufficient funds|returned item|interest (?:payment|paid|earned|charged?)|wire (?:transfer )?fee|atm (?:fee|surcharge)|foreign (?:transaction|exchange) fee|fee reversal|reversal of fee|courtesy credit|account fee|statement fee|stop payment fee|cashier'?s check fee|adjustment|chargeback|dispute credit|(?:online|mobile) transfer|overdraft protection)\b/i;

/**
 * A movement made by the bank itself (a provisional credit, a fee, interest, an adjustment), not by a
 * merchant: it shows the bank's own logo. A Zelle payment or a local business without a logo is not one.
 */
export function isBankOwnMovement(text: string | null | undefined, plaidCategory?: string | null): boolean {
  if (plaidCategory && /"primary"\s*:\s*"BANK_FEES"|"detailed"\s*:\s*"TRANSFER_(?:IN|OUT)_ACCOUNT_TRANSFER"/.test(plaidCategory)) return true;
  return BANK_OWN.test(text ?? "");
}

// ── Merchants ──

/**
 * Payment apps Plaid often sends without a logo, with their ORIGINAL icon saved in public/brands/merchants/
 * (zelle.png: Zelle's own app icon from zellepay.com).
 */
const BUNDLED_MERCHANTS: ReadonlyArray<{ match: RegExp; src: string }> = [
  { match: /\bzelle\b/i, src: "/brands/merchants/zelle.png" },
];

/** The saved original logo for a movement's text ("ZELLE TO CLEANING SERVICE" → Zelle's), or null. */
export function bundledMerchantLogo(text: string | null | undefined): string | null {
  const t = text ?? "";
  return BUNDLED_MERCHANTS.find((m) => m.match.test(t))?.src ?? null;
}

/** Logo URLs the browser may load: https only (Plaid serves merchant logos from its CDN), an inline image, or one of our saved originals. */
export function safeLogoUrl(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null;
  const u = url.trim();
  if (u.length > 1000) return null;
  if (/^\/brands\/merchants\/[a-z0-9-]+\.png$/.test(u)) return u;
  if (/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+=*$/.test(u)) return u;
  try {
    const parsed = new URL(u);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/** A plain website (https://www.starbucks.com or "starbucks.com") as "starbucks.com"; anything else is null. */
export function cleanWebsite(site: string | null | undefined): string | null {
  if (typeof site !== "string" || !site.trim()) return null;
  const s = site.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) && s.length <= 200 ? s : null;
}

/** "Starbucks", "STARBUCKS #1234"... → "starbucks1234". Accents dropped, only letters and digits kept. */
export function merchantKey(name: string | null | undefined): string {
  return (name ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 120);
}

/** The parts of a Plaid transaction that carry the merchant's identity. */
export type PlaidTxBrand = {
  merchant_name?: string | null;
  logo_url?: string | null;
  website?: string | null;
  counterparties?: Array<{ name?: string | null; type?: string | null; logo_url?: string | null; website?: string | null }> | null;
};

/**
 * The merchant a Plaid transaction names, with its logo and website. Only Plaid's own merchant data is used
 * (merchant_name and counterparties, which are businesses), never the raw bank description, so the shared
 * table only ever holds public brand data. Null when there's no merchant or nothing worth keeping.
 */
export function merchantBrandOf(tx: PlaidTxBrand): { key: string; name: string; logoUrl: string | null; website: string | null } | null {
  const cp = Array.isArray(tx.counterparties) ? tx.counterparties.find((c) => c && (c.name || c.logo_url)) : undefined;
  const name = (tx.merchant_name || cp?.name || "").trim().slice(0, 200);
  const key = merchantKey(name);
  if (key.length < 2) return null;
  // The counterparty's logo belongs to the counterparty: only use it when it's the same business.
  const cpSame = !!cp && (!tx.merchant_name || merchantKey(cp.name) === key);
  const logoUrl = safeLogoUrl(tx.logo_url) ?? (cpSame ? safeLogoUrl(cp?.logo_url) : null);
  const website = cleanWebsite(tx.website) ?? (cpSame ? cleanWebsite(cp?.website) : null);
  if (!logoUrl && !website) return null;
  return { key, name, logoUrl, website };
}

/** The logo Plaid sent with this very transaction (its own logo_url, else its counterparty's). */
export function directLogoOf(tx: PlaidTxBrand): string | null {
  return merchantBrandOf(tx)?.logoUrl ?? null;
}

/** Bank boilerplate at the start of a description ("PURCHASE AUTHORIZED ON 11/18 ..."), not part of the merchant. */
const LEADING_NOISE = new Set([
  "purchase", "purchases", "authorized", "auth", "on", "pos", "debit", "credit", "card", "checkcard", "check", "recurring",
  "payment", "pmt", "online", "ach", "web", "ppd", "id", "sq", "tst", "dda", "visa", "mc", "withdrawal", "bill", "the",
  // Payment processors in front of the merchant ("DD *DOORDASH", "SP *SHOP NAME").
  "dd", "sp",
]);

/**
 * Keys under which a bank row's merchant may be saved, best first: its merchant name, then the first words of
 * its merchant name and its description ("STARBUCKS STORE 12345" → starbucksstore12345, starbucksstore, starbucks).
 */
export function candidateKeys(row: { merchantName?: string | null; description?: string | null }): string[] {
  const out: string[] = [];
  const add = (k: string) => { if (k.length >= 2 && !out.includes(k)) out.push(k); };
  add(merchantKey(row.merchantName));
  for (const text of [row.merchantName, row.description]) {
    const words = (text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    let i = 0;
    while (i < words.length && (LEADING_NOISE.has(words[i]) || /^\d+$/.test(words[i]))) i++;
    const rest = words.slice(i, i + 4);
    for (let n = rest.length; n >= 1; n--) {
      const k = rest.slice(0, n).join("");
      // A lone short word ("at", "bp") only counts when it's the whole name, to avoid false matches.
      if (n === 1 && k.length < 3 && rest.length > 1) continue;
      add(k.slice(0, 120));
    }
  }
  return out;
}

// ── Account names ("Way2Save® Savings") ──

/** True when a stored name lost characters on the way (U+FFFD or UTF-8 read as Latin-1, e.g. "Â®"). */
export function looksMangled(name: string | null | undefined): boolean {
  return typeof name === "string" && (/�/.test(name) || /[ÂÃ][\u0080-¿]/.test(name));
}

/**
 * The name to store for a Plaid account (bankAccounts.bankName is VARCHAR(100)): Plaid's `name` in Unicode
 * NFC. If Plaid's name arrives already broken (replacement characters), its `official_name` when that one is
 * clean, else the name without the broken characters ("Way2Save Savings") rather than "Way2Save�� Savings".
 */
export function cleanAccountName(name: string | null | undefined, officialName?: string | null): string {
  const tidy = (s: string | null | undefined) => (s ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  const n = tidy(name);
  if (n && !/�/.test(n)) return n.slice(0, 100);
  const o = tidy(officialName);
  if (o && !/�/.test(o)) return o.slice(0, 100);
  return tidy(n.replace(/�+/g, " ")).slice(0, 100);
}

/**
 * The account name to write over the stored one, from Plaid's account (name + official_name), or null when
 * nothing should change. Repairs "Way2Save�� Savings" on the next balance refresh.
 */
export function repairedName(stored: string | null | undefined, plaidAccount: { name?: string | null; official_name?: string | null }): string | null {
  const fresh = cleanAccountName(plaidAccount.name, plaidAccount.official_name);
  if (!fresh || fresh === stored) return null;
  return fresh;
}
