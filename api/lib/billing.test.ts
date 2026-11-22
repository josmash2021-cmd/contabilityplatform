import { describe, expect, it } from "vitest";
import { getTrialInfo, TRIAL_LAUNCH } from "./trial";
import { accountMode, bankLimit, isPaidTier, planAmountCents, priceLookupKey, tierFromAmountCents, tierName } from "./plans";

const DAY = 24 * 60 * 60 * 1000;
const at = (iso: string) => new Date(iso);

describe("getTrialInfo", () => {
  it("gives a new account 7 days", () => {
    const t = getTrialInfo(at("2026-11-21T10:00:00Z"), at("2026-11-21T10:00:00Z"));
    expect(t).toEqual({ active: true, endsAt: "2026-11-28T10:00:00.000Z", daysLeft: 7 });
  });

  it("counts days left rounding up", () => {
    const t = getTrialInfo(at("2026-11-21T10:00:00Z"), at("2026-11-27T09:00:00Z"));
    expect(t?.active).toBe(true);
    expect(t?.daysLeft).toBe(2); // 25h left -> 2 days
  });

  it("ends exactly after 7 days", () => {
    const t = getTrialInfo(at("2026-11-21T10:00:00Z"), at("2026-11-28T10:00:00Z"));
    expect(t).toMatchObject({ active: false, daysLeft: 0 });
  });

  it("does not apply to accounts created before the launch", () => {
    expect(getTrialInfo(new Date(TRIAL_LAUNCH.getTime() - DAY))).toBeNull();
    expect(getTrialInfo(at("2026-06-01T00:00:00Z"))).toBeNull();
  });

  it("handles missing or invalid dates", () => {
    expect(getTrialInfo(null)).toBeNull();
    expect(getTrialInfo(undefined)).toBeNull();
    expect(getTrialInfo("not a date")).toBeNull();
  });
});

describe("plan prices", () => {
  it("business pays $80 / $800", () => {
    expect(planAmountCents("monthly", "business")).toBe(8000);
    expect(planAmountCents("annual", "business")).toBe(80000);
  });

  it("personal pays $40 / $400", () => {
    expect(planAmountCents("monthly", "personal")).toBe(4000);
    expect(planAmountCents("annual", "personal")).toBe(40000);
  });

  it("unknown or missing mode falls back to business", () => {
    expect(accountMode(null)).toBe("business");
    expect(accountMode("business")).toBe("business");
    expect(accountMode("personal")).toBe("personal");
  });

  it("uses distinct Stripe lookup keys per mode and plan", () => {
    const keys = new Set([
      priceLookupKey("monthly", "business"),
      priceLookupKey("annual", "business"),
      priceLookupKey("monthly", "personal"),
      priceLookupKey("annual", "personal"),
    ]);
    expect(keys.size).toBe(4);
    expect(priceLookupKey("monthly", "business")).toBe("contability_monthly_80");
  });
});

describe("plan tiers", () => {
  it("business Básico, Pro and Negocio cost $40, $80 and $150 a month", () => {
    expect(planAmountCents("monthly", "business", "basic")).toBe(4000);
    expect(planAmountCents("monthly", "business", "pro")).toBe(8000);
    expect(planAmountCents("monthly", "business", "business")).toBe(15000);
    expect(planAmountCents("annual", "business", "basic")).toBe(40000);
    expect(planAmountCents("annual", "business", "business")).toBe(150000);
  });

  it("personal Pro costs $40 / $400 and personal Básico is free (no checkout)", () => {
    expect(planAmountCents("monthly", "personal", "pro")).toBe(4000);
    expect(planAmountCents("annual", "personal", "pro")).toBe(40000);
    expect(isPaidTier("personal", "basic")).toBe(false);
    expect(isPaidTier("personal", "business")).toBe(false);
    expect(() => planAmountCents("monthly", "personal", "basic")).toThrow();
    expect(isPaidTier("business", "basic")).toBe(true);
  });

  it("without a tier, keeps the price sold before tiers existed", () => {
    expect(planAmountCents("monthly", "business")).toBe(planAmountCents("monthly", "business", "pro"));
    expect(priceLookupKey("monthly", "business", "pro")).toBe("contability_monthly_80");
    expect(planAmountCents("monthly", "personal")).toBe(planAmountCents("monthly", "personal", "pro"));
    expect(priceLookupKey("annual", "personal", "pro")).toBe("aethel_personal_annual_400");
  });

  it("gives every paid plan its own Stripe lookup key", () => {
    const keys = new Set<string>();
    for (const plan of ["monthly", "annual"] as const) {
      for (const tier of ["basic", "pro", "business"] as const) keys.add(priceLookupKey(plan, "business", tier));
      keys.add(priceLookupKey(plan, "personal", "pro"));
    }
    expect(keys.size).toBe(8);
    expect(priceLookupKey("monthly", "business", "business")).toBe("pbs_business_business_monthly_150");
  });

  it("recognizes the tier from what Stripe charged", () => {
    expect(tierFromAmountCents(4000, "monthly", "business")).toBe("basic");
    expect(tierFromAmountCents(80000, "annual", "business")).toBe("pro");
    expect(tierFromAmountCents(15000, "monthly", "business")).toBe("business");
    expect(tierFromAmountCents(4000, "monthly", "personal")).toBe("pro");
    expect(tierFromAmountCents(1234, "monthly", "business")).toBeNull();
  });

  it("names the plans like the landing page", () => {
    expect(tierName("business", "basic")).toBe("Básico");
    expect(tierName("business", "pro")).toBe("Pro");
    expect(tierName("business", "business")).toBe("Negocio");
    expect(tierName("personal", "pro")).toBe("Pro");
  });
});

describe("banks per plan", () => {
  it("business Básico, Pro and Negocio connect 1, 3 and 6 banks", () => {
    expect(bankLimit("business", "basic")).toBe(1);
    expect(bankLimit("business", "pro")).toBe(3);
    expect(bankLimit("business", "business")).toBe(6);
  });

  it("without a known paid plan (trial), business gets the most a plan allows", () => {
    expect(bankLimit("business", null)).toBe(6);
  });

  it("personal accounts connect up to 4 banks (Pro; also during the trial)", () => {
    expect(bankLimit("personal", "pro")).toBe(4);
    expect(bankLimit("personal", null)).toBe(4);
  });
});
