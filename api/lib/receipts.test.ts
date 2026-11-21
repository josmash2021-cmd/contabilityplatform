import { describe, expect, it } from "vitest";
import {
  MAX_RECEIPT_AMOUNT, RECEIPT_CATEGORIES, centsToDecimal, compareMonths, isIsoDate, isReceiptCategory, isoDateOf,
  monthRange, monthStartUtc, parseAmount, receiptTotals, receiptUsage, shiftMonth, toCents,
} from "./receipts";

describe("receiptUsage (monthly cap)", () => {
  it("Básico: 20 a month, counting down", () => {
    expect(receiptUsage("basic", 0)).toEqual({ used: 0, cap: 20, remaining: 20, canUpload: true });
    expect(receiptUsage("basic", 19)).toEqual({ used: 19, cap: 20, remaining: 1, canUpload: true });
  });
  it("Básico: blocks at and above the cap", () => {
    expect(receiptUsage("basic", 20)).toEqual({ used: 20, cap: 20, remaining: 0, canUpload: false });
    expect(receiptUsage("basic", 27)).toMatchObject({ remaining: 0, canUpload: false });
  });
  it("Pro and Negocio: no cap", () => {
    expect(receiptUsage("pro", 500)).toEqual({ used: 500, cap: null, remaining: null, canUpload: true });
    expect(receiptUsage("business", 10_000)).toMatchObject({ cap: null, canUpload: true });
  });
  it("the month starts over on the 1st (UTC)", () => {
    expect(monthStartUtc(new Date("2026-11-21T15:30:00Z")).toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(monthStartUtc(new Date("2027-01-01T00:00:00Z")).toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
  it("ignores bad counts", () => {
    expect(receiptUsage("basic", -3).used).toBe(0);
    expect(receiptUsage("basic", Number.NaN).used).toBe(0);
    expect(receiptUsage("basic", 4.7).used).toBe(4);
  });
});

describe("receiptTotals", () => {
  it("adds in cents (no float drift) and groups by category, biggest first", () => {
    const t = receiptTotals([
      { category: "fuel", amount: "0.10" },
      { category: "fuel", amount: 0.2 },
      { category: "meals", amount: "45.50" },
      { category: "supplies", amount: "12.00" },
      { category: "meals", amount: 4.5 },
    ]);
    expect(t.total).toBe(62.3);
    expect(t.count).toBe(5);
    expect(t.byCategory).toEqual([
      { category: "meals", total: 50, count: 2 },
      { category: "supplies", total: 12, count: 1 },
      { category: "fuel", total: 0.3, count: 2 },
    ]);
  });
  it("breaks ties by category name", () => {
    const t = receiptTotals([{ category: "tools", amount: 5 }, { category: "fees", amount: 5 }]);
    expect(t.byCategory.map((c) => c.category)).toEqual(["fees", "tools"]);
  });
  it("empty month", () => {
    expect(receiptTotals([])).toEqual({ total: 0, count: 0, byCategory: [] });
  });
});

describe("amounts", () => {
  it("parses what people type", () => {
    expect(parseAmount("12")).toBe(12);
    expect(parseAmount(" $12.5 ")).toBe(12.5);
    expect(parseAmount("1,234.56")).toBe(1234.56);
    expect(parseAmount("12,50")).toBe(12.5);
    expect(parseAmount("1,234")).toBe(1234);
    expect(parseAmount("0.01")).toBe(0.01);
  });
  it("rejects non-amounts", () => {
    for (const bad of ["", "abc", "0", "0.00", "-5", "12.345", "1e3", "12.", String(MAX_RECEIPT_AMOUNT + 1)]) {
      expect(parseAmount(bad), bad).toBeNull();
    }
    expect(parseAmount(String(MAX_RECEIPT_AMOUNT))).toBe(MAX_RECEIPT_AMOUNT);
  });
  it("cents round-trip to DECIMAL strings", () => {
    expect(toCents("19.99")).toBe(1999);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(centsToDecimal(1999)).toBe("19.99");
    expect(centsToDecimal(5)).toBe("0.05");
    expect(centsToDecimal(120000)).toBe("1200.00");
  });
});

describe("dates and months", () => {
  it("accepts only real YYYY-MM-DD dates", () => {
    expect(isIsoDate("2026-11-21")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-1-01")).toBe(false);
    expect(isIsoDate("1999-12-31")).toBe(false);
    expect(isIsoDate("2026-11-21' OR 1=1 --")).toBe(false);
  });
  it("formats the local date", () => {
    expect(isoDateOf(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
  it("month ranges cross the year", () => {
    expect(monthRange(2026, 11)).toEqual({ start: "2026-11-01", end: "2026-12-01" });
    expect(monthRange(2026, 12)).toEqual({ start: "2026-12-01", end: "2027-01-01" });
  });
  it("moves between months", () => {
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(compareMonths({ year: 2026, month: 3 }, { year: 2025, month: 12 })).toBeGreaterThan(0);
    expect(compareMonths({ year: 2026, month: 3 }, { year: 2026, month: 3 })).toBe(0);
  });
});

describe("categories", () => {
  it("knows its keys", () => {
    expect(RECEIPT_CATEGORIES).toContain("other");
    expect(isReceiptCategory("fuel")).toBe(true);
    expect(isReceiptCategory("drop table")).toBe(false);
  });
});

// The router's input checks run before anything reaches MySQL (DATABASE_URL points at a closed port).
describe("receipts router rejects bad input before the database", () => {
  process.env.JWT_SECRET ??= "vitest-only-secret-0123456789abcdef";
  process.env.DATABASE_URL = "mysql://test:test@127.0.0.1:1/none";
  const user = { id: 999_002, email: "receipts@test.local", role: "user", name: "Test", modePreference: "business" };
  const file = { fileName: "r.jpg", mimeType: "image/jpeg", dataBase64: "/9j/4AAQSkZJRgABAQ==" };
  const good = { merchant: "Home Depot", amount: 25.5, date: "2026-11-21", category: "supplies", paymentMethod: "card", file };

  async function code(call: (c: Record<string, (input?: unknown) => Promise<unknown>>) => Promise<unknown>, withUser = true): Promise<string> {
    const { receiptsRouter } = await import("../receipts-router");
    const caller = receiptsRouter.createCaller({
      req: new Request("http://localhost/api/trpc"), resHeaders: new Headers(), lang: "es",
      user: withUser ? (user as never) : undefined,
    }) as unknown as Record<string, (input?: unknown) => Promise<unknown>>;
    try {
      await call(caller);
      return "OK";
    } catch (e) {
      return (e as { code?: string }).code ?? "ERROR";
    }
  }

  it("needs a logged-in user", async () => {
    expect(await code((c) => c.usage(), false)).toBe("UNAUTHORIZED");
    expect(await code((c) => c.list({ year: 2026, month: 11 }), false)).toBe("UNAUTHORIZED");
  }, 30_000);
  it.each([
    ["date injection", { ...good, date: "2026-11-21' OR 1=1 --" }],
    ["impossible date", { ...good, date: "2026-02-30" }],
    ["zero amount", { ...good, amount: 0 }],
    ["huge amount", { ...good, amount: MAX_RECEIPT_AMOUNT + 1 }],
    ["unknown category", { ...good, category: "drop table" }],
    ["bad payment method", { ...good, paymentMethod: "bitcoin" }],
    ["empty merchant", { ...good, merchant: "   " }],
    ["HTML file", { ...good, file: { ...file, mimeType: "text/html" } }],
  ])("create: %s", async (_name, input) => {
    expect(await code((c) => c.create(input))).toBe("BAD_REQUEST");
  }, 30_000);
  it("list: month out of range", async () => {
    expect(await code((c) => c.list({ year: 2026, month: 13 }))).toBe("BAD_REQUEST");
  }, 30_000);
});
