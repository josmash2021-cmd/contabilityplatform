import { describe, expect, it } from "vitest";
import {
  MAX_REVIEW_BATCH, OTHER_KNOWN_CATEGORIES, REVIEW_CATEGORIES, REVIEW_LIST_MAX, REVIEW_PAGE,
  applyStoredReviews, bankDirection, categoriesFor, directionOf, isKnownCategory, isReviewed, resolveType,
  type StoredReview,
} from "./bankReview";

describe("category list", () => {
  it("has no duplicate keys and every key fits the 40-character column", () => {
    const keys = [...REVIEW_CATEGORIES.map((c) => c.key), ...OTHER_KNOWN_CATEGORIES];
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k.length).toBeLessThanOrEqual(40);
  });
  it("knows the picker keys and the ones the sync produces, and nothing else", () => {
    expect(isKnownCategory("business_expense")).toBe(true);
    expect(isKnownCategory("coffee")).toBe(true); // produced by the sync rules
    expect(isKnownCategory("transfer_income")).toBe(true);
    expect(isKnownCategory("Business_Expense")).toBe(false);
    expect(isKnownCategory("")).toBe(false);
    expect(isKnownCategory("x'; DROP TABLE bankTransactions; --")).toBe(false);
  });
  it("offers money-in categories for income and money-out ones for expenses, with the either-way ones in both", () => {
    const inc = categoriesFor("income");
    const exp = categoriesFor("expense");
    expect(inc).toContain("zelle_income");
    expect(inc).not.toContain("zelle_sent");
    expect(exp).toContain("gasolina");
    expect(exp).not.toContain("deposit");
    expect(inc).toContain("other");
    expect(exp).toContain("other");
    expect(inc).toContain("loan");
    expect(exp).toContain("loan");
  });
  it("keys outside the picker go either way", () => {
    expect(directionOf("coffee")).toBe("both");
    expect(directionOf("deposit")).toBe("in");
    expect(directionOf("shopping")).toBe("out");
  });
  it("limits stay sane", () => {
    expect(REVIEW_PAGE).toBeGreaterThan(0);
    expect(REVIEW_LIST_MAX).toBeGreaterThanOrEqual(REVIEW_PAGE);
    expect(MAX_REVIEW_BATCH).toBeGreaterThanOrEqual(REVIEW_LIST_MAX);
  });
});

describe("resolveType", () => {
  it("uses the type the owner asked for", () => {
    expect(resolveType("other", "income", "expense")).toBe("expense");
    expect(resolveType("shopping", "expense", "income")).toBe("income"); // e.g. a store refund
  });
  it("otherwise follows the category's direction", () => {
    expect(resolveType("deposit", "expense")).toBe("income");
    expect(resolveType("gasolina", "income")).toBe("expense");
  });
  it("keeps the current type for either-way categories", () => {
    expect(resolveType("other", "income")).toBe("income");
    expect(resolveType("loan", "expense")).toBe("expense");
    expect(resolveType("coffee", "income")).toBe("income");
  });
});

describe("bankDirection", () => {
  it("reads Plaid's sign: negative is money in", () => {
    expect(bankDirection("-120.50")).toBe("income");
    expect(bankDirection(45.1)).toBe("expense");
  });
  it("says nothing when the bank didn't", () => {
    expect(bankDirection(null)).toBeNull();
    expect(bankDirection(undefined)).toBeNull();
    expect(bankDirection("")).toBeNull();
    expect(bankDirection("0")).toBeNull();
    expect(bankDirection("abc")).toBeNull();
    expect(bankDirection("45.10", "csv")).toBeNull(); // CSV imports store the absolute amount
  });
});

describe("isReviewed", () => {
  it("treats MySQL's 1 and true as reviewed, and 0/null as not", () => {
    expect(isReviewed(true)).toBe(true);
    expect(isReviewed(1)).toBe(true);
    expect(isReviewed("1")).toBe(true);
    expect(isReviewed(false)).toBe(false);
    expect(isReviewed(0)).toBe(false);
    expect(isReviewed(null)).toBe(false);
    expect(isReviewed(undefined)).toBe(false);
  });
});

describe("applyStoredReviews", () => {
  const live = [
    { plaidTransactionId: "p1", type: "expense", category: "shopping", description: "NETFLIX.COM" },
    { plaidTransactionId: "p2", type: "expense", category: "gasolina", description: "SHELL OIL" },
    { plaidTransactionId: "p3", type: "income", category: "general", description: "DEPOSIT" },
    { plaidTransactionId: null, type: "expense", category: "other", description: "NO ID" },
  ];
  const stored: StoredReview[] = [
    { id: 11, plaidTransactionId: "p1", type: "expense", category: "business_expense", isReconciled: 1 },
    { id: 12, plaidTransactionId: "p2", type: "expense", category: "food", isReconciled: 0 },
  ];
  const out = applyStoredReviews(live, stored);

  it("the owner's category and type win for reviewed movements", () => {
    expect(out[0]).toMatchObject({ id: 11, isReconciled: true, category: "business_expense", type: "expense", description: "NETFLIX.COM" });
  });
  it("unreviewed movements keep the live category but get their id", () => {
    expect(out[1]).toMatchObject({ id: 12, isReconciled: false, category: "gasolina" });
  });
  it("movements not saved yet are left as they are", () => {
    expect(out[2]).toMatchObject({ isReconciled: false, category: "general" });
    expect(out[2]).not.toHaveProperty("id");
    expect(out[3]).toMatchObject({ isReconciled: false, category: "other" });
  });
  it("doesn't change the input", () => {
    expect(live[0].category).toBe("shopping");
    expect(out).toHaveLength(live.length);
  });
  it("a reviewed type change wins too", () => {
    const [r] = applyStoredReviews([{ plaidTransactionId: "p9", type: "income", category: "transfer" }],
      [{ id: 9, plaidTransactionId: "p9", type: "expense", category: "transfer", isReconciled: true }]);
    expect(r.type).toBe("expense");
  });
});
