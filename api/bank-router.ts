import { createRouter, publicQuery, authedQuery } from "./middleware";
import { z } from "zod";
import { getDb } from "./queries/connection";
import { bankAccounts, bankTransactions, accounts, journalEntries, journalEntryLines, userCancelledSubscriptions, syncLogs, smartCategoryRules } from "@db/schema";
import { eq, and, desc, sql, count } from "drizzle-orm";
import { readFileSync } from "fs";
import { join } from "path";

// ═══════════════════════════════════════════════════════════
// ELITE ACCOUNTING: bank-router.ts - Complete Rewrite
// ═══════════════════════════════════════════════════════════

let plaidClient: any = null;

// Detect if running in production (Railway or NODE_ENV=production)
const isProductionEnv = process.env.PLAID_ENV === "production"
  || process.env.NODE_ENV === "production"
  || !!process.env.RAILWAY_ENVIRONMENT
  || !!process.env.RAILWAY_SERVICE_NAME;

async function initPlaid() {
  if (plaidClient) return plaidClient;
  try {
    const { Configuration, PlaidApi, PlaidEnvironments } = await import("plaid");
    const env = isProductionEnv ? "production" : "sandbox";
    console.log(`[Plaid] Using ${env.toUpperCase()} environment (detected production: ${isProductionEnv})`);
    const config = new Configuration({
      basePath: PlaidEnvironments[env],
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
  "amazon": { category: "ecommerce", type: "expense" },
  "costco": { category: "wholesale", type: "expense" },
  "best buy": { category: "electronics", type: "expense" },
  "uber": { category: "rideshare", type: "expense" },
  "lyft": { category: "rideshare", type: "expense" },
  "doordash": { category: "food_delivery", type: "expense" },
  "grubhub": { category: "food_delivery", type: "expense" },
  "instacart": { category: "food_delivery", type: "expense" },
  "mcdonald": { category: "fast_food", type: "expense" },
  "starbucks": { category: "coffee", type: "expense" },
  "shell": { category: "gasolina", type: "expense" },
  "exxon": { category: "gasolina", type: "expense" },
  "chevron": { category: "gasolina", type: "expense" },
  "bp ": { category: "gasolina", type: "expense" },
  "speedway": { category: "gasolina", type: "expense" },
  "gas station": { category: "gasolina", type: "expense" },
};

function determineTypeAndCategory(plaidAmount: number, plaidCategories: string[], description: string): { type: "income" | "expense"; category: string } {
  const desc = description.toLowerCase();
  const absAmt = Math.abs(plaidAmount);

  // Check default rules first
  for (const [keyword, rule] of Object.entries(defaultCategoryRules)) {
    if (desc.includes(keyword)) return { type: rule.type as "income" | "expense", category: rule.category };
  }

  // Zelle detection
  const isZelleSent = desc.includes("zelle payment") || desc.includes("zelle money sent") || desc.includes("zelle pay") || desc.includes("zelle to") || (desc.includes("zelle") && !desc.includes("from"));
  const isZelleRecv = desc.includes("zelle from") || desc.includes("zelle money received") || desc.includes("zelle payment from") || desc.includes("zelle for");
  if (isZelleSent) return { type: "expense", category: "zelle_sent" };
  if (isZelleRecv) return { type: "income", category: "zelle_income" };

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
  if (detailed.includes("TRANSFER") || desc.includes("transfer") || desc.includes("zelle")) return { type: plaidAmount >= 0 ? "income" : "expense", category: "transfer" };

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

  // Rent
  if (detailed.includes("RENT") || desc.includes("rent")) return { type: "expense", category: "rent" };

  // Loan
  if (detailed.includes("LOAN") || desc.includes("loan") || desc.includes("mortgage")) return { type: "expense", category: "loan" };

  // Insurance
  if (detailed.includes("INSURANCE") || desc.includes("insurance") || desc.includes("geico")) return { type: "expense", category: "insurance" };

  // Utilities
  if (detailed.includes("UTILITIES") || desc.includes("electric") || desc.includes("water")) return { type: "expense", category: "utilities" };

  // Subscription
  if (detailed.includes("SUBSCRIPTION") || desc.includes("subscription") || desc.includes("netflix") || desc.includes("spotify")) return { type: "expense", category: "subscription" };

  // Food
  if (detailed.includes("FOOD") || desc.includes("food")) return { type: "expense", category: "food" };

  // Gas
  if (detailed.includes("GASOLINE") || desc.includes("gas ")) return { type: "expense", category: "gasolina" };

  // Medical
  if (detailed.includes("MEDICAL") || desc.includes("medical")) return { type: "expense", category: "medical" };

  // Default: In Plaid, positive amount = money LEAVING (expense), negative = money ENTERING (income)
  if (plaidAmount < 0) return { type: "income", category: "income" };
  return { type: "expense", category: "expense" };
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
  "netflix", "spotify", "disney", "hulu", "hbo", "paramount", "peacock",
  "prime video", "youtube premium", "youtube tv", "crunchyroll", "twitch",
  "starz", "showtime", "amc+",
  "apple music", "apple tv", "apple arcade", "icloud", "itunes",
  "planet fitness", "la fitness", "equinox", "crunch fitness", "ymca",
  "orange theory", "soulcycle", "peloton", "24 hour fitness", "gold gym",
  "adobe", "creative cloud", "photoshop", "premiere",
  "microsoft 365", "office 365",
  "google one", "google workspace",
  "dropbox", "notion", "slack", "zoom", "canva", "grammarly",
  "chatgpt", "openai", "midjourney", "claude",
  "nytimes", "new york times", "washington post", "wall street journal",
  "substack", "patreon", "medium", "kindle unlimited", "audible",
  "xbox", "playstation", "ps plus", "nintendo", "steam", "epic games",
  "tinder", "bumble", "hinge", "match.com",
  "calm", "headspace", "duolingo", "masterclass", "skillshare", "coursera",
  "hellofresh", "blue apron", "home chef",
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
// CREATE JOURNAL ENTRIES
// ═══════════════════════════════════════════════════════════

async function createJournalEntries(db: any, journalTxs: any[], userId: number) {
  const errors: string[] = [];
  for (const tx of journalTxs) {
    try {
      const jeRes = await db.insert(journalEntries).values({ userId, date: tx.date, memo: tx.description, source: "bank_sync" });
      const jeId = jeRes?.[0]?.insertId;
      if (!jeId) { errors.push(`No JE ID for ${tx.description}`); continue; }
      if (tx.type === "expense") {
        await db.insert(journalEntryLines).values([
          { journalEntryId: jeId, accountId: 1, debit: String(tx.amount.toFixed(2)), credit: "0" },
          { journalEntryId: jeId, accountId: 2, debit: "0", credit: String(tx.amount.toFixed(2)) },
        ]);
      } else {
        await db.insert(journalEntryLines).values([
          { journalEntryId: jeId, accountId: 2, debit: String(tx.amount.toFixed(2)), credit: "0" },
          { journalEntryId: jeId, accountId: 1, debit: "0", credit: String(tx.amount.toFixed(2)) },
        ]);
      }
    } catch (e: any) { errors.push(`${tx.description}: ${e.message}`); }
  }
  return { errors };
}

// ═══════════════════════════════════════════════════════════
// SYNC TRANSACTIONS
// ═══════════════════════════════════════════════════════════

// Timeout wrapper for promises
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)),
  ]);
}

async function doSyncTransactions(ctx: any, year?: number, month?: number, specificAccountId?: number, syncType: "manual" | "auto" | "webhook" | "retry" = "manual", days?: number) {
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
    const userAccounts = await withTimeout(
      db.select().from(bankAccounts).where(eq(bankAccounts.userId, userId)),
      5000, "Get accounts"
    );
    if (userAccounts.length === 0) return { success: false, error: "No hay cuentas conectadas" };
    console.log(`[SYNC] Found ${userAccounts.length} accounts`);

    const primaryAccount = userAccounts[0];
    if (!primaryAccount?.plaidAccessToken) return { success: false, error: "No hay token de acceso" };

    const accountMap = new Map<string, typeof userAccounts[0]>();
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

    // Step 3: Fetch ALL transactions from Plaid with pagination (20s timeout per page)
    // NOTE: Do NOT pass account_ids - let Plaid return all transactions for the token
    console.log(`[SYNC] Calling Plaid transactionsGet with pagination...`);
    let allTxs: any[] = [];
    try {
      let offset = 0;
      const count = 500; // Plaid max per page
      let hasMore = true;
      while (hasMore && offset < 10000) { // Safety limit: max 20 pages
        const res = await withTimeout(
          client.transactionsGet({
            access_token: primaryAccount.plaidAccessToken,
            start_date: startDate, end_date: endDate,
            options: { include_personal_finance_category: true, count, offset },
          }),
          20000, `Plaid transactionsGet offset=${offset}`
        );
        const txs = res.data.transactions || [];
        const total = res.data.total_transactions || 0;
        allTxs = allTxs.concat(txs);
        console.log(`[SYNC] Page offset=${offset}, got ${txs.length} txs, total=${total}, accumulated=${allTxs.length}`);
        offset += txs.length;
        hasMore = txs.length === count && offset < total;
      }
      console.log(`[SYNC] Plaid returned ${allTxs.length} total transactions`);
    } catch (plaidErr: any) {
      const errCode = plaidErr.response?.data?.error_code || "";
      const errMsg = plaidErr.response?.data?.error_message || plaidErr.message || "Unknown Plaid error";
      console.error(`[SYNC] Plaid error: ${errCode} - ${errMsg}`);

      if (errCode === "INVALID_ACCESS_TOKEN" || errCode === "ACCESS_TOKEN_EXPIRED") {
        return { success: false, error: "TOKEN_INVALID", detail: "Tu sesion con el banco expiro. Desconecta y vuelve a conectar." };
      }
      if (errCode === "PRODUCT_NOT_READY") {
        return { success: false, error: "Plaid esta preparando los datos. Intenta de nuevo en 10 segundos." };
      }
      if (errCode === "NO_ACCOUNTS") {
        return { success: false, error: "No hay cuentas activas en Plaid." };
      }
      // Retry once for "not yet ready"
      if (errMsg.includes("not yet ready")) {
        console.log(`[SYNC] Retrying in 3s...`);
        await new Promise(r => setTimeout(r, 3000));
        try {
          const res = await withTimeout(
            client.transactionsGet({
              access_token: primaryAccount.plaidAccessToken,
              start_date: startDate, end_date: endDate,
              options: { include_personal_finance_category: true },
            }),
            20000, "Plaid transactionsGet retry"
          );
          allTxs = res.data.transactions || [];
          console.log(`[SYNC] Retry successful: ${allTxs.length} transactions`);
        } catch (retryErr: any) {
          return { success: false, error: retryErr.message || "Error en reintento" };
        }
      } else {
        return { success: false, error: `${errCode}: ${errMsg}` };
      }
    }

    if (allTxs.length === 0) {
      console.log(`[SYNC] No transactions found`);
      return { success: true, added: 0, message: "Sin transacciones nuevas para este periodo." };
    }

    // Step 4: Deduplication (5s timeout)
    console.log(`[SYNC] Checking for duplicates...`);
    let existingSet = new Set<string>();
    try {
      const existingTxIds = await withTimeout(
        db.select({ plaidTransactionId: bankTransactions.plaidTransactionId, reference: bankTransactions.reference })
          .from(bankTransactions).where(eq(bankTransactions.userId, userId)),
        5000, "Get existing transactions"
      );
      for (const tx of existingTxIds) {
        if (tx.plaidTransactionId) existingSet.add(tx.plaidTransactionId);
        if (tx.reference) existingSet.add(tx.reference);
      }
    } catch { /* if table/column doesn't exist yet, proceed without dedup */ }

    const newTxs = allTxs.filter((tx: any) => !existingSet.has(tx.transaction_id));
    const duplicates = allTxs.length - newTxs.length;
    console.log(`[SYNC] New: ${newTxs.length}, Duplicates: ${duplicates}`);

    if (newTxs.length === 0) {
      return { success: true, added: 0, message: "Todas las transacciones ya estaban sincronizadas." };
    }

    // Step 5: Insert transactions
    console.log(`[SYNC] Inserting ${newTxs.length} transactions...`);
    let added = 0;
    let skipped = 0;
    const journalTxs: any[] = [];

    for (const tx of newTxs) {
      try {
        const plaidAmount = tx.amount;
        const { type, category } = determineTypeAndCategory(plaidAmount, tx.personal_finance_category?.detailed ? [tx.personal_finance_category.primary, tx.personal_finance_category.detailed] : tx.category || [], tx.name);
        const absAmount = Math.abs(plaidAmount);
        if (absAmount === 0) { skipped++; continue; }

        const targetAccount = accountMap.get(tx.account_id) || primaryAccount;
        const txDate = tx.date ? new Date(tx.date) : new Date();
        const normalizedMerchant = normalizeMerchantName(tx.name);

        // Log each transaction being inserted
        console.log(`[SYNC] Inserting: "${tx.name}" | amount=${absAmount} | category=${category} | account=${targetAccount.bankName} (id=${targetAccount.id}) | plaid_account=${tx.account_id}`);

        await db.insert(bankTransactions).values({
          userId, bankAccountId: targetAccount.id,
          bankName: targetAccount.bankName, accountNumber: targetAccount.accountNumber,
          transactionDate: txDate, description: tx.name,
          amount: String(absAmount.toFixed(2)), plaidAmount: String(plaidAmount.toFixed(2)),
          type, category: category as any,
          subcategory: tx.personal_finance_category?.detailed || tx.category?.[1] || null,
          plaidTransactionId: tx.transaction_id,
          plaidCategory: tx.personal_finance_category ? JSON.stringify(tx.personal_finance_category) : null,
          merchantName: normalizedMerchant,
          syncStatus: "synced", lastSyncedAt: new Date(),
          reference: tx.transaction_id, isReconciled: false, importedFrom: "plaid",
        });
        added++;
        journalTxs.push({ type, category, amount: absAmount, description: tx.name, date: txDate, bankAccountId: targetAccount.id });
      } catch (e: any) {
        console.error(`[SYNC] Insert error for ${tx.transaction_id}: ${e.message}`);
        skipped++;
      }
    }

    console.log(`[SYNC] Inserted: ${added}, Skipped: ${skipped}`);

    // Step 6: Journal entries (best effort, 5s timeout)
    if (journalTxs.length > 0) {
      try {
        await withTimeout(createJournalEntries(db, journalTxs, userId), 5000, "Journal entries");
        console.log(`[SYNC] Journal entries created`);
      } catch { console.log(`[SYNC] Journal entries skipped`); }
    }

    // Step 7: Update balances (best effort, 10s timeout)
    try {
      const accountsRes = await withTimeout(
        client.accountsGet({ access_token: primaryAccount.plaidAccessToken }),
        10000, "Update balances"
      );
      for (const plaidAcc of accountsRes.data.accounts || []) {
        const dbAccount = accountMap.get(plaidAcc.account_id);
        if (dbAccount && plaidAcc.balances) {
          const bal = plaidAcc.balances.available != null ? String(plaidAcc.balances.available) : plaidAcc.balances.current != null ? String(plaidAcc.balances.current) : null;
          if (bal != null) await db.update(bankAccounts).set({ currentBalance: bal, lastSyncedAt: new Date(), updatedAt: new Date() }).where(eq(bankAccounts.id, dbAccount.id));
        }
      }
      console.log(`[SYNC] Balances updated`);
    } catch { console.log(`[SYNC] Balance update skipped`); }

    const duration = Date.now() - (startTime || Date.now());
    console.log(`[SYNC] Complete in ${duration}ms. Added: ${added}`);
    return { success: true, added, total: allTxs.length, duplicates, message: added > 0 ? `${added} transacciones sincronizadas` : "Sin transacciones nuevas" };
  } catch (err: any) {
    console.error(`[SYNC] Fatal error:`, err);
    return { success: false, error: err.message || "Error desconocido en sincronizacion" };
  }
}

// ─── HELPER: Format currency for anomaly descriptions ───
function formatCurrencyVal(val: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
}

// ─── HELPER: Check if user has an active bank connection ───
async function hasActiveBank(userId: number): Promise<boolean> {
  const db = getDb();
  const allAccounts = await db.select().from(bankAccounts).where(eq(bankAccounts.userId, userId));
  return allAccounts.some((a: any) => a.plaidAccessToken && a.isActive);
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
function parseWellsFargoCSV(rows: string[][]): Array<{ date: string; amount: number; description: string; balance?: number }> {
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.toLowerCase().trim());
  // Wells Fargo format: Date,Amount,Star,CheckNumber,Description,Balance
  const dateIdx = headers.findIndex((h) => h.includes("date"));
  const amountIdx = headers.findIndex((h) => h.includes("amount"));
  const descIdx = headers.findIndex((h) => h.includes("description"));
  const balanceIdx = headers.findIndex((h) => h.includes("balance"));
  if (dateIdx === -1 || amountIdx === -1) return [];

  const txs: Array<{ date: string; amount: number; description: string; balance?: number }> = [];
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
    txs.push({ date: isoDate, amount: Math.abs(amount), description: desc, balance: balStr ? parseFloat(balStr) : undefined });
  }
  return txs;
}

export const bankRouter = createRouter({
  createLinkToken: authedQuery.mutation(async ({ ctx }) => {
    if (!ctx.user) return { linkToken: null };
    const client = await initPlaid();
    if (!client) return { linkToken: null };
    try {
      const res = await client.linkTokenCreate({
        user: { client_user_id: String(ctx.user.id) },
        client_name: "Ai Aethel Accountant",
        products: ["transactions", "auth"],
        country_codes: ["US"],
        language: "en",
        transactions: { days_requested: 730 },
      });
      return { linkToken: res.data.link_token };
    } catch { return { linkToken: null }; }
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
      const accountsRes = await client.accountsGet({ access_token: accessToken });
      const plaidAccounts = accountsRes.data.accounts || [];

      for (const plaidAcc of plaidAccounts) {
        const exists = await db.select({ id: bankAccounts.id }).from(bankAccounts)
          .where(and(eq(bankAccounts.userId, ctx.user.id), eq(bankAccounts.plaidAccountId, plaidAcc.account_id)));
        if (exists.length > 0) {
          await db.update(bankAccounts).set({
            plaidAccessToken: accessToken, plaidItemId: itemId,
            bankName: plaidAcc.name, accountType: plaidAcc.type,
            currentBalance: plaidAcc.balances.available != null ? String(plaidAcc.balances.available) : String(plaidAcc.balances.current || 0),
            lastSyncedAt: new Date(), updatedAt: new Date(), isActive: true,
          }).where(eq(bankAccounts.id, exists[0].id));
        } else {
          await db.insert(bankAccounts).values({
            userId: ctx.user.id, plaidAccountId: plaidAcc.account_id,
            plaidAccessToken: accessToken, plaidItemId: itemId,
            bankName: plaidAcc.name, accountType: plaidAcc.type,
            accountNumber: plaidAcc.mask || "", currency: "USD",
            currentBalance: plaidAcc.balances.available != null ? String(plaidAcc.balances.available) : String(plaidAcc.balances.current || 0),
            isActive: true, lastSyncedAt: new Date(),
          });
        }
      }
      return { success: true, accountCount: plaidAccounts.length };
    } catch (err: any) {
      return { success: false, error: err.response?.data?.error_message || err.message || "Error" };
    }
  }),

  listAccounts: authedQuery.query(async ({ ctx }) => {
    if (!ctx.user) return [];
    try {
      const all = await getDb().select().from(bankAccounts).where(eq(bankAccounts.userId, ctx.user.id)).orderBy(desc(bankAccounts.createdAt));
      // Only return active accounts (same filter as checkConnection)
      return all.filter((a: any) => a.plaidAccessToken && a.isActive);
    } catch (err) {
      console.error("[listAccounts] error:", err);
      return [];
    }
  }),

  getAccount: authedQuery.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
    if (!ctx.user) return null;
    const rows = await getDb().select().from(bankAccounts).where(and(eq(bankAccounts.id, input.id), eq(bankAccounts.userId, ctx.user.id)));
    return rows[0] || null;
  }),

  checkConnection: authedQuery.query(async ({ ctx }) => {
    if (!ctx.user) return { hasBank: false, accountCount: 0 };
    const db = getDb();
    const allAccounts = await db.select().from(bankAccounts).where(eq(bankAccounts.userId, ctx.user.id));
    const activeAccounts = allAccounts.filter((a: any) => a.plaidAccessToken && a.isActive);
    if (activeAccounts.length > 0) return { hasBank: true, accountCount: activeAccounts.length };
    return { hasBank: false, accountCount: 0, message: allAccounts.length > 0 ? "Cuenta inactiva" : "No hay cuenta" };
  }),

  syncTransactions: authedQuery.input(z.object({ year: z.number().optional(), month: z.number().optional(), accountId: z.number().optional(), days: z.number().optional() }).optional())
    .mutation(async ({ input, ctx }) => doSyncTransactions(ctx, input?.year, input?.month, input?.accountId, "manual", input?.days)),

  autoSync: authedQuery.mutation(async ({ ctx }) => doSyncTransactions(ctx, undefined, undefined, undefined, "auto")),

  // Sync recent transactions (last N days) — used on page load to catch new transactions
  syncRecent: authedQuery.mutation(async ({ ctx }) => {
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
    // Guard: no active bank = no data
    if (!await hasActiveBank(ctx.user.id)) return { transactions: [], income: "0", expense: "0", topExpense: "0", liveBalance: "0", monthName: "" };
    const db = getDb();
    const { year, month, accountId } = input;
    const startStr = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDay = new Date(year, month, 0).getDate();
    const endStr = `${year}-${String(month).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;

    // Get user accounts for Plaid access token (needed for live balance)
    const userAccounts = await db.select().from(bankAccounts).where(eq(bankAccounts.userId, ctx.user.id));
    console.log(`[getMonthData] User ${ctx.user.id} has ${userAccounts.length} accounts:`, userAccounts.map(a => ({ id: a.id, name: a.bankName, plaidId: a.plaidAccountId?.slice(0,8), currentBal: a.currentBalance, lastSync: a.lastSyncedAt })));
    const primaryAccount = userAccounts[0];

    // Build conditions: filter by user and date range
    // If accountId specified, also filter by that account
    const conditions: any[] = [
      eq(bankTransactions.userId, ctx.user.id),
      sql`DATE(${bankTransactions.transactionDate}) >= ${startStr}`,
      sql`DATE(${bankTransactions.transactionDate}) <= ${endStr}`,
    ];
    if (accountId) {
      conditions.push(eq(bankTransactions.bankAccountId, accountId));
    }

    let txs = await db.select().from(bankTransactions)
      .where(and(...conditions))
      .orderBy(desc(bankTransactions.transactionDate));

    // Fallback: if no results with account filter, get ALL user transactions for the month
    if (txs.length === 0 && accountId) {
      txs = await db.select().from(bankTransactions)
        .where(and(
          eq(bankTransactions.userId, ctx.user.id),
          sql`DATE(${bankTransactions.transactionDate}) >= ${startStr}`,
          sql`DATE(${bankTransactions.transactionDate}) <= ${endStr}`,
        ))
        .orderBy(desc(bankTransactions.transactionDate));
    }

    // INCOME/EXPENSE CALCULATION: Use plaidAmount (original Plaid value) for accuracy
    // In Plaid: negative = money entering (income), positive = money leaving (expense)
    let inc = 0, exp = 0;
    for (const t of txs) {
      const amt = parseFloat(t.amount ?? "0");
      if (amt <= 0) continue; // Skip zero/negative amounts
      // Use plaidAmount if available (negative = income, positive = expense)
      // Fallback to stored type if plaidAmount is null
      const plaidAmt = t.plaidAmount != null ? parseFloat(t.plaidAmount) : null;
      if (plaidAmt !== null) {
        if (plaidAmt < 0) inc += amt; // Money entering = income
        else exp += amt; // Money leaving = expense
      } else {
        // Fallback: use stored type
        if (t.type === "income") inc += amt;
        else exp += amt;
      }
    }

    // Get LIVE balance from Plaid (not cached DB value)
    let liveBalance = "0";
    let lastSyncedAt: string | null = null;
    let plaidSource = false;
    try {
      const client = await initPlaid();
      if (client && primaryAccount?.plaidAccessToken) {
        console.log(`[getMonthData] Fetching fresh balance from Plaid for user ${ctx.user.id}, account ${accountId || 'all'}`);
        const accountsRes = await client.accountsGet({ access_token: primaryAccount.plaidAccessToken });
        const freshBalances = new Map<string, string>();
        for (const plaidAcc of accountsRes.data.accounts || []) {
          const bal = plaidAcc.balances.available != null ? String(plaidAcc.balances.available) : plaidAcc.balances.current != null ? String(plaidAcc.balances.current) : null;
          if (bal != null) freshBalances.set(plaidAcc.account_id, bal);
          console.log(`[getMonthData] Plaid account ${plaidAcc.name} (${plaidAcc.account_id}): available=${plaidAcc.balances.available}, current=${plaidAcc.balances.current}`);
        }
        // Update DB with fresh balances
        for (const dbAccount of userAccounts) {
          if (!dbAccount.plaidAccountId) continue;
          const freshBal = freshBalances.get(dbAccount.plaidAccountId);
          if (freshBal != null) {
            await db.update(bankAccounts).set({ currentBalance: freshBal, lastSyncedAt: new Date(), updatedAt: new Date() }).where(eq(bankAccounts.id, dbAccount.id));
          }
        }
        // Calculate result
        if (accountId) {
          const targetAcc = userAccounts.find((a: any) => a.id === accountId);
          liveBalance = targetAcc?.plaidAccountId ? (freshBalances.get(targetAcc.plaidAccountId) ?? targetAcc?.currentBalance ?? "0") : (targetAcc?.currentBalance ?? "0");
          console.log(`[getMonthData] Account ${accountId} balance: ${liveBalance} (from Plaid: ${targetAcc?.plaidAccountId ? 'yes' : 'no'})`);
        } else {
          let total = 0;
          for (const a of userAccounts) {
            const bal = a.plaidAccountId ? (freshBalances.get(a.plaidAccountId) ?? a.currentBalance) : a.currentBalance;
            total += parseFloat(bal ?? "0");
          }
          liveBalance = String(total.toFixed(2));
        }
        plaidSource = true;
        lastSyncedAt = new Date().toISOString();
      } else {
        console.log(`[getMonthData] Cannot fetch from Plaid: client=${!!client}, token=${!!primaryAccount?.plaidAccessToken}`);
      }
    } catch (plaidErr: any) {
      console.error("[getMonthData] Plaid balance error:", plaidErr.message);
    }

    // If Plaid didn't work, fallback to DB
    if (!plaidSource) {
      console.log(`[getMonthData] Using DB fallback for balance`);
      if (accountId) {
        const acc = await db.select({ currentBalance: bankAccounts.currentBalance, lastSyncedAt: bankAccounts.lastSyncedAt }).from(bankAccounts).where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.userId, ctx.user.id)));
        liveBalance = acc[0]?.currentBalance ? String(parseFloat(acc[0].currentBalance).toFixed(2)) : "0";
        lastSyncedAt = acc[0]?.lastSyncedAt ? new Date(acc[0].lastSyncedAt).toISOString() : null;
      } else {
        const allAccs = await db.select({ currentBalance: bankAccounts.currentBalance, lastSyncedAt: bankAccounts.lastSyncedAt }).from(bankAccounts).where(eq(bankAccounts.userId, ctx.user.id));
        const totalBal = allAccs.reduce((s: number, a: any) => s + parseFloat(a.currentBalance ?? "0"), 0);
        liveBalance = String(totalBal.toFixed(2));
        lastSyncedAt = allAccs[0]?.lastSyncedAt ? new Date(allAccs[0].lastSyncedAt).toISOString() : null;
      }
    }

    const monthNames = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    return {
      transactions: txs, income: inc.toFixed(2), expense: exp.toFixed(2),
      topExpense: txs.length > 0 ? String(Math.max(...txs.map((t: any) => parseFloat(t.amount)))) : "0",
      liveBalance,
      lastSyncedAt,
      fromPlaid: plaidSource,
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
  })).query(async ({ input, ctx }) => {
    if (!ctx.user) return [];
    const db = getDb();
    const { category, year, month } = input;

    const conditions = [
      eq(bankTransactions.userId, ctx.user.id),
      eq(bankTransactions.category, category as any),
    ];

    if (year && month) {
      const startStr = `${year}-${String(month).padStart(2, "0")}-01`;
      const endDay = new Date(year, month, 0).getDate();
      const endStr = `${year}-${String(month).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;
      conditions.push(sql`DATE(${bankTransactions.transactionDate}) >= ${startStr}`);
      conditions.push(sql`DATE(${bankTransactions.transactionDate}) <= ${endStr}`);
    }

    const txs = await db.select().from(bankTransactions)
      .where(and(...conditions))
      .orderBy(desc(bankTransactions.transactionDate));

    return txs;
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

    return {
      income: inc.toFixed(2),
      expense: exp.toFixed(2),
      transactionCount: txs.length,
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
  getLiveBalance: authedQuery.input(z.object({ accountId: z.number().optional() }).optional()).query(async ({ input, ctx }) => {
    if (!ctx.user) return { balance: "0", liveBalance: "0", bookBalance: "0", accountCount: 0 };
    const db = getDb();

    // Get user accounts
    const userAccounts = await db.select().from(bankAccounts).where(eq(bankAccounts.userId, ctx.user.id));
    if (userAccounts.length === 0) return { balance: "0", liveBalance: "0", bookBalance: "0", accountCount: 0 };

    const primaryAccount = userAccounts[0];
    if (!primaryAccount?.plaidAccessToken) {
      // No Plaid token — return DB balance
      const totalBal = userAccounts.reduce((s: number, a: any) => s + parseFloat(a.currentBalance ?? "0"), 0);
      return { balance: String(totalBal.toFixed(2)), liveBalance: String(totalBal.toFixed(2)), bookBalance: String(totalBal.toFixed(2)), bankName: userAccounts[0]?.bankName ?? "Banco", accountCount: userAccounts.length };
    }

    // Fetch REAL balance from Plaid
    try {
      const client = await initPlaid();
      if (!client) throw new Error("Plaid not initialized");

      const accountsRes = await client.accountsGet({ access_token: primaryAccount.plaidAccessToken });
      const freshBalances = new Map<string, string>();

      for (const plaidAcc of accountsRes.data.accounts || []) {
        // Use available if present, otherwise current. Handle null/undefined correctly.
        let bal: string | null = null;
        if (plaidAcc.balances?.available != null && !isNaN(plaidAcc.balances.available)) {
          bal = String(plaidAcc.balances.available);
        } else if (plaidAcc.balances?.current != null && !isNaN(plaidAcc.balances.current)) {
          bal = String(plaidAcc.balances.current);
        }
        if (bal != null) freshBalances.set(plaidAcc.account_id, bal);
      }

      console.log(`[getLiveBalance] Plaid returned ${freshBalances.size} balances:`, Array.from(freshBalances.entries()));

      // Update DB with fresh balances
      for (const dbAccount of userAccounts) {
        if (!dbAccount.plaidAccountId) continue;
        const freshBal = freshBalances.get(dbAccount.plaidAccountId);
        if (freshBal != null) {
          await db.update(bankAccounts).set({ currentBalance: freshBal, lastSyncedAt: new Date(), updatedAt: new Date() }).where(eq(bankAccounts.id, dbAccount.id));
        }
      }

      // Calculate result
      let resultBalance = "0";
      if (input?.accountId) {
        const targetAcc = userAccounts.find((a: any) => a.id === input.accountId);
        const plaidId = targetAcc?.plaidAccountId;
        const freshBal = plaidId ? freshBalances.get(plaidId) : null;
        resultBalance = freshBal ?? targetAcc?.currentBalance ?? "0";
      } else {
        let total = 0;
        for (const a of userAccounts) {
          const bal = a.plaidAccountId ? (freshBalances.get(a.plaidAccountId) ?? a.currentBalance) : a.currentBalance;
          total += parseFloat(bal ?? "0");
        }
        resultBalance = String(total.toFixed(2));
      }

      console.log(`[getLiveBalance] Returning balance: ${resultBalance}`);
      return { balance: resultBalance, liveBalance: resultBalance, bookBalance: resultBalance, bankName: primaryAccount.bankName ?? "Banco", accountCount: userAccounts.length };

    } catch (plaidErr: any) {
      console.error("[getLiveBalance] Plaid error:", plaidErr?.message || plaidErr);
      // Return DB balance as fallback
      const totalBal = userAccounts.reduce((s: number, a: any) => s + parseFloat(a.currentBalance ?? "0"), 0);
      return { balance: String(totalBal.toFixed(2)), liveBalance: String(totalBal.toFixed(2)), bookBalance: String(totalBal.toFixed(2)), bankName: userAccounts[0]?.bankName ?? "Banco", accountCount: userAccounts.length };
    }
  }),

  // ─── REFRESH ALL BALANCES + DISCOVER NEW ACCOUNTS ───
  refreshAllBalances: authedQuery.mutation(async ({ ctx }) => {
    if (!ctx.user) return { success: false, error: "No autenticado" };
    if (!await hasActiveBank(ctx.user.id)) return { success: false, error: "No hay cuenta bancaria conectada" };
    const db = getDb();
    try {
      const userAccounts = await db.select().from(bankAccounts).where(eq(bankAccounts.userId, ctx.user.id));
      if (userAccounts.length === 0) return { success: true, updated: 0, added: 0, message: "No hay cuentas" };

      const primaryAccount = userAccounts[0];
      if (!primaryAccount?.plaidAccessToken) return { success: true, updated: 0, added: 0, message: "Sin token de Plaid" };

      const client = await initPlaid();
      if (!client) return { success: false, error: "Plaid no disponible" };

      // Map existing accounts by plaidAccountId
      const accountMap = new Map<string, typeof userAccounts[0]>();
      for (const acc of userAccounts) {
        if (acc.plaidAccountId) accountMap.set(acc.plaidAccountId, acc);
      }

      // Get ALL accounts from Plaid (including new ones)
      const accountsRes = await client.accountsGet({ access_token: primaryAccount.plaidAccessToken });
      const plaidAccounts = accountsRes.data.accounts || [];

      let updated = 0;
      let added = 0;

      for (const plaidAcc of plaidAccounts) {
        const dbAccount = accountMap.get(plaidAcc.account_id);
        const bal = plaidAcc.balances?.available != null ? String(plaidAcc.balances.available) : plaidAcc.balances?.current != null ? String(plaidAcc.balances.current) : null;

        if (dbAccount) {
          // Update existing account balance
          if (bal != null) {
            await db.update(bankAccounts).set({
              currentBalance: bal,
              bankName: plaidAcc.name, // Also update name in case it changed
              accountType: plaidAcc.type || dbAccount.accountType,
              lastSyncedAt: new Date(),
              updatedAt: new Date(),
            }).where(eq(bankAccounts.id, dbAccount.id));
            updated++;
          }
        } else {
          // NEW ACCOUNT — insert it
          await db.insert(bankAccounts).values({
            userId: ctx.user.id,
            plaidAccountId: plaidAcc.account_id,
            plaidAccessToken: primaryAccount.plaidAccessToken,
            plaidItemId: primaryAccount.plaidItemId,
            bankName: plaidAcc.name,
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

      return {
        success: true,
        updated,
        added,
        total: plaidAccounts.length,
        message: added > 0 ? `${updated} actualizadas, ${added} nuevas cuentas` : `${updated} balances actualizados`,
      };
    } catch (err: any) {
      return { success: false, error: err.message || "Error actualizando balances" };
    }
  }),

  // ─── GET ALL ACCOUNTS DIRECTLY FROM PLAID ───
  getAllPlaidAccounts: authedQuery.query(async ({ ctx }) => {
    if (!ctx.user) return { accounts: [], count: 0 };
    if (!await hasActiveBank(ctx.user.id)) return { accounts: [], count: 0 };
    const db = getDb();
    try {
      const userAccounts = await db.select().from(bankAccounts).where(eq(bankAccounts.userId, ctx.user.id));
      if (userAccounts.length === 0) return { accounts: [], count: 0 };

      const primaryAccount = userAccounts[0];
      if (!primaryAccount?.plaidAccessToken) return { accounts: [], count: 0 };

      const client = await initPlaid();
      if (!client) return { accounts: [], count: 0 };

      const accountsRes = await client.accountsGet({ access_token: primaryAccount.plaidAccessToken });
      const plaidAccounts = accountsRes.data.accounts || [];

      // Map DB accounts by plaidAccountId for balance lookup
      const dbMap = new Map<string, typeof userAccounts[0]>();
      for (const acc of userAccounts) {
        if (acc.plaidAccountId) dbMap.set(acc.plaidAccountId, acc);
      }

      const accounts = plaidAccounts.map((pa: any) => {
        const dbAcc = dbMap.get(pa.account_id);
        return {
          id: dbAcc?.id || 0,
          plaidAccountId: pa.account_id,
          bankName: pa.name,
          accountType: pa.type || "",
          accountNumber: pa.mask || "",
          currentBalance: pa.balances?.available != null ? String(pa.balances.available) : pa.balances?.current != null ? String(pa.balances.current) : "0",
          currency: pa.balances?.iso_currency_code || "USD",
          isInDb: !!dbAcc,
        };
      });

      return { accounts, count: accounts.length };
    } catch (err: any) {
      return { accounts: [], count: 0, error: err.message };
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

  fixOrphanedTransactions: authedQuery.mutation(async ({ ctx }) => {
    if (!ctx.user) return { success: false, error: "No autenticado" };
    const db = getDb();
    const accounts = await db.select().from(bankAccounts).where(eq(bankAccounts.userId, ctx.user.id));
    if (accounts.length === 0) return { success: false, error: "No accounts" };
    const primary = accounts[0];
    const orphaned = await db.select().from(bankTransactions).where(and(eq(bankTransactions.userId, ctx.user.id), sql`${bankTransactions.bankAccountId} IS NULL`));
    let updated = 0, skipped = 0;
    for (const tx of orphaned) {
      if (tx.bankAccountId == null) { await db.update(bankTransactions).set({ bankAccountId: primary.id }).where(eq(bankTransactions.id, tx.id)); updated++; }
      else skipped++;
    }
    return { success: true, updated, skipped, total: orphaned.length };
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

  runMigration: publicQuery.mutation(async () => {
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
    if (!ctx.user) return { fixed: 0 };
    if (!await hasActiveBank(ctx.user.id)) return { fixed: 0 };
    const db = getDb();
    try {
      // Find transactions that were miscategorized by old algorithm
      const txs = await db.select().from(bankTransactions)
        .where(and(
          eq(bankTransactions.userId, ctx.user.id),
          // Only fix known bad categories (PayPal, Cash App, Venmo marked as cash_deposit)
          // Or any transfer that was marked as cash_deposit/cash_withdrawal without ATM
        ));

      let fixed = 0;
      for (const tx of txs) {
        try {
          const desc = (tx.description || "").toLowerCase();
          const plaidAmt = tx.plaidAmount != null ? parseFloat(tx.plaidAmount) : null;
          const { type, category } = determineTypeAndCategory(
            plaidAmt ?? parseFloat(tx.amount) * (tx.type === "income" ? -1 : 1),
            tx.plaidCategory ? [tx.plaidCategory] : [],
            tx.description || ""
          );
          // Only update if category actually changed
          if (tx.category !== category) {
            await db.update(bankTransactions)
              .set({ type, category })
              .where(eq(bankTransactions.id, tx.id));
            fixed++;
          }
        } catch { /* skip on error */ }
      }
      return { fixed };
    } catch { return { fixed: 0 }; }
  }),

  // ─── DEBUG: Raw Plaid data ───
  debug: authedQuery.query(async ({ ctx }) => {
    if (!ctx.user) return { error: "No autenticado" };
    const db = getDb();
    const userAccounts = await db.select().from(bankAccounts).where(eq(bankAccounts.userId, ctx.user.id));
    if (userAccounts.length === 0) return { error: "No hay cuentas" };
    const primary = userAccounts[0];
    if (!primary?.plaidAccessToken) return { error: "Sin token" };

    try {
      const client = await initPlaid();
      if (!client) return { error: "Plaid no inicializado" };

      // Raw accounts from Plaid
      const accountsRes = await client.accountsGet({ access_token: primary.plaidAccessToken });
      const plaidAccounts = (accountsRes.data.accounts || []).map((a: any) => ({
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
      }));

      // Raw recent transactions from Plaid
      const now = new Date();
      const startDate = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, "0")}-01`;
      const endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const txRes = await client.transactionsGet({
        access_token: primary.plaidAccessToken,
        start_date: startDate,
        end_date: endDate,
        options: { count: 100, include_personal_finance_category: true },
      });
      const plaidTxs = (txRes.data.transactions || []).map((t: any) => ({
        transaction_id: t.transaction_id,
        account_id: t.account_id,
        name: t.name,
        amount: t.amount,
        date: t.date,
        category: t.personal_finance_category?.primary || t.category?.[0],
      }));

      return {
        dbAccounts: userAccounts.map((a: any) => ({ id: a.id, plaidAccountId: a.plaidAccountId, bankName: a.bankName, accountType: a.accountType, currentBalance: a.currentBalance })),
        plaidAccounts,
        plaidTxCount: plaidTxs.length,
        plaidTxs: plaidTxs.slice(0, 20),
        dateRange: { startDate, endDate },
      };
    } catch (err: any) {
      return { error: err.message || "Unknown error", code: err.response?.data?.error_code };
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

      let txs: Array<{ date: string; amount: number; description: string; balance?: number }> = [];
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

      const targetAcc = await db.select().from(bankAccounts).where(eq(bankAccounts.id, targetAccountId));
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
          tx.amount,
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
            plaidAmount: String(tx.amount.toFixed(2)),
            type,
            category: category as any,
            syncStatus: "imported",
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
          await db.update(bankAccounts).set({ currentBalance: String(latestBalance.toFixed(2)), lastSyncedAt: new Date(), updatedAt: new Date() }).where(eq(bankAccounts.id, targetAccountId));
        } catch { /* ignore */ }
      }

      return { success: true, added, skipped, total: txs.length, latestBalance: latestBalance != null ? String(latestBalance.toFixed(2)) : null };
    }),

  // ─── DISCONNECT BANK ───
  disconnect: authedQuery.mutation(async ({ ctx }) => {
    if (!ctx.user) return { success: false, error: "No autenticado" };
    const db = getDb();
    try {
      await db.delete(bankAccounts).where(eq(bankAccounts.userId, ctx.user.id));
      await db.delete(bankTransactions).where(eq(bankTransactions.userId, ctx.user.id));
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
      accounts: userAccounts.map(a => ({ id: a.id, name: a.bankName, plaidId: a.plaidAccountId?.slice(0,12) })),
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