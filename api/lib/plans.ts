// ── Plan prices (US cents) ──
// The account's mode decides which plans exist, and the plan (tier) decides the
// price. Always read the mode from the user's DB row, never from client input,
// or a business account could pay a personal price.
//
//   Business:  Básico $40/$400 · Negocio $80/$800 · Pro $150/$1500
//   Personal:  Básico free (taxes) · Pro $40/$400 (accounting)
//
// Keep src/components/marketing/content.ts (landing prices) in step with this file.

export type Plan = "monthly" | "annual";
export type AccountMode = "business" | "personal";
export type Tier = "basic" | "standard" | "pro";

const PRICES: Record<AccountMode, Partial<Record<Tier, Record<Plan, number>>>> = {
  business: {
    basic: { monthly: 4000, annual: 40000 }, // $40 / $400
    standard: { monthly: 8000, annual: 80000 }, // $80 / $800
    pro: { monthly: 15000, annual: 150000 }, // $150 / $1500
  },
  personal: {
    // "basic" is free: no checkout.
    pro: { monthly: 4000, annual: 40000 }, // $40 / $400
  },
};

export function accountMode(modePreference: string | null | undefined): AccountMode {
  return modePreference === "personal" ? "personal" : "business";
}

/** The plan sold before tiers existed: Negocio for business, Pro for personal (same prices as before). */
export function defaultTier(mode: AccountMode): Tier {
  return mode === "business" ? "standard" : "pro";
}

/** True when this tier can be bought for this mode (personal Básico is free, so it can't). */
export function isPaidTier(mode: AccountMode, tier: Tier): boolean {
  return PRICES[mode][tier] !== undefined;
}

export function planAmountCents(plan: Plan, mode: AccountMode, tier: Tier = defaultTier(mode)): number {
  const prices = PRICES[mode][tier];
  if (!prices) throw new Error(`No price for ${mode}/${tier}`);
  return prices[plan];
}

/** Which tier a payment was for, from what Stripe charged. Null when the amount matches no plan. */
export function tierFromAmountCents(cents: number, plan: Plan, mode: AccountMode): Tier | null {
  for (const [tier, prices] of Object.entries(PRICES[mode]) as [Tier, Record<Plan, number>][]) {
    if (prices[plan] === cents) return tier;
  }
  return null;
}

/** Plan names as the customer sees them, for Stripe products and receipts. */
export function tierName(mode: AccountMode, tier: Tier): string {
  if (tier === "basic") return "Básico";
  if (tier === "pro") return "Pro";
  return mode === "business" ? "Negocio" : "Pro";
}

/**
 * Stable Stripe lookup key per recurring price. The plans that existed before tiers
 * (business Negocio, personal Pro) keep their original keys.
 */
export function priceLookupKey(plan: Plan, mode: AccountMode, tier: Tier = defaultTier(mode)): string {
  if (mode === "business" && tier === "standard") return plan === "monthly" ? "contability_monthly_80" : "contability_annual_800";
  if (mode === "personal" && tier === "pro") return plan === "monthly" ? "aethel_personal_monthly_40" : "aethel_personal_annual_400";
  const dollars = planAmountCents(plan, mode, tier) / 100;
  return `pbs_${mode}_${tier}_${plan}_${dollars}`;
}
