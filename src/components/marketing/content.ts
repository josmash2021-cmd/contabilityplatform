// Shared marketing numbers. Prices must match api/lib/plans.ts.
// Texts live in src/i18n/copy/marketing.ts.

export const TRIAL_DAYS = 7;

export type PlanKey = "personal" | "business";

export const PLAN_PRICES: Record<PlanKey, { monthly: number; annual: number }> = {
  personal: { monthly: 40, annual: 400 },
  business: { monthly: 80, annual: 800 },
};

/**
 * Plans shown on the landing page, in two groups: for you (personal) and for your
 * business. Only "personal" (Basic for you) and "business" (Business) are sold today
 * (api/lib/plans.ts and Stripe). The others are announced as "coming soon": their
 * button doesn't open the sign-up for that plan.
 */
export type LandingPlanKey = "personal" | "personalPro" | "basic" | "business" | "pro";
export type LandingGroup = "personal" | "business";
type LandingPlan = { key: LandingPlanKey; mode: PlanKey; monthly: number; annual: number; available: boolean; featured?: boolean };
export const LANDING_PLAN_GROUPS: Record<LandingGroup, LandingPlan[]> = {
  personal: [
    { key: "personal", mode: "personal", ...PLAN_PRICES.personal, available: true },
    { key: "personalPro", mode: "personal", monthly: 70, annual: 700, available: false },
  ],
  business: [
    { key: "basic", mode: "business", monthly: 40, annual: 400, available: false },
    { key: "business", mode: "business", ...PLAN_PRICES.business, available: true, featured: true },
    { key: "pro", mode: "business", monthly: 150, annual: 1500, available: false },
  ],
};

/** Whole-dollar monthly equivalent of the annual price, e.g. 800 -> "$67". */
export function annualPerMonth(annual: number): string {
  return `$${Math.round(annual / 12)}`;
}
