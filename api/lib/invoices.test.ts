import { describe, expect, it } from "vitest";
import {
  DEFAULT_REMINDERS, balanceCents, checkPayment, checkRefund, daysBetween, dueDateFor, dueInfo, invoiceState, isEmail, isOwed,
  mailtoUrl, matchesFilter, monthStartOf, netByMethod, netPaidCents, nextReminder, reminderDates, reminderToSend, reversalByMethod,
  saleMethodFor, whatsappPhone, whatsappUrl, type MoneyMove, type ReminderSettings,
} from "./invoices";

const base = { voided: false, writtenOff: false, dueDate: "2026-11-20" as string | null, today: "2026-11-21" };

describe("invoiceState", () => {
  it("drafts have no sale yet", () => {
    expect(invoiceState({ ...base, saleStatus: null })).toBe("draft");
    expect(invoiceState({ ...base, saleStatus: null, voided: true })).toBe("void");
  });

  it("a pending sale is open until the day after its due date", () => {
    expect(invoiceState({ ...base, saleStatus: "pending", dueDate: "2026-11-21" })).toBe("open");
    expect(invoiceState({ ...base, saleStatus: "pending", dueDate: "2026-11-22" })).toBe("open");
    expect(invoiceState({ ...base, saleStatus: "pending", dueDate: "2026-11-20" })).toBe("late");
    expect(invoiceState({ ...base, saleStatus: "pending", dueDate: null })).toBe("open");
  });

  it("maps the other sale statuses", () => {
    expect(invoiceState({ ...base, saleStatus: "completed" })).toBe("paid");
    expect(invoiceState({ ...base, saleStatus: "refunded" })).toBe("refunded");
    expect(invoiceState({ ...base, saleStatus: "cancelled" })).toBe("void");
    expect(invoiceState({ ...base, saleStatus: "cancelled", writtenOff: true })).toBe("writeoff");
    expect(invoiceState({ ...base, saleStatus: "completed", writtenOff: true })).toBe("writeoff");
  });

  it("only open and late count as owed; filters match their state", () => {
    expect(isOwed("open") && isOwed("late")).toBe(true);
    expect(isOwed("paid") || isOwed("draft") || isOwed("void") || isOwed("writeoff")).toBe(false);
    expect(matchesFilter("void", "all")).toBe(true);
    expect(matchesFilter("late", "open")).toBe(false);
    expect(matchesFilter("late", "late")).toBe(true);
  });
});

describe("dates", () => {
  it("counts whole days across months and leap years", () => {
    expect(daysBetween("2026-11-21", "2026-11-21")).toBe(0);
    expect(daysBetween("2026-11-21", "2026-12-05")).toBe(14);
    expect(daysBetween("2026-11-21", "2026-11-16")).toBe(-5);
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
  });

  it("due date = issue date + terms, clamped", () => {
    expect(dueDateFor("2026-11-21", 14)).toBe("2026-12-05");
    expect(dueDateFor("2026-11-21", 0)).toBe("2026-11-21");
    expect(dueDateFor("2026-11-21", -3)).toBe("2026-11-21");
  });

  it("describes the due date relative to today", () => {
    expect(dueInfo(null, "2026-11-21")).toEqual({ kind: "none" });
    expect(dueInfo("2026-11-16", "2026-11-21")).toEqual({ kind: "overdue", days: 5 });
    expect(dueInfo("2026-11-21", "2026-11-21")).toEqual({ kind: "today" });
    expect(dueInfo("2026-11-22", "2026-11-21")).toEqual({ kind: "tomorrow" });
    expect(dueInfo("2026-11-30", "2026-11-21")).toEqual({ kind: "in", days: 9 });
  });

  it("month start", () => {
    expect(monthStartOf("2026-11-21")).toBe("2026-11-01");
  });
});

describe("reminders", () => {
  const due = "2026-11-20";

  it("lists 3 days before, the due day and 3 days after", () => {
    expect(reminderDates(due, DEFAULT_REMINDERS, "2026-12-31").map((r) => `${r.date}:${r.kind}`))
      .toEqual(["2026-11-17:before", "2026-11-20:onDue", "2026-11-23:after"]);
  });

  it("adds weekly ones while overdue, up to the given day", () => {
    const s: ReminderSettings = { before: false, onDue: false, after: false, weekly: true };
    expect(reminderDates(due, s, "2026-12-10").map((r) => r.date)).toEqual(["2026-11-27", "2026-12-04"]);
  });

  it("finds the next one on or after today", () => {
    expect(nextReminder(due, DEFAULT_REMINDERS, "2026-11-10")).toEqual({ date: "2026-11-17", kind: "before" });
    expect(nextReminder(due, DEFAULT_REMINDERS, "2026-11-18")).toEqual({ date: "2026-11-20", kind: "onDue" });
    expect(nextReminder(due, DEFAULT_REMINDERS, "2026-11-23")).toEqual({ date: "2026-11-23", kind: "after" });
    expect(nextReminder(due, DEFAULT_REMINDERS, "2026-11-24")).toBeNull();
    expect(nextReminder(due, { ...DEFAULT_REMINDERS, weekly: true }, "2026-11-24")).toEqual({ date: "2026-11-27", kind: "weekly" });
    expect(nextReminder(due, { before: false, onDue: false, after: false, weekly: false }, "2026-11-01")).toBeNull();
  });

  it("says which reminder is waiting to be sent", () => {
    expect(reminderToSend(due, DEFAULT_REMINDERS, "2026-11-16", null)).toBeNull();
    expect(reminderToSend(due, DEFAULT_REMINDERS, "2026-11-18", null)).toEqual({ date: "2026-11-17", kind: "before" });
    expect(reminderToSend(due, DEFAULT_REMINDERS, "2026-11-18", "2026-11-17")).toBeNull();
    expect(reminderToSend(due, DEFAULT_REMINDERS, "2026-11-21", "2026-11-17")).toEqual({ date: "2026-11-20", kind: "onDue" });
  });
});

describe("money", () => {
  const moves: MoneyMove[] = [
    { kind: "payment", method: "zelle", cents: 30_000 },
    { kind: "payment", method: "cash", cents: 10_000 },
    { kind: "refund", method: "zelle", cents: 5_000 },
  ];

  it("nets payments and refunds per method", () => {
    expect(netByMethod(moves)).toEqual({ cash: 10_000, zelle: 25_000, card: 0 });
    expect(netPaidCents(moves)).toBe(35_000);
    expect(balanceCents(45_000, moves)).toBe(10_000);
    expect(balanceCents(30_000, moves)).toBe(0);
  });

  it("checks a payment against what's owed", () => {
    expect(checkPayment(10_000, 10_000)).toBe("ok");
    expect(checkPayment(10_001, 10_000)).toBe("tooMuch");
    expect(checkPayment(0, 10_000)).toBe("zero");
    expect(checkPayment(12.5, 10_000)).toBe("zero");
    expect(checkRefund(35_001, 35_000)).toBe("tooMuch");
  });

  it("keeps the method or says mixed", () => {
    expect(saleMethodFor(["zelle", "zelle"])).toBe("zelle");
    expect(saleMethodFor(["zelle", "cash"])).toBe("mixed");
    expect(saleMethodFor([])).toBe("cash");
  });

  it("splits a reversal so no account gives back more than it got", () => {
    expect(reversalByMethod({ cash: 10_000, zelle: 25_000, card: 0 }, 35_000)).toEqual([
      { method: "zelle", cents: 25_000 }, { method: "cash", cents: 10_000 },
    ]);
    expect(reversalByMethod({ cash: 10_000, zelle: 25_000, card: 0 }, 30_000)).toEqual([
      { method: "zelle", cents: 25_000 }, { method: "cash", cents: 5_000 },
    ]);
    expect(reversalByMethod({ cash: 0, zelle: 0, card: 0 }, 100)).toEqual([]);
  });
});

describe("share links", () => {
  it("normalizes US phone numbers for WhatsApp", () => {
    expect(whatsappPhone("(555) 210-4471")).toBe("15552104471");
    expect(whatsappPhone("+52 55 1234 5678")).toBe("525512345678");
    expect(whatsappPhone("123")).toBeNull();
    expect(whatsappPhone(null)).toBeNull();
  });

  it("builds the WhatsApp and email links with the text encoded", () => {
    expect(whatsappUrl("555-210-4471", "Hola & gracias")).toBe("https://wa.me/15552104471?text=Hola%20%26%20gracias");
    expect(whatsappUrl(null, "Hola")).toBe("https://wa.me/?text=Hola");
    expect(mailtoUrl("ana@example.com", "Factura", "Total: $10")).toBe("mailto:ana@example.com?subject=Factura&body=Total%3A%20%2410");
    expect(mailtoUrl("not an email", "S", "B")).toBe("mailto:?subject=S&body=B");
    expect(isEmail("a@b.co")).toBe(true);
    expect(isEmail("a@b")).toBe(false);
  });
});
