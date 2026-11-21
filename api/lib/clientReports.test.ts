import { describe, expect, it } from "vitest";
import {
  averageOf,
  buildClientReport,
  buildServiceReport,
  nextSort,
  rangeForPeriod,
  shareOf,
  sortRows,
  toIsoTimestamp,
  toNumber,
  topBy,
} from "./clientReports";

describe("toNumber / shareOf / averageOf", () => {
  it("reads MySQL DECIMAL strings and treats junk as 0", () => {
    expect(toNumber("123.45")).toBe(123.45);
    expect(toNumber(7)).toBe(7);
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined)).toBe(0);
    expect(toNumber("abc")).toBe(0);
  });

  it("returns 0 instead of dividing by zero", () => {
    expect(shareOf(5, 0)).toBe(0);
    expect(shareOf(5, -10)).toBe(0);
    expect(averageOf(100, 0)).toBe(0);
  });

  it("rounds averages to cents", () => {
    expect(averageOf(100, 3)).toBe(33.33);
    expect(shareOf(25, 100)).toBe(0.25);
  });
});

describe("toIsoTimestamp", () => {
  it("keeps Dates and reads bare MySQL timestamps as UTC", () => {
    expect(toIsoTimestamp(new Date("2026-11-20T15:00:00Z"))).toBe("2026-11-20T15:00:00.000Z");
    expect(toIsoTimestamp("2026-11-20 15:00:00")).toBe("2026-11-20T15:00:00.000Z");
  });
  it("returns null for empty or invalid values", () => {
    expect(toIsoTimestamp(null)).toBeNull();
    expect(toIsoTimestamp("")).toBeNull();
    expect(toIsoTimestamp("not a date")).toBeNull();
  });
});

describe("buildClientReport", () => {
  const rows = [
    { customerId: 1, name: "Ana López", salesCount: 2, total: "300.00", lastSaleAt: new Date("2026-11-10T12:00:00Z") },
    { customerId: null, name: null, snapshotName: null, salesCount: "1", total: "100.00", lastSaleAt: "2026-11-12 09:00:00" },
    { customerId: 2, name: null, snapshotName: "Beto Ruiz", salesCount: 4, total: "600.00", lastSaleAt: new Date("2026-11-15T18:30:00Z") },
  ];

  it("computes totals, averages and shares of the period total", () => {
    const r = buildClientReport(rows);
    expect(r.totals).toEqual({ customers: 2, salesCount: 7, total: 1000, averageTicket: 142.86, noCustomerTotal: 100 });
    const beto = r.rows.find((x) => x.customerId === 2)!;
    expect(beto).toMatchObject({ name: "Beto Ruiz", salesCount: 4, total: 600, averageTicket: 150, share: 0.6, lastSaleAt: "2026-11-15T18:30:00.000Z" });
    const none = r.rows.find((x) => x.customerId === null)!;
    expect(none).toMatchObject({ key: "none", name: null, total: 100, share: 0.1, averageTicket: 100 });
  });

  it("orders by total, highest first, and the shares add up to 100 %", () => {
    const r = buildClientReport(rows);
    expect(r.rows.map((x) => x.key)).toEqual(["c:2", "c:1", "none"]);
    expect(r.rows.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 10);
  });

  it("merges duplicate groups (one row per customer, a single 'sin cliente')", () => {
    const r = buildClientReport([
      { customerId: null, name: null, salesCount: 1, total: "10.10", lastSaleAt: "2026-11-01 10:00:00" },
      { customerId: null, name: null, salesCount: 2, total: "20.20", lastSaleAt: "2026-11-03 10:00:00" },
      { customerId: 5, name: "Eva", salesCount: 1, total: "5", lastSaleAt: null },
      { customerId: 5, name: "Eva", salesCount: 1, total: "5", lastSaleAt: "2026-11-02 10:00:00" },
    ]);
    expect(r.rows).toHaveLength(2);
    const none = r.rows.find((x) => x.key === "none")!;
    expect(none.total).toBe(30.3);
    expect(none.salesCount).toBe(3);
    expect(none.lastSaleAt).toBe("2026-11-03T10:00:00.000Z");
    expect(r.rows.find((x) => x.key === "c:5")).toMatchObject({ salesCount: 2, total: 10, lastSaleAt: "2026-11-02T10:00:00.000Z" });
  });

  it("adds money in cents, so 0.1 + 0.2 is 0.3", () => {
    const r = buildClientReport([
      { customerId: 1, name: "A", salesCount: 1, total: "0.10", lastSaleAt: null },
      { customerId: 1, name: "A", salesCount: 1, total: "0.20", lastSaleAt: null },
    ]);
    expect(r.totals.total).toBe(0.3);
  });

  it("is empty with no sales", () => {
    expect(buildClientReport([])).toEqual({
      rows: [],
      totals: { customers: 0, salesCount: 0, total: 0, averageTicket: 0, noCustomerTotal: 0 },
    });
  });
});

describe("buildServiceReport", () => {
  const rows = [
    { serviceId: 10, name: "Placas", quantity: "3", revenue: "150.00", salesCount: 3 },
    { serviceId: 11, name: null, snapshotName: "Título", quantity: 1, revenue: "250.00", salesCount: "1" },
    { serviceId: 12, name: "Cargo personalizado", quantity: 4, revenue: "100.00", salesCount: 2 },
  ];

  it("computes quantity, revenue, share and average price per service", () => {
    const r = buildServiceReport(rows, 5);
    expect(r.rows.map((x) => x.key)).toEqual(["s:11", "s:10", "s:12"]);
    expect(r.rows[0]).toMatchObject({ name: "Título", quantity: 1, revenue: 250, salesCount: 1, share: 0.5, averagePrice: 250 });
    expect(r.rows[1]).toMatchObject({ name: "Placas", quantity: 3, revenue: 150, share: 0.3, averagePrice: 50 });
    expect(r.rows[2]).toMatchObject({ quantity: 4, revenue: 100, averagePrice: 25 });
  });

  it("uses the distinct sale count for the total, not the sum of the rows", () => {
    const r = buildServiceReport(rows, "5");
    expect(r.totals).toEqual({ services: 3, quantity: 8, revenue: 500, salesCount: 5, averagePrice: 62.5 });
  });

  it("is empty with no sales", () => {
    expect(buildServiceReport([], null).totals).toEqual({ services: 0, quantity: 0, revenue: 0, salesCount: 0, averagePrice: 0 });
  });
});

describe("sortRows", () => {
  type R = { name: string | null; total: number; last: string | null };
  const rows: R[] = [
    { name: "beto", total: 20, last: "2026-11-02T00:00:00.000Z" },
    { name: null, total: 50, last: null },
    { name: "Ana", total: 20, last: "2026-11-05T00:00:00.000Z" },
    { name: "Álvaro", total: 10, last: "2026-11-01T00:00:00.000Z" },
  ];

  it("sorts numbers both ways and keeps ties in their original order", () => {
    expect(sortRows(rows, "total", "desc").map((r) => r.total)).toEqual([50, 20, 20, 10]);
    expect(sortRows(rows, "total", "desc").map((r) => r.name)).toEqual([null, "beto", "Ana", "Álvaro"]);
    expect(sortRows(rows, "total", "asc").map((r) => r.total)).toEqual([10, 20, 20, 50]);
  });

  it("sorts names ignoring case and accents, empty names last in both directions", () => {
    expect(sortRows(rows, "name", "asc").map((r) => r.name)).toEqual(["Álvaro", "Ana", "beto", null]);
    expect(sortRows(rows, "name", "desc").map((r) => r.name)).toEqual(["beto", "Ana", "Álvaro", null]);
  });

  it("sorts ISO dates and puts missing dates last", () => {
    expect(sortRows(rows, "last", "desc").map((r) => r.name)).toEqual(["Ana", "beto", "Álvaro", null]);
  });

  it("does not change the input", () => {
    const copy = [...rows];
    sortRows(rows, "total", "asc");
    expect(rows).toEqual(copy);
  });
});

describe("nextSort", () => {
  it("flips the direction when the same column is clicked again", () => {
    expect(nextSort({ key: "total", dir: "desc" }, "total")).toEqual({ key: "total", dir: "asc" });
    expect(nextSort({ key: "total", dir: "asc" }, "total")).toEqual({ key: "total", dir: "desc" });
  });
  it("starts text columns A→Z and number columns highest first", () => {
    expect(nextSort({ key: "total", dir: "desc" }, "name", ["name"])).toEqual({ key: "name", dir: "asc" });
    expect(nextSort({ key: "name", dir: "asc" }, "share", ["name"])).toEqual({ key: "share", dir: "desc" });
  });
});

describe("topBy", () => {
  const rows = [
    { id: 1, total: 10 }, { id: 2, total: 60 }, { id: 3, total: 0 }, { id: 4, total: 30 },
    { id: 5, total: 40 }, { id: 6, total: 20 }, { id: 7, total: 50 },
  ];

  it("returns the highest n, skipping zeros", () => {
    expect(topBy(rows, "total", 5).map((r) => r.id)).toEqual([2, 7, 5, 4, 6]);
    expect(topBy(rows, "total", 10)).toHaveLength(6);
  });

  it("can leave rows out (e.g. 'sin cliente')", () => {
    expect(topBy(rows, "total", 2, (r) => r.id !== 2).map((r) => r.id)).toEqual([7, 5]);
  });
});

describe("rangeForPeriod", () => {
  const local = { todayDate: "2026-11-21", weekStartDate: "2026-11-15" };

  it("uses the client's own dates for today and the week", () => {
    expect(rangeForPeriod("today", local, 2026, 11)).toEqual({ startDate: "2026-11-21", endDate: "2026-11-21" });
    expect(rangeForPeriod("week", local, 2026, 11)).toEqual({ startDate: "2026-11-15", endDate: "2026-11-21" });
  });

  it("covers the whole picked month, leap years included", () => {
    expect(rangeForPeriod("month", local, 2026, 11)).toEqual({ startDate: "2026-11-01", endDate: "2026-11-30" });
    expect(rangeForPeriod("month", local, 2028, 2)).toEqual({ startDate: "2028-02-01", endDate: "2028-02-29" });
    expect(rangeForPeriod("month", local, 2026, 12)).toEqual({ startDate: "2026-12-01", endDate: "2026-12-31" });
  });

  it("covers the whole picked year", () => {
    expect(rangeForPeriod("year", local, 2025, 3)).toEqual({ startDate: "2025-01-01", endDate: "2025-12-31" });
  });
});
