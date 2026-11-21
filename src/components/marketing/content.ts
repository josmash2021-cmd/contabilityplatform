// Shared marketing numbers. Prices must match api/lib/plans.ts.
// Texts live in src/i18n/copy/marketing.ts.

export const TRIAL_DAYS = 7;

export type PlanKey = "personal" | "business";

export const PLAN_PRICES: Record<PlanKey, { monthly: number; annual: number }> = {
  personal: { monthly: 40, annual: 400 },
  business: { monthly: 80, annual: 800 },
};

/**
 * Plans shown on the landing page, in order. Basico and Pro are announced but not
 * sold yet: they are not in api/lib/plans.ts nor in Stripe, so their button says
 * "coming soon" instead of opening the sign-up.
 */
export type LandingPlanKey = "personal" | "basic" | "business" | "pro";
export const LANDING_PLANS: { key: LandingPlanKey; mode: PlanKey; monthly: number; annual: number; available: boolean; featured?: boolean }[] = [
  { key: "personal", mode: "personal", ...PLAN_PRICES.personal, available: true },
  { key: "basic", mode: "business", monthly: 40, annual: 400, available: false },
  { key: "business", mode: "business", ...PLAN_PRICES.business, available: true, featured: true },
  { key: "pro", mode: "business", monthly: 150, annual: 1500, available: false },
];

/** Whole-dollar monthly equivalent of the annual price, e.g. 800 -> "$67". */
export function annualPerMonth(annual: number): string {
  return `$${Math.round(annual / 12)}`;
}
