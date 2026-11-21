import { describe, expect, it } from "vitest";
import {
  MAX_CATCH_UP, addDays, addMonthsAnchored, anchorDayOf, canConvertQuote, canDeleteQuote, canEditQuote, canSetQuoteStatus,
  centsToDecimal, daysInMonth, duePeriods, firstPeriodOnOrAfter, isValidIsoDate, lineTotalCents, localIsoDate, nextPeriodDate,
  quoteExpired, quoteNumber, quoteTotals, scheduleFinished, toCents, todayInTimeZone, type Frequency, type Schedule,
} from "./quotes";

describe("toCents / centsToDecimal", () => {
  it("converts dollars to whole cents without float noise", () => {
    expect(toCents(1.005)).toBe(101);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents("19.99")).toBe(1999);
    expect(toCents(" 7 ")).toBe(700);
    expect(toCents(1234567.89)).toBe(123456789);
  });

  it("treats garbage as zero", () => {
    expect(toCents("abc")).toBe(0);
    expect(toCents(Number.NaN)).toBe(0);
    expect(toCents(Number.POSITIVE_INFINITY)).toBe(0);
    expect(toCents("")).toBe(0);
  });

  it("formats cents the way MySQL decimals look", () => {
    expect(centsToDecimal(0)).toBe("0.00");
    expect(centsToDecimal(5)).toBe("0.05");
    expect(centsToDecimal(123450)).toBe("1234.50");
    expect(centsToDecimal(-250)).toBe("-2.50");
  });
});

describe("quoteTotals", () => {
  it("adds every line as quantity × unit price", () => {
    const t = quoteTotals([{ quantity: 2, unitPrice: 49.99 }, { quantity: 1, unitPrice: "10.01" }, { quantity: 3, unitPrice: 0.1 }]);
    expect(t).toEqual({ subtotalCents: 2 * 4999 + 1001 + 30, discountCents: 0, totalCents: 2 * 4999 + 1001 + 30 });
  });

  it("subtracts the discount", () => {
    expect(quoteTotals([{ quantity: 1, unitPrice: 100 }], 15.5)).toEqual({ subtotalCents: 10000, discountCents: 1550, totalCents: 8450 });
    expect(quoteTotals([{ quantity: 1, unitPrice: 100 }], "20")).toEqual({ subtotalCents: 10000, discountCents: 2000, totalCents: 8000 });
  });

  it("never lets the discount go below zero or above the subtotal", () => {
    expect(quoteTotals([{ quantity: 1, unitPrice: 50 }], 80)).toEqual({ subtotalCents: 5000, discountCents: 5000, totalCents: 0 });
    expect(quoteTotals([{ quantity: 1, unitPrice: 50 }], -10)).toEqual({ subtotalCents: 5000, discountCents: 0, totalCents: 5000 });
  });

  it("is zero with no lines", () => {
    expect(quoteTotals([], 10)).toEqual({ subtotalCents: 0, discountCents: 0, totalCents: 0 });
  });

  it("computes one line exactly in cents", () => {
    expect(lineTotalCents({ quantity: 3, unitPrice: 33.33 })).toBe(9999);
    expect(lineTotalCents({ quantity: 10_000, unitPrice: 1_000_000 })).toBe(1_000_000_000_000);
  });
});

describe("calendar helpers", () => {
  it("validates real calendar days only", () => {
    expect(isValidIsoDate("2026-11-21")).toBe(true);
    expect(isValidIsoDate("2028-02-29")).toBe(true);
    expect(isValidIsoDate("2026-02-29")).toBe(false);
    expect(isValidIsoDate("2026-04-31")).toBe(false);
    expect(isValidIsoDate("2026-13-01")).toBe(false);
    expect(isValidIsoDate("2026-1-01")).toBe(false);
    expect(isValidIsoDate("21/11/2026")).toBe(false);
  });

  it("knows month lengths and leap years", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
    expect(addDays("2028-02-26", 7)).toBe("2028-03-04");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("adds months landing on the anchor day or the month's last day", () => {
    expect(addMonthsAnchored("2026-01-31", 1, 31)).toBe("2026-02-28");
    expect(addMonthsAnchored("2026-02-28", 1, 31)).toBe("2026-03-31");
    expect(addMonthsAnchored("2026-11-30", 2, 30)).toBe("2027-01-30");
    expect(addMonthsAnchored("2026-12-15", 1, 15)).toBe("2027-01-15");
    expect(addMonthsAnchored("2027-11-29", 3, 29)).toBe("2028-02-29");
  });

  it("reads the anchor from the start date", () => {
    expect(anchorDayOf("2026-01-31")).toBe(31);
    expect(anchorDayOf("2026-06-05")).toBe(5);
  });

  it("gives the calendar day in the business timezone, not UTC", () => {
    // 03:00 UTC on Nov 22 is still Nov 21 in Chicago (UTC-6).
    expect(todayInTimeZone(new Date("2026-11-22T03:00:00Z"))).toBe("2026-11-21");
    expect(todayInTimeZone(new Date("2026-11-22T07:00:00Z"))).toBe("2026-11-22");
    expect(todayInTimeZone(new Date("2026-11-22T03:00:00Z"), "UTC")).toBe("2026-11-22");
  });

  it("gives the device's local day", () => {
    expect(localIsoDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});

/** Walks a schedule n periods from its start using nextPeriodDate with the start's anchor. */
function walk(start: string, frequency: Frequency, n: number): string[] {
  const out = [start];
  const anchor = anchorDayOf(start);
  for (let i = 1; i < n; i++) out.push(nextPeriodDate(out[i - 1], frequency, anchor));
  return out;
}

describe("nextPeriodDate", () => {
  it("moves weekly by 7 days", () => {
    expect(walk("2026-12-24", "weekly", 3)).toEqual(["2026-12-24", "2026-12-31", "2027-01-07"]);
  });

  it("keeps monthly invoices on the 31st without drifting to the 28th", () => {
    expect(walk("2026-01-31", "monthly", 7)).toEqual([
      "2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31", "2026-06-30", "2026-07-31",
    ]);
  });

  it("keeps the 30th and 29th through February", () => {
    expect(walk("2026-01-30", "monthly", 3)).toEqual(["2026-01-30", "2026-02-28", "2026-03-30"]);
    expect(walk("2028-01-29", "monthly", 3)).toEqual(["2028-01-29", "2028-02-29", "2028-03-29"]);
  });

  it("moves quarterly by 3 months, anchored", () => {
    expect(walk("2026-11-30", "quarterly", 5)).toEqual(["2026-11-30", "2027-02-28", "2027-05-30", "2027-08-30", "2027-11-30"]);
    expect(walk("2026-08-31", "quarterly", 3)).toEqual(["2026-08-31", "2026-11-30", "2027-02-28"]);
  });

  it("moves yearly and returns to Feb 29 in leap years", () => {
    expect(walk("2028-02-29", "yearly", 5)).toEqual(["2028-02-29", "2029-02-28", "2030-02-28", "2031-02-28", "2032-02-29"]);
  });

  it("defaults the anchor to the given date's day", () => {
    expect(nextPeriodDate("2026-03-15", "monthly")).toBe("2026-04-15");
    expect(nextPeriodDate("2026-12-01", "yearly")).toBe("2027-12-01");
  });
});

describe("duePeriods", () => {
  const monthly: Schedule = { startDate: "2026-01-31", nextDate: "2026-01-31", frequency: "monthly", endDate: null };

  it("has nothing due before the next date", () => {
    expect(duePeriods(monthly, "2026-01-30")).toEqual({ dates: [], next: "2026-01-31", finished: false });
  });

  it("is due on the next date itself", () => {
    expect(duePeriods(monthly, "2026-01-31")).toEqual({ dates: ["2026-01-31"], next: "2026-02-28", finished: false });
  });

  it("catches up on every missed period, oldest first, keeping the anchor", () => {
    const r = duePeriods(monthly, "2026-04-30");
    expect(r.dates).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(r.next).toBe("2026-05-31");
  });

  it("resumes from a shortened month without losing the anchor", () => {
    // After February the stored next date is the 28th; the start date keeps the 31st.
    const r = duePeriods({ ...monthly, nextDate: "2026-02-28" }, "2026-03-31");
    expect(r.dates).toEqual(["2026-02-28", "2026-03-31"]);
    expect(r.next).toBe("2026-04-30");
  });

  it("is idempotent: running again with the new next date creates nothing", () => {
    const first = duePeriods(monthly, "2026-02-28");
    const again = duePeriods({ ...monthly, nextDate: first.next }, "2026-02-28");
    expect(again.dates).toEqual([]);
    expect(again.next).toBe(first.next);
  });

  it("caps how many periods one run creates and continues next time", () => {
    const weekly: Schedule = { startDate: "2026-01-01", nextDate: "2026-01-01", frequency: "weekly", endDate: null };
    const first = duePeriods(weekly, "2026-12-31");
    expect(first.dates).toHaveLength(MAX_CATCH_UP);
    expect(first.dates[0]).toBe("2026-01-01");
    const second = duePeriods({ ...weekly, nextDate: first.next }, "2026-12-31");
    expect(second.dates[0]).toBe(first.next);
    expect(new Set([...first.dates, ...second.dates]).size).toBe(first.dates.length + second.dates.length);
    expect(duePeriods(weekly, "2026-12-31", 3).dates).toEqual(["2026-01-01", "2026-01-08", "2026-01-15"]);
  });

  it("stops after the end date, including it", () => {
    const s: Schedule = { startDate: "2026-01-15", nextDate: "2026-01-15", frequency: "monthly", endDate: "2026-03-15" };
    const r = duePeriods(s, "2026-12-31");
    expect(r.dates).toEqual(["2026-01-15", "2026-02-15", "2026-03-15"]);
    expect(r.next).toBe("2026-04-15");
    expect(r.finished).toBe(true);
    expect(duePeriods({ ...s, nextDate: r.next }, "2027-12-31")).toEqual({ dates: [], next: "2026-04-15", finished: true });
  });

  it("is not finished while the end date is still ahead", () => {
    const s: Schedule = { startDate: "2026-01-15", nextDate: "2026-01-15", frequency: "monthly", endDate: "2026-06-30" };
    expect(duePeriods(s, "2026-02-20")).toEqual({ dates: ["2026-01-15", "2026-02-15"], next: "2026-03-15", finished: false });
  });

  it("does nothing when the end date is before the first period", () => {
    const s: Schedule = { startDate: "2026-05-01", nextDate: "2026-05-01", frequency: "yearly", endDate: "2026-04-30" };
    expect(duePeriods(s, "2027-01-01")).toEqual({ dates: [], next: "2026-05-01", finished: true });
  });

  it("handles quarterly and yearly schedules", () => {
    expect(duePeriods({ startDate: "2026-01-31", nextDate: "2026-01-31", frequency: "quarterly", endDate: null }, "2026-12-31").dates)
      .toEqual(["2026-01-31", "2026-04-30", "2026-07-31", "2026-10-31"]);
    expect(duePeriods({ startDate: "2024-02-29", nextDate: "2025-02-28", frequency: "yearly", endDate: null }, "2028-03-01").dates)
      .toEqual(["2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
  });
});

describe("scheduleFinished", () => {
  it("is finished only when the next date passes the end date", () => {
    expect(scheduleFinished({ nextDate: "2026-05-01", endDate: null })).toBe(false);
    expect(scheduleFinished({ nextDate: "2026-05-01", endDate: "2026-05-01" })).toBe(false);
    expect(scheduleFinished({ nextDate: "2026-05-02", endDate: "2026-05-01" })).toBe(true);
  });
});

describe("firstPeriodOnOrAfter", () => {
  it("skips the periods that passed while paused, keeping the anchor", () => {
    const s = { startDate: "2026-01-31", nextDate: "2026-02-28", frequency: "monthly" as const };
    expect(firstPeriodOnOrAfter(s, "2026-06-10")).toBe("2026-06-30");
    expect(firstPeriodOnOrAfter(s, "2026-05-31")).toBe("2026-05-31");
  });

  it("keeps a next date that is still ahead", () => {
    expect(firstPeriodOnOrAfter({ startDate: "2026-01-01", nextDate: "2026-12-01", frequency: "monthly" }, "2026-11-21")).toBe("2026-12-01");
  });

  it("works weekly", () => {
    expect(firstPeriodOnOrAfter({ startDate: "2026-11-02", nextDate: "2026-11-02", frequency: "weekly" }, "2026-11-21")).toBe("2026-11-23");
  });
});

describe("quote status rules", () => {
  it("lets any open quote change status by hand, but not to the same one", () => {
    expect(canSetQuoteStatus("draft", "sent")).toBe(true);
    expect(canSetQuoteStatus("sent", "accepted")).toBe(true);
    expect(canSetQuoteStatus("rejected", "draft")).toBe(true);
    expect(canSetQuoteStatus("accepted", "rejected")).toBe(true);
    expect(canSetQuoteStatus("sent", "sent")).toBe(false);
  });

  it("freezes converted quotes", () => {
    expect(canSetQuoteStatus("converted", "draft")).toBe(false);
    expect(canEditQuote("converted")).toBe(false);
    expect(canDeleteQuote("converted")).toBe(false);
    expect(canConvertQuote("converted")).toBe(false);
    expect(canEditQuote("sent")).toBe(true);
    expect(canDeleteQuote("rejected")).toBe(true);
  });

  it("converts drafts, sent and accepted quotes, not rejected ones", () => {
    expect(canConvertQuote("draft")).toBe(true);
    expect(canConvertQuote("sent")).toBe(true);
    expect(canConvertQuote("accepted")).toBe(true);
    expect(canConvertQuote("rejected")).toBe(false);
  });

  it("marks a quote expired only while still waiting for an answer", () => {
    expect(quoteExpired("2026-11-20", "sent", "2026-11-21")).toBe(true);
    expect(quoteExpired("2026-11-20", "draft", "2026-11-21")).toBe(true);
    expect(quoteExpired("2026-11-21", "sent", "2026-11-21")).toBe(false);
    expect(quoteExpired("2026-11-20", "accepted", "2026-11-21")).toBe(false);
    expect(quoteExpired(null, "sent", "2026-11-21")).toBe(false);
  });

  it("numbers quotes per user", () => {
    expect(quoteNumber(7)).toBe("COT-0007");
    expect(quoteNumber(12345)).toBe("COT-12345");
  });
});
