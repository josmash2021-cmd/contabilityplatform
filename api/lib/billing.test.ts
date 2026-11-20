import { describe, expect, it } from "vitest";
import { getTrialInfo, TRIAL_LAUNCH } from "./trial";
import { accountMode, planAmountCents, priceLookupKey } from "./plans";

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
