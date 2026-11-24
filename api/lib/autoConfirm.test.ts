import { describe, expect, it } from "vitest";
import { autoReasonFor, type AutoRow } from "./autoConfirm";
import type { Verdict } from "./reviewEngine";

const out = (description: string, category: string, merchantName: string | null = null): AutoRow => ({ description, merchantName, type: "expense", category });
const keyword = (category: string): Pick<Verdict, "kind" | "ask" | "why" | "category"> => ({ kind: "ask", ask: null, why: { code: "keyword" }, category });

describe("what the app confirms by itself (owner, 2026-11-24)", () => {
  it("the person's own rule and their history, in both modes; transfers stay with the person", () => {
    for (const mode of ["business", "personal"] as const) {
      expect(autoReasonFor(out("HOME DEPOT #4821", "shopping"), { kind: "ready", ask: null, why: { code: "rule", pattern: "home depot", category: "shopping" }, category: "shopping" }, mode)).toBe("rule");
      expect(autoReasonFor(out("HOME DEPOT #4821", "shopping"), { kind: "ready", ask: null, why: { code: "history", n: 3 }, category: "shopping" }, mode)).toBe("history");
      expect(autoReasonFor(out("ONLINE TRANSFER TO SAVINGS", "transfer"), { kind: "ready", ask: null, why: { code: "transfer", direction: "to", otherAccountId: 2, date: "2026-11-20" }, category: "transfer" }, mode)).toBeNull();
    }
  });
  it("paying a credit card, in both modes", () => {
    expect(autoReasonFor(out("CAPITAL ONE MOBILE PMT", "card_payment"), keyword("card_payment"), "business")).toBe("card");
    expect(autoReasonFor({ ...out("PAYMENT - THANK YOU", "card_payment"), type: "income" }, keyword("card_payment"), "personal")).toBe("card");
  });
  it("personal: bills known by name and memberships", () => {
    expect(autoReasonFor(out("FLEX FINANCE RENT", "rent"), keyword("rent"), "personal")).toBe("bill");
    expect(autoReasonFor(out("ALABAMA POWER CO", "utilities"), keyword("utilities"), "personal")).toBe("bill");
    expect(autoReasonFor(out("BLUE CROSS BLUE SHIELD AL", "health_insurance"), keyword("health_insurance"), "personal")).toBe("bill");
    expect(autoReasonFor(out("MARC-1 CAR WASH PELHAM AL", "subscription"), keyword("subscription"), "personal")).toBe("service");
    expect(autoReasonFor(out("NETFLIX.COM", "subscription"), { kind: "ask", ask: "bizpersonal", why: { code: "bizpersonal" }, category: "subscription" }, "personal")).toBe("service");
  });
  it("business is careful: rent, power, insurance, memberships could be the owner's home", () => {
    expect(autoReasonFor(out("FLEX FINANCE RENT", "rent"), keyword("rent"), "business")).toBeNull();
    expect(autoReasonFor(out("ALABAMA POWER CO", "utilities"), keyword("utilities"), "business")).toBeNull();
    expect(autoReasonFor(out("NETFLIX.COM", "subscription"), { kind: "ask", ask: "bizpersonal", why: { code: "bizpersonal" }, category: "subscription" }, "business")).toBeNull();
    // A business question blocks even the owner's history.
    expect(autoReasonFor(out("COSTCO WHSE #1083", "wholesale"), { kind: "ask", ask: "split", why: { code: "split" }, category: "wholesale" }, "business")).toBeNull();
  });
  it("never: a possible link to an invoice or bill, a possible duplicate, or something it doesn't know", () => {
    for (const mode of ["business", "personal"] as const) {
      expect(autoReasonFor(out("ALABAMA POWER CO", "utilities"), { kind: "match", ask: null, why: { code: "matchBill", vendor: "Alabama Power", due: "2026-11-30" }, category: "utilities" }, mode)).toBeNull();
      expect(autoReasonFor(out("FLEX FINANCE RENT", "rent"), { kind: "ask", ask: "duplicate", why: { code: "duplicate", date: "2026-11-20" }, category: "rent" }, mode)).toBeNull();
      expect(autoReasonFor(out("ATS ALABASTER AL", "shopping"), keyword("shopping"), mode)).toBeNull();
      expect(autoReasonFor({ ...out("ZELLE FROM ROSA DIAZ", "zelle_income"), type: "income" }, keyword("zelle_income"), mode)).toBeNull();
    }
    // The suggestion has to be the bill's own category.
    expect(autoReasonFor(out("FLEX FINANCE RENT", "shopping"), keyword("shopping"), "personal")).toBeNull();
  });
});

describe("known chains", () => {
  it("personal: confirmed by itself in the category that fits; business keeps asking", () => {
    expect(autoReasonFor(out("ZAXBY'S #123 HOOVER AL", "fast_food"), keyword("fast_food"), "personal")).toBe("chain");
    expect(autoReasonFor(out("PUBLIX SUPER M 1234", "food"), keyword("food"), "personal")).toBe("chain");
    expect(autoReasonFor(out("SHELL OIL 57444211", "gasolina"), keyword("gasolina"), "personal")).toBe("chain");
    expect(autoReasonFor(out("WAL-MART #1234", "retail"), keyword("retail"), "personal")).toBe("chain");
    expect(autoReasonFor(out("ZAXBY'S #123 HOOVER AL", "fast_food"), keyword("fast_food"), "business")).toBeNull();
    // A category that doesn't fit the chain: the person decides.
    expect(autoReasonFor(out("SHELL OIL 57444211", "business_expense"), keyword("business_expense"), "personal")).toBeNull();
    expect(autoReasonFor(out("ATS ALABASTER AL", "shopping"), keyword("shopping"), "personal")).toBeNull();
  });
});

describe("money in known by name, and the new bills", () => {
  it("personal: the paycheck, the tax refund, car insurance, donations and transfers abroad", () => {
    expect(autoReasonFor({ ...out("ADP PAYROLL", "paycheck"), type: "income" }, keyword("paycheck"), "personal")).toBe("income");
    expect(autoReasonFor({ ...out("IRS TREAS 310 TAX REF", "tax_refund"), type: "income" }, keyword("tax_refund"), "personal")).toBe("income");
    expect(autoReasonFor(out("GEICO *AUTO", "car_insurance"), keyword("car_insurance"), "personal")).toBe("bill");
    expect(autoReasonFor(out("FIRST BAPTIST CHURCH", "donations"), keyword("donations"), "personal")).toBe("bill");
    expect(autoReasonFor(out("REMITLY* SEND MONEY", "remittance"), keyword("remittance"), "personal")).toBe("bill");
    expect(autoReasonFor({ ...out("ADP PAYROLL", "paycheck"), type: "income" }, keyword("paycheck"), "business")).toBeNull();
  });
});
