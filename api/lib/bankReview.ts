// ── Revisar movimientos (business /transactions, "Por revisar") ──
// The owner confirms or fixes the category of each bank movement (grouping, matching, splits and rules:
// api/lib/reviewEngine.ts). A movement counts as reviewed when
// bankTransactions.isReconciled is true; from then on the automatic categorizer and the bank sync leave
// its category and type alone (api/bank-router.ts). Pure rules here; the API is api/review-router.ts.
// The client (src/components/transactions/) imports this file too, so keep it free of server code.

export type MoneyType = "income" | "expense";
/** Which way the money goes for a category: in, out, or either. */
export type Direction = "in" | "out" | "both";

/**
 * The categories the owner can pick, in the order shown. The keys are the ones the bank sync already
 * stores and the rest of the app already labels (Bank page, reports, accountant export), so picking one
 * never produces a key other screens can't name.
 */
export const REVIEW_CATEGORIES: ReadonlyArray<{ key: string; dir: Direction }> = [
  // Money in
  { key: "general", dir: "in" },
  { key: "deposit", dir: "in" },
  { key: "cash_deposit", dir: "in" },
  { key: "zelle_income", dir: "in" },
  { key: "transfer_income", dir: "in" },
  { key: "refund", dir: "in" },
  { key: "interest", dir: "in" },
  // Money out
  { key: "business_expense", dir: "out" },
  { key: "shopping", dir: "out" },
  { key: "gasolina", dir: "out" },
  { key: "food", dir: "out" },
  { key: "subscription", dir: "out" },
  { key: "rent", dir: "out" },
  { key: "utilities", dir: "out" },
  { key: "insurance", dir: "out" },
  { key: "health_insurance", dir: "out" },
  { key: "medical", dir: "out" },
  { key: "government", dir: "out" },
  { key: "zelle_sent", dir: "out" },
  { key: "transfer", dir: "out" },
  { key: "cash_withdrawal", dir: "out" },
  { key: "home_expense", dir: "out" },
  // Either way
  { key: "card_payment", dir: "both" },
  { key: "loan", dir: "both" },
  { key: "other", dir: "both" },
];

/**
 * Keys the sync rules produce (api/bank-router.ts determineTypeAndCategory) or older rows carry, that
 * aren't offered in the picker. Accepted so a movement can keep the category it already has.
 */
export const OTHER_KNOWN_CATEGORIES: readonly string[] = [
  "income", "sale", "business_income", "cash_income", "paycheck", "investment", "p2p",
  "retail", "wholesale", "electronics", "rideshare", "food_delivery", "fast_food", "coffee",
];

const DIRECTIONS = new Map<string, Direction>(REVIEW_CATEGORIES.map((c) => [c.key, c.dir]));
const KNOWN = new Set<string>([...DIRECTIONS.keys(), ...OTHER_KNOWN_CATEGORIES]);

/** Most movements one "Confirmar todos los visibles" may confirm at once. */
export const MAX_REVIEW_BATCH = 300;
/** The inbox only asks about recent movements; older ones can still be changed from "Todos".
 * Without this, an account with years of history would open to thousands of items. */
export const REVIEW_WINDOW_DAYS = 60;
/** Most movements the inbox lists at once ("Ver más" grows the page up to this). */
export const REVIEW_LIST_MAX = 300;
/** How many the inbox shows first, and how many more each "Ver más" adds. */
export const REVIEW_PAGE = 30;

export function isKnownCategory(key: string): boolean {
  return KNOWN.has(key);
}

/** Picker direction of a category; keys outside the picker work either way. */
export function directionOf(key: string): Direction {
  return DIRECTIONS.get(key) ?? "both";
}

/** The categories to offer when the money went this way (the "either way" ones go in both lists). */
export function categoriesFor(type: MoneyType): string[] {
  const dir: Direction = type === "income" ? "in" : "out";
  return REVIEW_CATEGORIES.filter((c) => c.dir === dir || c.dir === "both").map((c) => c.key);
}

/**
 * The type a movement ends up with when the owner picks a category: what they asked for if they said,
 * otherwise what the category implies (money-in categories are income, money-out ones expense), and
 * for "either way" categories the type it already had.
 */
export function resolveType(category: string, current: MoneyType, requested?: MoneyType): MoneyType {
  if (requested) return requested;
  const dir = directionOf(category);
  if (dir === "in") return "income";
  if (dir === "out") return "expense";
  return current;
}

/**
 * Which way the bank says the money went, from Plaid's signed amount (negative = money in).
 * Null when the bank didn't say (old rows, CSV imports store the absolute amount).
 */
export function bankDirection(plaidAmount: string | number | null | undefined, importedFrom?: string | null): MoneyType | null {
  if (plaidAmount == null || plaidAmount === "" || importedFrom === "csv") return null;
  const n = Number(plaidAmount);
  if (!Number.isFinite(n) || n === 0) return null;
  return n < 0 ? "income" : "expense";
}

/** MySQL booleans come back as 0/1 (or null on old rows). */
export function isReviewed(flag: boolean | number | string | null | undefined): boolean {
  return flag === true || flag === 1 || flag === "1";
}

/** What the database holds for a movement the bank also sends live (matched by Plaid's id). */
export type StoredReview = {
  id: number;
  plaidTransactionId: string | null;
  type: MoneyType;
  category: string;
  isReconciled: boolean | number | null;
  /** Not reviewed, but one of the owner's rules set its category (api/rules-router.ts): keep that one too. */
  ruleApplied?: boolean;
};

/**
 * Movements read live from the bank get their category recomputed on every load. This puts back what
 * the database holds: the row id always (so the screen can act on it), and for movements the owner
 * reviewed (or a rule of theirs categorized), their category and type, which win over the recomputed ones.
 */
export function applyStoredReviews<T extends { plaidTransactionId?: string | null; type: string; category: string }>(
  rows: T[],
  stored: StoredReview[],
): Array<T & { id?: number; isReconciled: boolean }> {
  const byPlaidId = new Map<string, StoredReview>();
  for (const s of stored) if (s.plaidTransactionId) byPlaidId.set(s.plaidTransactionId, s);
  return rows.map((row) => {
    const s = row.plaidTransactionId ? byPlaidId.get(row.plaidTransactionId) : undefined;
    if (!s) return { ...row, isReconciled: false };
    if (!isReviewed(s.isReconciled)) {
      return s.ruleApplied
        ? { ...row, id: Number(s.id), isReconciled: false, type: s.type, category: s.category }
        : { ...row, id: Number(s.id), isReconciled: false };
    }
    return { ...row, id: Number(s.id), isReconciled: true, type: s.type, category: s.category };
  });
}
