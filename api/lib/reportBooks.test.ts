import { describe, expect, it } from "vitest";
import {
  addMonths, agingBucket, buildAging, buildBalanceSheet, buildCashFlow, buildTips, change, fillSeries, isCashAccount, keptPerHundred,
  mergeCategories, reportPeriod, statementRange, yearPace, type AccountTotals,
} from "./reportBooks";

describe("statementRange (reports.incomeStatement)", () => {
  it("a year alone is the whole year, not cut at today's date", () => {
    expect(statementRange({ year: 2025 }, "2026-11-21")).toEqual({ startDate: "2025-01-01", endDate: "2025-12-31" });
    expect(statementRange({ year: 2026 }, "2026-11-21")).toEqual({ startDate: "2026-01-01", endDate: "2026-12-31" });
  });
  it("year + month is that month; February knows leap years", () => {
    expect(statementRange({ year: 2024, month: 2 }, "2026-11-21")).toEqual({ startDate: "2024-02-01", endDate: "2024-02-29" });
  });
  it("nothing: this month up to today; explicit dates win", () => {
    expect(statementRange(undefined, "2026-11-21")).toEqual({ startDate: "2026-11-01", endDate: "2026-11-21" });
    expect(statementRange({ year: 2026, startDate: "2026-03-01", endDate: "2026-03-15" }, "2026-11-21")).toEqual({ startDate: "2026-03-01", endDate: "2026-03-15" });
  });
});

describe("reportPeriod", () => {
  const today = "2026-11-21";
  it("this month against last month, chart ending in November", () => {
    const p = reportPeriod({ key: "month" }, today);
    expect(p.range).toEqual({ startDate: "2026-11-01", endDate: "2026-11-30" });
    expect(p.prev).toEqual({ startDate: "2026-10-01", endDate: "2026-10-31" });
    expect(p.seriesEnd).toEqual({ year: 2026, month: 11 });
    expect(p.highlight).toEqual(["2026-11"]);
  });
  it("last 3 months against the 3 before", () => {
    const p = reportPeriod({ key: "quarter" }, today);
    expect(p.range).toEqual({ startDate: "2026-09-01", endDate: "2026-11-30" });
    expect(p.prev).toEqual({ startDate: "2026-06-01", endDate: "2026-08-31" });
    expect(p.highlight).toEqual(["2026-09", "2026-10", "2026-11"]);
  });
  it("this year so far against the same months of last year", () => {
    const p = reportPeriod({ key: "year" }, today);
    expect(p.range).toEqual({ startDate: "2026-01-01", endDate: "2026-11-30" });
    expect(p.prev).toEqual({ startDate: "2025-01-01", endDate: "2025-11-30" });
    expect(p.highlight).toHaveLength(11);
  });
  it("a past year is the whole year against the one before; the chart is that year", () => {
    const p = reportPeriod({ key: "pickYear", year: 2025 }, today);
    expect(p.range).toEqual({ startDate: "2025-01-01", endDate: "2025-12-31" });
    expect(p.prev).toEqual({ startDate: "2024-01-01", endDate: "2024-12-31" });
    expect(p.seriesEnd).toEqual({ year: 2025, month: 12 });
  });
  it("January's previous month is December; a future month falls back to this one", () => {
    expect(reportPeriod({ key: "last" }, "2026-01-10").prev).toEqual({ startDate: "2025-11-01", endDate: "2025-11-30" });
    expect(reportPeriod({ key: "pickMonth", year: 2027, month: 3 }, today).range.startDate).toBe("2026-11-01");
  });
  it("today and the last 7 days compare with the same length just before", () => {
    expect(reportPeriod({ key: "today" }, "2026-03-01").prev).toEqual({ startDate: "2026-02-28", endDate: "2026-02-28" });
    const w = reportPeriod({ key: "week" }, today);
    expect(w.range).toEqual({ startDate: "2026-11-15", endDate: "2026-11-21" });
    expect(w.prev).toEqual({ startDate: "2026-11-08", endDate: "2026-11-14" });
  });
  it("addMonths crosses years both ways", () => {
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2026, month: 11 }, -11)).toEqual({ year: 2025, month: 12 });
  });
});

describe("change (↑ 9% vs octubre)", () => {
  it("rounds to whole percent and knows which way is good", () => {
    expect(change(24580, 22550, true)).toEqual({ pct: 9, dir: "up", good: true });
    expect(change(9135, 9418, false)).toEqual({ pct: 3, dir: "down", good: true });
    expect(change(100, 120, true)).toEqual({ pct: 17, dir: "down", good: false });
  });
  it("nothing to compare with when the previous period was 0", () => {
    expect(change(50, 0, true)).toEqual({ pct: null, dir: "up", good: true });
  });
  it("a loss getting smaller is good (percent of the size of the old loss)", () => {
    expect(change(-50, -100, true)).toEqual({ pct: 50, dir: "up", good: true });
  });
  it("63 de cada 100 dólares", () => {
    expect(keptPerHundred(24580, 15445)).toBe(63);
    expect(keptPerHundred(0, -10)).toBeNull();
  });
});

describe("fillSeries and yearPace", () => {
  it("12 months ending at the period, zeros where nothing happened, cents exact", () => {
    const s = fillSeries({ year: 2026, month: 11 }, [{ ym: "2026-11", total: "100.10" }, { ym: "2026-11", total: "0.20" }, { ym: "2025-12", total: 5 }], [{ ym: "2026-10", total: "40.05" }]);
    expect(s).toHaveLength(12);
    expect(s[0]).toMatchObject({ key: "2025-12", in: 5, out: 0 });
    expect(s[11]).toMatchObject({ key: "2026-11", in: 100.3, out: 0 });
    expect(s[10]).toMatchObject({ key: "2026-10", out: 40.05 });
  });
  it("pace = profit so far × 12 / months gone by, to the thousand", () => {
    const s = fillSeries({ year: 2026, month: 11 }, Array.from({ length: 11 }, (_, i) => ({ ym: `2026-${String(i + 1).padStart(2, "0")}`, total: 20000 })), Array.from({ length: 11 }, (_, i) => ({ ym: `2026-${String(i + 1).padStart(2, "0")}`, total: 9000 })));
    expect(yearPace(s, "2026-11-21")).toEqual({ year: 2026, profit: 132000 });
    expect(yearPace(fillSeries({ year: 2026, month: 11 }, [], []), "2026-11-21")).toBeNull();
  });
});

describe("mergeCategories", () => {
  it("joins blank names, keeps the previous amount, biggest first", () => {
    const m = mergeCategories(
      [{ category: "Materiales", total: "4210.00", count: 3 }, { category: "", total: 10, count: 1 }, { category: null, total: 5, count: 1 }],
      [{ category: "Materiales", total: 4480, count: 4 }, { category: "Gasolina", total: 225, count: 2 }],
    );
    expect(m).toEqual([
      { category: "Materiales", total: 4210, count: 3, prevTotal: 4480 },
      { category: "", total: 15, count: 2, prevTotal: 0 },
      { category: "Gasolina", total: 0, count: 0, prevTotal: 225 },
    ]);
  });
});

describe("buildBalanceSheet", () => {
  const acc = (accountId: number, code: string, name: string, type: string, debit: number, credit: number): AccountTotals => ({ accountId, code, name, type, debit, credit });
  it("keeps an overdrawn account (it lowers the assets) and balances with the result still to close", () => {
    // Sales: 1000 cash, 500 card. Expenses: 1200 paid cash, 100 by card. Capital 300 put in the bank.
    const b = buildBalanceSheet([
      acc(1, "1110", "Caja", "asset", 1000, 1200),
      acc(2, "1150", "Cuentas por cobrar", "asset", 500, 100),
      acc(3, "1120", "Banco", "asset", 300, 0),
      acc(4, "3110", "Capital", "equity", 0, 300),
      acc(5, "4100", "Ingresos", "revenue", 0, 1500),
      acc(6, "5100", "Gastos", "expense", 1300, 0),
    ]);
    expect(b.assets.map((a) => [a.code, a.balance])).toEqual([["1110", -200], ["1120", 300], ["1150", 400]]);
    expect(b.totalAssets).toBe(500);
    expect(b.unclosedEarnings).toBe(200);
    expect(b.totalEquity).toBe(500);
    expect(b.totalLiabilities).toBe(0);
    expect(b.totalLiabilitiesAndEquity).toBe(500);
    expect(b.balanced).toBe(true);
    expect(b.difference).toBe(0);
  });
  it("liabilities read on the credit side; cents never drift", () => {
    const b = buildBalanceSheet([
      acc(1, "1120", "Banco", "asset", "0.10" as unknown as number, 0),
      acc(1, "1120", "Banco", "asset", "0.20" as unknown as number, 0),
      acc(2, "2100", "Por pagar", "liability", 0, "0.30" as unknown as number),
    ]);
    expect(b.totalAssets).toBe(0.3);
    expect(b.liabilities).toEqual([{ accountId: 2, code: "2100", name: "Por pagar", balance: 0.3 }]);
    expect(b.balanced).toBe(true);
  });
  it("an entry that doesn't balance shows as a difference instead of being hidden", () => {
    const b = buildBalanceSheet([acc(1, "1110", "Caja", "asset", 100, 0), acc(5, "4100", "Ingresos", "revenue", 0, 90)]);
    expect(b.balanced).toBe(false);
    expect(b.difference).toBe(10);
  });
});

describe("buildCashFlow", () => {
  it("opening + sales − expenses ± other = closing; card sales aren't cash yet", () => {
    const f = buildCashFlow("1000.00", [
      { entryId: 1, code: "1110", type: "asset", debit: 200, credit: 0 }, { entryId: 1, code: "4100", type: "revenue", debit: 0, credit: 200 },
      { entryId: 2, code: "1150", type: "asset", debit: 50, credit: 0 }, { entryId: 2, code: "4100", type: "revenue", debit: 0, credit: 50 },
      { entryId: 3, code: "5100", type: "expense", debit: 80, credit: 0 }, { entryId: 3, code: "1130", type: "asset", debit: 0, credit: 80 },
      { entryId: 4, code: "1120", type: "asset", debit: 0, credit: 30 }, { entryId: 4, code: "3110", type: "equity", debit: 30, credit: 0 },
      { entryId: 5, code: "1120", type: "asset", debit: 40, credit: 0 }, { entryId: 5, code: "1150", type: "asset", debit: 0, credit: 40 },
      { entryId: 6, code: "1110", type: "asset", debit: 0, credit: 25 }, { entryId: 6, code: "1120", type: "asset", debit: 25, credit: 0 },
    ]);
    expect(f).toEqual({ opening: 1000, fromSales: 200, expensesPaid: 80, otherIn: 40, otherOut: 30, net: 130, closing: 1130 });
  });
  it("a refund lowers the sales collected", () => {
    const f = buildCashFlow(0, [{ entryId: 9, code: "4100", type: "revenue", debit: 20, credit: 0 }, { entryId: 9, code: "1110", type: "asset", debit: 0, credit: 20 }]);
    expect(f.fromSales).toBe(-20);
    expect(f.closing).toBe(-20);
  });
  it("cash accounts are 1100–1149", () => {
    expect(["1110", "1120", "1130", "1149"].every(isCashAccount)).toBe(true);
    expect(["1150", "2100", "11", ""].some(isCashAccount)).toBe(false);
  });
});

describe("aging (Quién te debe y desde cuándo)", () => {
  it("buckets by days past due", () => {
    expect(agingBucket("2026-11-21", "2026-11-21")).toBe(0);
    expect(agingBucket("2026-11-20", "2026-11-21")).toBe(1);
    expect(agingBucket("2026-10-22", "2026-11-21")).toBe(1);
    expect(agingBucket("2026-10-21", "2026-11-21")).toBe(2);
    expect(agingBucket("2026-08-01", "2026-11-21")).toBe(4);
    expect(agingBucket(null, "2026-11-21")).toBe(0);
  });
  it("one row per client, totals add up", () => {
    const a = buildAging([
      { client: "Ana", balance: 100.1, dueDate: "2026-12-01" },
      { client: "Ana", balance: 50.2, dueDate: "2026-10-01" },
      { client: "Luis", balance: 400, dueDate: "2026-07-01" },
      { client: "Paid", balance: 0, dueDate: "2026-07-01" },
    ], "2026-11-21");
    expect(a.rows.map((r) => r.client)).toEqual(["Luis", "Ana"]);
    expect(a.rows[1].buckets).toEqual([100.1, 0, 50.2, 0, 0]);
    expect(a.totals).toEqual([100.1, 0, 50.2, 0, 400]);
    expect(a.total).toBe(550.3);
  });
});

describe("buildTips", () => {
  it("names the service that moved sales the most, the biggest category and the pace", () => {
    const tips = buildTips({
      moneyIn: 24580, prevIn: 22550, moneyOut: 9135, prevOut: 9418,
      services: [{ name: "Afinación", total: 9600 }, { name: "Frenos", total: 6240 }],
      prevServices: [{ name: "Afinación", total: 7000 }, { name: "Frenos", total: 6800 }],
      topCategory: "Materiales", pace: { year: 2026, profit: 139000 },
    });
    expect(tips).toEqual([
      { kind: "sales", dir: "up", pct: 9, driver: "Afinación" },
      { kind: "expenses", dir: "down", pct: 3, top: "Materiales" },
      { kind: "pace", year: 2026, profit: 139000 },
    ]);
  });
  it("nothing invented when there's nothing to compare", () => {
    expect(buildTips({ moneyIn: 0, prevIn: 0, moneyOut: 0, prevOut: 0, services: [], prevServices: [], topCategory: null, pace: null })).toEqual([]);
    expect(buildTips({ moneyIn: 10, prevIn: 0, moneyOut: 0, prevOut: 0, services: [], prevServices: [], topCategory: null, pace: null })).toEqual([{ kind: "salesNew" }]);
  });
});
