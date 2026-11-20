// ── Plan prices (US cents) ──
// The account's mode decides the price. Always read the mode from the user's
// DB row, never from client input, or a business account could pay the
// personal price.

export type Plan = "monthly" | "annual";
export type AccountMode = "business" | "personal";

const PRICES: Record<AccountMode, Record<Plan, number>> = {
  business: { monthly: 8000, annual: 80000 }, // $80 / $800
  personal: { monthly: 4000, annual: 40000 }, // $40 / $400
};

export function accountMode(modePreference: string | null | undefined): AccountMode {
  return modePreference === "personal" ? "personal" : "business";
}

export function planAmountCents(plan: Plan, mode: AccountMode): number {
  return PRICES[mode][plan];
}

/** Stable Stripe lookup key per recurring price. Business keys keep their original names. */
export function priceLookupKey(plan: Plan, mode: AccountMode): string {
  if (mode === "business") return plan === "monthly" ? "contability_monthly_80" : "contability_annual_800";
  return plan === "monthly" ? "aethel_personal_monthly_40" : "aethel_personal_annual_400";
}
