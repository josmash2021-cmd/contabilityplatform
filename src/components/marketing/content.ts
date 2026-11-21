// Shared marketing numbers. Prices must match api/lib/plans.ts.
// Texts live in src/i18n/copy/marketing.ts.

export const TRIAL_DAYS = 7;

export type PlanKey = "personal" | "business";
/** Same tiers as api/lib/plans.ts: basic (Básico), pro (Pro) and business (Negocio). */
export type PlanTier = "basic" | "pro" | "business";

/**
 * Plans shown on the landing page and in the in-app plan picker, in two groups:
 * for you (personal) and for your business. Prices must match api/lib/plans.ts.
 * Personal Básico is free (taxes); personal Pro unlocks the accounting.
 */
export type LandingPlanKey = "personal" | "personalPro" | "basic" | "business" | "pro";
export type LandingGroup = "personal" | "business";
export type LandingPlan = { key: LandingPlanKey; mode: PlanKey; tier: PlanTier; monthly: number; annual: number; free?: boolean; featured?: boolean };
export const LANDING_PLAN_GROUPS: Record<LandingGroup, LandingPlan[]> = {
  personal: [
    { key: "personal", mode: "personal", tier: "basic", monthly: 0, annual: 0, free: true },
    { key: "personalPro", mode: "personal", tier: "pro", monthly: 40, annual: 400, featured: true },
  ],
  business: [
    { key: "basic", mode: "business", tier: "basic", monthly: 40, annual: 400 },
    { key: "pro", mode: "business", tier: "pro", monthly: 80, annual: 800, featured: true },
    { key: "business", mode: "business", tier: "business", monthly: 150, annual: 1500 },
  ],
};

/** The plan for this mode and tier, as sold on the landing page. */
export function findPlan(mode: PlanKey, tier: PlanTier | null | undefined): LandingPlan | undefined {
  return tier ? LANDING_PLAN_GROUPS[mode].find((p) => p.tier === tier) : undefined;
}

/** The plan picked on the landing page, kept from sign-up until the trial ends. */
export const CHOSEN_PLAN_KEY = "pbs_plan";

/** Whole-dollar monthly equivalent of the annual price, e.g. 800 -> "$67". */
export function annualPerMonth(annual: number): string {
  return `$${Math.round(annual / 12)}`;
}
