import { describe, expect, it } from "vitest";
import {
  MAX_RANGE_DAYS,
  MONEY_FORMAT,
  PERCENT_FORMAT,
  buildBankTotals,
  buildIncomeStatement,
  buildSalesTotals,
  buildWorkbookSheets,
  capRows,
  daysInMonth,
  describeRange,
  excelSerial,
  isValidIsoDate,
  localIsoDate,
  monthRange,
  parseIsoDate,
  periodTag,
  quarterRange,
  rangeDays,
  rangeForPreset,
  rangeProblem,
  safeSheetName,
  sumMoney,
  toXlsxCell,
  workbookFileName,
  yearRange,
  type AccountantPeriod,
  type SheetCell,
  type WorkbookLabels,
} from "./accountant";

describe("dates", () => {
  it("accepts only real calendar dates", () => {
    expect(parseIsoDate("2026-11-21")).toEqual({ year: 2026, month: 11, day: 21 });
    expect(isValidIsoDate("2028-02-29")).toBe(true); // leap year
    expect(isValidIsoDate("2026-02-29")).toBe(false);
    expect(isValidIsoDate("2026-04-31")).toBe(false);
    expect(isValidIsoDate("2026-13-01")).toBe(false);
    expect(isValidIsoDate("2026-1-01")).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
    expect(isValidIsoDate("2026-11-21' OR 1=1")).toBe(false);
  });

  it("knows month lengths", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 11)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it("reads the device's local day", () => {
    expect(localIsoDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("counts days with both ends included", () => {
    expect(rangeDays({ startDate: "2026-11-01", endDate: "2026-11-30" })).toBe(30);
    expect(rangeDays({ startDate: "2026-11-21", endDate: "2026-11-21" })).toBe(1);
    expect(rangeDays({ startDate: "2026-03-01", endDate: "2026-03-31" })).toBe(31); // across the DST change
    expect(rangeDays({ startDate: "2026-11-30", endDate: "2026-11-01" })).toBe(0);
    expect(rangeDays({ startDate: "bad", endDate: "2026-11-01" })).toBe(0);
  });

  it("explains what is wrong with a typed range", () => {
    expect(rangeProblem({ startDate: "2026-11-01", endDate: "2026-11-30" })).toBeNull();
    expect(rangeProblem({ startDate: "", endDate: "2026-11-30" })).toBe("invalid");
    expect(rangeProblem({ startDate: "2026-12-01", endDate: "2026-11-30" })).toBe("order");
    expect(rangeProblem({ startDate: "2024-01-01", endDate: "2025-12-31" })).toBeNull(); // 731 days
    expect(rangeDays({ startDate: "2024-01-01", endDate: "2025-12-31" })).toBe(MAX_RANGE_DAYS);
    expect(rangeProblem({ startDate: "2024-01-01", endDate: "2026-01-01" })).toBe("tooLong");
  });
});

describe("period buttons", () => {
  const today = "2026-11-21";

  it("este mes, mes pasado, trimestre y año are whole calendar periods", () => {
    expect(rangeForPreset("thisMonth", today)).toEqual({ startDate: "2026-11-01", endDate: "2026-11-30" });
    expect(rangeForPreset("lastMonth", today)).toEqual({ startDate: "2026-10-01", endDate: "2026-10-31" });
    expect(rangeForPreset("quarter", today)).toEqual({ startDate: "2026-10-01", endDate: "2026-12-31" });
    expect(rangeForPreset("year", today)).toEqual({ startDate: "2026-01-01", endDate: "2026-12-31" });
  });

  it("mes pasado in January is December of the year before", () => {
    expect(rangeForPreset("lastMonth", "2027-01-15")).toEqual({ startDate: "2026-12-01", endDate: "2026-12-31" });
  });

  it("mes pasado in March ends on the last day of February", () => {
    expect(rangeForPreset("lastMonth", "2026-03-31")).toEqual({ startDate: "2026-02-01", endDate: "2026-02-28" });
    expect(rangeForPreset("lastMonth", "2028-03-01")).toEqual({ startDate: "2028-02-01", endDate: "2028-02-29" });
  });

  it("picks the quarter that contains the day", () => {
    expect(rangeForPreset("quarter", "2026-01-01")).toEqual(quarterRange(2026, 1));
    expect(rangeForPreset("quarter", "2026-03-31")).toEqual({ startDate: "2026-01-01", endDate: "2026-03-31" });
    expect(rangeForPreset("quarter", "2026-04-01")).toEqual({ startDate: "2026-04-01", endDate: "2026-06-30" });
    expect(rangeForPreset("quarter", "2026-09-30")).toEqual({ startDate: "2026-07-01", endDate: "2026-09-30" });
  });

  it("rango returns the typed range only when it is valid", () => {
    const custom = { startDate: "2026-11-03", endDate: "2026-11-09" };
    expect(rangeForPreset("custom", today, custom)).toEqual(custom);
    expect(rangeForPreset("custom", today, { startDate: "2026-11-09", endDate: "2026-11-03" })).toBeNull();
    expect(rangeForPreset("custom", today)).toBeNull();
  });
});

describe("file names", () => {
  it("tags whole months, quarters and years", () => {
    expect(describeRange(monthRange(2026, 11))).toEqual({ kind: "month", year: 2026, month: 11 });
    expect(describeRange(quarterRange(2026, 4))).toEqual({ kind: "quarter", year: 2026, quarter: 4 });
    expect(describeRange(yearRange(2026))).toEqual({ kind: "year", year: 2026 });
    expect(describeRange({ startDate: "2026-11-01", endDate: "2026-11-15" })).toEqual({ kind: "custom" });
    expect(periodTag(monthRange(2026, 11))).toBe("2026-11");
    expect(periodTag(quarterRange(2026, 4), "T")).toBe("2026-T4");
    expect(periodTag(yearRange(2026))).toBe("2026");
    expect(periodTag({ startDate: "2026-11-01", endDate: "2026-11-15" })).toBe("2026-11-01_2026-11-15");
    expect(periodTag({ startDate: "2026-11-21", endDate: "2026-11-21" })).toBe("2026-11-21");
  });

  it("builds a safe .xlsx name", () => {
    expect(workbookFileName("Contabilidad", monthRange(2026, 11))).toBe("Contabilidad_2026-11.xlsx");
    expect(workbookFileName("Accounting", quarterRange(2026, 4))).toBe("Accounting_2026-Q4.xlsx");
    expect(workbookFileName("Mi negocio/../x", yearRange(2026))).toBe("Mi_negocio_x_2026.xlsx");
    expect(workbookFileName("", yearRange(2026))).toBe("Report_2026.xlsx");
  });
});

describe("money and totals", () => {
  it("adds in cents", () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(sumMoney(["10.10", "20.20", null, undefined, "junk"])).toBe(30.3);
  });

  it("builds the income statement like the Reports page: completed sales minus every expense", () => {
    const s = buildIncomeStatement({
      salesTotal: "1500.50",
      salesCount: 12,
      expensesByCategory: [
        { category: "Renta", total: "800.00", count: 1 },
        { category: "Suministros", total: "120.25", count: 3 },
        { category: " Renta ", total: "50.00", count: 1 }, // same category with spaces
        { category: "", total: "10.00", count: 1 },
      ],
    });
    expect(s.income).toBe(1500.5);
    expect(s.salesCount).toBe(12);
    expect(s.totalExpenses).toBe(980.25);
    expect(s.expensesCount).toBe(6);
    expect(s.profit).toBe(520.25);
    expect(s.margin).toBeCloseTo(520.25 / 1500.5, 10);
    expect(s.expenseLines.map((l) => [l.category, l.total, l.count])).toEqual([
      ["Renta", 850, 2],
      ["Suministros", 120.25, 3],
      ["", 10, 1],
    ]);
    expect(s.expenseLines.reduce((sum, l) => sum + l.share, 0)).toBeCloseTo(1, 10);
  });

  it("has no margin without income, and a loss stays negative", () => {
    const s = buildIncomeStatement({ salesTotal: 0, salesCount: 0, expensesByCategory: [{ category: "Renta", total: "100", count: 1 }] });
    expect(s.margin).toBeNull();
    expect(s.profit).toBe(-100);
    const empty = buildIncomeStatement({ salesTotal: null, salesCount: null, expensesByCategory: [] });
    expect(empty).toMatchObject({ income: 0, totalExpenses: 0, profit: 0, margin: null, expenseLines: [] });
  });

  it("counts only completed sales as income", () => {
    const t = buildSalesTotals([
      { status: "completed", total: "300.00", count: 3 },
      { status: "pending", total: "50.00", count: 1 },
      { status: "cancelled", total: "20.00", count: 1 },
      { status: "refunded", total: "10.00", count: 1 },
    ]);
    expect(t).toEqual({ count: 6, completedCount: 3, completedTotal: 300, otherCount: 3, otherTotal: 80 });
  });

  it("adds bank money in and out", () => {
    expect(buildBankTotals([
      { type: "income", total: "1000.10", count: 4 },
      { type: "expense", total: "250.05", count: 7 },
    ])).toEqual({ count: 11, moneyIn: 1000.1, moneyOut: 250.05, net: 750.05 });
    expect(buildBankTotals([])).toEqual({ count: 0, moneyIn: 0, moneyOut: 0, net: 0 });
  });

  it("caps row lists and says when there were more", () => {
    expect(capRows([1, 2, 3], 3)).toEqual({ rows: [1, 2, 3], truncated: false });
    expect(capRows([1, 2, 3, 4], 3)).toEqual({ rows: [1, 2, 3], truncated: true });
  });
});

describe("Excel cells", () => {
  it("turns calendar dates into Excel day numbers", () => {
    expect(excelSerial("1899-12-31")).toBeNaN(); // before the supported years
    expect(excelSerial("1900-03-01")).toBe(61);
    expect(excelSerial("2026-11-01")).toBe(46327);
    expect(excelSerial("2026-11-02") - excelSerial("2026-11-01")).toBe(1);
    expect(excelSerial("nope")).toBeNaN();
  });

  it("keeps numbers as numbers and dates as dates", () => {
    expect(toXlsxCell({ kind: "date", iso: "2026-11-01" }, "dd/mm/yyyy")).toEqual({ t: "n", v: 46327, z: "dd/mm/yyyy" });
    expect(toXlsxCell({ kind: "money", value: 12.5 }, "x")).toEqual({ t: "n", v: 12.5, z: MONEY_FORMAT });
    expect(toXlsxCell({ kind: "percent", value: 0.25 }, "x")).toEqual({ t: "n", v: 0.25, z: PERCENT_FORMAT });
    expect(toXlsxCell(3, "x")).toEqual({ t: "n", v: 3 });
    expect(toXlsxCell("Renta", "x")).toEqual({ t: "s", v: "Renta" });
    expect(toXlsxCell("", "x")).toBeNull();
    expect(toXlsxCell(null, "x")).toBeNull();
    expect(toXlsxCell({ kind: "date", iso: "bad" }, "x")).toEqual({ t: "s", v: "bad" });
  });

  it("cleans sheet names", () => {
    expect(safeSheetName("Ventas")).toBe("Ventas");
    expect(safeSheetName("A/B:C?[x]")).toBe("A B C x");
    expect(safeSheetName("x".repeat(40))).toHaveLength(31);
    expect(safeSheetName("***")).toBe("Sheet");
  });
});

describe("workbook", () => {
  const labels: WorkbookLabels = {
    sheets: { summary: "Resumen", sales: "Ventas", expenses: "Gastos", bank: "Banco" },
    summary: {
      title: "Reporte para el contador",
      company: "Empresa",
      period: "Periodo",
      from: "Desde",
      to: "Hasta",
      dataAsOf: "Datos al",
      statement: "Estado de resultados",
      concept: "Concepto",
      amount: "Monto",
      income: "Ingresos",
      salesCompleted: (n) => `Ventas completadas (${n})`,
      totalIncome: "Total ingresos",
      expenses: "Gastos por categoría",
      totalExpenses: "Total gastos",
      profit: "Ganancia neta",
      margin: "Margen",
      bank: "Banco (informativo)",
      bankIn: "Entradas",
      bankOut: "Salidas",
      bankNet: "Neto",
      bankNote: "El banco no cambia la ganancia.",
      onlyCompleted: "Solo ventas completadas.",
      truncated: (section, shown, total) => `${section}: ${shown} de ${total}`,
    },
    sales: { date: "Fecha", invoice: "Factura", client: "Cliente", items: "Concepto", method: "Método", status: "Estado", total: "Total", totalCompleted: "Total ventas completadas" },
    expenses: { date: "Fecha", description: "Descripción", category: "Categoría", method: "Método", amount: "Monto", total: "Total gastos" },
    bank: { date: "Fecha", description: "Descripción", category: "Categoría", account: "Cuenta", moneyIn: "Entrada", moneyOut: "Salida", total: "Totales" },
    uncategorized: "Sin categoría",
    methods: { cash: "Efectivo", zelle: "Zelle", card: "Tarjeta" },
    statuses: { completed: "Completada", cancelled: "Cancelada" },
    bankCategories: { deposit: "Depósito", business_expense: "Gastos de negocio" },
  };

  const data: AccountantPeriod = {
    period: { startDate: "2026-11-01", endDate: "2026-11-30" },
    rowCap: 2,
    incomeStatement: buildIncomeStatement({
      salesTotal: "100.00",
      salesCount: 1,
      expensesByCategory: [{ category: "Renta", total: "40.00", count: 1 }, { category: "", total: "5.00", count: 1 }],
    }),
    sales: {
      ...buildSalesTotals([{ status: "completed", total: "100.00", count: 1 }, { status: "cancelled", total: "30.00", count: 2 }]),
      truncated: true,
      rows: [
        { id: 1, date: "2026-11-02", invoice: "F-1", client: "Ana", items: "Placa", method: "cash", total: 100, status: "completed" },
        { id: 2, date: "2026-11-03", invoice: "F-2", client: null, items: null, method: "card", total: 30, status: "cancelled" },
      ],
    },
    expenses: {
      count: 2,
      total: 45,
      truncated: false,
      rows: [
        { id: 7, date: "2026-11-05", description: "Renta noviembre", category: "Renta", method: "zelle", amount: 40 },
        { id: 8, date: "2026-11-06", description: "Café", category: " ", method: "cash", amount: 5 },
      ],
    },
    bank: {
      ...buildBankTotals([{ type: "income", total: "500", count: 1 }, { type: "expense", total: "20", count: 1 }]),
      truncated: false,
      rows: [
        { id: 3, date: "2026-11-04", description: "DEPOSIT", category: "deposit", type: "income", amount: 500, account: "Chase" },
        { id: 4, date: "2026-11-04", description: "OFFICE DEPOT", category: "business_expense", type: "expense", amount: 20, account: null },
      ],
    },
  };

  const sheets = buildWorkbookSheets(data, labels, { company: "Taller Ana", periodLabel: "1 nov 2026 – 30 nov 2026", dataAsOf: "21 nov 2026" });
  const byName = Object.fromEntries(sheets.map((s) => [s.name, s]));
  const find = (rows: SheetCell[][], first: string) => rows.find((r) => r[0] === first);

  it("has a summary sheet plus one sheet per section, in the person's language", () => {
    expect(sheets.map((s) => s.name)).toEqual(["Resumen", "Ventas", "Gastos", "Banco"]);
  });

  it("summary: company, real dates and the income statement as numbers", () => {
    const rows = byName.Resumen.rows;
    expect(find(rows, "Empresa")).toEqual(["Empresa", "Taller Ana"]);
    expect(find(rows, "Desde")).toEqual(["Desde", { kind: "date", iso: "2026-11-01" }]);
    expect(find(rows, "Hasta")).toEqual(["Hasta", { kind: "date", iso: "2026-11-30" }]);
    expect(find(rows, "Ventas completadas (1)")).toEqual(["Ventas completadas (1)", { kind: "money", value: 100 }]);
    expect(find(rows, "Renta")).toEqual(["Renta", { kind: "money", value: 40 }]);
    expect(find(rows, "Sin categoría")).toEqual(["Sin categoría", { kind: "money", value: 5 }]);
    expect(find(rows, "Total gastos")).toEqual(["Total gastos", { kind: "money", value: 45 }]);
    expect(find(rows, "Ganancia neta")).toEqual(["Ganancia neta", { kind: "money", value: 55 }]);
    expect(find(rows, "Margen")).toEqual(["Margen", { kind: "percent", value: 0.55 }]);
    expect(find(rows, "Neto")).toEqual(["Neto", { kind: "money", value: 480 }]);
    expect(find(rows, "Ventas: 2 de 3")).toBeDefined(); // truncation is said out loud
    expect(find(rows, "Gastos: 2 de 2")).toBeUndefined();
  });

  it("leaves the company row out when there is no name", () => {
    const [summary] = buildWorkbookSheets(data, labels, { company: null, periodLabel: "x", dataAsOf: "y" });
    expect(find(summary.rows, "Empresa")).toBeUndefined();
  });

  it("sales: every status listed with its label, total of completed only", () => {
    const rows = byName.Ventas.rows;
    expect(rows[0]).toEqual(["Fecha", "Factura", "Cliente", "Concepto", "Método", "Estado", "Total"]);
    expect(rows[1]).toEqual([{ kind: "date", iso: "2026-11-02" }, "F-1", "Ana", "Placa", "Efectivo", "Completada", { kind: "money", value: 100 }]);
    expect(rows[2]).toEqual([{ kind: "date", iso: "2026-11-03" }, "F-2", "", "", "Tarjeta", "Cancelada", { kind: "money", value: 30 }]);
    expect(rows.at(-1)).toEqual(["Total ventas completadas", null, null, null, null, null, { kind: "money", value: 100 }]);
    expect(byName.Ventas.filter).toEqual({ headerRow: 0, lastRow: 2, columns: 7 });
  });

  it("expenses: blank categories get a label", () => {
    const rows = byName.Gastos.rows;
    expect(rows[2]).toEqual([{ kind: "date", iso: "2026-11-06" }, "Café", "Sin categoría", "Efectivo", { kind: "money", value: 5 }]);
    expect(rows.at(-1)).toEqual(["Total gastos", null, null, null, { kind: "money", value: 45 }]);
  });

  it("bank: money in and money out in their own columns", () => {
    const rows = byName.Banco.rows;
    expect(rows[1]).toEqual([{ kind: "date", iso: "2026-11-04" }, "DEPOSIT", "Depósito", "Chase", { kind: "money", value: 500 }, null]);
    expect(rows[2]).toEqual([{ kind: "date", iso: "2026-11-04" }, "OFFICE DEPOT", "Gastos de negocio", "", null, { kind: "money", value: 20 }]);
    expect(rows.at(-1)).toEqual(["Totales", null, null, null, { kind: "money", value: 500 }, { kind: "money", value: 20 }]);
  });

  it("gives every sheet a width for each column it uses", () => {
    for (const s of sheets) {
      const columns = Math.max(...s.rows.map((r) => r.length));
      expect(s.widths.length).toBeGreaterThanOrEqual(columns);
    }
  });
});
