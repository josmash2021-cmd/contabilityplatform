import { describe, expect, it } from "vitest";
import {
  addDays, averagePayDays, balanceCents, cashChips, cashCountResult, centsToDecimal, changeDue, dayIn, dayTotals, dayWindow, daysBetween,
  findDuplicate, firstOfMonth, guessField, isIdle, isIsoDay, isLate, isValidTimeZone, mailtoLink, marginPct, methodOf, parseMoneyInput,
  paymentsMatchTotal, phoneDigits, splitFullName, splitPayment, stockState, toCents, unitsByService, whatsappLink,
} from "./ventas";
import { memberCan } from "./team";

describe("money", () => {
  it("cents both ways, without float drift", () => {
    expect(toCents("12.5")).toBe(1250);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents("$1,234.56")).toBe(123456);
    expect(toCents("abc")).toBe(0);
    expect(centsToDecimal(123456)).toBe("1234.56");
    expect(centsToDecimal(5)).toBe("0.05");
    expect(centsToDecimal(-250)).toBe("-2.50");
  });

  it("reads what people type in a money box", () => {
    expect(parseMoneyInput("600")).toBe(60000);
    expect(parseMoneyInput("$1,200.5")).toBe(120050);
    expect(parseMoneyInput("")).toBeNull();
    expect(parseMoneyInput("12.345")).toBeNull();
    expect(parseMoneyInput("1.2.3")).toBeNull();
    expect(parseMoneyInput(".")).toBeNull();
  });
});

describe("Cobrar", () => {
  it("change to give back, or what's missing", () => {
    expect(changeDue(55500, 60000)).toEqual({ changeCents: 4500, shortCents: 0 });
    expect(changeDue(55500, 50000)).toEqual({ changeCents: 0, shortCents: 5500 });
    expect(changeDue(55500, null)).toEqual({ changeCents: 0, shortCents: 0 });
  });

  it("quick cash amounts: exact, next $50, next $100, no repeats", () => {
    expect(cashChips(55500)).toEqual([55500, 60000]);
    expect(cashChips(17000)).toEqual([17000, 20000]);
    expect(cashChips(12345)).toEqual([12345, 15000, 20000]);
    expect(cashChips(10000)).toEqual([10000]);
    expect(cashChips(0)).toEqual([]);
  });

  it("split: part cash, the rest by card or Zelle, both more than $0", () => {
    expect(splitPayment(55500, 10000, "card")).toEqual({ ok: true, payments: [{ method: "cash", cents: 10000 }, { method: "card", cents: 45500 }] });
    expect(splitPayment(55500, 0, "card")).toEqual({ ok: false, reason: "noCash" });
    expect(splitPayment(55500, null, "zelle")).toEqual({ ok: false, reason: "noCash" });
    expect(splitPayment(55500, 55500, "zelle")).toEqual({ ok: false, reason: "allCash" });
  });

  it("payment method of a sale and the server's total check", () => {
    expect(methodOf([{ method: "cash" }, { method: "card" }])).toBe("mixed");
    expect(methodOf([{ method: "zelle" }])).toBe("zelle");
    expect(paymentsMatchTotal([{ amount: "100.00" }, { amount: 455 }], "555.00")).toBe(true);
    expect(paymentsMatchTotal([{ amount: "100.00" }, { amount: 455.01 }], "555.00")).toBe(false);
  });

  it("units per service for the stock (same service on two lines adds up; custom lines don't count)", () => {
    const m = unitsByService([{ serviceId: 4, quantity: 2 }, { serviceId: 4, quantity: 1 }, { serviceId: 9, quantity: 1 }, { quantity: 5 }]);
    expect([...m]).toEqual([[4, 3], [9, 1]]);
  });
});

describe("cierre de caja", () => {
  it("difference between counted and expected", () => {
    expect(cashCountResult(70500, 70500)).toEqual({ differenceCents: 0, status: "ok" });
    expect(cashCountResult(70500, 50000)).toEqual({ differenceCents: -20500, status: "short" });
    expect(cashCountResult(70500, 71000)).toEqual({ differenceCents: 500, status: "over" });
  });

  it("totals per method; cash given back leaves the drawer", () => {
    const t = dayTotals(
      [{ method: "cash", cents: 55500 }, { method: "cash", cents: 15000 }, { method: "card", cents: 8500 }, { method: "zelle", cents: 2000 }],
      [{ method: "cash", cents: 1000 }],
    );
    expect(t).toEqual({ cash: 69500, card: 8500, zelle: 2000, total: 80000 });
  });
});

describe("days and time zones", () => {
  it("valid days and zones", () => {
    expect(isIsoDay("2026-11-21")).toBe(true);
    expect(isIsoDay("2026-02-30")).toBe(false);
    expect(isIsoDay("21/11/2026")).toBe(false);
    expect(isValidTimeZone("America/Chicago")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });

  it("a day in Chicago runs from 06:00 UTC (winter) and 05:00 UTC (summer)", () => {
    expect(dayWindow("2026-11-21", "America/Chicago")).toEqual({ start: new Date("2026-11-21T06:00:00Z"), end: new Date("2026-11-22T06:00:00Z") });
    expect(dayWindow("2026-07-04", "America/Chicago").start.toISOString()).toBe("2026-07-04T05:00:00.000Z");
    // The day clocks go back is 25 hours long.
    const fallBack = dayWindow("2026-11-01", "America/Chicago");
    expect((fallBack.end.getTime() - fallBack.start.getTime()) / 3_600_000).toBe(25);
    expect(dayWindow("2026-11-21", "UTC").start.toISOString()).toBe("2026-11-21T00:00:00.000Z");
  });

  it("the day an instant falls on, per zone", () => {
    const late = new Date("2026-11-22T03:30:00Z"); // 9:30 pm on the 21st in Chicago
    expect(dayIn(late, "America/Chicago")).toBe("2026-11-21");
    expect(dayIn(late, "UTC")).toBe("2026-11-22");
  });

  it("day arithmetic", () => {
    expect(addDays("2026-11-21", 14)).toBe("2026-12-05");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-11-01", "2026-11-21")).toBe(20);
    expect(daysBetween("2026-11-21", "2026-11-01")).toBe(-20);
    expect(firstOfMonth("2026-11-21")).toBe("2026-11-01");
  });
});

describe("productos", () => {
  it("margin, and nothing without a price", () => {
    expect(marginPct(8500, 2800)).toBe(67);
    expect(marginPct(6000, 0)).toBe(100);
    expect(marginPct(1000, 1500)).toBe(-50);
    expect(marginPct(0, 500)).toBeNull();
  });

  it("stock states", () => {
    expect(stockState(false, 0)).toBe("untracked");
    expect(stockState(true, 10)).toBe("ok");
    expect(stockState(true, 3)).toBe("low");
    expect(stockState(true, 0)).toBe("out");
    expect(stockState(true, -2)).toBe("out");
  });
});

describe("clientes", () => {
  it("balance = total − payments + refunds, never below 0", () => {
    expect(balanceCents(85000, [])).toBe(85000);
    expect(balanceCents(85000, [{ kind: "payment", cents: 30000 }])).toBe(55000);
    expect(balanceCents(85000, [{ kind: "payment", cents: 85000 }, { kind: "refund", cents: 10000 }])).toBe(10000);
    expect(balanceCents(85000, [{ kind: "payment", cents: 90000 }])).toBe(0);
  });

  it("late the day after the due date; idle after 90 days", () => {
    expect(isLate("2026-11-20", "2026-11-21")).toBe(true);
    expect(isLate("2026-11-21", "2026-11-21")).toBe(false);
    expect(isLate(null, "2026-11-21")).toBe(false);
    expect(isIdle("2026-08-12", "2026-11-21")).toBe(true);
    expect(isIdle("2026-09-01", "2026-11-21")).toBe(false);
    expect(isIdle(null, "2026-11-21")).toBe(false);
  });

  it("how many days they take to pay, on average", () => {
    expect(averagePayDays([])).toBeNull();
    expect(averagePayDays([{ issueDay: "2026-10-01", paidDay: "2026-10-22" }, { issueDay: "2026-11-01", paidDay: "2026-11-21" }])).toBe(21);
  });
});

describe("import", () => {
  const existing = [
    { name: "Ana", lastName: "Torres", email: "ana.torres@example.com", phone: "(555) 402-1187" },
    { name: "Luis", lastName: "Mena", email: null, phone: null },
  ];

  it("same email, same phone (any format) or same full name is the same person", () => {
    expect(findDuplicate({ name: "A.", email: "ANA.TORRES@example.com" }, existing)).toBe(0);
    expect(findDuplicate({ name: "Anita", phone: "+1 555 402 1187" }, existing)).toBe(0);
    expect(findDuplicate({ name: "luis", lastName: "Ména" }, existing)).toBe(1);
    expect(findDuplicate({ name: "Luis Mena" }, existing)).toBe(1);
    expect(findDuplicate({ name: "Pedro", phone: "123" }, existing)).toBe(-1);
  });

  it("phone digits drop the US 1", () => {
    expect(phoneDigits("+1 (555) 210-4471")).toBe("5552104471");
    expect(phoneDigits("555-210-4471")).toBe("5552104471");
  });

  it("guesses columns from Spanish or English headers", () => {
    expect(guessField("Nombre completo")).toBe("fullName");
    expect(guessField("Nombre")).toBe("name");
    expect(guessField("Apellido")).toBe("lastName");
    expect(guessField("Tel")).toBe("phone");
    expect(guessField("E-mail")).toBe("email");
    expect(guessField("Correo electrónico")).toBe("email");
    expect(guessField("Ciudad")).toBe("address");
    expect(guessField("Saldo anterior")).toBe("skip");
  });

  it("splits a full name into name and last name", () => {
    expect(splitFullName("Ana María Torres")).toEqual({ name: "Ana María", lastName: "Torres" });
    expect(splitFullName("Cher")).toEqual({ name: "Cher", lastName: "" });
  });
});

describe("messages from the user's own phone", () => {
  it("WhatsApp to a US number gets the 1; without a number it's a plain share", () => {
    expect(whatsappLink("(555) 210-4471", "Hola")).toBe("https://wa.me/15552104471?text=Hola");
    expect(whatsappLink(null, "Hola Ana")).toBe("https://wa.me/?text=Hola%20Ana");
    expect(mailtoLink("a@b.co", "Recibo", "Total $5")).toBe("mailto:a%40b.co?subject=Recibo&body=Total%20%245");
  });
});

describe("team access to Ventas", () => {
  it("staff sell, count the drawer and see clients; they don't edit the catalog or import", () => {
    expect(memberCan("staff", "sales.cashCount.today", "query")).toBe(true);
    expect(memberCan("staff", "sales.cashCount.save", "mutation")).toBe(true);
    expect(memberCan("staff", "customers.overview", "query")).toBe(true);
    expect(memberCan("staff", "customers.detail", "query")).toBe(true);
    expect(memberCan("staff", "customers.importMerge", "mutation")).toBe(false);
    expect(memberCan("staff", "services.update", "mutation")).toBe(false);
  });

  it("the accountant reads the cash counts but never saves one", () => {
    expect(memberCan("accountant", "sales.cashCount.today", "query")).toBe(true);
    expect(memberCan("accountant", "sales.cashCount.save", "mutation")).toBe(false);
  });
});
