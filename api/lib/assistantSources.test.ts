import { describe, expect, it } from "vitest";
import { MAX_SOURCES, addDays, lastWeek, parseSources, sourcesFromCalls, type ToolCall } from "./assistantTools";

const call = (name: string, input: Record<string, unknown>, output: unknown): ToolCall => ({ name, input, output });

describe("sourcesFromCalls", () => {
  it("links each tool that found something to its screen, with the range it used", () => {
    const s = sourcesFromCalls([
      call("get_sales_summary", { from: "2026-11-01", to: "2026-11-21" }, { from: "2026-11-01", to: "2026-11-21", total: 320, count: 1 }),
      call("get_bank_summary", { from: "2026-11-01", to: "2026-11-21" }, { from: "2026-11-01", to: "2026-11-21", count: 4, byCategory: [{}] }),
      call("get_bills_due", { until: "2026-11-27" }, { count: 2, total: 640, bills: [{}, {}] }),
    ], "business");
    expect(s).toEqual([
      { kind: "sales", path: "/reports", from: "2026-11-01", to: "2026-11-21", count: 1 },
      { kind: "bank", path: "/bank", from: "2026-11-01", to: "2026-11-21" },
      { kind: "bills", path: "/vendors", count: 2, amount: 640 },
    ]);
  });

  it("skips calls that found nothing", () => {
    expect(sourcesFromCalls([
      call("get_sales_summary", { from: "2026-11-01", to: "2026-11-21" }, { total: 0, count: 0 }),
      call("list_bank_transactions", { from: "2026-11-01", to: "2026-11-21" }, { movements: [] }),
      call("get_receivables", {}, { invoices: [], count: 0 }),
      call("get_goals", {}, { goals: [] }),
    ], "business")).toEqual([]);
  });

  it("links money owed to the list and to the invoices themselves", () => {
    const s = sourcesFromCalls([call("get_receivables", {}, {
      count: 4, totalOwed: 2000,
      invoices: [{ saleId: 7, client: "Carlos Ruiz", balance: 850 }, { saleId: 9, client: "Ana", balance: 100 }, { saleId: 11, client: "Luis", balance: 50 }, { saleId: 12, client: "Rosa", balance: 1000 }],
    })], "business");
    expect(s[0]).toEqual({ kind: "receivables", path: "/invoices", count: 4, amount: 2000 });
    expect(s.slice(1).map((x) => x.path)).toEqual(["/invoices?id=s7", "/invoices?id=s9", "/invoices?id=s11"]);
    expect(s[1]).toMatchObject({ kind: "invoice", name: "Carlos Ruiz", amount: 850 });
  });

  it("personal bank links open the month when the range sits inside one", () => {
    const one = sourcesFromCalls([call("get_bank_summary", { from: "2026-11-01", to: "2026-11-21" }, { count: 3 })], "personal");
    expect(one[0].path).toBe("/personal/transactions?year=2026&month=11");
    const two = sourcesFromCalls([call("list_bank_transactions", { from: "2026-10-01", to: "2026-11-21" }, { movements: [{}] })], "personal");
    expect(two[0]).toMatchObject({ kind: "bankTx", path: "/personal/transactions", count: 1 });
  });

  it("removes repeats and stops at the maximum", () => {
    const same = call("get_bank_summary", { from: "2026-11-01", to: "2026-11-21" }, { count: 1 });
    expect(sourcesFromCalls([same, same], "business")).toHaveLength(1);
    const many = Array.from({ length: 10 }, (_, i) => call("get_bank_summary", { from: `2026-0${(i % 9) + 1}-01`, to: `2026-0${(i % 9) + 1}-28` }, { count: 1 }));
    expect(sourcesFromCalls(many, "business")).toHaveLength(MAX_SOURCES);
  });

  it("ignores tools it doesn't know and results that aren't objects", () => {
    expect(sourcesFromCalls([call("something_else", {}, { count: 5 }), call("get_sales_summary", {}, "plain text")], "business")).toEqual([]);
  });
});

describe("parseSources", () => {
  it("reads back what was saved", () => {
    const saved = JSON.stringify([{ kind: "sales", path: "/reports", from: "2026-11-01", to: "2026-11-21", count: 1 }]);
    expect(parseSources(saved)).toEqual([{ kind: "sales", path: "/reports", from: "2026-11-01", to: "2026-11-21", count: 1, name: undefined, amount: undefined }]);
  });

  it("drops anything that isn't a known source with an in-app path", () => {
    const bad = JSON.stringify([
      { kind: "sales", path: "https://evil.example.com" }, { kind: "sales", path: "//evil.example.com" }, { kind: "nope", path: "/x" }, { path: "/reports" }, "x", null,
      { kind: "goals", path: "/personal/goals" },
    ]);
    expect(parseSources(bad)).toEqual([{ kind: "goals", path: "/personal/goals", from: undefined, to: undefined, count: undefined, name: undefined, amount: undefined }]);
    expect(parseSources("not json")).toEqual([]);
    expect(parseSources(null)).toEqual([]);
    expect(parseSources("")).toEqual([]);
  });
});

describe("lastWeek", () => {
  it("is Monday to Sunday of the week before", () => {
    // 2026-11-21 is a Saturday.
    expect(lastWeek("2026-11-21")).toEqual({ from: "2026-11-09", to: "2026-11-15", monday: "2026-11-16" });
    // On a Monday, it's the 7 days just before.
    expect(lastWeek("2026-11-16")).toEqual({ from: "2026-11-09", to: "2026-11-15", monday: "2026-11-16" });
    // On a Sunday, the week that ended the Sunday before.
    expect(lastWeek("2026-11-22")).toEqual({ from: "2026-11-09", to: "2026-11-15", monday: "2026-11-16" });
    // Across a year.
    expect(lastWeek("2027-01-02")).toEqual({ from: "2026-12-21", to: "2026-12-27", monday: "2026-12-28" });
  });

  it("addDays crosses months without time zones moving the day", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-03-08", -1)).toBe("2026-03-07");
  });
});
