import { beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  DUE_SOON_DAYS, MAX_BILL_AMOUNT, addDays, balancesByVendor, billTiming, centsToDecimal, cleanText, daysBetween, daysUntilDue, dueSoonRange,
  effectiveToday, expenseEntryReference, expenseEntryReferences, expenseFromBill, isIsoDate, matchesFilter, sameVendorName, summarizeBills, toCents, utcToday, vendorEntryNumber,
  type BillForTotals,
} from "./vendors";

const TODAY = "2026-11-21";

describe("isIsoDate", () => {
  it("accepts real calendar days", () => {
    expect(isIsoDate("2026-11-21")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true); // leap year
  });
  it("rejects impossible days, other formats and injection attempts", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2027-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-1-5")).toBe(false);
    expect(isIsoDate("11/21/2026")).toBe(false);
    expect(isIsoDate("2026-11-21' OR 1=1 --")).toBe(false);
    expect(isIsoDate("1999-12-31")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });
});

describe("day arithmetic", () => {
  it("adds days across months, years and DST changes", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-03-07", 2)).toBe("2026-03-09"); // US DST starts 2026-03-08
    expect(addDays("2026-10-31", 2)).toBe("2026-11-02"); // DST ends 2026-11-01
  });
  it("counts whole days between two dates", () => {
    expect(daysBetween("2026-11-21", "2026-11-21")).toBe(0);
    expect(daysBetween("2026-11-21", "2026-11-28")).toBe(7);
    expect(daysBetween("2026-11-21", "2026-11-18")).toBe(-3);
    expect(daysUntilDue("2026-12-01", TODAY)).toBe(10);
  });
  it("utcToday is the UTC calendar day", () => {
    expect(utcToday(new Date("2026-11-21T23:30:00Z"))).toBe("2026-11-21");
    expect(utcToday(new Date("2026-11-22T00:10:00Z"))).toBe("2026-11-22");
  });
});

describe("effectiveToday", () => {
  it("uses the app's local day when it's within two days of the server's", () => {
    expect(effectiveToday("2026-11-20", "2026-11-21")).toBe("2026-11-20");
    expect(effectiveToday("2026-11-22", "2026-11-21")).toBe("2026-11-22");
  });
  it("falls back to the server's day when missing, invalid or far off", () => {
    expect(effectiveToday(undefined, TODAY)).toBe(TODAY);
    expect(effectiveToday("not-a-date", TODAY)).toBe(TODAY);
    expect(effectiveToday("2026-02-30", TODAY)).toBe(TODAY);
    expect(effectiveToday("2030-01-01", TODAY)).toBe(TODAY);
  });
});

describe("billTiming", () => {
  const unpaid = (dueDate: string) => ({ status: "unpaid" as const, dueDate });
  it("is overdue from the day after the due date", () => {
    expect(billTiming(unpaid("2026-11-20"), TODAY)).toBe("overdue");
    expect(billTiming(unpaid("2025-01-01"), TODAY)).toBe("overdue");
  });
  it("is due today on the due date (not overdue yet)", () => {
    expect(billTiming(unpaid(TODAY), TODAY)).toBe("dueToday");
  });
  it("is due soon through today + 7 days, later after that", () => {
    expect(billTiming(unpaid("2026-11-22"), TODAY)).toBe("dueSoon");
    expect(billTiming(unpaid(addDays(TODAY, DUE_SOON_DAYS)), TODAY)).toBe("dueSoon");
    expect(billTiming(unpaid(addDays(TODAY, DUE_SOON_DAYS + 1)), TODAY)).toBe("later");
  });
  it("is paid once paid, whatever the due date", () => {
    expect(billTiming({ status: "paid", dueDate: "2020-01-01" }, TODAY)).toBe("paid");
  });
});

describe("matchesFilter", () => {
  const bills = [
    { status: "unpaid" as const, dueDate: "2026-11-10" }, // overdue
    { status: "unpaid" as const, dueDate: TODAY }, // due today
    { status: "unpaid" as const, dueDate: "2026-11-28" }, // in 7 days
    { status: "unpaid" as const, dueDate: "2026-12-15" }, // later
    { status: "paid" as const, dueDate: "2026-11-01" },
  ];
  const pick = (f: Parameters<typeof matchesFilter>[1]) => bills.filter((b) => matchesFilter(b, f, TODAY)).map((b) => b.dueDate);
  it("splits bills into the lists of the page", () => {
    expect(pick("unpaid")).toEqual(["2026-11-10", TODAY, "2026-11-28", "2026-12-15"]);
    expect(pick("overdue")).toEqual(["2026-11-10"]);
    expect(pick("week")).toEqual([TODAY, "2026-11-28"]);
    expect(pick("paid")).toEqual(["2026-11-01"]);
    expect(pick("all")).toHaveLength(5);
  });
  it("uses the same range as the SQL filter for the week", () => {
    expect(dueSoonRange(TODAY)).toEqual({ from: TODAY, to: "2026-11-28" });
  });
});

describe("money", () => {
  it("works in cents", () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents("1234.56")).toBe(123456);
    expect(toCents("abc")).toBe(0);
    expect(toCents(null)).toBe(0);
    expect(centsToDecimal(123450)).toBe("1234.50");
  });
});

describe("summarizeBills", () => {
  const bills: BillForTotals[] = [
    { status: "unpaid", dueDate: "2026-11-01", amount: "100.10" }, // overdue
    { status: "unpaid", dueDate: "2026-11-20", amount: 0.2 }, // overdue (yesterday)
    { status: "unpaid", dueDate: TODAY, amount: "50.00" }, // due today → this week
    { status: "unpaid", dueDate: "2026-11-28", amount: "25.25" }, // day 7 → this week
    { status: "unpaid", dueDate: "2026-11-29", amount: "1000" }, // later
    { status: "paid", dueDate: "2026-11-02", amount: "999.99" }, // ignored
  ];
  it("adds what's owed, what's late and what's due this week, in exact cents", () => {
    expect(summarizeBills(bills, TODAY)).toEqual({
      unpaidTotal: 1175.55, unpaidCount: 5,
      overdueTotal: 100.3, overdueCount: 2,
      dueSoonTotal: 75.25, dueSoonCount: 2,
    });
  });
  it("is all zeros with nothing to pay", () => {
    expect(summarizeBills([], TODAY)).toEqual({ unpaidTotal: 0, unpaidCount: 0, overdueTotal: 0, overdueCount: 0, dueSoonTotal: 0, dueSoonCount: 0 });
  });
  it("moves a bill from 'this week' to 'overdue' the day after it's due", () => {
    const one: BillForTotals[] = [{ status: "unpaid", dueDate: TODAY, amount: 10 }];
    expect(summarizeBills(one, TODAY).overdueCount).toBe(0);
    expect(summarizeBills(one, addDays(TODAY, 1)).overdueCount).toBe(1);
  });
});

describe("balancesByVendor", () => {
  it("totals unpaid bills per vendor and counts the late ones", () => {
    const m = balancesByVendor([
      { vendorId: 1, status: "unpaid", dueDate: "2026-11-01", amount: "10.10" },
      { vendorId: 1, status: "unpaid", dueDate: "2026-12-01", amount: "0.20" },
      { vendorId: 1, status: "paid", dueDate: "2026-10-01", amount: "500" },
      { vendorId: 2, status: "unpaid", dueDate: TODAY, amount: 7 },
      { vendorId: 3, status: "paid", dueDate: TODAY, amount: 7 },
    ], TODAY);
    expect(m.get(1)).toEqual({ unpaidTotal: 10.3, unpaidCount: 2, overdueCount: 1 });
    expect(m.get(2)).toEqual({ unpaidTotal: 7, unpaidCount: 1, overdueCount: 0 });
    expect(m.has(3)).toBe(false);
  });
});

describe("vendor names and text", () => {
  it("treats names that differ only in case, accents or spaces as the same vendor", () => {
    expect(sameVendorName("José  Pérez", "jose perez")).toBe(true);
    expect(sameVendorName("Home Depot", "Home Depot Inc")).toBe(false);
  });
  it("cleans text, empty becomes null", () => {
    expect(cleanText("  Ferretería   El  Sol ")).toBe("Ferretería El Sol");
    expect(cleanText("   ")).toBeNull();
    expect(cleanText(undefined)).toBeNull();
  });
});

describe("expenseFromBill", () => {
  it("builds the expense a paid bill records", () => {
    expect(expenseFromBill({ id: 42, description: "Renta de diciembre", amount: "1200.5", notes: " pagar antes del 5 " }, "Inmobiliaria Sol", TODAY, "zelle")).toEqual({
      description: "Inmobiliaria Sol · Renta de diciembre",
      category: "vendors",
      subcategory: "Inmobiliaria Sol",
      amount: "1200.50",
      paymentMethod: "zelle",
      date: TODAY,
      reference: "BILL-42",
      notes: "pagar antes del 5",
    });
  });
  it("fits the expense columns (description 255, subcategory 100)", () => {
    const e = expenseFromBill({ id: 1, description: "x".repeat(300), amount: 1 }, "V".repeat(150), TODAY, "cash");
    expect(e.description.length).toBe(255);
    expect(e.subcategory.length).toBe(100);
    expect(e.notes).toBeNull();
  });
  it("numbers its journal entry so it can't collide with expenses.create's or Recibos'", () => {
    expect(vendorEntryNumber(TODAY, 12, 345)).toBe("GAS-20261121-B12-E345");
    expect(vendorEntryNumber(TODAY, 1, 1)).not.toBe("GAS-20261121-0001");
    expect(vendorEntryNumber(TODAY, 1, 1)).not.toBe("GAS-20261121-R1-E1");
  });
  it("finds the expense's journal entries by the references they can carry", () => {
    expect(expenseEntryReference(345)).toBe("EXP-345");
    expect(expenseEntryReferences(345)).toEqual(["EXP-345", "exp_345"]);
  });
});

// The real procedures, with no database: every case below must be turned away before a query runs.
// The URLs point at a closed port so a mistake fails to connect instead of touching data.
describe("vendor procedures reject bad requests up front", () => {
  type Proc = (input?: unknown) => Promise<unknown>;
  type Caller = {
    vendors: {
      list: Proc; create: Proc; update: Proc; archive: Proc;
      bills: { list: Proc; summary: Proc; create: Proc; update: Proc; delete: Proc; markPaid: Proc; markUnpaid: Proc };
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

  const user = { id: 999_003, email: "vendors@test.local", role: "user", name: "Test" };
  const injection = "2026-11-21' OR 1=1 -- ";
  const bill = { vendorId: 1, description: "Renta", amount: 100, dueDate: TODAY };

  it("needs a session", async () => {
    const c = makeCaller();
    expect(await code(c.vendors.list())).toBe("UNAUTHORIZED");
    expect(await code(c.vendors.bills.summary())).toBe("UNAUTHORIZED");
    expect(await code(c.vendors.bills.create(bill))).toBe("UNAUTHORIZED");
    expect(await code(c.vendors.bills.markPaid({ id: 1, paidDate: TODAY, method: "cash" }))).toBe("UNAUTHORIZED");
    expect(await code(c.vendors.bills.markUnpaid({ id: 1 }))).toBe("UNAUTHORIZED");
  });

  it("refuses dates that aren't real days (no SQL gets through)", async () => {
    const c = makeCaller(user);
    expect(await code(c.vendors.list({ today: injection }))).toBe("BAD_REQUEST");
    expect(await code(c.vendors.bills.list({ filter: "overdue", today: injection }))).toBe("BAD_REQUEST");
    expect(await code(c.vendors.bills.summary({ today: "2026-02-30" }))).toBe("BAD_REQUEST");
    expect(await code(c.vendors.bills.create({ ...bill, dueDate: injection }))).toBe("BAD_REQUEST");
    expect(await code(c.vendors.bills.markPaid({ id: 1, paidDate: injection, method: "cash" }))).toBe("BAD_REQUEST");
  });

  it.each([
    [{ ...bill, amount: 0 }],
    [{ ...bill, amount: -5 }],
    [{ ...bill, amount: 0.001 }],
    [{ ...bill, amount: MAX_BILL_AMOUNT + 1 }],
    [{ ...bill, amount: "100" }],
    [{ ...bill, description: "   " }],
    [{ ...bill, vendorId: -1 }],
    [{ ...bill, vendorId: undefined, newVendorName: "" }],
  ])("bills.create refuses %j", async (input) => {
    expect(await code(makeCaller(user).vendors.bills.create(input))).toBe("BAD_REQUEST");
  });

  it("refuses unknown filters, methods and bad vendor fields", async () => {
    const c = makeCaller(user);
    expect(await code(c.vendors.bills.list({ filter: "everything" }))).toBe("BAD_REQUEST");
    expect(await code(c.vendors.bills.list({ limit: 10_000 }))).toBe("BAD_REQUEST");
    expect(await code(c.vendors.bills.markPaid({ id: 1, paidDate: TODAY, method: "bitcoin" }))).toBe("BAD_REQUEST");
    expect(await code(c.vendors.create({ name: "" }))).toBe("BAD_REQUEST");
    expect(await code(c.vendors.create({ name: "Sol", email: "not-an-email" }))).toBe("BAD_REQUEST");
    expect(await code(c.vendors.archive({ id: "1" }))).toBe("BAD_REQUEST");
  });
});
