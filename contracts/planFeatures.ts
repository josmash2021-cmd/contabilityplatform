// ── What each plan includes (shared by the server, which enforces it, and the client, which shows locks) ──
// Plans: personal Básico (free) · personal Pro ($40) · business Básico ($40) · Pro ($80) · Negocio ($150).
// Keep in step with the landing page cards (src/i18n/copy/marketing.ts) and api/lib/plans.ts.

export type PlanMode = "business" | "personal";
export type PlanTier = "basic" | "pro" | "business";

export type Feature =
  | "taxes" // Impuestos: documents, preparer and tracking
  | "budgets" // personal: category budgets with alerts
  | "receipts" // business: receipt photos on expenses (Básico has a monthly cap)
  | "vendors" // business: vendors and bills to pay
  | "quotes" // business: quotes and recurring invoices
  | "accountant" // business: accountant view, Excel and PDF
  | "clientReports" // business: reports by client and by service
  | "team"; // business: up to 10 users plus the accountant

const FEATURES: Record<PlanMode, Partial<Record<PlanTier, readonly Feature[]>>> = {
  personal: {
    basic: ["taxes"],
    pro: ["taxes", "budgets"],
  },
  business: {
    basic: ["receipts"],
    pro: ["receipts", "taxes", "vendors", "quotes", "accountant"],
    business: ["receipts", "taxes", "vendors", "quotes", "accountant", "clientReports", "team"],
  },
};

/** The plan with everything, used during the free trial and for admins. */
export function topTier(mode: PlanMode): PlanTier {
  return mode === "business" ? "business" : "pro";
}

export function planHas(mode: PlanMode, tier: PlanTier, feature: Feature): boolean {
  return FEATURES[mode][tier]?.includes(feature) ?? false;
}

/** The cheapest plan of this mode that includes the feature, for "available in …" messages. */
export function cheapestTierWith(mode: PlanMode, feature: Feature): PlanTier | null {
  const order: PlanTier[] = mode === "business" ? ["basic", "pro", "business"] : ["basic", "pro"];
  return order.find((t) => planHas(mode, t, feature)) ?? null;
}

// ── Assistant: "límite xN", each x is 20 questions a month ──
export const QUESTIONS_PER_X = 20;
const ASSISTANT_X: Record<PlanMode, Partial<Record<PlanTier, number>>> = {
  personal: { basic: 5, pro: 15 },
  business: { basic: 5, pro: 10, business: 20 },
};

/** Questions per calendar month for this plan (e.g. business Pro: x10 = 200). */
export function assistantMonthlyLimit(mode: PlanMode, tier: PlanTier): number {
  return (ASSISTANT_X[mode][tier] ?? 0) * QUESTIONS_PER_X;
}

/** Receipt photos per calendar month; null = no limit. */
export function receiptPhotosPerMonth(tier: PlanTier): number | null {
  return tier === "basic" ? 20 : null;
}

/** Banks (Plaid connections) per business plan. Personal has no limit. */
export const BUSINESS_BANK_LIMITS: Record<PlanTier, number> = { basic: 1, pro: 3, business: 6 };

/** Users per business plan (the owner included); the accountant is extra. */
export function teamSeats(tier: PlanTier): number {
  return tier === "business" ? 10 : 1;
}
