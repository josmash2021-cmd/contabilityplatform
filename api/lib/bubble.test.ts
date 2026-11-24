import { describe, expect, it, vi } from "vitest";

// The review router pulls in the whole app; the bubble only needs its pending count.
vi.mock("../review-router", () => ({ pendingCount: vi.fn(async () => 3) }));
import { bubblePrompt, checkOffer, pageName } from "./bubble";

/** A database that answers the one SELECT the movement check makes. */
const dbWith = (rows: unknown[]) => ({ execute: vi.fn(async () => [rows, []]) }) as never;
const none = dbWith([]);

describe("checkOffer — the closed list", () => {
  it("only the tasks of the person's side", async () => {
    expect(typeof await checkOffer(none, 1, "business", { task: "budget", category: "food", amount: 300 })).toBe("string");
    expect(typeof await checkOffer(none, 1, "personal", { task: "invoice" })).toBe("string");
    expect(await checkOffer(none, 1, "business", { task: "invoice" })).toEqual({ task: "invoice" });
    expect(await checkOffer(none, 1, "personal", { task: "connect_bank" })).toEqual({ task: "connect_bank" });
    // The tour, on both sides.
    expect(await checkOffer(none, 1, "personal", { task: "tour" })).toEqual({ task: "tour" });
    expect(await checkOffer(none, 1, "business", { task: "tour" })).toEqual({ task: "tour" });
  });

  it("a budget needs a spending category and a positive amount", async () => {
    expect(await checkOffer(none, 1, "personal", { task: "budget", category: "food", amount: 300 })).toEqual({ task: "budget", category: "food", amount: 300 });
    expect(typeof await checkOffer(none, 1, "personal", { task: "budget", category: "card_payment", amount: 300 })).toBe("string");
    expect(typeof await checkOffer(none, 1, "personal", { task: "budget", category: "transfer", amount: 300 })).toBe("string");
    expect(typeof await checkOffer(none, 1, "personal", { task: "budget", category: "hacker", amount: 300 })).toBe("string");
    expect(typeof await checkOffer(none, 1, "personal", { task: "budget", category: "food", amount: 0 })).toBe("string");
    expect(typeof await checkOffer(none, 1, "personal", { task: "budget", category: "food" })).toBe("string");
  });

  it("a goal needs a name and an amount; the monthly part fits inside it", async () => {
    expect(await checkOffer(none, 1, "personal", { task: "goal", name: " Carro ", amount: 5000, monthly: 200 })).toEqual({ task: "goal", name: "Carro", amount: 5000, monthly: 200 });
    expect(await checkOffer(none, 1, "personal", { task: "goal", name: "Viaje", amount: 1500 })).toEqual({ task: "goal", name: "Viaje", amount: 1500, monthly: null });
    expect(typeof await checkOffer(none, 1, "personal", { task: "goal", name: "", amount: 100 })).toBe("string");
    expect(typeof await checkOffer(none, 1, "personal", { task: "goal", name: "X", amount: 100, monthly: 500 })).toBe("string");
  });

  it("a category change only for the person's own movement, with a category of its kind", async () => {
    const mine = dbWith([{ type: "expense", description: "STARBUCKS STORE 12345 AUSTIN TX", merchantName: "Starbucks", amount: "6.45", date: "2026-11-20" }]);
    expect(await checkOffer(mine, 7, "personal", { task: "change_category", transactionId: 55, category: "food" }))
      .toEqual({ task: "change_category", transactionId: 55, category: "food", type: "expense", name: "Starbucks", amount: 6.45, date: "2026-11-20" });
    // Money out can't become a paycheck.
    expect(typeof await checkOffer(mine, 7, "personal", { task: "change_category", transactionId: 55, category: "paycheck" })).toBe("string");
    // Someone else's (the query is scoped to the user, so nothing comes back).
    expect(typeof await checkOffer(none, 7, "personal", { task: "change_category", transactionId: 99, category: "food" })).toBe("string");
    expect(typeof await checkOffer(none, 7, "personal", { task: "change_category", category: "food" })).toBe("string");
  });

  it("a color from the list; a client with a name and, if any, a real-looking email", async () => {
    expect(await checkOffer(none, 1, "business", { task: "user_color", color: "violet" })).toEqual({ task: "user_color", color: "violet" });
    expect(typeof await checkOffer(none, 1, "business", { task: "user_color", color: "#ff0000" })).toBe("string");
    expect(await checkOffer(none, 1, "business", { task: "customer", name: "Ana", lastName: "Ruiz", email: "ana@correo.com" }))
      .toEqual({ task: "customer", name: "Ana", lastName: "Ruiz", phone: "", email: "ana@correo.com" });
    expect(typeof await checkOffer(none, 1, "business", { task: "customer", name: "Ana", email: "no-es-correo" })).toBe("string");
  });

  it("nothing outside the list: plan, refunds, passwords, admin", async () => {
    for (const task of ["cancel_plan", "refund", "change_password", "make_admin", "delete_account"]) {
      expect(typeof await checkOffer(none, 1, "personal", { task } as never)).toBe("string");
    }
  });
});

describe("what the bubble knows", () => {
  it("names the page the way the menu does", () => {
    expect(pageName("personal", "/personal/budgets")).toBe("Presupuestos");
    expect(pageName("personal", "/personal/transactions?month=11&year=2026")).toBe("Movimientos");
    expect(pageName("business", "/")).toBe("Inicio");
    expect(pageName("business", "/invoices")).toBe("Facturas");
  });

  it("carries the owner's limits, the Spanglish and the closed list", () => {
    const p = bubblePrompt("personal", "/personal/budgets", { tier: "pro", trial: false });
    expect(p).toContain('"Presupuestos"');
    expect(p).toMatch(/los biles/i);
    expect(p).toMatch(/aseguranza/);
    expect(p).toMatch(/refunds/);
    expect(p).toMatch(/passwords/);
    expect(p).toMatch(/new options, new pages/);
    expect(p).toContain("tour, budget, goal, connect_bank, change_category, review, sync_bank, user_color");
    expect(bubblePrompt("business", "/", { tier: null, trial: true })).toContain("tour, customer, invoice, receipt, connect_bank, user_color");
    // "Hazlo por mí" in their own words: it starts at once, no "¿lo hago?".
    expect(p).toMatch(/start: true/);
    expect(p).toMatch(/Okey, empiezo a hacerlo/);
    expect(p).toMatch(/hazme un tour/);
  });
});
