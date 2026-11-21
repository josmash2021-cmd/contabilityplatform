import { describe, expect, it } from "vitest";
import {
  addDays, bookBalanceAtEnd, centsToDecimal, checkPeriod, compareBalances, decimalToCents, expectedFromPrevious, findCauses, findDuplicates,
  lastFullMonth, movementOutCents, nextPeriod, overlaps, similarDescriptions, statementToCents, suggestPeriod,
  type Row,
} from "./reconcile";

const TODAY = "2026-11-21";

describe("money in cents", () => {
  it("reads DECIMAL strings exactly, without float drift", () => {
    expect(decimalToCents("11794.21")).toBe(1_179_421);
    expect(decimalToCents("-15.49")).toBe(-1549);
    expect(decimalToCents("0.1")).toBe(10);
    expect(decimalToCents("0.29")).toBe(29); // 0.29 * 100 = 28.999999999999996 as a float
    expect(decimalToCents("1.005")).toBe(101); // SUM() results can carry more decimals: half away from zero
    expect(decimalToCents("-1.005")).toBe(-101);
    expect(decimalToCents("123456789012.34")).toBe(12_345_678_901_234);
    expect(decimalToCents("0")).toBe(0);
    expect(decimalToCents("-0.00")).toBe(0);
    expect(decimalToCents(null)).toBe(0);
    expect(decimalToCents("abc")).toBe(0);
    expect(decimalToCents(19.99)).toBe(1999);
  });
  it("writes cents back as a DECIMAL", () => {
    expect(centsToDecimal(1_179_421)).toBe("11794.21");
    expect(centsToDecimal(-1549)).toBe("-15.49");
    expect(centsToDecimal(5)).toBe("0.05");
    expect(centsToDecimal(-5)).toBe("-0.05");
    expect(centsToDecimal(0)).toBe("0.00");
  });
  it("accepts only a normalized statement balance", () => {
    expect(statementToCents("11794.21")).toBe(1_179_421);
    expect(statementToCents("-50")).toBe(-5000);
    expect(statementToCents("0.5")).toBe(50);
    expect(statementToCents("11,794.21")).toBeNull();
    expect(statementToCents("1.234")).toBeNull();
    expect(statementToCents("1e5")).toBeNull();
    expect(statementToCents("")).toBeNull();
  });
  it("adding many movements stays exact", () => {
    const amounts = Array.from({ length: 1000 }, () => "0.10");
    const total = amounts.reduce((s, a) => s + decimalToCents(a), 0);
    expect(total).toBe(10_000);
    expect(centsToDecimal(total)).toBe("100.00");
  });
});

describe("movement sign (Plaid: positive = money out)", () => {
  it("uses plaidAmount when there is one", () => {
    expect(movementOutCents({ plaidAmount: "15.49", amount: "15.49", type: "expense" })).toBe(1549);
    expect(movementOutCents({ plaidAmount: "-1250.00", amount: "1250.00", type: "income" })).toBe(-125_000);
  });
  it("falls back to the type for rows without plaidAmount", () => {
    expect(movementOutCents({ plaidAmount: null, amount: "84.30", type: "expense" })).toBe(8430);
    expect(movementOutCents({ plaidAmount: null, amount: "300", type: "income" })).toBe(-30_000);
    expect(movementOutCents({ plaidAmount: "", amount: "300", type: "income" })).toBe(-30_000);
  });
});

describe("balance at the statement's last day", () => {
  it("bank account: today's balance plus what went out after, minus what came in", () => {
    // Today $12,920.55. After the 15th: $212 out, $1,250 in, $1,460.40 in → on the 15th it was 12,920.55 + 212 − 1,250 − 1,460.40.
    const afterOut = 21_200 - 125_000 - 146_040;
    expect(bookBalanceAtEnd({ currentCents: 1_292_055, afterOutCents: afterOut, debt: false })).toBe(1_042_215);
  });
  it("nothing after the end date: the balance is today's", () => {
    expect(bookBalanceAtEnd({ currentCents: 500_000, afterOutCents: 0, debt: false })).toBe(500_000);
  });
  it("card: what's owed today minus the charges after the end date, plus the payments", () => {
    // Owes $1,240.18 today. After the statement: $14.40 charge, $600 payment → owed 1,240.18 − 14.40 + 600.
    expect(bookBalanceAtEnd({ currentCents: 124_018, afterOutCents: 1440 - 60_000, debt: true })).toBe(182_578);
  });
  it("from the previous closed statement through the period's movements", () => {
    expect(expectedFromPrevious({ previousStatementCents: 1_200_495, periodOutCents: 343_114 - 322_040, debt: false })).toBe(1_179_421);
    expect(expectedFromPrevious({ previousStatementCents: 100_000, periodOutCents: 5_000, debt: true })).toBe(105_000);
  });
});

describe("compareBalances", () => {
  it("matches to the cent", () => {
    expect(compareBalances({ statementCents: 1_179_421, bookCents: 1_179_421, fromPreviousCents: null })).toEqual({ matches: true, mismatch: null, differenceCents: 0 });
  });
  it("one cent off doesn't match; the difference is statement minus records", () => {
    expect(compareBalances({ statementCents: 1_179_421, bookCents: 1_179_422, fromPreviousCents: null })).toEqual({ matches: false, mismatch: "book", differenceCents: -1 });
    expect(compareBalances({ statementCents: 1_179_421, bookCents: 1_177_872, fromPreviousCents: null })).toEqual({ matches: false, mismatch: "book", differenceCents: 1549 });
  });
  it("with a previous closed period, the period's movements must add up too", () => {
    expect(compareBalances({ statementCents: 1000, bookCents: 1000, fromPreviousCents: 1000 }).matches).toBe(true);
    expect(compareBalances({ statementCents: 1000, bookCents: 1000, fromPreviousCents: 1500 })).toEqual({ matches: false, mismatch: "period", differenceCents: -500 });
  });
});

describe("periods", () => {
  it("default without closed periods: last full month", () => {
    expect(lastFullMonth(TODAY)).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    expect(lastFullMonth("2026-01-10")).toEqual({ start: "2025-12-01", end: "2025-12-31" });
    expect(lastFullMonth("2028-03-01")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
  });
  it("the statement after a closed one", () => {
    expect(nextPeriod("2026-11-15")).toEqual({ start: "2026-11-16", end: "2026-12-15" });
    expect(nextPeriod("2026-12-15")).toEqual({ start: "2026-12-16", end: "2027-01-15" });
    expect(nextPeriod("2026-10-31")).toEqual({ start: "2026-11-01", end: "2026-11-30" });
    expect(nextPeriod("2026-01-30")).toEqual({ start: "2026-01-31", end: "2026-02-28" });
    expect(nextPeriod("2026-02-28")).toEqual({ start: "2026-03-01", end: "2026-03-31" });
  });
  it("suggests the next period, waiting when its statement can't exist yet", () => {
    const lastClosed = { start: "2026-09-16", end: "2026-10-15" };
    expect(suggestPeriod({ today: TODAY, lastClosed, reopened: [], closed: [lastClosed] })).toEqual({ start: "2026-10-16", end: "2026-11-15", waiting: false, reopenedId: null });
    const latest = { start: "2026-10-16", end: "2026-11-15" };
    expect(suggestPeriod({ today: TODAY, lastClosed: latest, reopened: [], closed: [latest, lastClosed] })).toEqual({ start: "2026-11-16", end: "2026-12-15", waiting: true, reopenedId: null });
    expect(suggestPeriod({ today: TODAY, lastClosed: null, reopened: [], closed: [] })).toEqual({ start: "2026-10-01", end: "2026-10-31", waiting: false, reopenedId: null });
  });
  it("picks up a reopened period until it's closed again", () => {
    const older = { start: "2026-09-16", end: "2026-10-15" };
    const reopened = { id: 7, start: "2026-10-16", end: "2026-11-15" };
    expect(suggestPeriod({ today: TODAY, lastClosed: older, reopened: [reopened], closed: [older] })).toEqual({ start: "2026-10-16", end: "2026-11-15", waiting: false, reopenedId: 7 });
    // Closed again (a new row): back to the next one.
    const again = { start: "2026-10-16", end: "2026-11-15" };
    expect(suggestPeriod({ today: TODAY, lastClosed: again, reopened: [reopened], closed: [again, older] }).reopenedId).toBeNull();
  });
  it("overlap and validation", () => {
    expect(overlaps({ start: "2026-10-16", end: "2026-11-15" }, { start: "2026-11-15", end: "2026-12-15" })).toBe(true);
    expect(overlaps({ start: "2026-10-16", end: "2026-11-15" }, { start: "2026-11-16", end: "2026-12-15" })).toBe(false);
    expect(checkPeriod({ start: "2026-10-16", end: "2026-11-15" }, TODAY)).toBeNull();
    expect(checkPeriod({ start: "2026-11-16", end: "2026-12-15" }, TODAY)).toBe("future");
    expect(checkPeriod({ start: "2026-11-15", end: "2026-10-16" }, TODAY)).toBe("order");
    expect(checkPeriod({ start: "2026-02-30", end: "2026-03-15" }, TODAY)).toBe("badDate");
    expect(checkPeriod({ start: "2024-01-01", end: "2026-01-01" }, TODAY)).toBe("tooLong");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("likely causes", () => {
  const row = (id: number, date: string, description: string, outCents: number, reviewed = true): Row => ({ id, date, description, outCents, reviewed });
  const period = { start: "2026-10-16", end: "2026-11-15" };

  it("finds repeated movements (same day, amount and a similar description)", () => {
    const pairs = findDuplicates([
      row(1, "2026-11-17", "NETFLIX.COM 866-579-7172", 1549),
      row(2, "2026-11-17", "Netflix.com", 1549),
      row(3, "2026-11-17", "SPOTIFY USA", 1549), // same day and amount, another merchant
      row(4, "2026-11-18", "NETFLIX.COM 866-579-7172", 1549), // another day
    ]);
    expect(pairs.map(([a, b]) => [a.id, b.id])).toEqual([[1, 2]]);
    expect(similarDescriptions("SHELL OIL 57444 BIRMINGHAM AL", "SHELL OIL 57444")).toBe(true);
    expect(similarDescriptions("HOME DEPOT 0811", "OFFICE DEPOT 1123")).toBe(false);
  });

  it("a repeated movement worth the difference comes first, and then the edge list is left out", () => {
    const rows = [
      row(1, "2026-11-14", "ZELLE FROM MARIA GARCIA", -125_000),
      row(2, "2026-11-17", "NETFLIX.COM", 1549),
      row(3, "2026-11-17", "NETFLIX.COM", 1549),
      row(4, "2026-11-19", "CFE ELECTRICIDAD", 21_200),
    ];
    const causes = findCauses({ rows, period, differenceCents: 1549, mismatch: "book", today: TODAY, lastSyncedAt: TODAY, unreviewed: { count: 0, rows: [] } });
    expect(causes[0]).toMatchObject({ kind: "duplicates", pairs: [{ a: { id: 2, amountCents: -1549 }, b: { id: 3 }, isDifference: true }] });
    expect(causes.map((c) => c.kind)).toEqual(["duplicates"]);
  });

  it("a repeated movement that isn't the difference: the edges are listed too", () => {
    const rows = [
      row(1, "2026-11-14", "ZELLE FROM MARIA GARCIA", -125_000),
      row(2, "2026-11-17", "NETFLIX.COM", 1549),
      row(3, "2026-11-17", "NETFLIX.COM", 1549),
    ];
    const causes = findCauses({ rows, period, differenceCents: 777, mismatch: "book", today: TODAY, lastSyncedAt: TODAY, unreviewed: { count: 0, rows: [] } });
    expect(causes[0]).toMatchObject({ kind: "duplicates", pairs: [{ isDifference: false }] });
    expect(causes[1]).toMatchObject({ kind: "edge", edge: "end" });
    expect(causes[1].kind === "edge" && causes[1].txs.map((t) => t.id)).toEqual([1]);
  });

  it("a single movement worth exactly the difference, after the end date", () => {
    const rows = [row(1, "2026-10-20", "OFFICE DEPOT", 8635), row(2, "2026-11-16", "GOOGLE *WORKSPACE", 1440), row(3, "2026-11-20", "AUTOZONE", 23_680)];
    const causes = findCauses({ rows, period, differenceCents: -1440, mismatch: "book", today: TODAY, lastSyncedAt: TODAY, unreviewed: { count: 0, rows: [] } });
    expect(causes[0]).toEqual({ kind: "exact", tx: { id: 2, date: "2026-11-16", description: "GOOGLE *WORKSPACE", amountCents: -1440, reviewed: true }, where: "after" });
    expect(causes.some((c) => c.kind === "duplicates")).toBe(false);
  });

  it("an old balance and movements still to review are causes too", () => {
    const pending = [row(9, "2026-11-10", "AMAZON MKTPL", 3999, false)];
    const causes = findCauses({ rows: pending, period, differenceCents: 777, mismatch: "book", today: TODAY, lastSyncedAt: "2026-11-12", unreviewed: { count: 1, rows: pending } });
    expect(causes.map((c) => c.kind)).toEqual(["stale", "unreviewed"]);
  });

  it("nothing found: no causes", () => {
    expect(findCauses({ rows: [], period, differenceCents: 777, mismatch: "book", today: TODAY, lastSyncedAt: TODAY, unreviewed: { count: 0, rows: [] } })).toEqual([]);
  });
});
