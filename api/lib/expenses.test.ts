import { describe, expect, it } from "vitest";
import {
  addMonth, bankSpendCategory, buildSpendItems, comparisonRange, detectRecurring, expenseSpendCategory, isBusinessSpending,
  limitState, manualEntryNumber, monthDays, pairBankMovements, paymentWeek, pctChange, spendTotals,
  type BankIn, type ExpenseIn, type SpendItem,
} from "./expenses";

const exp = (o: Partial<ExpenseIn> & { id: number }): ExpenseIn => ({
  description: "Gasto", category: "supplies", subcategory: null, amount: "10.00", paymentMethod: "card", date: "2026-11-10",
  receiptId: null, fromReceipt: false, bill: null, ...o,
});
const bank = (o: Partial<BankIn> & { id: number }): BankIn => ({
  name: "Home Depot", text: "THE HOME DEPOT #4821 HOUSTON TX", amountCents: 1000, fullCents: 1000, date: "2026-11-10",
  category: "shopping", reviewed: true, account: "Chase ••4410", logoUrl: null, ...o,
});
const build = (expenses: ExpenseIn[], banks: BankIn[], extra: Partial<Parameters<typeof buildSpendItems>[0]> = {}) =>
  buildSpendItems({ expenses, banks, today: "2026-11-21", reviewWindowDays: 60, ...extra });
const total = (items: SpendItem[]) => spendTotals(items).totalCents;

describe("categories", () => {
  it("maps bank categories to Gastos categories", () => {
    expect(bankSpendCategory("gasolina")).toBe("fuel");
    expect(bankSpendCategory("fast_food")).toBe("meals");
    expect(bankSpendCategory("subscription")).toBe("software");
    expect(bankSpendCategory("something_new")).toBe("other");
  });
  it("keeps receipt categories and files old free text as other", () => {
    expect(expenseSpendCategory("fuel")).toBe("fuel");
    expect(expenseSpendCategory("vendors")).toBe("vendors");
    expect(expenseSpendCategory("Materiales varios")).toBe("other");
  });
  it("leaves out money that isn't spending", () => {
    expect(isBusinessSpending({ type: "expense", category: "shopping" })).toBe(true);
    expect(isBusinessSpending({ type: "income", category: "shopping" })).toBe(false);
    for (const c of ["transfer", "cash_withdrawal", "loan", "home_expense"]) expect(isBusinessSpending({ type: "expense", category: c })).toBe(false);
    expect(isBusinessSpending({ type: "expense", category: "shopping", isDuplicate: 1 })).toBe(false);
    expect(isBusinessSpending({ type: "expense", category: "shopping", excluded: true })).toBe(false);
  });
});

describe("no double counting", () => {
  it("a card receipt and its bank charge count once", () => {
    const items = build([exp({ id: 1, description: "Home Depot", amount: "184.32", fromReceipt: true, receiptId: 9 })],
      [bank({ id: 50, amountCents: 18432, fullCents: 18432, date: "2026-11-12" })]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ source: "receipt", bankTransactionId: 50, account: "Chase ••4410", pairedBy: "auto", hasReceipt: true });
    expect(total(items)).toBe(18432);
  });
  it("cash expenses never match a bank charge", () => {
    const items = build([exp({ id: 1, paymentMethod: "cash" })], [bank({ id: 50 })]);
    expect(items).toHaveLength(2);
    expect(total(items)).toBe(2000);
  });
  it("only within the posting window (1 day before, 5 after)", () => {
    expect(build([exp({ id: 1 })], [bank({ id: 50, date: "2026-11-15" })])).toHaveLength(1);
    expect(build([exp({ id: 1 })], [bank({ id: 50, date: "2026-11-16" })])).toHaveLength(2);
    expect(build([exp({ id: 1 })], [bank({ id: 50, date: "2026-11-09" })])).toHaveLength(1);
    expect(build([exp({ id: 1 })], [bank({ id: 50, date: "2026-11-08" })])).toHaveLength(2);
  });
  it("one expense takes one charge: two equal charges, one receipt", () => {
    const items = build([exp({ id: 1, description: "Shell" })], [bank({ id: 50, name: "Shell", text: "SHELL OIL 5713" }), bank({ id: 51, date: "2026-11-11" })]);
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.source !== "bank")?.bankTransactionId).toBe(50); // the name match wins
  });
  it("a paid bill matches only when the bank names the vendor", () => {
    const bill = exp({ id: 2, description: "Proveedora Garza · Balatas", paymentMethod: "cash", amount: "1840.00", bill: { id: 7, vendorId: 3, vendorName: "Proveedora Garza", concept: "Balatas" } });
    expect(build([bill], [bank({ id: 50, amountCents: 184000, fullCents: 184000, text: "ACH PROVEEDORA GARZA" })])).toHaveLength(1);
    expect(build([bill], [bank({ id: 50, amountCents: 184000, fullCents: 184000, text: "ACH PAYMENT 88412" })])).toHaveLength(2);
  });
  it("Por revisar's bill link and the owner's own link hide the charge", () => {
    const bill = exp({ id: 2, amount: "500.00", date: "2026-11-01", bill: { id: 7, vendorId: 3, vendorName: "Seguros", concept: "Póliza" } });
    const items = build([bill], [bank({ id: 50, amountCents: 50000, fullCents: 50000, date: "2026-11-20", text: "AUTOPAY 1" })],
      { reviewBillLinks: [{ expenseId: 2, bankTransactionId: 50 }] });
    expect(items).toHaveLength(1);
    expect(items[0].pairedBy).toBe("bill");
    const linked = build([exp({ id: 1, amount: "99.00", date: "2026-10-01" })], [bank({ id: 50, amountCents: 1234, fullCents: 1234 })],
      { links: [{ expenseId: 1, bankTransactionId: 50, status: "linked" }] });
    expect(linked).toHaveLength(1);
  });
  it("'No es el mismo cargo' keeps them apart", () => {
    const items = build([exp({ id: 1 })], [bank({ id: 50 })], { links: [{ expenseId: 1, bankTransactionId: 50, status: "dismissed" }] });
    expect(items).toHaveLength(2);
  });
  it("a split movement counts only its business part, and still meets the receipt for the whole charge", () => {
    const split = bank({ id: 50, amountCents: 6000, fullCents: 10000 });
    expect(total(build([], [split]))).toBe(6000);
    expect(build([exp({ id: 1, amount: "100.00" })], [split])).toHaveLength(1);
  });
  it("a charge still in Por revisar says so", () => {
    const items = build([], [bank({ id: 50, reviewed: false, date: "2026-11-20" }), bank({ id: 51, reviewed: false, date: "2026-08-01" })]);
    expect(items.find((i) => i.bankTransactionId === 50)?.inReview).toBe(true);
    expect(items.find((i) => i.bankTransactionId === 51)?.inReview).toBe(false);
  });
});

describe("totals and limits", () => {
  it("sums by category, biggest first, and counts receipts", () => {
    const items = build([exp({ id: 1, amount: "5.00", receiptId: 3 }), exp({ id: 2, amount: "20.00", category: "fuel", paymentMethod: "cash" })], []);
    const t = spendTotals(items);
    expect(t).toMatchObject({ totalCents: 2500, count: 2, withReceipt: 1 });
    expect(t.byCategory.map((c) => c.category)).toEqual(["fuel", "supplies"]);
  });
  it("limit colors: near from 85%, over past 100%", () => {
    expect(limitState(8000, 10000).tone).toBe("ok");
    expect(limitState(9000, 10000).tone).toBe("near");
    expect(limitState(12000, 10000)).toEqual({ pct: 120, tone: "over", overPct: 20 });
    expect(limitState(100, 0).tone).toBe("ok");
  });
  it("compares the current month with the same days of the one before", () => {
    expect(comparisonRange({ year: 2026, month: 11 }, "2026-11-21")).toEqual({ from: "2026-10-01", to: "2026-10-21", partial: true });
    expect(comparisonRange({ year: 2026, month: 3 }, "2026-03-31")).toEqual({ from: "2026-02-01", to: "2026-02-28", partial: true });
    expect(comparisonRange({ year: 2026, month: 10 }, "2026-11-21")).toEqual({ from: "2026-09-01", to: "2026-09-30", partial: false });
    expect(pctChange(97, 100)).toBe(-3);
    expect(pctChange(5, 0)).toBeNull();
  });
  it("month days", () => {
    expect(monthDays({ year: 2028, month: 2 })).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });
});

describe("charges that repeat", () => {
  const item = (date: string, who = "Google Workspace", cents = 1440): SpendItem => ({
    key: date + who, source: "bank", expenseId: null, bankTransactionId: 1, receiptId: null, billId: null, vendorId: null, who, detail: null,
    category: "software", amountCents: cents, date, method: null, account: null, bankAccountId: null, bankOwn: false, logoUrl: null, inReview: false, hasReceipt: false, pairedBy: null,
  });
  it("finds a monthly charge and its next date", () => {
    const r = detectRecurring([item("2026-09-16"), item("2026-10-16"), item("2026-11-16")]);
    expect([...r.values()][0]).toEqual({ every: "month", nextDate: "2026-12-16" });
  });
  it("ignores irregular days and very different amounts", () => {
    expect(detectRecurring([item("2026-09-16"), item("2026-10-02"), item("2026-11-25")]).size).toBe(0);
    expect(detectRecurring([item("2026-10-16", "Shell", 2000), item("2026-11-16", "Shell", 9000)]).size).toBe(0);
  });
  it("adds a month at the month's end", () => {
    expect(addMonth("2026-01-31")).toBe("2026-02-28");
    expect(addMonth("2026-12-05")).toBe("2027-01-05");
  });
});

describe("pairing and numbers", () => {
  it("never pairs one charge twice", () => {
    const pairs = pairBankMovements(
      [{ id: 1, amountCents: 500, date: "2026-11-01", method: "card", name: "A", isBill: false }, { id: 2, amountCents: 500, date: "2026-11-01", method: "card", name: "B", isBill: false }],
      [{ id: 9, amountCents: 500, date: "2026-11-02", text: "X" }], [],
    );
    expect(pairs.size).toBe(1);
  });
  it("journal entry numbers don't collide on the same day", () => {
    expect(manualEntryNumber("2026-11-21", 41)).toBe("GAS-20261121-M41");
    expect(manualEntryNumber("2026-11-21", 42)).not.toBe(manualEntryNumber("2026-11-21", 41));
  });
  it("the week of payments: today and six more days, unpaid only", () => {
    const w = paymentWeek([
      { dueDate: "2026-11-21", amount: "640", vendorName: "Garza", status: "unpaid" },
      { dueDate: "2026-11-21", amount: 10, vendorName: "Garza", status: "unpaid" },
      { dueDate: "2026-11-23", amount: 99, vendorName: "Otro", status: "paid" },
      { dueDate: "2026-11-28", amount: 99, vendorName: "Lejos", status: "unpaid" },
    ], "2026-11-21");
    expect(w.map((d) => d.date)).toEqual(["2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"]);
    expect(w[0]).toMatchObject({ totalCents: 65000, count: 2, vendors: ["Garza"] });
    expect(w[2].count).toBe(0);
  });
});
