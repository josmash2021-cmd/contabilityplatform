// Shared marketing numbers. Prices must match api/lib/plans.ts.
// Texts live in src/i18n/copy/marketing.ts.

export const TRIAL_DAYS = 7;

export type PlanKey = "personal" | "business";

export const PLAN_PRICES: Record<PlanKey, { monthly: number; annual: number }> = {
  personal: { monthly: 40, annual: 400 },
  business: { monthly: 80, annual: 800 },
};

/** Whole-dollar monthly equivalent of the annual price, e.g. 800 -> "$67". */
export function annualPerMonth(annual: number): string {
  return `$${Math.round(annual / 12)}`;
}
