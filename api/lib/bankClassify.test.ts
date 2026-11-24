import { describe, expect, it } from "vitest";
import { determineTypeAndCategory } from "../bank-router";

// Plaid's amount: positive = money out, negative = money in. Categories: [primary, detailed].
const cat = (desc: string, amount = 50, primary = "", detailed = "") => determineTypeAndCategory(amount, primary ? [primary, detailed] : [], desc);

describe("the bank's classifier with the known bills (owner, 2026-11-24)", () => {
  it("paying a credit card is a card payment, not a purchase, on both sides", () => {
    expect(cat("CAPITAL ONE MOBILE PMT", 150)).toEqual({ type: "expense", category: "card_payment" });
    expect(cat("CHASE CREDIT CRD AUTOPAY", 35)).toEqual({ type: "expense", category: "card_payment" });
    expect(cat("PAYMENT - THANK YOU", -150)).toEqual({ type: "income", category: "card_payment" });
    expect(cat("ONLINE PMT 1102", 220, "LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT")).toEqual({ type: "expense", category: "card_payment" });
  });
  it("lenders are loans; Flex is rent; Alabama Power is utilities; Blue Cross is health insurance; the SOS is government", () => {
    expect(cat("UPSTART NETWORK", 180).category).toBe("loan");
    expect(cat("ADVANCE AMERICA 0123", 95).category).toBe("loan");
    expect(cat("AFFIRM * PAY", 60).category).toBe("loan");
    expect(cat("FLEX FINANCE", 900)).toEqual({ type: "expense", category: "rent" });
    expect(cat("ALABAMA POWER CO", 140)).toEqual({ type: "expense", category: "utilities" });
    expect(cat("BLUE CROSS BLUE SHIELD AL", 320)).toEqual({ type: "expense", category: "health_insurance" });
    expect(cat("ALABAMA SECRETARY OF STATE", 50)).toEqual({ type: "expense", category: "government" });
  });
  it("Plaid's rent and utilities categories no longer land in Compras", () => {
    expect(cat("PURCHASE 11/02 RSV", 950, "RENT_AND_UTILITIES", "RENT_AND_UTILITIES_RENT").category).toBe("rent");
    expect(cat("ONLINE PMT 8812", 80, "RENT_AND_UTILITIES", "RENT_AND_UTILITIES_TELEPHONE").category).toBe("utilities");
    expect(cat("PURCHASE TURBO BOOST", 20, "RENT_AND_UTILITIES", "RENT_AND_UTILITIES_RENT").category).toBe("shopping");
  });
  it("money back from a bill is a refund; money in from a lender is left as before", () => {
    expect(cat("ALABAMA POWER CO REFUND", -40)).toEqual({ type: "income", category: "refund" });
    expect(cat("EARNIN ACTIVEHOURS", -100).type).toBe("income");
  });
  it("everything else is as it was", () => {
    expect(cat("NETFLIX.COM", 15.99).category).toBe("subscription");
    expect(cat("ZELLE TO JUAN PEREZ", 40).category).toBe("zelle_sent");
    expect(cat("SHELL OIL 57444211", 45).category).toBe("gasolina");
    expect(cat("WALMART SUPERCENTER", 60).category).toBe("retail");
    expect(cat("ATS ALABASTER AL", 75).category).toBe("shopping");
    expect(cat("RENT-A-CENTER #1234", 75).category).not.toBe("rent");
  });
});

import { displayNameOf } from "./reviewEngine";
describe("the names shown for cards, loans and bills", () => {
  it("the brand, without the bank's extra words", () => {
    const cases: Array<[string, string]> = [
      ["CAPITAL ONE MOBILE PMT 1105", "Capital One"], ["DISCOVER E-PAYMENT 7731", "Discover"], ["FLEX FINANCE RENT", "Flex"],
      ["ALABAMA POWER CO BILL PAY", "Alabama Power"], ["BLUE CROSS BLUE SHIELD AL", "Blue Cross Blue Shield"], ["AFFIRM * PAY 8XYZ", "Affirm"],
      ["PAYMENT - THANK YOU", "Payment - Thank You"], ["Payment Thank You-Mobile", "Payment - Thank You"],
    ];
    for (const [d, name] of cases) expect(displayNameOf(d, null), d).toBe(name);
    expect(displayNameOf("ATS ALABASTER AL", "AT&T")).toBe("Ats Alabaster");
  });
});

import { detectSubscriptions, isExcluded } from "./subscriptions";
describe("car washes are memberships (owner, 2026-11-24)", () => {
  it("the classifier puts them in Suscripciones y membresías, even at a gas station", () => {
    for (const d of ["MISTER CAR WASH #123", "QUICK QUACK CAR WASH 0045", "SHELL CAR WASH 57444211", "TIDAL WAVE AUTO SPA", "ZIPS CAR WASH 221", "CIRCLE K CARWASH"]) {
      expect(cat(d, 29.99), d).toEqual({ type: "expense", category: "subscription" });
    }
    expect(cat("SHELL OIL 57444211", 40).category).toBe("gasolina");
    expect(cat("TAKE 5 OIL CHANGE", 60).category).not.toBe("subscription");
  });
  it("a monthly car wash membership shows on the Suscripciones y membresías page", () => {
    expect(isExcluded({ description: "SHELL CAR WASH 57444211", category: "subscription" })).toBe(false);
    const txs = ["2026-08-15", "2026-09-15", "2026-10-15", "2026-11-15"].map((date, i) => ({ id: i, date, description: "MISTER CAR WASH #123 HOOVER AL", amount: 29.99, category: "subscription" }));
    const found = detectSubscriptions(txs, "2026-11-24");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ freq: "month", amount: 29.99 });
  });
});

import { bankSpendCategory } from "./expenses";
describe("Gastos: a car wash membership is a vehicle cost", () => {
  it("not software", () => {
    expect(bankSpendCategory("subscription", "MISTER CAR WASH #123 HOOVER AL")).toBe("vehicle");
    expect(bankSpendCategory("subscription", "NETFLIX.COM")).toBe("software");
    expect(bankSpendCategory("government", "ALABAMA SECRETARY OF STATE")).toBe("licenses");
  });
});

import { bundledMerchantLogo } from "./brand";
import { knownServiceOf } from "./subscriptions";
describe("the car wash chains, with Marc-1 (Alabama)", () => {
  it("are memberships by name, even when the bank doesn't write 'car wash'", () => {
    for (const d of ["MARC-1 CAR WASH PELHAM AL", "MARC 1 ALABASTER AL", "MCW 1607RIVERSIDE AVE", "ZIPS #123 BIRMINGHAM AL 855-947-7927", "TOMMYS EXPRESS 0042", "WHISTLE EXPRESS 221", "MODWASH 14", "AUTOBELL 0091", "TIDAL WAVE AUTO SPA", "GOO GOO EXPRESS WASH"]) {
      expect(cat(d, 25).category, d).toBe("subscription");
    }
    expect(cat("ZIPS DRY CLEANERS", 18).category).not.toBe("subscription");
  });
  it("show their official logo", () => {
    const cases: Array<[string, string]> = [
      ["MISTER CAR WASH #123", "mister-car-wash"], ["QUICK QUACK CAR WASH 0045", "quick-quack"], ["ZIPS CAR WASH 221", "zips"], ["TAKE 5 CAR WASH 0099", "take-5-car-wash"],
      ["TOMMY'S EXPRESS CAR WASH", "tommys-express"], ["WHISTLE EXPRESS CAR WASH", "whistle-express"], ["CLUB CAR WASH 12", "club-car-wash"], ["MODWASH 14", "modwash"],
      ["AUTOBELL CAR WASH 0091", "autobell"], ["ROCKET EXPRESS WASH", "rocket-express"], ["JET BRITE CAR WASH", "jet-brite"], ["CREW CARWASH 33", "crew-carwash"],
      ["MR CLEAN CAR WASH", "mr-clean-car-wash"], ["HURRICANE EXPRESS WASH", "hurricane-express-wash"],
    ];
    for (const [text, icon] of cases) expect(bundledMerchantLogo(text), text).toBe(`/brands/merchants/${icon}.png`);
    expect(bundledMerchantLogo("TAKE 5 OIL CHANGE")).toBeNull();
  });
  it("are known memberships with a clean name", () => {
    expect(knownServiceOf("MARC-1 CAR WASH PELHAM AL")).toMatchObject({ key: "marc-1", name: "Marc-1 Car Wash" });
    expect(knownServiceOf("MISTER CAR WASH #123 HOOVER AL")).toMatchObject({ key: "mister-car-wash", name: "Mister Car Wash" });
    expect(knownServiceOf("TIDAL WAVE AUTO SPA 0012")).toMatchObject({ key: "tidal-wave" });
  });
});

describe("car wash names", () => {
  it("read well even when the bank text starts with a code", () => {
    expect(displayNameOf("MARC-1 CAR WASH PELHAM AL", "MARC-1 CAR WASH PELHAM AL")).toBe("Marc-1 Car Wash");
    expect(displayNameOf("MCW 1607RIVERSIDE AVE", null)).toBe("Mister Car Wash");
    expect(displayNameOf("ZIPS #123 BIRMINGHAM AL 855-947-7927", null)).toBe("ZIPS Car Wash");
    expect(displayNameOf("ZIPS DRY CLEANERS", null)).toBe("Zips Dry Cleaners");
  });
});
