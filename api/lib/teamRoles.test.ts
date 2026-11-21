import { describe, expect, it } from "vitest";
import { memberCan } from "./team";
import { PERM_ROWS, permLevel, permTable, roleMenu, roleSeesPath } from "../../src/components/team/roles";

describe("permissions table (Equipo)", () => {
  it("comes from memberCan for every row and role", () => {
    for (const row of permTable()) {
      const def = PERM_ROWS.find((r) => r.key === row.key)!;
      expect(row.levels.owner).toBe("full");
      for (const role of ["staff", "accountant"] as const) {
        const read = memberCan(role, def.read, "query");
        const write = def.write !== null && memberCan(role, def.write, "mutation");
        expect(row.levels[role]).toBe(write ? "full" : read ? (def.write === null ? "full" : "read") : "none");
      }
    }
  });

  it("says what the rules say today", () => {
    const t = Object.fromEntries(permTable().map((r) => [r.key, r.levels]));
    // The employee sells, invoices, serves clients and photographs receipts; quotes stay with the owner.
    expect(t.sales.staff).toBe("full");
    expect(t.invoices.staff).toBe("full");
    expect(t.customers.staff).toBe("full");
    expect(t.receipts.staff).toBe("full");
    expect(t.quotes.staff).toBe("none");
    expect(t.bank.staff).toBe("none");
    expect(t.reports.staff).toBe("none");
    // The accountant reads everything except the owner's own areas, and changes nothing.
    expect(t.sales.accountant).toBe("read");
    expect(t.bank.accountant).toBe("read");
    expect(t.reports.accountant).toBe("full"); // nothing to change there: reading is all of it
    for (const k of ["taxes", "assistant", "admin"] as const) {
      expect(t[k].accountant).toBe("none");
      expect(t[k].staff).toBe("none");
    }
  });

  it("a row with nothing to change is all-or-nothing", () => {
    expect(permLevel("accountant", { read: "reports.overview", write: null })).toBe("full");
    expect(permLevel("staff", { read: "reports.overview", write: null })).toBe("none");
  });
});

describe("what each role sees in the menu (Ver como)", () => {
  it("the employee sees Cobrar, Facturas, Clientes and Gastos only", () => {
    expect(roleMenu("staff").flatMap((g) => g.paths)).toEqual(["/pos", "/invoices", "/customers", "/expenses"]);
  });

  it("the accountant sees everything but taxes, the assistant, the team and settings", () => {
    const seen = roleMenu("accountant").flatMap((g) => g.paths);
    for (const p of ["/taxes", "/assistant", "/team", "/settings"]) expect(seen).not.toContain(p);
    for (const p of ["/", "/transactions", "/bank", "/reports", "/customers"]) expect(seen).toContain(p);
    expect(roleSeesPath("accountant", "/vendors")).toBe(true);
  });
});
