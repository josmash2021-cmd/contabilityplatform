import { beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  CATEGORY_KEY_RE, MAX_BUDGET_LIMIT, budgetAlerts, budgetPercent, budgetStatus, budgetTotals, buildBudgetRows, spendingByCategory, suggestLimit, toCents,
} from "./budgets";

describe("budgetStatus", () => {
  it("is ok below 80% of the limit", () => {
    expect(budgetStatus(0, 500)).toBe("ok");
    expect(budgetStatus(399.99, 500)).toBe("ok");
  });

  it("is near from exactly 80% up to the limit itself", () => {
    expect(budgetStatus(400, 500)).toBe("near");
    expect(budgetStatus(499.99, 500)).toBe("near");
    expect(budgetStatus(500, 500)).toBe("near");
  });

  it("is over once spending passes the limit, even by a cent", () => {
    expect(budgetStatus(500.01, 500)).toBe("over");
    expect(budgetStatus(1200, 500)).toBe("over");
  });

  it("doesn't trip on float noise at the edges", () => {
    // 0.1 + 0.2 = 0.30000000000000004 in floating point
    expect(budgetStatus(0.1 + 0.2, 0.3)).toBe("near");
    expect(budgetStatus(80.0000000001, 100)).toBe("near");
    expect(budgetStatus(79.99, 100)).toBe("ok");
  });

  it("treats a zero limit as over as soon as anything is spent", () => {
    expect(budgetStatus(0, 0)).toBe("ok");
    expect(budgetStatus(1, 0)).toBe("over");
  });
});

describe("budgetPercent", () => {
  it("is a whole percent that can pass 100", () => {
    expect(budgetPercent(0, 200)).toBe(0);
    expect(budgetPercent(50, 200)).toBe(25);
    expect(budgetPercent(333.33, 1000)).toBe(33);
    expect(budgetPercent(300, 200)).toBe(150);
  });

  it("is 0 without a positive limit", () => {
    expect(budgetPercent(100, 0)).toBe(0);
    expect(budgetPercent(100, -5)).toBe(0);
  });
});

describe("spendingByCategory", () => {
  it("sums expenses per category in cents and ignores income", () => {
    const totals = spendingByCategory([
      { type: "expense", category: "shopping", amount: "10.10" },
      { type: "expense", category: "shopping", amount: "20.20" },
      { type: "expense", category: "gasolina", amount: 45 },
      { type: "income", category: "shopping", amount: "999" },
      { type: "income", category: "zelle_income", amount: "50" },
    ]);
    expect(totals.get("shopping")).toBe(30.3);
    expect(totals.get("gasolina")).toBe(45);
    expect(totals.has("zelle_income")).toBe(false);
  });

  it("puts uncategorized expenses under other and skips zero or broken amounts", () => {
    const totals = spendingByCategory([
      { type: "expense", category: null, amount: "5" },
      { type: "expense", category: "", amount: "5" },
      { type: "expense", category: "food", amount: "0" },
      { type: "expense", category: "food", amount: "abc" },
      { type: "expense", category: "food", amount: null },
    ]);
    expect(totals.get("other")).toBe(10);
    expect(totals.has("food")).toBe(false);
  });
});

describe("suggestLimit", () => {
  it("rounds spending up to a friendly number", () => {
    expect(suggestLimit(42.5)).toBe(50);
    expect(suggestLimit(90)).toBe(90);
    expect(suggestLimit(3)).toBe(10);
    expect(suggestLimit(430.01)).toBe(450);
    expect(suggestLimit(1234)).toBe(1300);
  });

  it("is null when nothing was spent", () => {
    expect(suggestLimit(0)).toBeNull();
    expect(suggestLimit(-10)).toBeNull();
    expect(suggestLimit(Number.NaN)).toBeNull();
  });

  it("never passes the highest limit", () => {
    expect(suggestLimit(MAX_BUDGET_LIMIT * 2)).toBe(MAX_BUDGET_LIMIT);
  });
});

describe("buildBudgetRows", () => {
  const limits = new Map([["shopping", 500], ["gasolina", 100], ["food", 300], ["subscription", 50]]);
  const spending = new Map([["shopping", 420], ["gasolina", 130], ["food", 60], ["other", 75], ["zelle_sent", 200]]);
  const rows = buildBudgetRows(limits, spending);

  it("has a row for each budgeted or spent category", () => {
    expect(rows.map((r) => r.category).sort()).toEqual(["food", "gasolina", "other", "shopping", "subscription", "zelle_sent"]);
  });

  it("fills spent, percent, status and remaining for budgeted rows", () => {
    expect(rows.find((r) => r.category === "gasolina")).toEqual({
      category: "gasolina", limit: 100, spent: 130, percent: 130, status: "over", remaining: -30, suggestedLimit: null,
    });
    expect(rows.find((r) => r.category === "subscription")).toMatchObject({ spent: 0, percent: 0, status: "ok", remaining: 50 });
  });

  it("suggests a limit for categories without one", () => {
    expect(rows.find((r) => r.category === "zelle_sent")).toMatchObject({ limit: null, status: null, percent: null, suggestedLimit: 200 });
  });

  it("lists budgets worst first, then unbudgeted spending biggest first", () => {
    expect(rows.map((r) => r.category)).toEqual(["gasolina", "shopping", "food", "subscription", "zelle_sent", "other"]);
  });

  it("ignores a non-positive limit", () => {
    const r = buildBudgetRows(new Map([["food", 0]]), new Map());
    expect(r).toEqual([]);
  });

  it("budgetAlerts keeps only near and over", () => {
    expect(budgetAlerts(rows).map((r) => [r.category, r.status])).toEqual([["gasolina", "over"], ["shopping", "near"]]);
  });

  it("budgetTotals adds up the budgeted rows only", () => {
    expect(budgetTotals(rows)).toEqual({ count: 4, limit: 950, spent: 610, near: 1, over: 1 });
    expect(budgetTotals([])).toEqual({ count: 0, limit: 0, spent: 0, near: 0, over: 0 });
  });
});

describe("helpers", () => {
  it("toCents rounds and survives non-finite values", () => {
    expect(toCents(19.999)).toBe(2000);
    expect(toCents(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("accepts only database-style category keys", () => {
    expect(CATEGORY_KEY_RE.test("home_expense")).toBe(true);
    expect(CATEGORY_KEY_RE.test("Shopping")).toBe(false);
    expect(CATEGORY_KEY_RE.test("x' OR 1=1")).toBe(false);
    expect(CATEGORY_KEY_RE.test("")).toBe(false);
    expect(CATEGORY_KEY_RE.test("a".repeat(51))).toBe(false);
  });
});

// The real procedures, with no database: every case below must be turned away before a query runs.
// The URLs point at a closed port so a mistake fails to connect instead of touching data.
describe("budget procedures reject bad requests up front", () => {
  type Caller = {
    personal: {
      listBudgets: (input: unknown) => Promise<unknown>;
      setBudget: (input: unknown) => Promise<unknown>;
    };
  };
  let makeCaller: (user?: object) => Caller;

  beforeAll(async () => {
    process.env.JWT_SECRET ??= "vitest-only-secret-0123456789abcdef";
    process.env.DATABASE_URL = "mysql://test:test@127.0.0.1:1/none";
    process.env.MYSQL_URL = "";
    const { appRouter } = await import("../router");
    makeCaller = (user) => appRouter.createCaller({ req: new Request("http://localhost/api/trpc"), resHeaders: new Headers(), user, lang: "es" } as never) as unknown as Caller;
  });

  async function code(p: Promise<unknown>): Promise<string> {
    try {
      await p;
      return "OK";
    } catch (e) {
      return e instanceof TRPCError ? e.code : "NON_TRPC_ERROR";
    }
  }

  const user = { id: 999_002, email: "budgets@test.local", role: "user", name: "Test" };

  it("needs a session", async () => {
    expect(await code(makeCaller().personal.listBudgets({ year: 2026, month: 11 }))).toBe("UNAUTHORIZED");
    expect(await code(makeCaller().personal.setBudget({ category: "shopping", limit: 100 }))).toBe("UNAUTHORIZED");
  });

  it.each([
    [{ year: 2026, month: 13 }],
    [{ year: 2026, month: 0 }],
    [{ year: 1999, month: 5 }],
    [{ year: 2026.5, month: 5 }],
    [{ year: "2026", month: "5" }],
  ])("listBudgets refuses month %j", async (input) => {
    expect(await code(makeCaller(user).personal.listBudgets(input))).toBe("BAD_REQUEST");
  });

  it.each([
    [{ category: "Shopping", limit: 100 }],
    [{ category: "x' OR 1=1 -- ", limit: 100 }],
    [{ category: "", limit: 100 }],
    [{ category: "shopping", limit: 0 }],
    [{ category: "shopping", limit: -50 }],
    [{ category: "shopping", limit: MAX_BUDGET_LIMIT + 1 }],
    [{ category: "shopping", limit: "100" }],
    [{ category: "shopping" }],
  ])("setBudget refuses %j", async (input) => {
    expect(await code(makeCaller(user).personal.setBudget(input))).toBe("BAD_REQUEST");
  });
});
