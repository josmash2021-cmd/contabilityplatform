import { describe, expect, it } from "vitest";
import {
  CHANGE_DAYS, MAX_HISTORY_DAYS, MAX_NICKNAME, accountKind, balanceSeries, clampSince, cleanNickname,
  displayAccountName, plaidProblem, signedPlaidAmount, weekBills, type WeekBillRow,
} from "./banks";
import { addDays } from "./vendors";

const TODAY = "2026-11-21";

describe("accountKind", () => {
  it("cards and loans are debt; everything else is money you have", () => {
    expect(accountKind("credit")).toBe("credit");
    expect(accountKind("loan")).toBe("loan");
    expect(accountKind("depository")).toBe("cash");
    expect(accountKind("investment")).toBe("cash");
    expect(accountKind(null)).toBe("cash");
  });
});

describe("signedPlaidAmount", () => {
  it("uses Plaid's sign when it's there", () => {
    expect(signedPlaidAmount({ plaidAmount: "-300.00", amount: "300.00", type: "income" })).toBe(-300);
    expect(signedPlaidAmount({ plaidAmount: 15.49, amount: 15.49, type: "expense" })).toBe(15.49);
  });
  it("falls back to the type for old rows", () => {
    expect(signedPlaidAmount({ plaidAmount: null, amount: "120.00", type: "income" })).toBe(-120);
    expect(signedPlaidAmount({ plaidAmount: null, amount: "-45.10", type: "expense" })).toBe(45.1);
    expect(signedPlaidAmount({ plaidAmount: "", amount: "8", type: "expense" })).toBe(8);
  });
});

describe("balanceSeries", () => {
  it("has one point per day plus the starting balance, ending at today's balance", () => {
    const s = balanceSeries(1000, "cash", [], TODAY);
    expect(s.points).toHaveLength(CHANGE_DAYS + 1);
    expect(s.points.every((p) => p === 1000)).toBe(true);
    expect(s.change).toBe(0);
  });

  it("rebuilds a bank account backwards: money in raised it, money out lowered it", () => {
    const txs = [
      { date: TODAY, plaidAmount: -500 }, // deposit today
      { date: addDays(TODAY, -2), plaidAmount: 120.25 }, // paid out two days ago
      { date: addDays(TODAY, -2), plaidAmount: 0.1 },
      { date: addDays(TODAY, -2), plaidAmount: 0.2 }, // float noise must not leak
    ];
    const s = balanceSeries(2000, "cash", txs, TODAY);
    const last = s.points.length - 1;
    expect(s.points[last]).toBe(2000); // end of today
    expect(s.points[last - 1]).toBe(1500); // before today's deposit
    expect(s.points[last - 2]).toBe(1500);
    expect(s.points[last - 3]).toBe(1620.55); // before the payments two days ago
    expect(s.points[0]).toBe(1620.55);
    expect(s.change).toBe(379.45);
  });

  it("only counts the last 30 days, and a movement dated tomorrow counts as today", () => {
    const txs = [
      { date: addDays(TODAY, -(CHANGE_DAYS - 1)), plaidAmount: -100 }, // first day of the window: counts
      { date: addDays(TODAY, -CHANGE_DAYS), plaidAmount: -999 }, // the day before the window: doesn't
      { date: addDays(TODAY, 1), plaidAmount: 40 },
      { date: "not-a-date", plaidAmount: 5000 },
    ];
    const s = balanceSeries(700, "cash", txs, TODAY);
    expect(s.change).toBe(60);
    expect(s.points[0]).toBe(640);
    expect(s.points[1]).toBe(740);
    expect(s.points[CHANGE_DAYS - 1]).toBe(740);
  });

  it("for a card the balance is what's owed: charges raise it, payments lower it", () => {
    const txs = [
      { date: addDays(TODAY, -1), plaidAmount: 200 }, // charge
      { date: addDays(TODAY, -5), plaidAmount: -500 }, // payment
    ];
    const s = balanceSeries(1240.18, "credit", txs, TODAY);
    expect(s.points[CHANGE_DAYS]).toBe(1240.18);
    expect(s.points[CHANGE_DAYS - 1]).toBe(1240.18); // end of yesterday, after the charge
    expect(s.points[CHANGE_DAYS - 2]).toBe(1040.18); // before it
    expect(s.points[0]).toBe(1540.18);
    expect(s.change).toBe(-300);
  });

  it("works with any window length", () => {
    const s = balanceSeries(10, "cash", [{ date: TODAY, plaidAmount: -10 }], TODAY, 7);
    expect(s.points).toEqual([0, 0, 0, 0, 0, 0, 0, 10]);
  });
});

describe("weekBills", () => {
  const bill = (id: number, dueIn: number, amount: number | string, status: "unpaid" | "paid" = "unpaid", vendor = `V${id}`): WeekBillRow =>
    ({ id, vendor, amount, dueDate: addDays(TODAY, dueIn), status });

  it("keeps unpaid bills due today through 7 days ahead, soonest first", () => {
    const r = weekBills([bill(1, 5, 980), bill(2, 0, 640), bill(3, 7, 10), bill(4, 8, 99), bill(5, -1, 50), bill(6, 2, 70, "paid")], TODAY);
    expect(r.bills.map((b) => b.id)).toEqual([2, 1, 3]);
    expect(r.total).toBe(1630);
  });
  it("adds in cents and reads decimal strings", () => {
    const r = weekBills([bill(1, 1, "0.10"), bill(2, 1, "0.20"), bill(3, 1, "bad")], TODAY);
    expect(r.total).toBe(0.3);
    expect(r.bills.map((b) => b.id)).toEqual([2, 1, 3]); // same day: biggest first
  });
  it("is empty when nothing is due", () => {
    expect(weekBills([], TODAY)).toEqual({ bills: [], total: 0 });
  });
});

describe("displayAccountName", () => {
  it("drops a trailing copy of the mask (it showed as …2443 ··2443)", () => {
    expect(displayAccountName("BUSINESS CHECKING ...2443", "2443")).toBe("BUSINESS CHECKING");
    expect(displayAccountName("Chase Total Checking …2443", "2443")).toBe("Chase Total Checking");
    expect(displayAccountName("Ink Business Cash (x7702)", "7702")).toBe("Ink Business Cash");
    expect(displayAccountName("Savings - 4411", "4411")).toBe("Savings");
    expect(displayAccountName("Checking ••8820", "8820")).toBe("Checking");
    expect(displayAccountName("Checking ending in 8820", "8820")).toBe("Checking");
    expect(displayAccountName("Plaid Checking 0000", "0000")).toBe("Plaid Checking");
  });
  it("leaves names without the mask alone", () => {
    expect(displayAccountName("Plaid Checking", "0000")).toBe("Plaid Checking");
    expect(displayAccountName("Account 24431", "2443")).toBe("Account 24431");
    expect(displayAccountName("Checking", null)).toBe("Checking");
    expect(displayAccountName("  Ahorros  ", "")).toBe("Ahorros");
  });
  it("never empties a name that is only the mask, and ignores odd masks", () => {
    expect(displayAccountName("2443", "2443")).toBe("2443");
    expect(displayAccountName("Checking (.*)", "(.*)")).toBe("Checking (.*)");
  });
});

describe("cleanNickname", () => {
  it("trims, collapses spaces and caps the length", () => {
    expect(cleanNickname("  Cuenta   de  nómina ")).toBe("Cuenta de nómina");
    expect(cleanNickname("x".repeat(80))).toHaveLength(MAX_NICKNAME);
  });
  it("empty means no nickname", () => {
    expect(cleanNickname("   ")).toBeNull();
    expect(cleanNickname(null)).toBeNull();
  });
});

describe("clampSince", () => {
  it("defaults to 30 days back and keeps a valid day", () => {
    expect(clampSince(null, TODAY)).toBe(addDays(TODAY, -30));
    expect(clampSince("2026-01-15", TODAY)).toBe("2026-01-15");
  });
  it("never goes past Plaid's limit or after today; bad input falls back", () => {
    expect(clampSince("2019-01-01", TODAY)).toBe(addDays(TODAY, -MAX_HISTORY_DAYS));
    expect(clampSince("2027-01-01", TODAY)).toBe(TODAY);
    expect(clampSince("2026-02-30", TODAY)).toBe(addDays(TODAY, -30));
  });
});

describe("plaidProblem", () => {
  it("sorts Plaid errors into what the owner can do", () => {
    expect(plaidProblem("ITEM_LOGIN_REQUIRED")).toBe("needs_reconnect");
    expect(plaidProblem("PENDING_EXPIRATION")).toBe("needs_reconnect");
    expect(plaidProblem("PRODUCT_NOT_READY")).toBe("not_ready");
    expect(plaidProblem("ITEM_NOT_FOUND")).toBe("gone");
    expect(plaidProblem("INTERNAL_SERVER_ERROR")).toBe("error");
    expect(plaidProblem(undefined)).toBe("error");
  });
});
