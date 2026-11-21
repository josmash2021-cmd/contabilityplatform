import { describe, expect, it } from "vitest";
import {
  addMonths, cancelRoute, cleanMerchantText, detectSubscriptions, isExcluded, knownServiceOf, manualNext, merchantKeyOf, nextCharge, perYear, type DetectTx,
} from "./subscriptions";

const TODAY = "2026-11-21";
const tx = (date: string, description: string, amount: number, extra: Partial<DetectTx> = {}): DetectTx => ({ date, description, amount, ...extra });
const find = (list: ReturnType<typeof detectSubscriptions>, key: string) => list.find((s) => s.key === key);

describe("merchant names", () => {
  it("cleans card numbers, dates, store numbers and reference codes", () => {
    expect(cleanMerchantText("PURCHASE AUTHORIZED ON 11/09 SHELL OIL 5741 CARD 4410")).toBe("shell oil");
    expect(cleanMerchantText("ACME CLOUD STORAGE 800-555-0100 #4411")).toContain("acme cloud storage");
  });
  it("groups the same service under one key", () => {
    expect(merchantKeyOf("NETFLIX.COM")).toBe("netflix");
    expect(merchantKeyOf("Netflix 866-579-7172 CA")).toBe("netflix");
    expect(merchantKeyOf("AMAZON PRIME*1A2B3C4D")).toBe("amazon-prime");
    expect(merchantKeyOf("APPLE.COM/BILL 866-712-7753")).toBe("app-store");
    expect(merchantKeyOf("ACME CLOUD STORAGE 0042")).toBe(merchantKeyOf("ACME CLOUD STORAGE 0117"));
  });
  it("knows how a service is paid", () => {
    expect(knownServiceOf("APPLE.COM/BILL")?.via).toBe("apple");
    expect(knownServiceOf("GOOGLE *YouTubePremium")?.key).toBe("youtube-premium");
    expect(knownServiceOf("NETFLIX.COM")?.video).toBe(true);
    expect(knownServiceOf("SHELL OIL 5741")).toBeNull();
  });
  it("never treats gas, groceries or transfers as subscriptions", () => {
    expect(isExcluded({ description: "SHELL OIL 5741" })).toBe(true);
    expect(isExcluded({ description: "CHEVRON 0091" })).toBe(true);
    expect(isExcluded({ description: "PUBLIX SUPER MARKETS" })).toBe(true);
    expect(isExcluded({ description: "ZELLE TO MARIA TORRES" })).toBe(true);
    expect(isExcluded({ description: "DISCOVER E-PAYMENT" , category: "transfer" })).toBe(true);
    expect(isExcluded({ description: "SPOTIFY USA" })).toBe(false);
  });
});

describe("detectSubscriptions", () => {
  it("finds true monthly charges, with the price, the next charge and the yearly cost", () => {
    const list = detectSubscriptions([
      tx("2026-08-09", "NETFLIX.COM", 15.49), tx("2026-09-09", "NETFLIX.COM", 15.49), tx("2026-10-09", "NETFLIX.COM", 15.49), tx("2026-11-09", "NETFLIX.COM", 15.49),
      tx("2026-09-01", "ACME CLOUD STORAGE 0042", 4.99), tx("2026-10-01", "ACME CLOUD STORAGE 0117", 4.99), tx("2026-11-01", "ACME CLOUD STORAGE 0042", 4.99),
    ], TODAY);
    const nf = find(list, "netflix");
    expect(nf).toBeDefined();
    expect(nf).toMatchObject({ name: "Netflix", freq: "month", amount: 15.49, next: "2026-12-09", active: true, first: "2026-08-09", video: true });
    expect(nf!.history).toHaveLength(4);
    expect(perYear(nf!.amount, nf!.freq)).toBe(185.88);
    const acme = list.find((s) => s.name.startsWith("Acme Cloud Storage"));
    expect(acme).toMatchObject({ freq: "month", amount: 4.99, next: "2026-12-01", known: false });
  });

  it("does NOT treat a gas station charged twice as a subscription", () => {
    const list = detectSubscriptions([tx("2026-11-07", "SHELL OIL 5741", 48.2, { category: "gasolina" }), tx("2026-11-18", "SHELL OIL 5741", 52.75, { category: "gasolina" })], TODAY);
    expect(list).toEqual([]);
    // Not even a month apart, at the same price, without the category.
    expect(detectSubscriptions([tx("2026-10-07", "SHELL OIL 5741", 40), tx("2026-11-07", "SHELL OIL 5741", 40), tx("2026-09-07", "SHELL OIL 5741", 40)], TODAY)).toEqual([]);
  });

  it("does NOT count any merchant charged twice", () => {
    // An unknown merchant twice, a month apart: not enough (needs 3).
    expect(detectSubscriptions([tx("2026-10-03", "JOES PIZZA KITCHEN", 20), tx("2026-11-03", "JOES PIZZA KITCHEN", 20)], TODAY)).toEqual([]);
    // Three times but at very different prices: a store, not a subscription.
    expect(detectSubscriptions([tx("2026-09-12", "BEST GADGETS", 19.99), tx("2026-10-12", "BEST GADGETS", 74.5), tx("2026-11-12", "BEST GADGETS", 230)], TODAY)).toEqual([]);
    // Three times at the same price but at random intervals.
    expect(detectSubscriptions([tx("2026-07-02", "PARKING GARAGE", 10), tx("2026-07-19", "PARKING GARAGE", 10), tx("2026-11-15", "PARKING GARAGE", 10)], TODAY)).toEqual([]);
  });

  it("accepts a known service with 2 charges and notices a price rise", () => {
    const list = detectSubscriptions([tx("2026-10-03", "SPOTIFY USA", 10.99), tx("2026-11-03", "SPOTIFY USA", 11.99)], TODAY);
    expect(find(list, "spotify")).toMatchObject({ freq: "month", amount: 11.99, raised: { from: 10.99, to: 11.99 }, next: "2026-12-03" });
  });

  it("finds yearly and weekly charges", () => {
    const list = detectSubscriptions([
      tx("2024-12-12", "AMAZON PRIME*AB12CD", 139), tx("2025-12-12", "AMAZON PRIME*ZX98QW", 139),
      tx("2026-10-24", "SUNDAY TIMES DELIVERY", 3.5), tx("2026-10-31", "SUNDAY TIMES DELIVERY", 3.5), tx("2026-11-07", "SUNDAY TIMES DELIVERY", 3.5), tx("2026-11-14", "SUNDAY TIMES DELIVERY", 3.5),
    ], TODAY);
    expect(find(list, "amazon-prime")).toMatchObject({ freq: "year", next: "2026-12-12", amount: 139 });
    const weekly = list.find((s) => s.freq === "week");
    expect(weekly).toMatchObject({ amount: 3.5, next: "2026-11-21" });
  });

  it("keeps the charge at its price when the same merchant also has one-off purchases", () => {
    const list = detectSubscriptions([
      tx("2026-09-01", "24 HOUR FITNESS USA", 29.99), tx("2026-10-01", "24 HOUR FITNESS USA", 29.99), tx("2026-11-01", "24 HOUR FITNESS USA", 29.99),
      tx("2026-10-15", "24 HOUR FITNESS USA", 89), // a one-time fee
    ], TODAY);
    expect(find(list, "24-hour-fitness")).toMatchObject({ amount: 29.99, freq: "month" });
    expect(find(list, "24-hour-fitness")!.history).toHaveLength(3);
  });

  it("marks a subscription that stopped as inactive", () => {
    const list = detectSubscriptions([tx("2026-05-05", "HULU 877-8244858", 7.99), tx("2026-06-05", "HULU 877-8244858", 7.99), tx("2026-07-05", "HULU 877-8244858", 7.99)], TODAY);
    expect(find(list, "hulu")?.active).toBe(false);
  });

  it("ignores money coming in and empty rows", () => {
    expect(detectSubscriptions([tx("2026-10-01", "NETFLIX.COM", -15.49), tx("2026-11-01", "NETFLIX.COM", 0)], TODAY)).toEqual([]);
  });
});

describe("dates", () => {
  it("adds months keeping the end of the month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  });
  it("shows a slightly late charge as today and skips a long-missed one", () => {
    expect(nextCharge("2026-10-19", "month", TODAY)).toBe(TODAY);
    expect(nextCharge("2026-10-01", "month", TODAY)).toBe("2026-12-01");
  });
  it("computes the next charge of a manual subscription", () => {
    expect(manualNext("month", TODAY, 10)).toBe("2026-12-10");
    expect(manualNext("month", TODAY, 25)).toBe("2026-11-25");
    expect(manualNext("year", TODAY, 10, 1)).toBe("2027-01-10");
    expect(manualNext("week", TODAY, 1, null, 1)).toBe("2026-11-23"); // 21 nov 2026 is a Saturday
  });
  it("knows where to cancel", () => {
    expect(cancelRoute("netflix", null)).toEqual({ kind: "web", url: "https://www.netflix.com/cancelplan" });
    expect(cancelRoute("app-store", "apple").kind).toBe("apple");
    expect(cancelRoute("acme", null)).toEqual({ kind: "none", url: null });
  });
});
