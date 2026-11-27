import { createRouter, authedQuery, adminQuery } from "./middleware";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "./queries/connection";
import { bankAccounts, bankTransactions, journalEntries, journalEntryLines, userCancelledSubscriptions, syncLogs, smartCategoryRules, type BankAccount, type BankTransaction } from "@db/schema";
import { eq, and, or, desc, sql, count, inArray } from "drizzle-orm";
import { accountMode, bankLimit } from "./lib/plans";
import { lastPaidTier } from "./lib/planAccess";
import { applyStoredReviews } from "./lib/bankReview";
import { autoConfirmPending, storedReviewsFor, unreviewed } from "./review-router";
import { ensureAutoTable, forgetAuto } from "./lib/autoConfirm";
import { assertNotReconciled, closedPeriodIds } from "./reconcile-router";
import { forgetInstitutions, itemKeyOf, refreshInstitution, trackPlaid, type PlaidLike } from "./lib/bankInstitutions";
import { plaidWebhookUrl } from "./lib/plaidWebhook";
import { askBanksNow, balancesNow, heldBanks, type LiveClient } from "./lib/liveBalance";
import { rememberMerchantLogos, withMerchantLogos } from "./lib/merchantLogos";
import { cleanAccountName, directLogoOf, plaidErrorCode, repairedName, trustedMerchantName } from "./lib/brand";
import { CHAIN_CATEGORY, billFromPlaid, isCarWash, isGasStation, knownBill, knownChain, knownIncome, type KnownBill } from "./lib/bankRules";
import { isDuplicateKey } from "./lib/dbErrors";
import { bankInstitutionsTable } from "./lib/brandSchema";
import type { AccountsGetRequest, AccountsGetResponse, Transaction, TransactionsGetRequest, TransactionsGetResponse } from "plaid";
import { readFileSync } from "fs";
import { join } from "path";

// ═══════════════════════════════════════════════════════════
// ELITE ACCOUNTING: bank-router.ts - Complete Rewrite
// ═══════════════════════════════════════════════════════════

let plaidClient: any = null;

// Auto-detect Plaid environment based on secret format
const plaidSecret = process.env.PLAID_SECRET || "";
const isProductionSecret = plaidSecret.length > 30 && !plaidSecret.startsWith("sk-");
const isProductionEnv = process.env.PLAID_ENV === "production" || isProductionSecret;

/** The shared Plaid client (null when Plaid isn't configured). Other routers reuse it. */
export async function initPlaid() {
  if (plaidClient) return plaidClient;
  try {
    const { Configuration, PlaidApi, PlaidEnvironments } = await import("plaid");
    const env = isProductionEnv ? "production" : "sandbox";
    console.log(`[Plaid] Using ${env.toUpperCase()} environment (detected production: ${isProductionEnv})`);
    const config = new Configuration({
      // PLAID_BASE_URL only exists for local tests against a fake Plaid; production never sets it.
      basePath: process.env.PLAID_BASE_URL || PlaidEnvironments[env],
      baseOptions: { headers: { "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID, "PLAID-SECRET": process.env.PLAID_SECRET } },
    });
    plaidClient = new PlaidApi(config);
    return plaidClient;
  } catch { return null; }
}


// ─── Smart Category Rules (in-memory for now, DB later) ───
const defaultCategoryRules: Record<string, { category: string; type: string }> = {
  // NOTE: Do NOT put "zelle" here - it catches "zelle from" too
  // Zelle is handled by dedicated logic below
  // NOTE: PayPal, Cash App, Venmo, etc. are P2P payments, NOT cash deposits
  "cash app": { category: "transfer", type: "expense" },
  "venmo": { category: "transfer", type: "expense" },
  "paypal": { category: "transfer", type: "expense" },
  "square": { category: "transfer", type: "expense" },
  "facebook": { category: "transfer", type: "expense" },
  "walmart": { category: "retail", type: "expense" },
  "target": { category: "retail", type: "expense" },
  "amazon": { category: "shopping", type: "expense" },
  "costco": { category: "wholesale", type: "expense" },
  "best buy": { category: "electronics", type: "expense" },
  "uber": { category: "rideshare", type: "expense" },
  "lyft": { category: "rideshare", type: "expense" },
  "doordash": { category: "food_delivery", type: "expense" },
  "grubhub": { category: "food_delivery", type: "expense" },
  "instacart": { category: "food_delivery", type: "expense" },
  "mcdonald": { category: "fast_food", type: "expense" },
  "starbucks": { category: "coffee", type: "expense" },
};

/**
 * Detects reversed/voided transactions.
 * A transaction is reversed when:
 * - Same merchant/description
 * - Same date (within same day)
 * - Opposite amounts (+$40 and -$40)
 * - The positive one is a refund/reversal of the negative one
 * Returns a Set of transaction_ids that are reversed.
 */
function detectReversedTransactions(transactions: any[]): Set<string> {
  const reversed = new Set<string>();
  const byKey = new Map<string, any[]>();

  console.log(`[detectReversed] Checking ${transactions.length} transactions`);

  // Group by normalized description + date + amount (absolute value)
  for (const tx of transactions) {
    const desc = (tx.description || tx.merchantName || "").toLowerCase().trim();
    const date = tx.transactionDate
      ? (tx.transactionDate instanceof Date ? tx.transactionDate.toISOString().split("T")[0] : String(tx.transactionDate).split("T")[0])
      : "";
    const absAmount = Math.abs(parseFloat(tx.amount || 0)).toFixed(2);
    const key = `${desc}|${date}|${absAmount}`;

    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(tx);
  }

  console.log(`[detectReversed] Grouped into ${byKey.size} groups`);

  // Find pairs with opposite types (expense + income = same merchant, same amount, same date)
  for (const [key, group] of byKey) {
    if (group.length < 2) continue;

    const expenses = group.filter((tx: any) => tx.type === "expense");
    const incomes = group.filter((tx: any) => tx.type === "income");

    console.log(`[detectReversed] Group "${key}": ${group.length} items, ${expenses.length} expense, ${incomes.length} income`);

    // Match expenses with incomes (same count = reversed pairs)
    const pairCount = Math.min(expenses.length, incomes.length);
    for (let i = 0; i < pairCount; i++) {
      const expId = expenses[i].id || expenses[i].plaidTransactionId;
      const incId = incomes[i].id || incomes[i].plaidTransactionId;
      reversed.add(expId);
      reversed.add(incId);
      console.log(`[detectReversed] Marked as reversed: ${expId} + ${incId}`);
    }
  }

  console.log(`[detectReversed] Found ${reversed.size} reversed transactions`);
  return reversed;
}

/**
 * Where a known bill goes (api/lib/bankRules.ts). Money out: that category. Money in: a card payment received on the
 * card's own account is still a card payment; money back from the power company, a landlord, an insurer or the
 * government is a refund; money in from a lender (loan funds, a cash advance) is left to the rules below.
 */
function placeBill(bill: KnownBill | null, plaidAmount: number): { type: "income" | "expense"; category: string } | null {
  if (!bill) return null;
  if (plaidAmount > 0) return { type: "expense", category: bill };
  if (bill === "card_payment") return { type: "income", category: "card_payment" };
  if (bill === "loan") return null;
  return { type: "income", category: "refund" };
}

export function determineTypeAndCategory(plaidAmount: number, plaidCategories: string[], description: string): { type: "income" | "expense"; category: string } {
  const desc = description.toLowerCase();
  const absAmt = Math.abs(plaidAmount);

  // ===== KNOWN BILLS BY NAME (owner, 2026-11-24): paying a credit card, loans and buy now pay later, Flex and
  // rent, power/water/phone, health insurance, government fees. Before everything else, so "CAPITAL ONE MOBILE PMT"
  // isn't a purchase and "FLEX FINANCE" isn't shopping.
  const byName = placeBill(knownBill(description, plaidCategories?.[1], plaidAmount), plaidAmount);
  if (byName) return byName;
  // Money in known by name: a paycheck (ADP, Gusto, "PAYROLL"...) or a tax refund (IRS, Alabama).
  const income = knownIncome(description, plaidCategories?.[1], plaidAmount);
  if (income) return { type: "income", category: income };

  // Car washes are memberships (unlimited washes every month): Suscripciones y membresías. Before the gas
  // stations, so "SHELL CAR WASH" is the wash and not gas.
  if (isCarWash(description)) return plaidAmount < 0 ? { type: "income", category: "refund" } : { type: "expense", category: "subscription" };

  // ===== INCOME: MONEY COMING TO USER (before generic merchant rules) =====
  const isIncomingTransfer = (desc.includes("money transfer") || desc.includes("transfer")) && desc.includes("from");
  const isPaymentFrom = desc.includes("payment from") || desc.includes("deposit from") || desc.includes("credit from");
  if (isIncomingTransfer || isPaymentFrom) return { type: "income", category: "transfer_income" };

  // ─── KNOWN SUBSCRIPTIONS (MUST be BEFORE generic merchant rules like "amazon") ───
  const subKeywords = [
    "amazon prime", "prime video", "prime membership",
    "netflix", "spotify", "disney+", "disney plus", "hulu", "hbo", "max ",
    "paramount+", "paramount plus", "peacock", "apple tv+", "apple music",
    "youtube premium", "youtube tv", "crunchyroll", "twitch",
    "chatgpt", "openai", "claude", "anthropic", "kimi",
    "adobe", "creative cloud", "microsoft 365", "office 365",
    "google one", "dropbox", "notion", "slack", "zoom",
    "calm", "headspace", "duolingo", "masterclass",
    "icloud", "apple arcade",
  ];
  for (const kw of subKeywords) {
    if (desc.includes(kw)) return { type: "expense", category: "subscription" };
  }

  // Check default rules (doordash, etc.)
  // CRITICAL: plaidAmount direction determines if it's expense or income:
  //   plaidAmount > 0 = money LEAVING account = expense
  //   plaidAmount < 0 = money ENTERING account = income (refunds, reversals)
  for (const [keyword, rule] of Object.entries(defaultCategoryRules)) {
    if (desc.includes(keyword)) {
      if (plaidAmount < 0) {
        // Money entering account
        // Gig economy payments (DoorDash, Uber, Lyft) = income for work done
        if (keyword === "doordash" || keyword === "grubhub" || keyword === "instacart" || keyword === "uber" || keyword === "lyft") {
          return { type: "income", category: "transfer_income" };
        }
        // Otherwise: this is a REFUND/REVERSAL of a known merchant
        return { type: "income", category: rule.category };
      }
      // Money leaving account: normal expense
      return { type: rule.type as "income" | "expense", category: rule.category };
    }
  }

  // ─── ZELLE detection (BEFORE isGasStation to avoid "alarcon" matching "arco") ───
  const isZelleSent = desc.includes("zelle payment") || desc.includes("zelle money sent") || desc.includes("zelle pay") || desc.includes("zelle to") || (desc.includes("zelle") && !desc.includes("from"));
  const isZelleRecv = desc.includes("zelle from") || desc.includes("zelle money received") || desc.includes("zelle payment from") || desc.includes("zelle for");
  if (isZelleSent) return { type: "expense", category: "zelle_sent" };
  if (isZelleRecv) return { type: "income", category: "zelle_income" };

  // ─── Social media / online purchases (Facebook, Meta, etc.) ───
  if (desc.includes("facebk") || desc.includes("facebook") || desc.includes("meta pay") || desc.includes("fb.me")) {
    if (plaidAmount < 0) return { type: "income", category: "refund" };
    return { type: "expense", category: "shopping" };
  }

  // ─── GAS STATIONS: ALL brands (shell, chevron, exxon, bp, mobil, etc.) ───
  if (isGasStation(desc)) {
    if (plaidAmount < 0) return { type: "income", category: "gasolina" };
    return { type: "expense", category: "gasolina" };
  }

  // ─── KNOWN CHAINS (owner, 2026-11-24): a restaurant, a supermarket or a pharmacy by its name, so "ZAXBY'S #123"
  // or "PUBLIX SUPER M" isn't "Compras" when the bank or Plaid says nothing better. Money out only: money in from
  // one can be a paycheck ("LOS ARCOS RESTAURANT PAYROLL"), the rules below decide that.
  const chain = plaidAmount > 0 ? knownChain(description) : null;
  const chainCategory = chain ? CHAIN_CATEGORY[chain] : undefined;
  if (chainCategory) return { type: "expense", category: chainCategory };

  // Plaid categories
  const pfc = plaidCategories?.[0]?.toUpperCase() || "";
  const detailed = plaidCategories?.[1]?.toUpperCase() || "";

  // ─── ATM CASH DEPOSITS (MUST be FIRST — before generic "deposit" rule) ───
  const isAtmDeposit =
    detailed.includes("ATM DEPOSIT") ||
    detailed.includes("ATM CASH DEPOSIT") ||
    detailed.includes("DEPOSIT ATM") ||
    detailed.includes("CASH DEPOSIT") ||
    (desc.includes("atm") && desc.includes("deposit")) ||
    (desc.includes("cash") && desc.includes("deposit") && !desc.includes("app"));
  if (isAtmDeposit) return { type: "income", category: "cash_deposit" };

  // ─── ATM CASH WITHDRAWALS (MUST be FIRST — before generic rules) ───
  const isAtmWithdrawal =
    detailed.includes("ATM WITHDRAWAL") ||
    detailed.includes("ATM WDL") ||
    detailed.includes("WITHDRAWAL") ||
    detailed.includes("ATM DEBIT") ||
    (desc.includes("atm") && (desc.includes("withdrawal") || desc.includes("wdl"))) ||
    (desc.includes("withdrawal") && !desc.includes("transfer") && !desc.includes("zelle"));
  if (isAtmWithdrawal) return { type: "expense", category: "cash_withdrawal" };

  // Income
  if (pfc === "INCOME") return { type: "income", category: "paycheck" };
  if (detailed.includes("PAYROLL") || desc.includes("payroll") || desc.includes("salary") || desc.includes("wage")) return { type: "income", category: "paycheck" };
  // Generic deposit: only if NOT an ATM deposit (already handled above)
  if (detailed.includes("DEPOSIT") || desc.includes("deposit")) return { type: "income", category: "deposit" };

  // Transfer
  if (detailed.includes("TRANSFER") || desc.includes("transfer") || desc.includes("zelle")) return { type: plaidAmount >= 0 ? "expense" : "income", category: "transfer" };

  // Investment
  if (detailed.includes("INVESTMENT") || desc.includes("dividend")) return { type: "income", category: "investment" };
  if (detailed.includes("INVESTMENT") || desc.includes("interest")) return { type: "income", category: "interest" };

  // P2P Payment Apps (PayPal, Cash App, Venmo, Square, Facebook) - NOT cash deposits
  const p2pKeywords = ["paypal","cash app","venmo","square","facebook pay"];
  for (const kw of p2pKeywords) {
    if (desc.includes(kw)) {
      // P2P received (money coming in) = income, P2P sent (money going out) = expense
      if (plaidAmount < 0) return { type: "income", category: "transfer" };
      return { type: "expense", category: "transfer" };
    }
  }

  // "PURCHASE TURBO BOOST" comes from Plaid as rent: it's a purchase.
  if (desc.includes("turbo")) return { type: "expense", category: "shopping" };

  // Plaid's own bill categories: rent apart from utilities (both used to land in Compras), card payments, loans,
  // health insurance, government fees.
  const byPlaid = placeBill(billFromPlaid(detailed, description, plaidAmount), plaidAmount);
  if (byPlaid) return byPlaid;

  // Loan
  if (detailed.includes("LOAN") || desc.includes("loan") || desc.includes("mortgage")) return { type: "expense", category: "loan" };

  // Insurance
  if (detailed.includes("INSURANCE") || desc.includes("insurance") || desc.includes("geico")) return { type: "expense", category: "insurance" };

  // Utilities
  if (detailed.includes("UTILITIES") || desc.includes("electric") || desc.includes("water")) return { type: "expense", category: "utilities" };

  // Subscription — catch-all for Plaid category + generic keyword
  if (detailed.includes("SUBSCRIPTION") || desc.includes("subscription")) return { type: "expense", category: "subscription" };

  // Food
  if (detailed.includes("FOOD") || desc.includes("food")) return { type: "expense", category: "food" };

  // Gas — Plaid category + generic fallback (now also covered by isGasStation above)
  if (detailed.includes("GASOLINE") || desc.includes("gas ") || desc.includes("fuel")) return { type: "expense", category: "gasolina" };

  // Medical
  if (detailed.includes("MEDICAL") || desc.includes("medical")) return { type: "expense", category: "medical" };

  // Default: In Plaid, positive amount = money LEAVING (expense), negative = money ENTERING (income)
  if (plaidAmount < 0) return { type: "income", category: "general" };
  return { type: "expense", category: "shopping" };
}

// ─── MERCHANT ALIASES ───
const MERCHANT_ALIASES: [RegExp, string][] = [
  [/netflix/i, "netflix"], [/spotify/i, "spotify"],
  [/disney\s*(\+)?/i, "disney+"], [/hulu/i, "hulu"],
  [/hbo|max/i, "hbo max"], [/paramount\s*(\+)?/i, "paramount+"],
  [/peacock/i, "peacock"], [/prime\s*video/i, "prime video"],
  [/youtube\s*premium/i, "youtube premium"], [/youtube\s*tv/i, "youtube tv"],
  [/crunchyroll/i, "crunchyroll"], [/twitch/i, "twitch"],
  [/apple\s*music/i, "apple music"], [/apple\s*tv/i, "apple tv"],
  [/icloud/i, "icloud"], [/itunes/i, "itunes"],
  [/verizon/i, "verizon"], [/at&t/i, "at&t"],
  [/t-mobile|tmobile/i, "t-mobile"], [/sprint/i, "sprint"],
  [/cricket/i, "cricket"], [/metro\s*pcs/i, "metro pcs"],
  [/comcast|xfinity/i, "comcast"], [/spectrum/i, "spectrum"],
  [/cox/i, "cox"], [/fios/i, "fios"],
  [/geico/i, "geico"], [/state\s*farm/i, "state farm"],
  [/progressive/i, "progressive"], [/allstate/i, "allstate"],
  [/blue\s*cross/i, "blue cross"], [/aetna/i, "aetna"],
  [/cigna/i, "cigna"], [/humana/i, "humana"],
  [/planet\s*fitness/i, "planet fitness"], [/la\s*fitness/i, "la fitness"],
  [/equinox/i, "equinox"], [/crunch\s*fitness/i, "crunch fitness"],
  [/ymca/i, "ymca"], [/adobe/i, "adobe"],
  [/microsoft\s*365|office\s*365/i, "microsoft 365"],
  [/google\s*one/i, "google one"], [/dropbox/i, "dropbox"],
  [/nytimes|new\s*york\s*times/i, "new york times"],
  [/washington\s*post/i, "washington post"],
  [/substack/i, "substack"], [/patreon/i, "patreon"],
  [/windsurf/i, "windsurf"], [/clover/i, "clover"],
  [/klarna/i, "klarna"], [/afterpay/i, "afterpay"],
  [/affirm/i, "affirm"], [/calm/i, "calm"],
  [/headspace/i, "headspace"],
  // Credit cards
  [/capital\s*one/i, "capital one"],
  [/\bchase\b/i, "chase"],
  [/\bciti\b|citibank/i, "citi"],
  [/\bdiscover\b/i, "discover"],
  [/american\s*express|\bamex\b/i, "american express"],
  [/\bsynchrony\b/i, "synchrony"],
  [/\bbarclays\b/i, "barclays"],
  [/wells\s*fargo/i, "wells fargo"],
  [/bank\s*of\s*america/i, "bank of america"],
  // News
  [/new.york.times|nytimes/i, "new york times"],
  [/washington.post/i, "washington post"],
  [/wall.street/i, "wall street journal"],
  [/substack/i, "substack"],
  [/patreon/i, "patreon"],
];

function normalizeMerchantName(name: string): string {
  let n = name.toLowerCase().trim();
  n = n.replace(/purchase authorized on \d{1,2}\/\d{1,2}\s*/i, "");
  n = n.replace(/^purchase\s+/i, "");
  n = n.replace(/recurring payment authorized on \d{1,2}\/\d{1,2}\s*/i, "");
  n = n.replace(/^payment\s+/i, "");
  n = n.replace(/\bst-[a-z0-9]+\b/gi, "");
  n = n.replace(/[*#][a-z0-9]{5,}/gi, "");
  n = n.replace(/\bs\d{10,}\b/gi, "");
  n = n.replace(/\b[a-z0-9]{15,}\b/gi, "");
  n = n.replace(/\s+transfer\b.*$/i, "");
  n = n.replace(/\s+ref\s+to\b.*$/i, "");
  n = n.replace(/\s+reference\b.*$/i, "");
  n = n.replace(/\s+(card|debit|credit|visa|mastercard|amex|discover)\b.*$/i, "");
  n = n.replace(/\s+yonel\s+martinez\b.*$/i, "");
  n = n.replace(/\s+\d{3,}\s*$/i, "");
  n = n.replace(/^\d+\s+/, "");
  n = n.replace(/\.com\b/, "");
  n = n.replace(/\s+/g, " ").trim();
  for (const [regex, canonical] of MERCHANT_ALIASES) {
    if (regex.test(n)) return canonical;
  }
  n = n.replace(/[^a-z0-9]+$/i, "").trim();
  return n || name.toLowerCase().trim();
}

// ─── WORD MATCHING HELPER ───
function hasWord(text: string, keyword: string): boolean {
  const t = text.toLowerCase();
  const k = keyword.toLowerCase();
  let idx = t.indexOf(k);
  while (idx !== -1) {
    const before = idx === 0 || !/[a-z0-9]/.test(t[idx - 1]);
    const after = idx + k.length >= t.length || !/[a-z0-9]/.test(t[idx + k.length]);
    if (before && after) return true;
    idx = t.indexOf(k, idx + 1);
  }
  return false;
}
function checkKeywords(keywords: string[], name: string, desc: string): boolean {
  return keywords.some(k => hasWord(name, k) || hasWord(desc, k));
}

// ═══════════════════════════════════════════════════════════
// CATEGORY CONFIGURATION
// ═══════════════════════════════════════════════════════════

// MEMBERSHIPS: Entertainment, gym, software, cloud, gaming, dating, news
const MEMBERSHIP_KEYWORDS = [
  // Streaming
  "netflix", "spotify", "disney", "hulu", "hbo", "paramount", "peacock",
  "prime video", "youtube premium", "youtube tv", "crunchyroll", "twitch",
  "starz", "showtime", "amc+",
  // Apple services
  "apple music", "apple tv", "apple arcade", "icloud", "itunes",
  // Gyms & fitness
  "planet fitness", "la fitness", "equinox", "crunch fitness", "ymca",
  "orange theory", "soulcycle", "peloton", "24 hour fitness", "gold gym",
  "gym", "fitness",
  // AI services
  "chatgpt", "openai", "midjourney", "claude", "kimi", "anthropic",
  // Car washes
  "car wash", "autowash", "tunnel wash", "self serve wash", "quick quack",
  "zips car wash", "mister car wash", "brown bear", "super wash",
  // Software
  "adobe", "creative cloud", "photoshop", "premiere",
  "microsoft 365", "office 365",
  "google one", "google workspace",
  "dropbox", "notion", "slack", "zoom", "canva", "grammarly",
  // News & reading
  "nytimes", "new york times", "washington post", "wall street journal",
  "substack", "patreon", "medium", "kindle unlimited", "audible",
  // Gaming
  "xbox", "playstation", "ps plus", "nintendo", "steam", "epic games",
  // Dating
  "tinder", "bumble", "hinge", "match.com",
  // Learning & wellness
  "calm", "headspace", "duolingo", "masterclass", "skillshare", "coursera",
  // Meal kits
  "hellofresh", "blue apron", "home chef",
  // Memberships
  "costco", "sam club", "amazon prime",
];

// CREDIT CARDS: Only credit card companies
const CREDIT_CARD_KEYWORDS = [
  "chase", "capital one", "citi", "citibank",
  "bank of america", "discover",
  "amex", "american express", "synchrony",
  "barclays", "wells fargo",
  "credit card payment", "cc payment", "cc autopay",
];

// MONTHLY PAYMENTS: Bills, utilities, insurance, rent, loans, buy-now-pay-later
const PAYMENT_KEYWORDS = [
  // Phone & Internet
  "verizon", "at&t", "t-mobile", "tmobile", "sprint", "cricket",
  "metro pcs", "boost mobile", "mint mobile", "visible", "straight talk",
  "comcast", "xfinity", "spectrum", "cox", "fios", "frontier",
  "centurylink", "optimum",
  // Insurance
  "geico", "state farm", "progressive", "allstate", "farmers",
  "nationwide", "liberty mutual", "travelers", "usaa",
  "blue cross", "anthem", "aetna", "cigna", "humana", "kaiser", "unitedhealth",
  // Mortgage & rent
  "mortgage", "rent", "apartment", "housing",
  // Loans
  "loan payment", "auto loan", "car loan", "student loan", "personal loan",
  "lendingclub", "lending club", "sofi", "marcus", "ally auto",
  // Utilities
  "electric", "water bill", "gas bill", "sewage", "trash", "utility",
  "duke energy", "con edison", "pg&e",
  // Buy now pay later
  "affirm", "klarna", "afterpay",
  // Other monthly
  "car wash", "autowash",
  "ezpass", "sunpass", "fastrak", "toll",
  "windsurf", "clover",
];

// EXCLUSIONS: One-time purchases, transfers, names, etc.
const EXCLUDED_PATTERNS = [
  // Payment apps
  "zelle", "paypal", "venmo", "cash app", "square",
  // Social/Meta
  "facebook", "facebk", "fb ", "meta pay",
  // ATM/Cash
  "atm", "withdrawal",
  // Income/Payroll
  "payroll", "pay roll", "salary", "wage", "direct deposit",
  "paycheck", "pay check",
  // Taxes
  "irs", "tax payment", "tax ref",
  // Deposits
  "deposit",
  // Transfers (any kind)
  "online transfer", "transfer ref", "transfer to", "transfer from",
  "capital one transfer", "chase transfer", "bank transfer",
  // People/Names (likely person-to-person payments)
  "nathan", "jose", "maria", "juan", "carlos", "ana", "luis",
  // One-time stores (confirmed purchases, not subscriptions)
  "vistaprint", "walmart", "target", "best buy",
  "mcdonald", "burger king", "wendy", "taco bell", "chipotle", "subway",
  "starbucks", "dunkin",
  "kroger", "safeway", "publix", "whole foods", "trader joe",
  "uber", "lyft", "doordash", "grubhub", "instacart",
  "nyx", "sephora", "ulta", "mac cosmetics",
  "nike", "adidas", "under armour",
  "home depot", "lowe", "ikea",
  "walgreens", "cvs",
  // Gas stations (one-time fill-ups)
  "gas station", "shell", "exxon", "chevron", "bp ", "speedway",
  "racetrac", "quiktrip", "7-eleven",
  // Hotels/Travel (one-time)
  "hotel", "airbnb", "booking.com", "expedia",
  // Other one-time
  "etsy", "ebay", "pos", "purchase",
];

// ═══════════════════════════════════════════════════════════
// SYNC TRANSACTIONS
// ═══════════════════════════════════════════════════════════

// Timeout wrapper for promises
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

// ═══════════════════════════════════════════════════════════
// BANK CONNECTIONS (Plaid items): every connected bank, not only the first
// ═══════════════════════════════════════════════════════════
// Business plans connect several banks (Básico 1, Pro 3, Negocio 6). Each bank is a Plaid item with its own
// access token, so every Plaid call below is made once per item and the answers are merged, each movement
// and balance kept under its real account. A bank that fails (e.g. ITEM_LOGIN_REQUIRED) has its status
// recorded (brand.institutions shows "reconnect") and never stops the others.

type Db = ReturnType<typeof getDb>;

/** The Plaid calls made here (the SDK client from initPlaid is untyped). */
type PlaidCalls = {
  transactionsGet(req: TransactionsGetRequest): Promise<{ data: TransactionsGetResponse }>;
  accountsGet(req: AccountsGetRequest): Promise<{ data: AccountsGetResponse }>;
};

/** One bank connection: its key (the same one brand.institutions uses), its access token and its accounts. */
export type PlaidItem = { key: string; itemId: string | null; token: string; accounts: BankAccount[] };

/**
 * The user's bank connections: accounts grouped by Plaid item (plaidItemId; older rows without one, by their
 * shared access token), lowest account id first. Only accounts with a token that weren't switched off.
 */
export function plaidItemsOf(userAccounts: BankAccount[]): PlaidItem[] {
  const connected = userAccounts.filter((a) => a.plaidAccessToken && a.isActive !== false).sort((a, b) => Number(a.id) - Number(b.id));
  const items = new Map<string, PlaidItem>();
  for (const a of connected) {
    const key = itemKeyOf(connected, a);
    if (!key || !a.plaidAccessToken) continue;
    const item = items.get(key);
    if (item) item.accounts.push(a);
    else items.set(key, { key, itemId: a.plaidItemId ?? null, token: a.plaidAccessToken, accounts: [a] });
  }
  return [...items.values()];
}

/** The bank connections to read, and the accounts an older duplicate connection of the same bank holds. */
export type Connections = {
  items: PlaidItem[];
  /** Account id of an older connection → its twin (same bank, last digits and type) in the newest connection. */
  shadowed: Map<number, number>;
};

const normName = (s: string | null | undefined) => (s ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * The user's bank connections to read: plaidItemsOf, minus older duplicates. Linking the same bank again (e.g.
 * to fix its login) can leave two connections over the same accounts, and reading both would save every movement
 * twice. Two connections are the same bank when their institution matches (bankInstitutions.institutionId, else
 * its name, else the accounts' own names). An account of an older connection with the same last digits and type
 * as an account of a newer one (newest connectedAt, then highest account id) is "shadowed": its movements and
 * balance come from the newer connection only. A connection whose accounts are all shadowed isn't called at all.
 * Nothing is deleted, changed or shown: the older rows stay as they are.
 * Every per-bank path uses this: the sync, month data, balances, accounts list and the background jobs.
 */
export async function connectionsOf(db: Db, userId: number, userAccounts: BankAccount[]): Promise<Connections> {
  const all = plaidItemsOf(userAccounts);
  const shadowed = new Map<number, number>();
  if (all.length < 2) return { items: all, shadowed };

  const hints = new Map<string, { institutionId: string | null; name: string }>();
  try {
    const rows: Array<{ itemId: string; institutionId: string | null; name: string }> = await db
      .select({ itemId: bankInstitutionsTable.itemId, institutionId: bankInstitutionsTable.institutionId, name: bankInstitutionsTable.name })
      .from(bankInstitutionsTable).where(eq(bankInstitutionsTable.userId, userId));
    for (const r of rows) hints.set(r.itemId, { institutionId: r.institutionId, name: r.name });
  } catch { /* no institutions saved yet (the table is created on first use): compare the accounts' names */ }
  // true / false when the institution tells; null when it's unknown (then the account names must match too).
  const sameBank = (a: PlaidItem, b: PlaidItem): boolean | null => {
    const ha = hints.get(a.key), hb = hints.get(b.key);
    if (ha?.institutionId && hb?.institutionId) return ha.institutionId === hb.institutionId;
    const na = normName(ha?.name), nb = normName(hb?.name);
    if (na && nb) return na === nb;
    return null;
  };

  const connected = (item: PlaidItem) => Math.max(...item.accounts.map((a) => new Date(a.connectedAt ?? 0).getTime() || 0));
  const topId = (item: PlaidItem) => Math.max(...item.accounts.map((a) => Number(a.id)));
  const newestFirst = [...all].sort((a, b) => connected(b) - connected(a) || topId(b) - topId(a));
  const seen: PlaidItem[] = [];
  for (const item of newestFirst) {
    for (const acc of item.accounts) {
      const mask = (acc.accountNumber ?? "").trim();
      if (!mask) continue; // no last digits: can't tell it's the same account
      for (const newer of seen) {
        const bank = sameBank(item, newer);
        if (bank === false) continue;
        const twin = newer.accounts.find((n) => !shadowed.has(n.id) && (n.accountNumber ?? "").trim() === mask
          && (n.accountType ?? "") === (acc.accountType ?? "") && (bank === true || normName(n.bankName) === normName(acc.bankName)));
        if (twin) { shadowed.set(acc.id, twin.id); break; }
      }
    }
    seen.push(item);
  }
  return { items: all.filter((item) => item.accounts.some((a) => !shadowed.has(a.id))), shadowed };
}

/** A Plaid day (YYYY-MM-DD) as saved: noon UTC, the same calendar day whatever the server's time zone. */
const plaidDay = (day: string | null | undefined) => (/^\d{4}-\d{2}-\d{2}$/.test(day ?? "") ? new Date(`${day}T12:00:00Z`) : new Date());

/**
 * Movements that a newer connection of the same bank brings and its older (shadowed) twin account already saved:
 * same day, amount (Plaid's sign) and description. They are the same real movements under another Plaid id, so
 * they aren't saved twice. Repeated identical movements are matched one for one. Returns the Plaid ids to skip.
 */
async function savedByOlderTwin(db: Db, userId: number, shadowed: Map<number, number>, txs: Array<{ tx: Transaction; accountId: number }>): Promise<Set<string>> {
  const skip = new Set<string>();
  const twinsOf = new Map<number, number[]>();
  for (const [older, newer] of shadowed) twinsOf.set(newer, [...(twinsOf.get(newer) ?? []), older]);
  const relevant = txs.filter((t) => twinsOf.has(t.accountId) && /^\d{4}-\d{2}-\d{2}$/.test(t.tx.date ?? ""));
  if (relevant.length === 0) return skip;
  const days = relevant.map((t) => t.tx.date).sort();
  const olderIds = [...new Set(relevant.flatMap((t) => twinsOf.get(t.accountId) ?? []))];
  const rows: Array<{ accountId: number | null; day: string; plaidAmount: string | null; description: string }> = await db
    .select({
      accountId: bankTransactions.bankAccountId, day: sql<string>`DATE_FORMAT(${bankTransactions.transactionDate}, '%Y-%m-%d')`,
      plaidAmount: bankTransactions.plaidAmount, description: bankTransactions.description,
    })
    .from(bankTransactions)
    .where(and(eq(bankTransactions.userId, userId), inArray(bankTransactions.bankAccountId, olderIds),
      sql`${bankTransactions.transactionDate} BETWEEN ${days[0]} AND ${days[days.length - 1]}`));
  const key = (accountId: number, day: string, plaidAmount: number, description: string) => `${accountId}|${day}|${plaidAmount.toFixed(2)}|${description}`;
  const saved = new Map<string, number>();
  for (const r of rows) {
    const newer = r.accountId != null ? shadowed.get(Number(r.accountId)) : undefined;
    if (newer == null || r.plaidAmount == null) continue;
    const k = key(newer, r.day, Number(r.plaidAmount), r.description);
    saved.set(k, (saved.get(k) ?? 0) + 1);
  }
  for (const { tx, accountId } of relevant) {
    const k = key(accountId, tx.date, tx.amount, (tx.name || "").slice(0, 255));
    const n = saved.get(k) ?? 0;
    if (n > 0) { saved.set(k, n - 1); skip.add(tx.transaction_id); }
  }
  return skip;
}

/**
 * The cache upsert's update (bank.getMonthData / listByCategory): only ever this user's row. plaidTransactionId is
 * unique across the table, so a row of another user with the same Plaid id is left exactly as it is.
 */
function ownRowUpdate(userId: number, account: Pick<BankAccount, "id" | "bankName">) {
  const mine = sql`${bankTransactions.userId} = ${userId}`;
  return {
    bankAccountId: sql`IF(${mine}, ${account.id}, ${bankTransactions.bankAccountId})`,
    bankName: sql`IF(${mine}, ${account.bankName}, ${bankTransactions.bankName})`,
    lastSyncedAt: sql`IF(${mine}, CURRENT_TIMESTAMP, ${bankTransactions.lastSyncedAt})`,
  };
}

/** The saved plaidCategory column ('{"primary":"RENT_AND_UTILITIES","detailed":"RENT_AND_UTILITIES_RENT"}') as determineTypeAndCategory takes it. */
export function storedPlaidCategories(saved: string | null | undefined): string[] {
  if (!saved) return [];
  try {
    const v: unknown = JSON.parse(saved);
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
    const o = v as { primary?: unknown; detailed?: unknown } | null;
    return o && typeof o.primary === "string" && typeof o.detailed === "string" ? [o.primary, o.detailed] : [];
  } catch {
    return [];
  }
}

/**
 * Plaid's categories for a movement, as determineTypeAndCategory takes them. None when Plaid's merchant contradicts
 * the bank's text: its category came from that wrong guess ("ATS ALABASTER AL" as AT&T → "telephone").
 */
function plaidCategoriesOf(tx: Pick<Transaction, "personal_finance_category" | "category"> & { name?: string | null; merchant_name?: string | null }): string[] {
  if (tx.merchant_name && tx.name && !trustedMerchantName(tx.merchant_name, tx.name)) return [];
  const pfc = tx.personal_finance_category;
  return pfc?.detailed ? [pfc.primary, pfc.detailed] : tx.category || [];
}

/**
 * A Plaid movement as the sync saves it: amount positive, plaidAmount with Plaid's sign (+ out, − in), the
 * account's name and last digits, imported from "plaid". Shared by the sync and the background job (api/boot.ts).
 */
export function plaidTransactionRow(userId: number, account: Pick<BankAccount, "id" | "bankName" | "accountNumber">, tx: Transaction) {
  const plaidAmount = tx.amount;
  const { type, category } = determineTypeAndCategory(plaidAmount, plaidCategoriesOf(tx), tx.name || "");
  return {
    userId, bankAccountId: account.id,
    bankName: account.bankName, accountNumber: account.accountNumber,
    transactionDate: plaidDay(tx.date), description: (tx.name || "").slice(0, 255),
    amount: Math.abs(plaidAmount).toFixed(2), plaidAmount: plaidAmount.toFixed(2),
    type, category: category.slice(0, 40),
    subcategory: tx.personal_finance_category?.detailed || tx.category?.[1] || null,
    plaidTransactionId: tx.transaction_id,
    plaidCategory: tx.personal_finance_category ? JSON.stringify(tx.personal_finance_category) : null,
    // Plaid's clean merchant name ("Amazon", "Target") when it has one, like the Bancos screen saves it;
    // else a tidied version of the bank's text.
    merchantName: (plaidMerchantNameOf(tx) || normalizeMerchantName(tx.name || "")).slice(0, 255),
    syncStatus: "synced" as const, lastSyncedAt: new Date(),
    reference: tx.transaction_id, isReconciled: false, importedFrom: "plaid",
  };
}

/**
 * The merchant's name as Plaid gives it: its merchant_name, else the merchant counterparty's name. Empty when it
 * contradicts the bank's own text (Plaid's guess was wrong, trustedMerchantName): then the bank's text is kept.
 */
export function plaidMerchantNameOf(tx: { name?: string | null; merchant_name?: string | null; counterparties?: Array<{ type?: string | null; name?: string | null }> | null }): string {
  const own = (tx.merchant_name ?? "").trim();
  const cp = (tx.counterparties ?? []).find((c) => c?.type === "merchant" && c.name);
  const named = own || (cp?.name ?? "").trim();
  if (!named) return "";
  return tx.name ? trustedMerchantName(named, tx.name) ?? "" : named;
}

/**
 * A settled movement that was saved while it was still pending (syncs before this rule kept pending ones):
 * Plaid gives the settled one a new id and points back with pending_transaction_id. That saved row becomes
 * the settled movement (its id, final amount, day and text) instead of a second row, so the money isn't
 * counted twice and how it was reviewed stays. Returns true when it took one over.
 */
export async function takeOverPending(
  db: Db, userId: number, tx: { pending_transaction_id?: string | null },
  row: Pick<ReturnType<typeof plaidTransactionRow>, "plaidTransactionId" | "reference" | "amount" | "plaidAmount" | "description" | "merchantName" | "lastSyncedAt"> & { transactionDate: Date | string },
): Promise<boolean> {
  const pendingId = tx.pending_transaction_id;
  if (!pendingId) return false;
  const res = await db.update(bankTransactions).set({
    plaidTransactionId: row.plaidTransactionId, reference: row.reference, amount: row.amount, plaidAmount: row.plaidAmount,
    transactionDate: row.transactionDate, description: row.description, merchantName: row.merchantName, lastSyncedAt: row.lastSyncedAt,
  }).where(and(eq(bankTransactions.userId, userId), or(eq(bankTransactions.plaidTransactionId, pendingId), eq(bankTransactions.reference, pendingId))));
  return Number((res as unknown as [{ affectedRows?: number }])[0]?.affectedRows ?? 0) > 0;
}

/** One bank's movements between two days (YYYY-MM-DD), page by page (Plaid sends at most 500 at a time). */
async function fetchItemTransactions(client: PlaidCalls, token: string, start: string, end: string, maxPages = 20): Promise<Transaction[]> {
  const all: Transaction[] = [];
  let offset = 0;
  for (let page = 0; page < maxPages; page++) {
    const res = await withTimeout(client.transactionsGet({
      access_token: token, start_date: start, end_date: end,
      options: { include_personal_finance_category: true, count: 500, offset },
    }), 20000, `Plaid transactionsGet offset=${offset}`);
    const txs = res.data.transactions || [];
    all.push(...txs);
    offset += txs.length;
    if (txs.length < 500 || offset >= (res.data.total_transactions || 0)) break;
  }
  return all;
}

type ItemOutcome<T> = { item: PlaidItem; ok: true; value: T } | { item: PlaidItem; ok: false; error: unknown };
const answered = <T>(r: ItemOutcome<T>): r is Extract<ItemOutcome<T>, { ok: true }> => r.ok;

/** Plaid's message for a failed call (or the error's own), for logs and the sync's answer. */
function plaidMessageOf(e: unknown): string {
  const err = e as { response?: { data?: { error_message?: unknown } }; message?: unknown } | null;
  const m = err?.response?.data?.error_message ?? err?.message;
  return typeof m === "string" && m ? m : "Unknown Plaid error";
}

/**
 * Runs one Plaid call per bank, all at once, and records how each went (trackPlaid → the bank's status in
 * brand.institutions). A bank that fails comes back as `ok: false`; the others are unaffected.
 */
async function forEachItem<T>(db: Db, userId: number, items: PlaidItem[], call: (item: PlaidItem) => Promise<T>): Promise<Array<ItemOutcome<T>>> {
  return Promise.all(items.map(async (item): Promise<ItemOutcome<T>> => {
    try {
      return { item, ok: true, value: await trackPlaid(db, userId, item.key, () => call(item)) };
    } catch (error: unknown) {
      console.error(`[bank] Plaid call failed (user ${userId}, bank ${item.key}): ${plaidErrorCode(error) ?? plaidMessageOf(error)}`);
      return { item, ok: false, error };
    }
  }));
}

/** Balances by Plaid account id from the banks that answered accountsGet (plaidBalance: cards keep what's owed). */
function freshBalancesOf(outcomes: Array<ItemOutcome<{ data: AccountsGetResponse }>>): Map<string, string> {
  const fresh = new Map<string, string>();
  for (const r of outcomes) {
    if (!r.ok) continue;
    for (const plaidAcc of r.value.data.accounts || []) {
      const bal = plaidBalance(plaidAcc);
      if (bal != null) fresh.set(plaidAcc.account_id, bal);
    }
  }
  return fresh;
}

/**
 * Money the user has: every account's balance except cards and loans (what's owed isn't money you have), and
 * except an older duplicate of an account (connectionsOf), which would count the same money twice.
 */
function moneyTotal(accounts: BankAccount[], balanceOf: (a: BankAccount) => string | null | undefined, shadowed: Map<number, number>): string {
  let total = 0;
  for (const a of accounts) {
    if (isDebtAccount(a.accountType) || shadowed.has(a.id)) continue;
    total += parseFloat(balanceOf(a) ?? "0") || 0;
  }
  return String(total.toFixed(2));
}

/** What the sync answers (the screens read success, added, and error === "TOKEN_INVALID"). */
type SyncAnswer = {
  success: boolean; error?: string; detail?: string; message?: string;
  added?: number; total?: number; duplicates?: number;
  /** Banks that couldn't be read this time (their status is recorded); the other banks still synced. */
  failedItems?: Array<{ itemId: string; error: string }>;
};

/** What the sync answers when a bank's movements couldn't be loaded (the same messages as always). */
function syncFailure(e: unknown): { success: false; error: string; detail?: string } {
  const errCode = plaidErrorCode(e) ?? "";
  if (errCode === "INVALID_ACCESS_TOKEN" || errCode === "ACCESS_TOKEN_EXPIRED") {
    return { success: false, error: "TOKEN_INVALID", detail: "Tu sesion con el banco expiro. Desconecta y vuelve a conectar." };
  }
  if (errCode === "PRODUCT_NOT_READY") return { success: false, error: "Plaid esta preparando los datos. Intenta de nuevo en 10 segundos." };
  if (errCode === "NO_ACCOUNTS") return { success: false, error: "No hay cuentas activas en Plaid." };
  return { success: false, error: `${errCode}: ${plaidMessageOf(e)}` };
}

async function doSyncTransactions(ctx: any, year?: number, month?: number, specificAccountId?: number, syncType: "manual" | "auto" | "webhook" | "retry" = "manual", days?: number): Promise<SyncAnswer> {
  if (!ctx.user) return { success: false, error: "No autenticado" };
  const userId = ctx.user.id;
  const db = getDb();
  const startTime = Date.now();

  console.log(`[SYNC-${syncType}] Starting for userId=${userId}`);

  try {
    // Step 1: Get Plaid client (5s timeout)
    const client = await withTimeout(initPlaid(), 5000, "Plaid init");
    if (!client) return { success: false, error: "Plaid SDK no disponible" };
    console.log(`[SYNC] Plaid client ready`);

    // Step 2: Get user accounts (5s timeout)
    const userAccounts = await withTimeout<BankAccount[]>(
      db.select().from(bankAccounts).where(eq(bankAccounts.userId, userId)),
      5000, "Get accounts"
    );
    if (userAccounts.length === 0) return { success: false, error: "No hay cuentas conectadas" };
    // Every bank once (an older duplicate connection of the same bank is skipped: connectionsOf)
    const { items, shadowed } = await connectionsOf(db, userId, userAccounts);
    if (items.length === 0) return { success: false, error: "No hay token de acceso" };
    console.log(`[SYNC] Found ${userAccounts.length} accounts in ${items.length} bank(s)`);

    const accountMap = new Map<string, BankAccount>();
    for (const acc of userAccounts) {
      if (acc.plaidAccountId) accountMap.set(acc.plaidAccountId, acc);
    }

    const now = new Date();
    let startDate: string;
    let endDate: string;
    if (days && days > 0) {
      // Sync last N days (for catching recent transactions)
      const start = new Date(now);
      start.setDate(start.getDate() - days);
      startDate = start.toISOString().split("T")[0];
      endDate = now.toISOString().split("T")[0];
    } else {
      const syncYear = year ?? now.getFullYear();
      const syncMonth = month ?? (now.getMonth() + 1);
      startDate = new Date(syncYear, syncMonth - 1, 1).toISOString().split("T")[0];
      endDate = new Date(syncYear, syncMonth, 0).toISOString().split("T")[0];
    }
    console.log(`[SYNC] Date range: ${startDate} to ${endDate}`);

    // Step 3: Every bank's movements (all pages; no account_ids: Plaid returns every account of the item).
    // Plaid sometimes needs a moment after connecting: retry once for "not yet ready".
    const fetchForSync = async (item: PlaidItem): Promise<Transaction[]> => {
      try {
        return await fetchItemTransactions(client, item.token, startDate, endDate);
      } catch (e: unknown) {
        const code = plaidErrorCode(e) ?? "";
        if (["INVALID_ACCESS_TOKEN", "ACCESS_TOKEN_EXPIRED", "PRODUCT_NOT_READY", "NO_ACCOUNTS"].includes(code) || !plaidMessageOf(e).includes("not yet ready")) throw e;
        console.log(`[SYNC] Retrying bank ${item.key} in 3s...`);
        await new Promise((r) => setTimeout(r, 3000));
        return fetchItemTransactions(client, item.token, startDate, endDate, 1);
      }
    };
    const fetched = await forEachItem(db, userId, items, fetchForSync);
    const live = fetched.filter(answered);
    // Banks that couldn't be read this time (their status is recorded; the rest still syncs).
    const failedItems = fetched.flatMap((r) => (r.ok ? [] : [{ itemId: r.item.key, error: syncFailure(r.error).error }]));
    if (live.length === 0) {
      const first = fetched.find((r) => !r.ok);
      return { ...syncFailure(first && !first.ok ? first.error : null), failedItems };
    }
    // Each movement under its own account (else the first account of its own bank). An account an older
    // duplicate connection still reports (shadowed) is read from the newest connection only.
    const accountOf = (tx: Transaction, item: PlaidItem) => accountMap.get(tx.account_id) || item.accounts[0];
    const fetchedTxs = live.flatMap((r) => r.value.map((tx) => ({ tx, item: r.item })));
    // Settled movements only: a pending one gets a new id (and often another amount) once it posts, so saving
    // it too would count it twice. It's saved when it posts.
    const allTxs = fetchedTxs.filter(({ tx, item }) => !tx.pending && !shadowed.has(accountOf(tx, item).id));
    console.log(`[SYNC] Plaid returned ${allTxs.length} total transactions from ${live.length} of ${items.length} bank(s)`);

    // Original merchant logos (Plaid's logo_url / counterparties) for the bank screens.
    await rememberMerchantLogos(db, fetchedTxs.map((p) => p.tx));

    if (allTxs.length === 0) {
      console.log(`[SYNC] No transactions found`);
      return { success: true, added: 0, message: "Sin transacciones nuevas para este periodo.", failedItems };
    }

    // Step 4: Deduplication (5s timeout)
    console.log(`[SYNC] Checking for duplicates...`);
    const existingSet = new Set<string>();
    try {
      const existingTxIds = await withTimeout<Array<{ plaidTransactionId: string | null; reference: string | null }>>(
        db.select({ plaidTransactionId: bankTransactions.plaidTransactionId, reference: bankTransactions.reference })
          .from(bankTransactions).where(eq(bankTransactions.userId, userId)),
        5000, "Get existing transactions"
      );
      for (const tx of existingTxIds) {
        if (tx.plaidTransactionId) existingSet.add(tx.plaidTransactionId);
        if (tx.reference) existingSet.add(tx.reference);
      }
    } catch { /* if table/column doesn't exist yet, proceed without dedup */ }

    const unsaved = allTxs.filter(({ tx }) => !existingSet.has(tx.transaction_id));
    // Already saved by an older connection of the same bank (another Plaid id for the same movement).
    const twinSaved = await savedByOlderTwin(db, userId, shadowed, unsaved.map(({ tx, item }) => ({ tx, accountId: accountOf(tx, item).id })));
    const newTxs = unsaved.filter(({ tx }) => !twinSaved.has(tx.transaction_id));
    const duplicates = allTxs.length - newTxs.length;
    console.log(`[SYNC] New: ${newTxs.length}, Duplicates: ${duplicates}`);

    if (newTxs.length === 0) {
      return { success: true, added: 0, message: "Todas las transacciones ya estaban sincronizadas.", failedItems };
    }

    // Step 5: Insert transactions, each under its own account (else the first account of its own bank)
    console.log(`[SYNC] Inserting ${newTxs.length} transactions...`);
    let added = 0;
    let skipped = 0;

    for (const { tx, item } of newTxs) {
      try {
        if (Math.abs(tx.amount) === 0 || existingSet.has(tx.transaction_id)) { skipped++; continue; }
        const targetAccount = accountOf(tx, item);
        const txData = plaidTransactionRow(userId, targetAccount, tx);
        if (await takeOverPending(db, userId, tx, txData)) { existingSet.add(tx.transaction_id); added++; continue; }
        console.log(`[SYNC] Inserting: "${tx.name}" | amount=${txData.amount} | category=${txData.category} | account=${targetAccount.bankName} (id=${targetAccount.id}) | bank=${item.key} | plaid_account=${tx.account_id}`);
        await db.insert(bankTransactions).values(txData);
        existingSet.add(tx.transaction_id);
        added++;
      } catch (e: unknown) {
        console.error(`[SYNC] Insert error for ${tx.transaction_id}: ${e instanceof Error ? e.message : e}`);
        skipped++;
      }
    }

    console.log(`[SYNC] Inserted: ${added}, Skipped: ${skipped}`);


    // Step 6: Update balances of the banks that answered (best effort, 10s timeout each)
    const balances = await forEachItem(db, userId, live.map((r) => r.item), (item) =>
      withTimeout<{ data: AccountsGetResponse }>(client.accountsGet({ access_token: item.token }), 10000, "Update balances"));
    // A balance that came from the bank itself after Plaid's copy stays (api/lib/liveBalance.ts)
    const held = await heldBanks(db, userId);
    for (const r of balances) {
      if (!r.ok) { console.log(`[SYNC] Balance update skipped for bank ${r.item.key}`); continue; }
      try {
        for (const plaidAcc of r.value.data.accounts || []) {
          const dbAccount = accountMap.get(plaidAcc.account_id);
          if (dbAccount && plaidAcc.balances && !shadowed.has(dbAccount.id) && !held.has(r.item.key)) {
            const bal = plaidBalance(plaidAcc);
            if (bal != null) await db.update(bankAccounts).set({ currentBalance: bal, lastSyncedAt: new Date(), updatedAt: new Date() }).where(eq(bankAccounts.id, dbAccount.id));
          }
        }
        await repairAccountNames(db, userId, userAccounts, r.value.data.accounts || []);
      } catch { console.log(`[SYNC] Balance update skipped for bank ${r.item.key}`); }
    }
    console.log(`[SYNC] Balances updated`);

    const duration = Date.now() - (startTime || Date.now());
    console.log(`[SYNC] Complete in ${duration}ms. Added: ${added}`);
    return { success: true, added, total: allTxs.length, duplicates, message: added > 0 ? `${added} transacciones sincronizadas` : "Sin transacciones nuevas", failedItems };
  } catch (err: unknown) {
    console.error(`[SYNC] Fatal error:`, err);
    return { success: false, error: (err instanceof Error && err.message) || "Error desconocido en sincronizacion" };
  }
}

// ═══════════════════════════════════════════════════════════
// BACKGROUND JOBS (api/boot.ts): every user's banks, without anyone online
// ═══════════════════════════════════════════════════════════
// Production runs these every few minutes for ALL users, so they are careful by design:
// - one Plaid call per bank connection, one bank failing never stops the rest (its status is recorded);
// - the transaction job only ADDS settled movements of the last 30 days that aren't saved yet (dedup by
//   plaidTransactionId, and the unique index as a second guard). It never updates or deletes a saved row, so
//   reviewed movements and closed periods are untouched; running it again adds nothing;
// - a per-run cap on inserts (the rest comes on the next run) and a guard so two runs never overlap.

/** Days of movements the background job looks at. */
export const BG_SYNC_DAYS = 30;
/** Most movements the background job saves in one run (all users); the rest is saved on the next runs. */
export const BG_MAX_INSERTS_PER_RUN = 2000;
/** Pages (500 movements each) the background job reads per bank and run. */
const BG_MAX_PAGES = 4;

type BgOptions = { client?: PlaidCalls | null; maxInserts?: number; userIds?: number[] };

/** The jobs only run with Plaid credentials (a server without them, e.g. a local one, has nothing to sync). */
const bgPlaid = async (opts: BgOptions): Promise<PlaidCalls | null> =>
  (opts.client !== undefined ? opts.client : process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET ? await initPlaid() : null);

/** Every user's connected accounts, grouped by user and then by bank connection (older duplicates skipped: connectionsOf). */
async function allUsersItems(db: Db, userIds?: number[]): Promise<Array<{ userId: number; accounts: BankAccount[] } & Connections>> {
  const rows: BankAccount[] = userIds
    ? (userIds.length ? await db.select().from(bankAccounts).where(inArray(bankAccounts.userId, userIds)) : [])
    : await db.select().from(bankAccounts);
  const byUser = new Map<number, BankAccount[]>();
  for (const a of rows) {
    const list = byUser.get(Number(a.userId));
    if (list) list.push(a); else byUser.set(Number(a.userId), [a]);
  }
  const out: Array<{ userId: number; accounts: BankAccount[] } & Connections> = [];
  for (const [userId, accounts] of byUser) {
    const c = await connectionsOf(db, userId, accounts);
    if (c.items.length > 0) out.push({ userId, accounts, ...c });
  }
  return out;
}

let balancesRunning = false;
let transactionsRunning = false;

/** Background: every connected bank's balances, for every user. Never throws. */
export async function syncAllBankBalances(opts: BgOptions = {}): Promise<{ banks: number; failed: number; updated: number; skipped?: "running" | "no-plaid" }> {
  if (balancesRunning) return { banks: 0, failed: 0, updated: 0, skipped: "running" };
  balancesRunning = true;
  let banks = 0, failed = 0, updated = 0;
  try {
    const client = await bgPlaid(opts);
    if (!client) return { banks, failed, updated, skipped: "no-plaid" };
    const db = getDb();
    for (const { userId, items, shadowed } of await allUsersItems(db, opts.userIds)) {
      for (const item of items) {
        banks++;
        try {
          const res = await trackPlaid(db, userId, item.key, () => withTimeout(client.accountsGet({ access_token: item.token }), 15000, "Background balances"));
          // A balance that came from the bank itself after Plaid's copy stays (read now, right before writing)
          if ((await heldBanks(db, userId)).has(item.key)) continue;
          const fresh = new Map<string, string>();
          for (const plaidAcc of res.data.accounts || []) {
            const bal = plaidBalance(plaidAcc);
            if (bal != null) fresh.set(plaidAcc.account_id, bal);
          }
          for (const acc of item.accounts) {
            if (shadowed.has(acc.id)) continue; // an older duplicate of an account: the newest connection has it
            const bal = acc.plaidAccountId ? fresh.get(acc.plaidAccountId) : undefined;
            if (bal == null || Number(bal) === Number(acc.currentBalance)) continue;
            await db.update(bankAccounts).set({ currentBalance: bal, lastSyncedAt: new Date(), updatedAt: new Date() })
              .where(and(eq(bankAccounts.id, acc.id), eq(bankAccounts.userId, userId)));
            updated++;
          }
        } catch (e: unknown) {
          failed++;
          console.error(`[bg-sync] balances of bank ${item.key} (user ${userId}) skipped: ${plaidErrorCode(e) ?? plaidMessageOf(e)}`);
        }
      }
    }
    return { banks, failed, updated };
  } catch (e: unknown) {
    console.error("[bg-sync] Fatal error:", e instanceof Error ? e.message : e);
    return { banks, failed, updated };
  } finally {
    balancesRunning = false;
  }
}

/**
 * Background: every connected bank's new movements of the last 30 days, for every user, saved the same way as
 * the sync (plaidTransactionRow). Only adds rows (a row saved while pending becomes the settled movement:
 * takeOverPending); settled movements only (a pending one gets a new id once it posts, so it would come back twice); movements of accounts that aren't saved yet wait until the account is.
 * Never throws.
 */
export async function syncAllBankTransactions(opts: BgOptions = {}): Promise<{ banks: number; failed: number; added: number; capped: boolean; skipped?: "running" | "no-plaid" }> {
  if (transactionsRunning) return { banks: 0, failed: 0, added: 0, capped: false, skipped: "running" };
  transactionsRunning = true;
  let banks = 0, failed = 0, added = 0, capped = false;
  const maxInserts = Math.max(0, opts.maxInserts ?? BG_MAX_INSERTS_PER_RUN);
  try {
    const client = await bgPlaid(opts);
    if (!client) return { banks, failed, added, capped, skipped: "no-plaid" };
    const db = getDb();
    const now = new Date();
    const endDate = now.toISOString().split("T")[0];
    const startDate = new Date(now.getTime() - BG_SYNC_DAYS * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    users: for (const { userId, accounts, items, shadowed } of await allUsersItems(db, opts.userIds)) {
      // Accounts movements are saved under (an older duplicate of an account is left out: connectionsOf).
      const accountMap = new Map<string, BankAccount>();
      for (const acc of accounts) if (acc.plaidAccountId && !shadowed.has(acc.id)) accountMap.set(acc.plaidAccountId, acc);
      for (const item of items) {
        if (added >= maxInserts) { capped = true; break users; }
        banks++;
        let txs: Transaction[];
        try {
          txs = await trackPlaid(db, userId, item.key, () => fetchItemTransactions(client, item.token, startDate, endDate, BG_MAX_PAGES));
        } catch (e: unknown) {
          failed++;
          console.error(`[tx-sync] bank ${item.key} (user ${userId}) skipped: ${plaidErrorCode(e) ?? plaidMessageOf(e)}`);
          continue;
        }
        try {
          await rememberMerchantLogos(db, txs);

          const candidates = txs.filter((tx) => tx.transaction_id && !tx.pending && Math.abs(tx.amount) > 0 && accountMap.has(tx.account_id));
          if (candidates.length === 0) continue;
          // Already saved: by plaidTransactionId (unique across the table), or as this user's reference.
          const ids = [...new Set(candidates.map((tx) => tx.transaction_id))];
          const saved = new Set<string>();
          for (let i = 0; i < ids.length; i += 500) {
            const chunk = ids.slice(i, i + 500);
            const byId: Array<{ id: string | null }> = await db.select({ id: bankTransactions.plaidTransactionId }).from(bankTransactions)
              .where(inArray(bankTransactions.plaidTransactionId, chunk));
            const byRef: Array<{ id: string | null }> = await db.select({ id: bankTransactions.reference }).from(bankTransactions)
              .where(and(eq(bankTransactions.userId, userId), inArray(bankTransactions.reference, chunk)));
            for (const r of [...byId, ...byRef]) if (r.id) saved.add(r.id);
          }
          // Already saved by an older connection of the same bank, under another Plaid id.
          const twinSaved = await savedByOlderTwin(db, userId, shadowed, candidates.flatMap((tx) => {
            const account = accountMap.get(tx.account_id);
            return account && !saved.has(tx.transaction_id) ? [{ tx, accountId: account.id }] : [];
          }));
          const values: Array<ReturnType<typeof plaidTransactionRow>> = [];
          for (const tx of candidates) {
            const account = accountMap.get(tx.account_id);
            if (!account || saved.has(tx.transaction_id) || twinSaved.has(tx.transaction_id)) continue;
            saved.add(tx.transaction_id);
            const row = plaidTransactionRow(userId, account, tx);
            if (await takeOverPending(db, userId, tx, row)) continue;
            values.push(row);
          }
          if (values.length === 0) continue;

          const room = maxInserts - added;
          if (values.length > room) { capped = true; values.length = room; }
          let addedHere = 0;
          for (let i = 0; i < values.length; i += 100) {
            const chunk = values.slice(i, i + 100);
            try {
              await db.insert(bankTransactions).values(chunk);
              addedHere += chunk.length;
            } catch {
              // One of them was saved meanwhile (the owner's own sync): save the rest one by one.
              for (const v of chunk) {
                try { await db.insert(bankTransactions).values(v); addedHere++; }
                catch (e: unknown) { if (!isDuplicateKey(e)) console.error(`[tx-sync] insert failed (user ${userId}):`, e instanceof Error ? e.message : e); }
              }
            }
          }
          added += addedHere;
          if (addedHere > 0) console.log(`[tx-sync] user ${userId}, bank ${item.key}: ${addedHere} new movement(s)`);
        } catch (e: unknown) {
          // A database problem with one bank never stops the others (nothing half-saved: each insert stands alone).
          console.error(`[tx-sync] bank ${item.key} (user ${userId}) not saved:`, e instanceof Error ? e.message : e);
        }
      }
    }
    if (capped) console.log(`[tx-sync] reached ${maxInserts} new movements this run; the rest comes on the next run`);
    return { banks, failed, added, capped };
  } catch (e: unknown) {
    console.error("[tx-sync] Fatal error:", e instanceof Error ? e.message : e);
    return { banks, failed, added, capped };
  } finally {
    transactionsRunning = false;
  }
}

let statusRunning = false;

/**
 * Background, every hour: each connection's real time with its bank (Plaid's last update, shown as "Lo último de
 * tu banco") and its webhook (set once for connections made before webhooks). Only /item/get (and, once,
 * /item/webhook/update): no cost. Never throws.
 */
export async function refreshAllBankStatus(opts: BgOptions = {}): Promise<{ banks: number; failed: number; skipped?: "running" | "no-plaid" }> {
  if (statusRunning) return { banks: 0, failed: 0, skipped: "running" };
  statusRunning = true;
  let banks = 0, failed = 0;
  try {
    const client = (opts.client !== undefined ? opts.client : process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET ? await initPlaid() : null) as unknown as PlaidLike | null;
    if (!client || typeof client.itemGet !== "function") return { banks, failed, skipped: "no-plaid" };
    const db = getDb();
    for (const { userId, items } of await allUsersItems(db, opts.userIds)) {
      for (const item of items) {
        banks++;
        if (!(await refreshInstitution(db, client, userId, item.key, item.token, { meta: false }))) failed++;
      }
    }
    return { banks, failed };
  } catch (e: unknown) {
    console.error("[bank-status] Fatal error:", e instanceof Error ? e.message : e);
    return { banks, failed };
  } finally {
    statusRunning = false;
  }
}

/** Whose bank connection this Plaid item is (a connected, active account), for the webhook. */
export async function userOfPlaidItem(itemId: string): Promise<number | null> {
  const db = getDb();
  const rows = await db.select({ userId: bankAccounts.userId }).from(bankAccounts)
    .where(and(eq(bankAccounts.plaidItemId, itemId), eq(bankAccounts.isActive, true))).limit(1);
  return rows[0] ? Number(rows[0].userId) : null;
}

/**
 * Plaid's webhook said this user's bank has something new: read their banks now (new settled movements and
 * balances, the same jobs as the background, only for them) and the bank's real time. "busy" when the
 * background job is running right now (the webhook tries again in a moment).
 */
export async function syncUserBanksNow(userId: number, itemId: string): Promise<"done" | "busy"> {
  const tx = await syncAllBankTransactions({ userIds: [userId] });
  if (tx.skipped === "running") return "busy";
  const bal = await syncAllBankBalances({ userIds: [userId] });
  if (bal.skipped === "running") return "busy";
  await refreshAllBankStatus({ userIds: [userId] });
  console.log(`[plaid-webhook] bank ${itemId} (user ${userId}): ${tx.added} new movement(s), ${bal.updated} balance(s) updated`);
  return "done";
}

// ─── HELPER: Format currency for anomaly descriptions ───
function formatCurrencyVal(val: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
}

// ─── HELPER: Check if user has an active bank connection ───
async function hasActiveBank(userId: number): Promise<boolean> {
  const db = getDb();
  const allAccounts = await db.select().from(bankAccounts).where(eq(bankAccounts.userId, userId));
  return allAccounts.some((a: any) => a.plaidAccessToken);
}

// ═══════════════════════════════════════════════════════════
// ROUTER
// ═══════════════════════════════════════════════════════════

/** Simple CSV parser — splits by lines and commas, handles quoted values */
function parseCSV(text: string): string[][] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim());
  return lines.map((line) => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  });
}

/** Detect Wells Fargo CSV format and parse transactions */
export function parseWellsFargoCSV(rows: string[][]): Array<{ date: string; amount: number; plaidAmount: number; description: string; balance?: number }> {
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.toLowerCase().trim());
  // Wells Fargo format: Date,Amount,Star,CheckNumber,Description,Balance
  const dateIdx = headers.findIndex((h) => h.includes("date"));
  const amountIdx = headers.findIndex((h) => h.includes("amount"));
  const descIdx = headers.findIndex((h) => h.includes("description"));
  const balanceIdx = headers.findIndex((h) => h.includes("balance"));
  if (dateIdx === -1 || amountIdx === -1) return [];

  const txs: Array<{ date: string; amount: number; plaidAmount: number; description: string; balance?: number }> = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < Math.max(dateIdx, amountIdx, descIdx) + 1) continue;
    const dateStr = row[dateIdx];
    const amountStr = row[amountIdx].replace(/[$,]/g, "");
    const desc = descIdx >= 0 ? row[descIdx] : "";
    const balStr = balanceIdx >= 0 ? row[balanceIdx].replace(/[$,]/g, "") : "";
    if (!dateStr || !amountStr) continue;
    const amount = parseFloat(amountStr);
    if (isNaN(amount)) continue;
    // Parse date MM/DD/YYYY → YYYY-MM-DD
    const parts = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    const isoDate = parts ? `${parts[3]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}` : dateStr;
    // Statements show money out as negative; Plaid's convention (used by the categorizer) is the opposite.
    txs.push({ date: isoDate, amount: Math.abs(amount), plaidAmount: -amount, description: desc, balance: balStr ? parseFloat(balStr) : undefined });
  }
  return txs;
}

// Strip server-only secrets before sending an account row to the browser.
// The Plaid access token grants full read access to the user's bank and must never leave the server.
function toPublicAccount<T extends { plaidAccessToken?: unknown }>(acc: T): Omit<T, "plaidAccessToken"> {
  const { plaidAccessToken: _secret, ...rest } = acc;
  return rest;
}

/** The balance to keep for a Plaid account. For cards and loans Plaid's "available" is the credit
 * left, not the debt: keep "current" (what's owed). For bank accounts keep "available". */
/** Cards and loans: their balance is what's owed, so it never counts as money you have. */
export const isDebtAccount = (type?: string | null) => type === "credit" || type === "loan";

export function plaidBalance(acc: { type?: string | null; balances?: { available?: number | null; current?: number | null } | null }): string | null {
  const b = acc.balances ?? {};
  const debt = acc.type === "credit" || acc.type === "loan";
  const v = debt ? (b.current ?? b.available) : (b.available ?? b.current);
  return v != null && !Number.isNaN(Number(v)) ? String(v) : null;
}

/**
 * On every balance refresh: keep each account's name as Plaid sends it now. Repairs names saved broken
 * ("Way2Save�� Savings") on the account and on its saved movements. Best effort: never throws.
 */
async function repairAccountNames(
  db: ReturnType<typeof getDb>, userId: number,
  dbAccounts: Array<{ id: number; plaidAccountId?: string | null; bankName?: string | null }>,
  plaidAccounts: Array<{ account_id: string; name?: string | null; official_name?: string | null }>,
) {
  try {
    const byPlaidId = new Map(plaidAccounts.map((p) => [p.account_id, p]));
    for (const acc of dbAccounts) {
      const p = acc.plaidAccountId ? byPlaidId.get(acc.plaidAccountId) : undefined;
      const fixed = p ? repairedName(acc.bankName, p) : null;
      if (!fixed) continue;
      await db.update(bankAccounts).set({ bankName: fixed }).where(and(eq(bankAccounts.id, acc.id), eq(bankAccounts.userId, userId)));
      if (acc.bankName) {
        await db.update(bankTransactions).set({ bankName: fixed })
          .where(and(eq(bankTransactions.userId, userId), eq(bankTransactions.bankAccountId, acc.id), eq(bankTransactions.bankName, acc.bankName)));
      }
      acc.bankName = fixed;
    }
  } catch (e: unknown) {
    console.error("[bank] account name repair skipped:", e instanceof Error ? e.message : e);
  }
}

export const bankRouter = createRouter({
  createLinkToken: authedQuery.mutation(async ({ ctx }) => {
    if (!ctx.user) return { linkToken: null, error: "No autenticado" };
    const client = await initPlaid();
    if (!client) return { linkToken: null, error: "Plaid no inicializado - verifica credenciales" };
    try {
      const res = await client.linkTokenCreate({
        user: { client_user_id: String(ctx.user.id) },
        client_name: "Aethel Accounting platform",
        products: ["transactions"],
        country_codes: ["US"],
        // Plaid's window speaks the owner's language (Spanish unless the app is in English).
        language: ctx.lang === "en" ? "en" : "es",
        transactions: { days_requested: 730 },
        // Plaid posts here as soon as it brings something new from the bank (api/lib/plaidWebhook.ts)
        ...(plaidWebhookUrl() ? { webhook: plaidWebhookUrl() as string } : {}),
      });
      console.log(`[createLinkToken] Link token created for user ${ctx.user.id}`);
      return { success: true as const, linkToken: res.data.link_token };
    } catch (err: any) {
      console.error(`[createLinkToken] Error: ${err.message}`);
      console.error(`[createLinkToken] Response: ${err.response?.data ? JSON.stringify(err.response.data) : 'no response data'}`);
      return { success: false as const, linkToken: null, error: err.response?.data?.error_message || err.message || "Error al crear link token" };
    }
  }),

  exchangePublicToken: authedQuery.input(z.object({ publicToken: z.string() })).mutation(async ({ input, ctx }) => {
    if (!ctx.user) return { success: false, error: "No autenticado" };
    const client = await initPlaid();
    if (!client) return { success: false, error: "Plaid no disponible" };
    const db = getDb();
    try {
      const res = await client.itemPublicTokenExchange({ public_token: input.publicToken });
      const accessToken = res.data.access_token;
      const itemId = res.data.item_id;

      // Each business plan connects a set number of banks (Básico 1, Pro 3, Negocio 6).
      const mode = accountMode(ctx.user.modePreference);
      const limit = ctx.user.role === "admin" ? null : bankLimit(mode, await lastPaidTier(db, Number(ctx.user.id), mode));
      if (limit !== null) {
        const rows = await db.select({ itemId: bankAccounts.plaidItemId, token: bankAccounts.plaidAccessToken }).from(bankAccounts)
          .where(and(eq(bankAccounts.userId, ctx.user.id), eq(bankAccounts.isActive, true)));
        const others = new Map<string, string | null>();
        for (const r of rows) if (r.itemId && r.itemId !== itemId && !others.has(r.itemId)) others.set(r.itemId, r.token);
        if (others.size >= limit) {
          // Linking a bank that is already connected again (e.g. to fix its login) doesn't add a bank.
          const institutionOf = async (token: string | null) => {
            if (!token) return null;
            try { return (await client.itemGet({ access_token: token })).data.item.institution_id ?? null; } catch { return null; }
          };
          const newInstitution = await institutionOf(accessToken);
          let sameBank = false;
          if (newInstitution) {
            for (const token of others.values()) {
              if ((await institutionOf(token)) === newInstitution) { sameBank = true; break; }
            }
          }
          if (!sameBank) {
            try { await client.itemRemove({ access_token: accessToken }); } catch { /* the link just isn't kept */ }
            return {
              success: false,
              code: "bank_limit" as const,
              limit,
              error: `Tu plan permite ${limit} ${limit === 1 ? "banco conectado" : "bancos conectados"}. ${mode === "personal" ? "Para conectar otro, quita uno en Banco." : "Para conectar otro, cambia de plan en Ajustes."}`,
            };
          }
        }
      }

      const accountsRes = await client.accountsGet({ access_token: accessToken });
      const plaidAccounts = accountsRes.data.accounts || [];

      for (const plaidAcc of plaidAccounts) {
        const exists = await db.select({ id: bankAccounts.id }).from(bankAccounts)
          .where(and(eq(bankAccounts.userId, ctx.user.id), eq(bankAccounts.plaidAccountId, plaidAcc.account_id)));
        if (exists.length > 0) {
          await db.update(bankAccounts).set({
            plaidAccessToken: accessToken, plaidItemId: itemId,
            bankName: cleanAccountName(plaidAcc.name, plaidAcc.official_name), accountType: plaidAcc.type,
            currentBalance: plaidBalance(plaidAcc) ?? "0",
            lastSyncedAt: new Date(), updatedAt: new Date(), isActive: true,
          }).where(eq(bankAccounts.id, exists[0].id));
        } else {
          await db.insert(bankAccounts).values({
            userId: ctx.user.id, plaidAccountId: plaidAcc.account_id,
            plaidAccessToken: accessToken, plaidItemId: itemId,
            bankName: cleanAccountName(plaidAcc.name, plaidAcc.official_name), accountType: plaidAcc.type,
            accountNumber: plaidAcc.mask || "", currency: "USD",
            currentBalance: plaidBalance(plaidAcc) ?? "0",
            isActive: true, lastSyncedAt: new Date(),
          });
        }
      }
      // The bank's original logo, name and color from Plaid, and a fresh "ok" (best effort: never blocks the connection).
      try { await refreshInstitution(db, client as PlaidLike, Number(ctx.user.id), itemId, accessToken); }
      catch (e: unknown) { console.error("[exchangePublicToken] institution not saved:", e instanceof Error ? e.message : e); }
      // The "Listo" screen shows each account with its balance right away.
      const accounts = plaidAccounts.map((a: Parameters<typeof plaidBalance>[0] & { account_id: string; name: string; official_name?: string | null; mask?: string | null }) => {
        const bal = plaidBalance(a);
        return { id: a.account_id, name: cleanAccountName(a.name, a.official_name), mask: a.mask || null, type: a.type || null, balance: bal == null ? null : Number(bal) };
      });
      return { success: true as const, accountCount: plaidAccounts.length, itemId, accounts };
    } catch (err: any) {
      return { success: false, error: err.response?.data?.error_message || err.message || "Error" };
    }
  }),

  // ── Update Plaid tokens manually (for admin/token recovery) ──
  updatePlaidTokens: authedQuery
    .input(z.object({
      accountId: z.number(),
      plaidAccessToken: z.string().optional(),
      plaidItemId: z.string().optional(),
      plaidAccountId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) return { success: false, error: "No autenticado" };
      const db = getDb();
      try {
        // Verify account belongs to user
        const existing = await db.select().from(bankAccounts)
          .where(and(eq(bankAccounts.id, input.accountId), eq(bankAccounts.userId, ctx.user.id)));
        if (existing.length === 0) return { success: false, error: "Cuenta no encontrada" };

        const updateData: any = { updatedAt: new Date() };
        if (input.plaidAccessToken !== undefined) updateData.plaidAccessToken = input.plaidAccessToken;
        if (input.plaidItemId !== undefined) updateData.plaidItemId = input.plaidItemId;
        if (input.plaidAccountId !== undefined) updateData.plaidAccountId = input.plaidAccountId;

        await db.update(bankAccounts).set(updateData).where(eq(bankAccounts.id, input.accountId));
        return { success: true, message: "Tokens actualizados" };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }),

  listAccounts: authedQuery.query(async ({ ctx }) => {
    if (!ctx.user) return [];
    try {
      const all = await getDb().select().from(bankAccounts).where(eq(bankAccounts.userId, ctx.user.id)).orderBy(desc(bankAccounts.connectedAt));
      // Only return active accounts - when disconnected, show "Conectar tu banco"
      return all.filter((a: any) => a.plaidAccessToken && a.isActive).map(toPublicAccount);
    } catch (err) {
      console.error("[listAccounts] error:", err);
      return [];
    }
  }),

  getAccount: authedQuery.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
    if (!ctx.user) return null;
    const rows = await getDb().select().from(bankAccounts).where(and(eq(bankAccounts.id, input.id), eq(bankAccounts.userId, ctx.user.id)));
    return rows[0] ? toPublicAccount(rows[0]) : null;
  }),

  checkConnection: authedQuery.query(async ({ ctx }) => {
    if (!ctx.user) return { hasBank: false, accountCount: 0 };
    const db = getDb();
    const allAccounts = await db.select().from(bankAccounts).where(eq(bankAccounts.userId, ctx.user.id));
    // Consider active if it has a plaidAccessToken (regardless of isActive flag)
    const activeAccounts = allAccounts.filter((a: any) => a.plaidAccessToken);
    if (activeAccounts.length > 0) return { hasBank: true, accountCount: activeAccounts.length };
    return { hasBank: false, accountCount: 0, message: allAccounts.length > 0 ? "Cuenta sin token" : "No hay cuenta" };
  }),

  syncTransactions: authedQuery.input(z.object({ year: z.number().optional(), month: z.number().optional(), accountId: z.number().optional(), days: z.number().optional() }).optional())
    .mutation(async ({ input, ctx }) => doSyncTransactions(ctx, input?.year, input?.month, input?.accountId, "manual", input?.days)),

  autoSync: authedQuery.mutation(async ({ ctx }) => doSyncTransactions(ctx, undefined, undefined, undefined, "auto")),

  // Sync recent transactions (last N days) — used on page load to catch new transactions
  syncRecent: authedQuery.mutation(async ({ ctx }): Promise<SyncAnswer> => {
    if (!ctx.user) return { success: false, error: "No autenticado" };
    if (!await hasActiveBank(ctx.user.id)) return { success: false, error: "No hay banco conectado" };

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // Sync current month (which will get last 7 days of transactions)
    const result = await doSyncTransactions(ctx, year, month, undefined, "auto");
    return { ...result, message: `Sincronizando transacciones recientes de ${month}/${year}` };
  }),

  // ─── SYNC FULL YEAR (Accounting Agent) ───
  syncYearTransactions: authedQuery.input(z.object({ year: z.number(), accountId: z.number().optional() })).mutation(async ({ input, ctx }) => {
    if (!ctx.user) return { success: false, error: "No autenticado" };
    if (!await hasActiveBank(ctx.user.id)) return { success: false, error: "No hay banco conectado" };
    const { year, accountId } = input;
    const results = [];
    let totalAdded = 0;
    let totalTransactions = 0;

    // Sync each month of the year (Jan-Dec)
    for (let month = 1; month <= 12; month++) {
      const result = await doSyncTransactions(ctx, year, month, accountId, "auto");
      results.push({ month, ...result });
      if (result.added) totalAdded += result.added;
      if (result.total) totalTransactions += result.total;
    }

    return {
      success: true,
      totalAdded,
      totalTransactions,
      monthsSynced: results.filter((r: any) => r.added > 0).length,
      details: results,
    };
  }),

  getSyncLogs: authedQuery.query(async ({ ctx }) => {
    if (!ctx.user) return [];
    try { return await getDb().select().from(syncLogs).where(eq(syncLogs.userId, ctx.user.id)).orderBy(desc(syncLogs.startedAt)).limit(50); }
    catch { return []; }
  }),

  getMonthData: authedQuery.input(z.object({ year: z.number(), month: z.number(), accountId: z.number().optional() })).query(async ({ input, ctx }) => {
    if (!ctx.user) return { transactions: [], income: "0", expense: "0", topExpense: "0", liveBalance: "0", monthName: "" };
    if (!await hasActiveBank(ctx.user.id)) return { transactions: [], income: "0", expense: "0", topExpense: "0", liveBalance: "0", monthName: "" };
    const db = getDb();
    const userId = ctx.user.id;
    const { year, month, accountId } = input;
    const startStr = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDay = new Date(year, month, 0).getDate();
    const endStr = `${year}-${String(month).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;
    const monthNames = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    const userAccounts: BankAccount[] = await db.select().from(bankAccounts).where(eq(bankAccounts.userId, userId));
    const selectedAccount = accountId ? userAccounts.find((a) => String(a.id) === String(accountId)) ?? null : null;
    // The banks to ask: the selected account's bank, or every connected bank (each bank once: connectionsOf).
    // An older duplicate of an account (shadowed) shows what was saved for it.
    const { items: connections, shadowed } = await connectionsOf(db, userId, userAccounts);
    const items = selectedAccount && shadowed.has(selectedAccount.id) ? []
      : connections.filter((i) => !accountId || i.accounts.some((a) => String(a.id) === String(accountId)));
    // What the screen shows as the balance: the selected account's, or the money in every account (not cards/loans).
    const balanceWith = (fresh: Map<string, string>) => {
      const pick = (a: BankAccount) => (a.plaidAccountId ? fresh.get(a.plaidAccountId) : undefined) ?? a.currentBalance ?? "0";
      return accountId ? (selectedAccount ? pick(selectedAccount) : "0") : moneyTotal(userAccounts, pick, shadowed);
    };
    // Money in and out: Plaid's sign when there is one (− in, + out), else the saved type.
    const totals = (rows: Array<{ amount?: string | null; plaidAmount?: string | null; type?: string | null }>) => {
      let inc = 0, exp = 0;
      for (const t of rows) {
        const amt = parseFloat(t.amount ?? "0");
        if (!(amt > 0)) continue;
        const plaidAmt = t.plaidAmount != null ? parseFloat(t.plaidAmount) : null;
        if (plaidAmt !== null ? plaidAmt < 0 : t.type === "income") inc += amt;
        else exp += amt;
      }
      return { income: String(inc.toFixed(2)), expense: String(exp.toFixed(2)) };
    };
    const topOf = (rows: Array<{ amount?: string | null }>) => (rows.length > 0 ? String(Math.max(...rows.map((t) => parseFloat(t.amount ?? "0")))) : "0");
    const dayOf = (d: unknown) => (d instanceof Date ? d.getTime() : new Date(String(d ?? "")).getTime() || 0);

    // ─── PLAID FIRST: every connected bank at once; a bank Plaid can't read shows its saved movements ───
    try {
      const client = items.length > 0 ? await initPlaid() : null;
      if (client) {
        const fetched = await forEachItem(db, userId, items, (item) => fetchItemTransactions(client, item.token, startStr, endStr));
        const live = fetched.filter(answered);
        const failed = fetched.filter((r) => !r.ok).map((r) => r.item);
        if (live.length > 0) {
          const fetchedTxs = live.flatMap((r) => r.value.map((pt) => ({ pt, item: r.item })));
          await rememberMerchantLogos(db, fetchedTxs.map((p) => p.pt));
          // The logo Plaid sent with each movement (added to the rows returned below).
          const directLogos = new Map<string, string>();
          for (const { pt } of fetchedTxs) { const logo = directLogoOf(pt); if (logo) directLogos.set(pt.transaction_id, logo); }

          // NO FILTER by Plaid account_id - show ALL transactions from ALL accounts of every bank
          console.log(`[getMonthData] Plaid returned ${fetchedTxs.length} raw transactions from ${live.length} of ${items.length} bank(s)`);

          // Build account map (Plaid account ids are unique across banks)
          const plaidToDbAccount = new Map<string, BankAccount>();
          for (const ua of userAccounts) {
            if (ua.plaidAccountId) plaidToDbAccount.set(ua.plaidAccountId, ua);
          }
          // An older duplicate of an account (shadowed) is read from the newest connection only.
          const accountOf = (pt: Transaction, item: PlaidItem) => plaidToDbAccount.get(pt.account_id) || item.accounts[0];
          const plaidTxs = fetchedTxs.filter(({ pt, item }) => !shadowed.has(accountOf(pt, item).id));
          // Movements an older connection of the same bank already saved (another Plaid id): shown, not saved again.
          const twinSaved = await savedByOlderTwin(db, userId, shadowed, plaidTxs.map(({ pt, item }) => ({ tx: pt, accountId: accountOf(pt, item).id })));

          // Map and save to DB (best effort)
          let mapped: any[] = [];
          for (const { pt, item } of plaidTxs) {
            const plaidAmount = pt.amount;
            const absAmount = Math.abs(plaidAmount);
            const { type, category } = determineTypeAndCategory(plaidAmount, plaidCategoriesOf(pt), pt.name);
            const targetAcc = accountOf(pt, item);
            const txRow = {
              userId,
              bankAccountId: targetAcc.id,
              bankName: targetAcc.bankName,
              accountNumber: targetAcc.accountNumber,
              transactionDate: pt.date ? new Date(pt.date) : new Date(),
              description: pt.name,
              amount: String(absAmount.toFixed(2)),
              type,
              category,
              subcategory: pt.personal_finance_category?.detailed || pt.category?.[1] || null,
              plaidTransactionId: pt.transaction_id,
              plaidAmount: String(plaidAmount.toFixed(2)),
              plaidCategory: pt.personal_finance_category ? JSON.stringify(pt.personal_finance_category) : null,
              merchantName: (plaidMerchantNameOf(pt) || pt.name || "").slice(0, 255),
              reference: pt.transaction_id,
              lastSyncedAt: new Date(),
              isReconciled: false,
              importedFrom: "plaid",
            };
            mapped.push(txRow);
            // Save to DB (cache) - ignore errors. The day as noon UTC; an existing row is updated only if it's this user's.
            if (twinSaved.has(pt.transaction_id)) continue;
            try {
              await db.insert(bankTransactions).values({ ...txRow, transactionDate: plaidDay(pt.date) }).onDuplicateKeyUpdate({ set: ownRowUpdate(userId, targetAcc) });
            } catch { /* ignore */ }
          }
          // The upsert above never touches isReconciled/category of a saved row. Movements the owner
          // already reviewed show their category, not the one recomputed here (api/lib/bankReview.ts).
          mapped = applyStoredReviews(mapped, await storedReviewsFor(db, userId, mapped.map((t: { plaidTransactionId: string }) => t.plaidTransactionId)));

          // A bank Plaid couldn't read this time: its saved movements of the month, so no bank goes missing.
          const failedIds = failed.flatMap((item) => item.accounts.filter((a) => !shadowed.has(a.id)).map((a) => a.id));
          if (failedIds.length > 0) {
            try {
              const saved: BankTransaction[] = await db.select().from(bankTransactions).where(and(
                eq(bankTransactions.userId, userId),
                inArray(bankTransactions.bankAccountId, failedIds),
                sql`${bankTransactions.transactionDate} BETWEEN ${startStr} AND ${endStr}`,
              ));
              mapped = [...mapped, ...saved];
            } catch (dbErr: unknown) {
              console.error(`[getMonthData] saved movements of unreachable banks not loaded: ${dbErr instanceof Error ? dbErr.message : dbErr}`);
            }
          }

          // Live balances of the banks that answered (the others keep their saved balance)
          let liveBalance = "0";
          try {
            const balances = await forEachItem(db, userId, live.map((r) => r.item), (item) => client.accountsGet({ access_token: item.token }) as Promise<{ data: AccountsGetResponse }>);
            // Banks whose saved balance came from the bank itself after Plaid's copy keep it (liveBalance.ts)
            const held = await heldBanks(db, userId);
            const freshBalances = freshBalancesOf(balances.filter((r) => !held.has(r.item.key)));
            // Update DB balances
            for (const dbAccount of userAccounts) {
              if (!dbAccount.plaidAccountId || shadowed.has(dbAccount.id)) continue;
              const freshBal = freshBalances.get(dbAccount.plaidAccountId);
              if (freshBal != null) {
                await db.update(bankAccounts).set({ currentBalance: freshBal, lastSyncedAt: new Date() }).where(eq(bankAccounts.id, dbAccount.id));
              }
            }
            for (const r of balances) if (r.ok) await repairAccountNames(db, userId, userAccounts, r.value.data.accounts || []);
            const nameOf = new Map<number, string>(userAccounts.map((a) => [a.id, a.bankName]));
            for (const t of mapped) t.bankName = nameOf.get(t.bankAccountId) ?? t.bankName;
            liveBalance = balanceWith(freshBalances);
          } catch { liveBalance = balanceWith(new Map()); }

          // Filter by accountId if a specific account is selected
          let filteredMapped = mapped;
          if (accountId) {
            filteredMapped = mapped.filter((t: { bankAccountId: number | null }) => String(t.bankAccountId) === String(accountId));
            console.log(`[getMonthData] Filtered to ${filteredMapped.length} transactions for accountId=${accountId}`);
          }
          // Newest first across banks (each bank's list already is).
          if (live.length + failed.length > 1) filteredMapped = [...filteredMapped].sort((a, b) => dayOf(b.transactionDate) - dayOf(a.transactionDate));

          // Income/expense from the filtered data
          const { income, expense } = totals(filteredMapped);

          // Each movement's original merchant logo: the one Plaid sent with it, else the merchant's saved one.
          filteredMapped = await withMerchantLogos(db, filteredMapped.map((t: { plaidTransactionId: string | null; logoUrl?: string | null }) => ({ ...t, logoUrl: (t.plaidTransactionId ? directLogos.get(t.plaidTransactionId) : undefined) ?? t.logoUrl ?? null })));

          // Plaid worked — return mapped transactions directly (no DB round-trip). fromPlaid: every bank answered.
          console.log(`[getMonthData] Returning ${filteredMapped.length} transactions (${failed.length} bank(s) from saved data)`);
          return {
            transactions: filteredMapped, income, expense,
            topExpense: topOf(filteredMapped),
            liveBalance, lastSyncedAt: new Date().toISOString(), fromPlaid: failed.length === 0,
            failedItems: failed.map((i) => i.key),
            monthName: `${monthNames[month]} ${year}`,
          };
        }
      }
    } catch (plaidErr: unknown) {
      console.error(`[getMonthData] Plaid error: ${plaidErr instanceof Error ? plaidErr.message : plaidErr}`);
    }

    // ─── FALLBACK: Query DB when Plaid fails ───
    let fallbackTxs: any[] = [];
    try {
      const conditions = [
        eq(bankTransactions.userId, userId),
        sql`${bankTransactions.transactionDate} BETWEEN ${startStr} AND ${endStr}`,
      ];
      // Filter by accountId when a specific account is selected
      if (accountId) {
        conditions.push(eq(bankTransactions.bankAccountId, accountId));
      }
      fallbackTxs = await db.select().from(bankTransactions)
        .where(and(...conditions))
        .orderBy(desc(bankTransactions.transactionDate));
    } catch (dbErr: unknown) {
      console.error(`[getMonthData] DB fallback error: ${dbErr instanceof Error ? dbErr.message : dbErr}`);
    }

    fallbackTxs = await withMerchantLogos(db, fallbackTxs);

    const fbInc = fallbackTxs.filter((t: BankTransaction) => t.type === "income").reduce((s: number, t: BankTransaction) => s + parseFloat(t.amount ?? "0"), 0);
    const fbExp = fallbackTxs.filter((t: BankTransaction) => t.type === "expense").reduce((s: number, t: BankTransaction) => s + parseFloat(t.amount ?? "0"), 0);
    // The saved balance: the selected account's, or the money in every account (the same rule as above).
    const fbBal = balanceWith(new Map());

    return {
      transactions: fallbackTxs, income: String(fbInc.toFixed(2)), expense: String(fbExp.toFixed(2)),
      topExpense: topOf(fallbackTxs),
      liveBalance: fbBal, lastSyncedAt: null, fromPlaid: false,
      failedItems: items.map((i) => i.key),
      monthName: `${monthNames[month]} ${year}`,
    };
  }),

  // ─── DEBUG: Show transactions grouped by account ───
  debugAccounts: authedQuery.query(async ({ ctx }) => {
    if (!ctx.user) return { error: "No auth" };
    const db = getDb();
    const userId = ctx.user.id;

    // Get all accounts
    const accounts = await db.select().from(bankAccounts).where(eq(bankAccounts.userId, userId));
    
    // Get transaction counts per account
    const result = [];
    for (const acc of accounts) {
      const txs = await db.select({
        id: bankTransactions.id,
        description: bankTransactions.description,
        amount: bankTransactions.amount,
        category: bankTransactions.category,
        transactionDate: bankTransactions.transactionDate,
      }).from(bankTransactions)
        .where(and(
          eq(bankTransactions.userId, userId),
          eq(bankTransactions.bankAccountId, acc.id),
        ))
        .orderBy(desc(bankTransactions.transactionDate))
        .limit(20);
      
      result.push({
        accountId: acc.id,
        accountName: acc.bankName,
        plaidAccountId: acc.plaidAccountId,
        transactionCount: txs.length,
        transactions: txs,
      });
    }

    // Also get transactions with NULL bankAccountId
    const orphaned = await db.select({
      id: bankTransactions.id,
      description: bankTransactions.description,
      amount: bankTransactions.amount,
      category: bankTransactions.category,
    }).from(bankTransactions)
      .where(and(
        eq(bankTransactions.userId, userId),
        sql`${bankTransactions.bankAccountId} IS NULL`,
      ))
      .limit(10);

    return { accounts: result, orphaned };
  }),

  // ─── LIST BY CATEGORY (for BankCategoryDetail page) ───
  listByCategory: authedQuery.input(z.object({
    category: z.string(),
    year: z.number().optional(),
    month: z.number().optional(),
    accountId: z.number().optional(),
  })).query(async ({ input, ctx }) => {
    if (!ctx.user) return [];
    const db = getDb();
    const { category, year, month, accountId } = input;

    // Build date range if year/month provided
    let startStr: string | null = null;
    let endStr: string | null = null;
    if (year && month) {
      // Specific month
      startStr = `${year}-${String(month).padStart(2, "0")}-01`;
      const endDay = new Date(year, month, 0).getDate();
      endStr = `${year}-${String(month).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;
    } else if (year && !month) {
      // Full year (Jan 1 - Dec 31) — for "Resumen del Ano"
      startStr = `${year}-01-01`;
      endStr = `${year}-12-31`;
    }

    // Try DB first
    const conditions = [
      eq(bankTransactions.userId, ctx.user.id),
      eq(bankTransactions.category, category as any),
    ];
    if (accountId) {
      conditions.push(eq(bankTransactions.bankAccountId, accountId));
    }
    if (startStr && endStr) {
      conditions.push(sql`${bankTransactions.transactionDate} BETWEEN ${startStr} AND ${endStr}`);
    }

    let txs = await db.select().from(bankTransactions)
      .where(and(...conditions))
      .orderBy(desc(bankTransactions.transactionDate));

    // If no DB results, fetch from Plaid: every connected bank (or the selected account's bank)
    if (txs.length === 0 && startStr && endStr) {
      try {
        const userId = ctx.user.id;
        const from = startStr, to = endStr;
        const userAccounts: BankAccount[] = await db.select().from(bankAccounts).where(eq(bankAccounts.userId, userId));
        // Each bank once (connectionsOf); an older duplicate of an account has only what was saved for it.
        const { items: connections, shadowed } = await connectionsOf(db, userId, userAccounts);
        const items = accountId && shadowed.has(accountId) ? []
          : connections.filter((i) => !accountId || i.accounts.some((a) => String(a.id) === String(accountId)));

        // Build account map for correct bankAccountId
        const plaidToDbAccount2 = new Map<string, BankAccount>();
        for (const ua of userAccounts) { if (ua.plaidAccountId) plaidToDbAccount2.set(ua.plaidAccountId, ua); }

        const client = items.length > 0 ? await initPlaid() : null;
        if (client) {
          const fetched = await forEachItem(db, userId, items, (item) => fetchItemTransactions(client, item.token, from, to, 4));
          const fetchedTxs = fetched.filter(answered).flatMap((r) => r.value.map((pt) => ({ pt, item: r.item })));
          await rememberMerchantLogos(db, fetchedTxs.map((p) => p.pt));
          const accountOf = (pt: Transaction, item: PlaidItem) => plaidToDbAccount2.get(pt.account_id) || item.accounts[0];
          const plaidTxs = fetchedTxs.filter(({ pt, item }) => !shadowed.has(accountOf(pt, item).id));
          // Already saved by an older connection of the same bank (another Plaid id): that saved row is the one that counts.
          const twinSaved = await savedByOlderTwin(db, userId, shadowed, plaidTxs.map(({ pt, item }) => ({ tx: pt, accountId: accountOf(pt, item).id })));

          // This category only (and the selected account), deduplicated by transaction_id, each under its own account
          const seenIds2 = new Set<string>();
          const found = [];
          for (const { pt, item } of plaidTxs) {
            if (seenIds2.has(pt.transaction_id) || twinSaved.has(pt.transaction_id)) continue;
            const plaidAmount = pt.amount;
            const determined = determineTypeAndCategory(plaidAmount, plaidCategoriesOf(pt), pt.name);
            if (determined.category !== category) continue;
            const targetAcc = accountOf(pt, item);
            if (accountId && String(targetAcc.id) !== String(accountId)) continue;
            seenIds2.add(pt.transaction_id);
            // What's saved (the id column is the database's own: never the Plaid id).
            const row = {
              userId,
              bankAccountId: targetAcc.id,  // ← CORRECT bankAccountId
              bankName: targetAcc.bankName,
              accountNumber: targetAcc.accountNumber,
              transactionDate: pt.date ? new Date(pt.date) : new Date(),
              transactionTime: null,
              description: pt.name,
              amount: String(Math.abs(plaidAmount).toFixed(2)),
              type: determined.type,
              category: determined.category,
              subcategory: pt.personal_finance_category?.detailed || pt.category?.[1] || null,
              reference: pt.transaction_id,
              plaidAmount: String(plaidAmount.toFixed(2)),
              plaidTransactionId: pt.transaction_id,
              plaidCategory: pt.personal_finance_category ? JSON.stringify(pt.personal_finance_category) : null,
              merchantName: (plaidMerchantNameOf(pt) || pt.name || "").slice(0, 255),
              isDuplicate: false,
              lastSyncedAt: new Date(),
              isReconciled: false,
              importedFrom: "plaid",
            };
            // Save to DB with correct bankAccountId (best effort; a saved row keeps its review and category, and
            // only this user's row is ever updated). The day is saved as noon UTC.
            try {
              await db.insert(bankTransactions).values({ ...row, transactionDate: plaidDay(pt.date) }).onDuplicateKeyUpdate({ set: ownRowUpdate(userId, targetAcc) });
            } catch { /* ignore */ }
            // Until it's matched with its saved row below, the Plaid id stands in as the row's id.
            found.push({ ...row, id: pt.transaction_id as string | number, logoUrl: directLogoOf(pt), createdAt: new Date() });
          }

          if (found.length > 0) {
            // Saved rows get their real (numeric) id here. A movement the owner reviewed keeps their category
            // (api/lib/bankReview.ts): if they moved it to another category, it no longer belongs in this list.
            txs = applyStoredReviews(found, await storedReviewsFor(db, userId, found.map((t) => t.plaidTransactionId)))
              .filter((t: { category: string }) => t.category === category);
          }
        }
      } catch { /* ignore Plaid errors */ }
    }

    // Mark reversed transactions (in memory only)
    const reversedIds2 = detectReversedTransactions(txs);
    for (const tx of txs) {
      if (reversedIds2.has(tx.id) || reversedIds2.has(tx.plaidTransactionId)) {
        (tx as any).isReversed = true;
      }
    }

    // Each movement's original merchant logo (`logoUrl`, null when there's none).
    return withMerchantLogos(db, txs);
  }),

  // ─── GET YEAR DATA (annual summary for selected account) ───
  getYearData: authedQuery.input(z.object({ year: z.number(), accountId: z.number().optional() })).query(async ({ input, ctx }) => {
    if (!ctx.user) return { income: "0", expense: "0", transactionCount: 0 };
    if (!await hasActiveBank(ctx.user.id)) return { income: "0", expense: "0", transactionCount: 0 };
    const db = getDb();
    const { year, accountId } = input;
    const startStr = `${year}-01-01`;
    const endStr = `${year}-12-31`;

    // Try with account filter first
    let conditions: any[] = [
      eq(bankTransactions.userId, ctx.user.id),
      sql`DATE(${bankTransactions.transactionDate}) >= ${startStr}`,
      sql`DATE(${bankTransactions.transactionDate}) <= ${endStr}`,
    ];
    if (accountId) {
      conditions.push(eq(bankTransactions.bankAccountId, accountId));
    }

    let txs = await db.select().from(bankTransactions)
      .where(and(...conditions));

    // Fallback: if no results with account filter, get ALL user transactions for the year
    if (txs.length === 0 && accountId) {
      txs = await db.select().from(bankTransactions)
        .where(and(
          eq(bankTransactions.userId, ctx.user.id),
          sql`DATE(${bankTransactions.transactionDate}) >= ${startStr}`,
          sql`DATE(${bankTransactions.transactionDate}) <= ${endStr}`,
        ));
    }

    let inc = 0, exp = 0;
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const monthly: { month: string; monthNum: number; income: string; expense: string; transactionCount: number }[] = [];

    for (const t of txs) {
      const amt = parseFloat(t.amount ?? "0");
      if (amt <= 0) continue;
      const plaidAmt = t.plaidAmount != null ? parseFloat(t.plaidAmount) : null;
      if (plaidAmt !== null) {
        if (plaidAmt < 0) inc += amt;
        else exp += amt;
      } else {
        if (t.type === "income") inc += amt;
        else exp += amt;
      }
    }

    // Monthly breakdown
    for (let m = 1; m <= 12; m++) {
      const monthTxs = txs.filter((t: any) => {
        const d = new Date(t.transactionDate);
        return d.getMonth() + 1 === m;
      });
      let mInc = 0, mExp = 0;
      monthTxs.forEach((t: any) => {
        const amt = parseFloat(t.amount ?? "0");
        if (amt <= 0) return;
        const plaidAmt = t.plaidAmount != null ? parseFloat(t.plaidAmount) : null;
        if (plaidAmt !== null) {
          if (plaidAmt < 0) mInc += amt;
          else mExp += amt;
        } else {
          if (t.type === "income") mInc += amt;
          else mExp += amt;
        }
      });
      monthly.push({
        month: monthNames[m - 1],
        monthNum: m,
        income: mInc.toFixed(2),
        expense: mExp.toFixed(2),
        transactionCount: monthTxs.length,
      });
    }

    return {
      income: inc.toFixed(2),
      expense: exp.toFixed(2),
      transactionCount: txs.length,
      monthly,
    };
  }),

  // ─── ACCOUNTING AGENT: YEARLY TRENDS ───
  getYearTrends: authedQuery.input(z.object({ year: z.number(), accountId: z.number().optional() })).query(async ({ input, ctx }) => {
    if (!ctx.user) return { monthly: [], topIncome: [], topExpense: [], avgIncome: "0", avgExpense: "0", growthRate: 0 };
    if (!await hasActiveBank(ctx.user.id)) return { monthly: [], topIncome: [], topExpense: [], avgIncome: "0", avgExpense: "0", growthRate: 0 };
    const db = getDb();
    const { year, accountId } = input;
    const startStr = `${year}-01-01`;
    const endStr = `${year}-12-31`;

    const conditions = [
      eq(bankTransactions.userId, ctx.user.id),
      sql`DATE(${bankTransactions.transactionDate}) >= ${startStr}`,
      sql`DATE(${bankTransactions.transactionDate}) <= ${endStr}`,
    ];
    if (accountId) conditions.push(eq(bankTransactions.bankAccountId, accountId));

    const txs = await db.select().from(bankTransactions).where(and(...conditions));

    // Monthly aggregation
    const monthly: any[] = [];
    const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    for (let m = 1; m <= 12; m++) {
      const monthTxs = txs.filter((t: any) => {
        const d = new Date(t.transactionDate);
        return d.getMonth() + 1 === m;
      });
      let inc = 0, exp = 0;
      monthTxs.forEach((t: any) => {
        const amt = parseFloat(t.amount ?? "0");
        if (amt <= 0) return;
        const plaidAmt = t.plaidAmount != null ? parseFloat(t.plaidAmount) : null;
        if (plaidAmt !== null) {
          if (plaidAmt < 0) inc += amt; else exp += amt;
        } else {
          if (t.type === "income") inc += amt; else exp += amt;
        }
      });
      monthly.push({ month: monthNames[m - 1], monthNum: m, income: inc.toFixed(2), expense: exp.toFixed(2), net: (inc - exp).toFixed(2), count: monthTxs.length });
    }

    // Top income categories
    const incomeMap = new Map<string, number>();
    const expenseMap = new Map<string, number>();
    txs.forEach((t: any) => {
      const amt = parseFloat(t.amount ?? "0");
      if (amt <= 0) return;
      const plaidAmt = t.plaidAmount != null ? parseFloat(t.plaidAmount) : null;
      const isIncome = plaidAmt !== null ? plaidAmt < 0 : t.type === "income";
      const map = isIncome ? incomeMap : expenseMap;
      const key = t.category || "other";
      map.set(key, (map.get(key) || 0) + amt);
    });

    const topIncome = Array.from(incomeMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([cat, total]) => ({ category: cat, total: total.toFixed(2) }));
    const topExpense = Array.from(expenseMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([cat, total]) => ({ category: cat, total: total.toFixed(2) }));

    // Averages (non-zero months only)
    const nonZeroIncome = monthly.filter((m: any) => parseFloat(m.income) > 0);
    const nonZeroExpense = monthly.filter((m: any) => parseFloat(m.expense) > 0);
    const avgIncome = nonZeroIncome.length > 0 ? (nonZeroIncome.reduce((s: number, m: any) => s + parseFloat(m.income), 0) / nonZeroIncome.length).toFixed(2) : "0";
    const avgExpense = nonZeroExpense.length > 0 ? (nonZeroExpense.reduce((s: number, m: any) => s + parseFloat(m.expense), 0) / nonZeroExpense.length).toFixed(2) : "0";

    // Growth rate: compare first half vs second half
    const firstHalf = monthly.slice(0, 6).reduce((s: number, m: any) => s + parseFloat(m.net), 0);
    const secondHalf = monthly.slice(6, 12).reduce((s: number, m: any) => s + parseFloat(m.net), 0);
    const growthRate = firstHalf !== 0 ? ((secondHalf - firstHalf) / Math.abs(firstHalf) * 100).toFixed(1) : "0";

    return { monthly, topIncome, topExpense, avgIncome, avgExpense, growthRate: Number(growthRate) };
  }),

  // ─── ACCOUNTING AGENT: ANOMALY DETECTION ───
  getAnomalies: authedQuery.input(z.object({ year: z.number(), accountId: z.number().optional() })).query(async ({ input, ctx }) => {
    if (!ctx.user) return { anomalies: [] };
    if (!await hasActiveBank(ctx.user.id)) return { anomalies: [] };
    const db = getDb();
    const { year, accountId } = input;
    const startStr = `${year}-01-01`;
    const endStr = `${year}-12-31`;

    const conditions = [
      eq(bankTransactions.userId, ctx.user.id),
      sql`DATE(${bankTransactions.transactionDate}) >= ${startStr}`,
      sql`DATE(${bankTransactions.transactionDate}) <= ${endStr}`,
    ];
    if (accountId) conditions.push(eq(bankTransactions.bankAccountId, accountId));

    const txs = await db.select().from(bankTransactions).where(and(...conditions));

    const anomalies: any[] = [];

    // 1. Unusually large expenses (2x average expense)
    const expenses = txs.filter((t: any) => {
      const plaidAmt = t.plaidAmount != null ? parseFloat(t.plaidAmount) : null;
      return plaidAmt !== null ? plaidAmt > 0 : t.type === "expense";
    }).map((t: any) => parseFloat(t.amount ?? "0"));
    if (expenses.length > 0) {
      const avg = expenses.reduce((a: number, b: number) => a + b, 0) / expenses.length;
      txs.forEach((t: any) => {
        const amt = parseFloat(t.amount ?? "0");
        const plaidAmt = t.plaidAmount != null ? parseFloat(t.plaidAmount) : null;
        if (plaidAmt !== null ? plaidAmt > 0 : t.type === "expense") {
          if (amt > avg * 2 && amt > 50) {
            anomalies.push({ type: "large_expense", severity: amt > avg * 4 ? "high" : "medium", description: `Gasto de ${formatCurrencyVal(amt)} es ${(amt / avg).toFixed(1)}x el promedio`, transaction: t });
          }
        }
      });
    }

    // 2. Duplicate transactions (same merchant, same amount, same day)
    const dupMap = new Map<string, number>();
    txs.forEach((t: any) => {
      const key = `${t.merchantName || t.description}-${t.amount}-${t.transactionDate}`;
      dupMap.set(key, (dupMap.get(key) || 0) + 1);
    });
    dupMap.forEach((count, key) => {
      if (count > 1) {
        const [merchant] = key.split("-");
        anomalies.push({ type: "duplicate", severity: "medium", description: `${count} transacciones duplicadas de "${merchant}"`, merchant });
      }
    });

    // 3. Unusual merchant (first time seeing this merchant this year)
    const merchantCounts = new Map<string, number>();
    txs.forEach((t: any) => {
      const m = t.merchantName || t.description;
      if (m) merchantCounts.set(m, (merchantCounts.get(m) || 0) + 1);
    });
    merchantCounts.forEach((count, merchant) => {
      if (count === 1 && merchant.length > 3) {
        anomalies.push({ type: "new_merchant", severity: "low", description: `Primer pago a "${merchant}" este año`, merchant });
      }
    });

    return { anomalies: anomalies.slice(0, 20) };
  }),

  // ─── LIVE BALANCE ───
  getLiveBalance: authedQuery.input(z.object({ accountId: z.number().optional() }).optional()).query(async ({ input, ctx }): Promise<{ balance: string; liveBalance: string; bookBalance: string; bankName?: string; accountCount: number }> => {
    if (!ctx.user) return { balance: "0", liveBalance: "0", bookBalance: "0", accountCount: 0 };
    const db = getDb();
    const userId = ctx.user.id;

    // Get user accounts
    const userAccounts: BankAccount[] = await db.select().from(bankAccounts).where(eq(bankAccounts.userId, userId));
    if (userAccounts.length === 0) return { balance: "0", liveBalance: "0", bookBalance: "0", accountCount: 0 };

    const accountId = input?.accountId;
    const targetAcc = accountId ? userAccounts.find((a) => Number(a.id) === Number(accountId)) : undefined;
    // Each bank once (connectionsOf): an older duplicate of an account isn't asked for, nor counted twice.
    const { items: connections, shadowed } = await connectionsOf(db, userId, userAccounts);
    // The selected account's balance, or the money in every account (cards and loans are what's owed, not money).
    const resultWith = (fresh: Map<string, string>) => {
      const pick = (a: BankAccount) => (a.plaidAccountId ? fresh.get(a.plaidAccountId) : undefined) ?? a.currentBalance ?? "0";
      return accountId ? (targetAcc ? pick(targetAcc) : "0") : moneyTotal(userAccounts, pick, shadowed);
    };
    const answer = (bal: string) => ({ balance: bal, liveBalance: bal, bookBalance: bal, bankName: userAccounts[0]?.bankName ?? "Banco", accountCount: userAccounts.length });

    // The banks to ask: the selected account's bank, or every connected bank. An older duplicate: its saved balance.
    const items = targetAcc && shadowed.has(targetAcc.id) ? []
      : connections.filter((i) => !accountId || i.accounts.some((a) => Number(a.id) === Number(accountId)));
    // No Plaid token — return DB balance
    if (items.length === 0) return answer(resultWith(new Map()));

    // Fetch REAL balances from Plaid, bank by bank (a bank that fails keeps its saved balance)
    try {
      const client = await initPlaid();
      if (!client) throw new Error("Plaid not initialized");

      const outcomes = await forEachItem(db, userId, items, (item) => client.accountsGet({ access_token: item.token }) as Promise<{ data: AccountsGetResponse }>);
      if (!outcomes.some((r) => r.ok)) throw new Error("No bank answered");
      // Banks whose saved balance came from the bank itself after Plaid's copy keep it (liveBalance.ts)
      const held = await heldBanks(db, userId);
      const freshBalances = freshBalancesOf(outcomes.filter((r) => !held.has(r.item.key)));

      console.log(`[getLiveBalance] Plaid returned ${freshBalances.size} balances from ${outcomes.filter((r) => r.ok).length} of ${items.length} bank(s)`);

      // Update DB with fresh balances
      for (const dbAccount of userAccounts) {
        if (!dbAccount.plaidAccountId || shadowed.has(dbAccount.id)) continue;
        const freshBal = freshBalances.get(dbAccount.plaidAccountId);
        if (freshBal != null) {
          await db.update(bankAccounts).set({ currentBalance: freshBal, lastSyncedAt: new Date(), updatedAt: new Date() }).where(eq(bankAccounts.id, dbAccount.id));
        }
      }
      for (const r of outcomes) if (r.ok) await repairAccountNames(db, userId, userAccounts, r.value.data.accounts || []);

      // Calculate result
      const resultBalance = resultWith(freshBalances);
      console.log(`[getLiveBalance] Returning balance: ${resultBalance}`);
      return answer(resultBalance);
    } catch (plaidErr: unknown) {
      console.error("[getLiveBalance] Plaid error:", plaidErr instanceof Error ? plaidErr.message : plaidErr);
      // Return DB balance as fallback
      return answer(resultWith(new Map()));
    }
  }),

  // ─── REFRESH ALL BALANCES + DISCOVER NEW ACCOUNTS (every connected bank) ───
  // Opening Inicio or Banco, or pulling to refresh: the balance from the bank itself when it's switched on
  // (once per bank every 15 minutes, api/lib/liveBalance.ts), else Plaid's copy. `pulled` (opening Inicio/Banco or a pull,
  // owner 2026-11-27): also asks Plaid to go
  // to the bank for new movements (Transactions Refresh, once per bank per hour; they arrive by webhook).
  refreshAllBalances: authedQuery.input(z.object({ pulled: z.boolean().optional() }).optional()).mutation(async ({ ctx, input }) => {
    if (!ctx.user) return { success: false, error: "No autenticado" };
    if (!await hasActiveBank(ctx.user.id)) return { success: false, error: "No hay cuenta bancaria conectada" };
    const db = getDb();
    const userId = ctx.user.id;
    try {
      const userAccounts: BankAccount[] = await db.select().from(bankAccounts).where(eq(bankAccounts.userId, userId));
      if (userAccounts.length === 0) return { success: true, updated: 0, added: 0, message: "No hay cuentas" };

      // Each bank once (connectionsOf): an older duplicate connection of the same bank isn't asked.
      const { items, shadowed } = await connectionsOf(db, userId, userAccounts);
      if (items.length === 0) return { success: true, updated: 0, added: 0, message: "Sin token de Plaid" };

      const client = await initPlaid();
      if (!client) return { success: false, error: "Plaid no disponible" };

      // Map existing accounts by plaidAccountId
      const accountMap = new Map<string, BankAccount>();
      for (const acc of userAccounts) {
        if (acc.plaidAccountId) accountMap.set(acc.plaidAccountId, acc);
      }

      // Get ALL accounts from Plaid (including new ones), from every bank: from the bank itself when allowed
      const outcomes = await forEachItem(db, userId, items, (item) =>
        balancesNow(db, client as LiveClient, userId, item.key, item.token, () => client.accountsGet({ access_token: item.token }) as Promise<{ data: AccountsGetResponse }>));
      // Then (opening or a pull) ask Plaid to go to the bank for new movements: answers at once, they come by
      // webhook. After the balances on purpose, so the balance never waits behind it or races its update.
      if (input?.pulled) void askBanksNow(db, client as LiveClient, userId, items).catch(() => 0);
      // Plaid's copy never goes over a balance that came from the bank itself after it
      const held = await heldBanks(db, userId);
      const failedItems = outcomes.filter((r) => !r.ok).map((r) => r.item.key);
      const firstFailure = outcomes.find((r) => !r.ok);
      if (failedItems.length === items.length && firstFailure && !firstFailure.ok) {
        return { success: false, error: (firstFailure.error instanceof Error && firstFailure.error.message) || "Error actualizando balances", failedItems };
      }

      let updated = 0;
      let added = 0;
      let total = 0;

      for (const r of outcomes) {
        if (!r.ok) continue;
        const plaidAccounts = r.value.data.accounts || [];
        total += plaidAccounts.length;
        // Names saved broken earlier ("Way2Save�� Savings") are fixed here too, on the account and its movements.
        await repairAccountNames(db, userId, userAccounts, plaidAccounts);

        for (const plaidAcc of plaidAccounts) {
          const dbAccount = accountMap.get(plaidAcc.account_id);
          const bal = plaidBalance(plaidAcc);
          if (dbAccount && shadowed.has(dbAccount.id)) continue; // the newest connection has this account

          if (dbAccount) {
            // Update existing account balance
            if (bal != null) {
              const keepSaved = !r.value.live && held.has(r.item.key);
              await db.update(bankAccounts).set({
                ...(keepSaved ? {} : { currentBalance: bal }),
                bankName: cleanAccountName(plaidAcc.name, plaidAcc.official_name), // Also update name in case it changed
                accountType: plaidAcc.type || dbAccount.accountType,
                lastSyncedAt: new Date(),
                updatedAt: new Date(),
              }).where(eq(bankAccounts.id, dbAccount.id));
              updated++;
            }
          } else {
            // NEW ACCOUNT — insert it, under the bank (item) it came from
            await db.insert(bankAccounts).values({
              userId,
              plaidAccountId: plaidAcc.account_id,
              plaidAccessToken: r.item.token,
              plaidItemId: r.item.itemId,
              bankName: cleanAccountName(plaidAcc.name, plaidAcc.official_name),
              accountType: plaidAcc.type || "",
              accountNumber: plaidAcc.mask || "",
              currency: plaidAcc.balances?.iso_currency_code || "USD",
              currentBalance: bal ?? "0",
              isActive: true,
              lastSyncedAt: new Date(),
            });
            added++;
          }
        }
      }

      return {
        success: true,
        updated,
        added,
        total,
        message: added > 0 ? `${updated} actualizadas, ${added} nuevas cuentas` : `${updated} balances actualizados`,
        failedItems,
      };
    } catch (err: unknown) {
      return { success: false, error: (err instanceof Error && err.message) || "Error actualizando balances" };
    }
  }),

  // ─── GET ALL ACCOUNTS DIRECTLY FROM PLAID (every connected bank) ───
  getAllPlaidAccounts: authedQuery.query(async ({ ctx }) => {
    if (!ctx.user) return { accounts: [], count: 0 };
    if (!await hasActiveBank(ctx.user.id)) return { accounts: [], count: 0 };
    const db = getDb();
    const userId = ctx.user.id;
    try {
      const userAccounts: BankAccount[] = await db.select().from(bankAccounts).where(eq(bankAccounts.userId, userId));
      if (userAccounts.length === 0) return { accounts: [], count: 0 };

      // Each bank once (connectionsOf): an older duplicate of an account isn't listed twice.
      const { items, shadowed } = await connectionsOf(db, userId, userAccounts);
      if (items.length === 0) return { accounts: [], count: 0 };

      const client = await initPlaid();
      if (!client) return { accounts: [], count: 0 };

      const outcomes = await forEachItem(db, userId, items, (item) => client.accountsGet({ access_token: item.token }) as Promise<{ data: AccountsGetResponse }>);
      const firstFailure = outcomes.find((r) => !r.ok);
      if (!outcomes.some((r) => r.ok)) {
        return { accounts: [], count: 0, error: (firstFailure && !firstFailure.ok && firstFailure.error instanceof Error && firstFailure.error.message) || "Plaid error" };
      }

      // Map DB accounts by plaidAccountId for balance lookup
      const dbMap = new Map<string, BankAccount>();
      for (const acc of userAccounts) {
        if (acc.plaidAccountId) dbMap.set(acc.plaidAccountId, acc);
      }

      type PlaidAccountRow = { id: number; plaidAccountId: string; bankName: string; accountType: string; accountNumber: string; currentBalance: string; currency: string; isInDb: boolean };
      const accounts = outcomes.flatMap((r): PlaidAccountRow[] => (r.ok
        ? (r.value.data.accounts || []).filter((pa) => { const d = dbMap.get(pa.account_id); return !d || !shadowed.has(d.id); }).map((pa) => {
          const dbAcc = dbMap.get(pa.account_id);
          return {
            id: dbAcc?.id || 0,
            plaidAccountId: pa.account_id,
            bankName: cleanAccountName(pa.name, pa.official_name),
            accountType: pa.type || "",
            accountNumber: pa.mask || "",
            currentBalance: plaidBalance(pa) ?? "0",
            currency: pa.balances?.iso_currency_code || "USD",
            isInDb: !!dbAcc,
          };
        })
        // A bank Plaid can't read right now: its saved accounts, so the bank doesn't vanish from the list.
        : r.item.accounts.filter((a) => !shadowed.has(a.id)).map((a) => ({
          id: a.id,
          plaidAccountId: a.plaidAccountId ?? "",
          bankName: a.bankName,
          accountType: a.accountType || "",
          accountNumber: a.accountNumber || "",
          currentBalance: a.currentBalance ?? "0",
          currency: "USD",
          isInDb: true,
        }))));

      return { accounts, count: accounts.length };
    } catch (err: unknown) {
      return { accounts: [], count: 0, error: err instanceof Error ? err.message : String(err) };
    }
  }),

  // ─── SUBSCRIPTIONS (Elite Rewrite) ───
  getSubscriptions: authedQuery.input(z.object({ accountId: z.number().optional() }).optional()).query(async ({ input, ctx }) => {
    if (!ctx.user) return { subscriptions: [], totalMonthly: "0", membershipMonthly: "0", paymentMonthly: "0", creditCardMonthly: "0", cancelledCount: 0, totalTransactions: 0, totalMerchants: 0 };
    // Guard: no active bank = no data
    if (!await hasActiveBank(ctx.user.id)) return { subscriptions: [], totalMonthly: "0", membershipMonthly: "0", paymentMonthly: "0", creditCardMonthly: "0", cancelledCount: 0, totalTransactions: 0, totalMerchants: 0 };
    const userId = ctx.user.id;
    const db = getDb();
    try {
      const lookback = new Date();
      lookback.setMonth(lookback.getMonth() - 12);
      const startStr = lookback.toISOString().split("T")[0];

      // Build query: filter by account if specified, otherwise all user transactions
      let allTxs: any[];
      if (input?.accountId) {
        allTxs = await db.select().from(bankTransactions)
          .where(and(eq(bankTransactions.userId, userId), eq(bankTransactions.bankAccountId, input.accountId), sql`DATE(${bankTransactions.transactionDate}) >= ${startStr}`))
          .orderBy(desc(bankTransactions.transactionDate));
      } else {
        allTxs = await db.select().from(bankTransactions)
          .where(and(eq(bankTransactions.userId, userId), sql`DATE(${bankTransactions.transactionDate}) >= ${startStr}`))
          .orderBy(desc(bankTransactions.transactionDate));
      }

      if (allTxs.length === 0) return { subscriptions: [], totalMonthly: "0", membershipMonthly: "0", paymentMonthly: "0", creditCardMonthly: "0", cancelledCount: 0, totalTransactions: 0, totalMerchants: 0 };

      // Group by normalized merchant name
      const groups = new Map<string, typeof allTxs>();
      for (const tx of allTxs) {
        const key = normalizeMerchantName(tx.description || "");
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(tx);
      }

      const subs: any[] = [];
      for (const [name, txs] of groups) {
        const desc = (txs[0]?.description || "").toLowerCase();
        const avgAmount = txs.reduce((s, tx) => s + Number(tx.amount), 0) / txs.length;

        // EXCLUDE: one-time purchases, transfers, names, etc.
        const isExcluded = EXCLUDED_PATTERNS.some(p => hasWord(name, p) || hasWord(desc, p));
        if (isExcluded) continue;

        // Must appear 2+ times (recurring) OR match a known keyword
        const isMembership = checkKeywords(MEMBERSHIP_KEYWORDS, name, desc);
        const isCreditCard = checkKeywords(CREDIT_CARD_KEYWORDS, name, desc);
        const isPayment = checkKeywords(PAYMENT_KEYWORDS, name, desc);
        const isPlaidSub = txs.some(tx => tx.category === "subscription");

        // RECURRING: 2+ transactions with consistent amounts ($3-$2000)
        const isRecurring = txs.length >= 2 && avgAmount >= 3 && avgAmount <= 2000;

        // INCLUDE if: has keyword (membership/credit_card/payment) OR Plaid sub OR recurring
        if (isMembership || isCreditCard || isPayment || isPlaidSub || isRecurring) {
          const totalAmt = txs.reduce((s, tx) => s + Number(tx.amount), 0);
          const sortedTxs = [...txs].sort((a, b) => {
            const da = new Date(b.transactionDate || 0).getTime();
            const db = new Date(a.transactionDate || 0).getTime();
            return da - db;
          });
          const dates = sortedTxs.map(tx => {
            const d = tx.transactionDate;
            if (!d) return null;
            if (typeof d === "string") return d.split("T")[0];
            if (d instanceof Date) return d.toISOString().split("T")[0];
            return String(d).split("T")[0];
          }).filter(Boolean) as string[];

          // Classify
          let subType = "monthly_payment";
          if (isCreditCard) subType = "credit_card";
          else if (isMembership) subType = "membership";
          else if (isPayment) subType = "monthly_payment";
          else if (isPlaidSub) subType = "membership";

          subs.push({
            name, description: txs[0]?.description || name,
            monthlyAmount: String((totalAmt / txs.length).toFixed(2)),
            totalAmount: String(totalAmt.toFixed(2)),
            count: txs.length, lastDate: txs[0]?.transactionDate || startStr,
            subType, dates,
            transactions: sortedTxs.map(tx => ({ description: tx.description, amount: tx.amount, date: tx.transactionDate })),
          });
        }
      }

      subs.sort((a, b) => parseFloat(b.monthlyAmount) - parseFloat(a.monthlyAmount));

      // Filter cancelled
      let cancelledNames: string[] = [];
      try {
        const rows = await db.select({ merchantName: userCancelledSubscriptions.merchantName })
          .from(userCancelledSubscriptions).where(eq(userCancelledSubscriptions.userId, userId));
        cancelledNames = rows.map((r: any) => r.merchantName.toLowerCase());
      } catch { /* ignore */ }

      const active = subs.filter(s => !cancelledNames.includes(s.name.toLowerCase()));
      const totalMonthly = active.reduce((s, sub) => s + parseFloat(sub.monthlyAmount), 0);
      const membershipMonthly = active.filter(s => s.subType === "membership").reduce((s, sub) => s + parseFloat(sub.monthlyAmount), 0);
      const paymentMonthly = active.filter(s => s.subType === "monthly_payment").reduce((s, sub) => s + parseFloat(sub.monthlyAmount), 0);
      const creditCardMonthly = active.filter(s => s.subType === "credit_card").reduce((s, sub) => s + parseFloat(sub.monthlyAmount), 0);

      return { subscriptions: active, totalMonthly: String(totalMonthly.toFixed(2)), membershipMonthly: String(membershipMonthly.toFixed(2)), paymentMonthly: String(paymentMonthly.toFixed(2)), creditCardMonthly: String(creditCardMonthly.toFixed(2)), cancelledCount: subs.length - active.length, totalTransactions: allTxs.length, totalMerchants: groups.size };
    } catch { return { subscriptions: [], totalMonthly: "0", membershipMonthly: "0", paymentMonthly: "0", creditCardMonthly: "0", cancelledCount: 0, totalTransactions: 0, totalMerchants: 0 }; }
  }),

  cancelSubscription: authedQuery.input(z.object({ merchantName: z.string(), monthlyAmount: z.string() })).mutation(async ({ input, ctx }) => {
    if (!ctx.user) return { success: false, error: "No autenticado" };
    const db = getDb();
    try {
      await db.insert(userCancelledSubscriptions).values({ userId: ctx.user.id, merchantName: input.merchantName, originalMonthlyAmount: input.monthlyAmount, status: "cancelled", cancelledAt: new Date() });
      return { success: true };
    } catch (err: any) { return { success: false, error: err.message }; }
  }),

  reactivateSubscription: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
    if (!ctx.user) return { success: false, error: "No autenticado" };
    const db = getDb();
    try {
      await db.update(userCancelledSubscriptions).set({ status: "active" }).where(and(eq(userCancelledSubscriptions.id, input.id), eq(userCancelledSubscriptions.userId, ctx.user.id)));
      return { success: true };
    } catch (err: any) { return { success: false, error: err.message }; }
  }),

  getCancelledSubscriptions: authedQuery.query(async ({ ctx }) => {
    if (!ctx.user) return { subscriptions: [] };
    const db = getDb();
    try {
      const rows = await db.select().from(userCancelledSubscriptions).where(eq(userCancelledSubscriptions.userId, ctx.user.id)).orderBy(desc(userCancelledSubscriptions.cancelledAt));
      return { subscriptions: rows };
    } catch { return { subscriptions: [] }; }
  }),

  // ─── Migration ───
  checkMigrationStatus: authedQuery.query(async ({ ctx }) => {
    if (!ctx.user) return { applied: false, tables: [], details: "No autenticado" };
    const db = getDb();
    try {
      const tables: string[] = [];
      const syncLogsExists = await db.execute(sql`SHOW TABLES LIKE 'syncLogs'`).then((r: any) => (r[0] as any[])?.length > 0);
      if (syncLogsExists) tables.push("syncLogs");
      const rulesExists = await db.execute(sql`SHOW TABLES LIKE 'smartCategoryRules'`).then((r: any) => (r[0] as any[])?.length > 0);
      if (rulesExists) tables.push("smartCategoryRules");
      const hasPlaidTxId = await db.execute(sql`SHOW COLUMNS FROM bankTransactions LIKE 'plaidTransactionId'`).then((r: any) => (r[0] as any[])?.length > 0);
      if (hasPlaidTxId) tables.push("bankTransactions.plaidTransactionId");
      const allApplied = syncLogsExists && rulesExists && hasPlaidTxId;
      return { applied: allApplied, tables, details: allApplied ? "Todo listo" : "Pendiente" };
    } catch (err: any) { return { applied: false, tables: [], details: `Error: ${err.message}` }; }
  }),

  // Schema change (DDL): admin only. It used to be callable by anyone without logging in.
  runMigration: adminQuery.mutation(async () => {
    const db = getDb();
    const results: string[] = [];
    const errors: string[] = [];

    try {
      // 1. syncLogs
      try {
        await db.execute(sql`CREATE TABLE IF NOT EXISTS syncLogs (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, userId BIGINT UNSIGNED NOT NULL, bankAccountId BIGINT UNSIGNED NULL, syncType ENUM('auto','manual','webhook','retry') DEFAULT 'manual' NOT NULL, status ENUM('started','success','partial','failed') NOT NULL, transactionsFound INT DEFAULT 0, transactionsAdded INT DEFAULT 0, transactionsUpdated INT DEFAULT 0, transactionsSkipped INT DEFAULT 0, duplicatesDetected INT DEFAULT 0, errors TEXT NULL, startedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL, completedAt TIMESTAMP NULL, durationMs INT NULL, INDEX syncLogs_userId_idx (userId), INDEX syncLogs_userId_startedAt_idx (userId, startedAt), INDEX syncLogs_status_idx (status)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
        results.push("syncLogs: OK");
      } catch (e: any) { errors.push(`syncLogs: ${e.message}`); }

      // 2. smartCategoryRules
      try {
        await db.execute(sql`CREATE TABLE IF NOT EXISTS smartCategoryRules (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, userId BIGINT UNSIGNED NOT NULL, merchantPattern VARCHAR(255) NOT NULL, category VARCHAR(100) NOT NULL, subcategory VARCHAR(100) NULL, confidence INT DEFAULT 100, source ENUM('user','auto','system') DEFAULT 'system' NOT NULL, usageCount INT DEFAULT 0, isActive TINYINT(1) DEFAULT 1, createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL, updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL, INDEX smartCatRules_userId_idx (userId), UNIQUE INDEX smartCatRules_user_pattern_idx (userId, merchantPattern)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
        results.push("smartCategoryRules: OK");
      } catch (e: any) { errors.push(`smartCategoryRules: ${e.message}`); }

      // 3. Columns
      const cols = [
        { name: "plaidTransactionId", def: "VARCHAR(255) NULL" },
        { name: "plaidCategory", def: "TEXT NULL" },
        { name: "merchantName", def: "VARCHAR(255) NULL" },
        { name: "isDuplicate", def: "TINYINT(1) DEFAULT 0" },
        { name: "syncStatus", def: "ENUM('pending','synced','error','retrying') DEFAULT 'synced'" },
        { name: "syncError", def: "TEXT NULL" },
        { name: "lastSyncedAt", def: "TIMESTAMP NULL" },
        { name: "journalEntryId", def: "BIGINT UNSIGNED NULL" },
      ];
      for (const col of cols) {
        try { await db.execute(sql.raw(`ALTER TABLE bankTransactions ADD COLUMN ${col.name} ${col.def}`)); results.push(`${col.name}: OK`); }
        catch (e: any) { if (e.message?.includes("Duplicate")) results.push(`${col.name}: ya existe`); else errors.push(`${col.name}: ${e.message}`); }
      }

      // 4. Backfill
      try { await db.execute(sql`UPDATE bankTransactions SET plaidTransactionId = reference WHERE plaidTransactionId IS NULL AND reference IS NOT NULL`); results.push("backfill plaidTxId: OK"); } catch (e: any) { errors.push(`backfill: ${e.message}`); }
      try { await db.execute(sql`UPDATE bankTransactions SET merchantName = description WHERE merchantName IS NULL AND description IS NOT NULL`); results.push("backfill merchantName: OK"); } catch (e: any) { errors.push(`backfill: ${e.message}`); }

      return { success: errors.length === 0, message: errors.length === 0 ? "OK" : "Parcial", results, errors: errors.length > 0 ? errors : undefined };
    } catch (err: any) { return { success: false, error: err.message, results, errors }; }
  }),

  // ─── AUTOMATIC AI CATEGORIZATION AGENT ───
  // Silently fixes miscategorized transactions — runs automatically on every page load
  autoFixCategories: authedQuery.mutation(async ({ ctx }) => {
    if (!ctx.user) return { fixed: 0, autoConfirmed: 0 };
    if (!await hasActiveBank(ctx.user.id)) return { fixed: 0, autoConfirmed: 0 };
    const db = getDb();
    try {
      await ensureAutoTable(db);
      // What the app confirmed by itself because it knew the bill by name (api/lib/autoConfirm.ts): a better rule
      // may still correct it. (What it confirmed by the person's own rule or history stays, like theirs.)
      const appConfirmed = () => sql`EXISTS (SELECT 1 FROM bankAutoConfirms a WHERE a.bankTransactionId = ${bankTransactions.id} AND a.reason IN ('card', 'bill', 'service', 'chain', 'income'))`;
      const txs = await db.select().from(bankTransactions)
        .where(and(
          eq(bankTransactions.userId, ctx.user.id),
          // Never a movement the owner reviewed: their category stays (api/review-router.ts).
          or(unreviewed(), appConfirmed()),
        ));

      // Movements inside a closed (reconciled) period keep their category (api/reconcile-router.ts).
      const locked = new Set(await closedPeriodIds(db, Number(ctx.user.id), txs.map((t: { id: number }) => Number(t.id))));
      let fixed = 0;
      for (const tx of txs) {
        if (locked.has(Number(tx.id))) continue;
        try {
          const desc = (tx.description || "").toLowerCase();
          const plaidAmt = tx.plaidAmount != null ? parseFloat(tx.plaidAmount) : null;
          const { type, category } = determineTypeAndCategory(
            plaidAmt ?? parseFloat(tx.amount) * (tx.type === "income" ? -1 : 1),
            // The saved Plaid category is JSON ({primary, detailed}); it used to go in as one string, so Plaid's
            // own category was ignored here and rent or a paycheck could flip to something else.
            tx.merchantName && tx.description && !trustedMerchantName(tx.merchantName, tx.description) ? [] : storedPlaidCategories(tx.plaidCategory),
            tx.description || ""
          );
          // Only update if category actually changed
          if (tx.category !== category) {
            // Re-checked here too, in case the owner reviewed it while this loop ran. One the app had confirmed goes
            // back to Por revisar: the app changed its mind, so the person decides.
            const wasApp = !!tx.isReconciled;
            const res = await db.update(bankTransactions)
              .set(wasApp ? { type, category, isReconciled: false } : { type, category })
              .where(and(eq(bankTransactions.id, tx.id), wasApp ? appConfirmed() : unreviewed()));
            if (wasApp && Number((res as unknown as Array<{ affectedRows?: number }>)[0]?.affectedRows ?? 0) > 0) await forgetAuto(db, Number(ctx.user.id), [Number(tx.id)]);
            fixed++;
          }
        } catch { /* skip on error */ }
      }
      // Then the app confirms what it's sure about, so Por revisar keeps only what needs the person.
      let autoConfirmed = 0;
      try { autoConfirmed = await autoConfirmPending(db, ctx); } catch (e: unknown) { console.error("[autoConfirm] failed:", e instanceof Error ? e.message : e); }
      return { fixed, autoConfirmed };
    } catch { return { fixed: 0, autoConfirmed: 0 }; }
  }),

  // ─── DEBUG: Raw Plaid data (every connected bank) ───
  debug: authedQuery.query(async ({ ctx }) => {
    if (!ctx.user) return { error: "No autenticado" };
    const db = getDb();
    const userAccounts: BankAccount[] = await db.select().from(bankAccounts).where(eq(bankAccounts.userId, ctx.user.id));
    if (userAccounts.length === 0) return { error: "No hay cuentas" };
    const { items, shadowed } = await connectionsOf(db, ctx.user.id, userAccounts);
    if (items.length === 0) return { error: "Sin token" };

    try {
      const client = await initPlaid();
      if (!client) return { error: "Plaid no inicializado" };

      // Raw recent transactions from Plaid: since the 1st of last month
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const startDate = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-01`;
      const endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

      // Raw accounts and movements, bank by bank (one failing bank is reported, the rest still shows)
      const banks = await Promise.all(items.map(async (item) => {
        try {
          const accountsRes = (await client.accountsGet({ access_token: item.token })) as { data: AccountsGetResponse };
          const txRes = (await client.transactionsGet({
            access_token: item.token,
            start_date: startDate,
            end_date: endDate,
            options: { count: 100, include_personal_finance_category: true },
          })) as { data: TransactionsGetResponse };
          return { item, ok: true as const, accounts: accountsRes.data.accounts || [], txs: txRes.data.transactions || [] };
        } catch (e: unknown) {
          return { item, ok: false as const, error: e };
        }
      }));
      const firstFailure = banks.find((b) => !b.ok);
      if (!banks.some((b) => b.ok) && firstFailure && !firstFailure.ok) {
        return { error: plaidMessageOf(firstFailure.error), code: plaidErrorCode(firstFailure.error) ?? undefined };
      }

      const plaidAccounts = banks.flatMap((b) => (b.ok ? b.accounts.map((a) => ({
        bank: b.item.key,
        account_id: a.account_id,
        name: a.name,
        mask: a.mask,
        type: a.type,
        subtype: a.subtype,
        balances: {
          available: a.balances?.available,
          current: a.balances?.current,
          iso_currency_code: a.balances?.iso_currency_code,
        },
      })) : []));
      const plaidTxs = banks.flatMap((b) => (b.ok ? b.txs.map((t) => ({
        bank: b.item.key,
        transaction_id: t.transaction_id,
        account_id: t.account_id,
        name: t.name,
        amount: t.amount,
        date: t.date,
        category: t.personal_finance_category?.primary || t.category?.[0],
      })) : []));

      return {
        dbAccounts: userAccounts.map((a) => ({ id: a.id, plaidAccountId: a.plaidAccountId, bankName: a.bankName, accountType: a.accountType, currentBalance: a.currentBalance })),
        banks: banks.map((b) => ({ bank: b.item.key, ok: b.ok, code: b.ok ? null : plaidErrorCode(b.error) })),
        // Accounts of an older duplicate connection of the same bank, and the newer account read instead.
        duplicateAccounts: [...shadowed.entries()].map(([older, newer]) => ({ older, newer })),
        plaidAccounts,
        plaidTxCount: plaidTxs.length,
        plaidTxs: plaidTxs.slice(0, 20),
        dateRange: { startDate, endDate },
      };
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : "Unknown error", code: plaidErrorCode(err) ?? undefined };
    }
  }),

  // ─── IMPORT BANK STATEMENT (CSV) ───
  importBankStatement: authedQuery
    .input(z.object({ csv: z.string(), accountId: z.number().optional(), format: z.enum(["wells_fargo", "auto"]).optional() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) return { success: false, error: "No autenticado", added: 0 };
      const userId = ctx.user.id;
      const db = getDb();
      const format = input.format ?? "auto";

      // Parse CSV
      const rows = parseCSV(input.csv);
      if (rows.length < 2) return { success: false, error: "CSV vacio o invalido", added: 0 };

      let txs: Array<{ date: string; amount: number; plaidAmount: number; description: string; balance?: number }> = [];
      if (format === "wells_fargo" || format === "auto") {
        txs = parseWellsFargoCSV(rows);
      }
      if (txs.length === 0) return { success: false, error: "No se encontraron transacciones en el CSV. Asegurate que sea un estado de cuenta de Wells Fargo.", added: 0 };

      // Get target account
      let targetAccountId: number | null = input.accountId ?? null;
      if (!targetAccountId) {
        const accs = await db.select().from(bankAccounts).where(eq(bankAccounts.userId, userId));
        if (accs.length > 0) targetAccountId = accs[0].id;
      }
      if (!targetAccountId) return { success: false, error: "No hay cuenta bancaria seleccionada", added: 0 };

      // Tenant check: the target account must belong to this user.
      const targetAcc = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, targetAccountId), eq(bankAccounts.userId, userId)));
      if (targetAcc.length === 0) return { success: false, error: "Cuenta bancaria no encontrada", added: 0 };
      const bankName = targetAcc[0]?.bankName ?? "Banco";
      const accountNumber = targetAcc[0]?.accountNumber ?? "";

      // Get existing transaction keys to avoid duplicates
      const existing = await db.select({ plaidTransactionId: bankTransactions.plaidTransactionId, reference: bankTransactions.reference, description: bankTransactions.description, amount: bankTransactions.amount, transactionDate: bankTransactions.transactionDate })
        .from(bankTransactions).where(eq(bankTransactions.userId, userId));
      const existingSet = new Set<string>();
      for (const e of existing) {
        const key = `${e.description}|${e.amount}|${e.transactionDate ? new Date(e.transactionDate).toISOString().split("T")[0] : ""}`;
        existingSet.add(key);
      }

      let added = 0;
      let skipped = 0;
      let latestBalance: number | undefined;

      for (const tx of txs) {
        const key = `${tx.description}|${String(tx.amount.toFixed(2))}|${tx.date}`;
        if (existingSet.has(key)) { skipped++; continue; }

        const { type, category } = determineTypeAndCategory(
          tx.plaidAmount,
          [],
          tx.description
        );

        try {
          await db.insert(bankTransactions).values({
            userId,
            bankAccountId: targetAccountId,
            bankName,
            accountNumber,
            transactionDate: new Date(tx.date),
            description: tx.description,
            amount: String(tx.amount.toFixed(2)),
            plaidAmount: String(tx.plaidAmount.toFixed(2)),
            type,
            category: category as any,
            syncStatus: "synced",
            lastSyncedAt: new Date(),
            reference: `csv-${tx.date}-${added}`,
            isReconciled: false,
            importedFrom: "csv",
          });
          added++;
          if (tx.balance != null) latestBalance = tx.balance;
        } catch (e: any) {
          console.error("[import] Insert error:", e.message);
        }
      }

      // Update account balance with latest from CSV
      if (latestBalance != null) {
        try {
          await db.update(bankAccounts).set({ currentBalance: String(latestBalance.toFixed(2)), lastSyncedAt: new Date(), updatedAt: new Date() }).where(and(eq(bankAccounts.id, targetAccountId), eq(bankAccounts.userId, userId)));
        } catch { /* ignore */ }
      }

      return { success: true, added, skipped, total: txs.length, latestBalance: latestBalance != null ? String(latestBalance.toFixed(2)) : null };
    }),

  // ─── DISCONNECT BANK ───
  /** Deletes one of the caller's bank movements and its journal entry. The bank may send it again on a later sync. */
  delete: authedQuery.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
    const db = getDb();
    const userId = ctx.user.id;
    // A movement inside a closed (reconciled) period can't be deleted until the owner reopens it.
    await assertNotReconciled(db, Number(userId), input.id, ctx.lang);
    const rows: Array<{ id: number; reference: string | null }> = await db.select({ id: bankTransactions.id, reference: bankTransactions.reference })
      .from(bankTransactions).where(and(eq(bankTransactions.id, input.id), eq(bankTransactions.userId, userId))).limit(1);
    const tx = rows[0];
    if (!tx) throw new TRPCError({ code: "NOT_FOUND", message: ctx.lang === "en" ? "Transaction not found" : "Movimiento no encontrado" });
    await db.transaction(async (t: typeof db) => {
      const entries: Array<{ id: number }> = await t.select({ id: journalEntries.id }).from(journalEntries).where(and(
        eq(journalEntries.createdBy, userId), eq(journalEntries.referenceType, "payment"), eq(journalEntries.referenceId, tx.id),
        eq(journalEntries.reference, tx.reference || `bank_${tx.id}`),
      ));
      for (const e of entries) {
        await t.delete(journalEntryLines).where(eq(journalEntryLines.journalEntryId, e.id));
        await t.delete(journalEntries).where(eq(journalEntries.id, e.id));
      }
      await t.delete(bankTransactions).where(and(eq(bankTransactions.id, tx.id), eq(bankTransactions.userId, userId)));
    });
    return { success: true };
  }),

  disconnect: authedQuery.mutation(async ({ ctx }) => {
    if (!ctx.user) return { success: false, error: "No autenticado" };
    const db = getDb();
    try {
      await db.delete(bankAccounts).where(eq(bankAccounts.userId, ctx.user.id));
      await db.delete(bankTransactions).where(eq(bankTransactions.userId, ctx.user.id));
      await forgetInstitutions(db, ctx.user.id);
      return { success: true, message: "Banco desconectado" };
    } catch (err: any) {
      return { success: false, error: err.message || "Error al desconectar" };
    }
  }),

  // ── DEBUG: Show transaction counts per account to diagnose missing transactions ──
  debugTransactions: authedQuery.query(async ({ ctx }) => {
    if (!ctx.user) return { error: "No auth" };
    const db = getDb();
    const userId = ctx.user.id;

    // Get all accounts
    const userAccounts = await db.select().from(bankAccounts).where(eq(bankAccounts.userId, userId));

    // Get transaction counts per account
    const txCounts = await db.select({
      bankAccountId: bankTransactions.bankAccountId,
      count: count(),
    }).from(bankTransactions)
      .where(eq(bankTransactions.userId, userId))
      .groupBy(bankTransactions.bankAccountId);

    // Get total transactions
    const allTxs = await db.select({
      id: bankTransactions.id,
      description: bankTransactions.description,
      amount: bankTransactions.amount,
      transactionDate: bankTransactions.transactionDate,
      bankAccountId: bankTransactions.bankAccountId,
      plaidTransactionId: bankTransactions.plaidTransactionId,
    }).from(bankTransactions)
      .where(eq(bankTransactions.userId, userId))
      .orderBy(desc(bankTransactions.transactionDate))
      .limit(20);

    return {
      accounts: userAccounts.map((a: BankAccount) => ({ id: a.id, name: a.bankName, plaidId: a.plaidAccountId?.slice(0,12) })),
      transactionCounts: txCounts,
      totalTransactions: txCounts.reduce((s: number, t: any) => s + (t.count || 0), 0),
      recentTransactions: allTxs,
    };
  }),

  // ── DEBUG: Raw Plaid balance data for this user ──
  debugBalance: authedQuery.query(async ({ ctx }) => {
    if (!ctx.user) return { error: "No auth" };
    const db = getDb();
    const userAccounts = await db.select().from(bankAccounts).where(eq(bankAccounts.userId, ctx.user.id));
    if (userAccounts.length === 0) return { error: "No accounts" };

    const results = [];
    for (const acc of userAccounts) {
      if (!acc.plaidAccessToken) { results.push({ account: acc.bankName, error: "No access token" }); continue; }
      try {
        const client = await initPlaid();
        if (!client) { results.push({ account: acc.bankName, error: "Plaid not initialized" }); continue; }
        const res = await client.accountsGet({ access_token: acc.plaidAccessToken });
        const plaidAccounts = (res.data.accounts || []).map((a: any) => ({
          name: a.name,
          account_id: a.account_id,
          mask: a.mask,
          type: a.type,
          subtype: a.subtype,
          balances: {
            available: a.balances.available,
            current: a.balances.current,
            limit: a.balances.limit,
            iso_currency_code: a.balances.iso_currency_code,
          },
        }));
        results.push({
          dbAccountId: acc.id,
          dbBankName: acc.bankName,
          dbPlaidAccountId: acc.plaidAccountId,
          dbBalance: acc.currentBalance,
          dbLastSync: acc.lastSyncedAt,
          plaidAccounts,
        });
      } catch (e: any) {
        results.push({ dbBankName: acc.bankName, error: e.message, code: e.code });
      }
    }
    return { results, plaidEnv: process.env.PLAID_ENV || "sandbox" };
  }),
});